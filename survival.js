/* ===================================================
   SURVIVAL ARENA — zombie survival single-player
   Arena top-down pixel-art, wave zombie, senjata, loot,
   supply drop, shop, level + 12 skill, leaderboard.
   Rekor disimpan di Firestore survival/{absen}.
=================================================== */
(function () {
  "use strict";
  if (window.SurvivalArena) return;

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const COL = "survival";

  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };
  const angka = (n) => Math.round(Number(n) || 0).toLocaleString("id-ID");
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (m) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
  const durasi = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  /* ================= DATA ================= */
  const ARENA_R = 700;
  const WALL_LIMIT = 70000; // besar arena untuk clamp posisi
  const MAX_LEVEL = 60;
  const MAX_ZOMBIES = 110;

  const WEAPONS = {
    pistol: {
      id: "pistol", nama: "Pistol", icon: "🔫", dmg: 10, rate: 3.2, range: 540,
      spread: 0.035, pellets: 1, pierce: 0, speed: 980, mag: 0, reload: 0,
      warna: "#ffe9a8", desc: "Senjata awal. Akurat, peluru tak terbatas.",
    },
    shotgun: {
      id: "shotgun", nama: "Shotgun", icon: "🌪️", dmg: 7, rate: 1.2, range: 340,
      spread: 0.24, pellets: 5, pierce: 0, speed: 860, mag: 5, reload: 1.5,
      warna: "#ffd166", desc: "5 peluru menyebar. Mematikan di jarak dekat.",
    },
    smg: {
      id: "smg", nama: "SMG", icon: "💨", dmg: 5, rate: 9.5, range: 450,
      spread: 0.1, pellets: 1, pierce: 0, speed: 1000, mag: 32, reload: 1.25,
      warna: "#ffe9a8", desc: "Tembakan cepat untuk meredam kerumunan.",
    },
    rifle: {
      id: "rifle", nama: "Rifle", icon: "🎯", dmg: 17, rate: 3.6, range: 700,
      spread: 0.022, pellets: 1, pierce: 0, speed: 1180, mag: 15, reload: 1.5,
      warna: "#c8f7d8", desc: "Jarak jauh, damage stabil.",
    },
    sniper: {
      id: "sniper", nama: "Sniper", icon: "🔭", dmg: 68, rate: 0.85, range: 980,
      spread: 0.006, pellets: 1, pierce: 3, speed: 1500, mag: 4, reload: 1.9,
      warna: "#aee3ff", desc: "Satu tembakan menembus 3 zombie.",
    },
    plasma: {
      id: "plasma", nama: "Plasma", icon: "⚡", dmg: 30, rate: 2.4, range: 780,
      spread: 0.02, pellets: 1, pierce: 2, speed: 1250, mag: 8, reload: 1.6,
      warna: "#7fe7ff", desc: "Bola plasma menembus barisan zombie.",
    },
  };
  const SHOP_WEAPONS = [
    { id: "shotgun", harga: 260 },
    { id: "smg", harga: 520 },
    { id: "rifle", harga: 900 },
    { id: "sniper", harga: 1500 },
    { id: "plasma", harga: 2400 },
  ];
  const SHOP_ITEM = { medkit: 380 };
  const SHOP_UPGRADES = [
    { id: "maxhp", nama: "Max HP +25", icon: "❤️", harga: 300, max: 5, desc: "HP maksimal naik 25 dan langsung dipulihkan." },
    { id: "speed", nama: "Gerak +6%", icon: "👟", harga: 260, max: 5, desc: "Kecepatan lari naik 6% per level." },
    { id: "dmg", nama: "Damage +8%", icon: "💥", harga: 340, max: 5, desc: "Damage semua senjata naik 8%." },
    { id: "rate", nama: "Tembak +6%", icon: "⚙️", harga: 320, max: 5, desc: "Jeda tembakan lebih cepat 6%." },
  ];

  const ZOMBIES = {
    normal: {
      id: "normal", nama: "Walker", hp: 34, speed: 56, dmg: 9, r: 15,
      xp: 8, uang: 5, warna: "#69b56f", gelap: "#3f7a48", unlock: 1, bobot: 100,
    },
    runner: {
      id: "runner", nama: "Runner", hp: 20, speed: 112, dmg: 6, r: 13,
      xp: 7, uang: 4, warna: "#a8e07a", gelap: "#5f9a3d", unlock: 2, bobot: 55,
    },
    tank: {
      id: "tank", nama: "Tank", hp: 180, speed: 34, dmg: 17, r: 21,
      xp: 26, uang: 16, warna: "#7f9360", gelap: "#4d5c39", unlock: 4, bobot: 22,
    },
    explosive: {
      id: "explosive", nama: "Bomber", hp: 46, speed: 62, dmg: 8, r: 16,
      xp: 14, uang: 9, warna: "#c9a05a", gelap: "#7d5f2e", unlock: 6, bobot: 18,
      ledakan: { radius: 100, dmg: 26 },
    },
    ranged: {
      id: "ranged", nama: "Spitter", hp: 40, speed: 44, dmg: 10, r: 15,
      xp: 16, uang: 11, warna: "#8fc2a0", gelap: "#4f7a5c", unlock: 8, bobot: 14,
      tembak: { range: 330, jeda: 2.3, dmg: 9, speed: 240 },
    },
    boss: {
      id: "boss", nama: "Boss", hp: 900, speed: 40, dmg: 24, r: 32,
      xp: 220, uang: 140, warna: "#b06a6a", gelap: "#6e3636", unlock: 5, bobot: 0,
      boss: true,
    },
  };

  const SKILLS = [
    {
      id: "blades", nama: "Baling-Baling Muter", icon: "🌀", max: 5, warna: "#8be9fd",
      desc: (lv) => `${lv} baling-baling berputar mengelilingi karakter. Setiap bilah melukai zombie yang tersentuh.`,
      gain: (lv) => `Bilah ${lv} · damage ${12 + lv * 9}`,
    },
    {
      id: "orbs", nama: "Lightning Orb", icon: "⚡", max: 5, warna: "#c792ff",
      desc: (lv) => `${lv} bola petir mengorbit dan menyambar zombie terdekat secara otomatis.`,
      gain: (lv) => `Bola ${lv} · sambar ${9 + lv * 7}`,
    },
    {
      id: "drones", nama: "Drone Companion", icon: "🛸", max: 5, warna: "#7ad7f0",
      desc: (lv) => `${lv} drone terbang mengitari karakter dan menembak zombie sendiri.`,
      gain: (lv) => `Drone ${lv} · damage ${7 + lv * 3}`,
    },
    {
      id: "flame", nama: "Flame Ring", icon: "🔥", max: 5, warna: "#ff9e64",
      desc: (lv) => `Lingkaran api radius ${Math.round(76 + lv * 13)} menghanguskan zombie yang mendekat.`,
      gain: (lv) => `Radius ${Math.round(76 + lv * 13)} · ${10 + lv * 6} dmg/detik`,
    },
    {
      id: "crit", nama: "Critical Strike", icon: "🎯", max: 5, warna: "#ffcf5c",
      desc: (lv) => `Peluang kritikal ${Math.round((0.05 + lv * 0.07) * 100)}% dengan damage ${(1.6 + lv * 0.15).toFixed(2)}×.`,
      gain: (lv) => `Crit ${Math.round((0.05 + lv * 0.07) * 100)}% · ${(1.6 + lv * 0.15).toFixed(2)}×`,
    },
    {
      id: "speed", nama: "Speed Boost", icon: "👟", max: 5, warna: "#9ef0a8",
      desc: (lv) => `Kecepatan gerak naik ${lv * 6}% supaya lebih gampang menghindar.`,
      gain: (lv) => `+${lv * 6}% kecepatan`,
    },
    {
      id: "vitality", nama: "Vitality", icon: "❤️", max: 5, warna: "#ff7b7b",
      desc: (lv) => `Max HP bertambah ${lv * 20}. HP langsung dipulihkan saat memilih.`,
      gain: (lv) => `+${lv * 20} Max HP`,
    },
    {
      id: "regen", nama: "Regeneration", icon: "🌿", max: 5, warna: "#6fe3a2",
      desc: (lv) => `Memulihkan ${(0.4 + lv * 0.9).toFixed(1)} HP per detik secara otomatis.`,
      gain: (lv) => `${(0.4 + lv * 0.9).toFixed(1)} HP/detik`,
    },
    {
      id: "magnet", nama: "Magnet", icon: "🧲", max: 5, warna: "#ffb86b",
      desc: (lv) => `Radius ambil uang, EXP, dan loot membesar jadi ${Math.round(100 + lv * 55)}.`,
      gain: (lv) => `Radius ${Math.round(100 + lv * 55)}`,
    },
    {
      id: "damage", nama: "Damage Boost", icon: "💥", max: 5, warna: "#ff8f8f",
      desc: (lv) => `Damage semua senjata dan skill naik ${lv * 10}%.`,
      gain: (lv) => `+${lv * 10}% damage`,
    },
    {
      id: "firerate", nama: "Attack Speed", icon: "⚙️", max: 5, warna: "#dfe7ea",
      desc: (lv) => `Jeda antarserangan lebih cepat ${lv * 9}%.`,
      gain: (lv) => `+${lv * 9}% kecepatan serang`,
    },
    {
      id: "shield", nama: "Shield", icon: "🛡️", max: 5, warna: "#63d7f2",
      desc: (lv) => `Perisai ${lv * 25} poin menyerap damage dan pulih sendiri setelah tidak kena serangan.`,
      gain: (lv) => `Perisai ${lv * 25}`,
    },
  ];
  const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

  const CHARS = {
    hair: [
      { id: "pendek", nama: "Pendek" },
      { id: "spiky", nama: "Spiky" },
      { id: "jabrik", nama: "Jabrik" },
      { id: "botak", nama: "Botak" },
    ],
    face: [
      { id: "biasa", nama: "Biasa" },
      { id: "serius", nama: "Serius" },
      { id: "senyum", nama: "Senyum" },
      { id: "mata-satu", nama: "Mata Satu" },
    ],
    outfit: [
      { id: "kaos", nama: "Kaos" },
      { id: "jaket", nama: "Jaket" },
      { id: "lab", nama: "Baju Lab" },
      { id: "rompi", nama: "Rompi" },
    ],
    color: [
      { id: "hijau", nama: "Hijau", hex: "#3fae6c" },
      { id: "biru", nama: "Biru", hex: "#4a86d8" },
      { id: "merah", nama: "Merah", hex: "#d8544a" },
      { id: "ungu", nama: "Ungu", hex: "#9a6ad8" },
      { id: "kuning", nama: "Kuning", hex: "#d8ad3a" },
    ],
    acc: [
      { id: "none", nama: "Tanpa" },
      { id: "topi", nama: "Topi" },
      { id: "kacamata", nama: "Kacamata" },
      { id: "masker", nama: "Masker" },
    ],
    skin: [
      { id: "terang", nama: "Terang", hex: "#f2c9a0" },
      { id: "sawo", nama: "Sawo", hex: "#c98d5e" },
      { id: "gelap", nama: "Gelap", hex: "#8a5a3b" },
    ],
  };
  const CHAR_DEFAULT = { hair: "pendek", face: "biasa", outfit: "kaos", color: "hijau", acc: "none", skin: "terang" };

  /* ================= STATE ================= */
  let aktif = false;
  let canvas = null;
  let ctx = null;
  let view = { w: 960, h: 600, dpr: 1, scale: 1, ox: 480, oy: 300 };
  let run = null;
  let layar = "menu"; // menu | play | skills | shop | pause | over | char | leaderboard | settings | loading
  let runPaused = true;
  let raf = 0;
  let lastT = 0;
  let uiClock = 0;
  let toastT = 0;
  let flashT = 0;
  let hurtT = 0;
  let skillPending = 0;
  let shopAsal = "pause";
  let lbTab = "time";
  let lbData = null;
  let lbLoading = false;
  let akunDoc = null;
  let akunMemuat = false;
  let serverError = "";
  let simpanBusy = false;

  const keys = new Set();
  const pointer = { x: 0, y: 0, down: false, sokong: false };
  const stick = { aktif: false, id: null, x: 0, y: 0, cx: 0, cy: 0 };
  let shootHeld = false;
  let mouseAim = false;
  let joystickEl = null;
  let knobEl = null;

  let SFX_ON = true;
  let MUSIK_ON = true;
  let GETAR_ON = true;
  let audioCtx = null;
  let musikTimer = 0;
  let musikStep = 0;

  /* ================= UTIL UI ================= */
  function toast(pesan, ms) {
    const el = $("sv-toast");
    if (!el) return;
    el.innerHTML = pesan;
    el.classList.add("is-show");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("is-show"), ms || 2200);
  }

  function flash(teks, hijau) {
    const el = $("sv-flash");
    if (!el) return;
    el.textContent = teks;
    el.classList.toggle("is-green", !!hijau);
    el.classList.remove("is-show");
    void el.offsetWidth;
    el.classList.add("is-show");
    clearTimeout(flashT);
    flashT = setTimeout(() => el.classList.remove("is-show"), 1600);
  }

  function getar(pola) {
    if (!GETAR_ON) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pola);
    } catch (e) { /* ignore */ }
  }

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
    if (window.db) return window.db;
    if (window.firebase && typeof firebase.firestore === "function") return firebase.firestore();
    return null;
  }

  function charSah(c) {
    const d = Object.assign({}, CHAR_DEFAULT, c || {});
    const fix = (key, pool) => (pool.some((o) => o.id === d[key]) ? d[key] : CHAR_DEFAULT[key]);
    return {
      hair: fix("hair", CHARS.hair),
      face: fix("face", CHARS.face),
      outfit: fix("outfit", CHARS.outfit),
      color: fix("color", CHARS.color),
      acc: fix("acc", CHARS.acc),
      skin: fix("skin", CHARS.skin),
    };
  }

  /* ================= AUDIO ================= */
  function audioSiap() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    } catch (e) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function nada(freq, dur, type, vol, geser) {
    if (!SFX_ON) return;
    const ac = audioSiap();
    if (!ac) return;
    try {
      if (ac.state === "suspended") ac.resume();
      const t0 = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      if (geser) osc.frequency.exponentialRampToValueAtTime(Math.max(40, geser), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  function bunyi(jenis) {
    switch (jenis) {
      case "shoot": nada(rand(720, 820), 0.06, "square", 0.035, 320); break;
      case "shoot-besar": nada(rand(150, 190), 0.12, "sawtooth", 0.06, 70); break;
      case "laser": nada(rand(1100, 1300), 0.07, "sine", 0.04, 560); break;
      case "kena": nada(rand(180, 220), 0.05, "square", 0.03, 120); break;
      case "mati": nada(rand(140, 180), 0.16, "sawtooth", 0.04, 60); break;
      case "ledakan": nada(90, 0.3, "sawtooth", 0.09, 30); break;
      case "loot": nada(880, 0.07, "triangle", 0.05, 1320); break;
      case "koin": nada(1180, 0.08, "square", 0.035, 1560); break;
      case "level": nada(660, 0.1, "triangle", 0.07, 990); setTimeout(() => nada(990, 0.14, "triangle", 0.07, 1320), 90); break;
      case "wave": nada(440, 0.12, "square", 0.05, 660); setTimeout(() => nada(660, 0.18, "square", 0.05, 880), 120); break;
      case "over": nada(260, 0.5, "sawtooth", 0.07, 80); break;
      case "medkit": nada(520, 0.12, "sine", 0.05, 780); break;
      case "shield": nada(760, 0.1, "sine", 0.04, 1040); break;
      case "klik": nada(540, 0.04, "square", 0.025, 650); break;
      default: break;
    }
  }

  function musikMulai() {
    if (!MUSIK_ON || musikTimer) return;
    musikTimer = setInterval(() => {
      if (!aktif || !run || runPaused || !MUSIK_ON) return;
      try {
        const ac = audioSiap();
        if (!ac) return;
        const bass = [55, 55, 73.4, 55, 65.4, 65.4, 49, 49];
        const lead = [220, 261.6, 293.7, 261.6, 196, 220, 246.9, 196];
        const i = musikStep % 8;
        if (i % 2 === 0) nada(bass[i], 0.24, "triangle", 0.03);
        else nada(lead[i], 0.12, "sine", 0.018);
        musikStep++;
      } catch (e) { /* ignore */ }
    }, 280);
  }

  function musikStop() {
    if (musikTimer) clearInterval(musikTimer);
    musikTimer = 0;
  }

  /* ================= PERSISTENSI ================= */
  function kunciLokal(suffix) {
    const a = absenAkun();
    return `kelas73-survival-${suffix}-${a || "guest"}`;
  }

  function muatLokal() {
    try {
      const raw = JSON.parse(localStorage.getItem(kunciLokal("save")) || "null");
      if (!raw || typeof raw !== "object") return null;
      return raw;
    } catch (e) {
      return null;
    }
  }

  function simpanLokal(data) {
    try {
      localStorage.setItem(kunciLokal("save"), JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function defaultChar() {
    try {
      const raw = localStorage.getItem(kunciLokal("char"));
      if (raw) return charSah(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return Object.assign({}, CHAR_DEFAULT);
  }

  function simpanCharLokal(c) {
    try {
      localStorage.setItem(kunciLokal("char"), JSON.stringify(c));
    } catch (e) { /* ignore */ }
  }

  async function muatAkun() {
    akunDoc = muatLokal();
    const a = absenAkun();
    const db = dbAman();
    if (!a || !db) return akunDoc;
    akunMemuat = true;
    try {
      const snap = await db.collection(COL).doc(String(a)).get();
      if (snap.exists) {
        const d = snap.data() || {};
        akunDoc = normalAkun(d);
        simpanLokal(akunDoc);
      }
    } catch (e) {
      serverError = pesanGalat(e);
    } finally {
      akunMemuat = false;
    }
    return akunDoc;
  }

  function normalAkun(d) {
    return {
      absen: Number(d.absen) || absenAkun(),
      name: String(d.name || namaAkun()).slice(0, 30),
      bestTime: clamp(d.bestTime, 0, 86400),
      bestKills: clamp(d.bestKills, 0, 50000),
      bestWave: clamp(d.bestWave, 0, 500),
      bestLevel: clamp(d.bestLevel, 0, 300),
      totalKills: clamp(d.totalKills, 0, 10000000),
      games: clamp(d.games, 0, 1000000),
      character: charSah(d.character),
    };
  }

  function pesanGalat(err) {
    const code = String((err && err.code) || "");
    if (code.includes("permission-denied")) return "Database menolak akses. Coba refresh halaman.";
    if (code.includes("unavailable")) return "Koneksi ke database terputus.";
    return (err && err.message) || "Terjadi kesalahan.";
  }

  function gabungAkun(a, b) {
    const dasar = normalAkun(a || {});
    const lain = normalAkun(b || {});
    return {
      absen: absenAkun() || lain.absen || dasar.absen,
      name: namaAkun(),
      bestTime: Math.max(dasar.bestTime, lain.bestTime),
      bestKills: Math.max(dasar.bestKills, lain.bestKills),
      bestWave: Math.max(dasar.bestWave, lain.bestWave),
      bestLevel: Math.max(dasar.bestLevel, lain.bestLevel),
      totalKills: Math.max(dasar.totalKills, lain.totalKills),
      games: Math.max(dasar.games, lain.games),
      character: charSah(lain.character || dasar.character),
    };
  }

  function buatPayloadRekor(dasar, hasil, char) {
    const lama = normalAkun(dasar || {});
    return {
      absen: absenAkun() || lama.absen,
      name: namaAkun(),
      bestTime: Math.max(lama.bestTime || 0, Math.round(hasil.waktu)),
      bestKills: Math.max(lama.bestKills || 0, Math.round(hasil.kills)),
      bestWave: Math.max(lama.bestWave || 0, Math.round(hasil.wave)),
      bestLevel: Math.max(lama.bestLevel || 0, Math.round(hasil.level)),
      totalKills: Math.min(10000000, Math.max(lama.totalKills || 0, lama.bestKills || 0) + Math.round(hasil.kills)),
      games: Math.min(1000000, (lama.games || 0) + 1),
      character: charSah(char),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
  }

  function buatBaruRekor(dasar, hasil) {
    const lama = normalAkun(dasar || {});
    return {
      time: Math.round(hasil.waktu) > lama.bestTime,
      kills: Math.round(hasil.kills) > lama.bestKills,
      wave: Math.round(hasil.wave) > lama.bestWave,
      level: Math.round(hasil.level) > lama.bestLevel,
    };
  }

  async function simpanRekor(hasil) {
    const char = run ? run.char : defaultChar();
    const lama = normalAkun(akunDoc || muatLokal() || {});
    const a = absenAkun();
    const db = dbAman();

    if (!a || !db) {
      const payload = buatPayloadRekor(lama, hasil, char);
      akunDoc = normalAkun(payload);
      simpanLokal(akunDoc);
      simpanRingkas();
      return { ok: false, alasan: "guest", baru: buatBaruRekor(lama, hasil) };
    }

    try {
      const ref = db.collection(COL).doc(String(a));
      const kotak = { payload: null, baru: null };
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const server = snap.exists ? normalAkun(snap.data()) : null;
        const dasar = server ? gabungAkun(server, lama) : lama;
        const payload = buatPayloadRekor(dasar, hasil, char);
        tx.set(ref, payload, { merge: true });
        kotak.payload = payload;
        kotak.baru = buatBaruRekor(dasar, hasil);
      });
      if (kotak.payload) {
        akunDoc = normalAkun(kotak.payload);
        simpanLokal(akunDoc);
        simpanRingkas();
      }
      return { ok: true, baru: kotak.baru || buatBaruRekor(lama, hasil) };
    } catch (e) {
      serverError = pesanGalat(e);
      return { ok: false, alasan: serverError, baru: buatBaruRekor(lama, hasil) };
    }
  }

  async function simpanCharServer(char) {
    const c = charSah(char);
    simpanCharLokal(c);
    if (akunDoc) akunDoc.character = c;
    const a = absenAkun();
    const db = dbAman();
    if (!a || !db) return false;
    const lama = normalAkun(akunDoc || muatLokal() || {});
    try {
      const ref = db.collection(COL).doc(String(a));
      const kotak = { payload: null };
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const server = snap.exists ? normalAkun(snap.data()) : null;
        const dasar = server ? gabungAkun(server, lama) : lama;
        const payload = {
          absen: a,
          name: namaAkun(),
          bestTime: dasar.bestTime || 0,
          bestKills: dasar.bestKills || 0,
          bestWave: dasar.bestWave || 0,
          bestLevel: dasar.bestLevel || 0,
          totalKills: dasar.totalKills || 0,
          games: dasar.games || 0,
          character: c,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        };
        tx.set(ref, payload, { merge: true });
        kotak.payload = payload;
      });
      if (kotak.payload) {
        akunDoc = normalAkun(kotak.payload);
        simpanLokal(akunDoc);
        simpanRingkas();
      }
      return true;
    } catch (e) {
      serverError = pesanGalat(e);
      return false;
    }
  }

  function simpanRingkas() {
    const a = absenAkun();
    if (!a || !akunDoc) return;
    try {
      localStorage.setItem("kelas73-survival-ringkas", JSON.stringify({
        absen: a,
        bestTime: akunDoc.bestTime || 0,
        bestKills: akunDoc.bestKills || 0,
        bestWave: akunDoc.bestWave || 0,
        games: akunDoc.games || 0,
      }));
    } catch (e) { /* ignore */ }
  }

  async function muatLeaderboard() {
    lbLoading = true;
    const db = dbAman();
    if (!db) {
      lbData = [];
      lbLoading = false;
      return;
    }
    try {
      const snap = await db.collection(COL).limit(100).get();
      const list = [];
      snap.forEach((doc) => {
        const d = doc.data() || {};
        if (Number(d.bestTime) > 0 || Number(d.bestKills) > 0) list.push(normalAkun(d));
      });
      lbData = list;
    } catch (e) {
      serverError = pesanGalat(e);
      lbData = [];
    } finally {
      lbLoading = false;
    }
  }

  /* ================= ARENA ================= */
  function buatRintangan() {
    const walls = [];
    const crates = [];
    const chests = [];
    const dekat = (x, y, r, list) => list.some((o) => dist2(x, y, o.x, o.y) < (r + o.r + 60) * (r + o.r + 60));
    const diTengah = (x, y) => Math.hypot(x, y) < 170;

    let coba = 0;
    while (walls.length < randInt(2, 4) && coba < 80) {
      coba++;
      const sudut = rand(0, TAU);
      const jarak = rand(250, 470);
      const w = rand(120, 230);
      const h = rand(26, 42);
      const x = Math.cos(sudut) * jarak;
      const y = Math.sin(sudut) * jarak;
      const r = Math.hypot(w, h) / 2;
      if (diTengah(x, y) || dekat(x, y, r, walls) || dekat(x, y, r, crates)) continue;
      if (Math.hypot(x, y) + r > ARENA_R - 110) continue;
      walls.push({ x, y, w, h, r });
    }

    coba = 0;
    while (crates.length < randInt(4, 6) && coba < 120) {
      coba++;
      const sudut = rand(0, TAU);
      const jarak = rand(210, 540);
      const x = Math.cos(sudut) * jarak;
      const y = Math.sin(sudut) * jarak;
      const r = 20;
      if (diTengah(x, y) || dekat(x, y, r, walls) || dekat(x, y, r, crates)) continue;
      if (Math.hypot(x, y) > ARENA_R - 100) continue;
      crates.push({ x, y, r: 19, hp: 40, maxHp: 40, jenis: "peti" });
    }

    coba = 0;
    while (chests.length < randInt(3, 5) && coba < 120) {
      coba++;
      const sudut = rand(0, TAU);
      const jarak = rand(230, 560);
      const x = Math.cos(sudut) * jarak;
      const y = Math.sin(sudut) * jarak;
      if (diTengah(x, y) || dekat(x, y, 18, walls) || dekat(x, y, 18, crates) || dekat(x, y, 18, chests)) continue;
      if (Math.hypot(x, y) > ARENA_R - 100) continue;
      chests.push({ x, y, r: 15, hp: 34, maxHp: 34, jenis: "peti-loot" });
    }

    return { walls, crates: crates.concat(chests) };
  }

  function posisiSah(radius, walls, crates, minPlayer) {
    for (let i = 0; i < 60; i++) {
      const sudut = rand(0, TAU);
      const jarak = rand(220, ARENA_R - 90);
      const x = Math.cos(sudut) * jarak;
      const y = Math.sin(sudut) * jarak;
      if (Math.hypot(x, y) < 170) continue;
      if (minPlayer && run && dist2(x, y, run.player.x, run.player.y) < minPlayer * minPlayer) continue;
      let tabrak = false;
      for (const w of walls) {
        if (Math.abs(x - w.x) < w.w / 2 + radius + 26 && Math.abs(y - w.y) < w.h / 2 + radius + 26) { tabrak = true; break; }
      }
      if (!tabrak) for (const c of crates) {
        if (dist2(x, y, c.x, c.y) < (c.r + radius + 30) * (c.r + radius + 30)) { tabrak = true; break; }
      }
      if (!tabrak) return { x, y };
    }
    return { x: rand(-120, 120), y: rand(-120, 120) };
  }

  function buatRun(char) {
    const arena = buatRintangan();
    const r = {
      char: charSah(char),
      t: 0,
      wave: 0,
      waveState: "intermission",
      interLeft: 3.2,
      spawnSisa: 0,
      spawnJeda: 0,
      waveTotal: 0,
      waveKilled: 0,
      player: {
        x: 0, y: 0, vx: 0, vy: 0, arah: 0,
        hp: 100, shield: 0, shieldReady: 0, shieldMax: 0,
        level: 1, exp: 0, expNeed: 34,
        kills: 0, money: 0, moneyEarned: 0, expTotal: 0,
        weapon: "pistol", mag: 0, reload: 0, fireCd: 0,
        skills: {},
        beli: { maxhp: 0, speed: 0, dmg: 0, rate: 0 },
        medkit: 0, hurtCd: 0, regenAcc: 0,
      },
      zombies: [],
      bullets: [],
      zbullets: [],
      pickups: [],
      particles: [],
      texts: [],
      drones: [],
      arcs: [],
      walls: arena.walls,
      crates: arena.crates,
      supply: { timer: 55, incoming: 0, x: 0, y: 0, active: false },
      shake: 0,
      finished: false,
    };
    r.player.shieldMax = shieldMaks(r);
    return r;
  }

  /* ================= STAT SKILL ================= */
  function lvSkill(id) {
    return (run && run.player.skills[id]) || 0;
  }

  function shieldMaks(r) {
    const sk = (r || run).player.skills;
    return (sk.shield || 0) * 25;
  }

  function statTurunan() {
    const p = run.player;
    const sk = p.skills;
    const maxHp = 100 + (sk.vitality || 0) * 20 + p.beli.maxhp * 25;
    return {
      maxHp,
      speed: 232 * (1 + (sk.speed || 0) * 0.06 + p.beli.speed * 0.06),
      dmg: (1 + (sk.damage || 0) * 0.1 + p.beli.dmg * 0.08),
      rate: (1 + (sk.firerate || 0) * 0.09 + p.beli.rate * 0.06),
      regen: 0.45 + (sk.regen || 0) * 0.9,
      critChance: Math.min(0.5, 0.05 + (sk.crit || 0) * 0.07),
      critMult: 1.6 + (sk.crit || 0) * 0.15,
      magnet: 100 + (sk.magnet || 0) * 55,
      shieldMax: shieldMaks(),
      shieldRegen: 3 + (sk.shield || 0) * 2,
    };
  }

  /* ================= RUN ================= */
  function mulaiRun() {
    if (!charChar()) return;
    run = buatRun(charChar());
    layar = "play";
    runPaused = false;
    skillPending = 0;
    serverError = "";
    tampilLayar();
    updateHud(true);
    flash("WAVE 1", true);
    bunyi("wave");
    musikMulai();
    getar(30);
    mulaiWave(1);
  }

  function charChar() {
    return (akunDoc && akunDoc.character) || defaultChar();
  }

  function waveSkala(w) {
    return {
      hp: 1 + (w - 1) * 0.18,
      dmg: Math.min(3, 1 + (w - 1) * 0.06),
      spd: Math.min(1.5, 1 + (w - 1) * 0.013),
    };
  }

  function rencanaWave(w) {
    const list = [];
    const boss = w % 5 === 0;
    let jumlah = Math.min(9 + w * 3, 74);
    if (boss) jumlah = Math.round(jumlah * 0.7);
    const tersedia = Object.values(ZOMBIES).filter((z) => !z.boss && z.unlock <= w);
    const totalBobot = tersedia.reduce((a, z) => a + z.bobot, 0);
    for (let i = 0; i < jumlah; i++) {
      let roll = Math.random() * totalBobot;
      let pilih = tersedia[0];
      for (const z of tersedia) {
        roll -= z.bobot;
        if (roll <= 0) { pilih = z; break; }
      }
      list.push(pilih.id);
    }
    if (boss) list.push("boss");
    return list;
  }

  function mulaiWave(n) {
    const p = run.player;
    run.wave = n;
    run.waveTotal = 0;
    run.waveKilled = 0;
    run.waveState = "spawning";
    run.spawnQueue = rencanaWave(n);
    run.waveTotal = run.spawnQueue.length;
    run.spawnJeda = 0.3;
    run.spawnSisa = run.spawnQueue.length;
    if (n > 1) {
      bunyi("wave");
      flash(n % 5 === 0 ? `WAVE ${n} · BOSS!` : `WAVE ${n}`, n % 5 !== 0);
    }
    updateHud(true);
  }

  function spawnZombie(tipe, opsi) {
    const base = ZOMBIES[tipe];
    const skala = waveSkala(run.wave);
    const sudut = rand(0, TAU);
    let x;
    let y;
    if (opsi && opsi.muncul) {
      x = opsi.muncul.x;
      y = opsi.muncul.y;
    } else {
      const jarak = ARENA_R - rand(50, 90);
      x = Math.cos(sudut) * jarak;
      y = Math.sin(sudut) * jarak;
    }
    const z = {
      id: `${tipe}-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`,
      tipe,
      x, y,
      vx: 0, vy: 0,
      r: base.r,
      hp: Math.round(base.hp * skala.hp),
      maxHp: Math.round(base.hp * skala.hp),
      speed: base.speed * skala.spd,
      dmg: Math.round(base.dmg * skala.dmg),
      xp: base.xp,
      uang: Math.round(base.uang * (1 + run.wave * 0.04)),
      warna: base.warna,
      gelap: base.gelap,
      arah: 0,
      sentuhCd: 0,
      bladeT: 0,
      zapT: rand(0, 0.4),
      shootCd: rand(0.6, 2),
      fuse: 0,
      abilityCd: 4,
      summonCd: 7,
      flash: 0,
      bob: rand(0, TAU),
      boss: !!base.boss,
    };
    if (base.tembak) z.tembak = Object.assign({}, base.tembak);
    if (base.ledakan) z.ledakan = Object.assign({}, base.ledakan);
    run.zombies.push(z);
    return z;
  }

  function tembakZombie(z) {
    const w = WEAPONS[run.player.weapon] || WEAPONS.pistol;
    const st = statTurunan();
    const p = run.player;
    const targetZ = z ? { x: z.x, y: z.y } : null;
    let aimX;
    let aimY;
    if (targetZ) {
      aimX = targetZ.x;
      aimY = targetZ.y;
    } else if (mouseAim && !sentuhAktif()) {
      aimX = pointerWorld().x;
      aimY = pointerWorld().y;
    } else {
      const n = zombieTerdekat(p.x, p.y, w.range * 1.3);
      if (n) { aimX = n.x; aimY = n.y; } else { aimX = p.x + Math.cos(p.arah) * 100; aimY = p.y + Math.sin(p.arah) * 100; }
    }
    const dasar = Math.atan2(aimY - p.y, aimX - p.x);
    p.arah = dasar;
    for (let i = 0; i < w.pellets; i++) {
      const sebar = (Math.random() - 0.5) * w.spread * 2;
      const sudut = dasar + sebar;
      const crit = Math.random() < st.critChance;
      const dmg = w.dmg * st.dmg * (crit ? st.critMult : 1);
      run.bullets.push({
        x: p.x + Math.cos(sudut) * 22,
        y: p.y + Math.sin(sudut) * 22,
        vx: Math.cos(sudut) * w.speed,
        vy: Math.sin(sudut) * w.speed,
        dmg,
        crit,
        sisa: w.range,
        pierce: w.pierce,
        kena: [],
        warna: w.warna,
        r: w.id === "sniper" ? 4 : 3,
        dari: "player",
      });
    }
    run.particles.push({
      x: p.x + Math.cos(dasar) * 26, y: p.y + Math.sin(dasar) * 26,
      vx: Math.cos(dasar) * 60, vy: Math.sin(dasar) * 60,
      life: 0.12, max: 0.12, warna: w.warna, size: 4,
    });
    p.mag = Math.max(0, p.mag - 1);
    if (w.mag > 0 && p.mag <= 0) p.reload = w.reload;
    p.fireCd = 1 / Math.max(0.2, w.rate * st.rate);
    bunyi(w.id === "shotgun" || w.id === "sniper" ? "shoot-besar" : w.id === "plasma" ? "laser" : "shoot");
  }

  function zombieTerdekat(x, y, maks) {
    let best = null;
    let bd = (maks || 9999) * (maks || 9999);
    for (const z of run.zombies) {
      const d = dist2(x, y, z.x, z.y);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  function lukaZombie(z, dmg, crit, sumber) {
    if (z.hp <= 0) return;
    z.hp -= dmg;
    z.flash = 0.1;
    if (run.particles.length < 420) {
      for (let i = 0; i < 3; i++) {
        run.particles.push({
          x: z.x, y: z.y, vx: rand(-70, 70), vy: rand(-70, 70),
          life: rand(0.18, 0.4), max: 0.4, warna: crit ? "#ffe08a" : "#7fd68d", size: rand(2, 5),
        });
      }
    }
    tambahTeks(z.x, z.y - z.r - 6, `${Math.round(dmg)}${crit ? "!" : ""}`, crit ? "#ffcf5c" : "#eafff2");
    bunyi("kena");
    if (z.hp <= 0) bunuhZombie(z, sumber);
  }

  function bunuhZombie(z, sumber) {
    if (z.mati) return;
    z.mati = true;
    bunyi("mati");
    const p = run.player;
    p.kills += 1;
    run.waveKilled += 1;
    if (z.tipe === "explosive" && z.ledakan) ledakan(z.x, z.y, z.ledakan.radius, z.ledakan.dmg, z);
    if (z.tipe === "boss") {
      ledakan(z.x, z.y, 130, 12, z);
      flash("BOSS DOWN!", true);
      getar([60, 40, 120]);
    }
    jatuhkanDariZombie(z);
    if (run.zombies.length > 60) run.zombies = run.zombies.filter((x) => !x.mati);
  }

  function ledakan(x, y, radius, dmg, sumber) {
    bunyi("ledakan");
    getar(60);
    run.shake = Math.max(run.shake, 7);
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      const sp = rand(80, 320);
      run.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6), max: 0.6, warna: i % 3 ? "#ffb05c" : "#ff6b4a", size: rand(3, 7), grav: 30,
      });
    }
    run.arcs.push({ jenis: "ledakan", x, y, r: radius, life: 0.4, max: 0.4 });
    const p = run.player;
    if (dist2(p.x, p.y, x, y) < radius * radius) lukaPlayer(dmg, "ledakan");
    for (const z of run.zombies) {
      if (z === sumber || z.mati) continue;
      if (dist2(z.x, z.y, x, y) < radius * radius) lukaZombie(z, dmg * 0.5, false, "ledakan");
    }
    for (const c of run.crates) {
      if (dist2(c.x, c.y, x, y) < (radius + c.r) * (radius + c.r)) rusakCrate(c, dmg);
    }
  }

  function lukaPlayer(dmg, sumber) {
    const p = run.player;
    if (p.hurtCd > 0 && sumber !== "paksa") return;
    let sisa = dmg;
    if (p.shield > 0) {
      const serap = Math.min(p.shield, sisa);
      p.shield -= serap;
      sisa -= serap;
      bunyi("shield");
    }
    if (sisa > 0) {
      p.hp -= sisa;
      if (p.hp < 0) p.hp = 0;
      bunyi("kena");
    }
    p.hurtCd = 0.6;
    p.invuln = 0.45;
    run.shake = Math.max(run.shake, 5);
    hurtT = 0.35;
    const el = $("sv-hurt");
    if (el) {
      el.classList.remove("is-show");
      void el.offsetWidth;
      el.classList.add("is-show");
    }
    getar(40);
    updateHud(true);
    if (p.hp <= 0) akhirRun();
  }

  function tambahTeks(x, y, teks, warna) {
    run.texts.push({ x, y, teks, warna: warna || "#fff", life: 0.8, max: 0.8 });
    if (run.texts.length > 40) run.texts.shift();
  }

  /* ================= LOOT ================= */
  function pickup(x, y, jenis, nilai) {
    run.pickups.push({
      id: Math.random().toString(36).slice(2),
      x, y, jenis, nilai,
      vx: rand(-70, 70), vy: rand(-70, 70),
      life: 26, bob: rand(0, TAU),
      tarik: false,
    });
  }

  function jatuhkanDariZombie(z) {
    const n = z.tipe === "boss" ? 6 : 1;
    for (let i = 0; i < n; i++) {
      pickup(z.x + rand(-12, 12), z.y + rand(-12, 12), "koin", z.uang);
      if (i < (z.tipe === "boss" ? 4 : 1)) pickup(z.x + rand(-14, 14), z.y + rand(-14, 14), "exp", z.xp);
    }
    if (z.tipe === "boss") {
      pickup(z.x, z.y, "medkit", 1);
      pickup(z.x + 14, z.y, "senjata", 1);
      pickup(z.x - 14, z.y, "gem", 1);
    } else if (Math.random() < 0.012) {
      pickup(z.x, z.y, "medkit", 1);
    }
  }

  function jatuhkanLootCrate(c) {
    const bonus = 1 + Math.floor(run.wave / 5);
    const jmlKoin = randInt(2, 4) + bonus;
    for (let i = 0; i < jmlKoin; i++) pickup(c.x + rand(-20, 20), c.y + rand(-20, 20), "koin", randInt(4, 9) + run.wave);
    for (let i = 0; i < randInt(1, 5); i++) pickup(c.x + rand(-22, 22), c.y + rand(-22, 22), "exp", randInt(6, 13) + run.wave * 2);
    if (Math.random() < 0.14) pickup(c.x, c.y, "medkit", 1);
    if (Math.random() < 0.16) pickup(c.x, c.y, "senjata", 1);
    if (Math.random() < 0.1) pickup(c.x, c.y, "gem", 1);
  }

  function jatuhkanSupply(c) {
    pickup(c.x, c.y, "medkit", 1);
    pickup(c.x + 18, c.y, "senjata", 1);
    pickup(c.x - 18, c.y, "gem", 1);
    for (let i = 0; i < 4; i++) pickup(c.x + rand(-26, 26), c.y + rand(-26, 26), "koin", randInt(18, 34) + run.wave * 2);
    for (let i = 0; i < 2; i++) pickup(c.x + rand(-24, 24), c.y + rand(-24, 24), "exp", randInt(18, 30) + run.wave * 3);
    flash("SUPPLY DROP!", true);
  }

  function rusakCrate(c, dmg) {
    if (c.rusak) return;
    c.hp -= dmg;
    if (run.particles.length < 420) {
      run.particles.push({
        x: c.x, y: c.y, vx: rand(-90, 90), vy: rand(-90, 90),
        life: 0.3, max: 0.3, warna: "#c8a06a", size: rand(2, 5),
      });
    }
    if (c.hp > 0) return;
    c.rusak = true;
    bunyi("loot");
    if (c.jenis === "supply") {
      jatuhkanSupply(c);
      run.supply.active = false;
    } else if (c.jenis === "peti-loot") {
      jatuhkanLootCrate(c);
      c.jenis = "hancur";
    } else if (c.jenis === "peti") {
      for (let i = 0; i < randInt(1, 3); i++) pickup(c.x + rand(-16, 16), c.y + rand(-16, 16), "koin", randInt(3, 7) + run.wave);
      if (Math.random() < 0.1) pickup(c.x, c.y, "exp", randInt(6, 12));
      c.jenis = "hancur";
    }
  }

  function ambilPickup(pk) {
    const p = run.player;
    if (pk.jenis === "koin") {
      p.money += pk.nilai;
      p.moneyEarned += pk.nilai;
      bunyi("koin");
    } else if (pk.jenis === "exp") {
      expTambah(pk.nilai);
      bunyi("loot");
    } else if (pk.jenis === "gem") {
      p.money += 60 + run.wave * 8;
      p.moneyEarned += 60 + run.wave * 8;
      p.expTotal += 14;
      expTambah(14);
      tambahTeks(p.x, p.y - 30, "GEM!", "#ffcf5c");
      bunyi("level");
    } else if (pk.jenis === "medkit") {
      if (p.medkit >= 1) {
        p.money += 60;
        p.moneyEarned += 60;
        tambahTeks(p.x, p.y - 30, "+60", "#ffcf5c");
      } else {
        p.medkit = 1;
        tambahTeks(p.x, p.y - 30, "MEDKIT!", "#ff9b9b");
        flash("MEDKIT DIDAPAT", true);
        bunyi("medkit");
      }
    } else if (pk.jenis === "senjata") {
      const opsi = Object.keys(WEAPONS).filter((id) => id !== "pistol");
      const id = pick(opsi);
      if (p.weapon === id) {
        p.money += 80;
        p.moneyEarned += 80;
        tambahTeks(p.x, p.y - 30, "+80", "#ffcf5c");
      } else {
        gantiSenjata(id);
        tambahTeks(p.x, p.y - 30, WEAPONS[id].nama, "#aee3ff");
        flash(`DAPAT ${WEAPONS[id].nama.toUpperCase()}`, true);
      }
    }
  }

  function gantiSenjata(id) {
    const w = WEAPONS[id];
    if (!w) return;
    const p = run.player;
    p.weapon = id;
    p.mag = w.mag > 0 ? w.mag : 0;
    p.reload = 0;
    p.fireCd = 0.15;
    bunyi("klik");
    updateHud(true);
  }

  function expTambah(n) {
    const p = run.player;
    p.exp += n;
    p.expTotal += n;
    while (p.exp >= p.expNeed && p.level < MAX_LEVEL) {
      p.exp -= p.expNeed;
      p.level += 1;
      p.expNeed = Math.round(p.expNeed * 1.16);
      p.hp = Math.min(statTurunan().maxHp, p.hp + statTurunan().maxHp * 0.1);
      skillPending += 1;
      bunyi("level");
      flash("LEVEL UP!", true);
      tambahTeks(p.x, p.y - 40, "LEVEL UP", "#8ee6b4");
    }
    if (skillPending > 0 && layar === "play") bukaSkills();
    updateHud(true);
  }

  /* ================= SKILL ================= */
  function pilihanSkill() {
    const p = run.player;
    const tersedia = SKILLS.filter((s) => (p.skills[s.id] || 0) < s.max);
    for (let i = tersedia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tersedia[i], tersedia[j]] = [tersedia[j], tersedia[i]];
    }
    return tersedia.slice(0, 3);
  }

  function pilihSkill(id) {
    if (layar !== "skills") return;
    const p = run.player;
    if (id === "__heal") {
      const max = statTurunan().maxHp;
      p.hp = Math.min(max, p.hp + max * 0.35);
      tambahTeks(p.x, p.y - 40, "+HEAL", "#8ee6b4");
      bunyi("medkit");
      skillPending = Math.max(0, skillPending - 1);
      if (skillPending > 0) renderSkills();
      else lanjutMain();
      return;
    }
    const s = SKILL_BY_ID[id];
    if (!s) return;
    const lv = p.skills[id] || 0;
    if (lv >= s.max) return;
    p.skills[id] = lv + 1;
    if (id === "vitality") p.hp = Math.min(statTurunan().maxHp, p.hp + 20);
    if (id === "shield") {
      p.shieldMax = shieldMaks();
      p.shield = p.shieldMax;
      p.shieldReady = 0;
    }
    bunyi("level");
    skillPending = Math.max(0, skillPending - 1);
    if (skillPending > 0) renderSkills();
    else lanjutMain();
  }

  function bukaSkills() {
    if (!run || run.finished) return;
    layar = "skills";
    runPaused = true;
    if (skillPending <= 0) skillPending = 1;
    tampilLayar();
    renderSkills();
    updateHud(true);
  }

  function lanjutMain() {
    if (!run || run.finished) return;
    layar = "play";
    runPaused = false;
    tampilLayar();
  }

  function updateSkill(dt) {
    const p = run.player;
    const st = statTurunan();
    const sk = p.skills;
    run.player.arahSkill = (run.player.arahSkill || 0) + dt;

    if (sk.vitality || p.beli.maxhp) {
      const max = st.maxHp;
      if (p.hp > max) p.hp = max;
    }

    // Baling-baling
    if (sk.blades) {
      const jumlah = sk.blades;
      const dmg = (12 + sk.blades * 9) * st.dmg;
      for (let i = 0; i < jumlah; i++) {
        const a = run.player.arahSkill * 2.6 + (TAU / jumlah) * i;
        const bx = p.x + Math.cos(a) * 76;
        const by = p.y + Math.sin(a) * 76;
        for (const z of run.zombies) {
          if (z.mati) continue;
          if (dist2(bx, by, z.x, z.y) < (z.r + 13) * (z.r + 13) && (z.bladeT || 0) <= 0) {
            z.bladeT = 0.42;
            lukaZombie(z, dmg, false, "blades");
          }
        }
      }
    }

    // Lightning orb
    if (sk.orbs) {
      const jumlah = sk.orbs;
      const dmg = (9 + sk.orbs * 7) * st.dmg;
      for (let i = 0; i < jumlah; i++) {
        const a = -run.player.arahSkill * 1.7 + (TAU / jumlah) * i;
        const ox = p.x + Math.cos(a) * 106;
        const oy = p.y + Math.sin(a) * 106;
        run.player.orbA = run.player.orbA || 0;
        if ((run.player.orbCd || 0) <= 0) {
          const target = zombieTerdekat(ox, oy, 165);
          if (target) {
            run.arcs.push({ jenis: "petir", x1: ox, y1: oy, x2: target.x, y2: target.y, life: 0.16, max: 0.16 });
            lukaZombie(target, dmg, false, "orbs");
          }
        }
      }
      run.player.orbCd = ((run.player.orbCd || 0) - dt * Math.max(1, jumlah * 0.8));
      if (run.player.orbCd < -0.55) run.player.orbCd = 0;
    }

    // Drone
    if (sk.drones) {
      const jumlah = sk.drones;
      const dmg = (7 + sk.drones * 3) * st.dmg;
      while (run.drones.length < jumlah) run.drones.push({ cd: rand(0.2, 0.9), a: rand(0, TAU) });
      while (run.drones.length > jumlah) run.drones.pop();
      run.drones.forEach((d, i) => {
        const a = -run.player.arahSkill * 1.1 + (TAU / jumlah) * i;
        d.a = a;
        d.x = p.x + Math.cos(a) * 138;
        d.y = p.y + Math.sin(a) * 138;
        d.cd -= dt;
        if (d.cd <= 0) {
          const target = zombieTerdekat(d.x, d.y, 340);
          if (target) {
            const sudut = Math.atan2(target.y - d.y, target.x - d.x);
            run.bullets.push({
              x: d.x, y: d.y, vx: Math.cos(sudut) * 960, vy: Math.sin(sudut) * 960,
              dmg, crit: false, sisa: 360, pierce: 0, kena: [], warna: "#7fe7ff", r: 3, dari: "drone",
            });
            d.cd = 0.85;
            bunyi("laser");
          } else {
            d.cd = 0.3;
          }
        }
      });
    } else if (run.drones.length) {
      run.drones.length = 0;
    }

    // Flame ring
    if (sk.flame) {
      p.flameAcc = (p.flameAcc || 0) + dt;
      if (p.flameAcc >= 0.4) {
        p.flameAcc = 0;
        const radius = 78 + sk.flame * 13;
        const dmg = (10 + sk.flame * 6) * st.dmg * 0.4;
        for (const z of run.zombies) {
          if (!z.mati && dist2(z.x, z.y, p.x, p.y) < (radius + z.r) * (radius + z.r)) lukaZombie(z, dmg, false, "flame");
        }
      }
    }

    // Shield
    if (sk.shield) {
      p.shieldMax = st.shieldMax;
      if (p.hurtCd <= 0 && p.shield < p.shieldMax) {
        p.shield = Math.min(p.shieldMax, p.shield + st.shieldRegen * dt);
      }
    } else {
      p.shield = 0;
      p.shieldMax = 0;
    }
  }

  /* ================= UPDATE ================= */
  function sentuhAktif() {
    return document.body.classList.contains("sv-touch");
  }

  function pointerWorld() {
    return {
      x: (pointer.x - view.ox) / view.scale + cam.x,
      y: (pointer.y - view.oy) / view.scale + cam.y,
    };
  }

  function update(dt) {
    if (!run || run.finished) return;
    const p = run.player;
    const st = statTurunan();
    run.t += dt;
    if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 26);
    if (p.hurtCd > 0) p.hurtCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    // Gerak
    let mx = 0;
    let my = 0;
    if (keys.has("w") || keys.has("arrowup")) my -= 1;
    if (keys.has("s") || keys.has("arrowdown")) my += 1;
    if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
    if (keys.has("d") || keys.has("arrowright")) mx += 1;
    if (stick.aktif) { mx += stick.x; my += stick.y; }
    const panjang = Math.hypot(mx, my);
    if (panjang > 1) { mx /= panjang; my /= panjang; }
    p.x += mx * st.speed * dt;
    p.y += my * st.speed * dt;
    halangiLingkungan(p, 15);
    if (panjang > 0.1) p.arah = Math.atan2(my, mx);

    // Senjata
    const w = WEAPONS[p.weapon] || WEAPONS.pistol;
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) {
        p.reload = 0;
        p.mag = w.mag > 0 ? w.mag : 0;
      }
    }
    if (p.fireCd > 0) p.fireCd -= dt;
    const mauTembak = (pointer.down && !sentuhAktif()) || shootHeld;
    if (mauTembak && p.reload <= 0 && p.fireCd <= 0) {
      const dekat = zombieTerdekat(p.x, p.y, Math.max(w.range * 1.25, 420));
      if (dekat || (mouseAim && !sentuhAktif())) tembakZombie(null);
    }

    // Regen pasif
    p.regenAcc = (p.regenAcc || 0) + st.regen * dt;
    if (p.regenAcc >= 1) {
      const n = Math.floor(p.regenAcc);
      p.regenAcc -= n;
      if (p.hp < st.maxHp) p.hp = Math.min(st.maxHp, p.hp + n);
    }

    // Zombie
    for (const z of run.zombies) {
      if (z.mati) continue;
      if (z.flash > 0) z.flash -= dt;
      if (z.sentuhCd > 0) z.sentuhCd -= dt;
      if (z.bladeT > 0) z.bladeT -= dt;
      z.bob += dt * 7;
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      const jarak = Math.hypot(dx, dy) || 1;
      z.arah = Math.atan2(dy, dx);
      let mengejar = true;
      if (z.tembak) {
        if (jarak < 235) mengejar = false;
        if (jarak > 330) mengejar = true;
        z.shootCd -= dt;
        if (z.shootCd <= 0 && jarak < z.tembak.range) {
          z.shootCd = z.tembak.jeda;
          const sudut = Math.atan2(dy, dx);
          run.zbullets.push({
            x: z.x + Math.cos(sudut) * 18, y: z.y + Math.sin(sudut) * 18,
            vx: Math.cos(sudut) * z.tembak.speed, vy: Math.sin(sudut) * z.tembak.speed,
            dmg: Math.round(z.tembak.dmg * waveSkala(run.wave).dmg), life: 2.4, r: 6,
          });
        }
      }
      if (z.fuse > 0) {
        z.fuse -= dt;
        if (z.fuse <= 0 && !z.mati) { z.hp = 0; bunuhZombie(z, "fuse"); }
      }
      if (z.tipe === "explosive" && z.hp > 0 && z.hp < z.maxHp * 0.25 && !z.fuse) z.fuse = 0.7;
      if (z.boss) {
        z.abilityCd -= dt;
        z.summonCd -= dt;
        if (z.abilityCd <= 0 && jarak < 290) {
          z.abilityCd = 5;
          run.arcs.push({ jenis: "ledakan", x: z.x, y: z.y, r: 175, life: 0.5, max: 0.5 });
          if (dist2(p.x, p.y, z.x, z.y) < 175 * 175) lukaPlayer(z.dmg, "boss");
          run.shake = Math.max(run.shake, 6);
        }
        if (z.summonCd <= 0) {
          z.summonCd = 7.5;
          for (let i = 0; i < 2; i++) spawnZombie("runner", { muncul: { x: z.x + rand(-60, 60), y: z.y + rand(-60, 60) } });
        }
      }
      if (mengejar) {
        z.vx = (dx / jarak) * z.speed;
        z.vy = (dy / jarak) * z.speed;
      } else {
        z.vx *= 0.85;
        z.vy *= 0.85;
      }
      z.x += z.vx * dt;
      z.y += z.vy * dt;
      halangiLingkungan(z, z.r);
      if (jarak < z.r + 16 && z.sentuhCd <= 0) {
        z.sentuhCd = 0.9;
        lukaPlayer(z.dmg, "zombie");
      }
    }

    // Pemisah zombie biar gak numpuk
    if (run.zombies.length < 90) {
      for (let i = 0; i < run.zombies.length; i++) {
        const a = run.zombies[i];
        if (a.mati) continue;
        for (let j = i + 1; j < run.zombies.length; j++) {
          const b = run.zombies[j];
          if (b.mati) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r - 2;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < min * min) {
            const d = Math.sqrt(d2);
            const push = (min - d) * 0.5;
            const nx = dx / d;
            const ny = dy / d;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
    }
    run.zombies = run.zombies.filter((z) => !z.mati);

    // Peluru pemain & drone
    for (const b of run.bullets) {
      const langkah = Math.hypot(b.vx, b.vy) * dt;
      const n = Math.max(1, Math.ceil(langkah / 10));
      let mati = false;
      for (let s = 0; s < n && !mati; s++) {
        b.x += (b.vx * dt) / n;
        b.y += (b.vy * dt) / n;
        b.sisa -= langkah / n;
        if (b.sisa <= 0) { mati = true; break; }
        if (Math.hypot(b.x, b.y) > ARENA_R - 12) { mati = true; break; }
        for (const wl of run.walls) {
          if (Math.abs(b.x - wl.x) < wl.w / 2 && Math.abs(b.y - wl.y) < wl.h / 2) { mati = true; break; }
        }
        if (mati) break;
        for (const c of run.crates) {
          if (c.rusak) continue;
          if (dist2(b.x, b.y, c.x, c.y) < (c.r + 4) * (c.r + 4)) {
            rusakCrate(c, b.dmg);
            if (b.pierce > 0) b.pierce -= 1;
            else { mati = true; }
            break;
          }
        }
        if (mati) break;
        for (const z of run.zombies) {
          if (z.mati || b.kena.includes(z.id)) continue;
          if (dist2(b.x, b.y, z.x, z.y) < (z.r + b.r) * (z.r + b.r)) {
            lukaZombie(z, b.dmg, b.crit, "tembak");
            b.kena.push(z.id);
            if (b.pierce > 0) b.pierce -= 1;
            else { mati = true; break; }
          }
        }
      }
      b.mati = mati;
    }
    run.bullets = run.bullets.filter((b) => !b.mati);

    // Peluru zombie
    for (const b of run.zbullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || Math.hypot(b.x, b.y) > ARENA_R - 10) b.mati = true;
      for (const wl of run.walls) {
        if (Math.abs(b.x - wl.x) < wl.w / 2 && Math.abs(b.y - wl.y) < wl.h / 2) b.mati = true;
      }
      if (!b.mati && dist2(b.x, b.y, p.x, p.y) < (b.r + 15) * (b.r + 15)) {
        b.mati = true;
        lukaPlayer(b.dmg, "tembak");
      }
    }
    run.zbullets = run.zbullets.filter((b) => !b.mati);

    // Pickup
    const magnet = st.magnet;
    for (const pk of run.pickups) {
      pk.life -= dt;
      pk.bob += dt * 4;
      const d2 = dist2(pk.x, pk.y, p.x, p.y);
      if (d2 < magnet * magnet) pk.tarik = true;
      if (pk.tarik) {
        const d = Math.sqrt(d2) || 1;
        const kecepatan = 260 + (1 - Math.min(1, d / magnet)) * 520;
        pk.x += ((p.x - pk.x) / d) * kecepatan * dt;
        pk.y += ((p.y - pk.y) / d) * kecepatan * dt;
      } else {
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.vx *= 0.92;
        pk.vy *= 0.92;
      }
      if (d2 < 26 * 26) {
        pk.ambil = true;
        ambilPickup(pk);
      }
    }
    run.pickups = run.pickups.filter((pk) => !pk.ambil && pk.life > 0);

    // Supply drop
    const sp = run.supply;
    if (sp.active) {
      const c = run.crates.find((x) => x.jenis === "supply");
      if (!c || c.rusak) sp.active = false;
    }
    if (!sp.active) {
      sp.timer -= dt;
      if (sp.timer <= 5 && sp.incoming <= 0) {
        const pos = posisiSah(20, run.walls, run.crates, 240);
        sp.x = pos.x;
        sp.y = pos.y;
        sp.incoming = 5;
        toast("📦 Supply Drop mendarat sebentar lagi!");
        bunyi("wave");
      }
      if (sp.incoming > 0) {
        sp.incoming -= dt;
        if (sp.incoming <= 0) {
          run.crates.push({ x: sp.x, y: sp.y, r: 22, hp: 90, maxHp: 90, jenis: "supply", kedip: 0 });
          sp.active = true;
          sp.timer = 70;
          sp.incoming = 0;
          flash("SUPPLY DROP!", true);
          getar(50);
        }
      }
    }

    // Efek visual
    for (const pt of run.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.vy += (pt.grav || 0) * dt;
      pt.life -= dt;
    }
    run.particles = run.particles.filter((pt) => pt.life > 0);
    for (const t of run.texts) {
      t.y -= 34 * dt;
      t.life -= dt;
    }
    run.texts = run.texts.filter((t) => t.life > 0);
    for (const a of run.arcs) a.life -= dt;
    run.arcs = run.arcs.filter((a) => a.life > 0);

    // Skill
    updateSkill(dt);

    updateWave(dt);
    if (!run.finished && p.hp <= 0) akhirRun();
    updateHud();
  }

  function updateWave(dt) {
    const p = run.player;
    if (run.waveState === "intermission") {
      run.interLeft -= dt;
      if (run.interLeft <= 0) mulaiWave(run.wave + 1);
      return;
    }
    if (run.waveState === "spawning") {
      run.spawnJeda -= dt;
      const hidup = run.zombies.filter((z) => !z.mati).length;
      if (run.spawnQueue.length && run.spawnJeda <= 0 && hidup < MAX_ZOMBIES) {
        const beruntun = run.wave > 12 ? 3 : run.wave > 6 ? 2 : 1;
        for (let i = 0; i < beruntun && run.spawnQueue.length && run.zombies.length < MAX_ZOMBIES; i++) {
          const tipe = run.spawnQueue.pop();
          spawnZombie(tipe);
        }
        run.spawnSisa = run.spawnQueue.length;
        run.spawnJeda = Math.max(0.2, 0.95 - run.wave * 0.045);
      }
      if (!run.spawnQueue.length && !run.zombies.some((z) => !z.mati)) {
        selesaiWave();
      }
      return;
    }
  }

  function selesaiWave() {
    const bonusUang = 22 + run.wave * 9;
    const bonusExp = 16 + run.wave * 6;
    run.player.money += bonusUang;
    run.player.moneyEarned += bonusUang;
    expTambah(bonusExp);
    run.player.hp = Math.min(statTurunan().maxHp, run.player.hp + statTurunan().maxHp * 0.08);
    run.waveState = "intermission";
    run.interLeft = run.wave === 0 ? 2.4 : 4;
    flash(`WAVE ${run.wave} CLEAR!`, true);
    bunyi("wave");
    toast(`Wave ${run.wave} selesai · +💰 ${angka(bonusUang)} · +${angka(bonusExp)} EXP`);
    updateHud(true);
  }

  function halangiLingkungan(e, r) {
    const batas = ARENA_R - 34;
    const d = Math.hypot(e.x, e.y);
    if (d > batas) {
      e.x = (e.x / d) * batas;
      e.y = (e.y / d) * batas;
    }
    for (const wl of run.walls) {
      const minX = wl.x - wl.w / 2 - r;
      const maxX = wl.x + wl.w / 2 + r;
      const minY = wl.y - wl.h / 2 - r;
      const maxY = wl.y + wl.h / 2 + r;
      if (e.x > minX && e.x < maxX && e.y > minY && e.y < maxY) {
        const kiri = e.x - minX;
        const kanan = maxX - e.x;
        const atas = e.y - minY;
        const bawah = maxY - e.y;
        const min = Math.min(kiri, kanan, atas, bawah);
        if (min === kiri) e.x = minX;
        else if (min === kanan) e.x = maxX;
        else if (min === atas) e.y = minY;
        else e.y = maxY;
      }
    }
    for (const c of run.crates) {
      if (c.rusak) continue;
      const min = c.r + r - 6;
      const d2 = dist2(e.x, e.y, c.x, c.y);
      if (d2 > 0 && d2 < min * min) {
        const dd = Math.sqrt(d2);
        e.x = c.x + ((e.x - c.x) / dd) * min;
        e.y = c.y + ((e.y - c.y) / dd) * min;
      }
    }
  }

  function pakaiMedkit() {
    if (!run || run.finished || layar !== "play") return;
    const p = run.player;
    if (p.medkit <= 0) {
      toast("Medkit kosong. Cari peti atau Supply Drop.", 1800);
      bunyi("klik");
      return;
    }
    const max = statTurunan().maxHp;
    if (p.hp >= max - 1) {
      toast("HP masih penuh.", 1400);
      return;
    }
    p.medkit -= 1;
    p.hp = Math.min(max, p.hp + max * 0.55);
    for (let i = 0; i < 14; i++) {
      run.particles.push({
        x: p.x + rand(-16, 16), y: p.y + rand(-16, 16),
        vx: rand(-40, 40), vy: rand(-80, -20), life: 0.5, max: 0.5,
        warna: "#ff9b9b", size: 3,
      });
    }
    tambahTeks(p.x, p.y - 36, "+55% HP", "#ff9b9b");
    bunyi("medkit");
    updateHud(true);
  }

  function bukaShop(asal) {
    if (!run || run.finished) return;
    shopAsal = asal || "pause";
    layar = "shop";
    runPaused = true;
    tampilLayar();
    renderShop();
    updateHud(true);
  }

  function tutupShop() {
    if (shopAsal === "menu") {
      layar = "menu";
      renderMenu();
    } else if (shopAsal === "play" && run && !run.finished) {
      layar = "play";
      runPaused = false;
      updateHud(true);
    } else {
      layar = "pause";
      renderPause();
    }
    tampilLayar();
  }

  function beliSenjata(id) {
    const item = SHOP_WEAPONS.find((x) => x.id === id);
    if (!item || !run) return;
    const p = run.player;
    if (p.weapon === id) return toast("Senjata itu sudah dipakai.", 1400);
    if (p.money < item.harga) return toast("Uang kurang.", 1400);
    p.money -= item.harga;
    gantiSenjata(id);
    toast(`🛒 ${WEAPONS[id].nama} siap dipakai!`);
    renderShop();
  }

  function beliMedkit() {
    if (!run) return;
    const p = run.player;
    if (p.medkit >= 1) return toast("Bawa maksimal 1 Medkit.", 1600);
    if (p.money < SHOP_ITEM.medkit) return toast("Uang kurang.", 1400);
    p.money -= SHOP_ITEM.medkit;
    p.medkit = 1;
    bunyi("medkit");
    toast("🛒 Medkit masuk Tas.");
    renderShop();
  }

  function beliUpgrade(id) {
    if (!run) return;
    const item = SHOP_UPGRADES.find((x) => x.id === id);
    if (!item) return;
    const p = run.player;
    const lv = p.beli[id] || 0;
    if (lv >= item.max) return toast("Upgrade ini sudah maksimal.", 1500);
    const harga = Math.round(item.harga * Math.pow(1.4, lv));
    if (p.money < harga) return toast("Uang kurang.", 1400);
    p.money -= harga;
    p.beli[id] = lv + 1;
    if (id === "maxhp") p.hp = Math.min(statTurunan().maxHp, p.hp + 25);
    tambahTeks(p.x, p.y - 40, item.nama, "#8ee6b4");
    bunyi("level");
    renderShop();
  }

  function akhirRun() {
    if (!run || run.finished) return;
    run.finished = true;
    runPaused = true;
    layar = "over";
    musikStop();
    bunyi("over");
    flash("GAME OVER", false);
    getar([90, 60, 140]);
    tampilLayar();
    renderOver(false);
    const hasil = {
      waktu: run.t,
      kills: run.player.kills,
      wave: Math.max(0, run.wave),
      level: run.player.level,
      exp: run.player.expTotal,
      uang: run.player.moneyEarned,
    };
    if (absenAkun()) {
      simpanRekor(hasil).then((r) => {
        if (layar === "over") renderOver(true, r);
      });
    } else {
      renderOver(true, { ok: false, alasan: "guest", baru: { time: true, kills: true, wave: true, level: true } });
    }
    simpanRingkas();
  }

  function ulangRun() {
    if (!run) return;
    const char = run.char;
    run = buatRun(char);
    layar = "play";
    runPaused = false;
    skillPending = 0;
    tampilLayar();
    updateHud(true);
    flash("WAVE 1", true);
    bunyi("wave");
    musikMulai();
    mulaiWave(1);
  }

  function keMenu() {
    run = null;
    runPaused = true;
    layar = "menu";
    musikStop();
    tampilLayar();
    renderMenu();
  }

  /* ================= INPUT ================= */
  function pindahArahTombol(kode) {
    return ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(kode);
  }

  function bindInput() {
    if (bindInput.siap) return;
    bindInput.siap = true;

    document.addEventListener("keydown", (e) => {
      if (!aktif) return;
      const kode = e.key.toLowerCase();
      if (e.key === "Escape") {
        if (layar === "play") { pauseGame(); e.preventDefault(); }
        else if (layar === "pause") { lanjutMain(); e.preventDefault(); }
        return;
      }
      if (!run || run.finished || layar !== "play") return;
      if (pindahArahTombol(kode)) {
        keys.add(kode);
        if (kode.startsWith("arrow")) e.preventDefault();
        return;
      }
      if (kode === "e") { pakaiMedkit(); e.preventDefault(); }
      if (kode === "b") { bukaShop("play"); e.preventDefault(); }
      if (kode === "q") { bukaShop("play"); e.preventDefault(); }
    });

    document.addEventListener("keyup", (e) => {
      keys.delete(e.key.toLowerCase());
    });

    if (canvas) {
      canvas.addEventListener("pointermove", (e) => {
        if (!aktif || !run) return;
        const rect = canvas.getBoundingClientRect();
        pointer.x = e.clientX - rect.left;
        pointer.y = e.clientY - rect.top;
        if (e.pointerType === "mouse") mouseAim = true;
      });
      canvas.addEventListener("pointerdown", (e) => {
        if (!aktif || !run || layar !== "play") return;
        if (e.pointerType === "touch") {
          mouseAim = false;
          return;
        }
        const rect = canvas.getBoundingClientRect();
        pointer.x = e.clientX - rect.left;
        pointer.y = e.clientY - rect.top;
        pointer.down = true;
        mouseAim = true;
        e.preventDefault();
      });
      const lepas = () => { pointer.down = false; };
      canvas.addEventListener("pointerup", lepas);
      canvas.addEventListener("pointercancel", lepas);
      canvas.addEventListener("pointerleave", lepas);
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    joystickEl = $("sv-joystick");
    knobEl = $("sv-joystick-knob");
    if (joystickEl) {
      const mulai = (e) => {
        if (!run || layar !== "play") return;
        const rect = joystickEl.getBoundingClientRect();
        stick.cx = rect.left + rect.width / 2;
        stick.cy = rect.top + rect.height / 2;
        stick.aktif = true;
        stick.id = e.pointerId;
        joystickEl.setPointerCapture(e.pointerId);
        geser(e);
        e.preventDefault();
      };
      const geser = (e) => {
        if (!stick.aktif || e.pointerId !== stick.id) return;
        const dx = e.clientX - stick.cx;
        const dy = e.clientY - stick.cy;
        const maks = 40;
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

    const tembakBtn = $("sv-shoot");
    if (tembakBtn) {
      const nyala = (e) => { shootHeld = true; tembakBtn.classList.add("is-down"); e.preventDefault(); };
      const mati = () => { shootHeld = false; tembakBtn.classList.remove("is-down"); };
      tembakBtn.addEventListener("pointerdown", nyala);
      tembakBtn.addEventListener("pointerup", mati);
      tembakBtn.addEventListener("pointerleave", mati);
      tembakBtn.addEventListener("pointercancel", mati);
    }

    document.addEventListener("visibilitychange", () => {
      if (!aktif) return;
      if (document.hidden && layar === "play") pauseGame();
    });

    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      document.body.classList.add("sv-touch");
    }
    window.addEventListener("resize", () => { if (aktif) ukurCanvas(); });
  }

  function pauseGame() {
    if (!run || run.finished || layar !== "play") return;
    layar = "pause";
    runPaused = true;
    tampilLayar();
    renderPause();
  }

  /* ================= KAMERA & LAYOUT ================= */
  const cam = { x: 0, y: 0 };
  let dekor = null;
  let charEdit = null;
  let asalLayar = "menu";
  let charTimer = 0;
  let hudSig = "";
  const hudCache = Object.create(null);
  const PREFS_KEY = "kelas73-survival-prefs";

  function ukurCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(280, Math.round(rect.width || 0));
    view.h = Math.max(200, Math.round(rect.height || 0));
    view.dpr = dpr;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    view.scale = Math.max(0.4, Math.min(view.w, view.h) / 940);
    view.ox = view.w / 2;
    view.oy = view.h / 2;
  }

  function muatPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (!raw) return;
      if (typeof raw.sfx === "boolean") SFX_ON = raw.sfx;
      if (typeof raw.musik === "boolean") MUSIK_ON = raw.musik;
      if (typeof raw.getar === "boolean") GETAR_ON = raw.getar;
    } catch (e) { /* ignore */ }
  }

  function simpanPrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sfx: SFX_ON, musik: MUSIK_ON, getar: GETAR_ON }));
    } catch (e) { /* ignore */ }
  }

  /* ================= GAMBAR DUNIA ================= */
  function dekorArena() {
    if (dekor) return dekor;
    dekor = [];
    let s = 987654321;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 190; i++) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * (ARENA_R - 26);
      const r = rnd();
      dekor.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: 3 + rnd() * 9,
        jenis: r < 0.55 ? "rumput" : r < 0.82 ? "batu" : "bunga",
      });
    }
    return dekor;
  }

  function gambarLantai(g) {
    g.fillStyle = "#07110b";
    g.beginPath();
    g.arc(0, 0, ARENA_R + 90, 0, TAU);
    g.fill();

    g.save();
    g.beginPath();
    g.arc(0, 0, ARENA_R, 0, TAU);
    g.clip();

    const petak = 84;
    for (let ix = -9; ix <= 9; ix++) {
      for (let iy = -9; iy <= 9; iy++) {
        const x = ix * petak;
        const y = iy * petak;
        if (Math.hypot(x + petak / 2, y + petak / 2) > ARENA_R + 50) continue;
        g.fillStyle = ((ix + iy) & 1) ? "#132c20" : "#102619";
        g.fillRect(x, y, petak, petak);
      }
    }

    g.strokeStyle = "rgba(0,0,0,0.14)";
    g.lineWidth = 1;
    for (let i = -9; i <= 9; i++) {
      g.beginPath();
      g.moveTo(i * petak, -ARENA_R);
      g.lineTo(i * petak, ARENA_R);
      g.stroke();
      g.beginPath();
      g.moveTo(-ARENA_R, i * petak);
      g.lineTo(ARENA_R, i * petak);
      g.stroke();
    }

    for (const d of dekorArena()) {
      if (d.jenis === "rumput") {
        g.fillStyle = "rgba(94,170,116,0.22)";
        g.fillRect(d.x, d.y, 2, d.r);
        g.fillRect(d.x + 3, d.y + 2, 2, d.r * 0.7);
      } else if (d.jenis === "batu") {
        g.fillStyle = "rgba(110,130,118,0.22)";
        g.fillRect(d.x, d.y, d.r * 0.8, d.r * 0.6);
      } else {
        g.fillStyle = "rgba(150,205,120,0.25)";
        g.fillRect(d.x, d.y, 3, 3);
        g.fillRect(d.x - 3, d.y + 1, 3, 3);
        g.fillRect(d.x + 2, d.y + 2, 3, 3);
      }
    }
    g.restore();

    g.strokeStyle = "#1f3d2c";
    g.lineWidth = 30;
    g.beginPath();
    g.arc(0, 0, ARENA_R + 6, 0, TAU);
    g.stroke();
    g.strokeStyle = "#2d5740";
    g.lineWidth = 13;
    g.beginPath();
    g.arc(0, 0, ARENA_R + 6, 0, TAU);
    g.stroke();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const x = Math.cos(a) * (ARENA_R + 6);
      const y = Math.sin(a) * (ARENA_R + 6);
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = i % 2 ? "#305c43" : "#284d38";
      g.fillRect(-12, -9, 24, 18);
      g.fillStyle = "rgba(255,255,255,0.07)";
      g.fillRect(-12, -9, 24, 4);
      g.restore();
    }
  }

  function gambarDinding(g, w) {
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.fillRect(w.x - w.w / 2 + 4, w.y - w.h / 2 + 7, w.w, w.h);
    g.fillStyle = "#26402f";
    g.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
    g.fillStyle = "#3d6b4d";
    g.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, Math.max(5, w.h * 0.35));
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (const off of [-0.25, 0, 0.25]) {
      g.fillRect(w.x - w.w / 2 + w.w * (0.5 + off) - 1, w.y - w.h / 2 + 3, 2, w.h - 3);
    }
  }

  function gambarPeti(g, c, t) {
    if (c.rusak) {
      g.fillStyle = "rgba(120,90,50,0.35)";
      g.fillRect(c.x - c.r, c.y + c.r * 0.3, c.r * 0.8, 5);
      g.fillRect(c.x + c.r * 0.1, c.y + c.r * 0.5, c.r * 0.7, 4);
      return;
    }
    const s = c.r * 2;
    let body = "#8a6234";
    let lid = "#a97a45";
    let line = "#5f4021";
    if (c.jenis === "peti-loot") { body = "#8c6a2a"; lid = "#d9a83e"; line = "#6b4d16"; }
    if (c.jenis === "supply") { body = "#8a2f2f"; lid = "#d8544a"; line = "#5e1d1d"; }

    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(c.x - c.r + 3, c.y - c.r + 6, s, s);
    g.fillStyle = body;
    g.fillRect(c.x - c.r, c.y - c.r, s, s);
    g.fillStyle = lid;
    g.fillRect(c.x - c.r, c.y - c.r, s, c.r * 0.7);
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.strokeRect(c.x - c.r + 1, c.y - c.r + 1, s - 2, s - 2);
    g.beginPath();
    g.moveTo(c.x - c.r + 2, c.y);
    g.lineTo(c.x + c.r - 2, c.y);
    g.stroke();
    g.fillStyle = c.jenis === "supply" ? "#ffe08a" : "#e2c96f";
    g.fillRect(c.x - 3.5, c.y - 3.5, 7, 7);

    if (c.jenis === "supply") {
      const pulsa = 0.5 + 0.5 * Math.sin(t * 4);
      g.strokeStyle = `rgba(255,207,92,${0.22 + 0.4 * pulsa})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(c.x, c.y, c.r + 12 + pulsa * 8, 0, TAU);
      g.stroke();
      g.fillStyle = `rgba(255,207,92,${0.1 + 0.16 * pulsa})`;
      g.fillRect(c.x - 3, c.y - 140, 6, 118);
    }

    if (c.hp < c.maxHp) {
      const w = s;
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(c.x - w / 2, c.y - c.r - 12, w, 4);
      g.fillStyle = "#ffcf5c";
      g.fillRect(c.x - w / 2, c.y - c.r - 12, w * Math.max(0, c.hp / c.maxHp), 4);
    }
  }

  function gambarPickup(g, pk, t) {
    const y = pk.y + Math.sin(t * 3 + pk.bob) * 2.4;
    g.save();
    g.globalAlpha = pk.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 6)) : 1;
    if (pk.jenis === "koin") {
      g.fillStyle = "rgba(255,207,92,0.18)";
      g.beginPath(); g.arc(pk.x, y, 9, 0, TAU); g.fill();
      g.fillStyle = "#ffcf5c";
      g.beginPath(); g.arc(pk.x, y, 5, 0, TAU); g.fill();
      g.fillStyle = "#a77a12";
      g.fillRect(pk.x - 1.5, y - 2.5, 3, 5);
    } else if (pk.jenis === "exp") {
      g.fillStyle = "#8ee6b4";
      g.beginPath();
      g.moveTo(pk.x, y - 6);
      g.lineTo(pk.x + 5, y);
      g.lineTo(pk.x, y + 6);
      g.lineTo(pk.x - 5, y);
      g.closePath();
      g.fill();
    } else if (pk.jenis === "gem") {
      g.fillStyle = "rgba(199,146,255,0.25)";
      g.beginPath(); g.arc(pk.x, y, 11, 0, TAU); g.fill();
      g.fillStyle = "#c792ff";
      g.beginPath();
      g.moveTo(pk.x, y - 9);
      g.lineTo(pk.x + 7, y);
      g.lineTo(pk.x, y + 9);
      g.lineTo(pk.x - 7, y);
      g.closePath();
      g.fill();
      g.fillStyle = "#f4e6ff";
      g.fillRect(pk.x - 2, y - 3, 4, 4);
    } else if (pk.jenis === "medkit") {
      g.fillStyle = "#eef7f2";
      g.fillRect(pk.x - 7, y - 6, 14, 12);
      g.fillStyle = "#e25555";
      g.fillRect(pk.x - 1.6, y - 4, 3.2, 8);
      g.fillRect(pk.x - 4, y - 1.6, 8, 3.2);
    } else if (pk.jenis === "senjata") {
      g.fillStyle = "#25342c";
      g.fillRect(pk.x - 8, y - 2, 14, 4);
      g.fillRect(pk.x + 4, y - 4, 4, 3);
      g.fillStyle = "#93ab9e";
      g.fillRect(pk.x - 7, y + 2, 5, 2);
    }
    g.restore();
  }

  function gambarZombie(g, z, t) {
    const bob = Math.sin(z.bob) * 1.6;
    g.save();
    g.translate(z.x, z.y);

    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(0, z.r * 0.9, z.r * 0.85, z.r * 0.32, 0, 0, TAU);
    g.fill();

    const dasar = z.flash > 0 ? "#f1fff5" : z.warna;
    const gelap = z.flash > 0 ? "#dcebe1" : z.gelap;

    g.fillStyle = gelap;
    g.fillRect(-z.r * 0.5, z.r * 0.35, z.r * 0.34, z.r * 0.5);
    g.fillRect(z.r * 0.16, z.r * 0.35, z.r * 0.34, z.r * 0.5);

    g.save();
    g.rotate(z.arah || 0);
    g.fillStyle = dasar;
    g.fillRect(z.r * 0.2, -z.r * 0.72, z.r * 0.9, z.r * 0.3);
    g.fillRect(z.r * 0.2, z.r * 0.42, z.r * 0.9, z.r * 0.3);
    g.restore();

    g.fillStyle = dasar;
    g.beginPath();
    g.arc(0, bob * 0.2, z.r * 0.78, 0, TAU);
    g.fill();
    g.fillStyle = gelap;
    g.beginPath();
    g.arc(0, bob * 0.2 + z.r * 0.3, z.r * 0.66, 0, TAU);
    g.fill();

    g.fillStyle = z.flash > 0 ? "#ffffff" : "#cfe8b8";
    g.beginPath();
    g.arc(0, -z.r * 0.62 + bob * 0.35, z.r * 0.55, 0, TAU);
    g.fill();

    g.fillStyle = z.tipe === "ranged" ? "#ff5c5c" : "#1d2a20";
    g.fillRect(-z.r * 0.34, -z.r * 0.74 + bob * 0.35, z.r * 0.2, z.r * 0.2);
    g.fillRect(z.r * 0.14, -z.r * 0.74 + bob * 0.35, z.r * 0.2, z.r * 0.2);

    if (z.tipe === "tank") {
      g.fillStyle = "#5e6b4c";
      g.fillRect(-z.r * 0.8, -z.r * 0.1, z.r * 0.34, z.r * 0.7);
      g.fillRect(z.r * 0.46, -z.r * 0.1, z.r * 0.34, z.r * 0.7);
      g.fillStyle = "rgba(255,255,255,0.14)";
      g.fillRect(-z.r * 0.55, -z.r * 0.5, z.r * 1.1, 3);
    }
    if (z.tipe === "explosive") {
      g.fillStyle = "#3a2c18";
      g.fillRect(z.r * 0.2, -z.r * 0.3, z.r * 0.7, z.r * 0.7);
      g.fillStyle = z.fuse > 0 && Math.sin(t * 30) > 0 ? "#ffe08a" : "#ff6b4a";
      g.fillRect(z.r * 0.7, -z.r * 0.55, 4, 4);
      if (z.fuse > 0) {
        g.strokeStyle = `rgba(255,107,74,${0.3 + 0.5 * Math.abs(Math.sin(t * 16))})`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(0, 0, z.r + 7, 0, TAU);
        g.stroke();
      }
    }
    if (z.tipe === "ranged") {
      g.fillStyle = "rgba(140,220,160,0.55)";
      g.beginPath();
      g.arc(0, z.r * 0.2, z.r * 0.34, 0, TAU);
      g.fill();
    }
    if (z.boss) {
      g.fillStyle = "#ffcf5c";
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * 12 - 6, -z.r * 1.1);
        g.lineTo(i * 12, -z.r * 1.45);
        g.lineTo(i * 12 + 6, -z.r * 1.1);
        g.closePath();
        g.fill();
      }
      const w = z.r * 2.2;
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(-w / 2, -z.r - 26, w, 6);
      g.fillStyle = "#ff6b6b";
      g.fillRect(-w / 2, -z.r - 26, w * Math.max(0, z.hp / z.maxHp), 6);
    }
    g.restore();
  }

  function opsiHex(pool, id) {
    const o = pool.find((x) => x.id === id);
    return (o && o.hex) || pool[0].hex;
  }

  function gambarKarakter(g, x, y, s, ch, arah, jalan, alpha) {
    const warna = opsiHex(CHARS.color, ch.color);
    const kulit = opsiHex(CHARS.skin, ch.skin);
    const bob = Math.sin(jalan || 0) * 1.2;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.globalAlpha = alpha == null ? 1 : alpha;

    g.fillStyle = "rgba(0,0,0,0.32)";
    g.beginPath();
    g.ellipse(0, 16, 14, 5.5, 0, 0, TAU);
    g.fill();

    const langkah = Math.sin(jalan || 0) * 2.4;
    g.fillStyle = "#17261e";
    g.fillRect(-8 + langkah * 0.5, 8, 6, 8);
    g.fillRect(2 - langkah * 0.5, 8, 6, 8);

    g.fillStyle = warna;
    g.fillRect(-11, -6 + bob * 0.3, 22, 16);
    if (ch.outfit === "lab") {
      g.fillStyle = "#eef7f0";
      g.fillRect(-7, -6 + bob * 0.3, 14, 16);
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(-1, -6 + bob * 0.3, 2, 16);
    } else if (ch.outfit === "jaket") {
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(-11, -6 + bob * 0.3, 22, 4);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fillRect(-2, -2 + bob * 0.3, 4, 12);
    } else if (ch.outfit === "rompi") {
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(-11, -1 + bob * 0.3, 22, 7);
    }

    g.fillStyle = kulit;
    g.fillRect(-14, -4 + bob * 0.3, 4, 10);
    g.fillRect(10, -4 + bob * 0.3, 4, 10);
    g.fillRect(-8, -20 + bob * 0.3, 16, 14);

    if (ch.hair === "pendek") {
      g.fillStyle = "#3a2a20";
      g.fillRect(-9, -22 + bob * 0.3, 18, 5);
      g.fillRect(-9, -18 + bob * 0.3, 3, 5);
      g.fillRect(6, -18 + bob * 0.3, 3, 5);
    } else if (ch.hair === "spiky") {
      g.fillStyle = "#4a3226";
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-9 + i * 5, -20 + bob * 0.3);
        g.lineTo(-6 + i * 5, -26 + bob * 0.3);
        g.lineTo(-3 + i * 5, -20 + bob * 0.3);
        g.closePath();
        g.fill();
      }
    } else if (ch.hair === "jabrik") {
      g.fillStyle = "#342821";
      g.fillRect(-9, -22 + bob * 0.3, 18, 4);
      g.fillRect(-10, -24 + bob * 0.3, 3, 4);
      g.fillRect(-2, -26 + bob * 0.3, 3, 5);
      g.fillRect(6, -24 + bob * 0.3, 3, 4);
    }

    const mx = Math.cos(arah || 0) * 1.6;
    const my = Math.sin(arah || 0) * 1.2;
    g.fillStyle = "#17211b";
    if (ch.face === "mata-satu") {
      g.fillRect(-2 + mx, -15 + bob * 0.3 + my, 4, 3);
    } else {
      g.fillRect(-5 + mx, -15 + bob * 0.3 + my, 2, 3);
      g.fillRect(3 + mx, -15 + bob * 0.3 + my, 2, 3);
    }
    if (ch.face === "serius") {
      g.fillStyle = "#17211b";
      g.fillRect(-6 + mx, -18 + bob * 0.3, 4, 1);
      g.fillRect(2 + mx, -18 + bob * 0.3, 4, 1);
    } else if (ch.face === "senyum") {
      g.fillStyle = "#8a5348";
      g.fillRect(-3, -9 + bob * 0.3, 6, 1.5);
    }

    if (ch.acc === "topi") {
      g.fillStyle = warna;
      g.fillRect(-10, -25 + bob * 0.3, 20, 5);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(-12, -21 + bob * 0.3, 24, 2);
    } else if (ch.acc === "kacamata") {
      g.fillStyle = "rgba(20,30,25,0.85)";
      g.fillRect(-7 + mx, -16 + bob * 0.3 + my, 14, 3.5);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(-6 + mx, -15.6 + bob * 0.3 + my, 3, 1);
    } else if (ch.acc === "masker") {
      g.fillStyle = "#dfeee5";
      g.fillRect(-6, -11 + bob * 0.3, 12, 4);
    }

    g.save();
    g.rotate(arah || 0);
    g.fillStyle = "#25342c";
    g.fillRect(11, -2.5, 10, 5);
    g.fillStyle = "#93ab9e";
    g.fillRect(18, -1.5, 4, 3);
    g.restore();

    g.restore();
  }

  function gambarPlayer(g) {
    const p = run.player;
    const t = run.t;
    const flame = lvSkill("flame");
    if (flame) {
      const radius = 78 + flame * 13;
      const pulsa = 0.5 + 0.5 * Math.sin(t * 9);
      g.strokeStyle = `rgba(255,158,100,${0.1 + 0.12 * pulsa})`;
      g.lineWidth = 10;
      g.beginPath();
      g.arc(p.x, p.y, radius, 0, TAU);
      g.stroke();
    }
    if (p.shieldMax > 0 && p.shield > 0) {
      const f = p.shield / p.shieldMax;
      g.strokeStyle = `rgba(99,215,242,${0.18 + 0.55 * f})`;
      g.lineWidth = 2.5 + f * 2;
      g.beginPath();
      g.arc(p.x, p.y, 21, 0, TAU);
      g.stroke();
    }
    const blink = p.invuln > 0 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 30)) : 1;
    gambarKarakter(g, p.x, p.y, 1.06, run.char, p.arah, t * 9, blink);

    const blades = lvSkill("blades");
    if (blades) {
      for (let i = 0; i < blades; i++) {
        const a = (p.arahSkill || 0) * 2.6 + (TAU / blades) * i;
        const bx = p.x + Math.cos(a) * 76;
        const by = p.y + Math.sin(a) * 76;
        g.save();
        g.translate(bx, by);
        g.rotate(a + t * 12);
        g.fillStyle = "rgba(139,233,253,0.22)";
        g.fillRect(-5, -11, 10, 22);
        g.fillStyle = "#8be9fd";
        g.fillRect(-2.5, -9, 5, 18);
        g.restore();
      }
    }
    const orbs = lvSkill("orbs");
    if (orbs) {
      for (let i = 0; i < orbs; i++) {
        const a = -(p.arahSkill || 0) * 1.7 + (TAU / orbs) * i;
        const ox = p.x + Math.cos(a) * 106;
        const oy = p.y + Math.sin(a) * 106;
        g.fillStyle = "rgba(199,146,255,0.22)";
        g.beginPath(); g.arc(ox, oy, 10, 0, TAU); g.fill();
        g.fillStyle = "#c792ff";
        g.beginPath(); g.arc(ox, oy, 5.5, 0, TAU); g.fill();
        g.fillStyle = "#f4e6ff";
        g.beginPath(); g.arc(ox - 1, oy - 1, 2, 0, TAU); g.fill();
      }
    }
  }

  function gambarDrone(g, d) {
    if (!d || d.x == null) return;
    g.save();
    g.translate(d.x, d.y);
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.beginPath();
    g.ellipse(0, 12, 7, 3, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#3c8fa8";
    g.fillRect(-10, -5, 20, 2.5);
    g.fillRect(-10, 2.5, 20, 2.5);
    g.fillStyle = "#7ad7f0";
    g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
    g.fillStyle = "#eafcff";
    g.fillRect(-2, -2, 4, 4);
    g.restore();
  }

  function render() {
    if (!ctx) return;
    const g = ctx;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.fillStyle = "#07100b";
    g.fillRect(0, 0, view.w, view.h);
    if (!run) return;

    const sh = run.shake || 0;
    const ox = view.ox - cam.x * view.scale + (sh ? rand(-sh, sh) : 0);
    const oy = view.oy - cam.y * view.scale + (sh ? rand(-sh, sh) : 0);
    g.save();
    g.translate(ox, oy);
    g.scale(view.scale, view.scale);

    gambarLantai(g);

    for (const w of run.walls) gambarDinding(g, w);
    for (const c of run.crates) {
      if (c.jenis === "hancur") continue;
      gambarPeti(g, c, run.t);
    }
    for (const pk of run.pickups) gambarPickup(g, pk, run.t);

    const sp = run.supply;
    if (sp && sp.incoming > 0) {
      const pulsa = 0.5 + 0.5 * Math.sin(run.t * 8);
      g.strokeStyle = `rgba(255,207,92,${0.35 + 0.4 * pulsa})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(sp.x, sp.y, 34 + pulsa * 12, 0, TAU);
      g.stroke();
      g.beginPath();
      g.arc(sp.x, sp.y, 14, 0, TAU);
      g.stroke();
      g.fillStyle = "#ffcf5c";
      g.font = "700 20px system-ui, -apple-system, sans-serif";
      g.textAlign = "center";
      g.fillText(`${Math.ceil(sp.incoming)}s`, sp.x, sp.y - 48);
      g.textAlign = "left";
    }

    const ent = [];
    for (const c of run.crates) {
      if (c.rusak) continue;
      ent.push({ k: "c", o: c, y: c.y });
    }
    for (const z of run.zombies) {
      if (z.mati) continue;
      ent.push({ k: "z", o: z, y: z.y });
    }
    ent.push({ k: "p", y: run.player.y });
    ent.sort((a, b) => a.y - b.y);
    for (const e of ent) {
      if (e.k === "c") gambarPeti(g, e.o, run.t);
      else if (e.k === "z") gambarZombie(g, e.o, run.t);
      else gambarPlayer(g);
    }

    for (const d of run.drones) gambarDrone(g, d);

    for (const b of run.bullets) {
      g.fillStyle = b.crit ? "rgba(255,224,138,0.3)" : "rgba(255,255,255,0.16)";
      g.beginPath();
      g.arc(b.x, b.y, b.r + 3, 0, TAU);
      g.fill();
      g.fillStyle = b.crit ? "#ffe08a" : b.warna;
      g.beginPath();
      g.arc(b.x, b.y, b.r + 1, 0, TAU);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(b.x, b.y, Math.max(1, b.r * 0.5), 0, TAU);
      g.fill();
    }
    for (const b of run.zbullets) {
      g.fillStyle = "rgba(140,230,150,0.25)";
      g.beginPath(); g.arc(b.x, b.y, b.r + 3, 0, TAU); g.fill();
      g.fillStyle = "#8ce696";
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
      g.fillStyle = "#dfffe2";
      g.beginPath(); g.arc(b.x - 1, b.y - 1, 2, 0, TAU); g.fill();
    }

    for (const a of run.arcs) {
      const t = clamp(a.life / a.max, 0, 1);
      if (a.jenis === "ledakan") {
        g.strokeStyle = `rgba(255,150,90,${t * 0.9})`;
        g.lineWidth = 8 * t + 2;
        g.beginPath();
        g.arc(a.x, a.y, a.r * (1.08 - t * 0.3), 0, TAU);
        g.stroke();
      } else {
        g.strokeStyle = `rgba(199,146,255,${0.35 + 0.6 * t})`;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(a.x1, a.y1);
        const nx = -(a.y2 - a.y1);
        const ny = a.x2 - a.x1;
        const len = Math.hypot(nx, ny) || 1;
        for (let i = 1; i < 3; i++) {
          const f = i / 3;
          const px = a.x1 + (a.x2 - a.x1) * f;
          const py = a.y1 + (a.y2 - a.y1) * f;
          const off = Math.sin((a.x1 + a.y1 + i * 7) * 0.1) * 14;
          g.lineTo(px + (nx / len) * off, py + (ny / len) * off);
        }
        g.lineTo(a.x2, a.y2);
        g.stroke();
        g.fillStyle = "#f4e6ff";
        g.beginPath(); g.arc(a.x2, a.y2, 4, 0, TAU); g.fill();
      }
    }

    for (const pt of run.particles) {
      g.globalAlpha = clamp(pt.life / (pt.max || 1), 0, 1);
      g.fillStyle = pt.warna;
      g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;

    g.font = "700 20px system-ui, -apple-system, sans-serif";
    g.textAlign = "center";
    for (const tx of run.texts) {
      g.globalAlpha = clamp(tx.life / tx.max, 0, 1);
      g.fillStyle = "rgba(8,16,11,0.8)";
      g.fillText(tx.teks, tx.x + 1.5, tx.y + 1.5);
      g.fillStyle = tx.warna;
      g.fillText(tx.teks, tx.x, tx.y);
    }
    g.globalAlpha = 1;
    g.textAlign = "left";

    if (mouseAim && !sentuhAktif()) {
      const pt = pointerWorld();
      g.strokeStyle = "rgba(234,245,238,0.45)";
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(pt.x, pt.y, 11, 0, TAU);
      g.stroke();
      g.beginPath();
      g.moveTo(pt.x - 17, pt.y);
      g.lineTo(pt.x - 5, pt.y);
      g.moveTo(pt.x + 5, pt.y);
      g.lineTo(pt.x + 17, pt.y);
      g.moveTo(pt.x, pt.y - 17);
      g.lineTo(pt.x, pt.y - 5);
      g.moveTo(pt.x, pt.y + 5);
      g.lineTo(pt.x, pt.y + 17);
      g.stroke();
    } else if (run) {
      const p = run.player;
      g.strokeStyle = "rgba(234,245,238,0.16)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(p.x + Math.cos(p.arah) * 26, p.y + Math.sin(p.arah) * 26);
      g.lineTo(p.x + Math.cos(p.arah) * 92, p.y + Math.sin(p.arah) * 92);
      g.stroke();
    }

    g.restore();
  }

  /* ================= HUD ================= */
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

  function renderSkillRail() {
    const rail = $("sv-skill-rail");
    if (!rail) return;
    if (!run) { rail.innerHTML = ""; rail.hidden = true; return; }
    const sk = run.player.skills;
    let html = "";
    for (const s of SKILLS) {
      const lv = sk[s.id] || 0;
      if (!lv) continue;
      html += `<div class="sv-skill-chip ${lv >= s.max ? "is-max" : ""}"><span class="sv-skill-ico">${s.icon}</span><span class="sv-skill-label">${s.nama}</span><span class="sv-skill-lv">${lv}</span></div>`;
    }
    if (rail.dataset.sig !== html) {
      rail.dataset.sig = html;
      rail.innerHTML = html;
    }
    rail.hidden = !html;
  }

  function updateHud(force) {
    if (!run) return;
    const p = run.player;
    const st = statTurunan();
    setTeks("sv-player-name", namaAkun());
    setTeks("sv-level-badge", `Lv ${p.level}`);
    const hpF = st.maxHp > 0 ? p.hp / st.maxHp : 0;
    setBar("sv-hp-bar", hpF);
    const hpBar = $("sv-hp-bar");
    if (hpBar) hpBar.classList.toggle("is-low", hpF <= 0.3);
    setTeks("sv-hp-label", `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(st.maxHp)}`);
    const shBar = $("sv-shield-bar");
    if (shBar) {
      shBar.hidden = st.shieldMax <= 0;
      if (st.shieldMax > 0) setBar("sv-shield-bar", p.shield / st.shieldMax);
    }
    setBar("sv-xp-bar", p.expNeed > 0 ? p.exp / p.expNeed : 0);
    setTeks("sv-xp-label", `${Math.floor(p.exp)} / ${Math.round(p.expNeed)}`);
    setTeks("sv-stat-time", durasi(run.t));
    setTeks("sv-stat-kills", angka(p.kills));
    setTeks("sv-stat-money", `💰 ${angka(p.money)}`);
    const w = WEAPONS[p.weapon] || WEAPONS.pistol;
    setTeks("sv-stat-weapon", p.reload > 0 ? `${w.nama} · reload` : `${w.icon} ${w.nama}`);

    const waveBox = $("sv-wave-box");
    if (waveBox) waveBox.classList.toggle("is-clear", run.waveState === "intermission");
    setTeks("sv-wave-title", `WAVE ${run.wave || 1}`);
    let sub;
    if (run.waveState === "intermission") {
      sub = `Wave berikutnya <b>${Math.max(0, run.interLeft).toFixed(1)}</b> dtk`;
    } else {
      const hidup = run.zombies.filter((z) => !z.mati).length;
      const sisa = run.spawnQueue ? run.spawnQueue.length : 0;
      sub = `Zombie hidup <b>${hidup}</b>${sisa ? ` · sisa spawn ${sisa}` : ""}`;
    }
    const subEl = $("sv-wave-sub");
    if (subEl && hudCache["sv-wave-sub"] !== sub) {
      hudCache["sv-wave-sub"] = sub;
      subEl.innerHTML = sub;
    }

    const sig = SKILLS.map((s) => `${s.id}${p.skills[s.id] || 0}`).join(",");
    if (force || sig !== hudSig) {
      hudSig = sig;
      renderSkillRail();
    }
    const med = $("sv-medkit-btn");
    if (med) {
      med.classList.toggle("is-empty", p.medkit <= 0);
      const badge = $("sv-medkit-badge");
      if (badge) {
        badge.hidden = p.medkit <= 0;
        badge.textContent = String(p.medkit);
      }
    }
    const shopBtn = $("sv-shop-btn");
    if (shopBtn) shopBtn.classList.toggle("is-empty", p.money < 60);
  }

  /* ================= LAYAR ================= */
  function tampilLayar() {
    const screen = $("sv-screen");
    const hud = $("sv-hud");
    if (hud) hud.hidden = !(run && ["play", "pause", "shop", "skills"].includes(layar));
    if (!screen) return;
    if (layar === "play") {
      screen.hidden = true;
      screen.innerHTML = "";
      return;
    }
    screen.hidden = false;
    screen.classList.toggle("is-center", layar === "menu" || layar === "skills" || layar === "over");
    if (layar === "menu") renderMenu();
    else if (layar === "char") renderCharacter();
    else if (layar === "leaderboard") renderLeaderboard();
    else if (layar === "settings") renderSettings();
    else if (layar === "skills") renderSkills();
    else if (layar === "shop") renderShop();
    else if (layar === "pause") renderPause();
    else if (layar === "over") renderOver(false);
  }

  function renderMenu() {
    if (layar !== "menu") return;
    const scr = $("sv-screen");
    if (!scr) return;
    const r = akunDoc || normalAkun(muatLokal() || {});
    const login = !!absenAkun();
    const adaRekor = (r.bestTime || 0) > 0 || (r.bestKills || 0) > 0 || (r.games || 0) > 0;
    const pills = adaRekor
      ? `<span class="sv-best-pill">⏱️ Terlama <b>${durasi(r.bestTime)}</b></span>
         <span class="sv-best-pill">💀 Kill <b>${angka(r.bestKills)}</b></span>
         <span class="sv-best-pill">🌊 <b>Wave ${angka(r.bestWave)}</b></span>
         <span class="sv-best-pill">🎮 <b>${angka(r.games)}</b> main</span>`
      : `<span class="sv-best-pill">Belum ada rekor · main pertamamu!</span>`;
    scr.innerHTML = `
      <div class="sv-panel">
        <div class="sv-menu-top">
          <span class="sv-best-pill">${login ? `Akun <b>${esc(namaAkun())}</b>` : "Mode Guest"}</span>
          <span class="sv-best-pill">Solo · Wave Zombie</span>
        </div>
        <div class="sv-logo">
          <h3>SURVIVAL <span>ARENA</span></h3>
          <p>Bertahan dari gelombang zombie</p>
        </div>
        <div class="sv-menu-best">${pills}</div>
        <div class="sv-menu-actions">
          <button class="sv-btn sv-btn-primary sv-btn-wide" type="button" data-sv-action="play">▶️ Main Sekarang</button>
          <button class="sv-btn" type="button" data-sv-action="char">🧑 Karakter</button>
          <button class="sv-btn" type="button" data-sv-action="leaderboard">🏆 Leaderboard</button>
          <button class="sv-btn" type="button" data-sv-action="settings">⚙️ Pengaturan</button>
        </div>
        <p class="sv-note">${login ? "Rekor terbaik otomatis tersimpan di akun Web Kelas kamu." : "Login dulu biar rekor masuk leaderboard. Guest tetap bisa main."}</p>
        <p class="sv-note">Desktop: WASD / panah · tahan klik untuk tembak · E medkit · B toko · Esc jeda.<br>Sentuh: joystick kiri · tombol tembak kanan.</p>
      </div>`;
  }

  function kartuSkill(s) {
    const lv = lvSkill(s.id);
    const next = Math.min(s.max, lv + 1);
    return `
      <button class="sv-skill-card" type="button" style="--sv-skill:${s.warna}" data-sv-action="pick" data-skill="${s.id}">
        <div class="sv-skill-top">
          <span class="sv-skill-icon">${s.icon}</span>
          <div>
            <h5>${s.nama}</h5>
            <div class="sv-skill-meta">Lv ${lv} → ${next}${next >= s.max ? " · MAX" : ""}</div>
          </div>
        </div>
        <p>${s.desc(next)}</p>
        <div class="sv-skill-gain">${s.gain(next)}</div>
        <div class="sv-skill-pick">Pilih</div>
      </button>`;
  }

  function renderSkills() {
    if (layar !== "skills" || !run) return;
    const scr = $("sv-screen");
    if (!scr) return;
    const opsi = pilihanSkill();
    const isi = opsi.length
      ? opsi.map(kartuSkill).join("")
      : `<button class="sv-skill-card" type="button" style="--sv-skill:#8ee6b4" data-sv-action="pick" data-skill="__heal">
          <div class="sv-skill-top">
            <span class="sv-skill-icon">❤️</span>
            <div><h5>Pulihkan HP</h5><div class="sv-skill-meta">Semua skill sudah MAX</div></div>
          </div>
          <p>Semua 12 skill sudah level maksimal. Pilih ini untuk memulihkan 35% HP.</p>
          <div class="sv-skill-gain">+35% HP</div>
          <div class="sv-skill-pick">Ambil</div>
        </button>`;
    scr.innerHTML = `
      <div class="sv-panel">
        <div class="sv-up-head">
          <h3>NAIK LEVEL!</h3>
          <p>Pilih 1 peningkatan · sisa ${skillPending} pilihan</p>
        </div>
        <div class="sv-up-grid">${isi}</div>
        <p class="sv-note">Setiap skill punya efek nyata di arena. Pilih sesuai gaya mainmu.</p>
      </div>`;
  }

  function renderShop() {
    if (layar !== "shop" || !run) return;
    const scr = $("sv-screen");
    if (!scr) return;
    const p = run.player;
    const senjata = SHOP_WEAPONS.map((it) => {
      const w = WEAPONS[it.id];
      const pakai = p.weapon === it.id;
      const kurang = p.money < it.harga;
      return `<div class="sv-shop-item ${pakai ? "is-owned" : ""}">
        <h5>${w.icon} ${w.nama}</h5>
        <p>${w.desc}</p>
        <div class="sv-shop-buy">
          <span class="sv-price">💰 ${angka(it.harga)}</span>
          <button type="button" data-sv-action="buy-weapon" data-id="${it.id}" ${pakai || kurang ? "disabled" : ""}>${pakai ? "Dipakai" : "Beli"}</button>
        </div>
      </div>`;
    }).join("");
    const upgrade = SHOP_UPGRADES.map((u) => {
      const lv = p.beli[u.id] || 0;
      const maks = lv >= u.max;
      const harga = Math.round(u.harga * Math.pow(1.4, lv));
      return `<div class="sv-shop-item ${lv ? "is-owned" : ""}">
        <h5>${u.icon} ${u.nama}</h5>
        <p>Lv ${lv} / ${u.max} · ${u.desc}</p>
        <div class="sv-shop-buy">
          <span class="sv-price">${maks ? "MAX" : `💰 ${angka(harga)}`}</span>
          <button type="button" data-sv-action="buy-upgrade" data-id="${u.id}" ${maks || p.money < harga ? "disabled" : ""}>${maks ? "MAX" : "Upgrade"}</button>
        </div>
      </div>`;
    }).join("");
    const medkit = `<div class="sv-shop-item ${p.medkit ? "is-owned" : ""}">
      <h5>🩹 Medkit</h5>
      <p>Bawa maksimal 1. Langsung memulihkan 55% HP saat dipakai.</p>
      <div class="sv-shop-buy">
        <span class="sv-price">💰 ${angka(SHOP_ITEM.medkit)}</span>
        <button type="button" data-sv-action="buy-medkit" ${p.medkit || p.money < SHOP_ITEM.medkit ? "disabled" : ""}>${p.medkit ? "Ada 1" : "Beli"}</button>
      </div>
    </div>`;
    scr.innerHTML = `
      <div class="sv-panel">
        <div class="sv-card">
          <div class="sv-card-head">
            <h4>🛒 Toko</h4>
            <button class="sv-back-inline" type="button" data-sv-action="close-shop">← Kembali</button>
          </div>
          <div class="sv-money-line"><span>Uang kamu</span><b>💰 ${angka(p.money)}</b></div>
          <p class="sv-note">Yang dibeli di sini hanya berlaku untuk pertandingan ini.</p>
        </div>
        <div class="sv-card">
          <div class="sv-card-head"><h4>Senjata</h4><small>Peluru tak terbatas</small></div>
          <div class="sv-shop-grid">${senjata}</div>
        </div>
        <div class="sv-card">
          <div class="sv-card-head"><h4>Item & Upgrade</h4><small>Makin kuat tiap pembelian</small></div>
          <div class="sv-shop-grid">${medkit}${upgrade}</div>
        </div>
      </div>`;
  }

  function renderPause() {
    if (layar !== "pause" || !run) return;
    const scr = $("sv-screen");
    if (!scr) return;
    const p = run.player;
    scr.innerHTML = `
      <div class="sv-panel">
        <div class="sv-up-head">
          <h3>JEDA</h3>
          <p>Wave ${run.wave} · ${durasi(run.t)} · ${angka(p.kills)} kill · 💰 ${angka(p.money)}</p>
        </div>
        <div class="sv-pause-actions">
          <button class="sv-btn sv-btn-primary" type="button" data-sv-action="resume">▶️ Lanjut Bertahan</button>
          <button class="sv-btn" type="button" data-sv-action="shop">🛒 Toko · 💰 ${angka(p.money)}</button>
          <button class="sv-btn" type="button" data-sv-action="settings">⚙️ Pengaturan</button>
          <button class="sv-btn sv-btn-danger" type="button" data-sv-action="quit">🚪 Keluar ke Menu</button>
        </div>
        <p class="sv-note">Rekor baru dicatat saat Game Over. Tekan Esc untuk lanjut cepat.</p>
      </div>`;
  }

  function renderOver(disimpan, hasil) {
    if (layar !== "over" || !run) return;
    const scr = $("sv-screen");
    if (!scr) return;
    const p = run.player;
    const baru = (hasil && hasil.baru) || {};
    const daftar = [];
    if (baru.time) daftar.push("Survival Terlama");
    if (baru.kills) daftar.push("Kill Terbanyak");
    if (baru.wave) daftar.push("Wave Tertinggi");
    if (baru.level) daftar.push("Level Tertinggi");
    let catatan;
    if (!absenAkun()) {
      catatan = "Mode Guest: rekor tidak masuk leaderboard. Login dulu supaya tersimpan di akunmu.";
    } else if (!disimpan) {
      catatan = "Menyimpan rekor ke akun...";
    } else if (hasil && hasil.ok) {
      catatan = "Rekor tersimpan di akun Web Kelas kamu.";
    } else {
      catatan = `Rekor belum tersimpan: ${esc((hasil && hasil.alasan) || serverError || "koneksi bermasalah")}`;
    }
    scr.innerHTML = `
      <div class="sv-over-card">
        <h3>GAME OVER</h3>
        <p class="sv-over-sub">Kamu bertahan sampai Wave ${run.wave}</p>
        ${daftar.length ? `<div class="sv-record-badge">🏅 REKOR BARU · ${daftar.join(" · ")}</div>` : ""}
        <div class="sv-over-grid">
          <div class="sv-over-stat"><span>Waktu</span><b>${durasi(run.t)}</b></div>
          <div class="sv-over-stat"><span>Wave</span><b>${angka(run.wave)}</b></div>
          <div class="sv-over-stat"><span>Kill</span><b>${angka(p.kills)}</b></div>
          <div class="sv-over-stat"><span>Level</span><b>${angka(p.level)}</b></div>
          <div class="sv-over-stat"><span>EXP</span><b>${angka(p.expTotal)}</b></div>
          <div class="sv-over-stat"><span>Uang</span><b>💰 ${angka(p.moneyEarned)}</b></div>
        </div>
        <p class="sv-note">${catatan}</p>
        <div class="sv-over-actions">
          <button class="sv-btn sv-btn-primary" type="button" data-sv-action="over-again">🔁 Main Lagi</button>
          <button class="sv-btn" type="button" data-sv-action="over-menu">🏠 Main Menu</button>
        </div>
      </div>`;
  }

  function renderLeaderboard() {
    if (layar !== "leaderboard") return;
    const scr = $("sv-screen");
    if (!scr) return;
    const key = lbTab === "time" ? "bestTime" : "bestKills";
    const list = (lbData || [])
      .filter((r) => Number(r[key]) > 0)
      .sort((a, b) => Number(b[key]) - Number(a[key]))
      .slice(0, 50);
    const baris = list.length
      ? list.map((r, i) => `
        <div class="sv-lb-row ${r.absen === absenAkun() ? "is-me" : ""}">
          <span class="sv-lb-rank">${i + 1}</span>
          <span class="sv-lb-name">${esc(r.name)}<small>Wave ${angka(r.bestWave)} · Lv ${angka(r.bestLevel)}</small></span>
          <span class="sv-lb-val">${lbTab === "time" ? durasi(r.bestTime) : `${angka(r.bestKills)} kill`}</span>
        </div>`).join("")
      : `<div class="sv-lb-empty">${lbLoading ? "Memuat peringkat..." : "Belum ada rekor. Jadilah yang pertama!"}</div>`;
    scr.innerHTML = `
      <div class="sv-panel">
        <div class="sv-menu-top">
          <button class="sv-back-inline" type="button" data-sv-action="back-menu">← Kembali</button>
          <span class="sv-best-pill">Top 50 · per akun</span>
        </div>
        <div class="sv-up-head"><h3>🏆 LEADERBOARD</h3><p>Rekor terbaik tiap akun</p></div>
        <div class="sv-subtabs">
          <button class="sv-subtab ${lbTab === "time" ? "is-active" : ""}" type="button" data-sv-action="lb-time">⏱️ Survival Terlama</button>
          <button class="sv-subtab ${lbTab === "kills" ? "is-active" : ""}" type="button" data-sv-action="lb-kills">💀 Kill Terbanyak</button>
        </div>
        <div class="sv-card"><div class="sv-lb-list">${baris}</div></div>
        <button class="sv-btn" type="button" data-sv-action="lb-refresh">🔄 Muat Ulang</button>
        <p class="sv-note">Rekor dikirim ke server saat Game Over dan divalidasi oleh Firestore Rules.</p>
      </div>`;
  }

  function gambarPreview() {
    const c = $("sv-char-canvas");
    if (!c || !charEdit) return;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "#0e1a13";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(79,213,138,0.10)";
    g.beginPath();
    g.ellipse(128, 210, 74, 22, 0, 0, TAU);
    g.fill();
    gambarKarakter(g, 128, 150, 3.4, charEdit, 0.35, 0, 1);
  }

  function grupOpsi(label, key, pool) {
    return `<div class="sv-opt-group"><span>${label}</span><div class="sv-opt-row">${pool.map((o) => (
      `<button type="button" class="sv-opt ${charEdit[key] === o.id ? "is-active" : ""}" data-sv-char="${key}" data-sv-val="${o.id}">${o.nama}</button>`
    )).join("")}</div></div>`;
  }

  function grupWarna(label, key, pool) {
    return `<div class="sv-opt-group"><span>${label}</span><div class="sv-swatches">${pool.map((o) => (
      `<button type="button" class="sv-swatch ${charEdit[key] === o.id ? "is-active" : ""}" style="background:${o.hex}" data-sv-char="${key}" data-sv-val="${o.id}" aria-label="${o.nama}" title="${o.nama}"></button>`
    )).join("")}</div></div>`;
  }

  function renderCharacter() {
    if (layar !== "char") return;
    const scr = $("sv-screen");
    if (!scr) return;
    if (!charEdit) charEdit = charSah(charChar());
    const login = !!absenAkun();
    scr.innerHTML = `
      <div class="sv-panel">
        <div class="sv-menu-top">
          <button class="sv-back-inline" type="button" data-sv-action="char-back">← Kembali</button>
          <span class="sv-best-pill">Kosmetik · tanpa bonus stat</span>
        </div>
        <div class="sv-card">
          <div class="sv-card-head"><h4>🧑 Karakter</h4><small>${login ? "Tersimpan di akun" : "Tersimpan di perangkat"}</small></div>
          <div class="sv-char-wrap">
            <div class="sv-char-preview">
              <canvas id="sv-char-canvas" width="256" height="256" aria-label="Pratinjau karakter"></canvas>
              <small>Tampilan saja, tidak menambah stat.</small>
            </div>
            <div class="sv-char-opts">
              ${grupOpsi("Rambut", "hair", CHARS.hair)}
              ${grupOpsi("Wajah", "face", CHARS.face)}
              ${grupOpsi("Pakaian", "outfit", CHARS.outfit)}
              ${grupWarna("Warna Pakaian", "color", CHARS.color)}
              ${grupWarna("Warna Kulit", "skin", CHARS.skin)}
              ${grupOpsi("Aksesoris", "acc", CHARS.acc)}
            </div>
          </div>
          <p class="sv-note">Perubahan langsung tersimpan. Semua kosmetik tidak mengubah kekuatan pemain.</p>
        </div>
      </div>`;
    gambarPreview();
  }

  function barisSet(label, sub, key, on) {
    return `<div class="sv-set-row">
      <div>${label}<small>${sub}</small></div>
      <button class="sv-switch ${on ? "is-on" : ""}" type="button" role="switch" aria-checked="${on}" aria-label="${label}" data-sv-toggle="${key}"></button>
    </div>`;
  }

  function renderSettings() {
    if (layar !== "settings") return;
    const scr = $("sv-screen");
    if (!scr) return;
    scr.innerHTML = `
      <div class="sv-panel">
        <div class="sv-menu-top">
          <button class="sv-back-inline" type="button" data-sv-action="settings-back">← Kembali</button>
          <span class="sv-best-pill">${absenAkun() ? `Akun <b>${esc(namaAkun())}</b>` : "Mode Guest"}</span>
        </div>
        <div class="sv-up-head"><h3>⚙️ PENGATURAN</h3><p>Audio dan getaran</p></div>
        <div class="sv-card">
          ${barisSet("Efek Suara", "Tembakan, ledakan, loot", "sfx", SFX_ON)}
          ${barisSet("Musik", "Ketukan latar saat bertahan", "musik", MUSIK_ON)}
          ${barisSet("Getaran", "Hanya di perangkat yang mendukung", "getar", GETAR_ON)}
        </div>
        <p class="sv-note">Desktop: WASD / panah · tahan klik tembak · E medkit · B toko · Esc jeda.<br>Sentuh: joystick kiri · tombol tembak kanan.</p>
        <p class="sv-note">${serverError ? `⚠️ ${esc(serverError)}` : "Rekor dan karakter disimpan lewat akun Web Kelas."}</p>
      </div>`;
  }

  /* ================= AKSI UI ================= */
  function jadwalSimpanChar() {
    clearTimeout(charTimer);
    charTimer = setTimeout(() => {
      if (!charEdit) return;
      const target = charEdit;
      simpanCharServer(target).then((ok) => {
        if (run) run.char = target;
        if (layar === "char") {
          toast(ok
            ? "Karakter tersimpan di akun."
            : (absenAkun() ? "Tersimpan di perangkat. Server belum terhubung." : "Tersimpan di perangkat ini."), 1700);
        }
      });
    }, 500);
  }

  function bukaLeaderboard() {
    layar = "leaderboard";
    tampilLayar();
    muatLeaderboard().then(() => {
      if (layar === "leaderboard") renderLeaderboard();
    });
  }

  function aksiLayar(act, btn) {
    if (!act) return;
    switch (act) {
      case "play":
        bunyi("klik");
        mulaiRun();
        return;
      case "char":
        asalLayar = layar;
        charEdit = charSah(charChar());
        layar = "char";
        tampilLayar();
        break;
      case "char-back":
        layar = "menu";
        tampilLayar();
        break;
      case "leaderboard":
        bukaLeaderboard();
        break;
      case "settings":
        asalLayar = layar;
        layar = "settings";
        tampilLayar();
        break;
      case "settings-back":
        layar = asalLayar === "pause" && run && !run.finished ? "pause" : "menu";
        tampilLayar();
        break;
      case "back-menu":
        keMenu();
        break;
      case "resume":
        lanjutMain();
        return;
      case "shop":
        bukaShop("pause");
        break;
      case "close-shop":
        tutupShop();
        break;
      case "quit":
        if (window.confirm("Keluar ke menu? Rekor run ini tidak akan disimpan.")) keMenu();
        break;
      case "pick":
        pilihSkill(btn.dataset.skill);
        return;
      case "buy-weapon":
        beliSenjata(btn.dataset.id);
        return;
      case "buy-medkit":
        beliMedkit();
        return;
      case "buy-upgrade":
        beliUpgrade(btn.dataset.id);
        return;
      case "over-again":
        ulangRun();
        return;
      case "over-menu":
        keMenu();
        break;
      case "lb-time":
        lbTab = "time";
        renderLeaderboard();
        break;
      case "lb-kills":
        lbTab = "kills";
        renderLeaderboard();
        break;
      case "lb-refresh":
        lbData = null;
        renderLeaderboard();
        muatLeaderboard().then(() => {
          if (layar === "leaderboard") renderLeaderboard();
        });
        break;
      default:
        return;
    }
    bunyi("klik");
  }

  function bindAksi() {
    if (bindAksi.siap) return;
    bindAksi.siap = true;

    const scr = $("sv-screen");
    if (scr) {
      scr.addEventListener("pointerdown", (e) => {
        const kartu = e.target.closest('[data-sv-action="pick"]');
        if (kartu) kartu.dataset.svArm = "1";
      });
      scr.addEventListener("click", (e) => {
        const toggle = e.target.closest("[data-sv-toggle]");
        if (toggle) {
          const key = toggle.dataset.svToggle;
          if (key === "sfx") SFX_ON = !SFX_ON;
          else if (key === "musik") MUSIK_ON = !MUSIK_ON;
          else if (key === "getar") GETAR_ON = !GETAR_ON;
          simpanPrefs();
          if (key === "musik") {
            if (MUSIK_ON) musikMulai();
            else musikStop();
          }
          if (SFX_ON) bunyi("klik");
          renderSettings();
          return;
        }
        const cbtn = e.target.closest("[data-sv-char]");
        if (cbtn) {
          const key = cbtn.dataset.svChar;
          const val = cbtn.dataset.svVal;
          if (!charEdit) charEdit = charSah(charChar());
          charEdit = charSah(Object.assign({}, charEdit, { [key]: val }));
          renderCharacter();
          jadwalSimpanChar();
          bunyi("klik");
          return;
        }
        const btn = e.target.closest("[data-sv-action]");
        if (!btn || btn.disabled) return;
        if (btn.dataset.svAction === "pick" && e.detail !== 0 && btn.dataset.svArm !== "1") return;
        if (btn.dataset.svArm) delete btn.dataset.svArm;
        aksiLayar(btn.dataset.svAction, btn);
      });
    }

    const med = $("sv-medkit-btn");
    if (med) med.addEventListener("click", () => { if (layar === "play") pakaiMedkit(); });
    const shopBtn = $("sv-shop-btn");
    if (shopBtn) shopBtn.addEventListener("click", () => { if (layar === "play") bukaShop("play"); });
    const pauseBtn = $("sv-pause-btn");
    if (pauseBtn) pauseBtn.addEventListener("click", () => { if (layar === "play") pauseGame(); });
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

    if (run && !runPaused && layar === "play" && !run.finished) update(dt);
    if (run) {
      if (run._absen === undefined) run._absen = absenAkun();
      if (!run._cam) {
        cam.x = run.player.x;
        cam.y = run.player.y;
        run._cam = true;
      }
      const f = Math.min(1, dt * 7);
      cam.x += (run.player.x - cam.x) * f;
      cam.y += (run.player.y - cam.y) * f;
    }
    render();
  }

  function buka() {
    if (aktif) return;
    aktif = true;
    canvas = $("sv-canvas");
    ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    ukurCanvas();
    bindInput();
    bindAksi();
    muatPrefs();

    if (run && run._absen !== undefined && run._absen !== absenAkun()) {
      run = null;
    }
    if (run && !run.finished) {
      layar = "pause";
      runPaused = true;
    } else {
      run = null;
      layar = "menu";
      runPaused = true;
    }
    akunDoc = muatLokal();
    serverError = "";
    tampilLayar();
    updateHud(true);
    lastT = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    muatAkun().then(() => {
      if (aktif && layar === "menu") renderMenu();
    });
  }

  function tutup() {
    if (!aktif) return;
    if (run && !run.finished && layar === "play") {
      layar = "pause";
      runPaused = true;
    }
    aktif = false;
    cancelAnimationFrame(raf);
    raf = 0;
    musikStop();
    keys.clear();
    pointer.down = false;
    shootHeld = false;
    stick.aktif = false;
    stick.x = 0;
    stick.y = 0;
    stick.id = null;
    if (knobEl) knobEl.style.transform = "";
    lastT = 0;
    const hud = $("sv-hud");
    if (hud) hud.hidden = true;
  }

  window.survivalBuka = buka;
  window.survivalTutup = tutup;
  window.survivalPause = function () { if (aktif) pauseGame(); };
  window.survivalSedangMain = function () { return aktif && layar === "play"; };
  window.survivalRingkas = function () {
    try {
      const raw = JSON.parse(localStorage.getItem("kelas73-survival-ringkas") || "null");
      if (!raw) return null;
      return {
        absen: Number(raw.absen) || 0,
        bestTime: Number(raw.bestTime) || 0,
        bestKills: Number(raw.bestKills) || 0,
        bestWave: Number(raw.bestWave) || 0,
        games: Number(raw.games) || 0,
      };
    } catch (e) {
      return null;
    }
  };
  window.SurvivalArena = { buka, tutup };
})();
