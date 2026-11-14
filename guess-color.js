/* ===================================================
   GUESS THE COLOR — duel 1v1 tebak urutan warna
   Tanpa server: Firestore dipakai untuk room, undangan,
   dan presence. Kode rahasia tetap di browser pemiliknya;
   lawan cuma menerima petunjuk, bukan kodenya.
=================================================== */
(function () {
  "use strict";

  const COLORS = [
    { id: "hijau", nama: "Hijau", hex: "#2f8f5b" },
    { id: "kuning", nama: "Kuning", hex: "#e2ae32" },
    { id: "merah", nama: "Merah", hex: "#dd5a45" },
    { id: "biru", nama: "Biru", hex: "#3f7fc4" },
  ];
  const COLOR_BY_ID = Object.fromEntries(COLORS.map((c) => [c.id, c]));
  const LEN = 4;
  const MAX_ATTEMPTS = 5;
  const DURATION = 5 * 60 * 1000;
  const INVITE_TTL = 2 * 60 * 1000;
  const ONLINE_TTL = 90 * 1000;
  const ROOM_TTL = 6 * 60 * 60 * 1000;
  const ROOMS = "gcRooms";
  const INVITES = "gcInvites";
  const PLAYERS = "gcPlayers";

  const state = {
    user: null,
    viewOpen: false,
    roomId: null,
    role: null,
    room: null,
    practiceMode: false,
    moves: [],
    movesMap: {},
    secret: [],
    secretDraft: ["", "", "", ""],
    picker: ["", "", "", ""],
    busy: false,
    starting: false,
    resolving: false,
    resetting: false,
    revealing: false,
    evaluating: new Set(),
    inviteUnsub: null,
    roomUnsub: null,
    movesUnsub: null,
    playersUnsub: null,
    inviteTimer: null,
    tickTimer: null,
    presenceTimer: null,
    roomSeenTimer: null,
    players: {},
    invite: null,
    inviteSound: "",
    dbError: "",
    resultSound: "",
    lastCleanup: 0,
    timeResolving: false,
  };

  const $ = (id) => document.getElementById(id);

  function getCurrentUser() {
    try {
      return typeof currentUser !== "undefined" ? currentUser : null;
    } catch (err) {
      return null;
    }
  }

  function myAbsen() {
    return state.user ? String(state.user.absen) : "";
  }

  function myName() {
    if (!state.user) return "Siswa";
    return state.user.namaPanggilan || state.user.namaLengkap || "Siswa";
  }

  function namaSiswa(absen) {
    const key = String(absen);
    try {
      if (typeof accountsData !== "undefined" && accountsData[key] && accountsData[key].namaPanggilan) {
        return accountsData[key].namaPanggilan;
      }
    } catch (err) {}
    try {
      const siswa = (typeof dataSiswa !== "undefined" ? dataSiswa : []).find((s) => String(s.absen) === key);
      if (siswa && siswa.namaPanggilan) return siswa.namaPanggilan;
    } catch (err) {}
    return "Siswa " + key;
  }

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initial(text) {
    const s = String(text || "?").trim();
    return s ? s.charAt(0).toUpperCase() : "?";
  }

  function sfx(name) {
    try {
      if (typeof SoundFX !== "undefined" && SoundFX && typeof SoundFX[name] === "function") SoundFX[name]();
    } catch (err) {}
  }

  function randomPermutation() {
    const arr = COLORS.map((c) => c.id);
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function validSecret(list) {
    return Array.isArray(list)
      && list.length === LEN
      && new Set(list).size === LEN
      && list.every((id) => !!COLOR_BY_ID[id]);
  }

  function hitungPetunjuk(guess, secret) {
    let exact = 0;
    let partial = 0;
    const sisaGuess = [];
    const sisaSecret = [];
    for (let i = 0; i < LEN; i += 1) {
      if (guess[i] === secret[i]) {
        exact += 1;
      } else {
        sisaGuess.push(guess[i]);
        sisaSecret.push(secret[i]);
      }
    }
    sisaGuess.forEach((warna) => {
      const idx = sisaSecret.indexOf(warna);
      if (idx >= 0) {
        partial += 1;
        sisaSecret.splice(idx, 1);
      }
    });
    return { exact, partial };
  }

  function roleLawan() {
    return state.role === "host" ? "guest" : "host";
  }

  function isPractice() {
    return !!state.practiceMode;
  }

  function roomRef(id) {
    return db.collection(ROOMS).doc(id || state.roomId);
  }

  function movesRef(id) {
    return roomRef(id).collection("moves");
  }

  function ownMoves() {
    if (isPractice()) return state.moves.slice().sort((a, b) => (a.n || 0) - (b.n || 0));
    return state.moves
      .filter((m) => m.by === state.role)
      .sort((a, b) => (a.n || 0) - (b.n || 0));
  }

  function opponentMoves() {
    if (isPractice()) return [];
    return state.moves
      .filter((m) => m.by === roleLawan())
      .sort((a, b) => (a.n || 0) - (b.n || 0));
  }

  function pendingOwnMove() {
    return ownMoves().find((m) => typeof m.exact !== "number");
  }

  function warnaChip(id, extraClass) {
    const c = COLOR_BY_ID[id];
    if (!c) return "";
    return `<span class="gtc-chip ${extraClass || ""}" style="--c:${c.hex}"><span class="gtc-chip-dot"></span>${c.nama}</span>`;
  }

  function namaRole(role) {
    if (!state.room) return role === "host" ? "Host" : "Lawan";
    return state.room[role + "Nama"] || (role === "host" ? "Host" : "Lawan");
  }

  function lawanNama() {
    if (isPractice()) return "Komputer";
    return namaRole(roleLawan());
  }

  function onlineSiswa(absen) {
    const p = state.players[String(absen)];
    return !!p && p.online !== false && Date.now() - (Number(p.lastSeen) || 0) < ONLINE_TTL;
  }

  function lawanOnline() {
    if (isPractice()) return true;
    if (!state.room) return false;
    const absen = state.room[roleLawan() + "Absen"];
    if (!absen) return false;
    if (onlineSiswa(absen)) return true;
    const seen = Number(state.room[roleLawan() + "Seen"]) || 0;
    return Date.now() - seen < 70000;
  }

  function fmtWaktu(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const menit = Math.floor(total / 60);
    const detik = total % 60;
    return menit + ":" + String(detik).padStart(2, "0");
  }

  function roomCodeNow() {
    if (!state.room) return state.roomId || "";
    return state.room.code || state.roomId || "";
  }

  function secretStorageKey() {
    return "kelas73-gtc-secret-" + myAbsen() + "-" + (state.roomId || "");
  }

  function simpanSecret(secret) {
    try {
      if (!state.roomId) return;
      localStorage.setItem(secretStorageKey(), JSON.stringify(secret));
    } catch (err) {}
  }

  function muatSecret() {
    try {
      if (!state.roomId) return [];
      const raw = JSON.parse(localStorage.getItem(secretStorageKey()) || "null");
      return validSecret(raw) ? raw : [];
    } catch (err) {
      return [];
    }
  }

  function hapusSecret() {
    try {
      if (state.roomId) localStorage.removeItem(secretStorageKey());
    } catch (err) {}
  }

  function roomRefStorageKey() {
    return "kelas73-gtc-room-" + myAbsen();
  }

  function bacaRoomRef() {
    try {
      const raw = JSON.parse(localStorage.getItem(roomRefStorageKey()) || "null");
      if (!raw || !raw.roomId || (raw.role !== "host" && raw.role !== "guest")) return null;
      return raw;
    } catch (err) {
      return null;
    }
  }

  function simpanRoomRef(roomId, role) {
    try {
      localStorage.setItem(roomRefStorageKey(), JSON.stringify({ roomId, role }));
    } catch (err) {}
  }

  function hapusRoomRef() {
    try {
      localStorage.removeItem(roomRefStorageKey());
    } catch (err) {}
  }

  function setDbError(err) {
    const denied = err && (err.code === "permission-denied" || /permission/i.test(err.message || ""));
    state.dbError = denied
      ? "Database multiplayer belum aktif. Publish firestore.rules terbaru sekali saja, lalu muat ulang halaman."
      : "Koneksi ke database bermasalah. Coba lagi sebentar.";
    if (state.viewOpen) gtcRender();
  }

  function toast(message, tone) {
    let root = $("gtc-toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "gtc-toast-root";
      root.className = "gtc-toast-root";
      root.setAttribute("aria-live", "polite");
      document.body.appendChild(root);
    }
    const item = document.createElement("div");
    item.className = "gtc-toast" + (tone ? " is-" + tone : "");
    item.textContent = message;
    root.appendChild(item);
    setTimeout(() => {
      item.classList.add("is-out");
      setTimeout(() => item.remove(), 260);
    }, 3200);
  }

  /* ============================ presence ============================ */

  function kirimPresence(status) {
    if (!state.user) return;
    const ref = db.collection(PLAYERS).doc(myAbsen());
    ref.set({
      nama: myName(),
      online: true,
      lastSeen: Date.now(),
      status: status || "idle",
    }, { merge: true }).catch((err) => {
      if (err && err.code === "permission-denied" && !state.dbError) setDbError(err);
    });
  }

  function mulaiPresence() {
    if (state.presenceTimer) return;
    kirimPresence("idle");
    state.presenceTimer = setInterval(() => {
      if (!state.user) return;
      if (document.visibilityState === "hidden") return;
      kirimPresence(state.room && state.room.status === "playing" ? "playing" : "idle");
    }, 30000);
  }

  function mulaiPlayers() {
    if (state.playersUnsub || !state.user) return;
    state.playersUnsub = db.collection(PLAYERS).onSnapshot((snap) => {
      const map = {};
      snap.forEach((doc) => { map[doc.id] = doc.data(); });
      state.players = map;
      renderPlayers();
    }, (err) => {
      if (!state.dbError) setDbError(err);
    });
  }

  /* ============================ undangan ============================ */

  function mulaiInvites() {
    if (state.inviteUnsub || !state.user) return;
    state.inviteUnsub = db.collection(INVITES)
      .where("toAbsen", "==", myAbsen())
      .onSnapshot((snap) => {
        const now = Date.now();
        const list = [];
        snap.forEach((doc) => {
          const data = doc.data();
          if (data.status !== "pending") return;
          if (now - (Number(data.createdAt) || 0) > INVITE_TTL) return;
          list.push({ id: doc.id, ...data });
        });
        list.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        state.invite = list[0] || null;
        renderInviteBanner();
      }, (err) => {
        if (!state.dbError) setDbError(err);
      });

    if (!state.inviteTimer) {
      state.inviteTimer = setInterval(() => {
        if (state.invite && Date.now() - (Number(state.invite.createdAt) || 0) > INVITE_TTL) {
          state.invite = null;
        }
        renderInviteBanner();
        cleanupLama();
      }, 30000);
    }
  }

  function renderInviteBanner() {
    let root = $("gtc-invite-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "gtc-invite-root";
      document.body.appendChild(root);
    }
    const inv = state.invite;
    if (!inv || !state.user) {
      root.innerHTML = "";
      return;
    }
    if (state.inviteSound !== inv.id) {
      state.inviteSound = inv.id;
      sfx("resultReveal");
    }
    const sisa = Math.max(0, Math.ceil((Number(inv.createdAt) + INVITE_TTL - Date.now()) / 1000));
    root.innerHTML = `
      <div class="gtc-invite-banner" role="alert">
        <span class="gtc-invite-icon" aria-hidden="true">🎨</span>
        <div class="gtc-invite-copy">
          <strong>${esc(inv.fromNama || "Temanmu")} mengajak duel Guess the Color</strong>
          <small>Room ${esc(inv.roomId || "-")} · sisa ${sisa} detik</small>
        </div>
        <div class="gtc-invite-actions">
          <button type="button" class="gtc-btn gtc-btn-primary gtc-btn-sm" data-gtc-invite-accept>Terima</button>
          <button type="button" class="gtc-btn gtc-btn-ghost gtc-btn-sm" data-gtc-invite-decline>Tolak</button>
        </div>
      </div>`;
  }

  function markInvite(id, status) {
    if (!id) return Promise.resolve();
    return db.collection(INVITES).doc(id)
      .update({ status, respondedAt: Date.now() })
      .catch(() => {});
  }

  async function terimaUndangan() {
    const inv = state.invite;
    if (!inv) return;
    if (state.roomId && state.roomId !== inv.roomId) {
      toast("Kamu masih di room lain. Selesaikan atau keluar dulu.", "warn");
      return;
    }
    try {
      await gabungRoom(inv.roomId, inv);
      await markInvite(inv.id, "accepted");
      state.invite = null;
      renderInviteBanner();
      openGamesTab();
      buka();
      sfx("teamsReady");
    } catch (err) {
      toast(err && err.message ? err.message : "Gagal menerima undangan.", "error");
      await markInvite(inv.id, "expired");
      state.invite = null;
      renderInviteBanner();
    }
  }

  async function tolakUndangan() {
    if (!state.invite) return;
    const id = state.invite.id;
    state.invite = null;
    renderInviteBanner();
    await markInvite(id, "declined");
    toast("Undangan ditolak.");
  }

  function openGamesTab() {
    const tab = document.querySelector('.page-tab-btn[data-page-tab="games"]');
    if (tab && !tab.classList.contains("active")) tab.click();
  }

  /* ============================ room ============================ */

  function generateKode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const acak = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return (async () => {
      for (let i = 0; i < 8; i += 1) {
        const code = acak();
        const snap = await db.collection(ROOMS).doc(code).get();
        if (!snap.exists) return code;
      }
      throw new Error("Gagal membuat kode room. Coba lagi.");
    })();
  }

  async function buatRoom(targetAbsen) {
    if (!state.user || state.busy) return;
    if (state.roomId || state.room) {
      toast("Kamu masih di room. Keluar dulu sebelum bikin room baru.", "warn");
      return;
    }
    state.busy = true;
    toast("Membuat room...");
    try {
      const code = await generateKode();
      const now = Date.now();
      await db.collection(ROOMS).doc(code).set({
        code,
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
        hostAbsen: myAbsen(),
        hostNama: myName(),
        guestAbsen: null,
        guestNama: null,
        status: "lobby",
        hostReady: false,
        guestReady: false,
        hostSeen: now,
        guestSeen: 0,
        startAt: null,
        endAt: null,
        winner: null,
        alasan: null,
        finishedAt: null,
        hostSecret: null,
        guestSecret: null,
        hostRematch: false,
        guestRematch: false,
      });
      state.practiceMode = false;
      simpanRoomRef(code, "host");
      attachRoom(code, "host");
      if (targetAbsen) {
        try {
          await kirimUndangan(code, targetAbsen);
        } catch (err) {
          toast("Room dibuat, tapi undangan gagal terkirim. Salin kodenya ke temanmu.", "warn");
        }
      }
      sfx("teamsReady");
    } catch (err) {
      if (err && err.code === "permission-denied") setDbError(err);
      toast(err && err.message ? err.message : "Gagal membuat room.", "error");
    } finally {
      state.busy = false;
    }
  }

  async function kirimUndangan(code, targetAbsen) {
    const target = String(targetAbsen);
    if (!state.user || target === myAbsen()) return;
    const inviteId = myAbsen() + "_" + target;
    await db.collection(INVITES).doc(inviteId).set({
      fromAbsen: myAbsen(),
      fromNama: myName(),
      toAbsen: target,
      toNama: namaSiswa(target),
      roomId: code,
      createdAt: Date.now(),
      status: "pending",
    });
    toast("Undangan dikirim ke " + namaSiswa(target) + ". Minta dia buka web sekarang.", "ok");
  }

  async function gabungRoom(codeRaw, invite) {
    const code = String(codeRaw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    if (code.length < 5) throw new Error("Kode room harus 5 karakter.");
    if (!state.user) throw new Error("Login dulu buat gabung room.");
    let role = "guest";
    const ref = db.collection(ROOMS).doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Room tidak ditemukan. Cek lagi kodenya.");
      const room = snap.data();
      if (String(room.hostAbsen) === myAbsen()) {
        role = "host";
        return;
      }
      if (room.status !== "lobby" && room.status !== "setup") {
        throw new Error("Room ini sudah mulai atau sudah selesai.");
      }
      if (room.guestAbsen && String(room.guestAbsen) !== myAbsen()) {
        throw new Error("Room sudah penuh.");
      }
      tx.update(ref, {
        guestAbsen: myAbsen(),
        guestNama: myName(),
        guestReady: false,
        status: "setup",
        guestSeen: Date.now(),
        lastActivity: Date.now(),
        updatedAt: Date.now(),
      });
      role = "guest";
    });

    state.practiceMode = false;
    simpanRoomRef(code, role);
    if (invite) await markInvite(invite.id, "accepted");
    attachRoom(code, role);
    openGamesTab();
    buka();
    sfx("teamsReady");
  }

  function attachRoom(roomId, role) {
    detachRoom();
    state.roomId = roomId;
    state.role = role;
    state.room = null;
    state.moves = [];
    state.movesMap = {};
    state.secret = muatSecret();
    state.secretDraft = validSecret(state.secret) ? state.secret.slice() : ["", "", "", ""];
    state.picker = ["", "", "", ""];
    state.resultSound = "";
    state.timeResolving = false;

    state.roomUnsub = db.collection(ROOMS).doc(roomId).onSnapshot(onRoomSnap, (err) => fatalRoom(err));
    state.movesUnsub = db.collection(ROOMS).doc(roomId).collection("moves").onSnapshot(onMovesSnap, (err) => fatalRoom(err));
    mulaiRoomSeen();
    mulaiTicker();
    gtcRender();
  }

  function detachRoom() {
    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.movesUnsub) { state.movesUnsub(); state.movesUnsub = null; }
    if (state.roomSeenTimer) { clearInterval(state.roomSeenTimer); state.roomSeenTimer = null; }
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
    state.roomId = null;
    state.role = null;
    state.room = null;
    state.moves = [];
    state.movesMap = {};
  }

  function fatalRoom(err) {
    if (err && err.code === "permission-denied") {
      setDbError(err);
    } else {
      toast("Koneksi room terputus. Coba muat ulang.", "error");
    }
    hapusRoomRef();
    detachRoom();
    gtcRender();
  }

  function onRoomSnap(snap) {
    if (!snap.exists) {
      toast("Room sudah tidak ada.", "warn");
      hapusRoomRef();
      hapusSecret();
      detachRoom();
      gtcRender();
      return;
    }
    const room = snap.data();
    const cocok = state.role === "host"
      ? String(room.hostAbsen) === myAbsen()
      : String(room.guestAbsen) === myAbsen();
    if (!cocok) {
      toast("Kamu bukan bagian dari room ini.", "warn");
      hapusRoomRef();
      detachRoom();
      gtcRender();
      return;
    }

    const prev = state.room;
    state.room = room;

    if (room.status === "playing") {
      if (!validSecret(state.secret)) state.secret = muatSecret();
      if (!prev || prev.status !== "playing") {
        state.picker = ["", "", "", ""];
        state.resultSound = "";
        sfx("teamsReady");
        kirimPresence("playing");
      }
    } else {
      state.resultSound = "";
    }

    if (room.status === "setup" && prev && prev.status === "finished") {
      state.secret = [];
      state.secretDraft = ["", "", "", ""];
      state.picker = ["", "", "", ""];
      state.resultSound = "";
      state.timeResolving = false;
      hapusSecret();
    }

    if (room.status === "finished") {
      if (!state.resultSound) {
        const menang = room.winner === state.role;
        const seri = room.winner === "draw";
        state.resultSound = seri ? "draw" : menang ? "win" : "lose";
        if (seri) sfx("resultReveal");
        else if (menang) sfx("timerFinish");
        else sfx("errorSound");
      }
      const key = state.role + "Secret";
      if (!room[key] && validSecret(state.secret) && !state.revealing && !isPractice()) {
        state.revealing = true;
        const secret = state.secret.slice();
        roomRef().update({ [key]: secret })
          .catch(() => {})
          .finally(() => { state.revealing = false; });
      }
      if (room.hostRematch && room.guestRematch) resetRoom();
    }

    if (room.status === "setup" && room.hostReady && room.guestReady) startGame();

    if (prev && prev.status !== room.status) {
      kirimPresence(room.status === "playing" ? "playing" : "idle");
    }
    gtcRender();
  }

  function onMovesSnap(snap) {
    const docs = [];
    snap.forEach((doc) => { docs.push({ id: doc.id, ...doc.data() }); });
    docs.sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));
    const prev = state.movesMap;
    state.moves = docs;
    state.movesMap = {};
    docs.forEach((m) => { state.movesMap[m.id] = m; });

    docs.forEach((m) => {
      if (m.by !== state.role) return;
      const old = prev[m.id];
      if (old && typeof old.exact !== "number" && typeof m.exact === "number") {
        if (state.viewOpen) {
          sfx("tabSwitch");
        } else {
          toast("Lawan sudah menilai tebakanmu. Buka Guess the Color.", "ok");
        }
      }
    });

    evaluateMoves();
    gtcRender();
  }

  function mulaiRoomSeen() {
    if (state.roomSeenTimer) clearInterval(state.roomSeenTimer);
    tulisSeen();
    state.roomSeenTimer = setInterval(() => {
      if (!state.room || !state.roomId || !state.user) return;
      if (state.room.status === "finished" || state.room.status === "cancelled") return;
      tulisSeen();
    }, 20000);
  }

  function tulisSeen() {
    if (!state.roomId || !state.role) return;
    const key = state.role + "Seen";
    roomRef().update({
      [key]: Date.now(),
      lastActivity: Date.now(),
    }).catch(() => {});
  }

  function startGame() {
    if (state.starting || isPractice()) return;
    state.starting = true;
    const ref = roomRef();
    db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const room = snap.data();
      if (room.status !== "setup" || !room.hostReady || !room.guestReady) return;
      const now = Date.now();
      tx.update(ref, {
        status: "playing",
        startAt: now,
        endAt: now + DURATION,
        lastActivity: now,
        updatedAt: now,
      });
    }).catch((err) => {
      if (err && err.code === "permission-denied") setDbError(err);
    }).finally(() => {
      state.starting = false;
    });
  }

  function evaluateMoves() {
    if (isPractice() || !state.room || state.room.status !== "playing") return;
    if (!validSecret(state.secret)) return;
    if (state.room.endAt && Date.now() > state.room.endAt) return;

    const secret = state.secret.slice();
    state.moves.forEach((m) => {
      if (m.by === state.role) return;
      if (typeof m.exact === "number") return;
      if (!Array.isArray(m.colors) || m.colors.length !== LEN) return;
      if (!m.colors.every((id) => !!COLOR_BY_ID[id])) return;
      if (state.evaluating.has(m.id)) return;
      state.evaluating.add(m.id);
      const hasil = hitungPetunjuk(m.colors, secret);
      movesRef().doc(m.id).update({
        exact: hasil.exact,
        partial: hasil.partial,
        evaluatedAt: Date.now(),
        evaluatedBy: state.role,
      }).then(() => {
        if (hasil.exact === LEN) {
          finishGame(m.by, "tebak-tepat");
        } else if ((Number(m.n) || 0) >= MAX_ATTEMPTS) {
          finishGame(state.role, "habis");
        }
      }).catch((err) => {
        if (err && err.code === "permission-denied") setDbError(err);
        else toast("Gagal menilai tebakan lawan.", "error");
      }).finally(() => {
        state.evaluating.delete(m.id);
      });
    });
  }

  async function finishGame(winnerRole, alasan) {
    if (isPractice()) return;
    if (!state.roomId || state.resolving) return;
    state.resolving = true;
    try {
      const ref = roomRef();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const room = snap.data();
        if (room.status === "finished") return;
        const now = Date.now();
        tx.update(ref, {
          status: "finished",
          winner: winnerRole,
          alasan,
          finishedAt: now,
          updatedAt: now,
          lastActivity: now,
        });
      });
    } catch (err) {
      if (err && err.code === "permission-denied") setDbError(err);
    } finally {
      state.resolving = false;
    }
  }

  function resolveTime() {
    if (state.timeResolving) return;
    if (!state.room || state.room.status !== "playing") return;
    if (!state.room.endAt || Date.now() < state.room.endAt) return;

    if (isPractice()) {
      state.timeResolving = true;
      practiceFinish(false, "waktu");
      state.timeResolving = false;
      return;
    }

    state.timeResolving = true;
    const best = (role) => {
      const list = state.moves.filter((m) => m.by === role && typeof m.exact === "number");
      let exact = -1;
      let partial = -1;
      list.forEach((m) => {
        if (m.exact > exact || (m.exact === exact && m.partial > partial)) {
          exact = m.exact;
          partial = m.partial;
        }
      });
      return { exact, partial, attempts: state.moves.filter((m) => m.by === role).length };
    };
    const host = best("host");
    const guest = best("guest");
    let winner = "draw";
    if (host.exact !== guest.exact) winner = host.exact > guest.exact ? "host" : "guest";
    else if (host.partial !== guest.partial) winner = host.partial > guest.partial ? "host" : "guest";
    else if (host.attempts !== guest.attempts) winner = host.attempts < guest.attempts ? "host" : "guest";
    finishGame(winner, "waktu").finally(() => { state.timeResolving = false; });
  }

  async function resetRoom() {
    if (state.resetting || isPractice()) return;
    state.resetting = true;
    try {
      const ref = roomRef();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const room = snap.data();
        if (room.status !== "finished" || !room.hostRematch || !room.guestRematch) return;
        const now = Date.now();
        tx.update(ref, {
          status: "setup",
          hostReady: false,
          guestReady: false,
          hostRematch: false,
          guestRematch: false,
          winner: null,
          alasan: null,
          finishedAt: null,
          startAt: null,
          endAt: null,
          hostSecret: null,
          guestSecret: null,
          updatedAt: now,
          lastActivity: now,
        });
      });
      const batch = db.batch();
      ["host", "guest"].forEach((role) => {
        for (let n = 1; n <= MAX_ATTEMPTS; n += 1) {
          batch.delete(movesRef().doc(role + "-" + n));
        }
      });
      await batch.commit();
      hapusSecret();
      state.secret = [];
      state.secretDraft = ["", "", "", ""];
      state.picker = ["", "", "", ""];
      state.resultSound = "";
      state.timeResolving = false;
    } catch (err) {
      if (err && err.code === "permission-denied") setDbError(err);
      toast("Gagal menyiapkan ronde baru.", "error");
    } finally {
      state.resetting = false;
    }
  }

  async function mintaRematch() {
    if (isPractice()) {
      startPractice();
      return;
    }
    if (!state.room || state.room.status !== "finished") return;
    try {
      await roomRef().update({
        [state.role + "Rematch"]: true,
        updatedAt: Date.now(),
      });
      toast("Menunggu lawan menekan Main Lagi...");
    } catch (err) {
      toast("Gagal meminta rematch.", "error");
    }
  }

  async function keluarRoom() {
    if (isPractice()) {
      endPractice();
      return;
    }
    if (!state.roomId || !state.room) return;
    const playing = state.room.status === "playing";
    const pesan = playing
      ? "Keluar sekarang? Kamu otomatis kalah."
      : "Keluar dari room ini?";
    if (!window.confirm(pesan)) return;

    const room = state.room;
    const role = state.role;
    const code = state.roomId;
    try {
      if (playing) {
        await finishGame(roleLawan(), "keluar");
      } else if (room.status === "lobby" || room.status === "setup") {
        if (role === "host") {
          await db.collection(ROOMS).doc(code).delete();
        } else {
          await db.collection(ROOMS).doc(code).update({
            guestAbsen: null,
            guestNama: null,
            guestReady: false,
            hostReady: false,
            status: "lobby",
            guestSeen: 0,
            updatedAt: Date.now(),
            lastActivity: Date.now(),
          });
        }
      }
      await hapusUndanganRoom(code);
    } catch (err) {
      if (err && err.code === "permission-denied") setDbError(err);
    }
    hapusRoomRef();
    hapusSecret();
    detachRoom();
    state.secret = [];
    state.secretDraft = ["", "", "", ""];
    state.picker = ["", "", "", ""];
    state.resultSound = "";
    gtcRender();
    sfx("modalClose");
  }

  async function hapusUndanganRoom(code) {
    try {
      const snap = await db.collection(INVITES).where("roomId", "==", code).get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {}
  }

  function cleanupLama() {
    const now = Date.now();
    if (now - state.lastCleanup < 10 * 60 * 1000) return;
    state.lastCleanup = now;
    db.collection(ROOMS).where("createdAt", "<", now - ROOM_TTL).limit(15).get()
      .then((snap) => {
        if (snap.empty) return;
        const batch = db.batch();
        snap.forEach((doc) => batch.delete(doc.ref));
        return batch.commit();
      })
      .catch(() => {});
    db.collection(INVITES).where("createdAt", "<", now - 10 * 60 * 1000).limit(15).get()
      .then((snap) => {
        if (snap.empty) return;
        const batch = db.batch();
        snap.forEach((doc) => batch.delete(doc.ref));
        return batch.commit();
      })
      .catch(() => {});
  }

  /* ============================ practice ============================ */

  function startPractice() {
    if (!state.user) return;
    if (state.roomId) {
      toast("Keluar dari room dulu sebelum latihan.", "warn");
      return;
    }
    detachRoom();
    state.practiceMode = true;
    state.role = "host";
    state.roomId = null;
    state.secret = randomPermutation();
    state.moves = [];
    state.movesMap = {};
    state.picker = ["", "", "", ""];
    state.timeResolving = false;
    state.room = {
      code: "LATIHAN",
      hostAbsen: myAbsen(),
      hostNama: myName(),
      guestAbsen: "bot",
      guestNama: "Komputer",
      status: "playing",
      hostReady: true,
      guestReady: true,
      startAt: Date.now(),
      endAt: Date.now() + DURATION,
      winner: null,
      alasan: null,
      hostSecret: null,
      guestSecret: null,
      hostRematch: false,
      guestRematch: false,
      practice: true,
    };
    state.resultSound = "";
    mulaiTicker();
    gtcRender();
    sfx("teamsReady");
  }

  function practiceFinish(menang, alasan) {
    if (!state.room || state.room.status !== "playing") return;
    state.room.status = "finished";
    state.room.winner = menang ? "host" : "guest";
    state.room.alasan = alasan;
    state.room.finishedAt = Date.now();
    state.room.guestSecret = state.secret.slice();
    state.resultSound = menang ? "win" : "lose";
    sfx(menang ? "timerFinish" : "errorSound");
    gtcRender();
  }

  function endPractice() {
    state.practiceMode = false;
    state.room = null;
    state.roomId = null;
    state.role = null;
    state.moves = [];
    state.movesMap = {};
    state.secret = [];
    state.secretDraft = ["", "", "", ""];
    state.picker = ["", "", "", ""];
    state.resultSound = "";
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
    gtcRender();
  }

  /* ============================ aksi ============================ */

  function pickColor(kind, colorId) {
    if (!COLOR_BY_ID[colorId]) return;
    if (kind === "secret") {
      if (isPractice() || !state.room || state.room.status !== "setup") return;
      if (state.room[state.role + "Ready"]) return;
      if (state.secretDraft.includes(colorId)) return;
      const idx = state.secretDraft.findIndex((c) => !c);
      if (idx < 0) return;
      state.secretDraft[idx] = colorId;
      sfx("shuffleTick");
      gtcRender();
      return;
    }
    if (kind === "guess") {
      if (!state.room || state.room.status !== "playing") return;
      if (state.room.endAt && Date.now() >= state.room.endAt) return;
      if (ownMoves().length >= MAX_ATTEMPTS) return;
      if (pendingOwnMove()) return;
      if (state.picker.includes(colorId)) return;
      const idx = state.picker.findIndex((c) => !c);
      if (idx < 0) return;
      state.picker[idx] = colorId;
      sfx("shuffleTick");
      gtcRender();
    }
  }

  function clearSlot(kind, idx) {
    const n = Number(idx);
    if (!Number.isInteger(n) || n < 0 || n >= LEN) return;
    if (kind === "secret") {
      if (isPractice() || !state.room || state.room.status !== "setup") return;
      if (state.room[state.role + "Ready"]) return;
      state.secretDraft[n] = "";
      gtcRender();
      return;
    }
    if (!state.room || state.room.status !== "playing") return;
    if (pendingOwnMove()) return;
    state.picker[n] = "";
    gtcRender();
  }

  function randomSlots(kind) {
    if (kind === "secret") {
      if (isPractice() || !state.room || state.room.status !== "setup") return;
      if (state.room[state.role + "Ready"]) return;
      state.secretDraft = randomPermutation();
      sfx("shuffleTick");
      gtcRender();
      return;
    }
    if (!state.room || state.room.status !== "playing") return;
    if (pendingOwnMove()) return;
    state.picker = randomPermutation();
    sfx("shuffleTick");
    gtcRender();
  }

  async function siapSecret() {
    if (isPractice() || !state.room || state.room.status !== "setup") return;
    if (state.room[state.role + "Ready"]) return;
    const secret = state.secretDraft.slice();
    if (!validSecret(secret)) {
      toast("Susun 4 warna dulu. Tiap warna cuma boleh dipakai sekali.", "warn");
      return;
    }
    try {
      simpanSecret(secret);
      state.secret = secret;
      await roomRef().update({
        [state.role + "Ready"]: true,
        [state.role + "Seen"]: Date.now(),
        updatedAt: Date.now(),
      });
      toast("Kode rahasia terkunci. Menunggu lawan siap...", "ok");
      sfx("teamsReady");
    } catch (err) {
      hapusSecret();
      if (err && err.code === "permission-denied") setDbError(err);
      toast("Gagal menyimpan kode rahasia.", "error");
    }
  }

  async function submitGuess() {
    if (state.busy || !state.room || state.room.status !== "playing") return;
    if (state.room.endAt && Date.now() >= state.room.endAt) {
      toast("Waktu sudah habis.", "warn");
      return;
    }
    if (!isPractice() && ownMoves().length >= MAX_ATTEMPTS) return;
    if (!isPractice() && pendingOwnMove()) {
      toast("Tunggu lawan menilai tebakan sebelumnya.", "warn");
      return;
    }
    const guess = state.picker.slice();
    if (!validSecret(guess)) {
      toast("Isi 4 warna dulu. Tiap warna cuma boleh dipakai sekali.", "warn");
      return;
    }

    state.busy = true;
    try {
      if (isPractice()) {
        const n = ownMoves().length + 1;
        const hasil = hitungPetunjuk(guess, state.secret);
        const move = { id: "latihan-" + n, n, by: "host", colors: guess.slice(), exact: hasil.exact, partial: hasil.partial, at: Date.now() };
        state.moves.push(move);
        state.movesMap[move.id] = move;
        state.picker = ["", "", "", ""];
        sfx("cardOpen");
        if (hasil.exact === LEN) practiceFinish(true, "tebak-tepat");
        else if (n >= MAX_ATTEMPTS) practiceFinish(false, "habis");
        else gtcRender();
        return;
      }

      const n = ownMoves().length + 1;
      const id = state.role + "-" + n;
      await movesRef().doc(id).set({
        n,
        by: state.role,
        colors: guess,
        at: Date.now(),
        exact: null,
        partial: null,
        evaluatedAt: null,
      });
      state.picker = ["", "", "", ""];
      sfx("cardOpen");
      gtcRender();
    } catch (err) {
      if (err && err.code === "permission-denied") setDbError(err);
      toast("Gagal mengirim tebakan. Coba lagi.", "error");
    } finally {
      state.busy = false;
    }
  }

  /* ============================ render ============================ */

  function dbNote() {
    if (!state.dbError) return "";
    return `
      <div class="gtc-db-warning">
        <strong>⚠️ Database multiplayer belum aktif</strong>
        <p>${esc(state.dbError)}</p>
        <button type="button" class="gtc-btn gtc-btn-ghost gtc-btn-sm" data-gtc-action="retry">Coba Lagi</button>
      </div>`;
  }

  function hubHTML() {
    const totalOnline = (typeof dataSiswa !== "undefined" ? dataSiswa : [])
      .filter((s) => String(s.absen) !== myAbsen() && onlineSiswa(s.absen)).length;
    return `
      <div class="gtc-hub">
        <section class="gtc-hero">
          <div class="gtc-hero-orb gtc-orb-a" aria-hidden="true"></div>
          <div class="gtc-hero-orb gtc-orb-b" aria-hidden="true"></div>
          <div class="gtc-hero-orb gtc-orb-c" aria-hidden="true"></div>
          <span class="gtc-tag">🎯 Duel 1 vs 1</span>
          <h3>Guess the Color</h3>
          <p>Susun 4 warna rahasia, lalu tebak kode lawan. Benar duluan menang, kehabisan percobaan kalah.</p>
          <div class="gtc-hero-actions">
            <button type="button" class="gtc-btn gtc-btn-primary" data-gtc-action="create">
              <span aria-hidden="true">🎯</span> Buat Room
            </button>
            <button type="button" class="gtc-btn gtc-btn-ghost" data-gtc-action="practice">
              <span aria-hidden="true">🤖</span> Latihan
            </button>
          </div>
          <div class="gtc-meta">
            <span>⏱️ 5 menit</span>
            <span>🔁 5 percobaan</span>
            <span>🔒 Kode rahasia</span>
          </div>
        </section>

        <section class="gtc-card gtc-join-card">
          <div>
            <h4>Gabung pakai kode</h4>
            <p>Minta kode room dari teman yang mengajakmu.</p>
          </div>
          <div class="gtc-join-row">
            <input id="gtc-code-input" class="gtc-code-input" type="text" maxlength="5" placeholder="ABC12"
              autocomplete="off" spellcheck="false" aria-label="Kode room">
            <button type="button" class="gtc-btn gtc-btn-primary" data-gtc-action="join">Gabung</button>
          </div>
        </section>

        <section class="gtc-card gtc-players-card">
          <div class="gtc-card-head">
            <div>
              <h4>Ajak Teman</h4>
              <p>Pilih teman buat dikirimi undangan duel.</p>
            </div>
            <span class="gtc-online-pill"><span class="gtc-online-dot"></span>${totalOnline} online</span>
          </div>
          <div id="gtc-player-list" class="gtc-player-list"></div>
        </section>

        <details class="gtc-rules">
          <summary>Cara main</summary>
          <ol>
            <li>Kamu dan lawan menyusun kode rahasia 4 warna. Tiap warna dipakai sekali.</li>
            <li>Setelah mulai, kalian saling menebak. Tiap tebakan dapat petunjuk 🎯 posisi tepat dan 🔄 warna benar posisi salah.</li>
            <li>Benar duluan = menang. Kalau percobaanmu habis lebih dulu = kalah.</li>
            <li>Waktu habis? Petunjuk terbaik yang menang. Kalau sama, seri.</li>
          </ol>
        </details>

        ${dbNote()}
      </div>`;
  }

  function playersHTML() {
    if (!state.user) return "";
    let daftar = [];
    try {
      daftar = (typeof dataSiswa !== "undefined" ? dataSiswa : [])
        .filter((s) => String(s.absen) !== myAbsen())
        .map((s) => ({
          absen: String(s.absen),
          nama: namaSiswa(s.absen),
          online: onlineSiswa(s.absen),
        }));
    } catch (err) {}
    daftar.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.nama.localeCompare(b.nama, "id");
    });
    if (!daftar.length) {
      return `<p class="gtc-empty">Daftar teman belum tersedia.</p>`;
    }
    return daftar.map((s) => `
      <button type="button" class="gtc-player ${s.online ? "is-online" : ""}"
        data-gtc-action="invite" data-gtc-absen="${esc(s.absen)}">
        <span class="gtc-player-avatar">${esc(initial(s.nama))}</span>
        <span class="gtc-player-info">
          <strong>${esc(s.nama)}</strong>
          <small><span class="gtc-presence-dot"></span>${s.online ? "Online sekarang" : "Offline"}</small>
        </span>
        <span class="gtc-player-cta">Ajak</span>
      </button>`).join("");
  }

  function renderPlayers() {
    const box = $("gtc-player-list");
    if (!box) return;
    box.innerHTML = playersHTML();
  }

  function lobbyHTML() {
    const room = state.room;
    const hostNama = room.hostNama || "Host";
    const guestNama = room.guestNama || "";
    return `
      <div class="gtc-room-wrap">
        <section class="gtc-room-card">
          <div class="gtc-room-top">
            <span class="gtc-room-kicker">🎨 Room duel</span>
            <button type="button" class="gtc-mini-btn" data-gtc-action="leave">Batalkan</button>
          </div>
          <div class="gtc-room-code">
            <small>Kode room</small>
            <strong>${esc(roomCodeNow())}</strong>
            <button type="button" class="gtc-copy-btn" data-gtc-action="copy-code">Salin kode</button>
          </div>
          <div class="gtc-vs">
            <div class="gtc-vs-side">
              <span class="gtc-avatar-big">${esc(initial(hostNama))}</span>
              <strong>${esc(hostNama)}</strong>
              <small>Host</small>
            </div>
            <span class="gtc-vs-badge">VS</span>
            <div class="gtc-vs-side ${guestNama ? "" : "is-empty"}">
              <span class="gtc-avatar-big">${guestNama ? esc(initial(guestNama)) : "?"}</span>
              <strong>${guestNama ? esc(guestNama) : "Menunggu lawan"}</strong>
              <small>${guestNama ? "Lawan" : "Bagikan kode room"}</small>
            </div>
          </div>
          <p class="gtc-room-hint">${guestNama
            ? "Lawan sudah masuk. Siapkan kode rahasia kalian."
            : "Room langsung berubah ke tahap susun kode setelah lawan masuk."}</p>
        </section>
      </div>`;
  }

  function setupSlotsHTML(kind, values, locked) {
    return `<div class="gtc-slots ${kind === "guess" ? "gtc-slots-guess" : ""}">
      ${values.map((warna, i) => {
        const c = COLOR_BY_ID[warna];
        return `<button type="button" class="gtc-slot ${c ? "is-filled" : ""} ${locked ? "is-locked" : ""}"
          data-gtc-action="${kind === "secret" ? "clear-secret-slot" : "clear-guess-slot"}" data-slot="${i}"
          ${locked ? "disabled" : ""} ${c ? `style="--c:${c.hex}"` : ""} aria-label="${c ? c.nama : "Kosong"}">
          ${c ? `<span class="gtc-slot-dot"></span><small>${c.nama}</small>` : `<span class="gtc-slot-plus">+</span>`}
        </button>`;
      }).join("")}
    </div>`;
  }

  function paletteHTML(kind, values, locked) {
    return `<div class="gtc-palette">
      ${COLORS.map((c) => {
        const dipakai = values.includes(c.id);
        return `<button type="button" class="gtc-color-btn ${dipakai ? "is-used" : ""}"
          style="--c:${c.hex}" data-gtc-action="${kind === "secret" ? "secret-color" : "guess-color"}"
          data-color="${c.id}" ${locked || dipakai ? "disabled" : ""}>
          <span class="gtc-color-swatch"></span>
          <span class="gtc-color-name">${c.nama}</span>
        </button>`;
      }).join("")}
    </div>`;
  }

  function setupHTML() {
    const room = state.room;
    const siap = !!room[state.role + "Ready"];
    const lawanSiap = !!room[roleLawan() + "Ready"];
    const lengkap = validSecret(state.secretDraft);
    return `
      <div class="gtc-room-wrap">
        <section class="gtc-setup-card">
          <div class="gtc-room-top">
            <span class="gtc-room-kicker">🔐 Susun kode rahasia</span>
            <button type="button" class="gtc-mini-btn" data-gtc-action="leave">Keluar</button>
          </div>
          <div class="gtc-room-strip">
            <span class="gtc-mini-player">${esc(initial(room.hostNama || "Host"))} ${esc(room.hostNama || "Host")}</span>
            <span class="gtc-ready-pill ${room.hostReady ? "is-ready" : ""}">${room.hostReady ? "Siap" : "Belum siap"}</span>
            <span class="gtc-vs-tiny">vs</span>
            <span class="gtc-mini-player">${esc(initial(room.guestNama || "?"))} ${esc(room.guestNama || "Lawan")}</span>
            <span class="gtc-ready-pill ${room.guestReady ? "is-ready" : ""}">${room.guestReady ? "Siap" : "Belum siap"}</span>
          </div>

          <h4>${siap ? "Kode rahasiamu terkunci" : "Pilih urutan 4 warnamu"}</h4>
          <p class="gtc-setup-sub">${siap
            ? "Tunggu lawan menyiapkan kodenya. Duel mulai otomatis saat kalian berdua siap."
            : "Tiap warna cuma bisa dipakai sekali. Lawan tidak bisa melihat kode ini."}</p>

          ${setupSlotsHTML("secret", state.secretDraft, siap)}
          ${siap ? "" : paletteHTML("secret", state.secretDraft, false)}

          <div class="gtc-setup-actions">
            ${siap ? "" : `<button type="button" class="gtc-btn gtc-btn-ghost" data-gtc-action="random-secret">🔀 Acak</button>`}
            <button type="button" class="gtc-btn gtc-btn-primary" data-gtc-action="ready" ${siap || !lengkap ? "disabled" : ""}>
              ${siap ? "Menunggu lawan..." : "Siap!"}
            </button>
          </div>
          <p class="gtc-ready-note">${siap
            ? (lawanSiap ? "Kedua pemain siap. Duel segera dimulai..." : "Lawan belum siap.")
            : (lengkap ? "Kode sudah lengkap. Tekan Siap buat mengunci." : "Isi semua 4 slot dulu.")}</p>
        </section>
      </div>`;
  }

  function feedbackHTML(move) {
    if (typeof move.exact !== "number") {
      return `<span class="gtc-fb gtc-fb-pending">⏳ Menunggu lawan menilai...</span>`;
    }
    const badges = [];
    if (move.exact > 0) badges.push(`<span class="gtc-fb gtc-fb-exact">🎯 ${move.exact} posisi tepat</span>`);
    if (move.partial > 0) badges.push(`<span class="gtc-fb gtc-fb-partial">🔄 ${move.partial} warna benar</span>`);
    if (!badges.length) badges.push(`<span class="gtc-fb gtc-fb-none">❌ Belum ada yang cocok</span>`);
    return badges.join("");
  }

  function historyHTML() {
    const list = ownMoves();
    if (!list.length) {
      return `<div class="gtc-history-empty"><span aria-hidden="true">🎨</span><p>Belum ada tebakan. Coba tebak 4 warna pertama.</p></div>`;
    }
    return list.map((m) => `
      <div class="gtc-guess-row">
        <span class="gtc-attempt-no">#${m.n}</span>
        <div class="gtc-guess-chips">${(m.colors || []).map((id) => warnaChip(id)).join("")}</div>
        <div class="gtc-feedback">${feedbackHTML(m)}</div>
      </div>`).join("");
  }

  function playHTML() {
    const room = state.room;
    const attempts = ownMoves().length;
    const pending = pendingOwnMove();
    const waktuHabis = room.endAt && Date.now() >= room.endAt;
    const bisaTebak = !pending && attempts < MAX_ATTEMPTS && !waktuHabis;
    const lawanTebakan = opponentMoves().length;
    const online = lawanOnline();
    return `
      <div class="gtc-play-wrap">
        <section class="gtc-play-card">
          <div class="gtc-play-head">
            <div class="gtc-clock-box">
              <span class="gtc-clock-label">Sisa waktu</span>
              <strong id="gtc-clock" class="gtc-clock">${fmtWaktu((room.endAt || Date.now() + DURATION) - Date.now())}</strong>
            </div>
            <div class="gtc-attempt-box">
              <span>Percobaanmu</span>
              <strong>${attempts}<small>/${MAX_ATTEMPTS}</small></strong>
            </div>
            <div class="gtc-vs-mini">
              <span class="gtc-mini-avatar">${esc(initial(myName()))}</span>
              <span>vs</span>
              <span class="gtc-mini-avatar is-lawan">${esc(initial(lawanNama()))}</span>
            </div>
          </div>
          <div class="gtc-timebar"><span id="gtc-time-fill" style="width:${Math.max(0, Math.min(100, ((room.endAt || 0) - Date.now()) / DURATION * 100))}%"></span></div>
          <p class="gtc-opp-status">
            <span class="gtc-online-dot ${online ? "is-on" : ""}"></span>
            ${esc(lawanNama())} ${online ? "online" : "belum terlihat"} · sudah ${lawanTebakan} tebakan
            ${isPractice() ? " · mode latihan" : ""}
          </p>

          ${isPractice() ? `<p class="gtc-practice-note">🤖 Lawanmu komputer. Tebak kodenya dalam 5 percobaan.</p>` : ""}

          <div class="gtc-history">
            <div class="gtc-section-label">Tebakanmu</div>
            ${historyHTML()}
          </div>

          ${bisaTebak || pending ? `
            <div class="gtc-guess-box">
              <div class="gtc-section-label">${pending ? "Tebakan terkirim" : "Tebakan berikutnya"}</div>
              ${setupSlotsHTML("guess", pending ? pending.colors : state.picker, pending)}
              ${pending ? `<p class="gtc-wait-note">⏳ Menunggu lawan menilai. Petunjuk muncul otomatis.</p>` : paletteHTML("guess", state.picker, false)}
              <div class="gtc-guess-actions">
                ${pending ? "" : `<button type="button" class="gtc-btn gtc-btn-ghost" data-gtc-action="random-guess">🔀 Acak</button>`}
                <button type="button" class="gtc-btn gtc-btn-primary" data-gtc-action="submit-guess"
                  ${pending || !validSecret(state.picker) || state.busy ? "disabled" : ""}>
                  Kirim Tebakan
                </button>
              </div>
            </div>` : `
            <div class="gtc-wait-box">
              <strong>${waktuHabis ? "⏰ Waktu habis" : "Percobaan habis"}</strong>
              <p>${waktuHabis ? "Menghitung hasil..." : "Menunggu hasil dari lawan..."}</p>
            </div>`}

          <button type="button" class="gtc-link-danger" data-gtc-action="surrender">
            ${isPractice() ? "Selesai latihan" : "Menyerah & keluar"}
          </button>
        </section>
      </div>`;
  }

  function resultHTML() {
    const room = state.room;
    const winner = room.winner;
    const seri = winner === "draw";
    const menang = winner === state.role;
    const judul = seri ? "Seri!" : menang ? "Kamu menang!" : "Kamu kalah";
    const emoji = seri ? "🤝" : menang ? "🏆" : "💫";
    const kodeHost = validSecret(room.hostSecret) ? room.hostSecret : null;
    const kodeGuest = validSecret(room.guestSecret) ? room.guestSecret : null;
    let alasan = "";
    if (room.alasan === "tebak-tepat") {
      alasan = namaRole(winner) + " berhasil menebak urutan warna lebih dulu.";
    } else if (room.alasan === "habis") {
      const kalah = winner === "host" ? "guest" : "host";
      alasan = namaRole(kalah) + " kehabisan percobaan lebih dulu.";
    } else if (room.alasan === "waktu") {
      alasan = seri
        ? "Waktu 5 menit habis dan petunjuk kalian seimbang."
        : "Waktu 5 menit habis. " + namaRole(winner) + " punya petunjuk terbaik.";
    } else if (room.alasan === "keluar") {
      const keluar = winner === "host" ? "guest" : "host";
      alasan = namaRole(keluar) + " keluar dari duel.";
    } else {
      alasan = "Duel selesai.";
    }
    if (isPractice() && room.alasan === "waktu") {
      alasan = "Waktu 5 menit habis. Kode komputer belum berhasil ditebak.";
    }
    const rematchSaya = !!room[state.role + "Rematch"];
    return `
      <div class="gtc-result-wrap">
        <section class="gtc-result-card ${seri ? "is-draw" : menang ? "is-win" : "is-lose"}">
          ${menang && !seri ? `<div class="gtc-confetti" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<span style="--i:${i}"></span>`).join("")}</div>` : ""}
          <span class="gtc-result-emoji" aria-hidden="true">${emoji}</span>
          <h3>${judul}</h3>
          <p class="gtc-result-reason">${esc(alasan)}</p>

          <div class="gtc-reveal">
            <div class="gtc-reveal-row">
              <span class="gtc-reveal-name">${isPractice() ? "Komputer" : esc(namaRole("host"))}</span>
              <div class="gtc-reveal-chips">${isPractice()
                ? (kodeGuest ? kodeGuest.map((id) => warnaChip(id)).join("") : `<span class="gtc-muted">Kode komputer</span>`)
                : (kodeHost ? kodeHost.map((id) => warnaChip(id)).join("") : `<span class="gtc-muted">Belum terbuka</span>`)}</div>
            </div>
            ${isPractice() ? "" : `
            <div class="gtc-reveal-row">
              <span class="gtc-reveal-name">${esc(namaRole("guest"))}</span>
              <div class="gtc-reveal-chips">${kodeGuest ? kodeGuest.map((id) => warnaChip(id)).join("") : `<span class="gtc-muted">Belum terbuka</span>`}</div>
            </div>`}
          </div>

          <div class="gtc-result-actions">
            <button type="button" class="gtc-btn gtc-btn-primary" data-gtc-action="rematch">
              ${rematchSaya ? "Menunggu lawan..." : isPractice() ? "Main Lagi" : "Main Lagi"}
            </button>
            <button type="button" class="gtc-btn gtc-btn-ghost" data-gtc-action="leave">
              ${isPractice() ? "Selesai" : "Keluar Room"}
            </button>
          </div>
        </section>
      </div>`;
  }

  function gtcRender() {
    const view = $("game-guesscolor-view");
    if (!view) return;
    const locked = $("gtc-locked");
    const app = $("gtc-app");
    if (!app) return;

    if (!state.user) {
      if (locked) {
        locked.hidden = false;
        locked.innerHTML = `
          <div class="streak-locked-card gtc-locked-card">
            <span class="streak-locked-icon" aria-hidden="true">🔒</span>
            <h3>Login dulu buat duel</h3>
            <p>Guess the Color butuh akun supaya teman bisa mengundangmu dan kode rahasiamu tersimpan di browser ini.</p>
            <button class="btn-primary" type="button" data-game-login>Login Sekarang</button>
          </div>`;
      }
      app.hidden = true;
      app.innerHTML = "";
      return;
    }

    if (locked) { locked.hidden = true; locked.innerHTML = ""; }
    app.hidden = false;

    let html = "";
    if (state.practiceMode && state.room) {
      html = state.room.status === "finished" ? resultHTML() : playHTML();
    } else if (!state.roomId && !state.room) {
      html = hubHTML();
    } else if (!state.room) {
      html = `<div class="gtc-loading"><span class="gtc-loading-dot"></span>Menyiapkan room...</div>`;
    } else if (state.room.status === "lobby") {
      html = lobbyHTML();
    } else if (state.room.status === "setup") {
      html = setupHTML();
    } else if (state.room.status === "playing") {
      html = playHTML();
    } else if (state.room.status === "finished") {
      html = resultHTML();
    } else {
      html = hubHTML();
    }
    app.innerHTML = html;
    renderPlayers();
    updateClock();
  }

  function mulaiTicker() {
    if (state.tickTimer) clearInterval(state.tickTimer);
    state.tickTimer = setInterval(() => {
      updateClock();
      resolveTime();
    }, 500);
  }

  function updateClock() {
    const clock = $("gtc-clock");
    if (!clock || !state.room) return;
    const endAt = Number(state.room.endAt) || 0;
    if (!endAt) return;
    const sisa = Math.max(0, endAt - Date.now());
    clock.textContent = fmtWaktu(sisa);
    clock.classList.toggle("is-hurry", sisa <= 30000 && sisa > 10000);
    clock.classList.toggle("is-critical", sisa <= 10000 && sisa > 0);
    const fill = $("gtc-time-fill");
    if (fill) fill.style.width = Math.max(0, Math.min(100, (sisa / DURATION) * 100)) + "%";
  }

  /* ============================ lifecycle ============================ */

  function restoreRoom() {
    const ref = bacaRoomRef();
    if (!ref) {
      state.room = null;
      state.roomId = null;
      gtcRender();
      return;
    }
    attachRoom(ref.roomId, ref.role);
  }

  function buka() {
    state.viewOpen = true;
    const view = $("game-guesscolor-view");
    if (view) view.hidden = false;
    const listView = $("games-list-view");
    if (listView) listView.hidden = true;
    const user = getCurrentUser();
    if (!state.user || (user && String(user.absen) !== myAbsen())) {
      akunBerubah(user);
    }
    gtcRender();
  }

  function tutup() {
    state.viewOpen = false;
    const view = $("game-guesscolor-view");
    if (view) view.hidden = true;
  }

  function akunBerubah(user) {
    const u = user || null;
    const lama = state.user ? String(state.user.absen) : "";
    const baru = u ? String(u.absen) : "";
    if (lama && lama === baru) {
      state.user = u;
      return;
    }
    teardown();
    state.user = u;
    if (!u) {
      gtcRender();
      return;
    }
    mulaiPresence();
    mulaiPlayers();
    mulaiInvites();
    restoreRoom();
    cleanupLama();
    gtcRender();
  }

  function teardown() {
    if (state.inviteUnsub) { state.inviteUnsub(); state.inviteUnsub = null; }
    if (state.playersUnsub) { state.playersUnsub(); state.playersUnsub = null; }
    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.movesUnsub) { state.movesUnsub(); state.movesUnsub = null; }
    if (state.inviteTimer) { clearInterval(state.inviteTimer); state.inviteTimer = null; }
    if (state.presenceTimer) { clearInterval(state.presenceTimer); state.presenceTimer = null; }
    if (state.roomSeenTimer) { clearInterval(state.roomSeenTimer); state.roomSeenTimer = null; }
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
    state.players = {};
    state.invite = null;
    state.inviteSound = "";
    state.room = null;
    state.roomId = null;
    state.role = null;
    state.moves = [];
    state.movesMap = {};
    state.secret = [];
    state.secretDraft = ["", "", "", ""];
    state.picker = ["", "", "", ""];
    state.practiceMode = false;
    state.dbError = "";
    state.resultSound = "";
    state.timeResolving = false;
    renderInviteBanner();
  }

  function retrySambung() {
    const user = getCurrentUser();
    state.loaded = false;
    teardown();
    state.user = null;
    akunBerubah(user);
    toast("Menyambung ulang...");
  }

  function ambilKodeInput() {
    const input = $("gtc-code-input");
    const kode = input ? input.value : "";
    gabungRoom(kode).catch((err) => {
      if (err && err.code === "permission-denied") setDbError(err);
      toast(err && err.message ? err.message : "Gagal gabung room.", "error");
    });
  }

  function aksi(button) {
    const action = button.dataset.gtcAction;
    switch (action) {
      case "create":
        buatRoom();
        break;
      case "practice":
        startPractice();
        break;
      case "join":
        ambilKodeInput();
        break;
      case "invite": {
        const target = button.dataset.gtcAbsen;
        if (!target) break;
        if (state.room && state.room.status === "lobby" && !state.room.guestAbsen) {
          kirimUndangan(state.roomId, target).catch((err) => {
            if (err && err.code === "permission-denied") setDbError(err);
            toast("Gagal mengirim undangan.", "error");
          });
        } else {
          buatRoom(target);
        }
        break;
      }
      case "copy-code": {
        const kode = roomCodeNow();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(kode).then(() => toast("Kode room disalin.", "ok")).catch(() => {
            window.prompt("Salin kode room:", kode);
          });
        } else {
          window.prompt("Salin kode room:", kode);
        }
        break;
      }
      case "ready":
        siapSecret();
        break;
      case "secret-color":
        pickColor("secret", button.dataset.color);
        break;
      case "guess-color":
        pickColor("guess", button.dataset.color);
        break;
      case "clear-secret-slot":
        clearSlot("secret", button.dataset.slot);
        break;
      case "clear-guess-slot":
        clearSlot("guess", button.dataset.slot);
        break;
      case "random-secret":
        randomSlots("secret");
        break;
      case "random-guess":
        randomSlots("guess");
        break;
      case "submit-guess":
        submitGuess();
        break;
      case "rematch":
        mintaRematch();
        break;
      case "leave":
        keluarRoom();
        break;
      case "surrender":
        keluarRoom();
        break;
      case "retry":
        retrySambung();
        break;
      default:
        break;
    }
  }

  function init() {
    const app = $("gtc-app");
    if (app) {
      app.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-gtc-action]");
        if (!btn || btn.disabled) return;
        aksi(btn);
      });
    }

    const view = $("game-guesscolor-view");
    if (view) {
      view.addEventListener("keydown", (e) => {
        if (e.target && e.target.id === "gtc-code-input" && e.key === "Enter") {
          e.preventDefault();
          ambilKodeInput();
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-gtc-invite-accept]")) {
        e.preventDefault();
        terimaUndangan();
      } else if (e.target.closest("[data-gtc-invite-decline]")) {
        e.preventDefault();
        tolakUndangan();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!state.user) return;
      if (document.visibilityState === "visible") {
        kirimPresence(state.room && state.room.status === "playing" ? "playing" : "idle");
      }
    });

    window.addEventListener("pagehide", () => {
      if (!state.user) return;
      db.collection(PLAYERS).doc(myAbsen()).set({
        online: false,
        lastSeen: Date.now(),
      }, { merge: true }).catch(() => {});
    });

    window.gtcBuka = buka;
    window.gtcTutup = tutup;
    window.gtcAkunBerubah = akunBerubah;

    setTimeout(() => {
      akunBerubah(getCurrentUser());
    }, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
