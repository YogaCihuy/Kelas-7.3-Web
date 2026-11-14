/* tableverse.js
   Game hub multiplayer TableVerse.
   Semua validasi gerakan, giliran, undangan, dan hasil ada di backend
   (tableverse-server). File ini hanya mengatur tampilan + mengirim aksi. */
(function () {
  "use strict";

  const B = window.TVBoards || {};
  const esc = B.esc || ((v) => String(v == null ? "" : v));
  const INVITE_FALLBACK_TTL = 120000;
  const ONLINE_MS = 75000;

  const st = {
    inited: false,
    visible: false,
    absen: null,
    nama: "",
    token: "",
    booted: false,
    booting: false,
    bootPromise: null,
    verifying: false,
    syncFail: false,
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    offset: 0,
    profile: null,
    room: null,
    roomId: null,
    roomSetAt: 0,
    roomUnsub: null,
    roomSnapshotOk: false,
    hand: [],
    handLoaded: false,
    handVersion: 0,
    stateLoading: false,
    presence: {},
    presenceKey: "",
    presenceUnsubs: [],
    invites: [],
    outbound: [],
    knownInvites: new Set(),
    invitesSiap: false,
    snapshotInvites: false,
    invitesUnsub: null,
    inviteRefreshing: false,
    outboundSeen: {},
    outboundSiap: false,
    tab: "play",
    screen: "hub",
    autoRoomDone: false,
    pendingInviteOpen: false,
    modal: null,
    modalBusy: false,
    players: [],
    playersAt: 0,
    playersLoading: false,
    playerQuery: "",
    rooms: [],
    roomsLoading: false,
    history: [],
    historyAt: 0,
    historyLoading: false,
    profileFresh: null,
    profileAt: 0,
    ui: { sel: null },
    busy: false,
    syncTimer: null,
    pollTimer: null,
    inviteTimer: null,
    tickTimer: null,
    stateTimer: null,
    setupError: "",
    toastCount: 0,
    lastTap: 0,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function apiBase() {
    let url = String(window.TABLEVERSE_API || "").trim().replace(/\/+$/, "");
    if (!url) return "";
    if (!/\/api\/tableverse$/i.test(url)) url += "/api/tableverse";
    return url;
  }

  function firestore() {
    try {
      return typeof db !== "undefined" ? db : null;
    } catch (err) {
      return null;
    }
  }

  function serverNow() {
    return Date.now() + (Number(st.offset) || 0);
  }

  function sinkronJam(ms) {
    const nilai = Number(ms);
    if (!Number.isFinite(nilai) || nilai <= 0) return;
    const beda = nilai - Date.now();
    if (Math.abs(beda - st.offset) > 1500) st.offset = beda;
  }

  function tokenKey(absen) {
    return `tableverse-token-${absen}`;
  }

  function profileKey(absen) {
    return `tableverse-profile-${absen}`;
  }

  function bacaCacheProfil(absen) {
    try {
      const raw = localStorage.getItem(profileKey(absen));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function simpanCacheProfil(player) {
    if (!player || !player.absen) return;
    try {
      localStorage.setItem(profileKey(player.absen), JSON.stringify(player));
    } catch (err) {
      /* storage bisa penuh; abaikan */
    }
  }

  class TvError extends Error {
    constructor(message, status, code) {
      super(message || "Terjadi kesalahan.");
      this.status = status || 0;
      this.code = code || "";
    }
  }

  async function api(action, payload, opsi) {
    const url = apiBase();
    if (!url) throw new TvError("TableVerse belum tersambung ke backend.", 0, "no-api");
    const headers = { "Content-Type": "application/json" };
    if (st.token) headers.Authorization = `Bearer ${st.token}`;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), (opsi && opsi.timeout) || 16000) : null;
    let res;
    let data = null;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ action, ...(payload || {}) }),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw new TvError(
        err && err.name === "AbortError"
          ? "Server TableVerse tidak merespons. Cek koneksi lalu coba lagi."
          : "Tidak bisa menghubungi server TableVerse. Cek internetmu.",
        0,
        "network"
      );
    }
    if (timer) clearTimeout(timer);
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (data && data.serverNow) sinkronJam(data.serverNow);
    if (!res.ok || !data || data.ok === false) {
      const info = (data && data.error) || {};
      const err = new TvError(info.message || `Server menolak permintaan (${res.status}).`, res.status, info.code);
      if (res.status === 401 && st.token) {
        hapusToken();
        st.token = "";
        st.booted = false;
        st.profile = null;
      }
      throw err;
    }
    return data;
  }

  function hapusToken() {
    if (!st.absen) return;
    try {
      localStorage.removeItem(tokenKey(st.absen));
    } catch (err) {
      /* abaikan */
    }
  }

  function toast(pesan, tipe) {
    const root = $("tv-toast-root");
    if (!root) return;
    const kind = tipe || "info";
    const el = document.createElement("div");
    el.className = `tv-toast tv-toast-${kind}`;
    el.innerHTML = `<span class="tv-toast-dot"></span><span>${esc(pesan)}</span>`;
    root.appendChild(el);
    while (root.children.length > 4) root.removeChild(root.firstChild);
    window.setTimeout(() => {
      el.classList.add("is-out");
      window.setTimeout(() => el.remove(), 320);
    }, kind === "error" ? 5200 : 3800);
    if (kind === "invite" || kind === "ok") {
      try {
        if (window.SoundFX && typeof SoundFX.cardOpen === "function") SoundFX.cardOpen();
      } catch (err) {
        /* audio opsional */
      }
    }
  }

  function fmtDur(ms) {
    const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (total < 60) return `${total} detik`;
    const menit = Math.floor(total / 60);
    if (menit < 60) return `${menit} menit ${total % 60} detik`;
    const jam = Math.floor(menit / 60);
    return `${jam} jam ${menit % 60} menit`;
  }

  function fmtTanggal(ms) {
    const nilai = Number(ms) || 0;
    if (!nilai) return "-";
    try {
      return new Date(nilai).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      return new Date(nilai).toLocaleString();
    }
  }

  function sisaTeks(ms) {
    const sisa = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sisa / 60);
    const d = sisa % 60;
    return `${m}:${String(d).padStart(2, "0")}`;
  }

  function meta(gameId) {
    if (B.GAMES && B.GAMES[gameId]) return B.GAMES[gameId];
    return { id: gameId, judul: gameId, mode: "duel", desc: "", tag: "", accent: "mint" };
  }

  function semuaGame() {
    return (B.GAME_ORDER || Object.keys(B.GAMES || {})).map(meta);
  }

  function statsOf(player) {
    const raw = (player && player.stats) || {};
    const perGame = raw.perGame && typeof raw.perGame === "object" ? raw.perGame : {};
    const stats = {
      matches: Number(raw.matches) || 0,
      wins: Number(raw.wins) || 0,
      losses: Number(raw.losses) || 0,
      draws: Number(raw.draws) || 0,
      playtime: Number(raw.playtime) || 0,
      perGame,
    };
    stats.winRate = stats.matches ? Math.round((stats.wins / stats.matches) * 100) : 0;
    return stats;
  }

  function mySlot(room) {
    if (!room || !Array.isArray(room.players)) return -1;
    const p = room.players.find((x) => Number(x.absen) === Number(st.absen));
    return p ? Number(p.slot) : -1;
  }

  function isHost(room) {
    return !!room && Number(room.hostAbsen) === Number(st.absen);
  }

  function namaSlot(room, slot) {
    const p = room && room.players ? room.players.find((x) => Number(x.slot) === Number(slot)) : null;
    return p ? p.nama : `Pemain ${Number(slot) + 1}`;
  }

  function isMyTurn(room) {
    return !!room && room.status === "playing" && Number(room.turnSlot) === mySlot(room);
  }

  function onlineOf(absen) {
    const key = String(absen);
    if (Object.prototype.hasOwnProperty.call(st.presence, key)) {
      return serverNow() - (Number(st.presence[key]) || 0) < ONLINE_MS;
    }
    if (Number(absen) === Number(st.absen) && st.profile) {
      return serverNow() - (Number(st.profile.lastSeen) || 0) < ONLINE_MS;
    }
    return true;
  }

  function statusTeks(p) {
    if (p.status === "playing") return "In Game";
    if (p.status === "in_lobby") return "In Lobby";
    if (p.status === "online") return "Online";
    if (p.status === "offline") return "Offline";
    return onlineOf(p.absen) ? "Online" : "Offline";
  }

  function statusKelas(p) {
    const teks = statusTeks(p).toLowerCase().replace(/\s+/g, "-");
    return `is-${teks}`;
  }

  function pendingInvites() {
    const nowMs = serverNow();
    return st.invites.filter((inv) => inv && inv.status === "pending" && Number(inv.expiresAt) > nowMs);
  }

  function inviteById(id) {
    return st.invites.find((x) => x.id === id) || st.outbound.find((x) => x.id === id) || null;
  }

  /* ---------------- render akar ---------------- */

  function render() {
    const app = $("tv-app");
    if (!app) return;
    const layar = st.screen === "room" && st.room ? "room" : "hub";
    if (st._layar !== undefined && st._layar !== layar) {
      st._layar = layar;
      if (st.visible) window.scrollTo({ top: 0 });
    } else if (st._layar === undefined) {
      st._layar = layar;
    }
    if (!apiBase()) {
      app.innerHTML = renderSetup();
      updateBadges();
      return;
    }
    if (!st.absen) {
      app.innerHTML = renderGuest();
      updateBadges();
      return;
    }
    if (!st.token) {
      app.innerHTML = renderVerify();
      updateBadges();
      return;
    }
    if (!st.booted) {
      app.innerHTML = renderLoading();
      updateBadges();
      return;
    }
    if (st.screen === "room" && st.room) app.innerHTML = renderRoom();
    else app.innerHTML = renderHub();
    updateBadges();
  }

  function renderJikaBoleh() {
    if (!st.visible) return;
    const aktif = document.activeElement;
    if (aktif && (aktif.tagName === "INPUT" || aktif.tagName === "TEXTAREA" || aktif.tagName === "SELECT")) return;
    render();
  }

  function renderSetup() {
    return `
      <div class="tv-gate">
        <div class="tv-gate-card tv-gate-wide">
          <span class="tv-gate-icon" aria-hidden="true">🛠️</span>
          <h2>TableVerse belum tersambung</h2>
          <p>Backend multiplayer-nya ada di folder <code>tableverse-server</code>. Deploy gratis ke Vercel (tanpa Blaze), lalu isi alamatnya.</p>
          <ol class="tv-steps">
            <li>Deploy folder <code>tableverse-server</code> ke Vercel. Isi env <code>FIREBASE_SERVICE_ACCOUNT</code> dan <code>TV_SESSION_SECRET</code>.</li>
            <li>Buka <code>tableverse-config.js</code>, isi <code>window.TABLEVERSE_API</code> dengan URL fungsi Vercel-mu.</li>
            <li>Deploy <code>firestore.rules</code> supaya koleksi <code>tvPlayers</code>, <code>tvRooms</code>, <code>tvInvites</code>, dan <code>tvHistory</code> bisa dibaca realtime.</li>
          </ol>
          <p class="tv-muted">Petunjuk lengkap ada di <code>tableverse-server/README.md</code>.</p>
          ${st.setupError ? `<p class="tv-error">${esc(st.setupError)}</p>` : ""}
        </div>
      </div>`;
  }

  function renderGuest() {
    return `
      <div class="tv-gate">
        <div class="tv-gate-card">
          <span class="tv-gate-icon" aria-hidden="true">🎟️</span>
          <h2>Masuk dulu, ya</h2>
          <p>TableVerse memakai akun Web Kelas. Login supaya nama, statistik, dan riwayat pertandinganmu tersimpan di akun siswa.</p>
          <button type="button" class="tv-btn tv-btn-primary tv-btn-block" data-tv-login>Login Web Kelas</button>
          <small>Belum punya akun? Minta admin kelas membuatkannya.</small>
        </div>
      </div>`;
  }

  function renderVerify() {
    return `
      <div class="tv-gate">
        <div class="tv-gate-card">
          <span class="tv-gate-icon" aria-hidden="true">🔐</span>
          <h2>Verifikasi sekali</h2>
          <p>Pakai password akun kelasmu (password yang sama untuk login Web Kelas). Setelah ini TableVerse mengingat sesimu 30 hari di perangkat ini.</p>
          <form data-tv-verify class="tv-verify-form">
            <input type="password" name="password" id="tv-verify-password" autocomplete="current-password" placeholder="Password akun kelas" required>
            <p class="tv-error" data-tv-verify-error ${st.verifying ? "" : "hidden"}>${st.verifying ? "Menghubungkan..." : ""}</p>
            <button type="submit" class="tv-btn tv-btn-primary tv-btn-block" ${st.verifying ? "disabled" : ""}>${st.verifying ? "Menghubungkan..." : "Hubungkan"}</button>
          </form>
          <small>Password tidak disimpan di perangkat. Yang disimpan hanya token sesi acak dari server.</small>
        </div>
      </div>`;
  }

  function renderLoading() {
    return `
      <div class="tv-loading">
        <div class="tv-skel tv-skel-hero"></div>
        <div class="tv-skel-row">
          <div class="tv-skel"></div><div class="tv-skel"></div><div class="tv-skel"></div>
        </div>
        <div class="tv-skel-grid">
          <div class="tv-skel"></div><div class="tv-skel"></div><div class="tv-skel"></div>
        </div>
      </div>`;
  }

  function tabBtn(id, label, ikon) {
    return `<button type="button" class="tv-tab ${st.tab === id ? "is-active" : ""}" data-tv-tab="${id}">
      <span aria-hidden="true">${ikon}</span><span>${label}</span>
    </button>`;
  }

  function renderHub() {
    const stats = statsOf(st.profile);
    const n = pendingInvites().length;
    return `
      <div class="tv-shell">
        <div class="tv-topbar">
          <div class="tv-me">
            ${B.avatar ? B.avatar(st.profile ? st.profile.nama : st.nama, st.absen) : ""}
            <div class="tv-me-info">
              <strong>${esc((st.profile && (st.profile.username || st.profile.nama)) || st.nama)}</strong>
              <span class="tv-me-status ${st.online ? "is-online" : "is-offline"}"><i></i>${st.online ? "Online" : "Offline"}</span>
            </div>
          </div>
          <div class="tv-topbar-actions">
            <span class="tv-net ${st.syncFail ? "is-bad" : st.online ? "is-ok" : "is-bad"}">${st.syncFail ? "Menyambung ulang" : st.online ? "Terhubung" : "Offline"}</span>
            <button type="button" class="tv-invite-btn" data-tv-open-invites>
              <span aria-hidden="true">✉</span> Invitations
              <span class="tv-badge" data-tv-invite-badge ${n ? "" : "hidden"}>${n}</span>
            </button>
          </div>
        </div>
        ${st.room ? roomBanner(st.room) : ""}
        <nav class="tv-tabs" aria-label="Menu TableVerse">
          ${tabBtn("play", "Play Games", "🎲")}
          ${tabBtn("duel", "Duel Invitation", "⚔️")}
          ${tabBtn("active", "Active Games", "📡")}
          ${tabBtn("history", "Game History", "📜")}
          ${tabBtn("profile", "Player Profile", "👤")}
        </nav>
        <section class="tv-tab-body">
          ${tabContent(stats)}
        </section>
        <p class="tv-foot">TableVerse · board game hub kelas · statistik tersimpan di akunmu</p>
      </div>`;
  }

  function roomBanner(room) {
    const m = meta(room.gameId);
    const label = room.status === "lobby" ? "Menunggu pemain" : room.status === "playing" ? "Sedang main" : "Selesai";
    return `<button type="button" class="tv-room-banner" data-tv-open-room>
      <span class="tv-room-banner-art">${B.thumbnail ? B.thumbnail(room.gameId) : "🎲"}</span>
      <span class="tv-room-banner-info">
        <strong>${esc(m.judul)}</strong>
        <small>${label} · room ${esc(room.code || room.id)} · ${room.players.filter((p) => !p.left).length}/${room.maxPlayers} pemain</small>
      </span>
      <span class="tv-btn tv-btn-sm tv-btn-primary">Buka Room</span>
    </button>`;
  }

  function tabContent(stats) {
    if (st.tab === "duel") return renderDuelTab();
    if (st.tab === "active") return renderActiveTab();
    if (st.tab === "history") return renderHistoryTab();
    if (st.tab === "profile") return renderProfileTab(stats);
    return renderPlayTab(stats);
  }

  function renderPlayTab(stats) {
    const duel = semuaGame().filter((g) => g.mode === "duel");
    const party = semuaGame().filter((g) => g.mode === "party");
    return `
      <div class="tv-hero">
        <div class="tv-hero-copy">
          <span class="tv-kicker">Table Game Hub</span>
          <h1>Main meja bareng kelas</h1>
          <p>Catur, kartu, ular tangga, sampai Ludo. Buat room, tantang teman, dan main realtime — semua gerakan divalidasi server.</p>
        </div>
        <div class="tv-stat-row">
          <div class="tv-stat"><strong>${stats.matches}</strong><span>Main</span></div>
          <div class="tv-stat"><strong>${stats.wins}</strong><span>Menang</span></div>
          <div class="tv-stat"><strong>${stats.losses}</strong><span>Kalah</span></div>
          <div class="tv-stat"><strong>${stats.winRate}%</strong><span>Win rate</span></div>
        </div>
      </div>

      <div class="tv-section">
        <div class="tv-section-head">
          <div><span class="tv-kicker">Duel Mode</span><h2>1 vs 1</h2><p>Permainan cepat untuk dua pemain.</p></div>
        </div>
        <div class="tv-game-grid">
          ${duel.map(gameCard).join("")}
        </div>
      </div>

      <div class="tv-section">
        <div class="tv-section-head">
          <div><span class="tv-kicker">Party Mode</span><h2>2–4 pemain</h2><p>Main ramai-ramai di satu meja. Butuh minimal dua pemain siap.</p></div>
        </div>
        <div class="tv-game-grid">
          ${party.map(gameCard).join("")}
        </div>
      </div>`;
  }

  function gameCard(g) {
    return `
      <article class="tv-game-card tv-accent-${g.accent || "mint"}">
        <div class="tv-thumb">${B.thumbnail ? B.thumbnail(g.id) : "🎲"}</div>
        <div class="tv-game-body">
          <div class="tv-game-top">
            <h3>${esc(g.judul)}</h3>
            <span class="tv-chip">${esc(g.tag || (g.mode === "duel" ? "Duel" : "Party"))}</span>
          </div>
          <p>${esc(g.desc)}</p>
          <div class="tv-game-meta">
            <span>👥 ${g.mode === "duel" ? "2" : "2–4"} pemain</span>
            <span>${g.mode === "duel" ? "Duel" : "Party"}</span>
          </div>
          <button type="button" class="tv-btn tv-btn-primary tv-btn-block" data-tv-play="${g.id}">Play</button>
        </div>
      </article>`;
  }

  function renderDuelTab() {
    const game = meta(st.challengeGame || "ttt");
    const list = st.players.filter((p) => Number(p.absen) !== Number(st.absen));
    const rows = list.map((p) => {
      const cocok = st.playerQuery && !`${p.nama} ${p.username || ""}`.toLowerCase().includes(st.playerQuery);
      return `
        <div class="tv-player-row" data-name="${esc(`${p.nama} ${p.username || ""}`.toLowerCase())}" ${cocok ? "hidden" : ""}>
          ${B.avatar ? B.avatar(p.nama, p.absen) : ""}
          <div class="tv-player-info">
            <strong>${esc(p.nama)}</strong>
            <span class="tv-status ${statusKelas(p)}"><i></i>${statusTeks(p)}</span>
          </div>
          <button type="button" class="tv-btn tv-btn-sm ${p.status === "playing" ? "tv-btn-ghost" : "tv-btn-primary"}" data-tv-challenge="${p.absen}" ${p.status === "playing" ? "disabled" : ""}>
            ${p.status === "playing" ? "Sedang main" : "Challenge"}
          </button>
        </div>`;
    }).join("");

    return `
      <div class="tv-challenge">
        <div class="tv-section-head">
          <div>
            <span class="tv-kicker">Direct Challenge</span>
            <h2>Duel Invitation</h2>
            <p>Tantang teman langsung. Pilih game, kirim undangan, lalu tunggu responsnya.</p>
          </div>
          <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-refresh-players>Refresh</button>
        </div>

        <div class="tv-cg-row" role="group" aria-label="Game untuk tantangan">
          ${semuaGame().map((g) => `<button type="button" class="tv-cg-chip ${g.id === game.id ? "is-active" : ""}" data-tv-challenge-game="${g.id}">
            <span>${esc(g.judul)}</span><small>${g.mode === "duel" ? "1v1" : "2–4"}</small>
          </button>`).join("")}
        </div>

        <label class="tv-search-wrap">
          <span aria-hidden="true">🔎</span>
          <input type="search" class="tv-search" data-tv-search placeholder="Cari username teman..." value="${esc(st.playerQuery)}">
        </label>

        <div class="tv-player-list" id="tv-player-list">
          ${st.playersLoading && !st.players.length ? renderSkeletonRows(5) : rows || `<div class="tv-empty"><span>🫥</span><p>Belum ada teman lain yang bisa ditantang.</p></div>`}
        </div>
        <p class="tv-hint">Undangan berlaku 2 menit. Pemain yang sedang bermain tidak bisa diganggu.</p>
      </div>`;
  }

  function renderSkeletonRows(n) {
    let html = "";
    for (let i = 0; i < n; i += 1) html += `<div class="tv-player-row tv-row-skel"><span class="tv-skel-dot"></span><span class="tv-skel-line"></span></div>`;
    return html;
  }

  function renderActiveTab() {
    if (!st.room) {
      return `
        <div class="tv-empty tv-empty-big">
          <span aria-hidden="true">🪑</span>
          <h2>Belum ada room aktif</h2>
          <p>Buat room baru atau gabung room publik temanmu dari menu Play Games.</p>
          <button type="button" class="tv-btn tv-btn-primary" data-tv-tab="play">Cari Permainan</button>
        </div>`;
    }
    const room = st.room;
    const m = meta(room.gameId);
    const label = room.status === "lobby" ? "Waiting" : room.status === "playing" ? "Playing" : "Finished";
    return `
      <div class="tv-active">
        <div class="tv-active-card">
          <div class="tv-active-art">${B.thumbnail ? B.thumbnail(room.gameId) : "🎲"}</div>
          <div class="tv-active-info">
            <span class="tv-chip ${room.status === "playing" ? "is-live" : ""}">${label}</span>
            <h2>${esc(m.judul)}</h2>
            <p>Room ${esc(room.code || room.id)} · ${room.players.filter((p) => !p.left).length}/${room.maxPlayers} pemain · ${room.visibility === "private" ? "Private" : "Public"}</p>
            <div class="tv-active-players">
              ${room.players.filter((p) => !p.left).map((p) => `${B.avatar ? B.avatar(p.nama, p.absen, "tv-avatar-sm") : ""}<span>${esc(p.nama)}</span>`).join("")}
            </div>
          </div>
          <div class="tv-active-actions">
            <button type="button" class="tv-btn tv-btn-primary" data-tv-open-room>Buka Room</button>
            <button type="button" class="tv-btn tv-btn-ghost" data-tv-leave>Keluar</button>
          </div>
        </div>
        <p class="tv-hint">Room tetap hidup saat kamu pindah tab. Kembali kapan saja lewat menu ini.</p>
      </div>`;
  }

  function renderHistoryTab() {
    if (st.historyLoading) return `<div class="tv-skel-list">${renderSkeletonRows(5)}</div>`;
    if (!st.history.length) {
      return `
        <div class="tv-empty tv-empty-big">
          <span aria-hidden="true">📜</span>
          <h2>Belum ada riwayat</h2>
          <p>Selesaikan satu pertandingan, hasilnya otomatis tersimpan di sini.</p>
          <button type="button" class="tv-btn tv-btn-primary" data-tv-tab="play">Main Sekarang</button>
        </div>`;
    }
    return `
      <div class="tv-section-head">
        <div><span class="tv-kicker">Match History</span><h2>Game History</h2><p>30 pertandingan terakhir yang kamu mainkan.</p></div>
        <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-reload-history>Refresh</button>
      </div>
      <ul class="tv-history-list">
        ${st.history.map(historyRow).join("")}
      </ul>`;
  }

  function historyRow(h) {
    const absen = Number(st.absen);
    const menang = Array.isArray(h.winnerAbsens) && h.winnerAbsens.map(Number).includes(absen);
    const hasil = h.draw ? "draw" : menang ? "win" : "loss";
    const label = h.draw ? "Seri" : menang ? "Menang" : "Kalah";
    const lawan = (h.players || []).map((p) => (Number(p.absen) === absen ? "Kamu" : p.nama)).join(" vs ");
    return `
      <li class="tv-history-row is-${hasil}">
        <span class="tv-history-mark" aria-hidden="true">${h.draw ? "🤝" : menang ? "🏆" : "📕"}</span>
        <div class="tv-history-info">
          <strong>${esc(h.gameTitle || meta(h.gameId).judul)}</strong>
          <small>${esc(lawan)} · ${fmtTanggal(h.finishedAt)}</small>
        </div>
        <span class="tv-history-dur">${fmtDur(h.durationMs)}</span>
        <span class="tv-history-tag is-${hasil}">${label}</span>
      </li>`;
  }

  function renderProfileTab(stats) {
    const player = st.profileFresh || st.profile || {};
    let mostPlayed = "-";
    let most = 0;
    Object.keys(stats.perGame).forEach((id) => {
      const jumlah = Number(stats.perGame[id].matches) || 0;
      if (jumlah > most) {
        most = jumlah;
        mostPlayed = meta(id).judul;
      }
    });
    const rows = Object.keys(stats.perGame).map((id) => {
      const s = stats.perGame[id] || {};
      return `<li class="tv-pg-row">
        <span>${esc(meta(id).judul)}</span>
        <small>${Number(s.matches) || 0} main · ${Number(s.wins) || 0} menang · ${Number(s.losses) || 0} kalah</small>
      </li>`;
    }).join("");

    return `
      <div class="tv-profile">
        <div class="tv-profile-head">
          ${B.avatar ? B.avatar(player.nama || st.nama, st.absen, "tv-avatar-xl") : ""}
          <div>
            <span class="tv-kicker">Player Profile</span>
            <h2>${esc(player.nama || st.nama || "Siswa")}</h2>
            <p>@${esc(player.username || st.nama || "")} · absen ${esc(st.absen)}</p>
            <span class="tv-status ${st.online ? "is-online" : "is-offline"}"><i></i>${st.online ? "Online" : "Offline"}</span>
          </div>
          <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-reload-profile>Refresh</button>
        </div>

        <div class="tv-stat-grid">
          <div class="tv-stat-card"><span>Total Matches</span><strong>${stats.matches}</strong></div>
          <div class="tv-stat-card is-win"><span>Wins</span><strong>${stats.wins}</strong></div>
          <div class="tv-stat-card is-loss"><span>Losses</span><strong>${stats.losses}</strong></div>
          <div class="tv-stat-card"><span>Draws</span><strong>${stats.draws}</strong></div>
          <div class="tv-stat-card"><span>Win Rate</span><strong>${stats.winRate}%</strong></div>
          <div class="tv-stat-card"><span>Total Playtime</span><strong>${stats.playtime ? fmtDur(stats.playtime) : "0"}</strong></div>
        </div>

        <div class="tv-profile-games">
          <div class="tv-profile-most"><span>Game favorit</span><strong>${esc(mostPlayed)}</strong><small>${most ? `${most} pertandingan` : "Belum ada"}</small></div>
          ${rows ? `<ul class="tv-pg-list">${rows}</ul>` : `<p class="tv-muted">Statistik per game muncul setelah kamu menyelesaikan pertandingan.</p>`}
        </div>
      </div>`;
  }

  /* ---------------- render room ---------------- */

  function renderRoom() {
    const room = st.room;
    const m = meta(room.gameId);
    const host = isHost(room);
    const statusLabel = room.status === "lobby" ? "Waiting" : room.status === "playing" ? "Playing" : "Finished";
    return `
      <div class="tv-room tv-room-${room.status} tv-accent-${m.accent || "mint"}">
        <div class="tv-room-head">
          <button type="button" class="tv-back" data-tv-hub aria-label="Kembali ke TableVerse">←</button>
          <div class="tv-room-title">
            <span class="tv-kicker">${m.mode === "duel" ? "Duel Mode" : "Party Mode"} · ${room.visibility === "private" ? "Private Room" : "Public Room"}</span>
            <h2>${esc(m.judul)}</h2>
            <small>Room ${esc(room.code || room.id)} · ${room.players.filter((p) => !p.left).length}/${room.maxPlayers} pemain ${host ? "· kamu host" : ""}</small>
          </div>
          <span class="tv-room-status is-${room.status}">${statusLabel}</span>
        </div>
        ${renderSeats(room)}
        ${room.status === "lobby" ? renderLobby(room, host) : room.status === "playing" ? renderPlaying(room, host) : renderResult(room, host)}
      </div>`;
  }

  function renderSeats(room) {
    const turn = room.status === "playing" ? Number(room.turnSlot) : -1;
    return `<div class="tv-seat-grid">
      ${room.players.map((p) => {
        const host = Number(p.absen) === Number(room.hostAbsen);
        const kamu = Number(p.absen) === Number(st.absen);
        const online = onlineOf(p.absen);
        return `
          <div class="tv-seat tv-seat-${p.slot} ${p.left ? "is-left" : ""} ${turn === p.slot ? "is-turn" : ""}">
            <div class="tv-seat-avatar">
              ${B.avatar ? B.avatar(p.nama, p.absen) : ""}
              <span class="tv-seat-dot ${online ? "is-on" : "is-off"}" title="${online ? "Online" : "Koneksi terputus"}"></span>
            </div>
            <div class="tv-seat-info">
              <strong>${esc(p.nama)} ${host ? `<span class="tv-host-crown" title="Host">👑</span>` : ""} ${kamu ? `<span class="tv-you">Kamu</span>` : ""}</strong>
              <small class="tv-status ${online ? "is-online" : "is-offline"}"><i></i>${p.left ? "Keluar" : online ? "Online" : "Offline"}</small>
            </div>
            <div class="tv-seat-tags">
              ${room.status === "lobby" ? `<span class="tv-ready-tag ${p.ready ? "is-ready" : ""}">${p.ready ? "✓ Ready" : "Belum ready"}</span>` : ""}
              ${room.status === "playing" && turn === p.slot ? `<span class="tv-turn-pill">Giliran</span>` : ""}
              ${room.status === "lobby" && isHost(room) && !kamu ? `<button type="button" class="tv-kick" data-tv-kick="${p.absen}" title="Keluarkan pemain">✕</button>` : ""}
            </div>
          </div>`;
      }).join("")}
    </div>`;
  }

  function renderLobby(room, host) {
    const me = room.players.find((p) => Number(p.absen) === Number(st.absen));
    const aktif = room.players.filter((p) => !p.left);
    const semuaSiap = aktif.length > 0 && aktif.every((p) => p.ready);
    const cukup = aktif.length >= Number(room.minPlayers);
    const bisaMulai = host && semuaSiap && cukup && aktif.length <= Number(room.maxPlayers);
    let hint = "Semua pemain harus menekan Ready dulu.";
    if (!cukup) hint = `Butuh minimal ${room.minPlayers} pemain. Ajak teman lewat tombol Invite.`;
    else if (!semuaSiap) hint = "Masih ada pemain yang belum Ready.";
    else if (!host) hint = "Semua siap. Tunggu host memulai pertandingan.";
    else hint = "Semua siap! Kamu bisa mulai sekarang.";

    return `
      <div class="tv-lobby">
        <div class="tv-lobby-main">
          <h3>${aktif.length >= Number(room.minPlayers) ? "Siap main?" : "Tunggu pemain lain"}</h3>
          <p>${esc(hint)}</p>
          <div class="tv-room-code">
            <span>Kode room</span>
            <strong>${esc(room.code || room.id)}</strong>
            <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-copy-code>Salin</button>
          </div>
          <div class="tv-lobby-actions">
            <button type="button" class="tv-btn ${me && me.ready ? "tv-btn-ghost" : "tv-btn-primary"}" data-tv-ready>${me && me.ready ? "Batalkan Ready" : "Ready"}</button>
            ${host ? `<button type="button" class="tv-btn tv-btn-ghost" data-tv-invite-room>Invite</button>` : ""}
            <button type="button" class="tv-btn tv-btn-ghost" data-tv-visibility>${room.visibility === "private" ? "Jadikan Public" : "Jadikan Private"}</button>
            <button type="button" class="tv-btn tv-btn-danger" data-tv-leave>Keluar Room</button>
          </div>
          ${host ? `<button type="button" class="tv-btn tv-btn-primary tv-start" data-tv-start ${bisaMulai ? "" : "disabled"}>Mulai Pertandingan</button>` : `<p class="tv-waiting">Menunggu host memulai…</p>`}
        </div>
        <aside class="tv-lobby-side">
          <h4>Aturan ${esc(meta(room.gameId).judul)}</h4>
          <ul class="tv-rules">${aturanGame(room.gameId)}</ul>
        </aside>
      </div>`;
  }

  function aturanGame(gameId) {
    const aturan = {
      ttt: ["Pemain 1 memakai X, pemain 2 memakai O.", "Susun tiga simbol berderet (horizontal, vertikal, diagonal).", "Papan penuh tanpa pemenang = seri."],
      checkers: ["Bidak maju diagonal satu kotak.", "Lompatan wajib kalau ada kesempatan.", "Sampai baris terakhir jadi King dan bisa mundur."],
      chess: ["Putih jalan duluan, lalu bergantian.", "Skakmat menang; remis kalau tidak ada langkah legal.", "Promosi otomatis menjadi Ratu."],
      ludo: ["Butuh angka 6 untuk keluar dari base.", "Bidak yang bertemu lawan di kotak biasa akan ditangkap.", "Dapat 6 atau menangkap bidak = lempar lagi.", "Semua 4 bidak harus masuk rumah untuk menang."],
      snakes: ["Lempar dadu dan jalan otomatis.", "Naik tangga kalau berhenti di kaki tangga.", "Kena ular kalau berhenti di kepala ular.", "Dapat 6 = lempar lagi. Kotak 100 menang."],
      uno: ["Cocokkan warna atau angka dengan kartu di atas.", "Skip melewati pemain, Reverse membalik arah.", "+2 dan Wild +4 membuat lawan mengambil kartu.", "Kartu Wild butuh pilihan warna.", "Habiskan kartu duluan untuk menang."],
    }[gameId] || ["Main sportif, ya!"];
    return aturan.map((t) => `<li>${esc(t)}</li>`).join("");
  }

  function renderPlaying(room, host) {
    const my = mySlot(room);
    const turn = Number(room.turnSlot);
    const aktif = isMyTurn(room);
    const papan = B.papan ? B.papan(room.gameId, room, my, { hand: st.hand, sel: st.ui.sel }) : "";
    const handKurang = room.gameId === "uno" && room.status === "playing" && !st.handLoaded;
    return `
      <div class="tv-play-grid">
        <div class="tv-board-col">
          ${handKurang ? `<div class="tv-board-loading">Mengambil kartu dari server…<button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-retry-hand>Muat ulang</button></div>` : papan}
        </div>
        <aside class="tv-play-side">
          <div class="tv-turn-card ${aktif ? "is-mine" : ""}">
            <span class="tv-kicker">${aktif ? "Giliranmu" : "Giliran"}</span>
            <strong>${esc(namaSlot(room, turn))}</strong>
            <small>${aktif ? "Lakukan gerakanmu." : "Tunggu sampai giliranmu tiba."}</small>
          </div>
          ${room.lastEvent ? `<div class="tv-event"><span aria-hidden="true">📣</span><p>${esc(room.lastEvent)}</p></div>` : ""}
          <div class="tv-room-mini">
            <span>Room <strong>${esc(room.code || room.id)}</strong></span>
            <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-copy-code>Salin</button>
          </div>
          <button type="button" class="tv-btn tv-btn-danger tv-btn-block" data-tv-leave>${room.mode === "duel" ? "Menyerah & Keluar" : "Keluar (Forfeit)"}</button>
          <p class="tv-hint">Keluar saat pertandingan berjalan dihitung kalah.</p>
        </aside>
      </div>`;
  }

  function renderResult(room, host) {
    const result = room.result || {};
    const menang = Array.isArray(result.winners) ? result.winners : [];
    const judul = room.draw ? "Pertandingan berakhir seri" : menang.length ? `${menang.map((w) => w.nama).join(" & ")} menang!` : "Pertandingan selesai";
    const durasi = fmtDur(result.durationMs || ((room.finishedAt || 0) - (room.startedAt || 0)));
    return `
      <div class="tv-result">
        <div class="tv-result-icon" aria-hidden="true">${room.draw ? "🤝" : "🏆"}</div>
        <span class="tv-kicker">Match Result</span>
        <h3>${esc(judul)}</h3>
        <p>${esc(meta(room.gameId).judul)} · ${durasi}</p>
        <ul class="tv-result-list">
          ${room.players.map((p) => {
            const winner = !room.draw && Array.isArray(result.winners) && result.winners.some((w) => Number(w.absen) === Number(p.absen));
            const kamu = Number(p.absen) === Number(st.absen);
            return `<li class="${winner ? "is-winner" : room.draw ? "is-draw" : "is-loser"} ${p.left ? "is-left" : ""}">
              ${B.avatar ? B.avatar(p.nama, p.absen, "tv-avatar-sm") : ""}
              <span>${esc(p.nama)} ${kamu ? `<em>Kamu</em>` : ""}</span>
              <strong>${p.left ? "Keluar" : winner ? "Pemenang" : room.draw ? "Seri" : "Kalah"}</strong>
            </li>`;
          }).join("")}
        </ul>
        <div class="tv-result-actions">
          ${host ? `<button type="button" class="tv-btn tv-btn-primary" data-tv-rematch>Play Again</button>` : `<span class="tv-waiting">Tunggu host menekan Play Again…</span>`}
          <button type="button" class="tv-btn tv-btn-ghost" data-tv-back-hub>Back to TableVerse</button>
          <button type="button" class="tv-btn tv-btn-danger" data-tv-leave>Keluar Room</button>
        </div>
      </div>`;
  }

  /* ---------------- modal ---------------- */

  function renderModal() {
    const root = $("tv-modal-root");
    if (!root) return;
    if (!st.modal) {
      root.innerHTML = "";
      return;
    }
    let isi = "";
    if (st.modal.type === "game") isi = modalGame();
    else if (st.modal.type === "challenge") isi = modalChallenge();
    else if (st.modal.type === "invites") isi = modalInvites();
    else if (st.modal.type === "wild") isi = modalWild();
    else if (st.modal.type === "inviteRoom") isi = modalInviteRoom();
    root.innerHTML = `<div class="tv-modal-wrap" role="dialog" aria-modal="true">
      <div class="tv-modal-backdrop" data-tv-close></div>
      <div class="tv-modal">
        <button type="button" class="tv-modal-x" data-tv-close aria-label="Tutup">×</button>
        ${isi}
      </div>
    </div>`;
  }

  function modalGame() {
    const g = meta(st.modal.gameId);
    const rooms = st.modal.rooms || [];
    let daftar = `<div class="tv-empty"><span>🪑</span><p>Belum ada room publik. Buat satu dan tunggu teman bergabung.</p></div>`;
    if (st.modal.loading) daftar = `<div class="tv-skel-list">${renderSkeletonRows(3)}</div>`;
    else if (rooms.length) {
      daftar = rooms.map((room) => {
        const host = room.players.find((p) => Number(p.absen) === Number(room.hostAbsen));
        const penuh = room.players.length >= room.maxPlayers;
        const sendiri = Number(room.hostAbsen) === Number(st.absen);
        return `<div class="tv-room-row">
          <div class="tv-room-row-main">
            ${B.avatar ? B.avatar(host ? host.nama : "Host", room.hostAbsen) : ""}
            <div>
              <strong>${esc(host ? host.nama : "Host")} ${sendiri ? `<span class="tv-you">Kamu</span>` : ""}</strong>
              <small>${room.players.length}/${room.maxPlayers} pemain · ${esc(room.gameTitle || g.judul)}</small>
            </div>
          </div>
          <button type="button" class="tv-btn tv-btn-sm ${penuh ? "tv-btn-ghost" : "tv-btn-primary"}" data-tv-join-room="${esc(room.id)}" ${penuh ? "disabled" : ""}>${sendiri ? "Lanjut" : penuh ? "Penuh" : "Join"}</button>
        </div>`;
      }).join("");
    }
    return `
      <div class="tv-modal-head">
        <div class="tv-modal-thumb">${B.thumbnail ? B.thumbnail(g.id) : "🎲"}</div>
        <div>
          <span class="tv-kicker">${g.mode === "duel" ? "Duel Mode" : "Party Mode"} · ${g.mode === "duel" ? "2 pemain" : "2–4 pemain"}</span>
          <h3>${esc(g.judul)}</h3>
          <p>${esc(g.desc)}</p>
        </div>
      </div>
      <div class="tv-create-row">
        <button type="button" class="tv-btn tv-btn-primary" data-tv-create="public">Buat Public Room</button>
        <button type="button" class="tv-btn tv-btn-ghost" data-tv-create="private">Buat Private Room</button>
      </div>
      <div class="tv-join-code">
        <label for="tv-room-code-input">Masuk pakai kode room</label>
        <div class="tv-row">
          <input id="tv-room-code-input" type="text" maxlength="16" placeholder="Contoh: A1B2C3D4E5F6" autocomplete="off">
          <button type="button" class="tv-btn tv-btn-ghost" data-tv-join-code>Join</button>
        </div>
      </div>
      <div class="tv-modal-section">
        <div class="tv-modal-sub"><h4>Room Publik</h4><button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-reload-rooms>Refresh</button></div>
        <div class="tv-room-list">${daftar}</div>
      </div>`;
  }

  function modalChallenge() {
    const g = meta(st.modal.gameId);
    const maxTarget = Math.max(1, Number(g.mode === "duel" ? 2 : 4) - 1);
    const targets = st.modal.targets || [];
    const list = st.players.filter((p) => Number(p.absen) !== Number(st.absen));
    const rows = list.map((p) => {
      const dipilih = targets.includes(Number(p.absen));
      return `<label class="tv-target ${dipilih ? "is-sel" : ""}">
        <input type="checkbox" data-tv-target="${p.absen}" ${dipilih ? "checked" : ""}>
        ${B.avatar ? B.avatar(p.nama, p.absen, "tv-avatar-sm") : ""}
        <span class="tv-target-info"><strong>${esc(p.nama)}</strong><small class="tv-status ${statusKelas(p)}"><i></i>${statusTeks(p)}</small></span>
      </label>`;
    }).join("");
    return `
      <h3>Kirim Undangan</h3>
      <p class="tv-modal-desc">Pilih game dan pemain. Untuk mode ini maksimal ${maxTarget} pemain diundang.</p>
      <div class="tv-challenge-games">
        ${semuaGame().map((game) => `<button type="button" class="tv-cg-chip ${game.id === g.id ? "is-active" : ""}" data-tv-cg="${game.id}">
          <span>${esc(game.judul)}</span><small>${game.mode === "duel" ? "1v1" : "2–4"}</small>
        </button>`).join("")}
      </div>
      <div class="tv-target-list">
        ${st.playersLoading && !st.players.length ? renderSkeletonRows(4) : rows || `<p class="tv-muted">Tidak ada pemain lain.</p>`}
      </div>
      <div class="tv-modal-actions">
        <span class="tv-pick-count" data-tv-pick-count>${targets.length}/${maxTarget} dipilih</span>
        <button type="button" class="tv-btn tv-btn-primary" data-tv-send-invite ${targets.length ? "" : "disabled"}>Kirim Undangan</button>
      </div>`;
  }

  function modalInvites() {
    const nowMs = serverNow();
    const masuk = (st.invites || []).filter((i) => i && (i.status === "pending" || i.status === "accepted" || i.status === "declined" || i.status === "expired")).slice(0, 12);
    const masukHtml = masuk.length ? masuk.map((inv) => {
      const g = meta(inv.gameId);
      const sisa = Number(inv.expiresAt) - nowMs;
      const aktif = inv.status === "pending" && sisa > 0;
      const status = inv.status === "pending" ? (sisa > 0 ? "Menunggu" : "Kedaluwarsa") : inv.status === "accepted" ? "Diterima" : inv.status === "declined" ? "Ditolak" : "Kedaluwarsa";
      return `<div class="tv-invite-row ${aktif ? "is-pending" : "is-done"}" data-tv-invite-row="${esc(inv.id)}">
        ${B.avatar ? B.avatar(inv.fromNama, inv.fromAbsen) : ""}
        <div class="tv-invite-info">
          <strong>${esc(inv.fromNama)}</strong>
          <small>${esc(g.judul)} · ${g.mode === "duel" ? "Duel" : "Party"} · ${status}</small>
          <span class="tv-invite-time" data-tv-expire="${esc(inv.id)}">${aktif ? `Kedaluwarsa dalam ${sisaTeks(sisa)}` : status}</span>
        </div>
        ${aktif ? `<div class="tv-invite-actions">
          <button type="button" class="tv-btn tv-btn-primary tv-btn-sm" data-tv-accept="${esc(inv.id)}">Accept</button>
          <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-tv-decline="${esc(inv.id)}">Decline</button>
          <button type="button" class="tv-btn tv-btn-text tv-btn-sm" data-tv-ignore="${esc(inv.id)}">Ignore</button>
        </div>` : `<span class="tv-chip">${status}</span>`}
      </div>`;
    }).join("") : `<div class="tv-empty"><span>📭</span><p>Belum ada undangan masuk.</p></div>`;

    const keluar = (st.outbound || []).filter((i) => i).slice(0, 12);
    const keluarHtml = keluar.length ? keluar.map((inv) => {
      const g = meta(inv.gameId);
      const sisa = Number(inv.expiresAt) - nowMs;
      const status = inv.status === "pending" ? (sisa > 0 ? `Menunggu · ${sisaTeks(sisa)}` : "Kedaluwarsa") : inv.status === "accepted" ? "Diterima" : inv.status === "declined" ? "Ditolak" : "Kedaluwarsa";
      return `<div class="tv-invite-row is-out">
        ${B.avatar ? B.avatar(inv.toNama, inv.toAbsen, "tv-avatar-sm") : ""}
        <div class="tv-invite-info">
          <strong>${esc(inv.toNama)}</strong>
          <small>${esc(g.judul)} · ${status}</small>
        </div>
        <span class="tv-chip ${inv.status === "accepted" ? "is-live" : ""}">${inv.status === "pending" && sisa > 0 ? "Pending" : inv.status === "accepted" ? "Diterima" : inv.status === "declined" ? "Ditolak" : "Expired"}</span>
      </div>`;
    }).join("") : `<p class="tv-muted">Kamu belum mengundang siapa pun.</p>`;

    return `
      <div class="tv-modal-invite-head">
        <h3>Invitations</h3>
        <span class="tv-badge tv-badge-inline" data-tv-invite-badge ${pendingInvites().length ? "" : "hidden"}>${pendingInvites().length}</span>
      </div>
      <p class="tv-modal-desc">Undangan berlaku 2 menit. Terima untuk langsung masuk room.</p>
      <h4 class="tv-modal-subhead">Masuk</h4>
      <div class="tv-invite-list">${masukHtml}</div>
      <h4 class="tv-modal-subhead">Keluar</h4>
      <div class="tv-invite-list">${keluarHtml}</div>`;
  }

  function modalWild() {
    return `
      <h3>Pilih warna Wild</h3>
      <p class="tv-modal-desc">Kartu Wild butuh warna untuk lanjut permainan.</p>
      <div class="tv-wild-grid">
        <button type="button" class="tv-wild is-r" data-tv-wild="r">Merah</button>
        <button type="button" class="tv-wild is-y" data-tv-wild="y">Kuning</button>
        <button type="button" class="tv-wild is-g" data-tv-wild="g">Hijau</button>
        <button type="button" class="tv-wild is-b" data-tv-wild="b">Biru</button>
      </div>`;
  }

  function modalInviteRoom() {
    const room = st.room;
    if (!room) return `<p>Room tidak ditemukan.</p>`;
    const anggota = new Set(room.players.map((p) => Number(p.absen)));
    const sisaSlot = Math.max(0, Number(room.maxPlayers) - room.players.filter((p) => !p.left).length);
    const targets = st.modal.targets || [];
    const list = st.players.filter((p) => !anggota.has(Number(p.absen)) && Number(p.absen) !== Number(st.absen));
    const rows = list.map((p) => {
      const dipilih = targets.includes(Number(p.absen));
      return `<label class="tv-target ${dipilih ? "is-sel" : ""}">
        <input type="checkbox" data-tv-target="${p.absen}" ${dipilih ? "checked" : ""} ${sisaSlot === 0 ? "disabled" : ""}>
        ${B.avatar ? B.avatar(p.nama, p.absen, "tv-avatar-sm") : ""}
        <span class="tv-target-info"><strong>${esc(p.nama)}</strong><small class="tv-status ${statusKelas(p)}"><i></i>${statusTeks(p)}</small></span>
      </label>`;
    }).join("");
    return `
      <h3>Undang ke Room</h3>
      <p class="tv-modal-desc">Sisa slot: ${sisaSlot}. Undangan berlaku 2 menit.</p>
      <div class="tv-target-list">
        ${st.playersLoading && !st.players.length ? renderSkeletonRows(4) : rows || `<p class="tv-muted">Semua pemain sudah di room atau belum ada pemain lain.</p>`}
      </div>
      <div class="tv-modal-actions">
        <span class="tv-pick-count">${targets.length}/${sisaSlot} dipilih</span>
        <button type="button" class="tv-btn tv-btn-primary" data-tv-send-room-invite ${targets.length && sisaSlot ? "" : "disabled"}>Kirim Undangan</button>
      </div>`;
  }

  /* ---------------- data & realtime ---------------- */

  function lepasPresence() {
    st.presenceUnsubs.forEach((fn) => {
      try { fn(); } catch (err) { /* abaikan */ }
    });
    st.presenceUnsubs = [];
    st.presenceKey = "";
    st.presence = {};
  }

  function pasangPresence(room) {
    if (!room || !Array.isArray(room.players)) return;
    const absens = room.players.map((p) => Number(p.absen)).sort((a, b) => a - b);
    const kunci = absens.join(",");
    if (kunci === st.presenceKey) return;
    lepasPresence();
    st.presenceKey = kunci;
    const fs = firestore();
    if (!fs) return;
    absens.forEach((absen) => {
      try {
        const unsub = fs.collection("tvPlayers").doc(String(absen)).onSnapshot((snap) => {
          if (!snap.exists) return;
          const data = snap.data() || {};
          st.presence[String(absen)] = Number(data.lastSeen) || 0;
          if (st.visible && st.screen === "room") renderJikaBoleh();
        }, () => {});
        st.presenceUnsubs.push(unsub);
      } catch (err) {
        /* presence opsional */
      }
    });
  }

  function lepasRoom() {
    if (st.roomUnsub) {
      try { st.roomUnsub(); } catch (err) { /* abaikan */ }
    }
    st.roomUnsub = null;
    lepasPresence();
  }

  function kosongkanRoom() {
    lepasRoom();
    st.room = null;
    st.roomId = null;
    st.hand = [];
    st.handLoaded = false;
    st.handVersion = 0;
    st.ui.sel = null;
  }

  function langgananRoom(id) {
    if (!id) return;
    if (st.roomId === id && st.roomUnsub) return;
    lepasRoom();
    st.roomId = id;
    st.roomSnapshotOk = false;
    const fs = firestore();
    if (!fs) return;
    try {
      st.roomUnsub = fs.collection("tvRooms").doc(String(id)).onSnapshot((snap) => {
        if (!snap.exists) {
          if (st.room && Date.now() - st.roomSetAt < 4000) return;
          kosongkanRoom();
          if (st.visible) render();
          syncRingan();
          return;
        }
        st.roomSnapshotOk = true;
        const lama = st.room;
        const room = snap.data() || {};
        st.room = room;
        st.roomId = room.id || id;
        st.roomSetAt = Date.now();
        if (!lama || lama.status !== room.status || lama.seq !== room.seq) st.ui.sel = null;
        if (room.status === "playing" && room.gameId === "uno") {
          const hv = Number((room.handVersions || {})[String(st.absen)]) || 0;
          if (hv !== Number(st.handVersion)) jadwalkanMuatState();
        }
        if (room.status === "finished" && (!lama || lama.status !== "finished")) {
          muatProfil(true);
          st.historyAt = 0;
        }
        pasangPresence(room);
        if (st.visible) render();
      }, (err) => {
        console.warn("TableVerse room listener:", err);
        st.roomSnapshotOk = false;
        if (st.visible) toast("Koneksi realtime room terputus. Mencoba lagi…", "warn");
      });
    } catch (err) {
      st.roomSnapshotOk = false;
    }
  }

  function jadwalkanMuatState() {
    if (st.stateTimer) return;
    st.stateTimer = window.setTimeout(() => {
      st.stateTimer = null;
      muatState(true);
    }, 180);
  }

  async function muatState(diam) {
    if (!st.roomId || !st.token || st.stateLoading) return;
    st.stateLoading = true;
    try {
      const res = await api("state", { roomId: st.roomId });
      if (res.room) {
        st.room = res.room;
        st.roomSetAt = Date.now();
        if (st.roomId !== res.room.id) langgananRoom(res.room.id);
        else pasangPresence(res.room);
        if (Array.isArray(res.hand)) {
          st.hand = res.hand;
          st.handLoaded = true;
          st.handVersion = Number(res.handVersion) || 0;
        } else {
          st.handVersion = Number(res.handVersion) || Number((res.room.handVersions || {})[String(st.absen)]) || 0;
        }
      } else {
        kosongkanRoom();
        if (st.screen === "room") st.screen = "hub";
      }
    } catch (err) {
      if (!diam) {
        if (err.status === 401) toast(err.message, "warn");
        else toast(err.message, "error");
      }
    } finally {
      st.stateLoading = false;
      if (st.visible) render();
    }
  }

  function terapkanRoomRespon(res) {
    if (!res || !res.room) return;
    const room = res.room;
    st.room = room;
    st.roomId = room.id;
    st.roomSetAt = Date.now();
    if (!st.roomUnsub || st.roomId !== room.id) langgananRoom(room.id);
    pasangPresence(room);
    if (room.status === "playing" && room.gameId === "uno") {
      if (Array.isArray(res.hand)) {
        st.hand = res.hand;
        st.handLoaded = true;
        st.handVersion = Number(res.handVersion) || Number((room.handVersions || {})[String(st.absen)]) || 0;
      } else {
        jadwalkanMuatState();
      }
    }
  }

  function terapkanSync(res, diam) {
    if (!res) return;
    st.booted = true;
    st.syncFail = false;
    if (res.profile) {
      st.profile = res.profile;
      st.nama = res.profile.nama || st.nama;
      simpanCacheProfil(res.profile);
    }
    if (res.currentRoom) {
      const lama = st.room;
      if (!lama || lama.id !== res.currentRoom.id || Number(res.currentRoom.seq) >= Number(lama.seq)) {
        st.room = res.currentRoom;
        st.roomSetAt = Date.now();
      }
      st.roomId = res.currentRoom.id;
      if (st.visible) {
        if (st.roomId !== res.currentRoom.id || !st.roomUnsub) langgananRoom(res.currentRoom.id);
        pasangPresence(st.room);
      }
    } else if (st.roomId) {
      kosongkanRoom();
      if (st.screen === "room") st.screen = "hub";
    }
    if (st.visible && !diam) render();
    else if (st.visible) renderJikaBoleh();
    updateBadges();
  }

  async function bootstrap() {
    if (!st.token || !st.absen) return;
    if (st.bootPromise) return st.bootPromise;
    st.booting = true;
    st.bootPromise = (async () => {
      try {
        const res = await api("sync");
        terapkanSync(res, true);
      } catch (err) {
        if (err.status === 401) {
          st.token = "";
          st.booted = false;
          st.profile = null;
        } else {
          st.syncFail = true;
          st.setupError = err.code === "server-unconfigured" ? err.message : "";
          if (st.visible) toast(err.message, "error");
        }
      } finally {
        st.booting = false;
        st.bootPromise = null;
        if (st.visible) render();
      }
    })();
    return st.bootPromise;
  }

  async function syncRingan() {
    if (!st.token) return;
    try {
      const res = await api("sync");
      terapkanSync(res, true);
      updateBadges();
    } catch (err) {
      if (err.status === 401) {
        if (st.visible) render();
      } else {
        st.syncFail = true;
        updateBadges();
      }
    }
  }

  async function muatProfil(paksa) {
    if (!st.token) return;
    if (!paksa && st.profileAt && Date.now() - st.profileAt < 30000) return;
    try {
      const res = await api("profile");
      st.profileFresh = res.player;
      st.profileAt = Date.now();
      if (res.player) {
        st.profile = res.player;
        simpanCacheProfil(res.player);
      }
      if (st.visible && st.tab === "profile") renderJikaBoleh();
    } catch (err) {
      /* diam */
    }
  }

  async function muatRiwayat(paksa) {
    if (!st.token || st.historyLoading) return;
    if (!paksa && st.historyAt && Date.now() - st.historyAt < 30000) return;
    st.historyLoading = true;
    if (st.visible && st.tab === "history") render();
    try {
      const res = await api("history");
      st.history = res.history || [];
      st.historyAt = Date.now();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      st.historyLoading = false;
      if (st.visible) renderJikaBoleh();
    }
  }

  async function muatPemain(paksa) {
    if (!st.token || st.playersLoading) return;
    if (!paksa && st.players.length && Date.now() - st.playersAt < 60000) return;
    st.playersLoading = true;
    if (st.visible && st.tab === "duel" && !st.modal) render();
    try {
      const res = await api("players");
      st.players = res.players || [];
      st.playersAt = Date.now();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      st.playersLoading = false;
      if (st.modal) renderModal();
      else if (st.visible) renderJikaBoleh();
    }
  }

  /* ---------------- invitasi realtime ---------------- */

  function langgananInvites() {
    if (st.invitesUnsub) {
      try { st.invitesUnsub(); } catch (err) { /* abaikan */ }
      st.invitesUnsub = null;
    }
    st.invites = [];
    st.outbound = [];
    st.knownInvites = new Set();
    st.invitesSiap = false;
    st.snapshotInvites = false;
    st.outboundSeen = {};
    st.outboundSiap = false;
    if (!st.absen) return;
    const fs = firestore();
    if (fs) {
      try {
        st.invitesUnsub = fs.collection("tvInvites")
          .where("toAbsen", "==", Number(st.absen))
          .onSnapshot((snap) => {
            const list = [];
            snap.forEach((doc) => list.push(doc.data()));
            list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
            const baru = list.filter((inv) => inv.status === "pending" && !st.knownInvites.has(inv.id));
            list.forEach((inv) => st.knownInvites.add(inv.id));
            st.invites = list;
            st.snapshotInvites = true;
            if (st.invitesSiap && baru.length) {
              const inv = baru[0];
              toast(`${inv.fromNama} mengundangmu main ${meta(inv.gameId).judul}!`, "invite");
            }
            st.invitesSiap = true;
            updateBadges();
            if (st.modal && st.modal.type === "invites") renderModal();
          }, (err) => {
            console.warn("TableVerse invite listener:", err);
            st.snapshotInvites = false;
          });
      } catch (err) {
        st.snapshotInvites = false;
      }
    }
    refreshInvites();
  }

  async function refreshInvites() {
    if (!st.token || !st.absen || st.inviteRefreshing) return;
    st.inviteRefreshing = true;
    try {
      const res = await api("myInvites");
      if (!st.snapshotInvites) st.invites = res.inbound || [];
      st.outbound = res.outbound || [];
      const sekarang = {};
      st.outbound.forEach((inv) => {
        const lama = st.outboundSeen[inv.id];
        sekarang[inv.id] = inv.status;
        if (st.outboundSiap && lama === "pending" && inv.status !== "pending") {
          if (inv.status === "accepted") toast(`${inv.toNama} menerima undanganmu!`, "ok");
          else if (inv.status === "declined") toast(`${inv.toNama} menolak undanganmu.`, "warn");
          else if (inv.status === "expired") toast(`Undangan untuk ${inv.toNama} kedaluwarsa.`, "warn");
        }
      });
      st.outboundSeen = sekarang;
      st.outboundSiap = true;
      updateBadges();
      if (st.modal && st.modal.type === "invites") renderModal();
      if (st.visible && st.screen === "room") renderJikaBoleh();
    } catch (err) {
      /* diam: listener Firestore tetap jalan */
    } finally {
      st.inviteRefreshing = false;
    }
  }

  function updateBadges() {
    const n = pendingInvites().length;
    document.querySelectorAll("[data-tv-invite-badge]").forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
    const fab = $("tv-floating-invite");
    if (fab) {
      fab.hidden = !(st.absen && n > 0);
      const badge = fab.querySelector("[data-tv-floating-count]");
      if (badge) badge.textContent = String(n);
    }
    updateTopStatus();
  }

  function updateTopStatus() {
    const el = $("tv-top-status");
    if (!el) return;
    const n = pendingInvites().length;
    if (n) {
      el.textContent = `✉ ${n} undangan`;
      el.classList.add("tv-top-warn");
    } else if (!apiBase()) {
      el.textContent = "TableVerse";
      el.classList.remove("tv-top-warn");
    } else {
      el.textContent = st.absn ? (st.online ? "● Online" : "● Offline") : "TableVerse";
      el.classList.remove("tv-top-warn");
    }
  }

  function tick() {
    if (!st.inited) return;
    document.querySelectorAll("[data-tv-expire]").forEach((el) => {
      const inv = inviteById(el.getAttribute("data-tv-expire"));
      if (!inv) return;
      const sisa = Number(inv.expiresAt) - serverNow();
      if (inv.status === "pending" && sisa > 0) el.textContent = `Kedaluwarsa dalam ${sisaTeks(sisa)}`;
      else if (inv.status === "pending") el.textContent = "Kedaluwarsa";
    });
    const n = pendingInvites().length;
    document.querySelectorAll("[data-tv-invite-badge]").forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
    const fab = $("tv-floating-invite");
    if (fab) {
      fab.hidden = !(st.absen && n > 0);
      const badge = fab.querySelector("[data-tv-floating-count]");
      if (badge) badge.textContent = String(n);
    }
    updateTopStatus();
  }

  /* ---------------- aksi ---------------- */

  async function panggil(action, payload) {
    if (!st.token) {
      render();
      return null;
    }
    try {
      return await api(action, payload);
    } catch (err) {
      if (err.status === 401) {
        st.setupError = err.code === "server-unconfigured" ? err.message : "";
        render();
        toast(err.message, "warn");
      } else {
        toast(err.message, "error");
      }
      return null;
    }
  }

  function setBusy(nilai) {
    st.busy = nilai;
    const app = $("tv-app");
    if (app) app.classList.toggle("tv-busy", !!nilai);
  }

  async function kirimGerakan(move) {
    if (st.busy || !st.roomId) return;
    setBusy(true);
    try {
      const res = await api("move", { roomId: st.roomId, move });
      terapkanRoomRespon(res);
      if (Array.isArray(res.hand)) {
        st.hand = res.hand;
        st.handLoaded = true;
        st.handVersion = Number(res.handVersion) || st.handVersion;
      }
      st.ui.sel = null;
      st.modal = null;
      renderModal();
      render();
    } catch (err) {
      toast(err.message, "error");
      if (err.status === 401) render();
    } finally {
      setBusy(false);
    }
  }

  async function aksiReady() {
    const room = st.room;
    if (!room || st.busy) return;
    const me = room.players.find((p) => Number(p.absen) === Number(st.absen));
    if (!me) return;
    setBusy(true);
    try {
      const res = await api("ready", { roomId: room.id, ready: !me.ready });
      if (res.room) {
        st.room = res.room;
        st.roomSetAt = Date.now();
        render();
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function aksiMulai() {
    if (!st.room || st.busy) return;
    setBusy(true);
    try {
      const res = await api("start", { roomId: st.room.id });
      terapkanRoomRespon(res);
      if (Array.isArray(res.hand)) {
        st.hand = res.hand;
        st.handLoaded = true;
        st.handVersion = Number(res.handVersion) || 0;
      }
      st.screen = "room";
      st.ui.sel = null;
      render();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function aksiRematch() {
    if (!st.room || st.busy) return;
    setBusy(true);
    try {
      const res = await api("rematch", { roomId: st.room.id });
      st.room = res.room || st.room;
      st.roomSetAt = Date.now();
      st.hand = [];
      st.handLoaded = false;
      st.handVersion = 0;
      st.ui.sel = null;
      render();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function aksiKeluar(diam) {
    const room = st.room;
    if (!room || st.busy) return;
    if (!diam) {
      const pesan = room.status === "playing"
        ? "Keluar sekarang? Pertandingan akan dihitung kalah."
        : "Keluar dari room ini?";
      if (!window.confirm(pesan)) return;
    }
    setBusy(true);
    try {
      const res = await api("leaveRoom", { roomId: room.id });
      kosongkanRoom();
      st.screen = "hub";
      st.modal = null;
      renderModal();
      render();
      toast(res && res.finished ? "Pertandingan selesai. Kamu keluar dari room." : "Kamu keluar dari room.", "info");
      syncRingan();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function aksiVisibility() {
    if (!st.room || st.busy) return;
    const target = st.room.visibility === "private" ? "public" : "private";
    setBusy(true);
    try {
      const res = await api("visibility", { roomId: st.room.id, visibility: target });
      if (res.room) {
        st.room = res.room;
        st.roomSetAt = Date.now();
        render();
      }
      toast(`Room sekarang ${target === "public" ? "Public" : "Private"}.`, "ok");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function aksiKick(absen) {
    if (!st.room || st.busy) return;
    const pemain = st.room.players.find((p) => Number(p.absen) === Number(absen));
    if (!pemain) return;
    if (!window.confirm(`Keluarkan ${pemain.nama} dari room?`)) return;
    setBusy(true);
    try {
      const res = await api("kick", { roomId: st.room.id, absen });
      if (res.room) {
        st.room = res.room;
        st.roomSetAt = Date.now();
        render();
      }
      toast(`${pemain.nama} dikeluarkan.`, "info");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function bukaGame(gameId) {
    st.modal = { type: "game", gameId, rooms: [], loading: true };
    renderModal();
    muatRooms(gameId);
  }

  async function muatRooms(gameId) {
    try {
      const res = await api("listRooms", { gameId });
      if (st.modal && st.modal.type === "game" && st.modal.gameId === gameId) {
        st.modal.rooms = res.rooms || [];
        st.modal.loading = false;
        renderModal();
      }
    } catch (err) {
      if (st.modal && st.modal.type === "game") {
        st.modal.loading = false;
        st.modal.rooms = [];
        renderModal();
      }
      toast(err.message, "error");
    }
  }

  async function buatRoom(visibility) {
    if (!st.modal || st.modal.type !== "game" || st.busy) return;
    const gameId = st.modal.gameId;
    setBusy(true);
    try {
      const res = await api("createRoom", { gameId, visibility });
      if (res.room) {
        st.modal = null;
        renderModal();
        terapkanRoomRespon(res);
        st.screen = "room";
        st.ui.sel = null;
        st.hand = [];
        st.handLoaded = false;
        st.handVersion = 0;
        render();
        if (res.reused) toast("Kamu sudah punya room aktif. Lanjutkan di sini.", "info");
        else toast(visibility === "private" ? "Private room dibuat. Bagikan kodenya." : "Public room dibuat. Tunggu pemain lain.", "ok");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function gabungRoom(roomId, code) {
    if (!st.token || !roomId || st.busy) return;
    setBusy(true);
    try {
      const res = await api("joinRoom", { roomId, code });
      if (res.expired) {
        toast(res.message || "Undangan sudah kedaluwarsa.", "warn");
        refreshInvites();
        renderModal();
        return;
      }
      if (res.room) {
        st.modal = null;
        renderModal();
        terapkanRoomRespon(res);
        st.screen = "room";
        st.ui.sel = null;
        st.hand = [];
        st.handLoaded = false;
        st.handVersion = 0;
        render();
        toast(res.joined === false ? "Kamu sudah di room ini." : "Berhasil masuk room.", "ok");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function bukaChallenge(target) {
    const current = st.challengeGame || "ttt";
    st.modal = { type: "challenge", gameId: current, targets: target ? [Number(target)] : [] };
    renderModal();
    if (!st.players.length) muatPemain();
  }

  function bukaInvites() {
    st.modal = { type: "invites" };
    renderModal();
    refreshInvites();
  }

  async function kirimUndangan(gameId, targets) {
    if (!st.token || !targets.length || st.busy) return;
    setBusy(true);
    try {
      const res = await api("invite", { gameId, toAbsen: targets });
      st.modal = null;
      renderModal();
      if (res.room) {
        terapkanRoomRespon(res);
        st.screen = "room";
        st.hand = [];
        st.handLoaded = false;
        st.handVersion = 0;
      }
      render();
      const lewat = (res.skipped || []).length;
      toast(`Undangan terkirim${lewat ? ` (${lewat} pemain dilewati)` : ""}.`, lewat ? "warn" : "ok");
      refreshInvites();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function jawabUndangan(id, accept) {
    if (!st.token || st.modalBusy) return;
    st.modalBusy = true;
    try {
      const res = await api("respondInvite", { inviteId: id, accept });
      if (res.expired) {
        toast(res.message || "Undangan sudah kedaluwarsa.", "warn");
        refreshInvites();
        renderModal();
        return;
      }
      if (accept) {
        st.modal = null;
        renderModal();
        if (res.room) {
          terapkanRoomRespon(res);
          st.screen = "room";
          st.hand = [];
          st.handLoaded = false;
          st.handVersion = 0;
          st.ui.sel = null;
        }
        toast("Kamu masuk room. Tekan Ready kalau sudah siap.", "ok");
        refreshInvites();
      } else {
        toast("Undangan ditolak.", "info");
        refreshInvites();
        renderModal();
      }
      render();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      st.modalBusy = false;
    }
  }

  async function kirimUndanganRoom() {
    if (!st.modal || st.modal.type !== "inviteRoom" || !st.room) return;
    const targets = st.modal.targets || [];
    if (!targets.length) return;
    await kirimUndangan(st.room.gameId, targets);
  }

  function salinKode() {
    const code = st.room ? st.room.code || st.room.id : "";
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => toast("Kode room disalin.", "ok")).catch(() => toast(code, "info"));
    } else {
      toast(`Kode room: ${code}`, "info");
    }
  }

  function klikCheckers(el) {
    const room = st.room;
    if (!room || !isMyTurn(room)) return;
    const my = mySlot(room);
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    const legal = B.chkLegal ? B.chkLegal(room.state.board, my, room.state.pending || null) : [];
    const sel = st.ui.sel;
    if (sel) {
      const target = legal.some((m) => m.from[0] === sel[0] && m.from[1] === sel[1] && m.to[0] === r && m.to[1] === c);
      if (target) {
        kirimGerakan({ from: sel, to: [r, c] });
        return;
      }
    }
    const bisa = legal.some((m) => m.from[0] === r && m.from[1] === c);
    if (bisa) {
      st.ui.sel = [r, c];
      render();
    } else if (sel) {
      st.ui.sel = null;
      render();
    }
  }

  function klikChess(el) {
    const room = st.room;
    if (!room || !isMyTurn(room)) return;
    const sq = el.dataset.sq;
    if (!sq) return;
    const board = B.fenBoard ? B.fenBoard(room.state.fen || "") : [];
    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - Number(sq[1]);
    const piece = board[rank] ? board[rank][file] : null;
    const putih = mySlot(room) === 0;
    const milikku = !!piece && (putih ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
    const sel = st.ui.sel;
    if (!sel) {
      if (milikku) {
        st.ui.sel = sq;
        render();
      }
      return;
    }
    if (sel === sq) {
      st.ui.sel = null;
      render();
      return;
    }
    if (milikku) {
      st.ui.sel = sq;
      render();
      return;
    }
    const from = sel;
    st.ui.sel = null;
    kirimGerakan({ from, to: sq, promotion: "q" });
  }

  function klikUno(cardId) {
    const card = st.hand.find((c) => c && c.id === cardId);
    if (!card) return;
    if (card.kind === "wild" || card.kind === "wild4") {
      st.modal = { type: "wild", cardId };
      renderModal();
      return;
    }
    kirimGerakan({ type: "play", cardId });
  }

  /* ---------------- event handler ---------------- */

  function onAppClick(e) {
    const el = e.target.closest("[data-tv-tab], [data-tv-play], [data-tv-open-invites], [data-tv-open-room], [data-tv-hub], [data-tv-ready], [data-tv-start], [data-tv-kick], [data-tv-leave], [data-tv-visibility], [data-tv-invite-room], [data-tv-rematch], [data-tv-back-hub], [data-tv-copy-code], [data-tv-refresh-players], [data-tv-challenge], [data-tv-challenge-game], [data-tv-reload-history], [data-tv-reload-profile], [data-tv-login], [data-tv-retry-hand], [data-tv-act]");
    if (!el) return;

    if (el.hasAttribute("data-tv-tab")) {
      st.tab = el.getAttribute("data-tv-tab");
      st.screen = "hub";
      if (st.tab === "duel") muatPemain();
      if (st.tab === "history") muatRiwayat();
      if (st.tab === "profile") muatProfil();
      render();
      return;
    }
    if (el.hasAttribute("data-tv-play")) {
      bukaGame(el.getAttribute("data-tv-play"));
      return;
    }
    if (el.hasAttribute("data-tv-open-invites")) {
      bukaInvites();
      return;
    }
    if (el.hasAttribute("data-tv-open-room")) {
      st.screen = "room";
      st.modal = null;
      renderModal();
      render();
      if (st.room && st.room.status === "playing" && st.room.gameId === "uno") jadwalkanMuatState();
      return;
    }
    if (el.hasAttribute("data-tv-hub")) {
      st.screen = "hub";
      st.modal = null;
      renderModal();
      render();
      return;
    }
    if (el.hasAttribute("data-tv-login")) {
      const btn = $("btn-show-login");
      if (btn) btn.click();
      return;
    }
    if (el.hasAttribute("data-tv-ready")) { aksiReady(); return; }
    if (el.hasAttribute("data-tv-start")) { aksiMulai(); return; }
    if (el.hasAttribute("data-tv-kick")) { aksiKick(el.getAttribute("data-tv-kick")); return; }
    if (el.hasAttribute("data-tv-leave")) { aksiKeluar(false); return; }
    if (el.hasAttribute("data-tv-visibility")) { aksiVisibility(); return; }
    if (el.hasAttribute("data-tv-invite-room")) {
      st.modal = { type: "inviteRoom", targets: [] };
      renderModal();
      if (!st.players.length) muatPemain();
      return;
    }
    if (el.hasAttribute("data-tv-rematch")) { aksiRematch(); return; }
    if (el.hasAttribute("data-tv-back-hub")) {
      if (st.room && st.room.status === "finished") aksiKeluar(true);
      else {
        st.screen = "hub";
        render();
      }
      return;
    }
    if (el.hasAttribute("data-tv-copy-code")) { salinKode(); return; }
    if (el.hasAttribute("data-tv-refresh-players")) { muatPemain(true); return; }
    if (el.hasAttribute("data-tv-challenge")) { bukaChallenge(el.getAttribute("data-tv-challenge")); return; }
    if (el.hasAttribute("data-tv-challenge-game")) {
      const gameId = el.getAttribute("data-tv-challenge-game");
      st.challengeGame = gameId;
      render();
      return;
    }
    if (el.hasAttribute("data-tv-reload-history")) { muatRiwayat(true); return; }
    if (el.hasAttribute("data-tv-reload-profile")) { muatProfil(true); return; }
    if (el.hasAttribute("data-tv-retry-hand")) { muatState(); return; }
    if (el.hasAttribute("data-tv-act")) {
      if (el.disabled || st.busy) return;
      const act = el.getAttribute("data-tv-act");
      if (act === "ttt") kirimGerakan({ index: Number(el.getAttribute("data-index")) });
      else if (act === "chk") klikCheckers(el);
      else if (act === "chess") klikChess(el);
      else if (act === "ludo-roll") kirimGerakan({ type: "roll" });
      else if (act === "ludo-token") kirimGerakan({ type: "move", token: Number(el.getAttribute("data-token")) });
      else if (act === "snakes-roll") kirimGerakan({ type: "roll" });
      else if (act === "uno-play") klikUno(el.getAttribute("data-card"));
      else if (act === "uno-draw") kirimGerakan({ type: "draw" });
      else if (act === "uno-pass") kirimGerakan({ type: "pass" });
    }
  }

  function onAppSubmit(e) {
    const form = e.target.closest("[data-tv-verify]");
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input[name="password"]');
    const password = input ? input.value : "";
    if (!password) return;
    verifikasi(password);
  }

  async function verifikasi(password) {
    if (st.verifying || !st.absen) return;
    st.verifying = true;
    render();
    try {
      const res = await api("login", { absen: st.absen, password });
      if (!res.token) throw new TvError("Server tidak mengirim sesi. Coba lagi.", 0, "no-token");
      st.token = res.token;
      try { localStorage.setItem(tokenKey(st.absen), res.token); } catch (err) { /* abaikan */ }
      st.booted = false;
      st.setupError = "";
      if (res.player) {
        st.profile = res.player;
        simpanCacheProfil(res.player);
      }
      await bootstrap();
      st.verifying = false;
      render();
      toast("TableVerse tersambung. Selamat bermain!", "ok");
    } catch (err) {
      st.verifying = false;
      st.setupError = err.code === "server-unconfigured" ? err.message : "";
      render();
      const errorEl = document.querySelector("[data-tv-verify-error]");
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
      toast(err.message, "error");
    }
  }

  function onAppInput(e) {
    const search = e.target.closest("[data-tv-search]");
    if (!search) return;
    st.playerQuery = search.value.toLowerCase().trim();
    const rows = document.querySelectorAll("#tv-player-list .tv-player-row[data-name]");
    rows.forEach((row) => {
      row.hidden = !!st.playerQuery && !row.getAttribute("data-name").includes(st.playerQuery);
    });
  }

  function onModalClick(e) {
    if (e.target.closest("[data-tv-close]")) {
      st.modal = null;
      renderModal();
      return;
    }
    const el = e.target.closest("[data-tv-create], [data-tv-join-room], [data-tv-join-code], [data-tv-reload-rooms], [data-tv-cg], [data-tv-send-invite], [data-tv-send-room-invite], [data-tv-accept], [data-tv-decline], [data-tv-ignore], [data-tv-wild]");
    if (!el) return;

    if (el.hasAttribute("data-tv-create")) { buatRoom(el.getAttribute("data-tv-create")); return; }
    if (el.hasAttribute("data-tv-join-room")) { gabungRoom(el.getAttribute("data-tv-join-room")); return; }
    if (el.hasAttribute("data-tv-join-code")) {
      const input = $("tv-room-code-input");
      const code = input ? input.value.trim().toUpperCase() : "";
      if (!code) {
        toast("Masukkan kode room dulu.", "warn");
        return;
      }
      gabungRoom(code, code);
      return;
    }
    if (el.hasAttribute("data-tv-reload-rooms")) {
      if (st.modal && st.modal.type === "game") {
        st.modal.loading = true;
        renderModal();
        muatRooms(st.modal.gameId);
      }
      return;
    }
    if (el.hasAttribute("data-tv-cg")) {
      if (!st.modal || st.modal.type !== "challenge") return;
      const gameId = el.getAttribute("data-tv-cg");
      const g = meta(gameId);
      const maxTarget = Math.max(1, Number(g.mode === "duel" ? 2 : 4) - 1);
      st.modal.gameId = gameId;
      st.modal.targets = (st.modal.targets || []).slice(0, maxTarget);
      renderModal();
      return;
    }
    if (el.hasAttribute("data-tv-send-invite")) {
      if (!st.modal) return;
      kirimUndangan(st.modal.gameId, st.modal.targets || []);
      return;
    }
    if (el.hasAttribute("data-tv-send-room-invite")) { kirimUndanganRoom(); return; }
    if (el.hasAttribute("data-tv-accept")) { jawabUndangan(el.getAttribute("data-tv-accept"), true); return; }
    if (el.hasAttribute("data-tv-decline")) { jawabUndangan(el.getAttribute("data-tv-decline"), false); return; }
    if (el.hasAttribute("data-tv-ignore")) {
      st.modal = null;
      renderModal();
      return;
    }
    if (el.hasAttribute("data-tv-wild")) {
      const cardId = st.modal ? st.modal.cardId : "";
      const color = el.getAttribute("data-tv-wild");
      st.modal = null;
      renderModal();
      if (cardId) kirimGerakan({ type: "play", cardId, color });
    }
  }

  function onModalChange(e) {
    const target = e.target.closest("[data-tv-target]");
    if (!target || !st.modal) return;
    const absen = Number(target.getAttribute("data-tv-target"));
    const daftar = new Set(st.modal.targets || []);
    const gameId = st.modal.type === "inviteRoom" ? (st.room ? st.room.gameId : "ttt") : st.modal.gameId;
    const g = meta(gameId);
    const maxTarget = st.modal.type === "inviteRoom"
      ? Math.max(0, Number(st.room ? st.room.maxPlayers : 2) - (st.room ? st.room.players.filter((p) => !p.left).length : 0))
      : Math.max(1, Number(g.mode === "duel" ? 2 : 4) - 1);

    if (target.checked) {
      if (maxTarget <= 1) {
        daftar.clear();
        document.querySelectorAll("[data-tv-target]").forEach((other) => {
          if (other !== target) {
            other.checked = false;
            const baris = other.closest(".tv-target");
            if (baris) baris.classList.remove("is-sel");
          }
        });
      }
      if (daftar.size >= maxTarget) {
        target.checked = false;
        toast(`Maksimal ${maxTarget} pemain untuk game ini.`, "warn");
        return;
      }
      daftar.add(absen);
    } else {
      daftar.delete(absen);
    }
    st.modal.targets = Array.from(daftar);
    const row = target.closest(".tv-target");
    if (row) row.classList.toggle("is-sel", target.checked);
    const count = document.querySelector("[data-tv-pick-count]");
    if (count) count.textContent = `${st.modal.targets.length}/${maxTarget} dipilih`;
    const kirim = document.querySelector("[data-tv-send-invite], [data-tv-send-room-invite]");
    if (kirim) kirim.disabled = st.modal.targets.length === 0;
  }

  function onModalInput(e) {
    if (e.target && e.target.id === "tv-room-code-input") e.target.value = e.target.value.toUpperCase();
  }

  /* ---------------- lifecycle ---------------- */

  function pasangFloating() {
    if ($("tv-floating-invite")) return;
    const fab = document.createElement("button");
    fab.type = "button";
    fab.id = "tv-floating-invite";
    fab.className = "tv-floating-invite";
    fab.hidden = true;
    fab.setAttribute("aria-label", "Buka undangan TableVerse");
    fab.innerHTML = `<span aria-hidden="true">✉</span><span class="tv-floating-badge" data-tv-floating-count>0</span>`;
    fab.addEventListener("click", () => window.tableverseBuka({ invites: true }));
    document.body.appendChild(fab);
  }

  function mulaiTimer() {
    if (!st.syncTimer) st.syncTimer = window.setInterval(syncRingan, 25000);
    if (!st.inviteTimer) st.inviteTimer = window.setInterval(() => {
      if (st.visible) refreshInvites();
    }, 20000);
    if (!st.pollTimer) st.pollTimer = window.setInterval(() => {
      if (st.visible && st.roomId && !st.roomSnapshotOk) muatState(true);
    }, 3500);
  }

  function hentikanTimer() {
    if (st.syncTimer) { clearInterval(st.syncTimer); st.syncTimer = null; }
    if (st.inviteTimer) { clearInterval(st.inviteTimer); st.inviteTimer = null; }
    if (st.pollTimer) { clearInterval(st.pollTimer); st.pollTimer = null; }
    if (st.stateTimer) { clearTimeout(st.stateTimer); st.stateTimer = null; }
  }

  function akunBerubah(user) {
    const info = user || (typeof currentUser !== "undefined" ? currentUser : null);
    const absen = info ? Number(info.absen) : null;
    if (absen === st.absen && st.inited) {
      if (st.visible) render();
      return;
    }
    lepasSemua();
    st.absen = absen;
    st.nama = info ? info.namaPanggilan || info.namaLengkap || "" : "";
    if (!absen) {
      updateBadges();
      if (st.visible) render();
      return;
    }
    try {
      st.token = localStorage.getItem(tokenKey(absen)) || "";
    } catch (err) {
      st.token = "";
    }
    st.profile = bacaCacheProfil(absen);
    st.booted = false;
    langgananInvites();
    if (st.token) bootstrap();
    if (st.visible) render();
  }

  function lepasSemua() {
    hentikanTimer();
    if (st.invitesUnsub) {
      try { st.invitesUnsub(); } catch (err) { /* abaikan */ }
      st.invitesUnsub = null;
    }
    kosongkanRoom();
    st.invites = [];
    st.outbound = [];
    st.knownInvites = new Set();
    st.invitesSiap = false;
    st.snapshotInvites = false;
    st.booted = false;
    st.profile = null;
    st.profileFresh = null;
    st.profileAt = 0;
    st.history = [];
    st.historyAt = 0;
    st.players = [];
    st.playersAt = 0;
    st.tab = "play";
    st.screen = "hub";
    st.modal = null;
    renderModal();
    st.autoRoomDone = false;
    st.syncFail = false;
    st.token = "";
    updateBadges();
  }

  async function buka(opsi) {
    st.visible = true;
    st.pendingInviteOpen = !!(opsi && opsi.invites);
    st.autoRoomDone = false;
    mulaiTimer();
    mulaiLangganan();
    if (st.token && !st.booted) {
      render();
      await bootstrap();
    }
    if (!st.autoRoomDone) {
      st.autoRoomDone = true;
      if (st.room && st.room.status !== "finished") st.screen = "room";
    }
    if (st.pendingInviteOpen) {
      st.pendingInviteOpen = false;
      bukaInvites();
    } else {
      render();
    }
    if (st.absen && !st.token) render();
  }

  function tutup() {
    st.visible = false;
    hentikanTimer();
    lepasRoom();
    st.modal = null;
    renderModal();
    updateTopStatus();
  }

  function mulaiLangganan() {
    if (st.roomId && !st.roomUnsub) langgananRoom(st.roomId);
    if (st.absen && !st.invitesUnsub) langgananInvites();
  }

  function init() {
    if (st.inited) return;
    st.inited = true;
    const app = $("tv-app");
    const modal = $("tv-modal-root");
    if (app) {
      app.addEventListener("click", onAppClick);
      app.addEventListener("submit", onAppSubmit);
      app.addEventListener("input", onAppInput);
    }
    if (modal) {
      modal.addEventListener("click", onModalClick);
      modal.addEventListener("change", onModalChange);
      modal.addEventListener("input", onModalInput);
    }
    pasangFloating();
    st.tickTimer = window.setInterval(tick, 1000);
    window.addEventListener("online", () => {
      st.online = true;
      st.syncFail = false;
      updateTopStatus();
      if (st.visible) {
        syncRingan();
        renderJikaBoleh();
      }
    });
    window.addEventListener("offline", () => {
      st.online = false;
      updateTopStatus();
      if (st.visible) renderJikaBoleh();
    });
    window.addEventListener("beforeunload", () => {
      hentikanTimer();
      if (st.invitesUnsub) { try { st.invitesUnsub(); } catch (err) { /* abaikan */ } }
      lepasRoom();
    });
    const user = typeof currentUser !== "undefined" ? currentUser : null;
    akunBerubah(user);
    updateTopStatus();
  }

  window.tableverseAkunBerubah = akunBerubah;
  window.tableverseBuka = buka;
  window.tableverseTutup = tutup;

  window.tableverseLoginDenganPassword = function (absen, password) {
    const target = Number(absen);
    if (!target || !password || !apiBase()) return;
    if (st.absen !== target) akunBerubah({ absen: target, namaPanggilan: st.nama });
    if (st.absen !== target) st.absen = target;
    if (!st.absen) return;
    if (st.token) {
      if (!st.booted) bootstrap();
      return;
    }
    verifikasi(password);
  };

  window.tableverseRingkas = function (login) {
    if (!login) return "Login buat main bareng teman sekelas";
    const n = pendingInvites().length;
    if (n) return `✉ ${n} undangan menunggu · buka Invitations`;
    const profil = st.profile || (st.absen ? bacaCacheProfil(st.absen) : null);
    if (profil && profil.stats) {
      const s = statsOf(profil);
      return `${s.matches} main · ${s.wins} menang · 6 game meja`;
    }
    return "6 game meja: catur, kartu, ular tangga, Ludo, UNO";
  };

  init();
})();
