(function () {
  "use strict";
  if (window.HauntedDorm) return;

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const MW = 14;
  const MH = 22;
  const T = 30;
  const WORLD_W = MW * T;
  const WORLD_H = MH * T;
  const KAPASITAS = 8;
  const MALAM_DETIK = 300;
  const PREP_DETIK = 30;
  const JEDA_HANTU = 0;
  const COL_REKOR = "haunted";
  const COL_ROOM = "hauntedRooms";
  const VOX_ANG = 16;
  const VOX_FRM = 4;
  const VOX_BAYANG = 0.24;
  const voxCache = new Map();
  const REKOR_KEY = "kelas73-haunted-ringkas";
  const PREFS_KEY = "kelas73-haunted-prefs";
  const TUTOR_KEY = "kelas73-haunted-tutor";

  const WALL = 1;
  const LOR = 2;
  const ROOM = 3;
  const PINTU = 4;

  const WARNA_SLOT = ["#4f8f68", "#6f9a52", "#4f8f98", "#a08a4a", "#7679a8", "#a26666", "#5f9a86", "#8a6f9e"];
  const NAMA_BOT = ["Bima", "Nadia", "Raka", "Sinta", "Dewa", "Laras", "Fajar", "Kirana"];
  const KEPRIBADIAN = ["rajin", "rajin", "normal", "normal", "normal", "kalem"];
  const NAMA_HANTU = ["Bandage Man", "Big Head", "Red Girl", "Pink Auntie", "Speedy Drifter", "Kuntilanak"];
  const DOOR_TIER = ["Kayu", "Besi", "Baja", "Vibranium"];
  const DOOR_HP = [
    [160, 200, 240],
    [300, 375, 450],
    [480, 600, 720],
    [760, 950, 1140],
  ];
  const BED_INCOME = [0, 4, 8, 16, 32, 64, 128, 256, 512];
  const BED_UP = [0, 30, 55, 90, 160, 280, 480, 800, 0];
  const GRAVE_INCOME = [0, 1, 2, 4];
  const GRAVE_UP = [0, 45, 90, 160];
  const KONSOL_ENERGI = [0, 1, 2, 3];
  const KONSOL_UP = [0, 50, 110, 200];
  const TURRET_NAMA = ["", "Sapu", "Sekop", "Selang", "Bubble"];
  const TURRET_DMG = [0, 9, 15, 23, 33];
  const TURRET_CD = [0, 0.7, 0.65, 0.6, 0.55];
  const TURRET_RANGE = [0, 3.4, 3.7, 4.0, 4.4];

  /* ================= PETA ASRAMA (REPLIKA VERTIKAL) ================= */
  // Koridor vertikal di tengah (x=6,7), 4 kamar kiri + 4 kamar kanan.
  // Tiap kamar 4x4 dengan kasur/kuburan/konsol di baris atas dan pintu ke koridor.
  const ROOM_DEFS = [];
  (function susunKamar() {
    for (let i = 0; i < 4; i++) {
      const y0 = 1 + i * 4;
      ROOM_DEFS.push({
        slot: i,
        x0: 1,
        y0,
        sisi: "kiri",
        doorX: 5,
        doorY: y0 + 2,
        corridorX: 6,
        bedX: 1,
        bedY: y0,
        graveX: 2,
        graveY: y0,
        konsolX: 3,
        konsolY: y0,
        spawnX: 2.5,
        spawnY: y0 + 2.9,
      });
    }
    for (let i = 0; i < 4; i++) {
      const y0 = 1 + i * 4;
      ROOM_DEFS.push({
        slot: 4 + i,
        x0: 9,
        y0,
        sisi: "kanan",
        doorX: 8,
        doorY: y0 + 2,
        corridorX: 7,
        bedX: 9,
        bedY: y0,
        graveX: 10,
        graveY: y0,
        konsolX: 11,
        konsolY: y0,
        spawnX: 10.5,
        spawnY: y0 + 2.9,
      });
    }
  })();

  function buatGrid() {
    const g = [];
    for (let y = 0; y < MH; y++) g.push(new Array(MW).fill(WALL));
    // Koridor vertikal
    for (let y = 1; y <= MH - 2; y++) {
      g[y][6] = LOR;
      g[y][7] = LOR;
    }
    // Aula bawah tempat hantu masuk/ mundur
    for (let y = 17; y <= MH - 2; y++) {
      for (let x = 4; x <= 9; x++) g[y][x] = LOR;
    }
    for (const r of ROOM_DEFS) {
      for (let y = r.y0; y < r.y0 + 4; y++) {
        for (let x = r.x0; x < r.x0 + 4; x++) g[y][x] = ROOM;
      }
      g[r.doorY][r.doorX] = PINTU;
    }
    return g;
  }
  const GRID = buatGrid();

  function tipeAt(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return WALL;
    return GRID[y][x];
  }

  function kamarPada(slot) {
    return ROOM_DEFS[slot] || ROOM_DEFS[0];
  }

  function kamarDariTile(x, y) {
    for (const r of ROOM_DEFS) {
      if (x >= r.x0 && x < r.x0 + 4 && y >= r.y0 && y < r.y0 + 4) return r.slot;
    }
    return -1;
  }

  function tileKasur(r, x, y) {
    return x === r.bedX && y === r.bedY;
  }

  function tileFurnitur(r, x, y) {
    return (
      (x === r.bedX && y === r.bedY) ||
      (x === r.graveX && y === r.graveY) ||
      (x === r.konsolX && y === r.konsolY)
    );
  }

  function tileTambang(r) {
    return [
      { x: r.x0 + 3, y: r.y0 },
      { x: r.x0 + 3, y: r.y0 + 3 },
      { x: r.x0, y: r.y0 + 3 },
    ];
  }

  function tileBengkel(r) {
    return { x: r.x0 + 1, y: r.y0 + 3 };
  }

  function tileBolehTurret(room, x, y) {
    if (tileFurnitur(room.def, x, y)) return false;
    const b = tileBengkel(room.def);
    if (b.x === x && b.y === y) return false;
    for (const p of tileTambang(room.def)) {
      if (p.x === x && p.y === y) return false;
    }
    return true;
  }

  function tilePintu(x, y) {
    for (const r of ROOM_DEFS) {
      if (x === r.doorX && y === r.doorY) return r.slot;
    }
    return -1;
  }

  /* ================= UTIL ================= */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, f) => a + (b - a) * f;
  const fmtWaktu = (detik) => {
    const d = Math.max(0, Math.ceil(detik));
    const m = Math.floor(d / 60);
    const s = d % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const acakDari = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ================= AKUN & DATABASE ================= */
  function akun() {
    try {
      return window.currentUser || (typeof currentUser !== "undefined" ? currentUser : null);
    } catch (e) {
      return null;
    }
  }

  function absenAkun() {
    const u = akun();
    const n = u && Number(u.absen);
    return Number.isInteger(n) && n >= 1 && n <= 64 ? n : 0;
  }

  function namaAkun() {
    const u = akun();
    if (!u) return "Guest";
    return String(u.namaPanggilan || u.namaLengkap || "Pemain").trim().slice(0, 30) || "Pemain";
  }

  function dbAman() {
    try { if (typeof db !== "undefined" && db) return db; } catch (e) { /* lanjut */ }
    if (window.db) return window.db;
    if (window.firebase && typeof window.firebase.firestore === "function") return window.firebase.firestore();
    return null;
  }

  let SFX_ON = true;

  function muatPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (raw && typeof raw.sfx === "boolean") SFX_ON = raw.sfx;
    } catch (e) { /* ignore */ }
  }

  function simpanPrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sfx: SFX_ON }));
    } catch (e) { /* ignore */ }
  }

  /* ================= REKOR ================= */
  function rekorKosong() {
    return { bestTime: 0, wins: 0, games: 0, bestGold: 0 };
  }

  function normalRekor(d) {
    if (!d || typeof d !== "object") return rekorKosong();
    return {
      bestTime: clamp(Number(d.bestTime) || 0, 0, MALAM_DETIK),
      wins: Math.max(0, Number(d.wins) || 0),
      games: Math.max(0, Number(d.games) || 0),
      bestGold: Math.max(0, Number(d.bestGold) || 0),
    };
  }

  function muatRekor() {
    try {
      const raw = JSON.parse(localStorage.getItem(REKOR_KEY) || "null");
      if (!raw) return rekorKosong();
      return normalRekor(raw);
    } catch (e) {
      return rekorKosong();
    }
  }

  function simpanRingkas(hasil) {
    try {
      localStorage.setItem(
        REKOR_KEY,
        JSON.stringify({
          absen: absenAkun(),
          bestTime: hasil.bestTime,
          wins: hasil.wins,
          games: hasil.games,
          bestGold: hasil.bestGold,
        })
      );
    } catch (e) { /* ignore */ }
  }

  async function simpanRekorServer(detik, gold, menang) {
    const a = absenAkun();
    const db = dbAman();
    const lama = muatRekor();
    const baru = {
      bestTime: Math.max(lama.bestTime, clamp(Math.floor(detik), 0, MALAM_DETIK)),
      wins: lama.wins + (menang ? 1 : 0),
      games: lama.games + 1,
      bestGold: Math.max(lama.bestGold, Math.floor(gold)),
    };
    simpanRingkas(baru);
    if (!a || !db) return { ok: false, alasan: "guest", rekor: baru };
    try {
      const ref = db.collection(COL_REKOR).doc(String(a));
      const kotak = { hasil: null };
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const server = snap.exists ? normalRekor(snap.data()) : null;
        const dasar = server
          ? {
              bestTime: Math.max(server.bestTime, lama.bestTime),
              wins: Math.max(server.wins, lama.wins),
              games: Math.max(server.games, lama.games),
              bestGold: Math.max(server.bestGold, lama.bestGold),
            }
          : lama;
        const payload = {
          absen: a,
          name: namaAkun(),
          bestTime: Math.max(dasar.bestTime, Math.floor(detik)),
          wins: dasar.wins + (menang ? 1 : 0),
          games: dasar.games + 1,
          bestGold: Math.max(dasar.bestGold, Math.floor(gold)),
          totalGold: Math.max(dasar.bestGold, Math.floor(gold)),
          createdAt: server && server.createdAt ? server.createdAt : Date.now(),
          updatedAt: Date.now(),
          version: 1,
        };
        tx.set(ref, payload, { merge: true });
        kotak.hasil = normalRekor(payload);
      });
      if (kotak.hasil) simpanRingkas(kotak.hasil);
      return { ok: true, rekor: kotak.hasil || baru };
    } catch (e) {
      return { ok: false, alasan: e && e.code ? e.code : "error", rekor: baru };
    }
  }

  /* ================= MABAR (FIREBASE) ================= */
  const KODE_HURUF = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const mp = {
    kode: "",
    host: false,
    slot: 0,
    nama: "",
    room: null,
    players: new Map(),
    unsubRoom: null,
    unsubPlayers: null,
    seed: 0,
    mulaiAt: 0,
    syncTimer: 0,
    aktif: false,
    sibuk: false,
  };

  function buatKode() {
    let s = "";
    for (let i = 0; i < 5; i++) s += KODE_HURUF[Math.floor(Math.random() * KODE_HURUF.length)];
    return s;
  }

  function pemainUrut() {
    return [...mp.players.values()].sort((a, b) => (Number(a.slot) || 0) - (Number(b.slot) || 0));
  }

  function slotPertamaKosong() {
    const dipakai = new Set([...mp.players.values()].map((p) => Number(p.slot)));
    for (let i = 0; i < KAPASITAS; i++) if (!dipakai.has(i)) return i;
    return -1;
  }

  function hentikanMabar() {
    if (mp.unsubRoom) { try { mp.unsubRoom(); } catch (e) { /* ignore */ } mp.unsubRoom = null; }
    if (mp.unsubPlayers) { try { mp.unsubPlayers(); } catch (e) { /* ignore */ } mp.unsubPlayers = null; }
    if (mp.syncTimer) { clearInterval(mp.syncTimer); mp.syncTimer = 0; }
    mp.aktif = false;
    mp.room = null;
    mp.players.clear();
    mp.kode = "";
    mp.host = false;
    mp.seed = 0;
    mp.mulaiAt = 0;
  }

  function pantauRoom(kode) {
    const db = dbAman();
    if (!db) return;
    if (mp.unsubRoom) { try { mp.unsubRoom(); } catch (e) { /* ignore */ } }
    if (mp.unsubPlayers) { try { mp.unsubPlayers(); } catch (e) { /* ignore */ } }

    mp.unsubRoom = db.collection(COL_ROOM).doc(kode).onSnapshot(
      (snap) => {
        if (!snap.exists) {
          if (mp.aktif) {
            const sisaAbsen = absenAkun();
            if (sisaAbsen) {
              try {
                db.collection(COL_ROOM).doc(kode).collection("players")
                  .doc(String(sisaAbsen)).delete().catch(() => {});
              } catch (e) { /* ignore */ }
            }
            hentikanMabar();
            if (aktif) {
              layar = "menu";
              tampilLayar();
              toast("Room sudah ditutup host.", "bad");
            }
          }
          return;
        }
        const room = snap.data() || {};
        mp.room = room;
        mp.host = Number(room.hostAbsen) === absenAkun();
        if (room.status === "playing" && mp.aktif && !run) {
          mp.seed = Number(room.seed) || 1;
          mp.mulaiAt = Number(room.startAt) || Date.now();
          mulaiMatchMabar();
        } else if (room.status === "lobby" && mp.aktif && run) {
          run = null;
          layar = "lobby";
          tampilLayar();
        } else if (mp.aktif && layar === "lobby") {
          renderLobby();
        }
      },
      () => { /* diamkan, mabar opsional */ }
    );

    mp.unsubPlayers = db.collection(COL_ROOM).doc(kode).collection("players").onSnapshot(
      (snap) => {
        mp.players.clear();
        snap.forEach((doc) => {
          const d = doc.data() || {};
          mp.players.set(String(d.absen || doc.id), d);
        });
        if (aktif && layar === "lobby") renderLobby();
        if (run && run.mode === "mabar") terapkanPemainRemote();
      },
      () => { /* diamkan */ }
    );
  }

  async function buatRoomMabar() {
    const a = absenAkun();
    if (!a) { toast("Login akun kelas dulu buat mabar.", "bad"); return; }
    const db = dbAman();
    if (!db) { toast("Firebase belum siap. Coba lagi sebentar.", "bad"); return; }
    if (mp.sibuk) return;
    mp.sibuk = true;
    try {
      let kode = "";
      for (let i = 0; i < 4; i++) {
        const c = buatKode();
        const snap = await db.collection(COL_ROOM).doc(c).get();
        if (!snap.exists) { kode = c; break; }
      }
      if (!kode) { toast("Gagal bikin kode room. Coba lagi.", "bad"); return; }
      const now = Date.now();
      await db.collection(COL_ROOM).doc(kode).set({
        code: kode,
        hostAbsen: a,
        hostName: namaAkun(),
        status: "lobby",
        seed: 0,
        startAt: 0,
        kapasitas: KAPASITAS,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
      await db.collection(COL_ROOM).doc(kode).collection("players").doc(String(a)).set({
        absen: a,
        name: namaAkun(),
        slot: 0,
        alive: true,
        hp: 100,
        gold: 30,
        energy: 0,
        doorTier: 1,
        doorHp: 160,
        doorLv: 1,
        bedLv: 1,
        graveLv: 1,
        konsolLv: 1,
        tambang: 0,
        bengkel: false,
        turrets: "",
        status: "siap",
        joinedAt: now,
        updatedAt: now,
        version: 1,
      });
      mp.kode = kode;
      mp.slot = 0;
      mp.aktif = true;
      layar = "lobby";
      tampilLayar();
      pantauRoom(kode);
      bunyi("klik");
    } catch (e) {
      toast("Gagal membuat room. Cek koneksi.", "bad");
    } finally {
      mp.sibuk = false;
    }
  }

  async function gabungRoomMabar(kode) {
    const a = absenAkun();
    if (!a) { toast("Login akun kelas dulu buat mabar.", "bad"); return; }
    const k = String(kode || "").trim().toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(k)) { toast("Kode room harus 5 huruf/angka.", "bad"); return; }
    const db = dbAman();
    if (!db) { toast("Firebase belum siap. Coba lagi sebentar.", "bad"); return; }
    if (mp.sibuk) return;
    mp.sibuk = true;
    try {
      const roomSnap = await db.collection(COL_ROOM).doc(k).get();
      if (!roomSnap.exists) { toast("Room tidak ditemukan.", "bad"); return; }
      const room = roomSnap.data() || {};
      if (room.status !== "lobby") { toast("Room sudah mulai bermain.", "bad"); return; }
      const ps = await db.collection(COL_ROOM).doc(k).collection("players").get();
      const dipakai = new Set();
      let punyaDoc = null;
      ps.forEach((doc) => {
        const d = doc.data() || {};
        dipakai.add(Number(d.slot));
        if (Number(d.absen) === a) punyaDoc = d;
      });
      let slot = punyaDoc ? Number(punyaDoc.slot) : -1;
      if (slot < 0) {
        for (let i = 0; i < KAPASITAS; i++) {
          if (!dipakai.has(i)) { slot = i; break; }
        }
      }
      if (slot < 0 || slot >= KAPASITAS) { toast("Room penuh (maksimal 8 pemain).", "bad"); return; }
      const now = Date.now();
      await db.collection(COL_ROOM).doc(k).collection("players").doc(String(a)).set({
        absen: a,
        name: namaAkun(),
        slot,
        alive: true,
        hp: 100,
        gold: 30,
        energy: 0,
        doorTier: 1,
        doorHp: 160,
        doorLv: 1,
        bedLv: 1,
        graveLv: 1,
        konsolLv: 1,
        tambang: 0,
        bengkel: false,
        turrets: "",
        status: "siap",
        joinedAt: now,
        updatedAt: now,
        version: 1,
      });
      mp.kode = k;
      mp.slot = slot;
      mp.aktif = true;
      layar = "lobby";
      tampilLayar();
      pantauRoom(k);
      bunyi("klik");
    } catch (e) {
      toast("Gagal gabung room. Cek koneksi.", "bad");
    } finally {
      mp.sibuk = false;
    }
  }

  async function keluarRoomMabar(silent) {
    const db = dbAman();
    const kode = mp.kode;
    const a = absenAkun();
    const host = mp.host;
    hentikanMabar();
    run = null;
    layar = "mabar";
    tampilLayar();
    if (db && kode) {
      try {
        if (a) await db.collection(COL_ROOM).doc(kode).collection("players").doc(String(a)).delete();
      } catch (e) { /* ignore */ }
      if (host) {
        try { await db.collection(COL_ROOM).doc(kode).delete(); } catch (e) { /* ignore */ }
      }
    }
    if (!silent) toast("Keluar room.");
  }

  async function mulaiRoomMabar() {
    if (!mp.host || mp.sibuk) return;
    const db = dbAman();
    if (!db || !mp.kode) return;
    mp.sibuk = true;
    try {
      const seed = (Math.floor(Math.random() * 900000) + 100000) | 0;
      await db.collection(COL_ROOM).doc(mp.kode).set(
        {
          status: "playing",
          seed,
          startAt: Date.now(),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (e) {
      toast("Gagal memulai. Coba lagi.", "bad");
    } finally {
      mp.sibuk = false;
    }
  }

  async function kembaliKeLobbyMabar() {
    const db = dbAman();
    if (!db || !mp.kode) return;
    try {
      if (mp.host) {
        await db.collection(COL_ROOM).doc(mp.kode).set(
          { status: "lobby", seed: 0, startAt: 0, updatedAt: Date.now() },
          { merge: true }
        );
      }
    } catch (e) { /* ignore */ }
  }

  function kirimStatusMabar() {
    if (!mp.aktif || run == null || !mp.kode) return;
    const db = dbAman();
    const a = absenAkun();
    if (!db || !a) return;
    const r = run.rooms[run.slotLokal];
    if (!r) return;
    const turretStr = r.turrets
      .slice(0, 9)
      .map((t) => `${t.tx}:${t.ty}:${t.lv}`)
      .join(",")
      .slice(0, 96);
    const status = !r.alive ? "gugur" : r.sleeping ? "tidur" : run.ghost && run.ghost.slot === r.slot && run.ghost.state !== "hilang" ? "diserang" : "aman";
    try {
      db.collection(COL_ROOM).doc(mp.kode).collection("players").doc(String(a)).set(
        {
          alive: !!r.alive,
          hp: Math.round(clamp(r.hp, 0, 100)),
          gold: Math.round(clamp(r.gold, 0, 99999)),
          energy: Math.round(clamp(r.energy, 0, 999)),
          doorTier: clamp(r.door.tier + 1, 1, 4),
          doorHp: Math.round(clamp(r.door.hp, 0, r.door.max || 160)),
          doorLv: clamp(r.door.lv, 1, 3),
          bedLv: clamp(r.bedLv, 1, 8),
          graveLv: clamp(r.graveLv, 1, 3),
          konsolLv: clamp(r.konsolLv, 1, 3),
          tambang: clamp(r.tambang.length, 0, 3),
          bengkel: !!r.bengkel,
          turrets: turretStr,
          status,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (e) { /* offline: mabar tetap jalan lokal */ }
  }

  function terapkanPemainRemote() {
    if (!run || run.mode !== "mabar") return;
    for (const p of mp.players.values()) {
      const slot = Number(p.slot);
      const r = run.rooms[slot];
      if (!r || slot === run.slotLokal) continue;
      if (!r.remote) {
        if (!r.bot || Number(p.absen) === absenAkun()) continue;
        r.bot = false;
        r.remote = true;
        r.nama = String(p.name || "Pemain").slice(0, 30);
        r.syncAt = 0;
      }
      // Hanya hitung "masih hidup" kalau perangkat pemain itu benar-benar menulis.
      // Tanpa ini, tulisan status kita sendiri tiap detik ikut menyegarkan semua kamar remote,
      // sehingga pemain yang putus tidak pernah diambil alih bot.
      const cap = Number(p.updatedAt) || 0;
      if (cap && cap === r.remoteAt) continue;
      r.remoteAt = cap;
      r.syncAt = Date.now();
      if (p.alive === false && r.alive) {
        r.alive = false;
        r.hp = 0;
        if (run.rooms[run.slotLokal] && run.rooms[run.slotLokal].alive && slot !== run.slotLokal) {
          toast(`${r.nama} gugur di kamarnya.`, "bad");
        }
      }
      if (r.alive) {
        if (Number.isFinite(Number(p.hp)) && Number(p.hp) < 100) r.hp = clamp(Number(p.hp), 1, 100);
        if (Number.isFinite(Number(p.gold))) r.gold = clamp(Number(p.gold), 0, 99999);
        if (Number.isFinite(Number(p.energy))) r.energy = clamp(Number(p.energy), 0, 999);
        const tier = clamp(Math.round(Number(p.doorTier) || 1), 1, 4) - 1;
        const lv = clamp(Math.round(Number(p.doorLv) || 1), 1, 3);
        r.door.tier = tier;
        r.door.lv = lv;
        r.door.max = DOOR_HP[tier][lv - 1];
        if (Number(p.doorHp) > 0) {
          r.door.ada = true;
          r.door.hp = clamp(Number(p.doorHp), 1, r.door.max);
        } else if (Number(p.doorHp) <= 0) {
          r.door.ada = false;
          r.door.hp = 0;
        }
        r.bedLv = clamp(Math.round(Number(p.bedLv) || 1), 1, 8);
        r.graveLv = clamp(Math.round(Number(p.graveLv) || 1), 1, 3);
        r.konsolLv = clamp(Math.round(Number(p.konsolLv) || 1), 1, 3);
        r.bengkel = !!p.bengkel;
        const nTambang = clamp(Math.round(Number(p.tambang) || 0), 0, 3);
        if (r.tambang.length !== nTambang) {
          r.tambang = [];
          for (let i = 0; i < nTambang; i++) r.tambang.push(i);
        }
        r.sleeping = p.status === "tidur";
        if (typeof p.turrets === "string") {
          const arr = [];
          p.turrets.split(",").forEach((it) => {
            const bag = it.split(":").map(Number);
            if (bag.length === 3 && bag.every((n) => Number.isFinite(n))) {
              const tx = clamp(Math.round(bag[0]), 0, MW - 1);
              const ty = clamp(Math.round(bag[1]), 0, MH - 1);
              const lv2 = clamp(Math.round(bag[2]), 1, 4);
              if (arr.length < 9) arr.push({ tx, ty, lv: lv2, cd: 0, arah: 0 });
            }
          });
          r.turrets = arr;
        }
      }
    }
  }

  /* ================= STATE ================= */
  let aktif = false;
  let canvas = null;
  let ctx = null;
  let raf = 0;
  let lastT = 0;
  let uiClock = 0;
  let hudClock = 0;
  let layar = "menu";
  let run = null;
  let petaBeku = null;
  let petaBekuPad = 34;
  const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };
  const keys = new Set();
  const stick = { x: 0, y: 0, aktif: false, id: null, cx: 0, cy: 0 };
  const hover = { x: -1, y: -1, tampil: false };
  let joystickEl = null;
  let knobEl = null;
  let toastTimer = 0;
  let hudSig = "";
  let flashToastGate = 0;

  function toast(teks, jenis) {
    const el = $("hd-toast");
    if (!el) return;
    el.textContent = teks;
    el.className = "hd-toast is-show" + (jenis === "bad" ? " is-bad" : jenis === "good" ? " is-good" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = "hd-toast" + (jenis === "bad" ? " is-bad" : jenis === "good" ? " is-good" : "");
    }, 2400);
  }

  function kilat(teks, jenis) {
    const el = $("hd-flash");
    if (!el) return;
    el.textContent = teks;
    el.className = "hd-flash" + (jenis ? " is-" + jenis : "");
    void el.offsetWidth;
    el.classList.add("is-show");
  }

  function getar(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }

  /* ================= AUDIO ================= */
  let audioCtx = null;

  function bunyi(jenis) {
    if (!SFX_ON) return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const peta = {
        klik: [520, 0.05, "triangle", 0.05],
        koin: [880, 0.08, "sine", 0.05],
        bangun: [330, 0.12, "square", 0.045],
        pintu: [180, 0.1, "sawtooth", 0.05],
        hantu: [130, 0.16, "sawtooth", 0.055],
        stun: [620, 0.2, "triangle", 0.06],
        menang: [740, 0.3, "sine", 0.06],
        kalah: [110, 0.35, "sawtooth", 0.06],
        senter: [980, 0.07, "sine", 0.04],
      };
      const p = peta[jenis] || peta.klik;
      osc.type = p[2];
      osc.frequency.setValueAtTime(p[0], t0);
      if (jenis === "menang") osc.frequency.setValueAtTime(1040, t0 + 0.16);
      if (jenis === "kalah") osc.frequency.setValueAtTime(70, t0 + 0.18);
      if (jenis === "stun") osc.frequency.setValueAtTime(920, t0 + 0.08);
      gain.gain.setValueAtTime(p[3], t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + p[1] + 0.06);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + p[1] + 0.08);
    } catch (e) { /* ignore */ }
  }

  /* ================= ATURAN MAIN ================= */
  const HARGA = {
    turret: 25,
    turretUp: [0, 40, 70, 110],
    perbaiki: 15,
    tambang: 60,
    bengkel: 80,
  };
  const RANGE_SENTER = 4.6;
  const MAKS_TURRET = 9;
  const MAKS_TAMBANG = 3;
  const CEPAT_PEMAIN = 3.3;

  function tutorSudahSelesai() {
    try { return localStorage.getItem(TUTOR_KEY) === "1"; } catch (e) { return false; }
  }

  function simpanTutorSelesai() {
    try { localStorage.setItem(TUTOR_KEY, "1"); } catch (e) { /* ignore */ }
  }

  function buatKamar(slot, nama, bot, remote) {
    const def = kamarPada(slot);
    return {
      slot,
      def,
      nama: nama || `Kamar ${slot + 1}`,
      bot: !!bot,
      remote: !!remote,
      warna: WARNA_SLOT[slot],
      alive: true,
      hp: 100,
      gold: 30,
      energy: 0,
      goldTotal: 0,
      sleeping: false,
      door: { ada: true, tier: 0, lv: 1, hp: DOOR_HP[0][0], max: DOOR_HP[0][0], goyang: 0 },
      bedLv: 1,
      graveLv: 1,
      konsolLv: 1,
      tambang: [],
      bengkel: false,
      turrets: [],
      player: {
        x: def.spawnX,
        y: def.spawnY,
        arah: def.sisi === "kiri" ? 0 : Math.PI,
        moving: false,
        bob: 0,
        hurt: 0,
      },
      flashCd: 0,
      ai: { tick: 0.6, cekatan: 0.85 + Math.random() * 0.3, niatTidur: 0 },
      syncAt: 0,
      remoteAt: 0,
      statusTeks: "",
      hitung: 0,
      energiTick: 0,
    };
  }

  function buatRun(mode, seed, mulaiAt) {
    const rng = acakDari(seed || 1);
    const lokal = mode === "mabar" ? clamp(Number(mp.slot) || 0, 0, KAPASITAS - 1) : 0;
    const namaBot = NAMA_BOT.slice();
    for (let i = namaBot.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = namaBot[i];
      namaBot[i] = namaBot[j];
      namaBot[j] = tmp;
    }
    const rooms = [];
    for (let slot = 0; slot < KAPASITAS; slot++) {
      let nama = "";
      let bot = true;
      let remote = false;
      if (slot === lokal) {
        nama = namaAkun();
        bot = false;
      } else if (mode === "mabar") {
        const p = [...mp.players.values()].find((x) => Number(x.slot) === slot);
        if (p && Number(p.absen) !== absenAkun()) {
          nama = String(p.name || "Pemain").slice(0, 30);
          bot = false;
          remote = true;
        }
      }
      if (!nama) nama = namaBot.pop() || `Bot ${slot + 1}`;
      rooms.push(buatKamar(slot, nama, bot, remote));
    }
    const now = Date.now();
    const t0 = mode === "mabar" && mulaiAt ? (now - mulaiAt) / 1000 : 0;
    const tutor = {
      langkah: 0,
      selesai: tutorSudahSelesai(),
      turret: false,
      tidur: false,
      kasur: false,
      pintu: false,
      tambang: false,
    };
    const namaHantu = NAMA_HANTU[Math.floor(rng() * NAMA_HANTU.length)] || NAMA_HANTU[0];
    return {
      mode,
      seed: seed || 1,
      rng,
      _absen: absenAkun(),
      t: clamp(t0 - PREP_DETIK, -PREP_DETIK, MALAM_DETIK),
      mulaiEpoch: mulaiAt || now,
      rooms,
      slotLokal: lokal,
      ghost: {
        nama: namaHantu,
        level: 1,
        hp: 650,
        maxHp: 650,
        x: 6.5,
        y: 1.6,
        arah: Math.PI / 2,
        state: "tunggu",
        timer: 0,
        visible: false,
        slot: -1,
        slotTerakhir: -1,
        path: null,
        pathI: 0,
        stagger: 0,
        staggerIdle: 99,
        stunT: 0,
        atkCd: 0,
        pathCd: 0,
        pukulT: 0,
        kejarT: 0,
        pijak: 0,
        buffT: 0,
        buffJenis: "",
        skillT: 20,
        kaburMaxT: 0,
        kaburLagi: 0,
      },
      fx: [],
      over: false,
      menang: false,
      tutor,
      goldTotal: 0,
      doorRusak: 0,
      stunHantu: 0,
      hantuKalah: 0,
      hpKena: 0,
      mulaiBunyi: false,
      syncAt: 0,
      hasil: null,
    };
  }

  function gulirKePapan() {
    const app = $("hd-app");
    if (app && app.scrollIntoView) app.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function mulaiSolo() {
    if (run && !run.over) return;
    hentikanMabar();
    run = buatRun("solo", (Math.random() * 1e9) | 0, 0);
    layar = "play";
    tampilLayar();
    gulirKePapan();
    lastT = 0;
    toast("Persiapan 30 detik. Bangun turret, naikkan kasur, tidur untuk menabung!");
    bunyi("klik");
  }

  function mulaiMatchMabar() {
    if (run) return;
    run = buatRun("mabar", mp.seed || 1, mp.mulaiAt);
    layar = "play";
    tampilLayar();
    gulirKePapan();
    terapkanPemainRemote();
    lastT = 0;
    toast("Mabar dimulai! Persiapan 30 detik sebelum Dream Hunter datang.");
    kilat("MABAR DIMULAI", "green");
    if (mp.syncTimer) clearInterval(mp.syncTimer);
    mp.syncTimer = setInterval(kirimStatusMabar, 1000);
    kirimStatusMabar();
  }

  /* ================= GERAK & KAMAR ================= */
  function kenaKasur(room, x, y) {
    const d = room.def;
    const r = 0.24;
    const tiles = [
      [d.bedX, d.bedY],
      [d.graveX, d.graveY],
      [d.konsolX, d.konsolY],
    ];
    for (const [tx, ty] of tiles) {
      if (x > tx + 0.06 - r && x < tx + 0.94 + r && y > ty + 0.06 - r && y < ty + 0.94 + r) return true;
    }
    return false;
  }

  function gerakKamar(room, nx, ny) {
    const d = room.def;
    const p = room.player;
    const minX = d.x0 + 0.28;
    const maxX = d.x0 + 3.72;
    const minY = d.y0 + 0.28;
    const maxY = d.y0 + 3.72;
    const cx = clamp(nx, minX, maxX);
    if (!kenaKasur(room, cx, p.y)) p.x = cx;
    const cy = clamp(ny, minY, maxY);
    if (!kenaKasur(room, p.x, cy)) p.y = cy;
  }

  function hantuDalamKamar(room) {
    if (!run || !run.ghost.visible) return false;
    const g = run.ghost;
    if (g.state === "hilang" || g.state === "kabur") return false;
    const d = room.def;
    return g.x >= d.x0 - 0.2 && g.x <= d.x0 + 4.2 && g.y >= d.y0 - 0.2 && g.y <= d.y0 + 4.2;
  }

  function diPintuKamar(room) {
    if (!run || !run.ghost.visible) return false;
    const g = run.ghost;
    return g.slot === room.slot && (g.state === "pukul" || g.state === "masuk");
  }

  function cariJalur(sx, sy, tx, ty, bisa) {
    sx = clamp(Math.round(sx), 0, MW - 1);
    sy = clamp(Math.round(sy), 0, MH - 1);
    tx = clamp(Math.round(tx), 0, MW - 1);
    ty = clamp(Math.round(ty), 0, MH - 1);
    const total = MW * MH;
    const start = sy * MW + sx;
    const goal = ty * MW + tx;
    if (!bisa(tx, ty) && goal !== start) return null;
    const prev = new Int32Array(total).fill(-1);
    const seen = new Uint8Array(total);
    const q = [start];
    seen[start] = 1;
    let ketemu = start === goal;
    for (let qi = 0; qi < q.length && !ketemu; qi++) {
      const cur = q[qi];
      const cx = cur % MW;
      const cy = (cur / MW) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (!bisa(nx, ny)) continue;
        const ni = ny * MW + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        if (ni === goal) { ketemu = true; break; }
        q.push(ni);
      }
    }
    if (!ketemu) return null;
    const jalur = [];
    let c = goal;
    let aman = 0;
    while (c !== start && aman++ < total) {
      jalur.push({ x: c % MW, y: (c / MW) | 0 });
      c = prev[c];
      if (c < 0) return null;
    }
    jalur.reverse();
    return jalur;
  }

  function hantuBoleh(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return false;
    const t = GRID[y][x];
    if (t === WALL) return false;
    if (t === PINTU) {
      const slot = tilePintu(x, y);
      return slot >= 0 && run && run.rooms[slot] && !run.rooms[slot].door.ada;
    }
    if (t === ROOM) {
      const slot = kamarDariTile(x, y);
      if (slot >= 0 && tileFurnitur(ROOM_DEFS[slot], x, y)) return false;
    }
    return true;
  }

  /* ================= EKONOMI & AKSI KAMAR ================= */
  function tambahUang(room, n) {
    if (!room || !room.alive) return;
    room.gold = clamp(room.gold + n, 0, 99999);
    room.goldTotal += n;
    if (run && room.slot === run.slotLokal) run.goldTotal += n;
  }

  function tambahEnergi(room, n) {
    room.energy = clamp(room.energy + n, 0, 999);
  }

  function belanja(room, n) {
    if (room.gold < n) return false;
    room.gold -= n;
    return true;
  }

  function tandaiTutor(room, kunci) {
    if (!run || !run.tutor || run.tutor.selesai) return;
    if (room.slot !== run.slotLokal) return;
    if (run.tutor[kunci]) return;
    run.tutor[kunci] = true;
    const urut = ["turret", "tidur", "kasur", "pintu", "tambang"];
    while (run.tutor.langkah < urut.length && run.tutor[urut[run.tutor.langkah]]) run.tutor.langkah += 1;
    if (run.tutor.langkah >= urut.length) {
      run.tutor.selesai = true;
      simpanTutorSelesai();
      toast("Tutorial selesai! Kamar siap dipertahankan sampai pagi.", "good");
    }
  }

  function infoPintu(room) {
    const d = room.door;
    if (!d.ada) return { jenis: "rusak", biaya: 0 };
    if (d.hp < d.max - 0.5) return { jenis: "perbaiki", biaya: HARGA.perbaiki };
    if (d.lv < 3) return { jenis: "naik", biaya: 35 * (d.tier + 1) * d.lv };
    if (d.tier < 3) return { jenis: "tier", biaya: 180 * (d.tier + 1) };
    return { jenis: "max", biaya: 0 };
  }

  function bangunTurret(room, tx, ty) {
    if (!room || !room.alive) return false;
    const d = room.def;
    if (tx < d.x0 || tx > d.x0 + 3 || ty < d.y0 || ty > d.y0 + 3) {
      toast("Turret cuma bisa di kamarmu sendiri.", "bad");
      return false;
    }
    if (!tileBolehTurret(room, tx, ty)) {
      toast("Kasur, kuburan, konsol, tambang, dan bengkel tidak bisa dipasangi turret.");
      return false;
    }
    const ada = room.turrets.find((t) => t.tx === tx && t.ty === ty);
    if (ada) return upTurret(room, ada);
    if (room.turrets.length >= MAKS_TURRET) {
      toast(`Maksimal ${MAKS_TURRET} turret per kamar.`);
      return false;
    }
    if (room.gold < HARGA.turret) {
      toast(`Uang kurang. Turret butuh 💰${HARGA.turret}.`, "bad");
      return false;
    }
    belanja(room, HARGA.turret);
    room.turrets.push({ tx, ty, lv: 1, cd: 0, arah: Math.PI });
    bunyi("bangun");
    tandaiTutor(room, "turret");
    toast("Turret terpasang! Dia menembak Dream Hunter otomatis.", "good");
    return true;
  }

  function upTurret(room, turret) {
    if (turret.lv >= 4) {
      toast("Turret ini sudah level maksimal.");
      return false;
    }
    const biaya = HARGA.turretUp[turret.lv];
    if (room.gold < biaya) {
      toast(`Upgrade turret butuh 💰${biaya}.`, "bad");
      return false;
    }
    belanja(room, biaya);
    turret.lv += 1;
    bunyi("bangun");
    toast(`Turret jadi ${TURRET_NAMA[turret.lv]} level ${turret.lv}!`, "good");
    return true;
  }

  function aksiPintu(room) {
    if (!room || !room.alive) return;
    const d = room.door;
    if (!d.ada) {
      toast("Pintu sudah hancur total dan tidak bisa dibangun ulang. Andalkan turret!", "bad");
      return;
    }
    const info = infoPintu(room);
    if (info.jenis === "max") {
      toast("Pintu sudah level maksimal (Vibranium Lv.3).");
      return;
    }
    if (room.gold < info.biaya) {
      toast(`Butuh 💰${info.biaya} untuk pintu.`, "bad");
      return;
    }
    if (info.jenis === "perbaiki") {
      belanja(room, info.biaya);
      d.hp = Math.min(d.max, d.hp + d.max * 0.4);
      bunyi("pintu");
      toast(`Pintu diperbaiki +${Math.round(d.max * 0.4)} HP.`, "good");
      return;
    }
    belanja(room, info.biaya);
    if (info.jenis === "naik") {
      d.lv += 1;
      d.max = DOOR_HP[d.tier][d.lv - 1];
      d.hp = d.max;
      toast(`Pintu ${DOOR_TIER[d.tier]} Lv.${d.lv} terpasang!`, "good");
    } else {
      d.tier += 1;
      d.lv = 1;
      d.max = DOOR_HP[d.tier][0];
      d.hp = d.max;
      toast(`Pintu naik tingkat: ${DOOR_TIER[d.tier]}!`, "good");
      kilat("PINTU " + DOOR_TIER[d.tier].toUpperCase(), "green");
    }
    bunyi("pintu");
    tandaiTutor(room, "pintu");
  }

  function aksiKasur(room) {
    if (!room || !room.alive) return;
    if (room.sleeping) {
      room.sleeping = false;
      bunyi("klik");
      toast("Bangun dari kasur.");
      return;
    }
    const d = room.def;
    const bx = d.bedX + 0.5;
    const by = d.bedY + 0.7;
    const jarak = Math.hypot(room.player.x - bx, room.player.y - by);
    if (jarak > 2.1) {
      toast("Dekati kasur dulu buat tidur.");
      return;
    }
    room.sleeping = true;
    room.player.moving = false;
    bunyi("klik");
    tandaiTutor(room, "tidur");
    toast(`Tidur: +${BED_INCOME[room.bedLv]} uang/detik. Bangun kalau hantu datang!`);
  }

  function aksiKasurUp(room) {
    if (!room || !room.alive) return;
    if (room.bedLv >= 8) {
      toast("Kasur sudah level maksimal (Gadis Kasur Lv.8).");
      return;
    }
    const biaya = BED_UP[room.bedLv];
    if (room.gold < biaya) {
      toast(`Upgrade kasur butuh 💰${biaya}.`, "bad");
      return;
    }
    belanja(room, biaya);
    room.bedLv += 1;
    bunyi("bangun");
    tandaiTutor(room, "kasur");
    toast(`Kasur level ${room.bedLv}: +${BED_INCOME[room.bedLv]} uang/detik saat tidur.`, "good");
  }

  function aksiKuburan(room) {
    if (!room || !room.alive) return;
    if (room.graveLv >= 3) {
      toast("Kuburan sudah level maksimal.");
      return;
    }
    const biaya = GRAVE_UP[room.graveLv];
    if (room.gold < biaya) {
      toast(`Upgrade kuburan butuh 💰${biaya}.`, "bad");
      return;
    }
    belanja(room, biaya);
    room.graveLv += 1;
    bunyi("bangun");
    toast(`Kuburan level ${room.graveLv}: +${GRAVE_INCOME[room.graveLv]} uang/detik.`, "good");
  }

  function aksiKonsol(room) {
    if (!room || !room.alive) return;
    if (room.konsolLv >= 3) {
      toast("Konsol sudah level maksimal.");
      return;
    }
    const biaya = KONSOL_UP[room.konsolLv];
    if (room.gold < biaya) {
      toast(`Upgrade konsol butuh 💰${biaya}.`, "bad");
      return;
    }
    belanja(room, biaya);
    room.konsolLv += 1;
    bunyi("bangun");
    toast(`Konsol level ${room.konsolLv}: +${KONSOL_ENERGI[room.konsolLv]} energi / 2 detik.`, "good");
  }

  function aksiTambang(room) {
    if (!room || !room.alive) return;
    if (room.tambang.length >= MAKS_TAMBANG) {
      toast("Tambang sudah maksimal (3).");
      return;
    }
    if (room.gold < HARGA.tambang) {
      toast(`Bangun tambang butuh 💰${HARGA.tambang}.`, "bad");
      return;
    }
    belanja(room, HARGA.tambang);
    room.tambang.push(room.tambang.length);
    bunyi("bangun");
    tandaiTutor(room, "tambang");
    toast("Tambang emas dibangun: mengubah energi jadi uang.", "good");
  }

  function aksiBengkel(room) {
    if (!room || !room.alive) return;
    if (room.bengkel) {
      toast("Bengkel sudah ada.");
      return;
    }
    if (room.gold < HARGA.bengkel) {
      toast(`Bangun bengkel butuh 💰${HARGA.bengkel}.`, "bad");
      return;
    }
    belanja(room, HARGA.bengkel);
    room.bengkel = true;
    bunyi("bangun");
    toast("Bengkel berdiri: pintu diperbaiki otomatis 2,5%/detik.", "good");
  }

  function aksiSenter(room) {
    if (!run || !room || !room.alive) return;
    if (room.sleeping) {
      toast("Bangun dulu sebelum pakai senter.");
      return;
    }
    if (room.flashCd > 0) {
      toast("Senter masih dingin sebentar.");
      return;
    }
    const g = run.ghost;
    if (!g.visible || g.state === "hilang") {
      toast("Belum ada hantu di dekatmu.");
      return;
    }
    const dekat = hantuDalamKamar(room) || diPintuKamar(room);
    if (!dekat) {
      toast("Hantu sedang di kamar lain.");
      return;
    }
    const jarak = Math.hypot(g.x - room.player.x, g.y - room.player.y);
    if (jarak > RANGE_SENTER) {
      toast("Terlalu jauh. Dekati hantunya.");
      return;
    }
    room.flashCd = 2.2;
    run.fx.push({ jenis: "sinar", x1: room.player.x, y1: room.player.y - 0.4, x2: g.x, y2: g.y - 0.9, life: 0.22, max: 0.22 });
    tambahStagger(room.slot, 30);
    lukaiHantu(12);
    bunyi("senter");
    getar(18);
  }

  function lukaiHantu(dmg) {
    if (!run) return;
    const g = run.ghost;
    if (!g.visible || g.state === "tunggu" || g.state === "hilang") return;
    g.hp = Math.max(0, g.hp - dmg);
    g.staggerIdle = 0;
    if (g.hp <= 0) {
      g.visible = false;
      run.hantuKalah += 1;
      run.fx.push({ jenis: "teks", x: g.x, y: g.y - 1.4, teks: "DREAM HUNTER KALAH", life: 2, max: 2, warna: "#9cf0bd" });
      bunyi("menang");
      akhiriMatch(true, "hantu");
    }
  }

  function tambahStagger(slotSumber, n) {
    if (!run || !run.ghost.visible) return;
    const g = run.ghost;
    if (g.state === "stun" || g.state === "hilang" || g.state === "kabur") return;
    g.stagger = clamp(g.stagger + n, 0, 100);
    g.staggerIdle = 0;
    if (g.stagger >= 100) {
      g.stagger = 0;
      g.state = "stun";
      g.stunT = 2.8;
      g.path = null;
      run.stunHantu += 1;
      const r = run.rooms[slotSumber];
      if (r && r.alive) {
        tambahUang(r, 12);
      }
      if (slotSumber === run.slotLokal) {
        toast("Hantu terpukul mundur! +12 uang.", "good");
        kilat("HANTU MUNDUR", "green");
      }
      run.fx.push({ jenis: "lingkar", x: g.x, y: g.y - 0.7, r: 0.2, life: 0.5, max: 0.5, warna: "#ffd166" });
      bunyi("stun");
      getar(40);
    }
  }

  function lukaiPemain(room, dmg) {
    if (!room || !room.alive) return;
    const tidur = room.sleeping;
    room.hp = clamp(room.hp - dmg, 0, 100);
    room.sleeping = false;
    room.player.hurt = 0.35;
    room.hitung = (room.hitung || 0) + 1;
    if (room.slot === run.slotLokal) {
      run.hpKena += 1;
      if (tidur) toast("Kamu terbangun! Hantu menyerang.", "bad");
      const hurt = $("hd-hurt");
      if (hurt) {
        hurt.classList.remove("is-show");
        void hurt.offsetWidth;
        hurt.classList.add("is-show");
      }
      getar(60);
      bunyi("hantu");
    }
    if (room.hp <= 0) {
      room.hp = 0;
      room.alive = false;
      room.sleeping = false;
      run.fx.push({ jenis: "teks", x: room.player.x, y: room.player.y - 2, teks: "GUGUR", life: 1.4, max: 1.4, warna: "#ff9a9a" });
      if (room.slot === run.slotLokal) {
        akhiriMatch(false, "gugur");
      } else if (!room.remote) {
        toast(`${room.nama} gugur di kamarnya.`, "bad");
      }
    }
  }

  function perbaruiKamarEkonomi(room, dt) {
    if (!room.alive || room.remote) return;
    if (room.flashCd > 0) room.flashCd = Math.max(0, room.flashCd - dt);
    if (room.door.goyang > 0) room.door.goyang = Math.max(0, room.door.goyang - dt);
    if (room.player.hurt > 0) room.player.hurt = Math.max(0, room.player.hurt - dt);
    if (room.sleeping) {
      if (hantuDalamKamar(room)) {
        room.sleeping = false;
        if (room.slot === run.slotLokal) {
          toast("Hantu masuk! Kamu terbangun.", "bad");
          getar(40);
        }
      } else {
        tambahUang(room, BED_INCOME[room.bedLv] * dt);
      }
    }
    tambahUang(room, GRAVE_INCOME[room.graveLv] * dt);
    if (KONSOL_ENERGI[room.konsolLv] > 0) tambahEnergi(room, KONSOL_ENERGI[room.konsolLv] * 0.5 * dt);
    for (let i = 0; i < room.tambang.length; i++) {
      if (room.energy >= 3 * dt) {
        room.energy -= 3 * dt;
        tambahUang(room, 7 * dt);
      }
    }
    if (room.bengkel && room.door.ada) {
      room.door.hp = Math.min(room.door.max, room.door.hp + room.door.max * 0.025 * dt);
    }
  }

  function gerakPemainLokal(room, dt) {
    if (!room.alive || room.sleeping) return;
    let ix = 0;
    let iy = 0;
    if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
    if (keys.has("d") || keys.has("arrowright")) ix += 1;
    if (keys.has("w") || keys.has("arrowup")) iy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) iy += 1;
    ix += stick.x;
    iy += stick.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    const p = room.player;
    p.moving = len > 0.12;
    if (!p.moving) return;
    p.arah = Math.atan2(iy, ix);
    p.bob += dt * 9.5;
    gerakKamar(room, p.x + ix * CEPAT_PEMAIN * dt, p.y + iy * CEPAT_PEMAIN * dt);
  }

  /* ================= BOT ================= */
  function tileKosongTurret(room) {
    const d = room.def;
    let terbaik = null;
    let jarak = Infinity;
    for (let y = d.y0; y < d.y0 + 4; y++) {
      for (let x = d.x0; x < d.x0 + 4; x++) {
        if (!tileBolehTurret(room, x, y)) continue;
        if (room.turrets.some((t) => t.tx === x && t.ty === y)) continue;
        const j = Math.hypot(x + 0.5 - room.player.x, y + 0.5 - room.player.y);
        if (j < jarak) { jarak = j; terbaik = { x, y }; }
      }
    }
    return terbaik;
  }

  function botBeliTurret(room) {
    if (room.gold < HARGA.turret) return false;
    const slot = tileKosongTurret(room);
    if (!slot) return false;
    belanja(room, HARGA.turret);
    room.turrets.push({ tx: slot.x, ty: slot.y, lv: 1, cd: 0, arah: Math.PI });
    return true;
  }

  function botUpgradeTurret(room) {
    const kandidat = room.turrets.filter((t) => t.lv < 4).sort((a, b) => a.lv - b.lv);
    if (!kandidat.length) return false;
    const t = kandidat[0];
    const biaya = HARGA.turretUp[t.lv];
    if (room.gold < biaya) return false;
    belanja(room, biaya);
    t.lv += 1;
    return true;
  }

  function botPerbaiki(room) {
    if (!room.door.ada) return false;
    if (room.door.hp < room.door.max && room.gold >= HARGA.perbaiki) {
      belanja(room, HARGA.perbaiki);
      room.door.hp = Math.min(room.door.max, room.door.hp + room.door.max * 0.4);
      return true;
    }
    return false;
  }

  function botUpgradePintu(room) {
    const info = infoPintu(room);
    if (info.jenis !== "naik" && info.jenis !== "tier") return false;
    if (room.gold < info.biaya) return false;
    belanja(room, info.biaya);
    const d = room.door;
    if (info.jenis === "naik") {
      d.lv += 1;
    } else {
      d.tier += 1;
      d.lv = 1;
    }
    d.max = DOOR_HP[d.tier][d.lv - 1];
    d.hp = d.max;
    return true;
  }

  function botUpgradeKasur(room) {
    if (room.bedLv >= 8) return false;
    const biaya = BED_UP[room.bedLv];
    if (room.gold < biaya) return false;
    belanja(room, biaya);
    room.bedLv += 1;
    return true;
  }

  function botUpgradeGrave(room) {
    if (room.graveLv >= 3) return false;
    const biaya = GRAVE_UP[room.graveLv];
    if (room.gold < biaya) return false;
    belanja(room, biaya);
    room.graveLv += 1;
    return true;
  }

  function botUpgradeKonsol(room) {
    if (room.konsolLv >= 3) return false;
    const biaya = KONSOL_UP[room.konsolLv];
    if (room.gold < biaya) return false;
    belanja(room, biaya);
    room.konsolLv += 1;
    return true;
  }

  function botBeliTambang(room) {
    if (room.tambang.length >= MAKS_TAMBANG || room.gold < HARGA.tambang) return false;
    belanja(room, HARGA.tambang);
    room.tambang.push(room.tambang.length);
    return true;
  }

  function botBeliBengkel(room) {
    if (room.bengkel || room.gold < HARGA.bengkel) return false;
    belanja(room, HARGA.bengkel);
    room.bengkel = true;
    return true;
  }

  function keputusanBot(room) {
    if (!room.alive) return;
    const g = run.ghost;
    const nyerang = hantuDalamKamar(room);
    const diPintu = diPintuKamar(room);
    if (nyerang) {
      room.sleeping = false;
      if (room.flashCd <= 0 && Math.hypot(g.x - room.player.x, g.y - room.player.y) <= RANGE_SENTER) {
        room.flashCd = 2.2;
        run.fx.push({ jenis: "sinar", x1: room.player.x, y1: room.player.y - 0.4, x2: g.x, y2: g.y - 0.9, life: 0.2, max: 0.2 });
        tambahStagger(room.slot, 24);
        lukaiHantu(10);
      }
      if (room.hp < 50 && room.gold >= HARGA.perbaiki) botPerbaiki(room);
      return;
    }
    if (diPintu) {
      room.sleeping = false;
      if (room.door.hp < room.door.max * 0.65) {
        botPerbaiki(room);
        return;
      }
      if (botUpgradePintu(room)) return;
      if (room.flashCd <= 0 && Math.hypot(g.x - room.player.x, g.y - room.player.y) <= RANGE_SENTER) {
        room.flashCd = 2.2;
        tambahStagger(room.slot, 22);
        lukaiHantu(10);
      }
      return;
    }
    if (room.sleeping) return;
    const rajin = room.ai.cekatan;
    if (room.turrets.length < 2 && botBeliTurret(room)) return;
    if (room.bedLv < 4 && room.gold >= BED_UP[room.bedLv] + 25 && botUpgradeKasur(room)) return;
    if (room.turrets.length < 4 && botBeliTurret(room)) return;
    if (room.graveLv < 3 && room.gold >= GRAVE_UP[room.graveLv] + 25 && botUpgradeGrave(room)) return;
    if (room.konsolLv < 3 && room.gold >= KONSOL_UP[room.konsolLv] + 30 && botUpgradeKonsol(room)) return;
    if (room.tambang.length < MAKS_TAMBANG && room.gold >= HARGA.tambang + 35 && botBeliTambang(room)) return;
    if (!room.bengkel && room.gold >= HARGA.bengkel + 40 && botBeliBengkel(room)) return;
    if (room.turrets.length < MAKS_TURRET && botBeliTurret(room)) return;
    if (rajin > 1 && room.turrets.length && botUpgradeTurret(room)) return;
    if (room.bedLv < 8 && room.gold >= BED_UP[room.bedLv] + 60 && botUpgradeKasur(room)) return;
    room.sleeping = true;
  }

  function perbaruiBot(room, dt) {
    if (!room.alive) return;
    const g = run.ghost;
    const d = room.def;
    const p = room.player;
    const nyerang = hantuDalamKamar(room);
    if (nyerang) room.sleeping = false;
    const ai = room.ai;
    ai.tick -= dt;
    if (nyerang) {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const jarak = Math.hypot(dx, dy) || 1;
      if (jarak < 2.2) {
        let ix = dx / jarak;
        let iy = dy / jarak;
        ix += -iy * 0.55;
        iy += ix * 0.55;
        const l = Math.hypot(ix, iy) || 1;
        ix /= l;
        iy /= l;
        const spd = 2.9;
        const nx = p.x + ix * spd * dt;
        const ny = p.y + iy * spd * dt;
        gerakKamar(room, nx, ny);
        p.arah = Math.atan2(iy, ix);
        p.moving = true;
        p.bob += dt * 9;
      }
    } else {
      p.moving = false;
      if (p.x < d.x0 + 0.6 || p.x > d.x0 + 3.4 || p.y < d.y0 + 0.6 || p.y > d.y0 + 3.4) {
        p.x = clamp(p.x, d.x0 + 0.6, d.x0 + 3.4);
        p.y = clamp(p.y, d.y0 + 0.6, d.y0 + 3.4);
      }
    }
    if (ai.tick <= 0) {
      ai.tick = 0.62 + run.rng() * 0.5 * (1.2 - ai.cekatan * 0.3);
      keputusanBot(room);
    }
  }

  /* ================= TURRET ================= */
  function perbaruiTurret(room, dt) {
    if (!room.alive) return;
    const g = run.ghost;
    for (const t of room.turrets) {
      if (t.cd > 0) t.cd = Math.max(0, t.cd - dt);
      if (!g.visible || g.state === "hilang") continue;
      const targetRoom = g.slot === room.slot;
      if (!targetRoom) continue;
      const jx = g.x - (t.tx + 0.5);
      const jy = g.y - (t.ty + 0.5);
      const jarak = Math.hypot(jx, jy);
      t.arah = Math.atan2(jy, jx);
      if (jarak > TURRET_RANGE[t.lv]) continue;
      if (t.cd > 0) continue;
      t.cd = TURRET_CD[t.lv];
      lukaiHantu(TURRET_DMG[t.lv]);
      run.fx.push({
        jenis: "peluru",
        x1: t.tx + 0.5,
        y1: t.ty + 0.5,
        x2: g.x,
        y2: g.y - 0.9,
        life: 0.16,
        max: 0.16,
      });
    }
  }

  /* ================= DREAM HUNTER ================= */
  function targetBoleh(r) {
    return r.alive && (r.slot === run.slotLokal || r.bot);
  }

  function pilihTargetHantu() {
    const kandidat = run.rooms.filter(targetBoleh);
    if (!kandidat.length) return -1;
    const lokal = kandidat.find((r) => r.slot === run.slotLokal);
    let pilihan = null;
    if (lokal && run.rng() < 0.6) {
      pilihan = lokal;
    } else {
      const lain = kandidat.filter((r) => r.slot !== run.ghost.slotTerakhir);
      const pool = lain.length ? lain : kandidat;
      pilihan = pool[Math.floor(run.rng() * pool.length)];
    }
    return pilihan ? pilihan.slot : -1;
  }

  function tileSerang(room) {
    const d = room.def;
    return { x: d.corridorX, y: d.doorY };
  }

  function munculkanHantu() {
    const g = run.ghost;
    g.visible = true;
    g.stagger = 0;
    g.staggerIdle = 99;
    g.atkCd = 0;
    g.pukulT = 0;
    g.kejarT = 0;
    g.pathCd = 0;
    g.slot = pilihTargetHantu();
    g.slotTerakhir = g.slot;
    if (g.slot < 0) {
      g.visible = false;
      g.state = "hilang";
      g.timer = 3;
      return;
    }
    g.level = clamp(1 + Math.floor(run.t / 40), 1, 9);
    g.maxHp = 650 + (g.level - 1) * 140;
    if (!g.hp || g.hp <= 0) g.hp = g.maxHp;
    g.hp = Math.min(g.hp, g.maxHp);
    const t = tileSerang(run.rooms[g.slot]);
    const dariBawah = t.y > MH / 2;
    g.x = 6.5;
    g.y = (dariBawah ? MH - 3 : 1) + 0.5;
    g.arah = dariBawah ? -Math.PI / 2 : Math.PI / 2;
    g.path = cariJalur(Math.floor(g.x), Math.floor(g.y), t.x, t.y, hantuBoleh);
    g.pathI = 0;
    if (g.path) {
      g.state = "jalan";
    } else {
      g.state = "hilang";
      g.timer = 1.2;
    }
    if (run.t >= 0) kilat("DREAM HUNTER", "red");
    bunyi("hantu");
  }

  function hantuKabur() {
    const g = run.ghost;
    g.state = "kabur";
    g.slot = -1;
    g.pukulT = 0;
    g.kejarT = 0;
    g.path = cariJalur(Math.floor(g.x), Math.floor(g.y), 6, MH - 3, hantuBoleh);
    g.pathI = 0;
    if (!g.path) {
      g.visible = false;
      g.state = "hilang";
      g.timer = 3;
    }
  }

  function ikutiJalur(g, dt, spd) {
    if (!g.path || g.pathI >= g.path.length) return true;
    const wp = g.path[g.pathI];
    const tx = wp.x + 0.5;
    const ty = wp.y + 0.5;
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) g.arah = Math.atan2(dy, dx);
    const step = spd * dt;
    if (d <= step || d < 0.02) {
      g.x = tx;
      g.y = ty;
      g.pathI += 1;
    } else {
      g.x += (dx / d) * step;
      g.y += (dy / d) * step;
    }
    g.pijak += dt;
    return g.pathI >= g.path.length;
  }

  function mulaiHantam(g) {
    const room = run.rooms[g.slot];
    if (!room || !room.alive) { hantuKabur(); return; }
    if (!room.door.ada) { mulaiMasuk(g, room); return; }
    g.state = "pukul";
    g.pukulT = 0;
    const d = room.def;
    g.arah = d.sisi === "kiri" ? Math.PI : 0;
    g.x = d.corridorX + 0.5;
    g.y = d.doorY + 0.5;
    bunyi("pintu");
  }

  function mulaiMasuk(g, room) {
    g.state = "masuk";
    g.kejarT = 0;
    const p = room.player;
    g.path = cariJalur(Math.floor(g.x), Math.floor(g.y), Math.floor(p.x), Math.floor(p.y), hantuBoleh);
    g.pathI = 0;
    g.pathCd = 0;
  }

  function hantamPintu(g, room, dt) {
    g.pukulT += dt;
    const buff = g.buffT > 0 && g.buffJenis === "berserk" ? 1.2 : 1;
    const dps = (14 + 5 * g.level) * buff;
    room.door.hp = Math.max(0, room.door.hp - dps * dt);
    room.door.goyang = 0.18;
    if (Math.floor(g.pukulT * 5) !== Math.floor((g.pukulT - dt) * 5)) {
      const d = room.def;
      run.fx.push({
        jenis: "serpih",
        x: d.doorX + 0.5,
        y: d.doorY + 0.5,
        life: 0.35,
        max: 0.35,
      });
      if (room.slot === run.slotLokal) bunyi("pintu");
    }
    if (room.door.hp <= 0) {
      room.door.hp = 0;
      room.door.ada = false;
      run.doorRusak += 1;
      run.fx.push({ jenis: "teks", x: room.def.doorX + 0.5, y: room.def.doorY + 0.3, teks: "PINTU TEMBUS", life: 1.2, max: 1.2, warna: "#ffcf5c" });
      if (room.slot === run.slotLokal) {
        toast("Pintu kamarmu hancur! Lari atau lawan dengan senter!", "bad");
        kilat("PINTU HANCUR", "red");
        getar([60, 40, 80]);
      }
      bunyi("hantu");
      mulaiMasuk(g, room);
    }
  }

  function kejarPemain(g, room, dt) {
    const p = room.player;
    g.kejarT += dt;
    g.pathCd -= dt;
    if (g.pathCd <= 0 || !g.path) {
      g.pathCd = 0.45;
      const jalan = cariJalur(Math.floor(g.x), Math.floor(g.y), Math.floor(p.x), Math.floor(p.y), hantuBoleh);
      if (jalan) { g.path = jalan; g.pathI = 0; }
    }
    const buff = g.buffT > 0 && g.buffJenis === "berserk";
    const spd = (2.6 + 0.08 * g.level) * (buff ? 1.3 : 1);
    const nyampe = ikutiJalur(g, dt, spd);
    const jarak = Math.hypot(p.x - g.x, p.y - g.y);
    if (nyampe && jarak > 0.9) {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      g.x += (dx / d) * spd * dt;
      g.y += (dy / d) * spd * dt;
      g.arah = Math.atan2(dy, dx);
    }
    if (g.atkCd > 0) g.atkCd = Math.max(0, g.atkCd - dt);
    if (jarak < 0.85 && g.atkCd <= 0) {
      g.atkCd = 1;
      run.fx.push({ jenis: "sinar", x1: g.x, y1: g.y - 1, x2: p.x, y2: p.y - 0.6, life: 0.18, max: 0.18, warna: "#d9f5e8" });
      lukaiPemain(room, (18 + 4 * g.level) * (buff ? 1.2 : 1));
      bunyi("hantu");
    }
  }

  function pakaiSkill(g) {
    g.skillT = 22 + run.rng() * 6;
    const lokal = run.rooms[run.slotLokal];
    if (g.buffJenis !== "kejut" && (g.buffJenis !== "berserk" || g.buffT <= 0)) {
      g.buffJenis = "berserk";
      g.buffT = 9;
      if (lokal && lokal.alive) {
        toast(`${g.nama} mengamuk! Kecepatan dan serangan naik.`, "bad");
        kilat("BERSERK", "red");
      }
    } else {
      g.buffJenis = "kejut";
      g.buffT = 0;
      for (const r of run.rooms) {
        for (const t of r.turrets) t.cd = Math.max(t.cd, 3);
      }
      if (lokal && lokal.alive) {
        toast("KEJUT! Semua turret lumpuh 3 detik.", "bad");
        kilat("TURRET LUMPUH", "red");
      }
      getar([40, 30, 60]);
    }
    bunyi("hantu");
  }

  function perbaruiHantu(dt) {
    const g = run.ghost;
    if (g.state === "tunggu") {
      if (run.t >= 0) munculkanHantu();
      return;
    }
    if (!g.visible) {
      g.timer -= dt;
      if (g.timer <= 0) munculkanHantu();
      return;
    }
    if (g.state === "stun") {
      g.stunT -= dt;
      if (g.stunT <= 0) {
        g.stagger = 0;
        hantuKabur();
      }
      return;
    }
    if (g.state === "hilang") {
      g.timer -= dt;
      if (g.timer <= 0) munculkanHantu();
      return;
    }
    g.staggerIdle += dt;
    if (g.staggerIdle > 1.2 && g.stagger > 0) {
      g.stagger = Math.max(0, g.stagger - 13 * dt);
    }
    if (g.buffT > 0) g.buffT = Math.max(0, g.buffT - dt);
    g.skillT -= dt;
    if (g.skillT <= 0 && run.t > 22) pakaiSkill(g);
    const room = g.slot >= 0 ? run.rooms[g.slot] : null;
    if (g.state !== "kabur" && (!room || !room.alive)) {
      hantuKabur();
      return;
    }
    if (g.state === "kabur") {
      const nyampe = ikutiJalur(g, dt, 3.4);
      if (nyampe) {
        g.visible = false;
        g.state = "hilang";
        g.timer = 2.4;
        if (g.kaburMaxT > 0) {
          g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.35);
          g.kaburMaxT = 0;
          g.kaburLagi = run.t + 40;
          toast(`${g.nama} mundur dan memulihkan diri...`, "bad");
        }
      }
      return;
    }
    if (g.hp > 0 && g.hp < g.maxHp * 0.15 && run.t > g.kaburLagi) {
      g.kaburMaxT = 1;
      kilat("HANTU MUNDUR", "green");
      const lokal = run.rooms[run.slotLokal];
      if (lokal && lokal.alive) toast("Dream Hunter mundur untuk memulihkan diri!", "good");
      hantuKabur();
      return;
    }
    if (g.state === "jalan") {
      const buff = g.buffT > 0 && g.buffJenis === "berserk" ? 1.25 : 1;
      const nyampe = ikutiJalur(g, dt, (2.55 + 0.07 * g.level) * buff);
      if (nyampe) mulaiHantam(g);
      return;
    }
    if (g.state === "pukul") {
      if (!room.door.ada) { mulaiMasuk(g, room); return; }
      hantamPintu(g, room, dt);
      return;
    }
    if (g.state === "masuk" || g.state === "kejar") {
      if (g.state === "masuk" && (!g.path || g.pathI >= g.path.length || g.pathCd <= 0)) {
        g.state = "kejar";
      }
      kejarPemain(g, room, dt);
      return;
    }
  }

  /* ================= UPDATE UTAMA ================= */
  function update(dt) {
    if (!run || run.over) return;
    run.t += dt;
    if (run.t < 0) {
      if (!run.mulaiPersiapan) {
        run.mulaiPersiapan = true;
        kilat("PERSIAPAN", "green");
        toast("30 detik persiapan: bangun turret, naikkan kasur, lalu tidur!");
      }
    } else if (run.t >= MALAM_DETIK) {
      akhiriMatch(true, "pagi");
      return;
    }
    if (!run.mulaiBunyi && run.t > 0.3) {
      run.mulaiBunyi = true;
      if (run.mode === "mabar") kilat("MALAM DIMULAI", "red");
      else kilat("MALAM DIMULAI", "red");
    }
    for (const room of run.rooms) {
      perbaruiKamarEkonomi(room, dt);
      if (!room.alive) continue;
      if (room.slot === run.slotLokal) {
        gerakPemainLokal(room, dt);
      } else if (room.bot) {
        perbaruiBot(room, dt);
      }
      perbaruiTurret(room, dt);
    }
    const g = run.ghost;
    if (g.visible && run.t >= 0) {
      const target = clamp(1 + Math.floor(run.t / 40), 1, 9);
      if (target > g.level) {
        const naik = target - g.level;
        g.level = target;
        g.maxHp = 650 + (g.level - 1) * 140;
        g.hp = Math.min(g.maxHp, g.hp + 140 * naik);
        const lokal = run.rooms[run.slotLokal];
        if (lokal && lokal.alive) {
          toast(`${g.nama} naik ke LV.${g.level}!`, "bad");
          kilat("HANTU LV." + g.level, "red");
        }
      }
    }
    perbaruiHantu(dt);
    perbaruiEfek(dt);
    if (run.mode === "mabar") {
      const now = Date.now();
      for (const room of run.rooms) {
        if (room.remote && room.syncAt && now - room.syncAt > 5000) {
          room.remote = false;
          room.bot = true;
          room.nama += " (bot)";
          toast(`${room.nama} terputus, kamarnya diambil bot.`, "bad");
        }
      }
    }
  }

  /* ================= EFEK ================= */
  function perbaruiEfek(dt) {
    if (!run) return;
    const fx = run.fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life -= dt;
      if (f.life <= 0) fx.splice(i, 1);
    }
    if (fx.length > 90) fx.splice(0, fx.length - 90);
  }

  /* ================= VOXEL 3D ================= */
  function vxRgb(warna, f) {
    const s = String(warna || "#888888").trim();
    const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    let r;
    let g;
    let b;
    if (m) {
      r = Number(m[1]);
      g = Number(m[2]);
      b = Number(m[3]);
    } else {
      let h = s.replace("#", "");
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
    if (!isFinite(r)) r = 136;
    if (!isFinite(g)) g = 136;
    if (!isFinite(b)) b = 136;
    if (f >= 0) {
      r += (255 - r) * f;
      g += (255 - g) * f;
      b += (255 - b) * f;
    } else {
      r *= 1 + f;
      g *= 1 + f;
      b *= 1 + f;
    }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function vxB(x0, x1, y0, y1, z0, z1, c) {
    return { x0, x1, y0, y1, z0, z1, c, atas: vxRgb(c, 0.34), gelap: vxRgb(c, -0.3) };
  }

  function voxTitik(x, y, z, cos, sin) {
    const rx = x * cos - z * sin;
    const rz = x * sin + z * cos;
    return [rx, -y + rz * VOX_BAYANG];
  }

  function voxWajah(g, pts, c, cos, sin) {
    g.fillStyle = c;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const q = voxTitik(pts[i][0], pts[i][1], pts[i][2], cos, sin);
      if (i === 0) g.moveTo(q[0], q[1]);
      else g.lineTo(q[0], q[1]);
    }
    g.closePath();
    g.fill();
  }

  function voxGambar(g, kotak, cos, sin) {
    const urut = [];
    for (const b of kotak) {
      const rz = ((b.x0 + b.x1) / 2) * sin + ((b.z0 + b.z1) / 2) * cos;
      urut.push({ b, rz });
    }
    urut.sort((a, c) => a.rz - c.rz);
    for (const it of urut) {
      const b = it.b;
      voxWajah(g, [[b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]], b.atas, cos, sin);
      if (cos >= 0) voxWajah(g, [[b.x0, b.y0, b.z1], [b.x1, b.y0, b.z1], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]], b.c, cos, sin);
      else voxWajah(g, [[b.x1, b.y0, b.z0], [b.x0, b.y0, b.z0], [b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0]], b.gelap, cos, sin);
      if (sin < 0) voxWajah(g, [[b.x1, b.y0, b.z1], [b.x1, b.y0, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1]], b.gelap, cos, sin);
      else voxWajah(g, [[b.x0, b.y0, b.z0], [b.x0, b.y0, b.z1], [b.x0, b.y1, b.z1], [b.x0, b.y1, b.z0]], b.gelap, cos, sin);
    }
  }

  function voxGambarLangsung(g, kotak, xPx, yPx, skala, arah) {
    const cos = Math.cos(arah);
    const sin = Math.sin(arah);
    g.save();
    g.translate(xPx, yPx);
    g.scale(skala, skala);
    voxGambar(g, kotak, cos, sin);
    g.restore();
  }

  function voxSprite(kunci, buatModel) {
    const ada = voxCache.get(kunci);
    if (ada) return ada;
    let maxR = 8;
    let maxY = 12;
    for (let fr = 0; fr < VOX_FRM; fr++) {
      for (const b of buatModel(fr)) {
        maxY = Math.max(maxY, b.y1);
        maxR = Math.max(maxR, Math.hypot(Math.max(Math.abs(b.x0), Math.abs(b.x1)), Math.max(Math.abs(b.z0), Math.abs(b.z1))));
      }
    }
    const pad = Math.max(3, Math.ceil(maxR * VOX_BAYANG) + 2);
    const lw = Math.ceil(maxR * 2 + pad * 2);
    const lh = Math.ceil(maxY + maxR * VOX_BAYANG + pad * 2);
    const c = document.createElement("canvas");
    c.width = lw * VOX_ANG;
    c.height = lh * VOX_FRM;
    const g = c.getContext("2d");
    if (!g) return null;
    for (let a = 0; a < VOX_ANG; a++) {
      const th = (a / VOX_ANG) * TAU;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      for (let fr = 0; fr < VOX_FRM; fr++) {
        g.save();
        g.beginPath();
        g.rect(a * lw, fr * lh, lw, lh);
        g.clip();
        g.translate(a * lw + lw / 2, fr * lh + lh - pad);
        voxGambar(g, buatModel(fr), cos, sin);
        g.restore();
      }
    }
    const spr = { c, lw, lh, pad };
    voxCache.set(kunci, spr);
    return spr;
  }

  function voxGambarSprite(g, spr, x, yFeet, skala, arah, fase, alpha) {
    if (!spr) return;
    let a = Math.round(((arah - Math.PI / 2) / TAU) * VOX_ANG) % VOX_ANG;
    if (a < 0) a += VOX_ANG;
    const w = spr.lw * skala;
    const h = spr.lh * skala;
    g.save();
    if (alpha != null) g.globalAlpha *= alpha;
    g.imageSmoothingEnabled = false;
    g.drawImage(spr.c, a * spr.lw, fase * spr.lh, spr.lw, spr.lh, x - w / 2, yFeet - (spr.lh - spr.pad) * skala, w, h);
    g.restore();
  }

  function modelOrang(warna, fr) {
    const ph = (fr / VOX_FRM) * TAU;
    const ayun = Math.sin(ph);
    const bob = Math.abs(Math.sin(ph)) * 0.7;
    const kotak = [];
    const kulit = "#c9a882";
    const celana = "#3c5347";
    kotak.push(vxB(-5.6, -1.2, 1.6, 9, ayun * 2.4 - 2, ayun * 2.4 + 2, celana));
    kotak.push(vxB(1.2, 5.6, 1.6, 9, -ayun * 2.4 - 2, -ayun * 2.4 + 2, celana));
    kotak.push(vxB(-5.8, -0.8, 0, 1.6, ayun * 2.4 - 2.4, ayun * 2.4 + 2.4, "#22302a"));
    kotak.push(vxB(0.8, 5.8, 0, 1.6, -ayun * 2.4 - 2.4, -ayun * 2.4 + 2.4, "#22302a"));
    const y0 = 9 + bob;
    const y1 = 19 + bob;
    kotak.push(vxB(-6, 6, y0, y1, -3.4, 3.4, warna));
    kotak.push(vxB(-6, 6, y0 + 1, y0 + 3, 3.4, 3.8, vxRgb(warna, -0.35)));
    const ax = ayun * 2.6;
    kotak.push(vxB(-8.8, -6, 10 + bob, 18 + bob, ax - 1.5, ax + 1.5, warna));
    kotak.push(vxB(6, 8.8, 10 + bob, 18 + bob, -ax - 1.5, -ax + 1.5, warna));
    kotak.push(vxB(-8.8, -6, 6.5 + bob, 10 + bob, ax - 1.6, ax + 1.6, kulit));
    kotak.push(vxB(6, 8.8, 6.5 + bob, 10 + bob, -ax - 1.6, -ax + 1.6, kulit));
    const hy = 19 + bob;
    kotak.push(vxB(-4.4, 4.4, hy, hy + 8.6, -3.4, 3.4, kulit));
    kotak.push(vxB(-4.8, 4.8, hy + 8.6, hy + 10.2, -3.8, 3.8, "#3a2a20"));
    kotak.push(vxB(-4.2, 4.2, hy + 7.6, hy + 8.8, -4.2, -3.4, "#2f231b"));
    kotak.push(vxB(-2.6, -1.2, hy + 4.6, hy + 5.9, 3.3, 3.7, "#1d2b23"));
    kotak.push(vxB(1.2, 2.6, hy + 4.6, hy + 5.9, 3.3, 3.7, "#1d2b23"));
    return kotak;
  }

  function modelHantu(fr) {
    const ph = (fr / VOX_FRM) * TAU;
    const ayun = Math.sin(ph);
    const naik = Math.sin(ph) * 1.2;
    const kotak = [];
    const pucat = "#cfe9da";
    const pucatGelap = "#a9cbb9";
    kotak.push(vxB(-6.5 + ayun * 0.8, -1, 1.5, 6, -2.4, 2.4, pucatGelap));
    kotak.push(vxB(1, 6.5 + ayun * 0.8, 1.5, 6, -2.4, 2.4, pucatGelap));
    kotak.push(vxB(-8, 8, 6, 13 + naik, -3.6, 3.6, pucat));
    kotak.push(vxB(-7, 7, 13 + naik, 20 + naik, -3.4, 3.4, pucat));
    kotak.push(vxB(-10.5, -7, 14 + naik, 17 + naik, -2.2, 2.2, pucatGelap));
    kotak.push(vxB(7, 10.5, 14 + naik, 17 + naik, -2.2, 2.2, pucatGelap));
    kotak.push(vxB(-11, -8.5, 12.5 + naik, 15 + naik, 2, 5.4, pucat));
    kotak.push(vxB(8.5, 11, 12.5 + naik, 15 + naik, 2, 5.4, pucat));
    const hy = 20 + naik;
    kotak.push(vxB(-4.8, 4.8, hy, hy + 8.4, -3.6, 3.6, pucat));
    kotak.push(vxB(-5.2, 5.2, hy + 8.4, hy + 10 + naik * 0.3, -4, 4, "#1c2a22"));
    kotak.push(vxB(-5.2, 5.2, hy + 1, hy + 8.4, -5, -3.5, "#1c2a22"));
    kotak.push(vxB(-5, -1.4, hy + 8, hy + 11, -3, 3, "#1c2a22"));
    kotak.push(vxB(0.8, 4.6, hy + 7.6, hy + 10.6, -2.8, 2.8, "#1c2a22"));
    kotak.push(vxB(-3.2, -1.4, hy + 3.4, hy + 5.2, 3.5, 3.9, "#baffd9"));
    kotak.push(vxB(1.4, 3.2, hy + 3.4, hy + 5.2, 3.5, 3.9, "#baffd9"));
    return kotak;
  }

  function modelKasur(lv) {
    const kotak = [];
    const selimut = ["#4e7f62", "#5f9a72", "#7fae5f", "#c9a15a", "#cf7f7f", "#8f7fd0", "#63b7c9", "#ffd166"][lv - 1] || "#4e7f62";
    kotak.push(vxB(-14, 14, 0, 3.4, -13, 13, "#4a3a28"));
    kotak.push(vxB(-14, 14, 3.4, 7.4, -12, 12, "#dfe9d9"));
    kotak.push(vxB(-14, 12, 7.4, 9.2, -11, 11, selimut));
    kotak.push(vxB(8, 13, 6, 10.2, -8, 8, "#f4f8ef"));
    if (lv >= 2) {
      kotak.push(vxB(-14, 12, 9.4, 10.1, -11, 11, vxRgb(selimut, 0.3)));
    }
    if (lv >= 4) {
      kotak.push(vxB(-15, 15, 2.6, 3.4, -14, 14, "#d9b15c"));
    }
    if (lv >= 6) {
      kotak.push(vxB(-3, 3, 10.4, 11.2, -11, 11, "#ffd166"));
    }
    if (lv >= 8) {
      kotak.push(vxB(-15, 15, 10.2, 11.4, -14, 14, "#fff1a8"));
    }
    return kotak;
  }

  function modelKuburan(lv) {
    const batu = ["#8f9b93", "#a9b5ac", "#c3cfc5"][lv - 1] || "#8f9b93";
    const kotak = [];
    kotak.push(vxB(-13, 13, 0, 3, -10, 10, "#4a3a28"));
    kotak.push(vxB(-7, 7, 3, 9, -8, 8, batu));
    kotak.push(vxB(-3, 3, 9, 12, -7, 7, batu));
    kotak.push(vxB(-7, 7, 12, 15, -8, 8, batu));
    kotak.push(vxB(-3, 3, 15, 18, -7, 7, batu));
    kotak.push(vxB(-4, 4, 8.5, 9.5, 8, 9, vxRgb(batu, -0.3)));
    if (lv >= 2) {
      kotak.push(vxB(-12, -8, 3, 6, -7, 7, "#d9b15c"));
      kotak.push(vxB(-11, -9, 6, 8, -5, 5, "#ffd166"));
    }
    if (lv >= 3) {
      kotak.push(vxB(8, 12, 3, 6, -7, 7, "#d9b15c"));
      kotak.push(vxB(9, 11, 6, 9, -5, 5, "#fff1a8"));
    }
    return kotak;
  }

  function modelKonsol(lv) {
    const layar = ["#3f6f8a", "#4d86a8", "#63a8c9"][lv - 1] || "#3f6f8a";
    const kotak = [];
    kotak.push(vxB(-11, 11, 0, 3, -9, 9, "#3c5347"));
    kotak.push(vxB(-3, 3, 3, 8, -4, 4, "#2b3a32"));
    kotak.push(vxB(-11, 11, 8, 14, -6, 6, "#22302a"));
    kotak.push(vxB(-9, 9, 14, 17, -5, 5, layar));
    kotak.push(vxB(-7, 7, 15.5, 16.5, 5, 5.6, "#bff4ff"));
    if (lv >= 2) {
      kotak.push(vxB(-12, 12, 15.6, 16.8, -5.5, 5.5, vxRgb(layar, 0.3)));
    }
    if (lv >= 3) {
      kotak.push(vxB(-13, 13, 17, 18.2, -6.5, 6.5, "#ffd166"));
    }
    return kotak;
  }

  function modelTambang() {
    const kotak = [];
    kotak.push(vxB(-12, 12, 0, 4, -12, 12, "#4a3a28"));
    kotak.push(vxB(-8, 6, 4, 9, -8, 7, "#8a6a2a"));
    kotak.push(vxB(-10, 8, 4, 7, -10, 4, "#b08a3a"));
    kotak.push(vxB(3, 6, 4, 14, -3, 0, "#5a4a2c"));
    kotak.push(vxB(6, 13, 12, 15, -5, 2, "#c9a15a"));
    kotak.push(vxB(-2, 1, 9, 12, -6, 2, "#ffd166"));
    return kotak;
  }

  function modelBengkel() {
    const kotak = [];
    kotak.push(vxB(-14, 14, 0, 3, -11, 11, "#4a3a28"));
    kotak.push(vxB(-13, 13, 3, 9, -9, 9, "#8a6a44"));
    kotak.push(vxB(-13, 13, 9, 10.4, -9, 9, "#b08a54"));
    kotak.push(vxB(-10, -4, 5, 12, -3, 3, "#9aa3ad"));
    kotak.push(vxB(4, 10, 5, 15, -3, 1, "#5a4a2c"));
    kotak.push(vxB(8, 12, 14, 16, -5, 4, "#c9a15a"));
    kotak.push(vxB(-2, 2, 10.4, 12, -6, 6, "#ffd166"));
    return kotak;
  }

  function modelSapu(lv) {
    const kotak = [];
    const kayu = ["#8a6a44", "#9a7a4c", "#b08a54", "#7fb8d8"][lv - 1] || "#8a6a44";
    const bulu = ["#cbb26a", "#d8c27a", "#e8d38a", "#bfe9ff"][lv - 1] || "#cbb26a";
    kotak.push(vxB(-6, 6, 0, 2, -6, 6, "#3c5347"));
    kotak.push(vxB(-1.2, 1.2, 2, 19, -1.2, 1.2, kayu));
    kotak.push(vxB(0, 8, 12, 18, -3, 3, bulu));
    kotak.push(vxB(6, 8.4, 11, 13, -1.2, 1.2, vxRgb(bulu, -0.2)));
    if (lv >= 3) {
      kotak.push(vxB(-2, 2, 19, 22, -2, 2, "#ffd166"));
    }
    if (lv >= 4) {
      kotak.push(vxB(-8, 8, 18, 24, -8, 8, "#bfe9ff"));
      kotak.push(vxB(-6, 6, 20, 22.5, -10.5, -8.5, "#e8faff"));
      kotak.push(vxB(-6, 6, 20, 22.5, 8.5, 10.5, "#e8faff"));
    }
    return kotak;
  }

  function spriteOrang(warna) {
    return voxSprite("o:" + warna, (fr) => modelOrang(warna, fr));
  }

  function spriteHantu() {
    return voxSprite("hantu", (fr) => modelHantu(fr));
  }

  function spriteKasur(lv) {
    return voxSprite("kasur:" + lv, () => modelKasur(lv));
  }

  function spriteKuburan(lv) {
    return voxSprite("kuburan:" + lv, () => modelKuburan(lv));
  }

  function spriteKonsol(lv) {
    return voxSprite("konsol:" + lv, () => modelKonsol(lv));
  }

  function spriteTambang() {
    return voxSprite("tambang", () => modelTambang());
  }

  function spriteBengkel() {
    return voxSprite("bengkel", () => modelBengkel());
  }

  /* ================= PETA STATIS ================= */
  function siapkanPeta() {
    if (petaBeku) return petaBeku;
    const pad = petaBekuPad;
    const c = document.createElement("canvas");
    c.width = WORLD_W;
    c.height = WORLD_H + pad;
    const g = c.getContext("2d");
    if (!g) return null;
    g.translate(0, pad);

    // Dasar
    g.fillStyle = "#0a120d";
    g.fillRect(-4, -pad, WORLD_W + 8, WORLD_H + pad + 8);

    // Lantai kamar & koridor
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const t = GRID[y][x];
        const px = x * T;
        const py = y * T;
        if (t === WALL || t === PINTU) continue;
        if (t === LOR) {
          g.fillStyle = (x + y) % 2 ? "#21362a" : "#1b2d23";
          g.fillRect(px, py, T, T);
          g.strokeStyle = "rgba(255,255,255,0.03)";
          g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        } else {
          const slot = kamarDariTile(x, y);
          g.fillStyle = (x + y) % 2 ? "#2a4032" : "#253a2d";
          g.fillRect(px, py, T, T);
          g.fillStyle = "rgba(255,255,255,0.025)";
          g.fillRect(px, py, T, 2);
          if (slot >= 0) {
            g.fillStyle = hexAlpha(WARNA_SLOT[slot], 0.07);
            g.fillRect(px, py, T, T);
          }
        }
      }
    }

    // Permadani koridor vertikal
    g.fillStyle = "#2c4838";
    g.fillRect(6 * T + 7, T + 6, 2 * T - 14, 16 * T - 12);
    g.fillStyle = "rgba(88,217,143,0.1)";
    g.fillRect(6 * T + 7, T + 6, 3, 16 * T - 12);
    g.fillRect(8 * T - 9, T + 6, 2, 16 * T - 12);
    g.fillStyle = "rgba(0,0,0,0.14)";
    for (let y = 2; y < 17; y += 2) g.fillRect(6 * T + 10, y * T + 6, T * 2 - 20, 2);

    // Aula bawah (tempat hantu masuk)
    g.fillStyle = "#243a2d";
    g.fillRect(4 * T + 6, 17 * T + 6, 6 * T - 12, 4 * T - 12);
    g.fillStyle = "rgba(255,120,120,0.07)";
    g.fillRect(6 * T + 4, 17 * T + 6, 2 * T - 8, 4 * T - 12);

    // Gerbang tangga hantu di bawah
    g.fillStyle = "#0a1410";
    g.fillRect(5.4 * T, 19.2 * T, 3.2 * T, 2.4 * T);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? "#2b4333" : "#1d3024";
      g.fillRect(5.5 * T, 19.4 * T + i * 13, 3 * T, 11);
    }
    g.save();
    g.fillStyle = "#8ce6b0";
    g.font = "700 8px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("GERBANG", 7 * T, 19.1 * T);
    g.restore();

    // Lampu dinding + cahaya
    const lampu = [];
    for (const r of ROOM_DEFS) {
      lampu.push([r.doorX, r.y0, r.sisi]);
      lampu.push([r.doorX, r.y0 + 3, r.sisi]);
    }
    for (const [lx, ly, sisi] of lampu) {
      const px = (lx + 0.5) * T;
      const py = (ly + 0.5) * T;
      const grad = g.createRadialGradient(px, py, 4, px, py, T * 2);
      grad.addColorStop(0, "rgba(255,226,160,0.14)");
      grad.addColorStop(1, "rgba(255,226,160,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(px, py, T * 2, 0, TAU);
      g.fill();
      g.fillStyle = "rgba(255,228,168,0.85)";
      g.fillRect(px - (sisi === "kiri" ? 4 : 0), py - 2, 4, 7);
    }

    // Dinding
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        if (GRID[y][x] !== WALL) continue;
        gambarBlokDinding(g, x, y);
      }
    }

    // Bingkai pintu vertikal (kiri/kanan koridor)
    for (const r of ROOM_DEFS) {
      const px = r.doorX * T;
      const py = r.doorY * T;
      g.fillStyle = "#0b1610";
      g.fillRect(px - 2, py - 3, T + 4, T + 6);
      g.fillStyle = "#38503e";
      g.fillRect(px - 1, py - 5, T + 2, 5);
      g.fillRect(px - 1, py + T, T + 2, 5);
      g.fillStyle = "#4a6a52";
      g.fillRect(px - 2, py - 6, T + 4, 2);
      g.fillRect(px - 2, py + T + 4, T + 4, 2);
    }

    petaBeku = c;
    return c;
  }

  function gambarBlokDinding(g, x, y) {
    const px = x * T;
    const py = y * T;
    const HH = 13;
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(px + 2, py + T - 7, T - 4, 7);
    g.fillStyle = "#122019";
    g.fillRect(px + 1, py + 1, T - 2, T - 2);
    const grad = g.createLinearGradient(0, py - HH, 0, py + T);
    grad.addColorStop(0, "#2b4636");
    grad.addColorStop(0.5, "#203528");
    grad.addColorStop(1, "#14231a");
    g.fillStyle = grad;
    g.fillRect(px + 1, py - HH + 1, T - 2, T + HH - 3);
    g.fillStyle = "#355542";
    g.fillRect(px + 2, py - HH, T - 4, 4);
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.fillRect(px + 3, py - HH + 1, T - 6, 1);
    g.fillStyle = "rgba(0,0,0,0.16)";
    for (let i = 10; i < T - 6; i += 11) g.fillRect(px + i, py - 4, 1, T - 4);
    g.fillStyle = "#0d1811";
    g.fillRect(px + 1, py + T - 5, T - 2, 4);
  }

  function hexAlpha(hex, a) {
    const h = String(hex || "#888888").replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ================= RENDER ================= */
  function ukurCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(280, Math.round(rect.width || 0));
    view.h = Math.max(220, Math.round(rect.height || 0));
    view.dpr = dpr;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    const pad = petaBekuPad;
    const skala = Math.min((view.w - 6) / WORLD_W, (view.h - 6) / (WORLD_H + pad));
    view.scale = Math.max(0.12, skala);
    view.ox = (view.w - WORLD_W * view.scale) / 2;
    view.oy = (view.h - (WORLD_H + pad) * view.scale) / 2 + pad * view.scale;
  }

  function w2s(x, y) {
    return { x: view.ox + x * view.scale, y: view.oy + y * view.scale };
  }

  function render() {
    if (!ctx) return;
    const g = ctx;
    const dpr = view.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);
    const bg = g.createLinearGradient(0, 0, 0, view.h);
    bg.addColorStop(0, "#050c08");
    bg.addColorStop(0.45, "#0a1510");
    bg.addColorStop(1, "#060d09");
    g.fillStyle = bg;
    g.fillRect(0, 0, view.w, view.h);

    g.save();
    g.translate(view.ox, view.oy);
    g.scale(view.scale, view.scale);

    const peta = siapkanPeta();
    if (peta) g.drawImage(peta, 0, -petaBekuPad);

    if (run) {
      for (const room of run.rooms) gambarPintu(g, room);
      gambarSorot(g);
      const items = [];
      for (const room of run.rooms) {
        const d = room.def;
        items.push({ y: (d.bedY + 1) * T, fn: () => gambarKasur(g, room) });
        items.push({ y: (d.graveY + 1) * T, fn: () => gambarKuburan(g, room) });
        items.push({ y: (d.konsolY + 1) * T, fn: () => gambarKonsol(g, room) });
        const posT = tileTambang(d);
        for (let i = 0; i < room.tambang.length; i++) {
          const p = posT[i];
          if (!p) break;
          items.push({
            y: (p.y + 1) * T,
            fn: () => voxGambarSprite(g, spriteTambang(), (p.x + 0.5) * T, (p.y + 1) * T - 2, 0.62, 0.4, 0, 1),
          });
        }
        if (room.bengkel) {
          const p = tileBengkel(d);
          items.push({
            y: (p.y + 1) * T,
            fn: () => voxGambarSprite(g, spriteBengkel(), (p.x + 0.5) * T, (p.y + 1) * T - 2, 0.6, 0.4, 0, 1),
          });
        }
        for (const t of room.turrets) {
          items.push({
            y: (t.ty + 1) * T - 2,
            fn: () => voxGambarSprite(g, spriteTurretLv(t.lv), (t.tx + 0.5) * T, (t.ty + 1) * T - 2, 1.05, t.arah, 0, 1),
          });
        }
        if (room.alive && !room.sleeping) {
          const p = room.player;
          const spr = spriteOrang(room.warna);
          const fase = p.moving ? Math.floor((p.bob / TAU) * VOX_FRM) % VOX_FRM : 0;
          items.push({
            y: p.y * T,
            fn: () => {
              g.save();
              g.globalAlpha = room.remote ? 0.86 : 1;
              voxGambarSprite(g, spr, p.x * T, p.y * T + T * 0.42, 1.02, p.arah, fase, 1);
              g.restore();
            },
          });
        }
        if (room.sleeping) {
          items.push({ y: room.player.y * T, fn: () => gambarTidur(g, room) });
        }
      }
      const gh = run.ghost;
      if (gh.visible) {
        items.push({ y: gh.y * T + 2, fn: () => gambarHantu(g, gh) });
      }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.fn();

      if (gh.visible) gambarBarHantu(g, gh);
      gambarEfek(g);
      gambarNamaKamar(g);
    }
    g.restore();

    gambarLabelLayar(g);
  }

  function spriteTurretLv(lv) {
    return voxSprite("sapu:" + lv, () => modelSapu(lv));
  }

  const DOOR_WARNA = [
    ["#8a6a44", "#5a4128", "#b08a54"],
    ["#8f9aa3", "#5c666e", "#b6c0c8"],
    ["#6f8ea8", "#3f5a70", "#9dc0d8"],
    ["#7d6fbf", "#4a3f80", "#b9a6ff"],
  ];

  function gambarPintu(g, room) {
    const d = room.def;
    const cx = (d.doorX + 0.5) * T;
    const cy = (d.doorY + 0.5) * T;
    const kiri = d.sisi === "kiri";
    const w = T * 0.4;
    const hh = T * 0.74;
    if (!room.door.ada) {
      g.save();
      g.fillStyle = "#06100a";
      g.fillRect(cx - T * 0.48, cy - T * 0.48, T * 0.96, T * 0.96);
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.beginPath();
      g.ellipse(cx + (kiri ? -3 : 3), cy, T * 0.42, T * 0.5, 0, 0, TAU);
      g.fill();
      g.fillStyle = "#4a3a28";
      g.fillRect(cx - T * 0.3, cy + T * 0.28, 8, 3);
      g.fillRect(cx + T * 0.05, cy + T * 0.4, 10, 3);
      g.fillRect(cx - T * 0.12, cy - T * 0.42, 7, 3);
      g.restore();
      return;
    }
    const tier = clamp(room.door.tier | 0, 0, 3);
    const warna = DOOR_WARNA[tier];
    const goyang = room.door.goyang > 0 ? Math.sin(room.door.goyang * 90) * 1.8 : 0;
    const rasio = clamp(room.door.hp / room.door.max, 0, 1);
    g.save();
    g.translate(cx + goyang, cy);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(-w / 2 - 3, -hh + 4, w + 6, T * 0.5);
    g.fillStyle = warna[1];
    g.fillRect(-w / 2 - 2, -hh - 2, w + 4, hh + 8);
    g.fillStyle = warna[0];
    g.fillRect(-w / 2, -hh, w, hh);
    if (tier === 3) {
      g.shadowColor = warna[2];
      g.shadowBlur = 8;
      g.fillRect(-w / 2, -hh, w, 2);
      g.shadowBlur = 0;
    }
    g.fillStyle = warna[2];
    g.fillRect(-w / 2, -hh, w, 2.4);
    g.fillStyle = warna[1];
    g.fillRect(-w / 2, -hh * 0.62, w, 2);
    g.fillRect(-w / 2, -hh * 0.28, w, 2);
    g.fillStyle = "#e0c060";
    g.beginPath();
    g.arc(kiri ? w * 0.26 : -w * 0.26, -hh * 0.52, 2.2, 0, TAU);
    g.fill();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < room.door.lv ? warna[2] : "rgba(0,0,0,0.4)";
      g.fillRect(-w / 2 + 2 + i * 4, 2, 3, 3);
    }
    if (rasio < 0.7) {
      g.strokeStyle = "rgba(15,10,5,0.7)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(-w * 0.3, -hh * 0.15);
      g.lineTo(-w * 0.05, -hh * 0.4);
      g.lineTo(-w * 0.2, -hh * 0.64);
      if (rasio < 0.4) {
        g.moveTo(w * 0.32, -hh * 0.3);
        g.lineTo(w * 0.08, -hh * 0.5);
        g.lineTo(w * 0.22, -hh * 0.72);
      }
      g.stroke();
    }
    g.restore();
  }

  function gambarKasur(g, room) {
    const d = room.def;
    const spr = spriteKasur(room.bedLv);
    voxGambarSprite(g, spr, (d.bedX + 0.5) * T, (d.bedY + 0.9) * T, 0.62, 0.35, 0, 1);
  }

  function gambarKuburan(g, room) {
    const d = room.def;
    const spr = spriteKuburan(room.graveLv);
    voxGambarSprite(g, spr, (d.graveX + 0.5) * T, (d.graveY + 0.9) * T, 0.62, 0.35, 0, 1);
  }

  function gambarKonsol(g, room) {
    const d = room.def;
    const spr = spriteKonsol(room.konsolLv);
    voxGambarSprite(g, spr, (d.konsolX + 0.5) * T, (d.konsolY + 0.9) * T, 0.66, 0.35, 0, 1);
  }

  function gambarTidur(g, room) {
    const d = room.def;
    const t = run ? run.t : 0;
    g.save();
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.ellipse((d.bedX + 0.5) * T, (d.bedY + 0.9) * T, T * 0.6, T * 0.2, 0, 0, TAU);
    g.fill();
    g.font = "700 10px system-ui, sans-serif";
    g.fillStyle = "rgba(190,240,210,0.85)";
    g.textAlign = "center";
    const naik = (t * 0.8) % 1;
    g.globalAlpha = 1 - naik;
    g.fillText("Z", (d.bedX + 1.2) * T + naik * 6, (d.bedY + 0.35) * T - naik * 10);
    g.globalAlpha = 0.75;
    g.fillText("z", (d.bedX + 0.9) * T, (d.bedY + 0.22) * T);
    g.restore();
  }

  function gambarHantu(g, gh) {
    const { x, y } = gh;
    const px = x * T;
    const py = y * T + T * 0.4;
    const glow = g.createRadialGradient(px, py - 20, 6, px, py - 20, 52);
    const warnaGlow = gh.state === "stun" ? "rgba(255,209,102,0.28)" : "rgba(120,255,190,0.22)";
    glow.addColorStop(0, warnaGlow);
    glow.addColorStop(1, "rgba(120,255,190,0)");
    g.fillStyle = glow;
    g.beginPath();
    g.arc(px, py - 20, 52, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(px, py, 16, 5, 0, 0, TAU);
    g.fill();
    const spr = spriteHantu();
    const fase = Math.floor((run.t * 3.2) % VOX_FRM);
    const terbang = Math.sin(run.t * 2.2) * 2;
    const skala = gh.state === "pukul" || gh.state === "kejar" ? 1.12 : 1.02;
    g.save();
    g.globalAlpha = gh.state === "stun" ? 0.78 : 0.94;
    voxGambarSprite(g, spr, px, py + terbang, skala, gh.arah, fase, 1);
    g.restore();
    if (gh.state === "stun") {
      g.fillStyle = "#ffd166";
      g.font = "700 13px system-ui, sans-serif";
      g.textAlign = "center";
      for (let i = 0; i < 3; i++) {
        const a = run.t * 4 + (i / 3) * TAU;
        g.fillText("✦", px + Math.cos(a) * 16, py - 42 + Math.sin(a) * 5);
      }
    }
    if (gh.state === "pukul") {
      const d = kamarPada(gh.slot >= 0 ? gh.slot : 0);
      g.strokeStyle = "rgba(230,255,240,0.5)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(px - 8, py - 24);
      g.lineTo((d.doorX + 0.5) * T, (d.doorY + 0.5) * T);
      g.stroke();
    }
  }

  function gambarBarHantu(g, gh) {
    const px = gh.x * T;
    const py = gh.y * T - 46;
    const w = 46;
    g.save();
    g.textAlign = "center";
    g.font = "700 8px system-ui, sans-serif";
    g.fillStyle = "rgba(6,12,9,0.72)";
    g.fillRect(px - w / 2 - 12, py - 12, w + 24, 12);
    g.fillStyle = gh.buffT > 0 ? "#ffb0b0" : "#e6fff0";
    const nama = gh.nama.length > 14 ? gh.nama.slice(0, 13) + "…" : gh.nama;
    g.fillText(`${nama} · LV ${gh.level}`, px, py - 3);
    g.fillStyle = "rgba(6,12,9,0.8)";
    g.fillRect(px - w / 2 - 1, py - 1, w + 2, 6);
    g.fillStyle = gh.state === "stun" ? "#ffd166" : "#ff8c8c";
    g.fillRect(px - w / 2, py, w * clamp(gh.hp / gh.maxHp, 0, 1), 4);
    g.restore();
  }

  function gambarSorot(g) {
    if (!hover.tampil || !run) return;
    const room = run.rooms[run.slotLokal];
    if (!room || !room.alive) return;
    const x = hover.x;
    const y = hover.y;
    const d = room.def;
    if (x < d.x0 || x > d.x0 + 3 || y < d.y0 || y > d.y0 + 3) return;
    const turret = room.turrets.find((t) => t.tx === x && t.ty === y);
    const kasur = tileKasur(d, x, y);
    const funitur = tileFurnitur(d, x, y);
    const boleh = !turret && tileBolehTurret(room, x, y);
    g.save();
    g.fillStyle = turret ? "rgba(255,209,102,0.18)" : kasur ? "rgba(127,200,238,0.18)" : funitur ? "rgba(200,200,200,0.1)" : "rgba(88,217,143,0.16)";
    g.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
    g.strokeStyle = turret ? "rgba(255,209,102,0.8)" : boleh ? "rgba(88,217,143,0.7)" : "rgba(180,180,180,0.5)";
    g.lineWidth = 1.4;
    g.strokeRect(x * T + 2, y * T + 2, T - 4, T - 4);
    g.restore();
  }

  function gambarNamaKamar(g) {
    if (!run) return;
    g.save();
    g.textAlign = "center";
    g.font = "700 8px system-ui, sans-serif";
    for (const room of run.rooms) {
      const d = room.def;
      const cx = (d.x0 + 2) * T;
      const cy = (d.y0 + 3.72) * T;
      const lokal = room.slot === run.slotLokal;
      g.fillStyle = room.alive ? (lokal ? "rgba(190,255,215,0.95)" : "rgba(200,225,210,0.7)") : "rgba(255,140,140,0.75)";
      const nama = room.nama.length > 10 ? room.nama.slice(0, 9) + "…" : room.nama;
      g.fillText(room.alive ? nama : nama + " ✝", cx, cy);
      if (room.sleeping) {
        g.fillStyle = "rgba(150,220,250,0.85)";
        g.fillText("tidur", cx, cy + 9);
      }
    }
    g.restore();
  }

  function gambarEfek(g) {
    for (const f of run.fx) {
      const t = clamp(f.life / f.max, 0, 1);
      if (f.jenis === "peluru") {
        g.save();
        g.globalAlpha = t;
        g.strokeStyle = "#d9ffe9";
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(f.x1 * T, f.y1 * T);
        g.lineTo(f.x2 * T, f.y2 * T);
        g.stroke();
        g.restore();
      } else if (f.jenis === "sinar") {
        g.save();
        g.globalAlpha = t;
        g.strokeStyle = f.warna || "#ffe6a3";
        g.lineWidth = 4;
        g.shadowColor = f.warna || "#ffe6a3";
        g.shadowBlur = 10;
        g.beginPath();
        g.moveTo(f.x1 * T, f.y1 * T);
        g.lineTo(f.x2 * T, f.y2 * T);
        g.stroke();
        g.restore();
      } else if (f.jenis === "serpih") {
        g.save();
        g.globalAlpha = t;
        g.fillStyle = "#e8c987";
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + run.t;
          g.fillRect(f.x * T + Math.cos(a) * (1 - t) * 22, f.y * T - 12 + Math.sin(a) * (1 - t) * 16, 2.4, 2.4);
        }
        g.restore();
      } else if (f.jenis === "lingkar") {
        g.save();
        g.globalAlpha = t * 0.9;
        g.strokeStyle = f.warna || "#ffd166";
        g.lineWidth = 2.4;
        g.beginPath();
        g.arc(f.x * T, f.y * T, f.r * T + (1 - t) * 30, 0, TAU);
        g.stroke();
        g.restore();
      } else if (f.jenis === "teks") {
        g.save();
        g.globalAlpha = t;
        g.fillStyle = f.warna || "#ffd166";
        g.font = "800 10px system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(f.teks, f.x * T, f.y * T - (1 - t) * 22);
        g.restore();
      }
    }
  }

  function gambarLabelLayar(g) {
    if (!run) return;
    g.save();
    g.font = "700 9px system-ui, sans-serif";
    g.textAlign = "center";
    const me = run.rooms[run.slotLokal];
    if (me && me.alive && !me.sleeping) {
      const p = w2s(me.player.x * T, me.player.y * T + T * 0.4 - 52);
      g.fillStyle = "rgba(6,14,9,0.65)";
      const w = 30;
      g.fillRect(p.x - w / 2, p.y - 8, w, 11);
      g.fillStyle = "#baf7d2";
      g.fillText("KAMU", p.x, p.y + 1);
    }
    g.restore();
  }

  /* ================= HUD ================= */
  const hudCache = Object.create(null);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (m) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
  const angka = (n) => Math.round(Number(n) || 0).toLocaleString("id-ID");

  function setTeks(id, teks) {
    if (hudCache[id] === teks) return;
    hudCache[id] = teks;
    const el = $(id);
    if (el) el.textContent = teks;
  }

  function setBar(id, frac) {
    const el = $(id);
    if (!el) return;
    const f = clamp(frac, 0, 1).toFixed(3);
    if (el.dataset.f === f) return;
    el.dataset.f = f;
    const i = el.firstElementChild;
    if (i) i.style.transform = `scaleX(${f})`;
  }

  function statusKamar(room) {
    if (!room.alive) return "gugur";
    if (run && run.ghost.visible && run.ghost.slot === room.slot && run.ghost.state !== "hilang" && run.ghost.state !== "kabur") return "diserang";
    if (room.sleeping) return "tidur";
    return "bangun";
  }

  function segarkanTombol(me) {
    const tidurTxt = $("hd-tidur-txt");
    if (tidurTxt) tidurTxt.textContent = me.sleeping ? "Bangun" : "Tidur";
    const tidurBtn = $("hd-btn-tidur");
    if (tidurBtn) tidurBtn.classList.toggle("is-on", me.sleeping);

    const senterBtn = $("hd-btn-senter");
    if (senterBtn) {
      const cd = me.flashCd > 0;
      senterBtn.classList.toggle("is-cd", cd);
      if (cd) senterBtn.style.setProperty("--hd-cd", `${Math.round((1 - me.flashCd / 2.2) * 100)}%`);
      senterBtn.classList.toggle("is-off", me.sleeping);
    }

    const info = infoPintu(me);
    setTeks("hd-pintu-cost", info.jenis === "rusak" || info.jenis === "max" ? "MAX" : String(info.biaya));
    const pintuBtn = $("hd-btn-pintu");
    if (pintuBtn) {
      pintuBtn.classList.toggle("is-off", info.jenis === "rusak" || info.jenis === "max" || me.gold < info.biaya);
    }

    const turretMaks = me.turrets.length >= MAKS_TURRET;
    setTeks("hd-turret-cost", turretMaks ? "MAX" : String(HARGA.turret));
    const turretBtn = $("hd-btn-turret");
    if (turretBtn) turretBtn.classList.toggle("is-off", turretMaks || me.gold < HARGA.turret);

    const kabur = {
      "hd-kasur-lv": me.bedLv >= 8 ? "MAX" : `Lv.${me.bedLv}`,
      "hd-kuburan-lv": me.graveLv >= 3 ? "MAX" : `Lv.${me.graveLv}`,
      "hd-konsol-lv": me.konsolLv >= 3 ? "MAX" : `Lv.${me.konsolLv}`,
      "hd-tambang-lv": `${me.tambang.length}/${MAKS_TAMBANG}`,
      "hd-bengkel-lv": me.bengkel ? "ADA" : "—",
    };
    for (const id in kabur) setTeks(id, kabur[id]);
    setTeks("hd-kasur-cost", me.bedLv >= 8 ? "MAX" : String(BED_UP[me.bedLv]));
    setTeks("hd-kuburan-cost", me.graveLv >= 3 ? "MAX" : String(GRAVE_UP[me.graveLv]));
    setTeks("hd-konsol-cost", me.konsolLv >= 3 ? "MAX" : String(KONSOL_UP[me.konsolLv]));
    setTeks("hd-tambang-cost", me.tambang.length >= MAKS_TAMBANG ? "MAX" : String(HARGA.tambang));
    setTeks("hd-bengkel-cost", me.bengkel ? "ADA" : String(HARGA.bengkel));
    const mati = {
      "hd-build-kasur": me.bedLv >= 8 || me.gold < BED_UP[me.bedLv],
      "hd-build-kuburan": me.graveLv >= 3 || me.gold < GRAVE_UP[me.graveLv],
      "hd-build-konsol": me.konsolLv >= 3 || me.gold < KONSOL_UP[me.konsolLv],
      "hd-build-tambang": me.tambang.length >= MAKS_TAMBANG || me.gold < HARGA.tambang,
      "hd-build-bengkel": me.bengkel || me.gold < HARGA.bengkel,
    };
    for (const id in mati) {
      const b = $(id);
      if (b) b.classList.toggle("is-off", mati[id]);
    }
  }

  const TUTOR_TEKS = [
    "Pasang turret di ubin kamar (klik ubin atau tombol Turret).",
    "Dekati kasur, lalu tekan Tidur untuk menabung uang.",
    "Naikkan level kasur supaya uang tidur makin cepat.",
    "Perbaiki atau naikkan level pintu sebelum hantu datang.",
    "Bangun tambang emas untuk ubah energi jadi uang.",
  ];

  function updateHud(force) {
    const hud = $("hd-hud");
    const tampil = !!(run && (layar === "play" || layar === "jeda"));
    if (hud) hud.hidden = !tampil;
    if (!run) return;
    const me = run.rooms[run.slotLokal];
    if (!me) return;

    setTeks("hd-player-name", me.nama);
    setTeks("hd-slot-chip", `Kamar ${me.slot + 1}`);
    setTeks("hd-hp-label", `${Math.max(0, Math.round(me.hp))} / 100`);
    setBar("hd-hp-bar", me.hp / 100);
    setTeks("hd-door-label", me.door.ada ? `${Math.max(0, Math.round(me.door.hp))} / ${me.door.max}` : "Rusak");
    setBar("hd-door-bar", me.door.ada ? me.door.hp / me.door.max : 0);
    setTeks("hd-gold", `💰 ${angka(me.gold)}`);
    setTeks("hd-energy", `⚡ ${Math.floor(me.energy)}`);

    const sisa = run.t < 0 ? -run.t : MALAM_DETIK - run.t;
    setTeks("hd-timer", fmtWaktu(sisa));
    const timeEl = $("hd-timer");
    if (timeEl) {
      timeEl.classList.toggle("is-urgent", run.t >= 0 && sisa <= 30);
      timeEl.classList.toggle("is-prep", run.t < 0);
    }
    setTeks("hd-timer-label", run.t < 0 ? "Persiapan · mulai dalam" : sisa <= 30 ? "Pagi hampir tiba" : "Menuju pagi");

    let st = "Aman";
    if (!me.alive) st = "Gugur";
    else if (me.sleeping) st = `Tidur +${BED_INCOME[me.bedLv]}/s`;
    else if (hantuDalamKamar(me)) st = "Hantu di kamar!";
    else if (diPintuKamar(me)) st = "Pintu diserang!";
    else if (me.hp < 40) st = "HP kritis";
    setTeks("hd-state-label", st);

    const g = run.ghost;
    const hc = $("hd-hunter-card");
    if (hc) hc.classList.toggle("is-live", !!g.visible);
    setTeks("hd-hunter-name", g.nama);
    setTeks("hd-hunter-lv", `LV ${g.level}`);
    setBar("hd-hunter-bar", g.hp / g.maxHp);
    const aksiHantu = {
      tunggu: "Menunggu",
      jalan: "Mencari kamar",
      pukul: "Menghancurkan pintu",
      masuk: "Menerobos masuk",
      kejar: "Mengejar pemain",
      stun: "STUN",
      kabur: "Mundur",
      hilang: "Bersembunyi",
    };
    let skillTeks = aksiHantu[g.state] || "Menyerang";
    if (g.buffT > 0) skillTeks = g.buffJenis === "berserk" ? "BERSERK" : "KEJUT";
    setTeks("hd-hunter-skill", g.visible ? skillTeks : "Belum muncul");

    const tutor = $("hd-tutor");
    if (tutor) {
      const tampilTutor = !!(run.tutor && !run.tutor.selesai && me.alive);
      tutor.classList.toggle("is-show", tampilTutor);
      if (tampilTutor) setTeks("hd-tutor-text", TUTOR_TEKS[clamp(run.tutor.langkah, 0, TUTOR_TEKS.length - 1)]);
    }

    segarkanTombol(me);

    const strip = $("hd-room-strip");
    if (strip) {
      const sig = run.rooms.map((r) => `${r.slot}:${r.nama}:${statusKamar(r)}`).join("|");
      if (force || sig !== hudSig) {
        hudSig = sig;
        strip.innerHTML = run.rooms.map((r) => {
          const s = statusKamar(r);
          const cls = [
            s === "tidur" ? "is-sleep" : s === "diserang" ? "is-attack" : s === "gugur" ? "is-dead" : "",
            r.slot === run.slotLokal ? "is-me" : "",
          ].filter(Boolean).join(" ");
          return `<div class="hd-room-chip ${cls}" title="${esc(r.nama)}"><span class="hd-dot"></span><b>${r.slot + 1}</b></div>`;
        }).join("");
      }
    }
  }

  /* ================= LAYAR ================= */
  let caraAsal = "menu";

  function tampilLayar() {
    const screen = $("hd-screen");
    const hud = $("hd-hud");
    if (hud) hud.hidden = !(run && (layar === "play" || layar === "jeda"));
    if (!screen) return;
    if (layar === "play") {
      screen.hidden = true;
      screen.innerHTML = "";
      return;
    }
    screen.hidden = false;
    screen.classList.toggle("is-center", layar !== "lobby" && layar !== "cara");
    if (layar === "menu") renderMenu();
    else if (layar === "mabar") renderMabar();
    else if (layar === "lobby") renderLobby();
    else if (layar === "cara") renderCara();
    else if (layar === "jeda") renderJeda();
    else if (layar === "hasil") renderHasil();
    else renderMenu();
  }

  function renderMenu() {
    if (layar !== "menu") return;
    const scr = $("hd-screen");
    if (!scr) return;
    const r = muatRekor();
    const login = !!absenAkun();
    const ada = r.bestTime > 0 || r.games > 0;
    const pills = ada
      ? `<span class="hd-best-pill">⏱️ Terlama <b>${fmtWaktu(r.bestTime)}</b></span>
         <span class="hd-best-pill">🌅 Menang <b>${angka(r.wins)}</b></span>
         <span class="hd-best-pill">🎮 <b>${angka(r.games)}</b> main</span>`
      : `<span class="hd-best-pill">Belum ada rekor · main pertamamu!</span>`;
    scr.innerHTML = `
      <div class="hd-panel">
        <div class="hd-menu-top">
          <span class="hd-best-pill">${login ? `Akun <b>${esc(namaAkun())}</b>` : "Mode Guest"}</span>
          <span class="hd-best-pill">Solo · Mabar · Bot</span>
        </div>
        <div class="hd-logo">
          <h3>HAUNTED <span>DORM</span></h3>
          <p>8 kamar · 1 Dream Hunter · bertahan sampai pagi</p>
        </div>
        <div class="hd-menu-best">${pills}</div>
        <div class="hd-menu-actions">
          <button class="hd-btn hd-btn-primary" type="button" data-hd-action="solo">▶️ Main Solo</button>
          <button class="hd-btn" type="button" data-hd-action="mabar">👥 Mabar 8 Pemain</button>
          <button class="hd-btn" type="button" data-hd-action="cara">📖 Cara Main</button>
        </div>
        <p class="hd-note">Hantu, pintumu, dan pemainmu berjalan langsung di perangkat ini tanpa delay. Slot kosong diisi <b>bot</b> yang berpikir sendiri. Pemain lain di mabar tampil dengan delay ±1 detik karena memang tanpa server khusus.</p>
      </div>`;
  }

  function renderMabar() {
    if (layar !== "mabar") return;
    const scr = $("hd-screen");
    if (!scr) return;
    const login = !!absenAkun();
    scr.innerHTML = `
      <div class="hd-panel">
        <div class="hd-menu-top">
          <button class="hd-back-inline" type="button" data-hd-action="menu">← Kembali</button>
          <span class="hd-best-pill">Maksimal 8 pemain</span>
        </div>
        <div class="hd-logo">
          <h3>MABAR <span>ASRAMA</span></h3>
          <p>Bagikan kode · slot kosong diisi bot</p>
        </div>
        <div class="hd-card">
          <div class="hd-card-head"><h4>Buat Room</h4><small>Kamu jadi host</small></div>
          <p class="hd-note" style="text-align:left;margin:0;">Temanmu gabung pakai kode 5 huruf. Kamu yang menekan tombol mulai.</p>
          <button class="hd-btn hd-btn-primary" type="button" data-hd-action="mabar-buat" ${login ? "" : "disabled"}>Buat Room Baru</button>
        </div>
        <div class="hd-card">
          <div class="hd-card-head"><h4>Gabung Room</h4><small>Pakai kode teman</small></div>
          <div class="hd-field">
            <span>Kode room</span>
            <div class="hd-join-row">
              <input id="hd-join-code" class="hd-input" data-hd-join maxlength="5" placeholder="Contoh: A7K2Q" autocomplete="off" ${login ? "" : "disabled"}>
              <button class="hd-btn" type="button" data-hd-action="mabar-gabung" ${login ? "" : "disabled"}>Gabung</button>
            </div>
          </div>
        </div>
        <p class="hd-note">${login ? "Kamu bisa keluar room kapan saja dari lobby atau menu jeda." : "Login akun kelas dulu buat mabar. Guest tetap bisa main solo."}</p>
      </div>`;
  }

  function renderLobby() {
    if (layar !== "lobby" || !aktif) return;
    const scr = $("hd-screen");
    if (!scr) return;
    const list = pemainUrut();
    const terisi = new Map(list.map((p) => [Number(p.slot), p]));
    const hostAbsen = Number((mp.room && mp.room.hostAbsen) || 0);
    let slots = "";
    for (let i = 0; i < KAPASITAS; i++) {
      const p = terisi.get(i);
      if (p) {
        const me = Number(p.absen) === absenAkun();
        const tag = me ? "KAMU" : Number(p.absen) === hostAbsen ? "HOST" : "SIAP";
        slots += `<div class="hd-slot ${me ? "is-me" : ""}">
          <span class="hd-slot-icon">${me ? "🧑" : "👤"}</span>
          <div><b>${esc(p.name || "Pemain")}</b><small>Kamar ${i + 1}</small></div>
          <span class="hd-slot-tag">${tag}</span>
        </div>`;
      } else {
        slots += `<div class="hd-slot is-bot">
          <span class="hd-slot-icon">🤖</span>
          <div><b>Bot</b><small>Kamar ${i + 1}</small></div>
          <span class="hd-slot-tag">DIISI OTOMATIS</span>
        </div>`;
      }
    }
    const kode = mp.kode || (mp.room && mp.room.code) || "-----";
    const sisaBot = KAPASITAS - list.length;
    const aksiHost = mp.host
      ? `<button class="hd-btn hd-btn-primary" type="button" data-hd-action="lobby-mulai" ${mp.sibuk ? "disabled" : ""}>Mulai Mabar</button>`
      : `<p class="hd-note">Menunggu host menekan Mulai Mabar. Kamu bisa keluar kalau berubah pikiran.</p>`;
    scr.innerHTML = `
      <div class="hd-panel">
        <div class="hd-menu-top">
          <button class="hd-back-inline" type="button" data-hd-action="lobby-keluar">← Keluar Room</button>
          <span class="hd-best-pill">${list.length}/8 pemain · ${sisaBot > 0 ? `${sisaBot} bot` : "penuh"}</span>
        </div>
        <div class="hd-lobby-code">
          <strong>${esc(kode)}</strong>
          <button type="button" data-hd-copy="${esc(kode)}">Salin</button>
        </div>
        <p class="hd-note">Bagikan kode ini ke temanmu. Slot kosong otomatis diisi bot saat mulai.</p>
        <div class="hd-slot-grid">${slots}</div>
        ${aksiHost}
      </div>`;
  }

  function renderCara() {
    if (layar !== "cara") return;
    const scr = $("hd-screen");
    if (!scr) return;
    const item = (ikon, judul, isi) => `<div class="hd-guide-item"><span class="hd-guide-icon">${ikon}</span><div><b>${judul}</b><p>${isi}</p></div></div>`;
    scr.innerHTML = `
      <div class="hd-panel">
        <div class="hd-menu-top">
          <button class="hd-back-inline" type="button" data-hd-action="cara-kembali">← Kembali</button>
          <span class="hd-best-pill">30 detik persiapan · 5 menit malam</span>
        </div>
        <div class="hd-logo"><h3>CARA <span>MAIN</span></h3><p>8 kamar · 1 Dream Hunter · bertahan sampai pagi</p></div>
        <div class="hd-guide">
          ${item("🌅", "Tujuan", "Delapan kamar, satu Dream Hunter. Bertahan <b>5 menit</b> sampai matahari terbit. Hantu memilih satu kamar, menghancurkan pintunya, lalu mengejar pemainnya. Kalahkan hantunya untuk menang lebih cepat.")}
          ${item("🚪", "Pintu", "4 tingkat: Kayu → Besi → Baja → Vibranium, masing-masing 3 level (160–1140 HP). Perbaiki +40% HP (💰15), naikkan level, atau ganti tingkat. Pintu yang hancur total <b>tidak bisa</b> dibangun ulang.")}
          ${item("🛏️", "Kasur", "Dekati kasur lalu tekan <b>Tidur</b>. Tiap level kasur (1–8) menambah uang per detik (4–512). Kamu otomatis bangun kalau hantu masuk.")}
          ${item("🪦", "Kuburan & Konsol", "Kuburan menghasilkan uang pasif (+1/2/4 per detik). Konsol menghasilkan energi (+1/2/3 per 2 detik). Energi dipakai tambang emas.")}
          ${item("⛏️", "Tambang & Bengkel", "Tambang (maks 3, 💰60): ubah 3 energi/detik menjadi 7 uang/detik. Bengkel (💰80): memperbaiki pintu otomatis 2,5%/detik.")}
          ${item("🧹", "Turret", "Maks <b>9 turret</b> per kamar (💰25). 4 level: Sapu → Sekop → Selang → Bubble (upgrade 💰40/70/110). Klik ubin kamar atau turret untuk memasang/menaikkan.")}
          ${item("🔦", "Senter", "Tekan <b>Senter</b> saat hantu dekat: memberi damage dan mendorongnya mundur. Stagger penuh = hantu stun dan kamu dapat +12 uang.")}
          ${item("👻", "Dream Hunter", "Level hantu naik tiap 40 detik (maks 9): makin cepat, makin sakit, HP 650–1770. Skill: <b>Berserk</b> (kecepatan & damage naik) dan <b>Kejut</b> (semua turret lumpuh 3 detik). Di bawah 15% HP hantu mundur dan memulihkan diri.")}
          ${item("👥", "Mabar", "Sampai 8 pemain; slot kosong diisi bot. Hantu dan pemainmu berjalan tanpa delay; pemain lain disinkronkan ±1 detik. Kamu tetap bisa menang sendiri dengan bertahan sampai pagi.")}
          ${item("🎮", "Kontrol", "Desktop: WASD / panah · Space senter · F tidur · R pintu · T turret · B menu bangun · G kasur · Esc jeda. Sentuh: joystick kiri, tombol aksi kanan.")}
        </div>
        <p class="hd-note">Semua aksi dibatasi Firestore Rules saat menyimpan rekor dan status mabar. Tidak ada data akun lain yang bisa diubah dari browser.</p>
      </div>`;
  }

  function renderJeda() {
    if (layar !== "jeda") return;
    const scr = $("hd-screen");
    if (!scr) return;
    scr.innerHTML = `
      <div class="hd-panel">
        <div class="hd-result-head">
          <h3>JEDA</h3>
          <p>${run && run.mode === "mabar" ? "Layarmu berhenti, pemain lain tetap berjalan di perangkat mereka." : "Pertandingan berhenti sementara."}</p>
        </div>
        <div class="hd-pause-actions">
          <button class="hd-btn hd-btn-primary" type="button" data-hd-action="jeda-lanjut">Lanjut Main</button>
          <button class="hd-btn" type="button" data-hd-action="jeda-cara">Cara Main</button>
          <button class="hd-btn hd-btn-danger hd-btn-wide" type="button" data-hd-action="jeda-keluar">${run && run.mode === "mabar" ? "Keluar Mabar" : "Keluar ke Menu"}</button>
        </div>
      </div>`;
  }

  function renderHasil() {
    if (layar !== "hasil" || !run) return;
    const scr = $("hd-screen");
    if (!scr) return;
    const h = run.hasil || {};
    const s = h.simpan;
    let catatan;
    if (!absenAkun()) catatan = "Mode Guest: rekor tidak masuk server. Login dulu supaya tersimpan di akunmu.";
    else if (!s) catatan = "Menyimpan rekor ke akun...";
    else if (s.ok) catatan = "Rekor tersimpan di akun Web Kelas kamu.";
    else catatan = `Rekor belum tersimpan: ${esc(s.alasan || "koneksi terganggu")}.`;
    const baris = run.rooms.map((r) => `
      <div class="hd-result-row ${r.alive ? "" : "is-dead"}">
        <span>${r.slot === run.slotLokal ? "★" : r.slot + 1}</span>
        <b>${esc(r.nama)}${r.bot ? " (bot)" : ""}</b>
        <small>${r.alive ? (r.sleeping ? "tidur" : "bertahan") : "gugur"}</small>
      </div>`).join("");
    const judul = h.menang
      ? h.sebab === "hantu"
        ? "DREAM HUNTER KALAH"
        : "BERTAHAN SAMPAI PAGI"
      : "KAMU GUGUR";
    const sub = h.menang
      ? h.sebab === "hantu"
        ? "Kamu mengalahkan Dream Hunter sebelum matahari terbit."
        : "Matahari terbit dan Dream Hunter mundur dari asrama."
      : "Hantu berhasil menembus kamarmu. Pasang turret dan perkuat pintu lebih awal.";
    scr.innerHTML = `
      <div class="hd-panel">
        <div class="hd-result-head">
          <h3>${judul}</h3>
          <p>${sub}</p>
          ${h.baru ? `<span class="hd-record-badge">REKOR BARU · Bertahan Terlama</span>` : ""}
        </div>
        <div class="hd-stats">
          <div class="hd-stat"><small>Waktu</small><b>${fmtWaktu(h.detik || 0)}</b></div>
          <div class="hd-stat"><small>Uang</small><b>${angka(h.gold || 0)}</b></div>
          <div class="hd-stat"><small>Hunter mundur</small><b>${angka(h.stun || 0)}x</b></div>
        </div>
        <div class="hd-result-list">${baris}</div>
        <p class="hd-note">${catatan}</p>
        <div class="hd-over-actions">
          <button class="hd-btn hd-btn-primary" type="button" data-hd-action="hasil-lagi">${run.mode === "mabar" ? "Siap Lagi" : "Main Lagi"}</button>
          <button class="hd-btn" type="button" data-hd-action="hasil-keluar">${run.mode === "mabar" ? "Keluar Room" : "Main Menu"}</button>
        </div>
      </div>`;
  }

  /* ================= AKHIR MATCH ================= */
  function akhiriMatch(menang, sebab) {
    if (!run || run.over) return;
    run.over = true;
    run.menang = !!menang;
    layar = "hasil";
    const lama = muatRekor();
    const detik = clamp(run.t, 0, MALAM_DETIK);
    const hasil = {
      menang: !!menang,
      sebab: sebab || (menang ? "pagi" : "gugur"),
      detik,
      gold: Math.max(0, Math.floor(run.goldTotal)),
      stun: run.stunHantu,
      hantuKalah: run.hantuKalah,
      level: run.ghost.level,
      baru: detik > lama.bestTime + 0.5 || (menang && lama.wins === 0),
      simpan: null,
    };
    run.hasil = hasil;
    keys.clear();
    stick.aktif = false;
    stick.x = 0;
    stick.y = 0;
    stick.id = null;
    if (knobEl) knobEl.style.transform = "";
    const sheet = $("hd-sheet");
    if (sheet) sheet.classList.remove("is-open");
    if (menang) {
      kilat(sebab === "hantu" ? "HUNTER KALAH" : "PAGI TIBA", "green");
      bunyi("menang");
    } else {
      kilat("KAMU GUGUR", "red");
      bunyi("kalah");
      getar([80, 50, 120]);
    }
    tampilLayar();
    renderHasil();
    simpanRekorServer(hasil.detik, hasil.gold, !!menang).then((r) => {
      hasil.simpan = { ok: !!r.ok, alasan: r.alasan || "" };
      if (run && run.hasil === hasil && layar === "hasil") renderHasil();
    });
  }

  function ulangMatch() {
    if (!run) {
      layar = "menu";
      tampilLayar();
      return;
    }
    if (run.mode === "mabar") {
      run = null;
      if (mp.host) kembaliKeLobbyMabar();
      layar = "lobby";
      tampilLayar();
      renderLobby();
      toast(mp.host ? "Room kembali ke lobby. Tekan Mulai Mabar untuk main lagi." : "Menunggu host memulai lagi.");
      return;
    }
    mulaiSolo();
  }

  function pauseGame() {
    if (!run || run.over || layar !== "play") return;
    layar = "jeda";
    tampilLayar();
  }

  function lanjutMain() {
    if (!run || run.over) return;
    layar = "play";
    lastT = 0;
    tampilLayar();
    updateHud(true);
  }

  function salinKode(kode) {
    const teks = String(kode || mp.kode || "");
    if (!teks) return;
    const selesai = () => toast(`Kode room disalin: ${teks}`, "good");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(teks).then(selesai, () => toast(`Kode room: ${teks}`));
        return;
      }
    } catch (e) { /* ignore */ }
    toast(`Kode room: ${teks}`);
  }

  function aksiLayar(act) {
    bunyi("klik");
    if (act === "menu") {
      run = null;
      layar = "menu";
      tampilLayar();
    } else if (act === "solo") {
      mulaiSolo();
    } else if (act === "mabar") {
      layar = "mabar";
      tampilLayar();
    } else if (act === "cara") {
      caraAsal = layar === "cara" ? caraAsal : layar;
      layar = "cara";
      tampilLayar();
    } else if (act === "cara-kembali") {
      layar = caraAsal || "menu";
      tampilLayar();
      if (layar === "lobby") renderLobby();
    } else if (act === "mabar-buat") {
      buatRoomMabar();
    } else if (act === "mabar-gabung") {
      const inp = $("hd-join-code");
      gabungRoomMabar(inp ? inp.value : "");
    } else if (act === "lobby-mulai") {
      mulaiRoomMabar();
    } else if (act === "lobby-keluar") {
      keluarRoomMabar();
    } else if (act === "jeda-lanjut") {
      lanjutMain();
    } else if (act === "jeda-cara") {
      caraAsal = "jeda";
      layar = "cara";
      tampilLayar();
    } else if (act === "jeda-keluar") {
      if (run && run.mode === "mabar") {
        keluarRoomMabar();
      } else {
        run = null;
        layar = "menu";
        tampilLayar();
      }
    } else if (act === "hasil-lagi") {
      ulangMatch();
    } else if (act === "hasil-keluar") {
      if (run && run.mode === "mabar") {
        keluarRoomMabar();
      } else {
        run = null;
        layar = "menu";
        tampilLayar();
      }
    }
  }

  /* ================= AKSI PEMAIN ================= */
  function tileTurretSaran(room) {
    const d = room.def;
    let best = null;
    let bestJ = Infinity;
    for (let y = d.y0; y < d.y0 + 4; y++) {
      for (let x = d.x0; x < d.x0 + 4; x++) {
        if (!tileBolehTurret(room, x, y)) continue;
        if (room.turrets.some((t) => t.tx === x && t.ty === y)) continue;
        const j = Math.abs(x - d.doorX) + Math.abs(y - d.y0);
        if (j < bestJ) { bestJ = j; best = { x, y }; }
      }
    }
    return best;
  }

  function tombolTurret(room) {
    if (room.sleeping) {
      toast("Bangun dulu sebelum membangun turret.");
      return;
    }
    if (room.turrets.length >= MAKS_TURRET) {
      toast(`Maksimal ${MAKS_TURRET} turret per kamar.`);
      return;
    }
    const t = tileTurretSaran(room);
    if (!t) {
      toast("Tidak ada tempat kosong untuk turret.");
      return;
    }
    bangunTurret(room, t.x, t.y);
  }

  function aksiTombol(act) {
    if (!run || run.over || layar !== "play") return;
    const me = run.rooms[run.slotLokal];
    if (!me || !me.alive) return;
    if (act === "senter") aksiSenter(me);
    else if (act === "tidur") aksiKasur(me);
    else if (act === "pintu") aksiPintu(me);
    else if (act === "turret") tombolTurret(me);
    else if (act === "bangun") {
      const sheet = $("hd-sheet");
      if (sheet) {
        const buka = !sheet.classList.contains("is-open");
        sheet.classList.toggle("is-open", buka);
        bunyi("klik");
      }
    } else if (act === "kasur") aksiKasurUp(me);
    else if (act === "kuburan") aksiKuburan(me);
    else if (act === "konsol") aksiKonsol(me);
    else if (act === "tambang") aksiTambang(me);
    else if (act === "bengkel") aksiBengkel(me);
  }

  function klikTile(tx, ty) {
    if (!run || run.over || layar !== "play") return;
    const me = run.rooms[run.slotLokal];
    if (!me || !me.alive) return;
    const d = me.def;
    if (tx < d.x0 || tx > d.x0 + 3 || ty < d.y0 || ty > d.y0 + 3) return;
    if (tileKasur(d, tx, ty)) {
      aksiKasur(me);
      return;
    }
    if (tx === d.graveX && ty === d.graveY) {
      aksiKuburan(me);
      return;
    }
    if (tx === d.konsolX && ty === d.konsolY) {
      aksiKonsol(me);
      return;
    }
    if (me.sleeping) {
      toast("Bangun dulu sebelum membangun turret.");
      return;
    }
    bangunTurret(me, tx, ty);
  }

  function tileDariEvent(e) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - view.ox) / view.scale;
    const y = (e.clientY - rect.top - view.oy) / view.scale;
    return { x: Math.floor(x / T), y: Math.floor(y / T) };
  }

  /* ================= INPUT ================= */
  const GERAK_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];

  function bindInput() {
    if (bindInput.siap) return;
    bindInput.siap = true;

    document.addEventListener("keydown", (e) => {
      if (!aktif) return;
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const k = String(e.key || "").toLowerCase();
      if (e.key === "Escape") {
        if (layar === "play") { pauseGame(); e.preventDefault(); }
        else if (layar === "jeda") { lanjutMain(); e.preventDefault(); }
        else if (layar === "cara") { layar = caraAsal || "menu"; tampilLayar(); e.preventDefault(); }
        else if (layar === "mabar") { layar = "menu"; tampilLayar(); e.preventDefault(); }
        return;
      }
      if (!run || run.over || layar !== "play") return;
      if (GERAK_KEYS.includes(k)) {
        keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
        return;
      }
      if (e.code === "Space" || k === " ") {
        const me = run.rooms[run.slotLokal];
        if (me) aksiSenter(me);
        e.preventDefault();
        return;
      }
      if (k === "f") { const me = run.rooms[run.slotLokal]; if (me) aksiKasur(me); e.preventDefault(); }
      else if (k === "r") { const me = run.rooms[run.slotLokal]; if (me) aksiPintu(me); e.preventDefault(); }
      else if (k === "t") { const me = run.rooms[run.slotLokal]; if (me) tombolTurret(me); e.preventDefault(); }
      else if (k === "g") { const me = run.rooms[run.slotLokal]; if (me) aksiKasurUp(me); e.preventDefault(); }
      else if (k === "b") { aksiTombol("bangun"); e.preventDefault(); }
    });

    document.addEventListener("keyup", (e) => {
      keys.delete(String(e.key || "").toLowerCase());
    });

    if (canvas) {
      canvas.addEventListener("pointermove", (e) => {
        if (!aktif || !run || layar !== "play" || e.pointerType !== "mouse") {
          hover.tampil = false;
          return;
        }
        const t = tileDariEvent(e);
        if (t) {
          hover.x = t.x;
          hover.y = t.y;
          hover.tampil = true;
        } else {
          hover.tampil = false;
        }
      });
      canvas.addEventListener("pointerdown", (e) => {
        if (!aktif || !run || layar !== "play") return;
        const t = tileDariEvent(e);
        if (t) klikTile(t.x, t.y);
      });
      canvas.addEventListener("pointerleave", () => { hover.tampil = false; });
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    joystickEl = $("hd-joystick");
    knobEl = $("hd-joystick-knob");
    if (joystickEl) {
      const mulai = (e) => {
        if (!run || layar !== "play") return;
        const rect = joystickEl.getBoundingClientRect();
        stick.cx = rect.left + rect.width / 2;
        stick.cy = rect.top + rect.height / 2;
        stick.aktif = true;
        stick.id = e.pointerId;
        try { joystickEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        geser(e);
        e.preventDefault();
      };
      const geser = (e) => {
        if (!stick.aktif || e.pointerId !== stick.id) return;
        const dx = e.clientX - stick.cx;
        const dy = e.clientY - stick.cy;
        const maks = 38;
        const d = Math.hypot(dx, dy);
        const f = d > maks ? maks / d : 1;
        stick.x = (dx * f) / maks;
        stick.y = (dy * f) / maks;
        if (knobEl) knobEl.style.transform = `translate(${dx * f}px, ${dy * f}px)`;
      };
      const selesai = (e) => {
        if (e.pointerId !== stick.id) return;
        stick.aktif = false;
        stick.x = 0;
        stick.y = 0;
        stick.id = null;
        if (knobEl) knobEl.style.transform = "";
      };
      joystickEl.addEventListener("pointerdown", mulai);
      joystickEl.addEventListener("pointermove", geser);
      joystickEl.addEventListener("pointerup", selesai);
      joystickEl.addEventListener("pointercancel", selesai);
    }

    document.addEventListener("visibilitychange", () => {
      if (!aktif) return;
      if (document.hidden && layar === "play") pauseGame();
    });

    window.addEventListener("resize", () => { if (aktif) ukurCanvas(); });

    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      document.body.classList.add("hd-touch");
    }
  }

  function bindAksi() {
    if (bindAksi.siap) return;
    bindAksi.siap = true;

    const scr = $("hd-screen");
    if (scr) {
      scr.addEventListener("click", (e) => {
        const copy = e.target.closest("[data-hd-copy]");
        if (copy) {
          salinKode(copy.dataset.hdCopy);
          return;
        }
        const btn = e.target.closest("[data-hd-action]");
        if (btn && !btn.disabled) aksiLayar(btn.dataset.hdAction);
      });
      scr.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const inp = e.target.closest("[data-hd-join]");
        if (!inp) return;
        e.preventDefault();
        gabungRoomMabar(inp.value);
      });
    }

    const pauseBtn = $("hd-pause-btn");
    if (pauseBtn) pauseBtn.addEventListener("click", () => { if (layar === "play") pauseGame(); });

    const soundBtn = $("hd-sound-btn");
    if (soundBtn) {
      soundBtn.textContent = SFX_ON ? "🔊" : "🔇";
      soundBtn.addEventListener("click", () => {
        SFX_ON = !SFX_ON;
        simpanPrefs();
        soundBtn.textContent = SFX_ON ? "🔊" : "🔇";
        if (SFX_ON) bunyi("klik");
      });
    }

    for (const btn of document.querySelectorAll("[data-hd-act]")) {
      btn.addEventListener("click", () => aksiTombol(btn.dataset.hdAct));
    }
  }

  /* ================= LOOP & LIFECYCLE ================= */
  function loop(ts) {
    if (!aktif) return;
    raf = requestAnimationFrame(loop);
    const now = ts || (window.performance && performance.now ? performance.now() : Date.now());
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(0.05, dt);
    uiClock += dt;

    if (canvas && uiClock > 0.4) {
      uiClock = 0;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && (Math.abs(rect.width - view.w) > 1 || Math.abs(rect.height - view.h) > 1)) ukurCanvas();
    }

    if (run && layar === "play" && !run.over) update(dt);
    hudClock += dt;
    if (hudClock >= 0.14) {
      hudClock = 0;
      updateHud();
    }
    render();
  }

  function buka() {
    if (aktif) return;
    aktif = true;
    canvas = $("hd-canvas");
    ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    joystickEl = $("hd-joystick");
    knobEl = $("hd-joystick-knob");
    muatPrefs();

    if (run && run._absen !== undefined && run._absen !== absenAkun()) {
      run = null;
      hentikanMabar();
    }
    if (!run || run.over) {
      run = null;
      layar = mp.aktif && mp.kode ? "lobby" : "menu";
    } else {
      layar = "jeda";
    }

    ukurCanvas();
    petaBeku = null;
    bindInput();
    bindAksi();
    tampilLayar();
    updateHud(true);
    if (mp.aktif && layar === "lobby") renderLobby();
    lastT = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function tutup() {
    if (!aktif) return;
    if (run && !run.over && layar === "play") layar = "jeda";
    aktif = false;
    cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
    keys.clear();
    hover.tampil = false;
    stick.aktif = false;
    stick.x = 0;
    stick.y = 0;
    stick.id = null;
    if (knobEl) knobEl.style.transform = "";
    const hud = $("hd-hud");
    if (hud) hud.hidden = true;
  }

  window.hauntedBuka = buka;
  window.hauntedTutup = tutup;
  window.hauntedPause = function () { if (aktif) pauseGame(); };
  window.hauntedSedangMain = function () { return aktif && layar === "play"; };
  window.hauntedRingkas = function () {
    try {
      const raw = JSON.parse(localStorage.getItem(REKOR_KEY) || "null");
      if (!raw) return null;
      return {
        absen: Number(raw.absen) || 0,
        bestTime: Number(raw.bestTime) || 0,
        wins: Number(raw.wins) || 0,
        games: Number(raw.games) || 0,
      };
    } catch (e) {
      return null;
    }
  };
  window.HauntedDorm = { buka, tutup };
})();
