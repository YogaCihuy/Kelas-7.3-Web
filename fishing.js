/* ===================================================
   FISHING GAME — client
   Semua mutasi (koin, ikan, rarity, durability, jual/beli)
   dikerjakan Cloud Functions. Client hanya menampilkan &
   mengirim aksi. Firestore rules menolak write langsung.
=================================================== */
(function () {
  "use strict";

  const REGION = "us-central1";
  const FUNCTION_NAME = "fishingApi";
  const CAT_KEY = "kelas73-fishing-catalog-v1";
  const TOKEN_KEY = (absen) => `kelas73-fishing-token-${absen}`;
  const RINGKAS_KEY = "kelas73-fishing-ringkas";

  const FC = {
    aktif: false,
    membuka: false,
    absen: null,
    token: "",
    cat: null,
    state: null,
    board: null,
    meta: null,
    announcements: [],
    panel: "lobby",
    shopTab: "rod",
    invTab: "fish",
    collFilter: "semua",
    aksi: false,
    seq: null,
    modalConfirm: null,
    subs: [],
    subAbsen: null,
    annSiap: false,
    serverOffset: 0,
    tahanRender: false,
    fishMap: {},
    rodMap: {},
    baitMap: {},
    achMap: {},
    terakhirState: 0,
  };

  let artSeq = 0;

  /* ================= UTIL ================= */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function angka(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    return Math.round(v).toLocaleString("id-ID");
  }

  function persen(bobot) {
    return `${(Number(bobot || 0) / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  }

  function inisial(nama) {
    const bersih = String(nama || "?").trim();
    const kata = bersih.split(/\s+/).filter(Boolean);
    if (kata.length >= 2) return (kata[0][0] + kata[1][0]).toUpperCase();
    return bersih.slice(0, 2).toUpperCase();
  }

  function waktu(ms) {
    if (!ms) return "—";
    const t = Number(ms);
    if (!Number.isFinite(t) || t <= 0) return "—";
    const beda = Date.now() - t;
    if (beda < 0) return "baru saja";
    if (beda < 60000) return "baru saja";
    if (beda < 3600000) return `${Math.floor(beda / 60000)} mnt lalu`;
    if (beda < 86400000) return `${Math.floor(beda / 3600000)} jam lalu`;
    return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  function tanggal(ms) {
    if (!ms) return "—";
    return new Date(Number(ms)).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }

  function reqId() {
    try {
      if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch (err) { /* fallback */ }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function tsMs(v) {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    return 0;
  }

  function namaSiswa(absen, fallback) {
    try {
      if (typeof getMergedAccount === "function") {
        const acc = getMergedAccount(Number(absen));
        if (acc && acc.namaPanggilan) return acc.namaPanggilan;
      }
    } catch (err) { /* pakai fallback */ }
    try {
      const s = (window.dataSiswa || []).find((x) => Number(x.absen) === Number(absen));
      if (s && s.namaPanggilan) return s.namaPanggilan;
    } catch (err) { /* pakai fallback */ }
    return fallback || `Siswa ${absen}`;
  }

  function rarityInfo(r) {
    return (FC.cat && FC.cat.rarities && FC.cat.rarities[r]) || { label: r, labelId: r, color: "#7f9c8c", soft: "#eef4f0", order: 9 };
  }

  function rarityChip(r, extra = "") {
    const info = rarityInfo(r);
    return `<span class="fishing-rarity-chip rarity-${esc(r)} ${extra}" style="--rarity:${esc(info.color)};--rarity-soft:${esc(info.soft)}">${esc(info.label)}</span>`;
  }

  /* ================= AUDIO ================= */
  const SFX = (() => {
    let ctx = null;
    function aktif() {
      return !window.SoundFX || typeof SoundFX.isEnabled !== "function" || SoundFX.isEnabled();
    }
    function getCtx() {
      if (!aktif()) return null;
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
      } catch (err) { return null; }
    }
    function tone(freq, dur, type, gain, glide, delay) {
      const c = getCtx();
      if (!c) return;
      try {
        const start = c.currentTime + (delay || 0);
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type || "sine";
        osc.frequency.setValueAtTime(freq, start);
        if (glide) osc.frequency.exponentialRampToValueAtTime(glide, start + dur);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(gain || 0.12, start + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(g).connect(c.destination);
        osc.start(start);
        osc.stop(start + dur + 0.03);
      } catch (err) { /* browser blokir audio */ }
    }
    return {
      cast() { tone(320, 0.2, "sine", 0.1, 660); },
      splash() { tone(180, 0.12, "triangle", 0.09, 90); tone(260, 0.08, "sine", 0.05, 150, 0.06); },
      bite() { tone(760, 0.09, "square", 0.1); tone(980, 0.12, "square", 0.09, null, 0.1); },
      reel() { tone(300, 0.18, "sawtooth", 0.06, 520); },
      catchR(r) {
        const idx = Math.max(0, (FC.cat ? FC.cat.rarityOrder : []).indexOf(r));
        const base = [440, 494, 523, 587, 659, 784, 880][Math.min(idx, 6)] || 440;
        [0, 4, 7].forEach((n, i) => tone(base * Math.pow(2, n / 12), 0.22, "sine", 0.1, null, i * 0.09));
      },
      fail() { tone(300, 0.18, "triangle", 0.09, 180); tone(220, 0.22, "sine", 0.07, 140, 0.12); },
      coin() { tone(1200, 0.07, "square", 0.06); tone(1600, 0.11, "square", 0.05, null, 0.06); },
      legend() {
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, "sine", 0.11, null, i * 0.12));
      },
      click() {
        if (window.SoundFX && typeof SoundFX.buttonClick === "function") SoundFX.buttonClick();
        else tone(380, 0.06, "triangle", 0.08);
      },
      close() {
        if (window.SoundFX && typeof SoundFX.modalClose === "function") SoundFX.modalClose();
        else tone(420, 0.12, "sine", 0.08, 260);
      },
    };
  })();

  /* ================= API ================= */
  function panggil(action, payload) {
    return new Promise((resolve, reject) => {
      let call;
      try {
        if (!window.firebase || typeof firebase.functions !== "function") {
          throw new Error("SDK Firebase Functions belum termuat. Refresh halaman.");
        }
        const app = firebase.app();
        const fn = app.functions(REGION).httpsCallable(FUNCTION_NAME);
        call = fn(Object.assign({ action }, payload || {}));
      } catch (err) {
        err.serverDown = true;
        reject(err);
        return;
      }
      call.then((res) => resolve(res.data)).catch((err) => {
        const code = String(err.code || "");
        const pesan = String(err.message || "").replace(/^.*?: /, "");
        const turun = code.includes("not-found") || code.includes("unavailable") || /failed to fetch|cors|network/i.test(pesan);
        const e = new Error(turun
          ? "Server Fishing belum aktif. Cloud Functions harus di-deploy dulu oleh admin."
          : pesan || "Gagal menghubungi server mancing.");
        e.code = code;
        e.serverDown = turun;
        reject(e);
      });
    });
  }

  function api(action, payload) {
    return panggil(action, payload);
  }

  /* ================= STATE ================= */
  function normStats(raw) {
    const awal = { casts: 0, catches: 0, misses: 0, totalEarned: 0, totalSpent: 0, byRarity: {}, biggest: null };
    const s = Object.assign(awal, raw || {});
    s.byRarity = Object.assign({}, raw && raw.byRarity ? raw.byRarity : {});
    s.casts = Math.max(0, Number(s.casts) || 0);
    s.catches = Math.max(0, Number(s.catches) || 0);
    s.misses = Math.max(0, Number(s.misses) || 0);
    s.totalEarned = Math.max(0, Number(s.totalEarned) || 0);
    s.totalSpent = Math.max(0, Number(s.totalSpent) || 0);
    return s;
  }

  function normState(raw) {
    if (!raw) return null;
    const collection = {};
    Object.entries(raw.collection || {}).forEach(([id, rec]) => {
      collection[id] = { caught: Math.max(0, Number(rec && rec.caught) || 0), firstAt: tsMs(rec && rec.firstAt) };
    });
    const rods = Array.isArray(raw.rods) ? raw.rods.map((r) => ({ id: String(r && r.id), durability: Math.max(0, Number(r && r.durability) || 0) })) : [];
    return {
      absen: Number(raw.absen) || 0,
      name: String(raw.name || ""),
      coins: Math.max(0, Number(raw.coins) || 0),
      rods,
      equippedRod: String(raw.equippedRod || (rods[0] && rods[0].id) || "bambu"),
      baits: Object.assign({}, raw.baits || {}),
      equippedBait: String(raw.equippedBait || "cacing"),
      fish: Object.assign({}, raw.fish || {}),
      locked: Object.assign({}, raw.locked || {}),
      collection,
      totalValue: Math.max(0, Number(raw.totalValue) || 0),
      totalCaught: Math.max(0, Number(raw.totalCaught) || 0),
      stats: normStats(raw.stats),
      achievements: Object.assign({}, raw.achievements || {}),
      activeCast: raw.activeCast || null,
      createdAt: tsMs(raw.createdAt),
      updatedAt: tsMs(raw.updatedAt),
    };
  }

  function petaKatalog() {
    FC.fishMap = {};
    FC.rodMap = {};
    FC.baitMap = {};
    FC.achMap = {};
    if (!FC.cat) return;
    (FC.cat.fish || []).forEach((f) => { FC.fishMap[f.id] = f; });
    (FC.cat.rods || []).forEach((r) => { FC.rodMap[r.id] = r; });
    (FC.cat.baits || []).forEach((b) => { FC.baitMap[b.id] = b; });
    (FC.cat.achievements || []).forEach((a) => { FC.achMap[a.id] = a; });
  }

  function simpanRingkas() {
    if (!FC.state) return;
    try {
      localStorage.setItem(RINGKAS_KEY, JSON.stringify({
        absen: FC.state.absen,
        name: FC.state.name,
        coins: FC.state.coins,
        totalValue: FC.state.totalValue,
        totalCaught: FC.state.totalCaught,
        species: Object.keys(FC.state.collection || {}).length,
        at: Date.now(),
      }));
    } catch (err) { /* storage penuh */ }
  }

  function terapkanState(raw) {
    if (!raw) return;
    FC.state = normState(raw);
    FC.terakhirState = Date.now();
    simpanRingkas();
    perbaruiHeader();
    if (FC.aktif && !FC.tahanRender && !(FC.seq && ["waiting", "bite", "reeling"].includes(FC.seq.phase))) render();
  }

  function perbaruiHeader() {
    const badge = document.getElementById("fishing-coin-badge");
    if (badge) badge.textContent = `💰 ${angka(FC.state ? FC.state.coins : 0)}`;
    document.querySelectorAll("[data-fishing-coins]").forEach((el) => { el.textContent = angka(FC.state ? FC.state.coins : 0); });
    document.querySelectorAll("[data-fishing-value]").forEach((el) => { el.textContent = angka(FC.state ? FC.state.totalValue : 0); });
    document.querySelectorAll("[data-fishing-name]").forEach((el) => { el.textContent = (FC.state && FC.state.name) || "Pemancing"; });
  }

  function rodDipakai() {
    if (!FC.state) return null;
    return FC.state.rods.find((r) => r.id === FC.state.equippedRod) || FC.state.rods[0] || null;
  }

  function infoRod(id) { return FC.rodMap[id] || null; }
  function infoBait(id) { return FC.baitMap[id] || null; }
  function infoIkan(id) { return FC.fishMap[id] || null; }
  function stokUmpan(id) { return FC.state ? (Number(FC.state.baits[id]) || 0) : 0; }

  function simpanToken(token) {
    FC.token = token;
    if (!FC.absen || !token) return;
    try { localStorage.setItem(TOKEN_KEY(FC.absen), token); } catch (err) { /* ignore */ }
  }

  function tokenTersimpan(absen) {
    try { return localStorage.getItem(TOKEN_KEY(absen)) || ""; } catch (err) { return ""; }
  }

  /* ================= CATALOG & SESSION ================= */
  async function muatKatalogServer() {
    const res = await api("catalog");
    if (!res || !res.catalog) throw new Error("Katalog Fishing tidak diterima dari server.");
    FC.cat = res.catalog;
    petaKatalog();
    try { localStorage.setItem(CAT_KEY, JSON.stringify(FC.cat)); } catch (err) { /* ignore */ }
    return FC.cat;
  }

  async function pastikanKatalog() {
    if (!FC.cat) {
      try {
        const cached = JSON.parse(localStorage.getItem(CAT_KEY) || "null");
        if (cached && cached.version) {
          FC.cat = cached;
          petaKatalog();
        }
      } catch (err) { /* cache rusak */ }
    }
    if (!FC.cat) await muatKatalogServer();
  }

  async function bukaSesi(forceToken) {
    if (!currentUser) throw new Error("Login dulu buat memancing.");
    const absen = Number(currentUser.absen);
    const password = String(currentUser.password || "");
    if (!password) throw new Error("Akun ini tidak punya password. Login ulang dulu.");
    const lama = forceToken ? "" : tokenTersimpan(absen);
    const res = await api("ensure", { absen, password, token: lama });
    if (!res || !res.ok) throw new Error("Server menolak sesi mancing.");
    FC.absen = absen;
    if (res.token) simpanToken(res.token);
    else if (lama) simpanToken(lama);
    if (res.serverNow) FC.serverOffset = Number(res.serverNow) - Date.now();
    if (res.catalogVersion && (!FC.cat || Number(FC.cat.version) !== Number(res.catalogVersion))) {
      await muatKatalogServer();
    }
    terapkanState(res.state);
    mulaiLangganan(absen);
    simpanRingkas();
  }

  function hentikanLangganan() {
    FC.subs.forEach((un) => { try { un(); } catch (err) { /* ignore */ } });
    FC.subs = [];
    FC.subAbsen = null;
    FC.annSiap = false;
  }

  function mulaiLangganan(absen) {
    if (FC.subAbsen === absen) return;
    hentikanLangganan();
    FC.subAbsen = absen;
    try {
      const unState = db.collection("fishing").doc(String(absen)).onSnapshot((snap) => {
        if (!snap.exists) return;
        FC.state = normState(snap.data());
        FC.terakhirState = Date.now();
        simpanRingkas();
        perbaruiHeader();
        if (FC.aktif && !FC.tahanRender && !(FC.seq && ["waiting", "bite", "reeling"].includes(FC.seq.phase))) render();
      }, (err) => console.warn("Fishing state listener:", err));
      FC.subs.push(unState);

      const unBoard = db.collection("fishing").orderBy("totalValue", "desc").limit(50).onSnapshot((snap) => {
        FC.board = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            absen: Number(d.id),
            name: data.name || namaSiswa(d.id),
            totalValue: Math.max(0, Number(data.totalValue) || 0),
            totalCaught: Math.max(0, Number(data.totalCaught) || 0),
            species: Object.keys(data.collection || {}).length,
          };
        });
        if (FC.aktif && FC.panel === "peringkat") render();
      }, (err) => console.warn("Fishing leaderboard listener:", err));
      FC.subs.push(unBoard);

      const unMeta = db.doc("fishingMeta/firstCatches").onSnapshot((snap) => {
        const raw = snap.exists ? snap.data() : {};
        FC.meta = { legend: [], secret: [] };
        ["legend", "secret"].forEach((r) => {
          FC.meta[r] = (Array.isArray(raw[r]) ? raw[r] : []).map((e) => ({
            absen: Number(e.absen),
            name: e.name || namaSiswa(e.absen),
            fishId: e.fishId,
            fishName: e.fishName,
            at: tsMs(e.at),
            slot: Number(e.slot) || 0,
          })).sort((a, b) => a.slot - b.slot).slice(0, 3);
        });
        if (FC.aktif && (FC.panel === "legenda" || FC.panel === "lobby")) render();
      }, (err) => console.warn("Fishing meta listener:", err));
      FC.subs.push(unMeta);

      const unAnn = db.collection("fishingAnnouncements").orderBy("at", "desc").limit(8).onSnapshot((snap) => {
        FC.announcements = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            type: data.type,
            absen: Number(data.absen),
            name: data.name || namaSiswa(data.absen),
            fishId: data.fishId,
            fishName: data.fishName,
            firstSlot: Number(data.firstSlot) || 0,
            at: tsMs(data.at),
          };
        });
        snap.docChanges().forEach((ch) => {
          if (ch.type !== "added") return;
          const a = FC.announcements.find((x) => x.id === ch.doc.id);
          if (a && FC.annSiap && Number(a.absen) !== Number(FC.absen)) tampilkanPengumuman(a);
        });
        FC.annSiap = true;
        if (FC.aktif && (FC.panel === "lobby" || FC.panel === "legenda")) render();
      }, (err) => console.warn("Fishing announcement listener:", err));
      FC.subs.push(unAnn);
    } catch (err) {
      console.warn("Gagal berlangganan Fishing:", err);
    }
  }

  async function sinkronState() {
    if (!FC.absen || !FC.token) return;
    try {
      const res = await api("state", { absen: FC.absen, token: FC.token });
      if (res.state) terapkanState(res.state);
    } catch (err) {
      if (String(err.code || "").includes("unauthenticated")) {
        try { await bukaSesi(true); } catch (e2) { /* diam */ }
      }
    }
  }

  /* ================= FISH / ROD ART ================= */
  const BODY_PATH = {
    slim: "M20 40 C32 24 80 24 100 40 C80 56 32 56 20 40 Z",
    round: "M22 40 C28 22 60 18 84 26 C104 32 108 48 92 58 C70 70 32 62 22 40 Z",
    carp: "M20 40 C24 20 56 14 84 22 C106 28 112 46 96 58 C74 72 32 62 20 40 Z",
    catfish: "M16 40 C28 28 74 28 102 36 C108 38 106 46 98 48 C74 56 30 52 16 40 Z",
    long: "M14 40 C26 30 82 26 108 40 C82 54 26 50 14 40 Z",
    shark: "M14 42 C30 28 68 24 104 32 C110 34 110 40 104 42 C110 48 104 56 92 58 C60 66 30 56 14 42 Z",
    ray: "M60 20 C78 18 108 32 112 42 C108 52 78 66 60 64 C42 66 12 52 8 42 C12 32 42 18 60 20 Z",
    fancy: "M24 40 C26 18 52 8 76 18 C96 26 100 42 88 54 C70 68 34 62 24 40 Z",
    tuna: "M16 40 C34 26 76 24 104 38 C108 40 108 44 104 46 C76 58 34 56 16 40 Z",
    marlin: "M12 40 C30 28 76 26 102 36 L118 34 L118 38 L104 44 C76 56 30 54 12 40 Z",
    whale: "M10 42 C18 22 70 14 100 26 C116 32 118 50 100 58 C68 70 26 64 10 42 Z",
    dragon: "M18 44 C28 24 46 20 64 26 C80 32 92 24 106 30 C112 34 108 42 98 44 C86 50 78 42 64 44 C50 50 30 56 18 44 Z",
    betta: "M22 40 C26 20 54 10 76 20 C94 26 96 42 84 52 C68 66 34 60 22 40 Z",
    arowana: "M14 42 C28 28 76 24 108 36 C112 38 110 44 102 46 C76 54 28 52 14 42 Z",
    mahi: "M20 40 C28 22 60 18 84 24 C102 28 106 42 94 52 C72 66 32 60 20 40 Z",
    grouper: "M22 42 C26 22 58 14 86 24 C106 30 112 50 94 60 C70 72 32 64 22 42 Z",
    eel: "M8 44 C24 28 42 34 58 40 C74 46 90 52 108 40 C100 56 78 60 60 54 C42 48 26 42 8 52 Z",
    oarfish: "M10 40 C26 30 44 34 60 38 C76 42 94 36 108 30 C104 44 86 50 68 48 C50 46 28 44 10 50 Z",
  };

  function polaIkan(fish) {
    const fin = fish.art.fin;
    const acc = fish.art.accent;
    switch (fish.art.pattern) {
      case "stripes":
        return [40, 54, 68, 82].map((x) => `<rect x="${x}" y="14" width="6" height="52" rx="3" fill="${fin}" opacity=".32" transform="rotate(8 ${x} 40)"/>`).join("");
      case "spots":
        return [[48, 32, 3.2], [58, 45, 2.4], [70, 30, 2.8], [78, 48, 2.1], [64, 38, 1.8], [86, 36, 2.3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fin}" opacity=".4"/>`).join("");
      case "stars":
        return [[52, 30, 2.6], [66, 44, 2.1], [78, 31, 2.4], [86, 46, 1.8], [60, 36, 1.5]].map(([x, y, r]) => `<path d="M${x} ${y - r} L${x + r * 0.35} ${y - r * 0.35} L${x + r} ${y} L${x + r * 0.35} ${y + r * 0.35} L${x} ${y + r} L${x - r * 0.35} ${y + r * 0.35} L${x - r} ${y} L${x - r * 0.35} ${y - r * 0.35} Z" fill="${acc}" opacity=".7"/>`).join("");
      case "scales":
        return [38, 50, 62, 74, 86].map((x) => `<path d="M${x} 30 Q${x + 7} 38 ${x} 46" fill="none" stroke="${fin}" stroke-width="1.1" opacity=".35"/>`).join("") +
          [44, 56, 68, 80].map((x) => `<path d="M${x} 42 Q${x + 7} 50 ${x} 58" fill="none" stroke="${fin}" stroke-width="1.1" opacity=".28"/>`).join("");
      case "patches":
        return [
          `<ellipse cx="50" cy="35" rx="10" ry="7" fill="${fin}" opacity=".32" transform="rotate(-15 50 35)"/>`,
          `<ellipse cx="74" cy="46" rx="12" ry="8" fill="${acc}" opacity=".26" transform="rotate(12 74 46)"/>`,
          `<ellipse cx="88" cy="30" rx="7" ry="5" fill="${fin}" opacity=".3"/>`,
        ].join("");
      case "gradient":
        return `<rect x="0" y="0" width="120" height="80" fill="url(#${fish.art.body}grad)" opacity=".001"/>`;
      case "glow":
        return `<ellipse cx="66" cy="34" rx="30" ry="12" fill="${acc}" opacity=".2"/><ellipse cx="66" cy="34" rx="16" ry="5" fill="#ffffff" opacity=".22"/>`;
      default:
        return "";
    }
  }

  function fishArt(fish, opts) {
    opts = opts || {};
    if (!fish) return `<span class="fishing-art-placeholder" aria-hidden="true">🐟</span>`;
    const uid = `fish${++artSeq}`;
    const shape = BODY_PATH[fish.shape] ? fish.shape : "round";
    const body = BODY_PATH[shape];
    const art = fish.art || {};
    const fin = art.fin || "#6b8b9f";
    const belly = art.belly || "#f4fbfd";
    const acc = art.accent || fin;
    const isRay = shape === "ray";
    const isMarlin = shape === "marlin";
    const isCat = shape === "catfish";
    const isDragon = shape === "dragon";
    const isWhale = shape === "whale";
    const isEel = shape === "eel" || shape === "oarfish";
    const striped = fish.art && fish.art.pattern === "stripes";

    const ekor = isRay
      ? `<path d="M60 62 C64 72 72 78 82 79" fill="none" stroke="${fin}" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M22 40 C12 30 6 22 4 16 C14 24 18 33 20 40 C18 47 14 56 4 64 C6 58 12 50 22 40Z" fill="${fin}" opacity=".9"/>`;

    const dorsal = isRay
      ? ""
      : isWhale
        ? `<path d="M62 20 C68 8 76 10 82 20 C74 18 68 18 62 20Z" fill="${fin}" opacity=".8"/>`
        : isDragon
          ? `<path d="M40 24 L46 10 L52 22 L58 8 L64 20 L70 10 L76 22Z" fill="${fin}" opacity=".85"/>`
          : isMarlin
            ? `<path d="M40 26 C48 2 66 4 82 20 C68 18 54 20 40 26Z" fill="${fin}" opacity=".82"/>`
            : `<path d="M46 24 C50 10 64 8 74 22 C64 20 54 21 46 24Z" fill="${fin}" opacity=".82"/>`;

    const sirip = isRay
      ? ""
      : `<path d="M58 48 C66 58 60 62 52 56Z" fill="${fin}" opacity=".8"/><path d="M50 52 C54 60 48 62 44 56Z" fill="${fin}" opacity=".55"/>`;

    const mata = isRay
      ? `<circle cx="50" cy="30" r="3.2" fill="#fff"/><circle cx="50" cy="30" r="1.7" fill="${art.eye || "#22313a"}"/><circle cx="68" cy="30" r="3.2" fill="#fff"/><circle cx="68" cy="30" r="1.7" fill="${art.eye || "#22313a"}"/>`
      : `<circle cx="88" cy="34" r="5" fill="#fff"/><circle cx="89" cy="34" r="2.8" fill="${art.eye || "#22313a"}"/><circle cx="90.2" cy="32.8" r="1" fill="#fff"/>`;

    const mulut = isRay
      ? `<path d="M58 52 Q60 55 63 52" fill="none" stroke="${fin}" stroke-width="1.4" stroke-linecap="round"/>`
      : `<path d="M96 45 Q100 48 95 50" fill="none" stroke="${fin}" stroke-width="1.5" stroke-linecap="round"/>`;

    const kumis = isCat
      ? `<path d="M100 46 C110 50 114 58 108 62" fill="none" stroke="${fin}" stroke-width="1.2" stroke-linecap="round"/><path d="M100 42 C112 44 118 50 114 55" fill="none" stroke="${fin}" stroke-width="1.1" stroke-linecap="round"/>`
      : "";

    const tanduk = isDragon
      ? `<path d="M78 26 L74 14 L84 22Z" fill="${fin}"/><path d="M70 24 L64 13 L74 20Z" fill="${fin}" opacity=".7"/>`
      : "";

    const moncong = isMarlin
      ? `<path d="M104 35 L119 32 L119 35 L106 40Z" fill="${fin}"/>`
      : "";

    const spout = isWhale
      ? `<path d="M62 26 C62 18 58 14 54 10" fill="none" stroke="#dff6ff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`
      : "";

    const kilau = `<ellipse cx="62" cy="28" rx="22" ry="6" fill="#ffffff" opacity=".16" transform="rotate(-8 62 28)"/>`;

    const siluet = opts.silhouette ? " fishing-silhouette" : "";
    return `
      <svg class="fish-art fish-art-${shape}${siluet}" viewBox="0 0 120 80" role="img" aria-label="${esc(opts.label || fish.name)}">
        <defs>
          <linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${art.body || "#9db5c4"}"/>
            <stop offset=".6" stop-color="${art.body || "#9db5c4"}"/>
            <stop offset="1" stop-color="${belly}"/>
          </linearGradient>
          <clipPath id="${uid}c"><path d="${body}"/></clipPath>
        </defs>
        ${ekor}
        ${dorsal}
        <path d="${body}" fill="url(#${uid}g)" stroke="${fin}" stroke-width="1.4" stroke-linejoin="round"/>
        <g clip-path="url(#${uid}c)">${polaIkan(fish)}${kilau}${striped ? "" : ""}</g>
        ${sirip}
        ${kumis}
        ${tanduk}
        ${moncong}
        ${spout}
        ${mata}
        ${mulut}
      </svg>`;
  }

  function rodArt(rod, opts) {
    opts = opts || {};
    if (!rod) return `<span class="fishing-art-placeholder">🎣</span>`;
    return `
      <svg class="fishing-rod-art" viewBox="0 0 120 120" role="img" aria-label="${esc(opts.label || rod.name)}">
        <path d="M18 108 C46 82 76 50 105 15" fill="none" stroke="${esc(rod.color)}" stroke-width="5" stroke-linecap="round"/>
        <path d="M20 106 C48 80 78 48 103 17" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
        <circle cx="65" cy="62" r="11" fill="${esc(rod.accent)}" stroke="#20363a" stroke-width="2"/>
        <circle cx="65" cy="62" r="4" fill="#f4e9c9"/>
        <path d="M76 62 C86 70 90 82 86 96" fill="none" stroke="#20363a" stroke-width="1.3" opacity=".7"/>
        <path d="M86 96 C82 102 76 104 72 102" fill="none" stroke="#20363a" stroke-width="1.3"/>
        <path d="M18 108 L12 114" stroke="${esc(rod.accent)}" stroke-width="7" stroke-linecap="round"/>
      </svg>`;
  }

  const BAIT_EMOJI = {
    cacing: "🐛", udang: "🦐", jangkrik: "🦗", pelet: "🟤", "ikan-kecil": "🐟",
    cumi: "🦑", "udang-mutiara": "🦐", kunang: "✨", permata: "💎", bintang: "⭐",
  };

  function baitArt(bait) {
    if (!bait) return `<span class="fishing-bait-art">🐛</span>`;
    return `<span class="fishing-bait-art bait-${esc(bait.id)}" role="img" aria-label="${esc(bait.name)}">${BAIT_EMOJI[bait.id] || "🐛"}</span>`;
  }

  function avatar(absen, nama, size) {
    const hue = (Number(absen) * 47 + 18) % 360;
    return `<span class="fishing-avatar fishing-avatar-${size || "md"}" style="--av-h:${hue}" aria-hidden="true">${esc(inisial(nama))}</span>`;
  }

  function sparkles(jumlah, kelas) {
    let out = "";
    for (let i = 0; i < jumlah; i++) {
      const x = 6 + ((i * 37) % 88);
      const y = 8 + ((i * 53) % 80);
      const d = (i % 7) * 0.16;
      const s = 4 + (i % 4) * 2;
      out += `<span class="fishing-spark ${kelas || ""}" style="left:${x}%;top:${y}%;--d:${d}s;--s:${s}px"></span>`;
    }
    return out;
  }

  /* ================= SHELL ================= */
  const TABS = [
    ["lobby", "🏠", "Beranda"],
    ["area", "🎣", "Mancing"],
    ["toko", "🛒", "Toko"],
    ["tas", "🎒", "Tas"],
    ["koleksi", "📖", "Koleksi"],
    ["peringkat", "🏆", "Peringkat"],
    ["legenda", "👑", "Legenda"],
    ["profil", "👤", "Profil"],
  ];

  function navHtml() {
    return `<nav class="fishing-nav" aria-label="Menu Fishing">${TABS.map(([id, icon, label]) => `
      <button class="fishing-nav-btn ${FC.panel === id ? "is-active" : ""}" type="button" data-fish-nav="${id}" role="tab" aria-selected="${FC.panel === id}">
        <span class="fishing-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>
      </button>`).join("")}</nav>`;
  }

  function headerHtml() {
    const s = FC.state;
    const species = Object.keys(s.collection || {}).length;
    const totalIkan = Object.values(s.fish || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    return `
      <header class="fishing-hero">
        <div class="fishing-hero-wave" aria-hidden="true"></div>
        <div class="fishing-hero-main">
          ${avatar(s.absen, s.name, "lg")}
          <div class="fishing-hero-id">
            <p class="fishing-kicker">Fishing Grounds · Kelas 7.3</p>
            <h2>${esc(s.name)}</h2>
            <p>${angka(totalIkan)} ikan di tas · ${angka(species)}/${(FC.cat.fish || []).length} spesies ditemukan</p>
          </div>
          <div class="fishing-hero-money">
            <span class="fishing-coin-pill">💰 <strong data-fishing-coins>${angka(s.coins)}</strong></span>
            <span class="fishing-value-pill">📦 Nilai <strong data-fishing-value>${angka(s.totalValue)}</strong></span>
          </div>
        </div>
        <div class="fishing-hero-stats">
          <div><span>Total tangkapan</span><strong>${angka(s.totalCaught)}</strong></div>
          <div><span>Spesies</span><strong>${angka(species)}/${(FC.cat.fish || []).length}</strong></div>
          <div><span>Akurasi</span><strong>${s.stats.casts ? Math.round((s.stats.catches / s.stats.casts) * 100) : 0}%</strong></div>
        </div>
      </header>`;
  }

  function render() {
    if (!FC.aktif) return;
    const app = document.getElementById("fishing-app");
    const locked = document.getElementById("fishing-locked");
    if (!app || !locked) return;
    if (!currentUser) {
      app.hidden = true;
      locked.hidden = false;
      locked.innerHTML = lockedHtml("login");
      return;
    }
    if (!FC.state || !FC.cat) {
      app.hidden = true;
      locked.hidden = false;
      locked.innerHTML = FC.membuka
        ? loadingHtml()
        : lockedHtml("error", { message: FC.errMsg || "Data mancing belum siap. Coba buka ulang game." });
      return;
    }
    locked.hidden = true;
    app.hidden = false;
    app.innerHTML = `<div class="fishing-shell">${headerHtml()}${navHtml()}<div id="fishing-panel" class="fishing-panel">${panelHtml()}</div></div>`;
    perbaruiHeader();
    if (FC.panel === "area") {
      if (FC.seq && FC.seq.phase === "bite") mulaiAnimasiTiming();
      else if (!FC.seq && FC.state && FC.state.activeCast) lanjutkanCastAktif();
    }
  }

  function loadingHtml() {
    return `
      <div class="streak-locked-card fishing-loading">
        <div class="fishing-loading-emoji" aria-hidden="true">🎣</div>
        <h3>Menyiapkan pancing…</h3>
        <p>Menghubungkan akun kelas ke Fishing Grounds.</p>
        <div class="fishing-loading-bar"><span></span></div>
      </div>`;
  }

  function lockedHtml(tipe, opts) {
    opts = opts || {};
    if (tipe === "login") {
      return `
        <div class="streak-locked-card">
          <div class="streak-locked-icon" aria-hidden="true">🎣</div>
          <h3>Login dulu buat memancing</h3>
          <p>Pakai akun kelas yang sudah ada. Koin, ikan, koleksi, dan peringkatmu tersimpan di Firebase.</p>
          <button class="btn-primary" type="button" data-fish-act="login">Login ke Akun Kelas</button>
        </div>`;
    }
    return `
      <div class="streak-locked-card fishing-error-card">
        <div class="streak-locked-icon" aria-hidden="true">🌊</div>
        <h3>${opts.title || "Fishing belum bisa dibuka"}</h3>
        <p>${esc(opts.message || "Server game belum aktif. Coba lagi sebentar lagi.")}</p>
        <button class="btn-primary" type="button" data-fish-act="retry">Coba Lagi</button>
      </div>`;
  }

  function panelHtml() {
    if (!FC.cat || !FC.state) return "";
    switch (FC.panel) {
      case "area": return panelArea();
      case "toko": return panelToko();
      case "tas": return panelTas();
      case "koleksi": return panelKoleksi();
      case "peringkat": return panelPeringkat();
      case "legenda": return panelLegenda();
      case "profil": return panelProfil();
      default: return panelLobby();
    }
  }

  /* ================= PANEL: LOBBY ================= */
  function panelLobby() {
    const s = FC.state;
    const rod = rodDipakai();
    const info = rod ? infoRod(rod.id) : null;
    const bait = infoBait(s.equippedBait);
    const stok = stokUmpan(s.equippedBait);
    const species = Object.keys(s.collection || {}).length;
    const totalIkan = Object.values(s.fish || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const belum = (FC.cat.achievements || []).filter((a) => !s.achievements[a.id]);
    const achNext = belum[0];
    const topFirst = (FC.meta && FC.meta.legend && FC.meta.legend[0]) || null;
    const topSecret = (FC.meta && FC.meta.secret && FC.meta.secret[0]) || null;

    const ann = (FC.announcements || []).slice(0, 4);
    const annHtml = ann.length
      ? ann.map((a) => `
        <li class="fishing-ann-row rarity-${esc(a.type)}">
          <span class="fishing-ann-art">${fishArt(infoIkan(a.fishId), { label: a.fishName })}</span>
          <span class="fishing-ann-text">
            <strong>${esc(a.name)}</strong> menangkap <b>${esc(a.fishName)}</b>
            ${a.firstSlot ? `<em>First ${a.type === "secret" ? "Secret" : "Legend"} #${a.firstSlot}</em>` : ""}
            <small>${waktu(a.at)}</small>
          </span>
        </li>`).join("")
      : `<li class="fishing-empty-line">Belum ada Legenda atau Secret yang tertangkap. Jadi yang pertama!</li>`;

    return `
      <div class="fishing-lobby">
        <div class="fishing-grid fishing-grid-2">
          <article class="fishing-card fishing-gear-card">
            <div class="fishing-card-head">
              <div><p class="fishing-kicker">Perlengkapan aktif</p><h3>Siap memancing?</h3></div>
              <span class="fishing-live-dot">LIVE</span>
            </div>
            <div class="fishing-gear-row">
              <span class="fishing-gear-art">${rodArt(info, { label: info ? info.name : "Joran" })}</span>
              <div class="fishing-gear-info">
                <small>Joran</small>
                <strong>${esc(info ? info.name : "—")}</strong>
                <span class="fishing-durability"><span style="width:${info ? Math.round((rod.durability / info.durability) * 100) : 0}%"></span></span>
                <em>${rod ? `${angka(rod.durability)}/${angka(info ? info.durability : 0)} durability · luck +${angka(info ? info.luck : 0)}` : "Belum ada joran"}</em>
              </div>
            </div>
            <div class="fishing-gear-row">
              <span class="fishing-gear-art">${baitArt(bait)}</span>
              <div class="fishing-gear-info">
                <small>Umpan</small>
                <strong>${esc(bait ? bait.name : "—")}</strong>
                <em>Stok ${angka(stok)} · luck +${angka(bait ? bait.luck : 0)}</em>
              </div>
            </div>
            <div class="fishing-lobby-actions">
              <button class="btn-primary fishing-btn-main" type="button" data-fish-nav="area">🎣 Mulai Mancing</button>
              <button class="btn-secondary" type="button" data-fish-nav="toko">🛒 Toko</button>
            </div>
          </article>

          <article class="fishing-card fishing-quick-card">
            <div class="fishing-card-head"><div><p class="fishing-kicker">Ringkasan</p><h3>Progresmu</h3></div></div>
            <div class="fishing-mini-stats">
              <div><span>💰 Koin</span><strong>${angka(s.coins)}</strong></div>
              <div><span>📦 Nilai tas</span><strong>${angka(s.totalValue)}</strong></div>
              <div><span>🐟 Ikan</span><strong>${angka(totalIkan)}</strong></div>
              <div><span>📖 Spesies</span><strong>${angka(species)}/${(FC.cat.fish || []).length}</strong></div>
            </div>
            <div class="fishing-quick-links">
              <button type="button" data-fish-nav="tas">🎒 Buka Tas</button>
              <button type="button" data-fish-nav="koleksi">📖 Koleksi</button>
              <button type="button" data-fish-nav="peringkat">🏆 Peringkat</button>
              <button type="button" data-fish-nav="profil">👤 Profil</button>
            </div>
            ${achNext ? `
              <div class="fishing-next-ach">
                <span aria-hidden="true">${achNext.icon}</span>
                <div><small>Pencapaian berikutnya</small><strong>${esc(achNext.name)}</strong><em>${esc(achNext.desc)}</em></div>
              </div>` : `<div class="fishing-next-ach is-done"><span>🏆</span><div><small>Pencapaian</small><strong>Semua terbuka!</strong><em>Kamu sudah menyelesaikan semua misi.</em></div></div>`}
          </article>
        </div>

        <div class="fishing-grid fishing-grid-2">
          <article class="fishing-card">
            <div class="fishing-card-head"><div><p class="fishing-kicker">Pengumuman global</p><h3>Tangkapan besar</h3></div><span class="fishing-live-dot">LIVE</span></div>
            <ul class="fishing-ann-list">${annHtml}</ul>
          </article>

          <article class="fishing-card fishing-first-mini">
            <div class="fishing-card-head"><div><p class="fishing-kicker">Kompetisi permanen</p><h3>First Legend &amp; Secret</h3></div><button class="fishing-text-link" type="button" data-fish-nav="legenda">Lihat semua →</button></div>
            <div class="fishing-first-slot">
              <span class="fishing-first-badge">👑 Legend</span>
              ${topFirst ? `
                <span class="fishing-first-art">${fishArt(infoIkan(topFirst.fishId), { label: topFirst.fishName })}</span>
                <div><strong>${esc(topFirst.fishName)}</strong><small>${esc(topFirst.name)} · ${waktu(topFirst.at)}</small></div>
              ` : `<div class="fishing-first-empty"><span>Slot pertama masih terbuka</span><small>Jadi orang pertama yang menangkap Legend!</small></div>`}
            </div>
            <div class="fishing-first-slot secret">
              <span class="fishing-first-badge">🌟 Secret</span>
              ${topSecret ? `
                <span class="fishing-first-art">${fishArt(infoIkan(topSecret.fishId), { label: topSecret.fishName })}</span>
                <div><strong>${esc(topSecret.fishName)}</strong><small>${esc(topSecret.name)} · ${waktu(topSecret.at)}</small></div>
              ` : `<div class="fishing-first-empty"><span>Slot pertama masih terbuka</span><small>Peluang 0,01% — siapa berani?</small></div>`}
            </div>
          </article>
        </div>
      </div>`;
  }

  /* ================= PANEL: AREA MANCING ================= */
  function serverNow() {
    return Date.now() + FC.serverOffset;
  }

  function hitungOffset(serverNowValue, mulai) {
    const rtt = Math.max(0, Date.now() - mulai);
    FC.serverOffset = Number(serverNowValue) + rtt / 2 - Date.now();
  }

  function getar(pola) {
    try { if (navigator.vibrate) navigator.vibrate(pola); } catch (err) { /* ignore */ }
  }

  function persenPeluang(v) {
    const n = Number(v) || 0;
    return `${n.toFixed(n < 1 ? 2 : 1).replace(/\.?0+$/, "")}%`;
  }

  function beratNilai(v) {
    return Number(v || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  }

  function rarityUrut(id) {
    const o = (FC.cat && FC.cat.rarityOrder ? FC.cat.rarityOrder : []).indexOf(id);
    return o < 0 ? 99 : o;
  }

  function faseSekuens() {
    if (FC.seq && FC.seq.phase) return FC.seq.phase;
    if (FC.aksi) return "casting";
    return "idle";
  }

  function sceneBoat() {
    return `
      <svg class="fishing-boat-svg" viewBox="0 0 200 120" role="img" aria-label="Perahu pemancing">
        <path d="M22 82 Q100 112 178 82 L164 100 Q100 118 36 100 Z" fill="#8a5a3a"/>
        <path d="M22 82 Q100 104 178 82 L172 88 Q100 110 28 88 Z" fill="#b07a4d"/>
        <path d="M34 82 L166 82" stroke="#d9a06b" stroke-width="4" stroke-linecap="round"/>
        <path d="M74 82 L74 44" stroke="#6f452b" stroke-width="3"/>
        <circle cx="74" cy="35" r="6.5" fill="#f2cda9"/>
        <path d="M74 42 L70 66 L64 82 M74 42 L78 66 L86 82" stroke="#2f6f6a" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M70 50 L88 60" stroke="#2f6f6a" stroke-width="4" stroke-linecap="round"/>
        <path d="M88 60 L142 24" stroke="#efe3c4" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M142 24 C154 44 152 62 148 74" fill="none" stroke="#ffffff" stroke-width="1" opacity=".55"/>
        <path d="M24 102 Q60 110 100 106 Q140 110 176 102" fill="none" stroke="#ffffff" stroke-width="1.5" opacity=".35"/>
      </svg>`;
  }

  function panelArea() {
    const s = FC.state;
    const rod = rodDipakai();
    const rodInfo = rod ? infoRod(rod.id) : null;
    const baitInfo = infoBait(s.equippedBait);
    const stok = stokUmpan(s.equippedBait);
    const phase = faseSekuens();
    const seq = FC.seq || {};
    const rusak = !!rod && Number(rod.durability) <= 0;
    const habis = stok <= 0;
    const bisaLempar = phase === "idle" && !FC.aksi && !rusak && !habis;
    const label = phase === "waiting" ? "Menunggu gigitan…"
      : phase === "bite" ? "GIGITAN! Tarik sekarang!"
      : phase === "reeling" ? "Menarik pancing…"
      : phase === "result" ? "Menyelesaikan tangkapan…"
      : phase === "casting" ? "Melempar pancing…"
      : "Siap melempar";
    const durasi = phase === "bite" && seq.windowEnd
      ? Math.max(120, Number(seq.windowEnd) - serverNow()) : 0;
    const odds = (seq.odds && (phase === "waiting" || phase === "bite")) ? seq.odds : null;
    const scenePhase = phase === "bite" ? "is-bite" : phase === "waiting" ? "is-waiting" : phase === "reeling" ? "is-reeling" : "is-idle";

    const tombol =
      phase === "bite" ? `<button class="fishing-cast-btn is-bite" type="button" data-fish-act="strike">
          <span class="fishing-cast-emoji" aria-hidden="true">⚡</span>
          <span>TARIK!</span><small>Hook ikannya sekarang</small>
        </button>`
      : phase === "waiting" ? `<button class="fishing-cast-btn is-waiting" type="button" disabled>
          <span class="fishing-cast-emoji" aria-hidden="true">🎣</span>
          <span>Menunggu gigitan<span class="fishing-dots"><i></i><i></i><i></i></span></span><small>Jangan tarik sebelum ikan menggigit</small>
        </button>`
      : phase === "reeling" || phase === "result" || phase === "casting" ? `<button class="fishing-cast-btn is-loading" type="button" disabled>
          <span class="fishing-cast-emoji" aria-hidden="true">🌀</span>
          <span>${phase === "reeling" ? "Menarik pancing…" : phase === "casting" ? "Melempar pancing…" : "Selesai…"}</span>
          <small>Server sedang memproses tangkapan</small>
        </button>`
      : `<button class="fishing-cast-btn" type="button" data-fish-act="cast" ${bisaLempar ? "" : "disabled"}>
          <span class="fishing-cast-emoji" aria-hidden="true">🎣</span>
          <span>Lempar Pancing</span><small>1 umpan per lemparan</small>
        </button>`;

    const peringatan = rusak
      ? `<div class="fishing-alert is-error"><span>🔧</span><p><strong>Joran rusak.</strong> Durability-nya habis. Repair dulu di Toko.</p><button type="button" class="fishing-text-link" data-fish-nav="toko">Buka Toko →</button></div>`
      : habis
        ? `<div class="fishing-alert is-warn"><span>🐛</span><p><strong>Umpan habis.</strong> Stok ${esc(baitInfo ? baitInfo.name : "umpan")} kamu 0. Beli dulu sebelum melempar.</p><button type="button" class="fishing-text-link" data-fish-nav="toko">Beli Umpan →</button></div>`
        : "";

    return `
      <div class="fishing-area">
        <div class="fishing-scene ${scenePhase}">
          <div class="fishing-scene-sky" aria-hidden="true">
            <span class="fishing-sun"></span>
            <span class="fishing-cloud c1"></span>
            <span class="fishing-cloud c2"></span>
            <span class="fishing-cloud c3"></span>
          </div>
          <div class="fishing-scene-water" aria-hidden="true">
            <span class="fishing-wave w1"></span>
            <span class="fishing-wave w2"></span>
            <span class="fishing-wave w3"></span>
            <span class="fishing-ripple r1"></span>
            <span class="fishing-ripple r2"></span>
            <span class="fishing-ripple r3"></span>
            <div class="fishing-rig">
              <span class="fishing-rig-line"></span>
              <span class="fishing-bobber"></span>
            </div>
            <div class="fishing-boat">${sceneBoat()}</div>
            <span class="fishing-catch-flash">🐟</span>
          </div>
          <div class="fishing-scene-status"><span>${label}</span></div>
        </div>

        ${peringatan}

        <div class="fishing-cast-card">
          <div class="fishing-cast-info">
            <div class="fishing-cast-gear">
              <span class="fishing-cast-art">${rodArt(rodInfo, { label: rodInfo ? rodInfo.name : "Joran" })}</span>
              <div>
                <small>Joran aktif</small>
                <strong>${esc(rodInfo ? rodInfo.name : "—")}</strong>
                <em>${rod ? `${angka(rod.durability)}/${angka(rodInfo ? rodInfo.durability : 0)} durability · 🍀 +${angka(rodInfo ? rodInfo.luck : 0)}` : "Belum punya joran"}</em>
              </div>
            </div>
            <div class="fishing-cast-gear">
              <span class="fishing-cast-art is-bait">${baitArt(baitInfo)}</span>
              <div>
                <small>Umpan aktif</small>
                <strong>${esc(baitInfo ? baitInfo.name : "—")}</strong>
                <em>Stok ${angka(stok)} · 🍀 +${angka(baitInfo ? baitInfo.luck : 0)}</em>
              </div>
            </div>
            <div class="fishing-cast-luck">
              <small>Total luck</small>
              <strong>+${angka((rodInfo ? rodInfo.luck : 0) + (baitInfo ? baitInfo.luck : 0))}</strong>
            </div>
          </div>

          ${tombol}

          ${phase === "bite" ? `
            <div class="fishing-timing" role="timer" aria-label="Waktu menarik pancing">
              <div class="fishing-timing-track">
                <span class="fishing-timing-zone"></span>
                <span class="fishing-timing-marker" style="animation-duration:${durasi}ms"></span>
              </div>
              <div class="fishing-timing-labels"><span>Gigitan</span><span>Ikan kabur</span></div>
            </div>` : ""}

          ${odds ? `
            <div class="fishing-odds">
              <p class="fishing-odds-title">Peluang rarity lemparan ini</p>
              <div class="fishing-odds-list">
                ${(FC.cat.rarityOrder || []).map((r) => {
                  const info = rarityInfo(r);
                  return `<span class="fishing-odds-chip rarity-${esc(r)}" style="--rarity:${esc(info.color)};--rarity-soft:${esc(info.soft)}">${esc(info.label)} <b>${persenPeluang(odds[r])}</b></span>`;
                }).join("")}
              </div>
            </div>` : ""}

          <p class="fishing-area-note">Setiap lemparan memakai <b>1 umpan</b>. Tunggu sampai ikan menggigit, lalu tekan <b>TARIK!</b> sebelum waktunya habis. Hasil dan rarity dihitung di server.</p>
        </div>

        <div class="fishing-area-tips">
          <span>💡 Tips</span>
          <p>Joran &amp; umpan dengan luck lebih tinggi memperbesar peluang Rare ke atas. Umpan tetap terpakai walaupun ikan kabur.</p>
        </div>
      </div>`;
  }

  /* ================= PANEL: TOKO ================= */
  function shopTabs() {
    return `<div class="fishing-subtabs" role="tablist" aria-label="Kategori toko">
      ${[["rod", "🎣 Joran"], ["bait", "🐛 Umpan"], ["repair", "🔧 Repair"]].map(([id, label]) => `
        <button class="fishing-subtab ${FC.shopTab === id ? "is-active" : ""}" type="button" role="tab" aria-selected="${FC.shopTab === id}" data-fish-act="shop-tab" data-tab="${id}">${label}</button>`).join("")}
    </div>`;
  }

  function panelToko() {
    const s = FC.state;
    const isi = FC.shopTab === "bait" ? tokoUmpan() : FC.shopTab === "repair" ? tokoRepair() : tokoJoran();
    return `
      <div class="fishing-shop">
        <div class="fishing-section-head">
          <div><p class="fishing-kicker">Toko fishing</p><h3>Perlengkapan &amp; perawatan</h3><p>Semua pembelian divalidasi server dan langsung tersimpan di akunmu.</p></div>
          <span class="fishing-coin-pill">💰 <strong>${angka(s.coins)}</strong></span>
        </div>
        ${shopTabs()}
        <div class="fishing-shop-list">${isi}</div>
      </div>`;
  }

  function tokoJoran() {
    const s = FC.state;
    const eq = infoRod(s.equippedRod);
    return (FC.cat.rods || []).map((rod) => {
      const milik = s.rods.find((r) => r.id === rod.id);
      const dipakai = s.equippedRod === rod.id;
      const cukup = s.coins >= rod.price;
      const beda = eq && eq.id !== rod.id
        ? `<div class="fishing-compare"><span>Luck ${rod.luck >= eq.luck ? "+" : ""}${angka(rod.luck - eq.luck)}</span><span>Durability ${rod.durability >= eq.durability ? "+" : ""}${angka(rod.durability - eq.durability)}</span></div>`
        : "";
      const aksi = milik
        ? (dipakai
          ? `<span class="fishing-tag is-on">Sedang dipakai</span>`
          : `<button class="btn-secondary fishing-buy-btn" type="button" data-fish-act="equip-rod" data-rod="${esc(rod.id)}">Pakai</button>`)
        : `<button class="btn-primary fishing-buy-btn" type="button" data-fish-act="buy-rod" data-rod="${esc(rod.id)}" ${cukup ? "" : "disabled"}>${cukup ? "Beli" : "Koin kurang"}</button>`;
      return `
        <article class="fishing-shop-item ${milik ? "is-owned" : ""} ${dipakai ? "is-equipped" : ""}">
          <span class="fishing-shop-art">${rodArt(rod)}</span>
          <div class="fishing-shop-body">
            <div class="fishing-shop-title"><h4>${esc(rod.name)}</h4><span class="fishing-tier">Tier ${angka(rod.tier)}</span></div>
            <p>${esc(rod.desc)}</p>
            <div class="fishing-stat-row">
              <span>🍀 Luck +${angka(rod.luck)}</span>
              <span>🛠️ ${angka(rod.durability)} durability</span>
              <span>🔧 ${angka(rod.repair)} koin/poin</span>
            </div>
            ${beda}
          </div>
          <div class="fishing-shop-buy">
            <span class="fishing-price">${milik ? "Sudah dimiliki" : `💰 ${angka(rod.price)}`}</span>
            ${aksi}
          </div>
        </article>`;
    }).join("");
  }

  function tokoUmpan() {
    const s = FC.state;
    return (FC.cat.baits || []).map((bait) => {
      const stok = stokUmpan(bait.id);
      const dipakai = s.equippedBait === bait.id;
      const cukup1 = s.coins >= bait.price;
      const cukup10 = s.coins >= bait.price * 10;
      return `
        <article class="fishing-shop-item bait-item ${dipakai ? "is-equipped" : ""}">
          <span class="fishing-shop-art is-bait">${baitArt(bait)}</span>
          <div class="fishing-shop-body">
            <div class="fishing-shop-title"><h4>${esc(bait.name)}</h4><span class="fishing-tier">Tier ${angka(bait.tier)}</span></div>
            <p>${esc(bait.desc)}</p>
            <div class="fishing-stat-row">
              <span>🍀 Luck +${angka(bait.luck)}</span>
              <span>📦 Stok ${angka(stok)}</span>
              <span>💰 ${angka(bait.price)}/buah</span>
            </div>
          </div>
          <div class="fishing-shop-buy">
            <div class="fishing-buy-group">
              <button class="btn-secondary fishing-buy-btn" type="button" data-fish-act="buy-bait" data-bait="${esc(bait.id)}" data-qty="1" ${cukup1 ? "" : "disabled"}>+1</button>
              <button class="btn-secondary fishing-buy-btn" type="button" data-fish-act="buy-bait" data-bait="${esc(bait.id)}" data-qty="10" ${cukup10 ? "" : "disabled"}>+10</button>
            </div>
            ${stok > 0
              ? (dipakai ? `<span class="fishing-tag is-on">Dipakai</span>` : `<button class="btn-primary fishing-buy-btn" type="button" data-fish-act="equip-bait" data-bait="${esc(bait.id)}">Pakai</button>`)
              : `<span class="fishing-tag">Belum punya</span>`}
          </div>
        </article>`;
    }).join("");
  }

  function tokoRepair() {
    const s = FC.state;
    const rusak = s.rods.map((r) => {
      const info = infoRod(r.id);
      if (!info) return null;
      const hilang = Math.max(0, info.durability - r.durability);
      return { rod: r, info, hilang, biaya: hilang * info.repair };
    }).filter(Boolean).sort((a, b) => b.hilang - a.hilang);

    if (!rusak.length) return `<div class="fishing-empty-card"><span>🎣</span><p>Kamu belum punya joran.</p></div>`;
    const adaRusak = rusak.some((x) => x.hilang > 0);
    return `
      <div class="fishing-repair-note">
        <span>🔧</span>
        <p>Biaya repair = durability yang hilang × biaya repair joran. Joran yang sudah penuh tidak perlu diperbaiki.</p>
      </div>
      ${rusak.map(({ rod, info, hilang, biaya }) => {
        const pct = Math.round((rod.durability / info.durability) * 100);
        const cukup = s.coins >= biaya;
        return `
          <article class="fishing-shop-item repair-item ${rod.id === s.equippedRod ? "is-equipped" : ""}">
            <span class="fishing-shop-art">${rodArt(info)}</span>
            <div class="fishing-shop-body">
              <div class="fishing-shop-title"><h4>${esc(info.name)}</h4>${rod.id === s.equippedRod ? `<span class="fishing-tier">Aktif</span>` : ""}</div>
              <div class="fishing-durability big"><span style="width:${pct}%"></span></div>
              <div class="fishing-stat-row">
                <span>🛠️ ${angka(rod.durability)}/${angka(info.durability)}</span>
                <span>Hilang ${angka(hilang)}</span>
              </div>
            </div>
            <div class="fishing-shop-buy">
              ${hilang > 0
                ? `<span class="fishing-price">💰 ${angka(biaya)}</span>
                   <button class="btn-primary fishing-buy-btn" type="button" data-fish-act="repair" data-rod="${esc(rod.id)}" ${cukup ? "" : "disabled"}>${cukup ? "Repair" : "Koin kurang"}</button>`
                : `<span class="fishing-tag is-on">Kondisi penuh</span>`}
            </div>
          </article>`;
      }).join("")}
      ${adaRusak ? "" : `<div class="fishing-empty-line">Semua joran dalam kondisi penuh. 🎉</div>`}`;
  }

  /* ================= PANEL: TAS ================= */
  function tasTabs() {
    return `<div class="fishing-subtabs" role="tablist" aria-label="Kategori tas">
      ${[["fish", "🐟 Ikan"], ["rod", "🎣 Joran"], ["bait", "🐛 Umpan"]].map(([id, label]) => `
        <button class="fishing-subtab ${FC.invTab === id ? "is-active" : ""}" type="button" role="tab" aria-selected="${FC.invTab === id}" data-fish-act="inv-tab" data-tab="${id}">${label}</button>`).join("")}
    </div>`;
  }

  function panelTas() {
    const s = FC.state;
    const isi = FC.invTab === "rod" ? tasJoran() : FC.invTab === "bait" ? tasUmpan() : tasIkan();
    return `
      <div class="fishing-inventory">
        <div class="fishing-section-head">
          <div><p class="fishing-kicker">Tas pemancing</p><h3>Semua hasil tangkapanmu</h3><p>Ikan bisa dijual kapan saja. Ikan yang dikunci tidak ikut terjual saat Jual Semua.</p></div>
          <span class="fishing-value-pill">📦 Nilai <strong>${angka(s.totalValue)}</strong></span>
        </div>
        ${tasTabs()}
        ${isi}
      </div>`;
  }

  function tasIkan() {
    const s = FC.state;
    const items = Object.entries(s.fish || {})
      .filter(([, n]) => Number(n) > 0)
      .map(([id, n]) => ({ fish: infoIkan(id), count: Number(n) }))
      .filter((x) => x.fish)
      .sort((a, b) => rarityUrut(b.fish.rarity) - rarityUrut(a.fish.rarity) || b.fish.value - a.fish.value);

    const totalJual = items.reduce((a, x) => a + (s.locked[x.fish.id] ? 0 : x.fish.value * x.count), 0);
    const totalIkan = items.reduce((a, x) => a + x.count, 0);
    const adaTerkunci = items.some((x) => s.locked[x.fish.id]);

    if (!items.length) {
      return `<div class="fishing-empty-card">
        <span aria-hidden="true">🎒</span>
        <h4>Tas masih kosong</h4>
        <p>Lempar pancing di Area Mancing. Ikan hasil tangkapan akan muncul di sini.</p>
        <button class="btn-primary" type="button" data-fish-nav="area">🎣 Mulai Mancing</button>
      </div>`;
    }

    return `
      <div class="fishing-inv-summary">
        <div><span>Total ikan</span><strong>${angka(totalIkan)}</strong></div>
        <div><span>Spesies</span><strong>${angka(items.length)}</strong></div>
        <div><span>Bisa dijual</span><strong>💰 ${angka(totalJual)}</strong></div>
        <button class="btn-secondary fishing-sell-all" type="button" data-fish-act="sell-all" ${totalJual > 0 ? "" : "disabled"}>Jual Semua${adaTerkunci ? " (tanpa terkunci)" : ""}</button>
      </div>
      <div class="fishing-inv-grid">
        ${items.map(({ fish, count }) => {
          const terkunci = !!s.locked[fish.id];
          return `
            <article class="fishing-inv-card rarity-${esc(fish.rarity)} ${terkunci ? "is-locked" : ""}" style="--rarity:${esc(rarityInfo(fish.rarity).color)};--rarity-soft:${esc(rarityInfo(fish.rarity).soft)}">
              <div class="fishing-inv-art">
                ${fishArt(fish)}
                ${terkunci ? `<span class="fishing-lock-badge" title="Terkunci">🔒</span>` : ""}
              </div>
              <div class="fishing-inv-body">
                <div class="fishing-inv-title"><h4>${esc(fish.name)}</h4>${rarityChip(fish.rarity)}</div>
                <div class="fishing-inv-meta"><span>${angka(count)}× di tas</span><span>💰 ${angka(fish.value)}/ekor</span></div>
                <strong class="fishing-inv-total">${angka(fish.value * count)}</strong>
                <div class="fishing-inv-actions">
                  <button class="btn-secondary fishing-mini-btn" type="button" data-fish-act="sell-one" data-fish-id="${esc(fish.id)}" ${terkunci ? "disabled" : ""}>Jual 1</button>
                  ${count > 1 ? `<button class="btn-secondary fishing-mini-btn" type="button" data-fish-act="sell-stack" data-fish-id="${esc(fish.id)}" ${terkunci ? "disabled" : ""}>Jual ${angka(count)}</button>` : ""}
                  <button class="btn-text-only fishing-mini-btn lock-btn" type="button" data-fish-act="lock-toggle" data-fish-id="${esc(fish.id)}" data-lock="${terkunci ? "0" : "1"}">${terkunci ? "🔓 Buka" : "🔒 Kunci"}</button>
                </div>
              </div>
            </article>`;
        }).join("")}
      </div>`;
  }

  function tasJoran() {
    const s = FC.state;
    if (!s.rods.length) return `<div class="fishing-empty-card"><span>🎣</span><p>Belum ada joran.</p></div>`;
    return `<div class="fishing-list">${s.rods.map((r) => {
      const info = infoRod(r.id);
      if (!info) return "";
      const pct = Math.round((r.durability / info.durability) * 100);
      const dipakai = s.equippedRod === r.id;
      return `
        <article class="fishing-list-row ${dipakai ? "is-equipped" : ""}">
          <span class="fishing-list-art">${rodArt(info)}</span>
          <div class="fishing-list-body">
            <div class="fishing-list-title"><h4>${esc(info.name)}</h4><span class="fishing-tier">Tier ${angka(info.tier)}</span></div>
            <div class="fishing-durability"><span style="width:${pct}%"></span></div>
            <div class="fishing-stat-row"><span>🛠️ ${angka(r.durability)}/${angka(info.durability)}</span><span>🍀 Luck +${angka(info.luck)}</span></div>
          </div>
          ${dipakai
            ? `<span class="fishing-tag is-on">Dipakai</span>`
            : `<button class="btn-secondary fishing-mini-btn" type="button" data-fish-act="equip-rod" data-rod="${esc(r.id)}">Pakai</button>`}
        </article>`;
    }).join("")}</div>`;
  }

  function tasUmpan() {
    const s = FC.state;
    const items = (FC.cat.baits || []).filter((b) => stokUmpan(b.id) > 0);
    if (!items.length) {
      return `<div class="fishing-empty-card">
        <span>🐛</span><h4>Umpan habis</h4><p>Beli umpan di Toko supaya bisa melempar pancing lagi.</p>
        <button class="btn-primary" type="button" data-fish-nav="toko">Buka Toko</button>
      </div>`;
    }
    return `<div class="fishing-list">${items.map((b) => {
      const dipakai = s.equippedBait === b.id;
      return `
        <article class="fishing-list-row ${dipakai ? "is-equipped" : ""}">
          <span class="fishing-list-art is-bait">${baitArt(b)}</span>
          <div class="fishing-list-body">
            <div class="fishing-list-title"><h4>${esc(b.name)}</h4><span class="fishing-tier">Tier ${angka(b.tier)}</span></div>
            <div class="fishing-stat-row"><span>📦 Stok ${angka(stokUmpan(b.id))}</span><span>🍀 Luck +${angka(b.luck)}</span><span>💰 ${angka(b.price)}/buah</span></div>
          </div>
          ${dipakai
            ? `<span class="fishing-tag is-on">Dipakai</span>`
            : `<button class="btn-secondary fishing-mini-btn" type="button" data-fish-act="equip-bait" data-bait="${esc(b.id)}">Pakai</button>`}
        </article>`;
    }).join("")}</div>`;
  }

  /* ================= PANEL: KOLEKSI ================= */
  function panelKoleksi() {
    const s = FC.state;
    const semua = FC.cat.fish || [];
    const ditemukan = semua.filter((f) => s.collection[f.id]).length;
    const pct = semua.length ? Math.round((ditemukan / semua.length) * 100) : 0;
    const filter = FC.collFilter;

    const perRarity = {};
    (FC.cat.rarityOrder || []).forEach((r) => { perRarity[r] = { total: 0, found: 0 }; });
    semua.forEach((f) => {
      if (!perRarity[f.rarity]) perRarity[f.rarity] = { total: 0, found: 0 };
      perRarity[f.rarity].total += 1;
      if (s.collection[f.id]) perRarity[f.rarity].found += 1;
    });

    const list = semua
      .filter((f) => filter === "semua" || f.rarity === filter)
      .sort((a, b) => rarityUrut(b.rarity) - rarityUrut(a.rarity) || b.value - a.value);

    return `
      <div class="fishing-collection">
        <div class="fishing-section-head">
          <div><p class="fishing-kicker">Ensiklopedia laut</p><h3>Koleksi ${angka(ditemukan)}/${angka(semua.length)} spesies</h3><p>Spesies yang pernah tertangkap terbuka permanen, walaupun ikannya sudah dijual.</p></div>
          <span class="fishing-tag is-on">${pct}% lengkap</span>
        </div>

        <div class="fishing-collection-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <span style="width:${pct}%"></span>
        </div>

        <div class="fishing-coll-filters">
          <button class="fishing-filter ${filter === "semua" ? "is-active" : ""}" type="button" data-fish-act="coll-filter" data-filter="semua">Semua <b>${angka(ditemukan)}/${angka(semua.length)}</b></button>
          ${(FC.cat.rarityOrder || []).map((r) => {
            const info = rarityInfo(r);
            const c = perRarity[r] || { total: 0, found: 0 };
            return `<button class="fishing-filter rarity-${esc(r)} ${filter === r ? "is-active" : ""}" type="button" data-fish-act="coll-filter" data-filter="${esc(r)}" style="--rarity:${esc(info.color)};--rarity-soft:${esc(info.soft)}">${esc(info.label)} <b>${angka(c.found)}/${angka(c.total)}</b></button>`;
          }).join("")}
        </div>

        <div class="fishing-coll-grid">
          ${list.map((fish) => {
            const rec = s.collection[fish.id];
            const ketemu = !!rec;
            return `
              <button class="fishing-coll-card rarity-${esc(fish.rarity)} ${ketemu ? "is-found" : "is-unknown"}" type="button" data-fish-act="fish-detail" data-fish-id="${esc(fish.id)}" style="--rarity:${esc(rarityInfo(fish.rarity).color)};--rarity-soft:${esc(rarityInfo(fish.rarity).soft)}">
                <span class="fishing-coll-art">${ketemu ? fishArt(fish) : fishArt(fish, { silhouette: true, label: "Ikan belum ditemukan" })}</span>
                <span class="fishing-coll-info">
                  <strong>${ketemu ? esc(fish.name) : "???"}</strong>
                  ${rarityChip(fish.rarity)}
                  <small>${ketemu ? `Tertangkap ${angka(rec.caught)}×` : "Belum ditemukan"}</small>
                </span>
              </button>`;
          }).join("")}
        </div>
      </div>`;
  }

  function bukaDetailIkan(id) {
    const fish = infoIkan(id);
    if (!fish) return;
    const s = FC.state;
    const rec = s.collection[id];
    const stok = Number(s.fish[id]) || 0;
    const terkunci = !!s.locked[id];
    if (!rec) {
      bukaModal(`
        <div class="fishing-fish-detail is-unknown rarity-${esc(fish.rarity)}">
          <div class="fishing-detail-art">${fishArt(fish, { silhouette: true, label: "Ikan belum ditemukan" })}</div>
          <h3>???</h3>
          ${rarityChip(fish.rarity)}
          <p class="fishing-detail-desc">Kamu belum pernah menangkap ikan ini. Terus memancing — ikan ${esc(rarityInfo(fish.rarity).label)} bisa muncul kapan saja.</p>
          <div class="fishing-detail-stats"><div><span>Nilai jual</span><strong>💰 ${angka(fish.value)}</strong></div><div><span>Berat dasar</span><strong>${beratNilai(fish.weight)} kg</strong></div></div>
          <div class="fishing-modal-actions"><button class="btn-primary" type="button" data-fish-act="modal-close">Tutup</button></div>
        </div>`, { kelas: "fishing-modal-fish" });
      return;
    }
    bukaModal(`
      <div class="fishing-fish-detail rarity-${esc(fish.rarity)}" style="--rarity:${esc(rarityInfo(fish.rarity).color)};--rarity-soft:${esc(rarityInfo(fish.rarity).soft)}">
        <div class="fishing-detail-art">${fishArt(fish)}</div>
        <h3>${esc(fish.name)}</h3>
        <div class="fishing-detail-chips">${rarityChip(fish.rarity)}${stok > 0 ? `<span class="fishing-tag is-on">${angka(stok)}× di tas</span>` : `<span class="fishing-tag">Tidak di tas</span>`}${terkunci ? `<span class="fishing-tag">🔒 Terkunci</span>` : ""}</div>
        <p class="fishing-detail-desc">${esc(fish.desc)}</p>
        <div class="fishing-detail-stats">
          <div><span>Nilai jual</span><strong>💰 ${angka(fish.value)}</strong></div>
          <div><span>Berat dasar</span><strong>${beratNilai(fish.weight)} kg</strong></div>
          <div><span>Total tertangkap</span><strong>${angka(rec.caught)}×</strong></div>
          <div><span>Pertama ditemukan</span><strong>${tanggal(rec.firstAt)}</strong></div>
        </div>
        <div class="fishing-modal-actions">
          ${stok > 0 ? `<button class="btn-secondary" type="button" data-fish-act="nav-tas">Lihat di Tas</button>` : ""}
          <button class="btn-primary" type="button" data-fish-act="modal-close">Tutup</button>
        </div>
      </div>`, { kelas: "fishing-modal-fish" });
  }

  /* ================= PANEL: PERINGKAT ================= */
  function panelPeringkat() {
    const s = FC.state;
    const rows = FC.board;
    if (!rows) {
      return `<div class="fishing-board">${loadingHtml()}</div>`;
    }
    const posisiSaya = rows.findIndex((r) => Number(r.absen) === Number(s.absen));
    const saya = rows[posisiSaya];
    return `
      <div class="fishing-board">
        <div class="fishing-section-head">
          <div><p class="fishing-kicker">Kompetisi global</p><h3>Peringkat nelayan</h3><p>Diurutkan dari total nilai ikan di Tas (jumlah × harga jual). Menjual ikan menurunkan nilai tas.</p></div>
          <span class="fishing-live-dot">LIVE</span>
        </div>

        ${saya ? `<div class="fishing-board-me">
          <span class="fishing-board-rank">#${posisiSaya + 1}</span>
          ${avatar(saya.absen, saya.name, "md")}
          <div><small>Posisi kamu</small><strong>${esc(saya.name)}</strong><em>${angka(saya.totalCaught)} ikan · ${angka(saya.species)} spesies</em></div>
          <span class="fishing-board-value">📦 ${angka(saya.totalValue)}</span>
        </div>` : `<div class="fishing-board-me is-outside">
          ${avatar(s.absen, s.name, "md")}
          <div><small>Posisi kamu</small><strong>${esc(s.name)}</strong><em>Masih di luar 50 besar — kumpulkan ikan bernilai tinggi!</em></div>
          <span class="fishing-board-value">📦 ${angka(s.totalValue)}</span>
        </div>`}

        ${rows.length ? `<ol class="fishing-board-list">
          ${rows.map((r, i) => {
            const rank = i + 1;
            const sayaSendiri = Number(r.absen) === Number(s.absen);
            const medali = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
            return `<li class="fishing-board-row ${sayaSendiri ? "is-me" : ""} ${rank <= 3 ? "is-top" : ""}">
              <span class="fishing-board-rank">${medali}</span>
              ${avatar(r.absen, r.name, "sm")}
              <div class="fishing-board-id">
                <strong>${esc(r.name)}${sayaSendiri ? ` <span class="fishing-you">Kamu</span>` : ""}</strong>
                <small>${angka(r.totalCaught)} ikan · ${angka(r.species)} spesies</small>
              </div>
              <span class="fishing-board-value">📦 ${angka(r.totalValue)}</span>
            </li>`;
          }).join("")}
        </ol>` : `<div class="fishing-empty-card"><span>🏆</span><h4>Belum ada yang memancing</h4><p>Jadilah yang pertama muncul di papan peringkat.</p><button class="btn-primary" type="button" data-fish-nav="area">🎣 Mulai Mancing</button></div>`}

        <p class="fishing-board-note">Papan peringkat diperbarui otomatis secara real-time dari Firebase.</p>
      </div>`;
  }

  /* ================= PANEL: FIRST LEGEND & SECRET ================= */
  function panelLegenda() {
    const meta = FC.meta;
    if (!meta) return `<div class="fishing-legends">${loadingHtml()}</div>`;
    function bagian(rarity) {
      const info = rarityInfo(rarity);
      const daftar = meta[rarity] || [];
      const slot = [0, 1, 2].map((i) => daftar[i] || null);
      return `
        <article class="fishing-legend-block rarity-${esc(rarity)}" style="--rarity:${esc(info.color)};--rarity-soft:${esc(info.soft)}">
          <div class="fishing-legend-head">
            <span class="fishing-legend-icon" aria-hidden="true">${rarity === "secret" ? "🌟" : "👑"}</span>
            <div><h3>First ${esc(info.label)}</h3><p>Tiga pemancing pertama yang menangkap ikan ${esc(info.label)}. Slot permanen, tidak pernah direset.</p></div>
            <span class="fishing-legend-count">${daftar.length}/3</span>
          </div>
          <div class="fishing-legend-slots">
            ${slot.map((entry, i) => {
              if (!entry) {
                return `<div class="fishing-legend-slot is-empty">
                  <span class="fishing-legend-slot-no">#${i + 1}</span>
                  <span class="fishing-legend-empty-art" aria-hidden="true">${rarity === "secret" ? "🌟" : "👑"}</span>
                  <div><strong>Slot masih terbuka</strong><small>${rarity === "secret" ? "Peluang 0,01% per lemparan." : "Peluang 0,5% per lemparan."}</small></div>
                </div>`;
              }
              return `<div class="fishing-legend-slot is-filled">
                <span class="fishing-legend-slot-no">#${entry.slot || i + 1}</span>
                <span class="fishing-legend-slot-art">${fishArt(infoIkan(entry.fishId), { label: entry.fishName })}</span>
                <div class="fishing-legend-slot-id">
                  <strong>${esc(entry.name)}</strong>
                  <em>${esc(entry.fishName)}</em>
                  <small>${tanggal(entry.at)} · ${waktu(entry.at)}</small>
                </div>
                ${avatar(entry.absen, entry.name, "sm")}
              </div>`;
            }).join("")}
          </div>
        </article>`;
    }
    return `
      <div class="fishing-legends">
        <div class="fishing-section-head">
          <div><p class="fishing-kicker">Kompetisi permanen</p><h3>First Legend &amp; Secret</h3><p>Slot ditentukan atomik oleh server, jadi dua pemain tidak bisa mendapatkan slot yang sama walaupun menangkap bersamaan.</p></div>
          <span class="fishing-live-dot">LIVE</span>
        </div>
        ${bagian("legend")}
        ${bagian("secret")}
        <p class="fishing-board-note">Waktu pencatatan memakai timestamp server. Slot yang sudah terisi tidak akan pernah berubah.</p>
      </div>`;
  }

  /* ================= PANEL: PROFIL ================= */
  function panelProfil() {
    const s = FC.state;
    const totalIkan = Object.values(s.fish || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const species = Object.keys(s.collection || {}).length;
    const biggest = s.stats.biggest && infoIkan(s.stats.biggest.fishId);
    const akurasi = s.stats.casts ? Math.round((s.stats.catches / s.stats.casts) * 100) : 0;
    const totalRarity = (FC.cat.rarityOrder || []).reduce((a, r) => a + (Number(s.stats.byRarity[r]) || 0), 0);
    const maxRarity = Math.max(1, ...(FC.cat.rarityOrder || []).map((r) => Number(s.stats.byRarity[r]) || 0));
    const achs = FC.cat.achievements || [];
    const terbuka = achs.filter((a) => s.achievements[a.id]).length;

    return `
      <div class="fishing-profile">
        <div class="fishing-profile-head">
          ${avatar(s.absen, s.name, "xl")}
          <div class="fishing-profile-id">
            <p class="fishing-kicker">Akun kelas 7.3 · Absen ${angka(s.absen)}</p>
            <h3>${esc(s.name)}</h3>
            <p>Bergabung ${s.createdAt ? tanggal(s.createdAt) : "hari ini"} · ${angka(species)}/${angka((FC.cat.fish || []).length)} spesies</p>
          </div>
          <div class="fishing-profile-money">
            <span class="fishing-coin-pill">💰 ${angka(s.coins)}</span>
            <span class="fishing-value-pill">📦 ${angka(s.totalValue)}</span>
          </div>
        </div>

        <div class="fishing-profile-stats">
          <div><span>Total tangkapan</span><strong>${angka(s.totalCaught)}</strong></div>
          <div><span>Ikan di tas</span><strong>${angka(totalIkan)}</strong></div>
          <div><span>Lemparan</span><strong>${angka(s.stats.casts)}</strong></div>
          <div><span>Akurasi</span><strong>${akurasi}%</strong></div>
          <div><span>Total pendapatan</span><strong>💰 ${angka(s.stats.totalEarned)}</strong></div>
          <div><span>Total belanja</span><strong>💰 ${angka(s.stats.totalSpent)}</strong></div>
        </div>

        <div class="fishing-grid fishing-grid-2">
          <article class="fishing-card">
            <div class="fishing-card-head"><div><p class="fishing-kicker">Tangkapan terbesar</p><h3>${biggest ? esc(biggest.name) : "Belum ada"}</h3></div></div>
            ${biggest ? `
              <div class="fishing-biggest">
                <span class="fishing-biggest-art">${fishArt(biggest)}</span>
                <div><strong>${beratNilai(s.stats.biggest.weight)} kg</strong>${rarityChip(biggest.rarity)}<small>Nilai jual 💰 ${angka(biggest.value)}</small></div>
              </div>` : `<p class="fishing-empty-line">Tangkap ikan pertamamu untuk mengisi rekor ini.</p>`}
          </article>

          <article class="fishing-card">
            <div class="fishing-card-head"><div><p class="fishing-kicker">Komposisi rarity</p><h3>${angka(totalRarity)} tangkapan</h3></div></div>
            <div class="fishing-rarity-bars">
              ${(FC.cat.rarityOrder || []).map((r) => {
                const n = Number(s.stats.byRarity[r]) || 0;
                const info = rarityInfo(r);
                return `<div class="fishing-rarity-bar rarity-${esc(r)}" style="--rarity:${esc(info.color)}">
                  <span class="label">${esc(info.label)}</span>
                  <span class="track"><span style="width:${Math.round((n / maxRarity) * 100)}%"></span></span>
                  <b>${angka(n)}</b>
                </div>`;
              }).join("")}
            </div>
          </article>
        </div>

        <article class="fishing-card fishing-ach-card">
          <div class="fishing-card-head">
            <div><p class="fishing-kicker">Pencapaian</p><h3>${angka(terbuka)}/${angka(achs.length)} terbuka</h3></div>
            <span class="fishing-tag ${terbuka === achs.length ? "is-on" : ""}">${terbuka === achs.length ? "Sempurna!" : "Terus main"}</span>
          </div>
          <div class="fishing-ach-grid">
            ${achs.map((a) => {
              const waktuBuka = s.achievements[a.id];
              return `<div class="fishing-ach ${waktuBuka ? "is-open" : ""}">
                <span class="fishing-ach-icon" aria-hidden="true">${a.icon}</span>
                <div><strong>${esc(a.name)}</strong><small>${esc(a.desc)}</small>${waktuBuka ? `<em>Terbuka ${waktu(waktuBuka)}</em>` : ""}</div>
              </div>`;
            }).join("")}
          </div>
        </article>

        <div class="fishing-profile-actions">
          <button class="btn-secondary" type="button" data-fish-act="refresh">🔄 Segarkan data</button>
          <button class="btn-secondary" type="button" data-fish-nav="koleksi">📖 Buka Koleksi</button>
        </div>
      </div>`;
  }

  /* ================= MODAL & TOAST ================= */
  function bukaModal(html, opsi) {
    const root = document.getElementById("fishing-modal-root");
    if (!root) return;
    opsi = opsi || {};
    FC.modalBolehTutup = opsi.tutup !== false;
    root.innerHTML = `
      <div class="fishing-modal-backdrop" data-fish-backdrop>
        <div class="fishing-modal ${opsi.kelas || ""}" role="dialog" aria-modal="true">
          ${FC.modalBolehTutup ? `<button class="fishing-modal-x" type="button" data-fish-act="modal-close" aria-label="Tutup">✕</button>` : ""}
          <div class="fishing-modal-body">${html}</div>
        </div>
      </div>`;
    document.body.classList.add("fishing-modal-open");
    requestAnimationFrame(() => root.classList.add("is-open"));
  }

  function tutupModal() {
    const root = document.getElementById("fishing-modal-root");
    if (FC.modalConfirm) {
      const fn = FC.modalConfirm;
      FC.modalConfirm = null;
      fn(false);
    }
    if (root) {
      root.classList.remove("is-open");
      root.innerHTML = "";
    }
    document.body.classList.remove("fishing-modal-open");
    FC.modalBolehTutup = false;
  }

  function konfirmasi(opt) {
    opt = opt || {};
    return new Promise((resolve) => {
      FC.modalConfirm = resolve;
      bukaModal(`
        <div class="fishing-confirm">
          <div class="fishing-confirm-icon" aria-hidden="true">${opt.icon || "❓"}</div>
          <h3>${esc(opt.title || "Lanjutkan?")}</h3>
          <p>${opt.body || ""}</p>
          <div class="fishing-confirm-actions">
            <button class="btn-secondary" type="button" data-fish-act="modal-cancel">Batal</button>
            <button class="${opt.danger ? "fishing-btn-danger" : "btn-primary"}" type="button" data-fish-act="modal-ok">${esc(opt.okLabel || "Lanjut")}</button>
          </div>
        </div>`, { kelas: "fishing-modal-confirm", tutup: false });
    });
  }

  function jawabKonfirmasi(nilai) {
    const fn = FC.modalConfirm;
    FC.modalConfirm = null;
    tutupModal();
    if (fn) fn(nilai);
  }

  function toast(html, tipe, durasi) {
    const root = document.getElementById("fishing-toast-root");
    if (!root) return;
    const el = document.createElement("div");
    el.className = `fishing-toast ${tipe || "info"}`;
    el.innerHTML = html;
    root.appendChild(el);
    const ms = durasi || 3200;
    setTimeout(() => el.classList.add("is-out"), ms);
    setTimeout(() => el.remove(), ms + 350);
  }

  function toastPencapaian(list) {
    if (!list || !list.length) return;
    toast(`🏆 Pencapaian terbuka: <b>${list.map((a) => esc(a.name)).join(", ")}</b>`, "ach", 4200);
  }

  function tampilkanPengumuman(a) {
    if (!FC.aktif || !a) return;
    const root = document.getElementById("fishing-toast-root");
    if (!root) return;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `fishing-announce rarity-${esc(a.type)}`;
    el.innerHTML = `
      <span class="fishing-announce-art">${fishArt(infoIkan(a.fishId), { label: a.fishName })}</span>
      <span class="fishing-announce-text">
        <small>${a.type === "secret" ? "🌟 SECRET TERTANGKAP" : "👑 LEGEND TERTANGKAP"}</small>
        <strong>${esc(a.name)}</strong>
        <em>menangkap ${esc(a.fishName)}${a.firstSlot ? ` · First #${a.firstSlot}` : ""}</em>
      </span>`;
    el.addEventListener("click", () => {
      el.remove();
      pindahPanel("legenda");
    });
    root.appendChild(el);
    SFX.legend();
    setTimeout(() => el.classList.add("is-out"), 6500);
    setTimeout(() => el.remove(), 7000);
  }

  /* ================= AKSI UMUM ================= */
  async function jalankanAksi(el, tugas) {
    if (FC.aksi) return null;
    FC.aksi = true;
    if (el) {
      el.disabled = true;
      el.classList.add("is-loading");
    }
    try {
      const res = await tugas();
      if (res && res.state) terapkanState(res.state);
      if (res && res.achievements && res.achievements.length) toastPencapaian(res.achievements);
      return res;
    } catch (err) {
      toast(esc(err.message || "Aksi gagal."), "error");
      if (String(err.code || "").includes("unauthenticated")) {
        try { await bukaSesi(true); } catch (err2) { /* tampil pesan dari error berikutnya */ }
      }
      return null;
    } finally {
      FC.aksi = false;
      if (el && el.isConnected) {
        el.disabled = false;
        el.classList.remove("is-loading");
      }
    }
  }

  /* ================= SEKUENS MANCING ================= */
  function bersihkanTimer() {
    if (!FC.seq || !Array.isArray(FC.seq.timers)) return;
    FC.seq.timers.forEach((id) => clearTimeout(id));
    FC.seq.timers = [];
  }

  function jadwalkan(fn, ms) {
    if (!FC.seq) return;
    const id = setTimeout(fn, Math.max(0, ms));
    FC.seq.timers.push(id);
  }

  function batalkanSekuens(pesan) {
    bersihkanTimer();
    if (FC.seq && ["waiting", "bite"].includes(FC.seq.phase)) {
      toast(esc(pesan || "Lemparan dibatalkan. Umpan tetap terpakai."), "info");
    }
    FC.seq = null;
    FC.resumeId = null;
    FC.tahanRender = false;
  }

  async function castPancing() {
    if (FC.aksi || !FC.state || FC.aktif === false) return;
    if (FC.seq) return;
    const s = FC.state;
    const rod = rodDipakai();
    const info = rod ? infoRod(rod.id) : null;
    if (!rod || !info) return toast("Joran tidak ditemukan.", "error");
    if (Number(rod.durability) <= 0) return toast("Joran rusak. Repair dulu di Toko.", "error");
    if (stokUmpan(s.equippedBait) <= 0) return toast("Umpan habis. Beli dulu di Toko.", "error");
    if (s.activeCast && Number(s.activeCast.expiresAt) > serverNow()) {
      return toast("Masih ada lemparan yang belum selesai.", "info");
    }

    FC.aksi = true;
    FC.tahanRender = true;
    FC.resumeId = null;
    FC.seq = { phase: "casting", timers: [] };
    render();
    SFX.cast();
    const t0 = Date.now();
    try {
      const res = await api("cast", { absen: FC.absen, token: FC.token, requestId: reqId() });
      if (!res || !res.cast) throw new Error("Server tidak mengirim data lemparan.");
      hitungOffset(res.cast.serverNow, t0);
      if (res.state) terapkanState(res.state);
      mulaiSekuens(res.cast);
    } catch (err) {
      FC.seq = null;
      FC.tahanRender = false;
      render();
      toast(esc(err.message || "Gagal melempar pancing."), "error");
      if (String(err.code || "").includes("unauthenticated")) {
        try { await bukaSesi(true); } catch (err2) { /* ignore */ }
      }
    } finally {
      FC.aksi = false;
      if (FC.seq && FC.seq.phase === "casting") {
        FC.seq = null;
        FC.tahanRender = false;
        render();
      }
    }
  }

  function mulaiSekuens(cast) {
    bersihkanTimer();
    const biteAt = Number(cast.biteAt) || 0;
    const windowMs = Number(cast.windowMs) || 1000;
    const windowStart = Number(cast.windowStart) || biteAt + 60;
    const windowEnd = Number(cast.windowEnd) || biteAt + windowMs;
    FC.seq = {
      phase: "waiting",
      castId: cast.id,
      biteAt,
      windowStart,
      windowEnd,
      windowMs,
      luck: Number(cast.luck) || 0,
      odds: cast.odds || null,
      rodName: cast.rodName || "",
      baitName: cast.baitName || "",
      timers: [],
    };
    FC.tahanRender = true;
    render();
    const delay = Math.max(0, windowStart - serverNow());
    jadwalkan(() => SFX.splash(), Math.min(650, Math.max(120, delay * 0.4)));
    jadwalkan(datangGigit, delay);
  }

  function datangGigit() {
    if (!FC.seq || FC.seq.phase !== "waiting") return;
    FC.seq.phase = "bite";
    SFX.bite();
    getar([40, 60, 40]);
    render();
    const sisa = Math.max(90, Number(FC.seq.windowEnd) - serverNow());
    jadwalkan(() => {
      if (FC.seq && FC.seq.phase === "bite") tarik(true);
    }, sisa + 260);
  }

  function mulaiAnimasiTiming() {
    if (!FC.seq) return;
    const marker = document.querySelector(".fishing-timing-marker");
    if (!marker) return;
    const sisa = Math.max(90, Number(FC.seq.windowEnd) - serverNow());
    marker.style.animationDuration = `${sisa}ms`;
    marker.classList.add("is-running");
  }

  function lanjutkanCastAktif() {
    if (!FC.aktif || FC.panel !== "area" || !FC.state || FC.seq || FC.aksi) return;
    const ac = FC.state.activeCast;
    if (!ac || !ac.id) return;
    if (FC.resumeId === ac.id) return;
    FC.resumeId = ac.id;
    const biteAt = Number(ac.biteAt) || 0;
    const windowStart = biteAt + 60;
    const windowEnd = biteAt + (Number(ac.windowMs) || 0);
    FC.seq = {
      phase: "waiting",
      castId: ac.id,
      biteAt,
      windowStart,
      windowEnd,
      windowMs: Number(ac.windowMs) || 0,
      luck: Number(ac.luck) || 0,
      odds: null,
      timers: [],
      lanjutan: true,
    };
    FC.tahanRender = true;
    const now = serverNow();
    if (!biteAt || now > windowEnd + 200) {
      FC.seq.phase = "bite";
      render();
      tarik(true);
      return;
    }
    render();
    if (now < windowStart) {
      jadwalkan(datangGigit, windowStart - now);
    } else {
      datangGigit();
    }
  }

  async function tarik(auto) {
    if (!FC.seq || !["waiting", "bite"].includes(FC.seq.phase) || FC.aksi) return;
    const seq = FC.seq;
    bersihkanTimer();
    FC.aksi = true;
    seq.phase = "reeling";
    if (!auto) SFX.reel();
    render();
    try {
      const res = await api("strike", {
        absen: FC.absen,
        token: FC.token,
        castId: seq.castId,
        requestId: reqId(),
      });
      if (res.state) terapkanState(res.state);
      if (res.ok) hasilSukses(res);
      else hasilGagal(res);
    } catch (err) {
      FC.seq = null;
      FC.resumeId = null;
      FC.tahanRender = false;
      render();
      toast(esc(err.message || "Gagal menarik pancing."), "error");
      if (String(err.code || "").includes("unauthenticated")) {
        try { await bukaSesi(true); } catch (err2) { /* ignore */ }
      } else {
        sinkronState();
      }
    } finally {
      FC.aksi = false;
    }
  }

  function hasilSukses(res) {
    const fish = res.fish;
    const special = ["epic", "mythic", "legend", "secret"].includes(res.rarity);
    FC.seq = { phase: "result", hasil: "sukses", timers: [] };
    FC.tahanRender = true;
    SFX.catchR(res.rarity);
    if (res.rarity === "legend" || res.rarity === "secret") {
      SFX.legend();
      getar([60, 60, 60, 60, 140]);
    } else if (special) {
      getar([35, 45, 75]);
    }
    const info = rarityInfo(res.rarity);
    const ach = res.achievements || [];
    bukaModal(`
      <div class="fishing-result rarity-${esc(res.rarity)} ${special ? "is-special" : ""}" style="--rarity:${esc(info.color)};--rarity-soft:${esc(info.soft)}">
        ${special ? sparkles(res.rarity === "secret" ? 20 : res.rarity === "legend" ? 16 : 10) : ""}
        <p class="fishing-kicker">${res.firstSlot ? `First ${esc(info.label)} #${res.firstSlot}` : "Tangkapan berhasil"}</p>
        <div class="fishing-result-art">${fishArt(fish)}</div>
        <h3>${esc(fish.name)}</h3>
        <div class="fishing-result-chips">${rarityChip(res.rarity)}${res.isNew ? `<span class="fishing-new-badge">Spesies baru!</span>` : ""}${res.firstSlot ? `<span class="fishing-first-badge">👑 First #${res.firstSlot}</span>` : ""}</div>
        <div class="fishing-result-grid">
          <div><span>Berat</span><strong>${beratNilai(res.weight)} kg</strong></div>
          <div><span>Nilai jual</span><strong>💰 ${angka(fish.value)}</strong></div>
          <div><span>Durability</span><strong>-${angka(res.durabilityLoss)}</strong></div>
        </div>
        <p class="fishing-result-desc">${esc(fish.desc)}</p>
        ${ach.length ? `<div class="fishing-result-ach">🏆 ${ach.map((a) => esc(a.name)).join(" · ")}</div>` : ""}
        <div class="fishing-result-actions">
          <button class="btn-primary" type="button" data-fish-act="result-keep">Simpan ke Tas</button>
          <button class="btn-secondary" type="button" data-fish-act="result-sell" data-fish-id="${esc(fish.id)}">Jual +💰 ${angka(fish.value)}</button>
        </div>
      </div>`, { kelas: "fishing-modal-result", tutup: false });
  }

  function hasilGagal(res) {
    FC.seq = { phase: "result", hasil: "gagal", timers: [] };
    FC.tahanRender = true;
    SFX.fail();
    getar(90);
    const alasan = res.reason || "";
    const judul = alasan === "early" ? "Terlalu cepat!"
      : alasan === "late" ? "Terlambat!"
      : alasan === "expired" ? "Umpan hilang"
      : "Ikan kabur";
    const emoji = alasan === "early" ? "💨" : alasan === "late" ? "🌊" : "🎣";
    bukaModal(`
      <div class="fishing-fail">
        <div class="fishing-fail-emoji" aria-hidden="true">${emoji}</div>
        <h3>${judul}</h3>
        <p>${esc(res.message || "Ikan berhasil kabur. Coba lempar lagi!")}</p>
        <div class="fishing-fail-note">1 umpan sudah terpakai untuk lemparan ini.</div>
        <div class="fishing-result-actions">
          <button class="btn-primary" type="button" data-fish-act="fail-again">🎣 Lempar Lagi</button>
          <button class="btn-secondary" type="button" data-fish-act="fail-close">Nanti Saja</button>
        </div>
      </div>`, { kelas: "fishing-modal-fail", tutup: false });
  }

  function selesaiHasil() {
    tutupModal();
    FC.seq = null;
    FC.resumeId = null;
    FC.tahanRender = false;
    render();
  }

  /* ================= AKSI TOKO / TAS ================= */
  async function beliJoran(id) {
    const rod = infoRod(id);
    if (!rod || !FC.state) return;
    if (FC.state.rods.some((r) => r.id === id)) return toast("Joran ini sudah kamu miliki.", "info");
    if (FC.state.coins < rod.price) return toast("Koin tidak cukup.", "error");
    const ok = await konfirmasi({
      icon: "🎣",
      title: `Beli ${rod.name}?`,
      body: `Harga <b>💰 ${angka(rod.price)}</b>. Joran otomatis dipakai setelah dibeli.<br><small>Luck +${angka(rod.luck)} · Durability ${angka(rod.durability)}</small>`,
      okLabel: "Beli Joran",
    });
    if (!ok) return;
    const res = await jalankanAksi(null, () => api("buyRod", { absen: FC.absen, token: FC.token, rodId: id, requestId: reqId() }));
    if (res) {
      SFX.coin();
      toast(`✅ <b>${esc(rod.name)}</b> dibeli dan dipakai.`, "ok");
    }
  }

  async function beliUmpan(id, qty) {
    const bait = infoBait(id);
    if (!bait || !FC.state) return;
    const jumlah = Math.max(1, Math.floor(Number(qty) || 1));
    const total = bait.price * jumlah;
    if (FC.state.coins < total) return toast("Koin tidak cukup.", "error");
    const stok = stokUmpan(id);
    if (stok + jumlah > 9999) return toast("Stok umpan sudah penuh.", "error");
    const ok = await konfirmasi({
      icon: "🐛",
      title: `Beli ${jumlah} × ${bait.name}?`,
      body: `Total <b>💰 ${angka(total)}</b>. Stok sekarang ${angka(stok)}, setelah beli jadi ${angka(stok + jumlah)}.`,
      okLabel: "Beli Umpan",
    });
    if (!ok) return;
    const res = await jalankanAksi(null, () => api("buyBait", { absen: FC.absen, token: FC.token, baitId: id, qty: jumlah, requestId: reqId() }));
    if (res) {
      SFX.coin();
      toast(`✅ ${jumlah} × ${esc(bait.name)} ditambahkan ke Tas.`, "ok");
    }
  }

  async function repairJoran(id) {
    const rod = FC.state ? FC.state.rods.find((r) => r.id === id) : null;
    const info = infoRod(id);
    if (!rod || !info) return;
    const hilang = Math.max(0, info.durability - rod.durability);
    if (hilang <= 0) return toast("Joran masih penuh.", "info");
    const biaya = hilang * info.repair;
    if (FC.state.coins < biaya) return toast("Koin tidak cukup untuk repair.", "error");
    const ok = await konfirmasi({
      icon: "🔧",
      title: `Repair ${info.name}?`,
      body: `Durability hilang <b>${angka(hilang)}</b>. Biaya <b>💰 ${angka(biaya)}</b>. Setelah repair durability kembali penuh (${angka(info.durability)}).`,
      okLabel: "Repair",
    });
    if (!ok) return;
    const res = await jalankanAksi(null, () => api("repair", { absen: FC.absen, token: FC.token, rodId: id, requestId: reqId() }));
    if (res) {
      SFX.coin();
      toast(`🔧 Joran diperbaiki · <b>-💰 ${angka(res.cost)}</b>`, "ok");
    }
  }

  async function pakaiPerlengkapan(slot, id) {
    const res = await jalankanAksi(null, () => api("equip", { absen: FC.absen, token: FC.token, slot, id, requestId: reqId() }));
    if (res) {
      SFX.click();
      toast(slot === "rod" ? "🎣 Joran diganti." : "🐛 Umpan diganti.", "ok");
    }
  }

  async function jualIkan(id, jumlah) {
    if (!FC.state) return;
    const fish = infoIkan(id);
    const stok = Number(FC.state.fish[id]) || 0;
    if (!fish || stok <= 0) return toast("Ikan ini tidak ada di Tas.", "error");
    if (FC.state.locked[id]) return toast("Ikan ini sedang dikunci. Buka kuncinya dulu.", "info");
    const qty = Math.min(stok, Math.max(1, Math.floor(Number(jumlah) || 1)));
    const total = fish.value * qty;
    const ok = await konfirmasi({
      icon: "💰",
      title: `Jual ${angka(qty)} × ${fish.name}?`,
      body: `Kamu mendapat <b>💰 ${angka(total)}</b>. Ikan hilang dari Tas, tapi catatan Koleksi tetap tersimpan.`,
      okLabel: "Jual",
      danger: true,
    });
    if (!ok) return;
    const res = await jalankanAksi(null, () => api("sell", {
      absen: FC.absen,
      token: FC.token,
      mode: qty > 1 ? "qty" : "one",
      fishId: id,
      qty,
      requestId: reqId(),
    }));
    if (res) {
      SFX.coin();
      toast(`Terjual <b>${angka(qty)}× ${esc(fish.name)}</b> · <b>+💰 ${angka(res.total)}</b>`, "ok");
    }
  }

  async function jualSemua() {
    if (!FC.state) return;
    const s = FC.state;
    const items = Object.entries(s.fish || {}).filter(([id, n]) => Number(n) > 0 && !s.locked[id] && infoIkan(id));
    if (!items.length) return toast("Tidak ada ikan yang bisa dijual.", "info");
    const total = items.reduce((a, [id, n]) => a + infoIkan(id).value * Number(n), 0);
    const jumlah = items.reduce((a, [, n]) => a + Number(n), 0);
    const ok = await konfirmasi({
      icon: "💰",
      title: "Jual semua ikan?",
      body: `<b>${angka(jumlah)} ikan</b> (semua yang tidak dikunci) akan dijual seharga <b>💰 ${angka(total)}</b>. Catatan Koleksi tetap aman.`,
      okLabel: "Jual Semua",
      danger: true,
    });
    if (!ok) return;
    const res = await jalankanAksi(null, () => api("sell", { absen: FC.absen, token: FC.token, mode: "all", requestId: reqId() }));
    if (res) {
      SFX.coin();
      toast(`Semua ikan terjual · <b>+💰 ${angka(res.total)}</b>`, "ok");
    }
  }

  async function kunciIkan(id, mauKunci) {
    if (!FC.state || !FC.state.fish[id]) return;
    const fish = infoIkan(id);
    const res = await jalankanAksi(null, () => api("lock", { absen: FC.absen, token: FC.token, fishId: id, locked: mauKunci, requestId: reqId() }));
    if (res) {
      toast(mauKunci
        ? `🔒 ${esc(fish ? fish.name : "Ikan")} dikunci. Tidak ikut Jual Semua.`
        : `🔓 Kunci ${esc(fish ? fish.name : "ikan")} dibuka.`, "ok");
    }
  }

  async function jualHasil(el) {
    if (FC.aksi || !FC.seq || FC.seq.hasil !== "sukses") return;
    const fishId = el.dataset.fishId;
    if (!infoIkan(fishId)) return;
    FC.aksi = true;
    el.disabled = true;
    try {
      const res = await api("sell", { absen: FC.absen, token: FC.token, mode: "one", fishId, qty: 1, requestId: reqId() });
      if (res.state) terapkanState(res.state);
      SFX.coin();
      selesaiHasil();
      toast(`Ikan terjual · <b>+💰 ${angka(res.total)}</b>`, "ok");
      if (res.achievements && res.achievements.length) toastPencapaian(res.achievements);
    } catch (err) {
      toast(esc(err.message || "Gagal menjual ikan."), "error");
      if (el.isConnected) el.disabled = false;
    } finally {
      FC.aksi = false;
    }
  }

  /* ================= NAVIGASI ================= */
  function pindahPanel(id) {
    if (!FC.aktif || !id || FC.panel === id) return;
    if (FC.panel === "area" && id !== "area" && FC.seq && ["waiting", "bite"].includes(FC.seq.phase)) {
      batalkanSekuens();
    }
    FC.panel = id;
    SFX.click();
    render();
    const panel = document.getElementById("fishing-panel");
    if (panel && panel.scrollIntoView) {
      try { panel.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (err) { /* ignore */ }
    }
  }

  function tanganiAksi(act, el) {
    if (!act || !el || el.disabled) return;
    switch (act) {
      case "login":
        document.getElementById("btn-show-login").click();
        break;
      case "retry":
        bukaGame(true);
        break;
      case "cast":
        castPancing();
        break;
      case "strike":
        tarik(false);
        break;
      case "modal-close":
        if (FC.modalConfirm) jawabKonfirmasi(false);
        else if (FC.modalBolehTutup) tutupModal();
        break;
      case "modal-ok":
        jawabKonfirmasi(true);
        break;
      case "modal-cancel":
        jawabKonfirmasi(false);
        break;
      case "shop-tab":
        FC.shopTab = el.dataset.tab || "rod";
        render();
        break;
      case "inv-tab":
        FC.invTab = el.dataset.tab || "fish";
        render();
        break;
      case "coll-filter":
        FC.collFilter = el.dataset.filter || "semua";
        render();
        break;
      case "buy-rod":
        beliJoran(el.dataset.rod);
        break;
      case "buy-bait":
        beliUmpan(el.dataset.bait, el.dataset.qty);
        break;
      case "repair":
        repairJoran(el.dataset.rod);
        break;
      case "equip-rod":
        pakaiPerlengkapan("rod", el.dataset.rod);
        break;
      case "equip-bait":
        pakaiPerlengkapan("bait", el.dataset.bait);
        break;
      case "sell-one":
        jualIkan(el.dataset.fishId, 1);
        break;
      case "sell-stack":
        jualIkan(el.dataset.fishId, Number(FC.state && FC.state.fish[el.dataset.fishId]) || 1);
        break;
      case "sell-all":
        jualSemua();
        break;
      case "lock-toggle":
        kunciIkan(el.dataset.fishId, el.dataset.lock === "1");
        break;
      case "fish-detail":
        bukaDetailIkan(el.dataset.fishId);
        break;
      case "nav-tas":
        tutupModal();
        pindahPanel("tas");
        break;
      case "result-keep":
        selesaiHasil();
        toast("🎒 Ikan disimpan ke Tas.", "ok");
        break;
      case "result-sell":
        jualHasil(el);
        break;
      case "fail-again":
        selesaiHasil();
        castPancing();
        break;
      case "fail-close":
        selesaiHasil();
        break;
      case "refresh":
        sinkronState().then(() => toast("🔄 Data tersinkron dengan server.", "ok"));
        break;
      default:
        break;
    }
  }

  /* ================= BUKA / TUTUP / AKUN ================= */
  async function bukaGame(paksa) {
    if (FC.membuka && !paksa) return;
    FC.aktif = true;
    FC.errMsg = "";
    FC.membuka = true;
    if (!FC.state) FC.panel = "lobby";
    render();
    if (!currentUser) {
      FC.membuka = false;
      render();
      return;
    }
    try {
      await pastikanKatalog();
      if (!FC.cat) throw new Error("Katalog Fishing belum tersedia dari server.");
      await bukaSesi(false);
      FC.membuka = false;
      FC.errMsg = "";
      render();
      if (FC.panel === "area" && FC.state && FC.state.activeCast) lanjutkanCastAktif();
    } catch (err) {
      FC.membuka = false;
      FC.errMsg = err.message || "Gagal membuka Fishing.";
      render();
    }
  }

  function tutupGame() {
    if (FC.seq && ["waiting", "bite", "casting", "reeling"].includes(FC.seq.phase)) {
      bersihkanTimer();
      FC.seq = null;
    }
    if (FC.seq && FC.seq.phase === "result") FC.seq = null;
    FC.aktif = false;
    FC.aksi = false;
    FC.tahanRender = false;
    FC.resumeId = null;
    tutupModal();
    hentikanLangganan();
    const root = document.getElementById("fishing-toast-root");
    if (root) root.innerHTML = "";
    return true;
  }

  function jedaGame() {
    bersihkanTimer();
    FC.seq = null;
    FC.tahanRender = false;
    FC.aktif = false;
    FC.aksi = false;
    FC.resumeId = null;
    hentikanLangganan();
    tutupModal();
    const root = document.getElementById("fishing-toast-root");
    if (root) root.innerHTML = "";
  }

  function akunBerubah() {
    const absen = currentUser ? Number(currentUser.absen) : null;
    if (absen && absen === FC.absen && FC.aktif) return;
    bersihkanTimer();
    hentikanLangganan();
    tutupModal();
    FC.state = null;
    FC.board = null;
    FC.meta = null;
    FC.announcements = [];
    FC.absen = null;
    FC.token = "";
    FC.seq = null;
    FC.aksi = false;
    FC.tahanRender = false;
    FC.resumeId = null;
    FC.errMsg = "";
    FC.panel = "lobby";
    FC.annSiap = false;
    if (FC.aktif) bukaGame(true);
  }

  function ringkas(login) {
    if (!login) return "Login dulu buat mulai memancing";
    try {
      const r = JSON.parse(localStorage.getItem(RINGKAS_KEY) || "null");
      if (r && currentUser && Number(r.absen) === Number(currentUser.absen)) {
        return `🎣 ${angka(r.species)}/102 spesies · 💰 ${angka(r.coins)} koin · 📦 ${angka(r.totalValue)}`;
      }
    } catch (err) { /* cache rusak */ }
    return "Lempar pancing pertamamu & isi koleksi 102 ikan!";
  }

  /* ================= EVENT ================= */
  function tanganiKlik(e) {
    const pageTab = e.target.closest(".page-tab-btn");
    if (pageTab) {
      if (pageTab.dataset.pageTab === "games") {
        const view = document.getElementById("game-fishing-view");
        if (view && !view.hidden && !FC.aktif) {
          FC.aktif = true;
          bukaGame(true);
        }
      } else if (FC.aktif) {
        jedaGame();
      }
      return;
    }

    if (!FC.aktif) return;

    if (e.target.closest("[data-fish-backdrop]") && !e.target.closest(".fishing-modal")) {
      if (FC.modalConfirm) jawabKonfirmasi(false);
      else if (FC.modalBolehTutup) tutupModal();
      return;
    }

    const nav = e.target.closest("[data-fish-nav]");
    if (nav) {
      e.preventDefault();
      pindahPanel(nav.dataset.fishNav);
      return;
    }

    const act = e.target.closest("[data-fish-act]");
    if (act) {
      e.preventDefault();
      tanganiAksi(act.dataset.fishAct, act);
    }
  }

  function tanganiTombol(e) {
    if (!FC.aktif) return;
    if (e.key === "Escape") {
      if (FC.modalConfirm) jawabKonfirmasi(false);
      else if (FC.modalBolehTutup) tutupModal();
    }
    if (e.key === " " || e.key === "Enter") {
      if (FC.panel === "area" && FC.seq && FC.seq.phase === "bite") {
        const aktif = document.activeElement;
        if (!aktif || aktif.tagName !== "BUTTON") {
          e.preventDefault();
          tarik(false);
        }
      }
    }
  }

  function initFishing() {
    document.addEventListener("click", tanganiKlik);
    document.addEventListener("keydown", tanganiTombol);
  }

  window.fishingBuka = bukaGame;
  window.fishingTutup = tutupGame;
  window.fishingAkunBerubah = akunBerubah;
  window.fishingRingkas = ringkas;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initFishing);
  else initFishing();
})();
