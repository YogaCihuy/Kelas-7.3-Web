// script.js

// Nomor WA Yoga buat tombol "Lupa Password". Format internasional tanpa + dan tanpa 0 di depan.
// Contoh: nomor 0812-3456-7890 -> "6281234567890"
const NOMOR_WA_YOGA = "6287788191013";
const PESAN_LUPA_PASSWORD = "Yog, gw lupa password";

// File aplikasi Android / iPhone / Windows / Mac dipublish otomatis ke GitHub Releases (tag "app-latest")
// oleh workflow build-apk.yml, build-ios.yml dan build-desktop.yml. Ganti kalau nama repo-nya beda.
const GITHUB_REPO = "yogacihuy/Kelas-7.3-Web";
const RELEASE_BASE = `https://github.com/${GITHUB_REPO}/releases/download/app-latest/`;
const LINK_DOWNLOAD = {
  android: RELEASE_BASE + "Kelas-7.3-Android.apk",
  iphone: RELEASE_BASE + "Kelas-7.3-iPhone.ipa",
  windows: RELEASE_BASE + "Kelas-7.3-Windows.exe",
  mac: RELEASE_BASE + "Kelas-7.3-Mac.dmg",
};

// true kalau web ini lagi dibuka DARI aplikasi (Android/iPhone/Windows/Mac/Home Screen)
function lagiDiAplikasi() {
  return !!(window.kelas73App && window.kelas73App.isApp);
}

// ===== Pola pembagian kelompok =====
const ANCHOR = 29;
const GRP_A = [1, 15, 18];
const GRP_B = [26, 25, 16];

// Pola grup asli 01, 15, 18 — dibikin mirip pola 29/26/25/16 biar terasa natural.
// "semua" = bertiga satu tim, "dua" = berdua + satu pisah, "pisah" = semua terpisah.
const POLA_A = [
  { bobot: 52, jenis: "semua" },
  { bobot: 33, jenis: "dua" },
  { bobot: 15, jenis: "pisah" },
];

// 29 (ANCHOR) otomatis gak boleh setim sama 01, 15, 18 — aturan ini dikunci.
// Daftar di bawah buat nambah orang lain yang juga gak boleh setim sama 01, 15, 18.
// Tingkat: "pasti" = 100% gak boleh setim, "hampir" = 95% gak setim.
// Contoh cara nambah:
//   { absen: 10, tingkat: "pasti" },
//   { absen: 12, tingkat: "hampir" },
const HINDARI_GRP_A = [
  { absen: 17, tingkat: "pasti" },
  { absen: 25, tingkat: "pasti" },
];

const POLA_B = [
  { bobot: 35, jenis: "semua" },
  { bobot: 36, jenis: "dua-dua" },
  { bobot: 15, jenis: "dua-pisah" },
  { bobot: 9, jenis: "tiga" },
  { bobot: 5, jenis: "sendiri" },
];

function acakArray(arr) {
  const hasil = [...arr];
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

function pilihBerbobot(daftar) {
  let r = Math.random() * daftar.reduce((a, d) => a + d.bobot, 0);
  for (const d of daftar) {
    r -= d.bobot;
    if (r < 0) return d;
  }
  return daftar[daftar.length - 1];
}

function susunPola(semua, kapMax = Infinity) {
  const cari = (absen) => semua.find((s) => s.absen === absen);
  const inti = cari(ANCHOR);
  const blok = [];
  const hindar = [];

  const a = GRP_A.map(cari).filter(Boolean);
  if (a.length >= 2) {
    const pilihanA = POLA_A.map((p) => ({
      ...p,
      butuh: p.jenis === "semua" ? a.length : p.jenis === "dua" ? 2 : 1,
    })).filter((p) => p.butuh <= kapMax && (p.jenis !== "dua" || a.length > 2));
    const jenisA = pilihBerbobot(pilihanA.length ? pilihanA : [{ bobot: 1, jenis: "pisah" }]).jenis;
    if (jenisA === "semua") blok.push(a);
    else if (jenisA === "dua") blok.push(acakArray(a).slice(0, 2));
  }
  if (!inti) return { blok, hindar };

  const b = acakArray(GRP_B.map(cari).filter(Boolean));
  const butuh = { semua: 1 + b.length, "dua-dua": 2, "dua-pisah": 2, tiga: 3, sendiri: 1 };
  const muat = POLA_B.filter((p) => butuh[p.jenis] <= kapMax);
  let jenis = b.length < 3 ? "semua" : pilihBerbobot(muat.length ? muat : [{ bobot: 1, jenis: "sendiri" }]).jenis;
  if (butuh[jenis] > kapMax) jenis = "sendiri";
  if (jenis === "semua") {
    blok.push([inti, ...b]);
  } else if (jenis === "dua-dua") {
    blok.push([inti, b[0]], [b[1], b[2]]);
  } else if (jenis === "dua-pisah") {
    blok.push([inti, b[0]]);
    hindar.push(b[1], b[2]);
  } else if (jenis === "tiga") {
    blok.push([inti, b[0], b[1]]);
    hindar.push(b[2]);
  } else {
    blok.push([inti]);
    hindar.push(...b);
  }
  return { blok, hindar };
}

// Cek apakah siswa ini bakal nabrak aturan "jangan setim" kalau masuk tim tertentu
function akanKonflik(absen, anggota, aturan) {
  for (const r of aturan) {
    const diaOrang = r.orang === absen;
    const diaGrup = r.dari.includes(absen);
    if (!diaOrang && !diaGrup) continue;
    const adaOrang = diaOrang || anggota.some((s) => s.absen === r.orang);
    const adaGrup = diaGrup || anggota.some((s) => r.dari.includes(s.absen));
    if (adaOrang && adaGrup) return true;
  }
  return false;
}

function hitungKonflik(tim, aturan) {
  let total = 0;
  tim.forEach((anggota) => {
    aturan.forEach((r) => {
      if (anggota.some((s) => s.absen === r.orang) && anggota.some((s) => r.dari.includes(s.absen))) total++;
    });
  });
  return total;
}

// ===== Settings Picker (disimpan di browser) =====
const KUNCI_SETTINGS_PICKER = "kelas73_picker_settings";
const pickerSettings = { gender: false, absen: [] };

(function muatSettingsPicker() {
  try {
    const raw = JSON.parse(localStorage.getItem(KUNCI_SETTINGS_PICKER) || "null");
    if (raw) {
      pickerSettings.gender = !!raw.gender;
      pickerSettings.absen = Array.isArray(raw.absen) ? raw.absen.map(Number) : [];
    }
  } catch (e) {}
})();

function simpanSettingsPicker() {
  try { localStorage.setItem(KUNCI_SETTINGS_PICKER, JSON.stringify(pickerSettings)); } catch (e) {}
  document.dispatchEvent(new CustomEvent("picker-settings-changed"));
}

// Daftar siswa yang ikut dipilih (yang ditandai tidak masuk dikeluarin)
function getPickerSiswaList() {
  return getLiveSiswaList().filter((s) => !pickerSettings.absen.includes(s.absen));
}

let detailAbsenAktif = null; // absen siswa yang lagi dibuka di modal detail
let currentUser = null;      // objek akun (merged) yang lagi login, atau null kalau Guest
let accountsData = {};       // cache dari koleksi Firestore "accounts", key = absen (string)
let infoBesok = null;        // hasil getInfoBesok() dari schedule.js
let infoOverrideData = {};   // override PR / eskul libur / catatan dari Firestore utk besok
let pollingCache = [];       // cache data polling terbaru buat referensi klik vote/setting

document.addEventListener("DOMContentLoaded", () => {
  setupSoundToggle();
  renderSkeletonSiswa();
  setupAccountsListener();
  setupPageTabs();
  setTimeout(() => {
    // Kalau Firestore kelamaan gak jawab, tetap tampilkan data lokal.
    if (document.querySelector("#grid-siswa .siswa-card-skeleton")) renderGridSiswa();
  }, 1500);
  setupDetailModal();
  setupPickerModal();
  setupAccountUI();
  setupInfoTab();
  setupMedsosTab();
  setupPollingTab();
  setupGamesTab();
  setupTimer();
  setupUpdatesModal();
  setupNotifikasiEskul();
  restoreSession();
});

/* ===================================================
   0. SOUND EFFECTS
=================================================== */
const SoundFX = (() => {
  let ctx = null;
  let enabled = true;

  const saved = localStorage.getItem("kelas73-sound");
  if (saved !== null) enabled = saved === "on";

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, duration = 0.12, type = "sine", gain = 0.16, glideTo = null, delay = 0 }) {
    if (!enabled) return;
    try {
      const audioCtx = getCtx();
      const startAt = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startAt);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, startAt + duration);

      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      osc.connect(gainNode).connect(audioCtx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.02);
    } catch (err) {
      /* diamkan kalau browser blokir audio */
    }
  }

  return {
    isEnabled: () => enabled,
    setEnabled(v) {
      enabled = v;
      localStorage.setItem("kelas73-sound", v ? "on" : "off");
    },
    cardOpen: () => tone({ freq: 480, glideTo: 720, duration: 0.15, type: "sine", gain: 0.14 }),
    modalClose: () => tone({ freq: 420, glideTo: 260, duration: 0.12, type: "sine", gain: 0.1 }),
    tabSwitch: () => tone({ freq: 560, duration: 0.07, type: "triangle", gain: 0.09 }),
    buttonClick: () => tone({ freq: 380, duration: 0.06, type: "triangle", gain: 0.1 }),
    shuffleTick: () => tone({ freq: 320 + Math.random() * 180, duration: 0.04, type: "square", gain: 0.045 }),
    resultReveal: () => {
      tone({ freq: 440, duration: 0.1, type: "sine", gain: 0.15 });
      tone({ freq: 660, duration: 0.18, type: "sine", gain: 0.13, delay: 0.09 });
    },
    teamsReady: () => {
      [440, 550, 660].forEach((f, i) => tone({ freq: f, duration: 0.12, type: "sine", gain: 0.12, delay: i * 0.08 }));
    },
    resetSound: () => tone({ freq: 300, glideTo: 180, duration: 0.16, type: "sine", gain: 0.1 }),
    lockedPick: () => tone({ freq: 220, duration: 0.14, type: "sine", gain: 0.1 }),
    errorSound: () => tone({ freq: 200, duration: 0.14, type: "sawtooth", gain: 0.08 }),
    timerStart: () => {
      tone({ freq: 660, duration: 0.09, type: "sine", gain: 0.13 });
      tone({ freq: 990, duration: 0.12, type: "sine", gain: 0.13, delay: 0.1 });
    },
    timerPause: () => tone({ freq: 460, glideTo: 320, duration: 0.12, type: "triangle", gain: 0.1 }),
    timerTick: () => tone({ freq: 880, duration: 0.05, type: "square", gain: 0.055 }),
    timerFinish: () => {
      [880, 1046, 1318, 1046, 1318].forEach((f, i) => {
        tone({ freq: f, duration: 0.18, type: "square", gain: 0.12, delay: i * 0.2 });
      });
    },
  };
})();

function setupSoundToggle() {
  const btn = document.getElementById("btn-sound-toggle");
  const iconOn = btn.querySelector(".icon-sound-on");
  const iconOff = btn.querySelector(".icon-sound-off");

  function syncIcon() {
    const on = SoundFX.isEnabled();
    btn.setAttribute("aria-pressed", String(!on));
    btn.setAttribute("aria-label", on ? "Matikan suara efek" : "Nyalakan suara efek");
    iconOn.hidden = !on;
    iconOff.hidden = on;
  }

  btn.addEventListener("click", () => {
    SoundFX.setEnabled(!SoundFX.isEnabled());
    syncIcon();
    if (SoundFX.isEnabled()) SoundFX.buttonClick();
  });

  syncIcon();
}

/* ===================================================
   0b. GAME TIMER (tanpa login, tanpa data)
=================================================== */
const timerState = {
  mode: "stopwatch",
  stopwatch: { running: false, elapsed: 0, startedAt: 0 },
  rundown: { running: false, duration: 300000, remaining: 300000, endAt: 0, finished: false },
  raf: 0,
  lastTick: -1,
};

function timerNow() {
  return window.performance && typeof performance.now === "function" ? performance.now() : Date.now();
}

function timerFormat(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const jam = Math.floor(total / 3600);
  const menit = Math.floor((total % 3600) / 60);
  const detik = total % 60;
  const mm = String(menit).padStart(2, "0");
  const ss = String(detik).padStart(2, "0");
  return jam > 0 ? `${jam}:${mm}:${ss}` : `${mm}:${ss}`;
}

function timerCentis(ms) {
  return String(Math.floor((Math.max(0, ms) % 1000) / 10)).padStart(2, "0");
}

function timerLabel(ms) {
  const total = Math.round(ms / 1000);
  if (total >= 3600 && total % 3600 === 0) return `${total / 3600} jam`;
  if (total >= 60 && total % 60 === 0) return `${total / 60} menit`;
  if (total < 60) return `${total} detik`;
  return `${Math.floor(total / 60)} menit ${total % 60} detik`;
}

function timerCurrentMs() {
  const now = timerNow();
  if (timerState.mode === "stopwatch") {
    const sw = timerState.stopwatch;
    return sw.elapsed + (sw.running ? now - sw.startedAt : 0);
  }
  const rd = timerState.rundown;
  return rd.running ? Math.max(0, rd.endAt - now) : rd.remaining;
}

function timerRender() {
  const display = document.getElementById("timer-display");
  const status = document.getElementById("timer-status");
  const ring = document.getElementById("timer-ring");
  const startLabel = document.getElementById("timer-start-label");
  const startBtn = document.getElementById("btn-timer-start");
  const badge = document.getElementById("timer-badge");
  const durPanel = document.getElementById("timer-duration");
  if (!display || !status || !ring || !startLabel || !startBtn || !badge || !durPanel) return;

  const mode = timerState.mode;
  const sw = timerState.stopwatch;
  const rd = timerState.rundown;
  const ms = timerCurrentMs();
  const running = mode === "stopwatch" ? sw.running : rd.running;

  if (mode === "stopwatch") {
    display.innerHTML = `${timerFormat(ms)}<span class="timer-cs">.${timerCentis(ms)}</span>`;
    status.textContent = sw.running
      ? "Stopwatch berjalan…"
      : sw.elapsed > 0
        ? "Stopwatch dijeda. Tekan Lanjut."
        : "Tekan Mulai buat jalanin stopwatch.";
  } else {
    display.textContent = timerFormat(ms);
    if (rd.finished) status.textContent = "Waktu habis!";
    else if (rd.running) status.textContent = `Rundown ${timerLabel(rd.duration)} · sisa waktu`;
    else if (rd.remaining < rd.duration) status.textContent = "Rundown dijeda. Tekan Lanjut atau Reset.";
    else status.textContent = `Rundown ${timerLabel(rd.duration)} siap. Tekan Mulai.`;
  }

  const progres = mode === "rundown"
    ? rd.duration > 0 ? Math.max(0, Math.min(100, (ms / rd.duration) * 100)) : 0
    : 100;
  ring.style.setProperty("--p", progres.toFixed(2));

  display.classList.toggle("is-running", running);
  ring.classList.toggle("is-running", running);
  ring.classList.toggle("is-finished", mode === "rundown" && rd.finished);
  ring.classList.toggle("is-hurry", mode === "rundown" && running && ms <= 5000);

  durPanel.hidden = mode !== "rundown";
  document.querySelectorAll("[data-timer-mode]").forEach((btn) => {
    const aktif = btn.dataset.timerMode === mode;
    btn.classList.toggle("is-active", aktif);
    btn.setAttribute("aria-selected", String(aktif));
  });
  badge.textContent = mode === "stopwatch" ? "⏱️ Stopwatch" : "⏳ Rundown";

  let label = "Mulai";
  if (running) label = "Jeda";
  else if (mode === "stopwatch" ? sw.elapsed > 0 : (rd.remaining < rd.duration && rd.remaining > 0)) label = "Lanjut";
  startLabel.textContent = label;
  startBtn.querySelector(".timer-btn-icon").textContent = running ? "❚❚" : "▶";
  startBtn.classList.toggle("is-running", running);
}

function timerAnimasiMulai() {
  const ring = document.getElementById("timer-ring");
  if (!ring) return;
  ring.classList.remove("is-start");
  void ring.offsetWidth;
  ring.classList.add("is-start");
}

function timerSyncPreset() {
  document.querySelectorAll("[data-timer-preset]").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.timerPreset) === timerState.rundown.duration);
  });
}

function timerSetDuration(ms, diam) {
  const nilai = Math.max(1000, Math.min(3 * 3600 * 1000, Math.round(Number(ms) || 1000)));
  timerHentikanLoop();
  const rd = timerState.rundown;
  rd.duration = nilai;
  rd.remaining = nilai;
  rd.running = false;
  rd.finished = false;
  timerState.lastTick = -1;

  const menit = document.getElementById("timer-menit");
  const detik = document.getElementById("timer-detik");
  if (menit) menit.value = Math.floor(nilai / 60000);
  if (detik) detik.value = Math.floor((nilai % 60000) / 1000);
  timerSyncPreset();
  if (!diam) SoundFX.buttonClick();
  timerRender();
}

function timerMulai() {
  const mode = timerState.mode;
  const now = timerNow();
  if (mode === "stopwatch") {
    const sw = timerState.stopwatch;
    if (sw.running) return;
    sw.startedAt = now;
    sw.running = true;
  } else {
    const rd = timerState.rundown;
    if (rd.running) return;
    if (rd.finished || rd.remaining <= 0) {
      rd.remaining = rd.duration;
      rd.finished = false;
    }
    rd.endAt = now + rd.remaining;
    rd.running = true;
    timerState.lastTick = -1;
  }
  SoundFX.timerStart();
  timerAnimasiMulai();
  timerRender();
  timerJalankanLoop();
}

function timerJeda() {
  const now = timerNow();
  if (timerState.mode === "stopwatch") {
    const sw = timerState.stopwatch;
    if (!sw.running) return;
    sw.elapsed += now - sw.startedAt;
    sw.running = false;
  } else {
    const rd = timerState.rundown;
    if (!rd.running) return;
    rd.remaining = Math.max(0, rd.endAt - now);
    rd.running = false;
    if (rd.remaining <= 0) {
      timerSelesai();
      return;
    }
  }
  timerHentikanLoop();
  SoundFX.timerPause();
  timerRender();
}

function timerReset() {
  timerHentikanLoop();
  if (timerState.mode === "stopwatch") {
    timerState.stopwatch.elapsed = 0;
    timerState.stopwatch.running = false;
  } else {
    const rd = timerState.rundown;
    rd.remaining = rd.duration;
    rd.running = false;
    rd.finished = false;
    timerState.lastTick = -1;
  }
  SoundFX.resetSound();
  timerRender();
}

function timerSelesai() {
  const rd = timerState.rundown;
  rd.running = false;
  rd.remaining = 0;
  rd.finished = true;
  timerHentikanLoop();
  timerRender();
  SoundFX.timerFinish();
  try {
    if (navigator.vibrate) navigator.vibrate([220, 120, 220, 120, 420]);
  } catch (e) {}
}

function timerBunyiDetik(sisa) {
  const detik = Math.ceil(sisa / 1000);
  if (detik > 5 || detik < 1 || detik === timerState.lastTick) return;
  timerState.lastTick = detik;
  SoundFX.timerTick();
  const ring = document.getElementById("timer-ring");
  if (ring) {
    ring.classList.remove("is-tick");
    void ring.offsetWidth;
    ring.classList.add("is-tick");
  }
}

function timerGulir() {
  timerState.raf = 0;
  const aktif = timerState.mode === "stopwatch"
    ? timerState.stopwatch.running
    : timerState.rundown.running;
  if (!aktif) return;
  if (timerState.mode === "rundown") {
    const sisa = timerCurrentMs();
    if (sisa <= 0) {
      timerSelesai();
      return;
    }
    timerBunyiDetik(sisa);
  }
  timerRender();
  timerState.raf = requestAnimationFrame(timerGulir);
}

function timerJalankanLoop() {
  if (!timerState.raf) timerState.raf = requestAnimationFrame(timerGulir);
}

function timerHentikanLoop() {
  if (timerState.raf) cancelAnimationFrame(timerState.raf);
  timerState.raf = 0;
}

function timerPilihMode(mode) {
  if (mode !== "stopwatch" && mode !== "rundown") return;
  if (timerState.mode === mode) return;
  if (timerState.mode === "stopwatch" && timerState.stopwatch.running) timerJeda();
  else if (timerState.mode === "rundown" && timerState.rundown.running) timerJeda();
  timerState.mode = mode;
  SoundFX.tabSwitch();
  timerRender();
}

function setupTimer() {
  const shell = document.getElementById("timer-shell");
  if (!shell) return;

  shell.addEventListener("click", (e) => {
    const modeBtn = e.target.closest("[data-timer-mode]");
    if (modeBtn) {
      timerPilihMode(modeBtn.dataset.timerMode);
      return;
    }
    const preset = e.target.closest("[data-timer-preset]");
    if (preset) timerSetDuration(Number(preset.dataset.timerPreset));
  });

  document.getElementById("btn-timer-start").addEventListener("click", () => {
    const aktif = timerState.mode === "stopwatch"
      ? timerState.stopwatch.running
      : timerState.rundown.running;
    if (aktif) timerJeda();
    else timerMulai();
  });

  document.getElementById("btn-timer-reset").addEventListener("click", timerReset);

  document.getElementById("btn-timer-custom").addEventListener("click", () => {
    const menit = Number(document.getElementById("timer-menit").value) || 0;
    const detik = Number(document.getElementById("timer-detik").value) || 0;
    timerSetDuration(menit * 60000 + detik * 1000);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    timerRender();
    const aktif = timerState.mode === "stopwatch"
      ? timerState.stopwatch.running
      : timerState.rundown.running;
    if (aktif) timerJalankanLoop();
  });

  timerSetDuration(timerState.rundown.duration, true);
  timerRender();
}

/* ===================================================
   1. AKUN & DATA SISWA (Firestore)
=================================================== */
function getDefaultAccount(siswa) {
  return {
    absen: siswa.absen,
    namaLengkap: siswa.namaLengkap,
    namaPanggilan: siswa.namaPanggilan,
    citaCita: siswa.citaCita,
    laguFavorit: siswa.laguFavorit,
    bio: "",
    username: siswa.namaPanggilan,
    password: `73${siswa.absen}`,
    role: siswa.absen === 29 ? "owner" : "member",
    eskulWajib: "",
    eskulPilihan: [],
    notifEskul: false,
    ultah: "",   // format YYYY-MM-DD
  };
}

function getMergedAccount(absen) {
  const siswa = dataSiswa.find((s) => s.absen === Number(absen));
  if (!siswa) return null;
  const def = getDefaultAccount(siswa);
  const override = accountsData[String(absen)];
  if (!override) return def;
  return {
    ...def,
    ...override,
    absen: siswa.absen,
    namaLengkap: siswa.namaLengkap, // nama lengkap selalu terkunci dari data.js
    bio: override.bio !== undefined ? override.bio : "",
  };
}

function getLiveSiswaList() {
  return dataSiswa.map((s) => ({ ...s, namaPanggilan: getMergedAccount(s.absen).namaPanggilan }));
}

function setupAccountsListener() {
  db.collection("accounts").onSnapshot(
    (snap) => {
      const next = {};
      snap.forEach((doc) => {
        next[doc.id] = doc.data();
      });
      accountsData = next;
      renderGridSiswa();
      if (window.loadingApk) window.loadingApk.dataSiap();
      if (currentUser) {
        const refreshed = getMergedAccount(currentUser.absen);
        if (refreshed) {
          currentUser = refreshed;
          updateAccountUI();
        }
      }
    },
    (err) => {
      console.error("Gagal konek ke Firestore:", err);
      renderGridSiswa();
      if (window.loadingApk) window.loadingApk.dataSiap(); // tetap buka app walau data gagal dimuat
    }
  );
}

function restoreSession() {
  const saved = localStorage.getItem("kelas73-session");
  if (saved) {
    const merged = getMergedAccount(Number(saved));
    if (merged) currentUser = merged;
  }
  updateAccountUI();
}

function loginUser(absen) {
  currentUser = getMergedAccount(absen);
  localStorage.setItem("kelas73-session", String(absen));
  updateAccountUI();
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem("kelas73-session");
  updateAccountUI();
}

/* ===================================================
   2. RENDER GRID SISWA
=================================================== */
function renderGridSiswa() {
  const grid = document.getElementById("grid-siswa");
  if (!grid) return;
  grid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  dataSiswa.forEach((siswa, i) => {
    const merged = getMergedAccount(siswa.absen);
    const ultah = isUltahHariIni(merged.ultah);
    const card = document.createElement("button");
    card.className = "siswa-card" + (ultah ? " siswa-card-ultah" : "");
    card.type = "button";
    card.dataset.absen = siswa.absen;
    card.style.setProperty("--i", i);
    card.innerHTML = `
      ${ultah ? `<span class="cake-deco cake-1">🎂</span><span class="cake-deco cake-2">🧁</span><span class="cake-deco cake-3">🍰</span>` : ""}
      <span class="siswa-absen">${String(siswa.absen).padStart(2, "0")}</span>
      <div class="siswa-nama">${merged.namaPanggilan}</div>
    `;
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
  applyBirthdayTheme();
}

function renderSkeletonSiswa() {
  const grid = document.getElementById("grid-siswa");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 8 }, () => `
    <div class="siswa-card siswa-card-skeleton" aria-hidden="true">
      <span class="skeleton skeleton-absen"></span>
      <span class="skeleton skeleton-nama"></span>
    </div>`).join("");
}

function isUltahHariIni(ultah) {
  if (!ultah) return false;
  const [, m, d] = ultah.split("-").map(Number);
  const now = new Date();
  return m === now.getMonth() + 1 && d === now.getDate();
}

function formatUltah(ultah) {
  if (!ultah) return "Belum diatur";
  const [y, m, d] = ultah.split("-").map(Number);
  const teks = new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long" });
  return isUltahHariIni(ultah) ? `${teks} 🎂 (hari ini!)` : teks;
}

function applyBirthdayTheme() {
  const namaList = dataSiswa
    .map((s) => getMergedAccount(s.absen))
    .filter((m) => isUltahHariIni(m.ultah))
    .map((m) => m.namaPanggilan);
  const on = namaList.length > 0;

  document.body.classList.toggle("birthday-theme", on);

  const banner = document.getElementById("birthday-banner");
  const title = document.querySelector(".hero-title");
  if (title && !title.dataset.asli) title.dataset.asli = title.textContent;

  if (on) {
    banner.textContent = `🎉 Happy Birthday ${namaList.join(" & ")}! 🎂`;
    banner.hidden = false;
    if (title) title.textContent = "Happy Birthday!";
  } else {
    banner.hidden = true;
    if (title && title.dataset.asli) title.textContent = title.dataset.asli;
  }
}

/* ===================================================
   3. MODAL DETAIL SISWA
=================================================== */
function setupDetailModal() {
  const grid = document.getElementById("grid-siswa");
  const modal = document.getElementById("modal-detail");
  const modalBox = modal.querySelector(".modal-box");

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".siswa-card");
    if (!card) return;

    const absen = Number(card.dataset.absen);
    const siswa = dataSiswa.find((s) => s.absen === absen);
    if (!siswa) return;
    const merged = getMergedAccount(absen);
    detailAbsenAktif = absen;

    document.getElementById("detail-absen").textContent = String(siswa.absen).padStart(2, "0");
    document.getElementById("detail-nama").textContent = siswa.namaLengkap;
    document.getElementById("detail-panggilan").textContent = merged.namaPanggilan;
    document.getElementById("detail-cita").textContent = merged.citaCita;
    document.getElementById("detail-lagu").textContent = merged.laguFavorit;
    document.getElementById("detail-ultah").textContent = formatUltah(merged.ultah);
    modalBox.classList.toggle("modal-ultah", isUltahHariIni(merged.ultah));

    const bioEl = document.getElementById("detail-bio");
    const bioToggle = document.getElementById("btn-bio-toggle");
    bioEl.textContent = merged.bio && merged.bio.trim() ? merged.bio : "belom ada Bio";
    bioEl.classList.remove("expanded");
    bioEl.style.maxHeight = "";
    bioToggle.textContent = "Baca selengkapnya";
    bioToggle.hidden = true;
    requestAnimationFrame(() => {
      if (bioEl.scrollHeight > bioEl.clientHeight + 2) bioToggle.hidden = false;
    });

    document.getElementById("btn-edit-this-profil").hidden = !(currentUser && currentUser.absen === absen);

    openModal(modal);
    playSproutAnimation(modalBox, card);
    SoundFX.cardOpen();
  });

  document.getElementById("btn-bio-toggle").addEventListener("click", () => {
    const bioEl = document.getElementById("detail-bio");
    const btn = document.getElementById("btn-bio-toggle");
    const expand = !bioEl.classList.contains("expanded");
    bioEl.classList.toggle("expanded", expand);
    bioEl.style.maxHeight = expand ? `${bioEl.scrollHeight}px` : ""; // animasi buka/tutup sesuai tinggi bio asli
    btn.textContent = expand ? "Sembunyikan" : "Baca selengkapnya";
  });

  document.getElementById("btn-edit-this-profil").addEventListener("click", () => {
    if (!currentUser) return;
    closeModal(modal);
    openEditProfilModal(currentUser.absen);
  });

  document.getElementById("btn-open-album").addEventListener("click", () => {
    if (detailAbsenAktif) bukaAlbum(detailAbsenAktif);
  });

  setupModalDismiss(modal);
}

function playSproutAnimation(modalBox, originEl) {
  modalBox.classList.remove("sprout");

  const originRect = originEl.getBoundingClientRect();
  const clickX = originRect.left + originRect.width / 2;
  const clickY = originRect.top + originRect.height / 2;

  void modalBox.offsetWidth;
  const boxRect = modalBox.getBoundingClientRect();

  const ox = clickX - boxRect.left;
  const oy = clickY - boxRect.top;
  modalBox.style.setProperty("--ox", `${ox}px`);
  modalBox.style.setProperty("--oy", `${oy}px`);

  void modalBox.offsetWidth;
  modalBox.classList.add("sprout");
}

/* ===================================================
   4. GENERIC MODAL HELPERS
=================================================== */
function openModal(modal) {
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = "";
  SoundFX.modalClose();
}

function setupModalDismiss(modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.hasAttribute("data-close-modal")) {
      closeModal(modal);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal(modal);
  });
}

/* ===================================================
   5. PICKER MODAL (Person & Teams)
=================================================== */
function setupPickerModal() {
  const modal = document.getElementById("modal-picker");
  const openBtn = document.getElementById("btn-open-picker");

  openBtn.addEventListener("click", () => {
    openModal(modal);
    SoundFX.buttonClick();
  });
  setupModalDismiss(modal);

  setupPickerSettings(modal);
  setupPickerTabs();
  const personPicker = setupPersonPicker();
  const teamsPicker = setupTeamsPicker();

  document.getElementById("btn-reset").addEventListener("click", () => {
    personPicker.reset();
    teamsPicker.reset();
    SoundFX.resetSound();
  });
}

function setupPickerSettings(pickerModal) {
  const modal = document.getElementById("modal-picker-settings");
  const toggleGender = document.getElementById("set-gender");
  const daftar = document.getElementById("absent-list");
  const hitung = document.getElementById("absent-count");

  const tombolSettings = document.getElementById("btn-picker-settings");
  function putarGear() {
    tombolSettings.classList.remove("spin");
    void tombolSettings.offsetWidth; // reset biar animasinya bisa diputer ulang
    tombolSettings.classList.add("spin");
  }
  tombolSettings.addEventListener("animationend", () => tombolSettings.classList.remove("spin"));

  function buka() {
    putarGear();
    toggleGender.checked = pickerSettings.gender;
    renderDaftar();
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    SoundFX.buttonClick();
  }
  function tutup() {
    modal.hidden = true;
    document.body.style.overflow = pickerModal.hidden ? "" : "hidden";
    SoundFX.modalClose();
  }

  function renderDaftar() {
    daftar.innerHTML = getLiveSiswaList()
      .map(
        (s) => `
        <label class="absent-item">
          <input type="checkbox" value="${s.absen}" ${pickerSettings.absen.includes(s.absen) ? "checked" : ""}>
          <span class="absent-check"></span>
          <span class="absent-no">${String(s.absen).padStart(2, "0")}</span>
          <span class="absent-name">${s.namaPanggilan}</span>
        </label>`
      )
      .join("");
    hitung.textContent = pickerSettings.absen.length ? `${pickerSettings.absen.length} tidak masuk` : "";
  }

  document.getElementById("btn-picker-settings").addEventListener("click", buka);

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.hasAttribute("data-close-modal")) tutup();
  });
  // Escape cuma nutup Settings (jendela Picker di belakangnya tetap kebuka)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) {
      e.stopPropagation();
      tutup();
    }
  }, true);

  toggleGender.addEventListener("change", () => {
    pickerSettings.gender = toggleGender.checked;
    simpanSettingsPicker();
    SoundFX.buttonClick();
  });

  daftar.addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    const absen = Number(e.target.value);
    pickerSettings.absen = e.target.checked
      ? [...new Set([...pickerSettings.absen, absen])]
      : pickerSettings.absen.filter((a) => a !== absen);
    hitung.textContent = pickerSettings.absen.length ? `${pickerSettings.absen.length} tidak masuk` : "";
    simpanSettingsPicker();
  });

  document.getElementById("btn-absent-clear").addEventListener("click", () => {
    pickerSettings.absen = [];
    renderDaftar();
    simpanSettingsPicker();
  });
}

function setupPickerTabs() {
  const tabBtns = document.querySelectorAll("#modal-picker .tab-btn");
  const panels = document.querySelectorAll("#modal-picker .tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      SoundFX.tabSwitch();

      const target = btn.dataset.tab;
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== target;
      });
    });
  });
}

/* ---- Mode 1: Random Person Picker ---- */
function setupPersonPicker() {
  const resultBox = document.getElementById("person-result");
  const remainingLabel = document.getElementById("person-remaining");
  const pickBtn = document.getElementById("btn-pick");
  const nextBtn = document.getElementById("btn-next");

  let sudahTerpilih = [];
  const isSisa = () => getPickerSiswaList().filter((s) => !sudahTerpilih.includes(s.absen));

  function updateRemainingLabel() {
    remainingLabel.textContent = isSisa().length;
  }

  function showResult(siswa) {
    resultBox.innerHTML = `
      <div class="person-name">
        ${siswa.namaPanggilan}
        <span class="person-sub">Absen ${String(siswa.absen).padStart(2, "0")} · ${siswa.namaLengkap}</span>
      </div>
    `;
  }

  function shuffleAndPick(pool, onDone) {
    if (pool.length === 0) {
      resultBox.innerHTML = `<span class="person-placeholder">Semua siswa sudah terpilih. Tekan Reset.</span>`;
      nextBtn.disabled = true;
      pickBtn.disabled = true;
      SoundFX.lockedPick();
      return;
    }

    pickBtn.disabled = true;
    nextBtn.disabled = true;
    resultBox.classList.add("shuffling");

    let ticks = 0;
    const maxTicks = 14;
    const interval = setInterval(() => {
      const acakSementara = pool[Math.floor(Math.random() * pool.length)];
      resultBox.innerHTML = `<div class="person-name">${acakSementara.namaPanggilan}</div>`;
      SoundFX.shuffleTick();
      ticks++;

      if (ticks >= maxTicks) {
        clearInterval(interval);
        resultBox.classList.remove("shuffling");
        const terpilih = pool[Math.floor(Math.random() * pool.length)];
        showResult(terpilih);
        SoundFX.resultReveal();
        onDone(terpilih);
      }
    }, 70);
  }

  pickBtn.addEventListener("click", () => {
    shuffleAndPick(getPickerSiswaList(), (terpilih) => {
      sudahTerpilih = [terpilih.absen];
      updateRemainingLabel();
      pickBtn.disabled = false;
      nextBtn.disabled = isSisa().length === 0;
    });
  });

  nextBtn.addEventListener("click", () => {
    shuffleAndPick(isSisa(), (terpilih) => {
      sudahTerpilih.push(terpilih.absen);
      updateRemainingLabel();
      pickBtn.disabled = false;
      nextBtn.disabled = isSisa().length === 0;
    });
  });

  function reset() {
    sudahTerpilih = [];
    updateRemainingLabel();
    resultBox.classList.remove("shuffling");
    resultBox.innerHTML = `<span class="person-placeholder">Tekan "Pick Randomly" untuk mulai</span>`;
    pickBtn.disabled = false;
    nextBtn.disabled = true;
  }

  document.addEventListener("picker-settings-changed", updateRemainingLabel);

  reset();
  return { reset };
}

/* ---- Mode 2: Teams Picker ---- */
function setupTeamsPicker() {
  const sizeSelect = document.getElementById("teamSize");
  const makeBtn = document.getElementById("btn-make-teams");
  const resultBox = document.getElementById("teams-result");

  for (let n = 2; n <= 8; n++) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = `${n} orang / tim`;
    if (n === 4) opt.selected = true;
    sizeSelect.appendChild(opt);
  }

  // Satu kali percobaan pembagian tim
  function susunSekali(semua, ukuran, jumlahTim) {
    const tim = Array.from({ length: jumlahTim }, () => []);

    const dasar = Math.floor(semua.length / jumlahTim);
    const lebih = semua.length % jumlahTim;
    const kapasitas = acakArray(Array.from({ length: jumlahTim }, (_, i) => dasar + (i < lebih ? 1 : 0)));

    // Pola kelompok harus muat di ukuran tim, supaya semua tim tetap sama besar
    const kapUrut = [...kapasitas].sort((a, b) => b - a);
    let pola = null;
    for (let k = 0; k < 50 && !pola; k++) {
      const p = susunPola(semua, kapUrut[0]);
      const urut = p.blok.map((g) => g.length).sort((a, b) => b - a);
      if (urut.every((n, i) => i < kapUrut.length && n <= kapUrut[i])) pola = p;
    }
    if (!pola) pola = susunPola(semua, kapUrut[kapUrut.length - 1]);
    const { blok: grup, hindar } = pola;
    const aturan = [
      // 29 selalu dijauhkan dari 01, 15, 18.
      { orang: ANCHOR, dari: [...GRP_A], keras: true },
      ...hindar.map((s) => ({ orang: s.absen, dari: [ANCHOR], keras: true })),
      ...HINDARI_GRP_A.map((h) => ({
        orang: Number(h.absen),
        dari: [...GRP_A],
        keras: h.tingkat !== "hampir",
        aktif: h.tingkat === "hampir" ? Math.random() < 0.95 : true,
      })).filter((r) => r.aktif && !GRP_A.includes(r.orang) && r.orang !== ANCHOR),
    ];
    grup.sort((a, b) => b.length - a.length);
    const sudahDiGrup = new Set();
    grup.forEach((g) => g.forEach((s) => sudahDiGrup.add(s.absen)));

    const urutanTim = acakArray([...Array(jumlahTim).keys()]).sort((a, b) => kapasitas[b] - kapasitas[a]);
    const timGrup = new Set();
    grup.forEach((g, i) => {
      const t = urutanTim[i % jumlahTim];
      g.forEach((s) => tim[t].push(s));
      timGrup.add(t);
    });

    for (let t = 0; t < jumlahTim; t++) kapasitas[t] = Math.max(kapasitas[t], tim[t].length);
    let kelebihan = kapasitas.reduce((a, b) => a + b, 0) - semua.length;
    while (kelebihan > 0) {
      let terlega = -1;
      const kandidat = [];
      for (let t = 0; t < jumlahTim; t++) {
        if (timGrup.has(t)) continue;
        const lega = kapasitas[t] - tim[t].length;
        if (lega > terlega) { terlega = lega; kandidat.length = 0; }
        if (lega === terlega) kandidat.push(t);
      }
      if (terlega <= 0 || kandidat.length === 0) break;
      kapasitas[kandidat[Math.floor(Math.random() * kandidat.length)]]--;
      kelebihan--;
    }

    const sisa = acakArray(semua.filter((s) => !sudahDiGrup.has(s.absen)));
    // Yang punya aturan "jangan setim" ditaruh duluan biar gampang cari tim yang aman.
    const prioritas = new Set([...aturan.map((r) => r.orang), ...GRP_A]);
    sisa.sort((a, b) => (prioritas.has(b.absen) ? 1 : 0) - (prioritas.has(a.absen) ? 1 : 0));

    const slotTersedia = [];
    kapasitas.forEach((k, t) => { for (let i = tim[t].length; i < k; i++) slotTersedia.push(t); });

    sisa.forEach((siswa) => {
      if (!slotTersedia.length) {
        const target = tim.map((a, t) => t).sort((a, b) => tim[a].length - tim[b].length)[0];
        tim[target].push(siswa);
        return;
      }
      const aman = slotTersedia.filter((t) => !akanKonflik(siswa.absen, tim[t], aturan));
      const pool = aman.length ? aman : slotTersedia;
      const pilih = pool[Math.floor(Math.random() * pool.length)];
      tim[pilih].push(siswa);
      slotTersedia.splice(slotTersedia.indexOf(pilih), 1);
    });

    // Orang yang gak boleh dipindah-pindah waktu merapikan gender
    const tetap = new Set([
      ...sudahDiGrup,
      ...hindar.map((s) => s.absen),
      ...GRP_A,
      ...aturan.map((r) => r.orang),
    ]);
    return { tim, tetap, aturan };
  }

  // ---- Setting: gender gak boleh sendirian di satu kelompok ----
  function hitungSendirian(tim, totalL, totalP) {
    let v = 0;
    tim.forEach((a) => {
      if (a.length < 2) return;
      const p = a.filter((s) => s.gender === "P").length;
      const l = a.length - p;
      if (p === 1 && totalP > 1) v++;
      if (l === 1 && totalL > 1) v++;
    });
    return v;
  }

  // Rapiin dengan tukar anggota antar tim (ukuran tiap tim gak berubah)
  function rapikanGender(tim, tetap) {
    const flat = tim.flat();
    const totalP = flat.filter((s) => s.gender === "P").length;
    const totalL = flat.length - totalP;
    const ambil = (arr) => arr[Math.floor(Math.random() * arr.length)];
    let v = hitungSendirian(tim, totalL, totalP);

    for (let i = 0; i < 3000 && v > 0; i++) {
      const a = Math.floor(Math.random() * tim.length);
      const b = Math.floor(Math.random() * tim.length);
      if (a === b) continue;
      const ca = tim[a].filter((s) => !tetap.has(s.absen));
      const cb = tim[b].filter((s) => !tetap.has(s.absen));
      if (!ca.length || !cb.length) continue;
      const pa = ambil(ca);
      const pb = ambil(cb);
      if (pa.gender === pb.gender) continue;
      const lamaA = tim[a], lamaB = tim[b];
      tim[a] = lamaA.map((s) => (s === pa ? pb : s));
      tim[b] = lamaB.map((s) => (s === pb ? pa : s));
      const v2 = hitungSendirian(tim, totalL, totalP);
      if (v2 <= v) v = v2;
      else { tim[a] = lamaA; tim[b] = lamaB; }
    }
    return v;
  }

  function buatTim() {
    const ukuran = Number(sizeSelect.value);
    const semua = getPickerSiswaList();
    if (semua.length === 0) {
      resultBox.innerHTML = `<p class="form-hint">Semua siswa ditandai tidak masuk. Ubah di Settings.</p>`;
      return;
    }

    // Jumlah tim & ukuran tiap tim tetap rata (4/tim ya 4 semua). Aturan gender cuma
    // dicari yang paling pas lewat tukar-tukar anggota, ukuran tim gak pernah diubah.
    const jumlahTim = Math.ceil(semua.length / ukuran);
    let terbaik = null;
    let skorTerbaik = Infinity;
    // Dicoba beberapa kali, lalu diambil susunan dengan pelanggaran paling sedikit.
    const percobaan = pickerSettings.gender ? 120 : 60;
    for (let k = 0; k < percobaan; k++) {
      const { tim, tetap, aturan } = susunSekali(semua, ukuran, jumlahTim);
      const genderSalah = pickerSettings.gender ? rapikanGender(tim, tetap) : 0;
      const konflik = hitungKonflik(tim, aturan);
      const skor = konflik * 1000 + genderSalah;
      if (skor < skorTerbaik) { skorTerbaik = skor; terbaik = tim; }
      if (skor === 0) break;
    }

    const timTampil = terbaik.filter((anggota) => anggota.length > 0).map((anggota) => acakArray(anggota));
    resultBox.innerHTML = timTampil
      .map(
        (anggota, i) => `
        <div class="team-block" style="--i:${i}">
          <h4><span class="team-badge">Tim ${i + 1}</span></h4>
          <ul>
            ${anggota
              .map(
                (s) => `<li><span class="team-no">${String(s.absen).padStart(2, "0")}</span><span class="team-name">${s.namaPanggilan}</span></li>`
              )
              .join("")}
          </ul>
        </div>
      `
      )
      .join("");
    SoundFX.teamsReady();
  }

  makeBtn.addEventListener("click", buatTim);

  function reset() {
    resultBox.innerHTML = "";
    sizeSelect.value = "4";
  }

  return { reset };
}

/* ===================================================
   6. NAV HOME / INFO
=================================================== */
function setupPageTabs() {
  const btns = document.querySelectorAll(".page-tab-btn");
  const panels = document.querySelectorAll(".page-panel");
  const indicator = document.getElementById("tab-indicator");

  function moveIndicator(btn) {
    if (!indicator) return;
    indicator.style.width = `${btn.offsetWidth}px`;
    indicator.style.transform = `translateX(${btn.offsetLeft - btns[0].offsetLeft}px)`;
  }

  btns.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      moveIndicator(btn);
      const target = btn.dataset.pageTab;
      if (target !== "games") {
        const tvView = document.getElementById("game-tableverse-view");
        if (tvView && !tvView.hidden) {
          if (typeof window.tableverseTutup === "function") window.tableverseTutup();
          tvView.hidden = true;
          const listView = document.getElementById("games-list-view");
          if (listView) listView.hidden = false;
        }
        const gtcView = document.getElementById("game-guesscolor-view");
        if (gtcView && !gtcView.hidden) {
          if (typeof window.gtcTutup === "function") window.gtcTutup();
          gtcView.hidden = true;
          const listView = document.getElementById("games-list-view");
          if (listView) listView.hidden = false;
        }
      }
      panels.forEach((p) => {
        const tampilkan = p.dataset.pagePanel === target;
        p.hidden = !tampilkan;
        if (tampilkan) {
          p.classList.remove("panel-enter");
          void p.offsetWidth; // reset biar animasinya bisa diputer ulang
          p.classList.add("panel-enter");
        }
      });
      SoundFX.tabSwitch();
    });
    if (idx === 0) requestAnimationFrame(() => moveIndicator(btn));
  });

  window.addEventListener("resize", () => {
    const active = document.querySelector(".page-tab-btn.active");
    if (active) moveIndicator(active);
  });
}

/* ===================================================
   7. TAB INFO (jadwal otomatis + override admin)
=================================================== */
let unsubscribeInfoOverrides = null;

function setupInfoTab() {
  infoBesok = getInfoBesok();
  renderJadwalOtomatis();
  updateInfoHeading();
  subscribeInfoOverrides();

  setInterval(refreshInfoBesok, 5 * 60 * 1000); // jaga-jaga kalau web dibiarin kebuka lewat jam 12 siang / tengah malam

  document.getElementById("btn-edit-info").addEventListener("click", openEditInfoModal);
  document.getElementById("btn-salin-info").addEventListener("click", salinInfo);
  document.getElementById("form-edit-info").addEventListener("submit", handleEditInfoSubmit);
  document.getElementById("edit-info-tanggal").addEventListener("change", handleEditInfoTanggalChange);
  setupModalDismiss(document.getElementById("modal-edit-info"));
}

function renderJadwalOtomatis() {
  document.getElementById("info-hari-label").textContent = infoBesok.tanggalFormatted;
  document.getElementById("info-mapel").textContent = infoBesok.mapel.join(", ") || "-";
  document.getElementById("info-seragam").textContent = infoBesok.seragam;
  document.getElementById("info-piket").textContent = infoBesok.piket.join(", ") || "-";
  document.getElementById("info-eskul").textContent = infoBesok.eskul.join(", ") || "Gak ada eskul";
}

function updateInfoHeading() {
  const heading = document.getElementById("info-tanggal");
  if (!heading) return;
  heading.textContent = infoBesok.key === dateKey(new Date()) ? "Info Hari Ini" : "Info Besok";
}

function subscribeInfoOverrides() {
  if (unsubscribeInfoOverrides) unsubscribeInfoOverrides();
  unsubscribeInfoOverrides = db
    .collection("infoOverrides")
    .doc(infoBesok.key)
    .onSnapshot(
      (doc) => {
        infoOverrideData = doc.exists ? doc.data() : {};
        renderInfoOverrides();
      },
      (err) => console.error("Gagal ambil info:", err)
    );
}

function refreshInfoBesok() {
  applyBirthdayTheme();
  const keySebelumnya = infoBesok.key;
  infoBesok = getInfoBesok();
  updateInfoHeading();
  if (infoBesok.key !== keySebelumnya) {
    renderJadwalOtomatis();
    subscribeInfoOverrides();
  }
}

function renderInfoOverrides() {
  document.getElementById("info-mapel").textContent =
    infoOverrideData.mapelOverride && infoOverrideData.mapelOverride.trim()
      ? infoOverrideData.mapelOverride
      : infoBesok.mapel.join(", ") || "-";

  document.getElementById("info-seragam").textContent =
    infoOverrideData.seragamOverride && infoOverrideData.seragamOverride.trim()
      ? infoOverrideData.seragamOverride
      : infoBesok.seragam;

  document.getElementById("info-pr").textContent =
    infoOverrideData.pr && infoOverrideData.pr.trim() ? infoOverrideData.pr : "Belum ada info PR";

  const eskulLiburList = infoOverrideData.eskulLiburList || [];
  if (infoBesok.eskul.length === 0) {
    document.getElementById("info-eskul").textContent = "Gak ada eskul";
  } else {
    document.getElementById("info-eskul").textContent = infoBesok.eskul
      .map((entry) => (eskulLiburList.includes(entry.split(" (")[0]) ? `${entry} — Diliburkan` : entry))
      .join(", ");
  }

  const catatanCard = document.getElementById("info-catatan-card");
  if (infoOverrideData.catatan && infoOverrideData.catatan.trim()) {
    document.getElementById("info-catatan").textContent = infoOverrideData.catatan;
    catatanCard.hidden = false;
  } else {
    catatanCard.hidden = true;
  }

  document.getElementById("info-kegiatan").textContent =
    infoOverrideData.kegiatan && infoOverrideData.kegiatan.trim() ? infoOverrideData.kegiatan : "Belum ada kegiatan";

  const editedEl = document.getElementById("info-edited-by");
  if (infoOverrideData.editedBy) {
    const ts = infoOverrideData.editedAt && infoOverrideData.editedAt.toDate ? infoOverrideData.editedAt.toDate() : null;
    const waktu = ts
      ? ` · ${ts.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
      : "";
    editedEl.textContent = `Terakhir diedit oleh ${infoOverrideData.editedBy}${waktu}`;
  } else {
    editedEl.textContent = "Terakhir diedit oleh: belum ada yang edit";
  }
}

function updateInfoEditButtonVisibility() {
  const btn = document.getElementById("btn-edit-info");
  if (!btn) return;
  btn.hidden = !(currentUser && (currentUser.role === "admin" || currentUser.role === "owner"));
}

function openEditInfoModal() {
  document.getElementById("edit-info-tanggal").value = infoBesok.key;
  document.getElementById("edit-info-tanggal").min = dateKey(new Date());
  isiFormEditInfo(infoBesok, infoOverrideData);
  document.getElementById("edit-info-error").hidden = true;
  openModal(document.getElementById("modal-edit-info"));
}

function isiFormEditInfo(jadwalTarget, override) {
  document.getElementById("edit-mapel").value = override.mapelOverride || "";
  document.getElementById("edit-seragam").value = override.seragamOverride || "";
  document.getElementById("edit-pr").value = override.pr || "";
  document.getElementById("edit-kegiatan").value = override.kegiatan || "";
  document.getElementById("edit-catatan").value = override.catatan || "";

  const liburSaatIni = override.eskulLiburList || [];
  const liburList = document.getElementById("edit-eskul-libur-list");
  liburList.innerHTML =
    jadwalTarget.eskul
      .map((entry) => {
        const nama = entry.split(" (")[0];
        return `
          <label class="eskul-choice-row">
            <input type="checkbox" name="eskul-libur" value="${nama}" ${liburSaatIni.includes(nama) ? "checked" : ""}>
            ${entry}
          </label>
        `;
      })
      .join("") || `<p class="form-hint">Gak ada eskul di hari ini.</p>`;
}

async function handleEditInfoTanggalChange(e) {
  const tanggalDipilih = new Date(`${e.target.value}T00:00:00`);
  const hari = tanggalDipilih.getDay();
  const errorEl = document.getElementById("edit-info-error");

  if (hari === 0 || hari === 6) {
    errorEl.textContent = "Sabtu/Minggu libur, pilih hari sekolah (Senin-Jumat).";
    errorEl.hidden = false;
    e.target.value = infoBesok.key;
    return;
  }
  errorEl.hidden = true;

  const jadwalTarget = getJadwalUntukTanggal(tanggalDipilih);
  try {
    const doc = await db.collection("infoOverrides").doc(jadwalTarget.key).get();
    isiFormEditInfo(jadwalTarget, doc.exists ? doc.data() : {});
  } catch (err) {
    isiFormEditInfo(jadwalTarget, {});
  }
}

async function handleEditInfoSubmit(e) {
  e.preventDefault();
  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "owner")) return;
  const errorEl = document.getElementById("edit-info-error");
  const targetKey = document.getElementById("edit-info-tanggal").value || infoBesok.key;
  const payload = {
    mapelOverride: document.getElementById("edit-mapel").value.trim(),
    seragamOverride: document.getElementById("edit-seragam").value.trim(),
    pr: document.getElementById("edit-pr").value.trim(),
    kegiatan: document.getElementById("edit-kegiatan").value.trim(),
    eskulLiburList: Array.from(document.querySelectorAll('input[name="eskul-libur"]:checked')).map((el) => el.value),
    catatan: document.getElementById("edit-catatan").value.trim(),
    editedBy: currentUser.namaPanggilan,
    editedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  try {
    await db.collection("infoOverrides").doc(targetKey).set(payload, { merge: true });
    closeModal(document.getElementById("modal-edit-info"));
    SoundFX.resultReveal();
  } catch (err) {
    errorEl.textContent = "Gagal simpan, cek koneksi internet.";
    errorEl.hidden = false;
    SoundFX.errorSound();
  }
}

/* ---------- SALIN INFO (template WA) ---------- */
const BULAN_ID = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
const NAMA_MAPEL_PANJANG = {
  "B.SUNDA": "BAHASA SUNDA",
  "B.INDO": "BAHASA INDONESIA",
  "B.INGGRIS": "BAHASA INGGRIS",
  "MTK": "MATEMATIKA",
  // tambah sendiri kalau mau singkatan lain dipanjangin
};

// A-Z -> 𝐀-𝐙 (bold serif)
function gayaBold(teks) {
  return [...teks.toUpperCase()].map((ch) => {
    const c = ch.charCodeAt(0);
    return c >= 65 && c <= 90 ? String.fromCodePoint(0x1d400 + c - 65) : ch;
  }).join("");
}

// A-Z -> 🅐-🅩 (negative circled), 0-9 -> ⓿➊➋➌...
function gayaLingkaran(teks) {
  return [...teks.toUpperCase()].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1f150 + c - 65);
    if (ch >= "1" && ch <= "9") return String.fromCodePoint(0x278a + Number(ch) - 1);
    if (ch === "0") return "⓿";
    return ch;
  }).join("");
}

// 1 -> 𝟭
function angkaBold(n) {
  return String(n).replace(/\d/g, (d) => String.fromCodePoint(0x1d7ec + Number(d)));
}

function buatTeksSalinInfo() {
  const o = infoOverrideData || {};
  const tgl = infoBesok.tanggal;
  const tanggalStyled = [
    gayaLingkaran(infoBesok.namaHari),
    gayaLingkaran(String(tgl.getDate())),
    gayaLingkaran(BULAN_ID[tgl.getMonth()]),
    gayaLingkaran(String(tgl.getFullYear())),
  ].join("⚊");

  const baris = (t) => (t || "").split("\n").map((x) => x.trim()).filter(Boolean);

  const mapelMentah = o.mapelOverride && o.mapelOverride.trim() ? o.mapelOverride.split(",") : infoBesok.mapel;
  const mapel = mapelMentah.map((m) => m.trim()).filter(Boolean)
    .map((m) => NAMA_MAPEL_PANJANG[m.toUpperCase()] || m);

  const piket = infoBesok.piket;
  const pr = baris(o.pr);
  const kegiatan = baris(o.kegiatan);
  const catatan = baris(o.catatan);

  const out = [
    "ᯓ𝗔𝗦𝗦𝗔𝗟𝗔𝗠𝗨𝗔𝗟𝗔𝗜𝗞𝗨𝗠 𝗪𝗥.𝗪𝗕ᯓ",
    "꒷𝓗aloo 𝓦arga 𝟕.𝟑 𝓘zin 𝓜engigatkan꒷",
    "◆🗓 𝐓omorrow`s 𝐃ate:",
    ` ${tanggalStyled}`,
    "",
    "✦📚 𝐌𝐴𝑃𝐸𝐿:",
    ...(mapel.length ? mapel.map((m) => `⚊ ${gayaBold(m)}`) : ["⚊ -"]),
    "",
    "★🧹 𝐏𝐼𝐾𝐸𝑇:",
    ...(piket.length ? piket.map((n) => `⚊ ${n.toUpperCase()}`) : ["⚊ -"]),
    "",
    "✿✍️📖𝐏ᥱrkᥱrȷᥲᥲᥒ 𝐑ᥙmᥲһ:",
    ...(pr.length ? [...pr.map((l) => `╸${l}`), "ᴅsᴛ."] : ["╸Tidak ada PR"]),
    "",
    "✤🪻𝐊EGIATAN:",
    ...(kegiatan.length ? kegiatan : ["-"]),
  ];

  if (catatan.length) {
    out.push("📌 𝓝ote :");
    catatan.forEach((l, i) => out.push(`${angkaBold(i + 1)}. ${l}`));
  }
  return out.join("\n");
}

async function salinInfo() {
  const btn = document.getElementById("btn-salin-info");
  const teks = buatTeksSalinInfo();
  try {
    await navigator.clipboard.writeText(teks);
  } catch (err) {
    // fallback buat browser/jaringan yang blokir clipboard API
    const ta = document.createElement("textarea");
    ta.value = teks;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const asli = btn.textContent;
  btn.textContent = "Tersalin ✓";
  SoundFX.resultReveal();
  setTimeout(() => (btn.textContent = asli), 1800);
}

/* ===================================================
   8. UI AKUN (login, edit profil, kredensial, kelola admin)
=================================================== */
function setupAccountUI() {
  const btnAccount = document.getElementById("btn-account");
  const panelGuest = document.getElementById("panel-guest");
  const panelAccount = document.getElementById("panel-account");

  btnAccount.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = !panelGuest.hidden || !panelAccount.hidden;
    closeAccountPanels();
    if (!wasOpen) {
      if (currentUser) panelAccount.hidden = false;
      else panelGuest.hidden = false;
    }
    SoundFX.buttonClick();
  });

  [panelGuest, panelAccount].forEach((panel) => panel.addEventListener("click", (e) => e.stopPropagation()));
  document.addEventListener("click", () => closeAccountPanels());

  document.getElementById("btn-show-login").addEventListener("click", () => {
    closeAccountPanels();
    document.getElementById("form-login").reset();
    document.getElementById("login-error").hidden = true;
    openModal(document.getElementById("modal-login"));
  });

  document.getElementById("btn-stay-guest").addEventListener("click", () => {
    closeAccountPanels();
    SoundFX.buttonClick();
  });

  document.getElementById("btn-logout").addEventListener("click", () => {
    logoutUser();
    closeAccountPanels();
    SoundFX.resetSound();
  });

  document.getElementById("btn-edit-profil").addEventListener("click", () => {
    closeAccountPanels();
    openEditProfilModal(currentUser.absen);
  });

  document.getElementById("btn-edit-credentials").addEventListener("click", () => {
    closeAccountPanels();
    document.getElementById("form-edit-credentials").reset();
    document.getElementById("cred-error").hidden = true;
    openModal(document.getElementById("modal-edit-credentials"));
  });

  document.getElementById("btn-kelola-admin").addEventListener("click", () => {
    closeAccountPanels();
    renderKelolaAdmin();
    openModal(document.getElementById("modal-kelola-admin"));
  });

  setupModalDismiss(document.getElementById("modal-login"));
  setupModalDismiss(document.getElementById("modal-edit-profil"));
  setupModalDismiss(document.getElementById("modal-edit-credentials"));
  setupModalDismiss(document.getElementById("modal-kelola-admin"));

  document.getElementById("form-login").addEventListener("submit", handleLoginSubmit);
  document.getElementById("form-edit-profil").addEventListener("submit", handleEditProfilSubmit);
  document.getElementById("form-edit-credentials").addEventListener("submit", handleEditCredentialsSubmit);

  document.getElementById("profil-bio").addEventListener("input", (e) => {
    document.getElementById("profil-bio-count").textContent = `${e.target.value.length} karakter`;
  });

  setupDownloadMenu();
  setupAlbum();

  const btnTes = document.getElementById("btn-tes-notif");
  btnTes.addEventListener("click", tesNotifikasiEskul);
  // Tombol tes notif muncul di aplikasi HP & desktop. Tombol download cuma aktif di web
  // (di dalam aplikasi sudah gak perlu download lagi, jadi logonya cuma gambar biasa).
  const app = window.kelas73App || {};
  if (app.native || app.desktop) btnTes.hidden = false;

  const linkLupa = document.getElementById("btn-lupa-password");
  linkLupa.href = `https://wa.me/${NOMOR_WA_YOGA}?text=${encodeURIComponent(PESAN_LUPA_PASSWORD)}`;
  linkLupa.target = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() ? "_self" : "_blank";
  linkLupa.rel = "noopener";
  linkLupa.addEventListener("click", (e) => {
    if (NOMOR_WA_YOGA.includes("X")) {
      e.preventDefault();
      const err = document.getElementById("login-error");
      err.textContent = "Nomor WA belum diisi di script.js (NOMOR_WA_YOGA).";
      err.hidden = false;
    }
  });

  document.getElementById("profil-notif").addEventListener("change", (e) => {
    if (e.target.checked && typeof Notification !== "undefined") {
      Notification.requestPermission().then((perm) => {
        if (perm !== "granted") e.target.checked = false;
      });
    }
  });
}

/* ===================================================
   Menu download aplikasi (Android / iPhone / Windows / Mac)
=================================================== */
function deteksiPerangkat() {
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return null;
}

function setupDownloadMenu() {
  const btn = document.getElementById("btn-download-apk");
  const menu = document.getElementById("download-menu");

  // Di dalam aplikasi: logo tampil tapi gak bisa diklik / download
  if (lagiDiAplikasi()) {
    btn.disabled = true;
    btn.removeAttribute("title");
    btn.removeAttribute("aria-haspopup");
    btn.removeAttribute("aria-expanded");
    btn.setAttribute("aria-hidden", "true");
    btn.tabIndex = -1;
    btn.classList.add("apk-download-statis");
    menu.remove();
    return;
  }

  document.getElementById("dl-android").href = LINK_DOWNLOAD.android;
  document.getElementById("dl-windows").href = LINK_DOWNLOAD.windows;
  document.getElementById("dl-mac").href = LINK_DOWNLOAD.mac;
  document.getElementById("dl-iphone-ipa").href = LINK_DOWNLOAD.iphone;

  const cocok = deteksiPerangkat();
  if (cocok) {
    const item = menu.querySelector(`[data-platform="${cocok}"]`);
    if (item) {
      item.classList.add("download-cocok");
      item.querySelector("small").textContent += " · cocok buat kamu";
      menu.insertBefore(item, menu.querySelector(".download-item")); // taruh paling atas
    }
  }

  const modalIphone = document.getElementById("modal-iphone");
  setupModalDismiss(modalIphone);

  function tutupMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAccountPanels();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", tutupMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutupMenu(); });

  document.getElementById("btn-account").addEventListener("click", tutupMenu);
  menu.querySelectorAll("a.download-item").forEach((a) => a.addEventListener("click", tutupMenu));

  document.getElementById("dl-iphone").addEventListener("click", () => {
    tutupMenu();
    openModal(modalIphone);
  });
}

function closeAccountPanels() {
  document.getElementById("panel-guest").hidden = true;
  document.getElementById("panel-account").hidden = true;
}

function updateAccountUI() {
  const label = document.getElementById("account-label");
  const helloName = document.getElementById("account-hello-name");
  const roleBadge = document.getElementById("account-role-badge");
  const btnKelolaAdmin = document.getElementById("btn-kelola-admin");

  if (currentUser) {
    label.textContent = currentUser.namaPanggilan;
    helloName.textContent = currentUser.namaPanggilan;
    if (currentUser.role === "owner" || currentUser.role === "admin") {
      roleBadge.textContent = currentUser.role;
      roleBadge.hidden = false;
    } else {
      roleBadge.hidden = true;
    }
    btnKelolaAdmin.hidden = currentUser.role !== "owner";
  } else {
    label.textContent = "Akun";
  }
  updateInfoEditButtonVisibility();
  updateMedsosEditVisibility();
  updatePollingCreateVisibility();
  updateGamesAccount();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;

  let matchedAbsen = null;
  for (const siswa of dataSiswa) {
    const merged = getMergedAccount(siswa.absen);
    if (merged.username === username) {
      matchedAbsen = siswa.absen;
      break;
    }
  }

  if (matchedAbsen === null) {
    errorEl.textContent = "Username gak ditemukan.";
    errorEl.hidden = false;
    SoundFX.errorSound();
    return;
  }

  const merged = getMergedAccount(matchedAbsen);
  if (merged.password !== password) {
    errorEl.textContent = "Password salah.";
    errorEl.hidden = false;
    SoundFX.errorSound();
    return;
  }

  try {
    if (!accountsData[String(matchedAbsen)]) {
      const siswa = dataSiswa.find((s) => s.absen === matchedAbsen);
      await db.collection("accounts").doc(String(matchedAbsen)).set(getDefaultAccount(siswa));
    }
    loginUser(matchedAbsen);
    if (typeof window.tableverseLoginDenganPassword === "function") {
      window.tableverseLoginDenganPassword(matchedAbsen, password);
    }
    closeModal(document.getElementById("modal-login"));
    SoundFX.resultReveal();
  } catch (err) {
    errorEl.textContent = "Gagal login, cek koneksi internet.";
    errorEl.hidden = false;
    SoundFX.errorSound();
  }
}

function openEditProfilModal(absen) {
  const merged = getMergedAccount(absen);
  document.getElementById("profil-panggilan").value = merged.namaPanggilan;
  document.getElementById("profil-cita").value = merged.citaCita;
  document.getElementById("profil-lagu").value = merged.laguFavorit;
  document.getElementById("profil-bio").value = merged.bio;
  document.getElementById("profil-bio-count").textContent = `${merged.bio.length} karakter`;
  document.getElementById("profil-ultah").value = merged.ultah || "";
  document.getElementById("profil-notif").checked = !!merged.notifEskul;
  renderEskulPilihanForm(merged);
  document.getElementById("profil-error").hidden = true;
  openModal(document.getElementById("modal-edit-profil"));
  muatAlbumEdit(absen);
}

function renderEskulPilihanForm(merged) {
  const wajibList = document.getElementById("profil-eskul-wajib-list");
  const pilihanList = document.getElementById("profil-eskul-pilihan-list");
  const daftarPilihan = getDaftarEskulPilihan();

  wajibList.innerHTML = ESKUL_WAJIB.map(
    (nama) => `
      <label class="eskul-choice-row">
        <input type="radio" name="eskul-wajib" value="${nama}" ${merged.eskulWajib === nama ? "checked" : ""}>
        ${nama}
      </label>
    `
  ).join("");

  pilihanList.innerHTML = daftarPilihan
    .map(
      ({ nama, hari }) => `
      <label class="eskul-choice-row" data-hari="${hari}">
        <input type="checkbox" name="eskul-pilihan" value="${nama}" data-hari="${hari}" ${
        (merged.eskulPilihan || []).includes(nama) ? "checked" : ""
      }>
        ${nama} (${hari})
      </label>
    `
    )
    .join("");

  // Satu hari cuma boleh 1 eskul pilihan -- otomatis uncheck yang lain di hari sama
  pilihanList.querySelectorAll('input[name="eskul-pilihan"]').forEach((chk) => {
    chk.addEventListener("change", () => {
      if (!chk.checked) return;
      pilihanList.querySelectorAll('input[name="eskul-pilihan"]').forEach((other) => {
        if (other !== chk && other.dataset.hari === chk.dataset.hari) other.checked = false;
      });
    });
  });
}

async function handleEditProfilSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;
  const errorEl = document.getElementById("profil-error");

  const namaPanggilan = document.getElementById("profil-panggilan").value.trim();
  if (!namaPanggilan) {
    errorEl.textContent = "Nama panggilan gak boleh kosong.";
    errorEl.hidden = false;
    return;
  }

  const eskulWajib = document.querySelector('input[name="eskul-wajib"]:checked')?.value || "";
  const eskulPilihan = Array.from(document.querySelectorAll('input[name="eskul-pilihan"]:checked')).map((el) => el.value);

  if (!eskulWajib) {
    errorEl.textContent = "Pilih 1 Eskul Wajib dulu (Pramuka/PMR/Paskibra).";
    errorEl.hidden = false;
    return;
  }
  if (eskulPilihan.length < 1) {
    errorEl.textContent = "Pilih minimal 1 Eskul Pilihan.";
    errorEl.hidden = false;
    return;
  }

  const payload = {
    namaPanggilan,
    citaCita: document.getElementById("profil-cita").value.trim() || "tidak diketahui",
    laguFavorit: document.getElementById("profil-lagu").value.trim() || "tidak diketahui",
    bio: document.getElementById("profil-bio").value.trim(),
    ultah: document.getElementById("profil-ultah").value, // "" kalau dikosongin
    eskulWajib,
    eskulPilihan,
    notifEskul: document.getElementById("profil-notif").checked,
  };

  try {
    await db.collection("accounts").doc(String(currentUser.absen)).set(payload, { merge: true });
    closeModal(document.getElementById("modal-edit-profil"));
    SoundFX.resultReveal();
  } catch (err) {
    console.error("Gagal simpan profil:", err);
    errorEl.textContent = `Gagal simpan (${err.code || err.message}).`;
    errorEl.hidden = false;
    SoundFX.errorSound();
  }
}

async function handleEditCredentialsSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;
  const errorEl = document.getElementById("cred-error");

  const passwordLama = document.getElementById("cred-password-lama").value;
  const usernameBaru = document.getElementById("cred-username-baru").value.trim();
  const passwordBaru = document.getElementById("cred-password-baru").value;

  const merged = getMergedAccount(currentUser.absen);
  if (merged.password !== passwordLama) {
    errorEl.textContent = "Password sekarang salah.";
    errorEl.hidden = false;
    SoundFX.errorSound();
    return;
  }
  if (!usernameBaru) {
    errorEl.textContent = "Username gak boleh kosong.";
    errorEl.hidden = false;
    return;
  }

  const dipakaiOrangLain = dataSiswa.some(
    (s) => s.absen !== currentUser.absen && getMergedAccount(s.absen).username === usernameBaru
  );
  if (dipakaiOrangLain) {
    errorEl.textContent = "Username udah dipake orang lain.";
    errorEl.hidden = false;
    SoundFX.errorSound();
    return;
  }

  const payload = { username: usernameBaru };
  if (passwordBaru) payload.password = passwordBaru;

  try {
    await db.collection("accounts").doc(String(currentUser.absen)).set(payload, { merge: true });
    closeModal(document.getElementById("modal-edit-credentials"));
    SoundFX.resultReveal();
  } catch (err) {
    errorEl.textContent = "Gagal simpan, cek koneksi internet.";
    errorEl.hidden = false;
    SoundFX.errorSound();
  }
}

/* ===================================================
   9. KELOLA ADMIN (Owner)
=================================================== */
function renderKelolaAdmin() {
  const container = document.getElementById("daftar-kelola-admin");
  container.innerHTML = "";

  dataSiswa.forEach((siswa) => {
    if (siswa.absen === 29) return; // Owner (Yoga) gak perlu di-toggle
    const merged = getMergedAccount(siswa.absen);
    const row = document.createElement("div");
    row.className = "kelola-admin-row";
    row.innerHTML = `
      <label>
        <input type="checkbox" data-admin-absen="${siswa.absen}" ${merged.role === "admin" ? "checked" : ""}>
        ${merged.namaPanggilan} (absen ${String(siswa.absen).padStart(2, "0")})
      </label>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("input[type=checkbox]").forEach((chk) => {
    chk.addEventListener("change", async (e) => {
      const absen = Number(e.target.dataset.adminAbsen);
      const newRole = e.target.checked ? "admin" : "member";
      const siswa = dataSiswa.find((s) => s.absen === absen);
      try {
        if (!accountsData[String(absen)]) {
          await db.collection("accounts").doc(String(absen)).set({ ...getDefaultAccount(siswa), role: newRole });
        } else {
          await db.collection("accounts").doc(String(absen)).set({ role: newRole }, { merge: true });
        }
        SoundFX.buttonClick();
      } catch (err) {
        e.target.checked = !e.target.checked;
        SoundFX.errorSound();
      }
    });
  });
}

/* ===================================================
   10. TAB MEDIA SOSIAL (Admin & Owner bisa edit)
=================================================== */
function setupMedsosTab() {
  const tiktokHandle = document.getElementById("medsos-tiktok-handle");
  const igHandle = document.getElementById("medsos-ig-handle");
  tiktokHandle.innerHTML = `<span class="skeleton skeleton-inline"></span>`;
  igHandle.innerHTML = `<span class="skeleton skeleton-inline"></span>`;

  db.collection("settings")
    .doc("medsos")
    .onSnapshot(
      (doc) => {
        const data = doc.exists ? doc.data() : {};
        const tiktok = data.tiktok || "";
        const ig = data.ig || "";

        const tiktokLink = document.getElementById("medsos-tiktok");
        const igLink = document.getElementById("medsos-ig");

        document.getElementById("medsos-tiktok-handle").textContent = tiktok ? `@${tiktok}` : "Belum diatur";
        document.getElementById("medsos-ig-handle").textContent = ig ? `@${ig}` : "Belum diatur";

        tiktokLink.href = tiktok ? `https://www.tiktok.com/@${tiktok}` : "#";
        igLink.href = ig ? `https://www.instagram.com/${ig}` : "#";

        window._medsosData = { tiktok, ig };
      },
      (err) => {
        console.error("Gagal ambil data medsos:", err);
        tiktokHandle.textContent = "Belum diatur";
        igHandle.textContent = "Belum diatur";
      }
    );

  document.getElementById("btn-edit-medsos").addEventListener("click", openEditMedsosModal);
  document.getElementById("form-edit-medsos").addEventListener("submit", handleEditMedsosSubmit);
  setupModalDismiss(document.getElementById("modal-edit-medsos"));
}

function updateMedsosEditVisibility() {
  const btn = document.getElementById("btn-edit-medsos");
  if (!btn) return;
  btn.hidden = !(currentUser && (currentUser.role === "admin" || currentUser.role === "owner"));
}

function openEditMedsosModal() {
  const data = window._medsosData || {};
  document.getElementById("medsos-tiktok-input").value = data.tiktok || "";
  document.getElementById("medsos-ig-input").value = data.ig || "";
  document.getElementById("medsos-error").hidden = true;
  openModal(document.getElementById("modal-edit-medsos"));
}

async function handleEditMedsosSubmit(e) {
  e.preventDefault();
  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "owner")) return;
  const errorEl = document.getElementById("medsos-error");
  const payload = {
    tiktok: document.getElementById("medsos-tiktok-input").value.trim().replace(/^@/, ""),
    ig: document.getElementById("medsos-ig-input").value.trim().replace(/^@/, ""),
  };
  try {
    await db.collection("settings").doc("medsos").set(payload, { merge: true });
    closeModal(document.getElementById("modal-edit-medsos"));
    SoundFX.resultReveal();
  } catch (err) {
    errorEl.textContent = "Gagal simpan, cek koneksi internet.";
    errorEl.hidden = false;
    SoundFX.errorSound();
  }
}

/* ===================================================
   11. TAB POLLING (Admin & Owner bikin, semua vote)
=================================================== */
function setupPollingTab() {
  renderSkeletonPolling();
  db.collection("polling")
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snap) => {
        const daftar = [];
        snap.forEach((doc) => daftar.push({ id: doc.id, ...doc.data() }));
        pollingCache = daftar;
        renderPollingList(daftar);
      },
      (err) => {
        console.error("Gagal ambil polling:", err);
        renderPollingList([]);
      }
    );

  document.getElementById("btn-buat-polling").addEventListener("click", () => openBuatPollingModal(null));
  document.getElementById("btn-tambah-opsi").addEventListener("click", () => {
    const list = document.getElementById("polling-opsi-list");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "polling-opsi-input";
    input.placeholder = `Pilihan ${list.children.length + 1}`;
    list.appendChild(input);
    SoundFX.buttonClick();
  });
  document.getElementById("form-buat-polling").addEventListener("submit", handleBuatPollingSubmit);
  setupModalDismiss(document.getElementById("modal-buat-polling"));
}

function updatePollingCreateVisibility() {
  const btn = document.getElementById("btn-buat-polling");
  if (!btn) return;
  btn.hidden = !(currentUser && (currentUser.role === "admin" || currentUser.role === "owner"));
}

function getMaxPilihan(poll) {
  return poll.maxPilihan === "semua" ? poll.opsi.length : Number(poll.maxPilihan) || 1;
}

function renderSkeletonPolling() {
  const container = document.getElementById("daftar-polling");
  if (!container) return;
  container.innerHTML = Array.from({ length: 2 }, () => `
    <div class="polling-card polling-card-skeleton" aria-hidden="true">
      <span class="skeleton skeleton-line skeleton-line-lg"></span>
      <span class="skeleton skeleton-line skeleton-line-sm"></span>
      <span class="skeleton skeleton-bar"></span>
      <span class="skeleton skeleton-bar"></span>
      <span class="skeleton skeleton-bar"></span>
    </div>`).join("");
}

function renderPollingList(daftar) {
  const container = document.getElementById("daftar-polling");
  const isAdminOrOwner = currentUser && (currentUser.role === "admin" || currentUser.role === "owner");

  if (daftar.length === 0) {
    container.innerHTML = `<p class="section-sub">Belum ada polling. ${isAdminOrOwner ? "Bikin yang pertama yuk!" : "Cek lagi nanti ya."}</p>`;
    return;
  }

  container.innerHTML = daftar
    .map((poll) => {
      const votes = poll.votes || {};
      const totalVotes = Object.keys(votes).length;
      const myVotes = currentUser ? votes[String(currentUser.absen)] || [] : [];
      const maxPilihan = getMaxPilihan(poll);
      const isCreator = currentUser && currentUser.absen === poll.dibuatOlehAbsen;

      const opsiHtml = poll.opsi
        .map((opsi, i) => {
          const pemilih = Object.entries(votes)
            .filter(([, v]) => Array.isArray(v) && v.includes(i))
            .map(([absen]) => getMergedAccount(Number(absen))?.namaPanggilan || "?");
          const jumlah = pemilih.length;
          const persen = totalVotes > 0 ? Math.round((jumlah / totalVotes) * 100) : 0;
          const votedMine = myVotes.includes(i);

          return `
            <div class="polling-opsi-row ${votedMine ? "voted-mine" : ""}" data-poll-id="${poll.id}" data-opsi-index="${i}">
              <div class="polling-opsi-label">
                <span>${opsi} ${votedMine ? "&#9989;" : ""}</span>
                <span class="polling-opsi-persen">${persen}% (${jumlah})</span>
              </div>
              <div class="polling-opsi-track"><div class="polling-opsi-bar" style="width:${persen}%"></div></div>
              ${pemilih.length ? `<div class="polling-opsi-voters">${pemilih.join(", ")}</div>` : ""}
            </div>
          `;
        })
        .join("");

      return `
        <div class="polling-card">
          <h4 class="polling-pertanyaan">${poll.pertanyaan}</h4>
          <p class="form-hint">${maxPilihan >= poll.opsi.length ? "Boleh milih semuanya" : `Maksimal pilih ${maxPilihan}`}</p>
          ${opsiHtml}
          <div class="polling-meta">
            <span>${totalVotes} orang udah vote</span>
            <span>
              ${isCreator ? `<button class="btn-hapus-polling" data-setting-poll-id="${poll.id}">Setting</button>` : ""}
              ${isAdminOrOwner ? `<button class="btn-hapus-polling" data-hapus-poll-id="${poll.id}">Hapus Polling</button>` : ""}
            </span>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".polling-opsi-row").forEach((row) => {
    row.addEventListener("click", () => {
      const pollId = row.dataset.pollId;
      const opsiIndex = Number(row.dataset.opsiIndex);
      handleVotePolling(pollId, opsiIndex);
    });
  });

  container.querySelectorAll("[data-hapus-poll-id]").forEach((btn) => {
    btn.addEventListener("click", () => handleHapusPolling(btn.dataset.hapusPollId));
  });

  container.querySelectorAll("[data-setting-poll-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poll = pollingCache.find((p) => p.id === btn.dataset.settingPollId);
      if (poll) openBuatPollingModal(poll);
    });
  });
}

async function handleVotePolling(pollId, opsiIndex) {
  if (!currentUser) {
    document.getElementById("btn-account").click();
    return;
  }
  const poll = pollingCache.find((p) => p.id === pollId);
  if (!poll) return;

  const votes = poll.votes || {};
  const currentVotes = votes[String(currentUser.absen)] || [];
  const maxPilihan = getMaxPilihan(poll);

  let newVotes;
  if (currentVotes.includes(opsiIndex)) {
    newVotes = currentVotes.filter((v) => v !== opsiIndex);
  } else if (maxPilihan === 1) {
    newVotes = [opsiIndex];
  } else if (currentVotes.length < maxPilihan) {
    newVotes = [...currentVotes, opsiIndex];
  } else {
    SoundFX.errorSound();
    return;
  }

  try {
    await db
      .collection("polling")
      .doc(pollId)
      .set({ votes: { [String(currentUser.absen)]: newVotes } }, { merge: true });
    SoundFX.buttonClick();
  } catch (err) {
    SoundFX.errorSound();
  }
}

async function handleHapusPolling(pollId) {
  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "owner")) return;
  try {
    await db.collection("polling").doc(pollId).delete();
    SoundFX.resetSound();
  } catch (err) {
    SoundFX.errorSound();
  }
}

let editingPollId = null;

function openBuatPollingModal(pollToEdit) {
  editingPollId = pollToEdit ? pollToEdit.id : null;
  document.getElementById("polling-title").textContent = pollToEdit ? "Setting Polling" : "Buat Polling Baru";
  document.getElementById("btn-submit-polling").textContent = pollToEdit ? "Simpan Perubahan" : "Buat Polling";

  document.getElementById("polling-pertanyaan").value = pollToEdit ? pollToEdit.pertanyaan : "";
  document.getElementById("polling-max").value = pollToEdit ? String(pollToEdit.maxPilihan || 1) : "1";

  const opsiAwal = pollToEdit ? pollToEdit.opsi : ["", ""];
  document.getElementById("polling-opsi-list").innerHTML = opsiAwal
    .map((val, i) => `<input type="text" class="polling-opsi-input" placeholder="Pilihan ${i + 1}" value="${val}" required>`)
    .join("");

  document.getElementById("polling-error").hidden = true;
  openModal(document.getElementById("modal-buat-polling"));
}

async function handleBuatPollingSubmit(e) {
  e.preventDefault();
  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "owner")) return;
  const errorEl = document.getElementById("polling-error");

  const pertanyaan = document.getElementById("polling-pertanyaan").value.trim();
  const opsi = Array.from(document.querySelectorAll(".polling-opsi-input"))
    .map((el) => el.value.trim())
    .filter(Boolean);
  const maxPilihanRaw = document.getElementById("polling-max").value;
  const maxPilihan = maxPilihanRaw === "semua" ? "semua" : Math.min(Number(maxPilihanRaw), opsi.length);

  if (!pertanyaan || opsi.length < 2) {
    errorEl.textContent = "Isi pertanyaan & minimal 2 pilihan.";
    errorEl.hidden = false;
    return;
  }

  try {
    if (editingPollId) {
      const poll = pollingCache.find((p) => p.id === editingPollId);
      if (!poll || poll.dibuatOlehAbsen !== currentUser.absen) {
        errorEl.textContent = "Cuma pembuat polling ini yang bisa ubah settingnya.";
        errorEl.hidden = false;
        return;
      }
      await db.collection("polling").doc(editingPollId).set({ pertanyaan, opsi, maxPilihan }, { merge: true });
    } else {
      await db.collection("polling").add({
        pertanyaan,
        opsi,
        maxPilihan,
        votes: {},
        dibuatOleh: currentUser.namaPanggilan,
        dibuatOlehAbsen: currentUser.absen,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    closeModal(document.getElementById("modal-buat-polling"));
    SoundFX.teamsReady();
  } catch (err) {
    errorEl.textContent = "Gagal simpan polling, cek koneksi internet.";
    errorEl.hidden = false;
    SoundFX.errorSound();
  }
}

/* ===================================================
   12. GAMES: STREAK (data disimpan per akun)
   - Rawat pohon: siram tiap hari, bersihkan daun buat coin.
   - Rawat hewan: pilih kucing/anjing/panda, beri makan & minum.
   - 5 kesempatan bolos per bulan, otomatis reset tanggal 1.
=================================================== */
const GAME_MAKS_KESEMPATAN = 5;
const GAME_CACHE_PREFIX = "kelas73_streak_";

const STREAK_HEWAN = {
  kucing: { nama: "Kucing", emoji: "🐱" },
  anjing: { nama: "Anjing", emoji: "🐶" },
  panda: { nama: "Panda", emoji: "🐼" },
};

const STREAK_BAJU = [
  { id: "bandana", nama: "Bandana", emoji: "🎀", harga: 10 },
  { id: "topi", nama: "Topi", emoji: "🧢", harga: 15 },
  { id: "kacamata", nama: "Kacamata", emoji: "🕶️", harga: 20 },
  { id: "jaket", nama: "Jaket", emoji: "🧥", harga: 30 },
  { id: "mahkota", nama: "Mahkota", emoji: "👑", harga: 50 },
];

const STREAK_MAINAN = [
  { id: "bola", nama: "Bola", emoji: "⚽", harga: 8 },
  { id: "tulang", nama: "Tulang", emoji: "🦴", harga: 12 },
  { id: "boneka", nama: "Boneka", emoji: "🧸", harga: 18 },
  { id: "robot", nama: "Robot", emoji: "🤖", harga: 25 },
];

const GAME_PERINGKAT_JUMLAH = 10;

let gameUserAbsen = null;
let gameState = null;
let gameUnsubscribe = null;
let gameToken = 0;
let gameCloudWarned = false;
let gameSaveTimer = null;
let gameNoticeTimer = null;
let gamePeringkatUnsub = null;
let gamePeringkatToken = 0;
let gamePeringkatCloud = {};
let gamePeringkatSiap = false;
let gamePeringkatGagal = false;
let gamePeringkatWarned = false;

function gameTanggal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function gameBulan(date = new Date()) {
  return gameTanggal(date).slice(0, 7);
}

function gameTanggalValid(t) {
  return typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t);
}

function gameTambahHari(tanggal, jumlah) {
  const [y, m, d] = tanggal.split("-").map(Number);
  return gameTanggal(new Date(y, m - 1, d + jumlah));
}

function gameAngka(nilai, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(nilai));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function gameStateAwal() {
  return {
    koin: 0,
    pohon: {
      streak: 0,
      kesempatan: GAME_MAKS_KESEMPATAN,
      bulan: gameBulan(),
      terakhir: "",
      dicek: "",
      siram: "",
      bersih: "",
    },
    hewan: {
      jenis: "",
      streak: 0,
      kesempatan: GAME_MAKS_KESEMPATAN,
      bulan: gameBulan(),
      terakhir: "",
      dicek: "",
      makan: "",
      minum: "",
      baju: [],
      mainan: [],
      pakaiBaju: "",
      pakaiMainan: "",
    },
    quiz: gameQuizStateAwal(),
    diperbarui: 0,
  };
}

// Hitung hari yang kelewatan sejak terakhir dicek. Tiap hari yang bolos
// memakai 1 kesempatan; kalau habis, streak kembali ke 0.
function gameProsesHari(track, hariIni = gameTanggal()) {
  const bulanIni = hariIni.slice(0, 7);
  const kemarin = gameTambahHari(hariIni, -1);

  if (!track.dicek) track.dicek = track.terakhir || kemarin;
  if (track.dicek > kemarin) track.dicek = kemarin;

  let hari = gameTambahHari(track.dicek, 1);
  let putaran = 0;
  while (hari <= kemarin && putaran < 400) {
    const bulanHari = hari.slice(0, 7);
    if (track.bulan !== bulanHari) {
      track.bulan = bulanHari;
      track.kesempatan = GAME_MAKS_KESEMPATAN;
    }
    if (track.streak > 0 && track.terakhir && hari > track.terakhir) {
      if (track.kesempatan > 0) track.kesempatan -= 1;
      else track.streak = 0;
    }
    track.dicek = hari;
    hari = gameTambahHari(hari, 1);
    putaran++;
  }

  if (track.dicek < kemarin) track.dicek = kemarin;
  if (track.bulan !== bulanIni) {
    track.bulan = bulanIni;
    track.kesempatan = GAME_MAKS_KESEMPATAN;
  }
  track.kesempatan = gameAngka(track.kesempatan, 0, GAME_MAKS_KESEMPATAN);
}

function gameNormalisasiTrack(raw, jenis) {
  const dasar = gameStateAwal()[jenis];
  const track = { ...dasar, ...(raw && typeof raw === "object" ? raw : {}) };
  track.streak = gameAngka(track.streak);
  track.kesempatan = gameAngka(track.kesempatan, 0, GAME_MAKS_KESEMPATAN);
  track.bulan = typeof track.bulan === "string" && /^\d{4}-\d{2}$/.test(track.bulan) ? track.bulan : gameBulan();

  ["terakhir", "dicek", "siram", "bersih", "makan", "minum"].forEach((kunci) => {
    track[kunci] = gameTanggalValid(track[kunci]) ? track[kunci] : "";
  });

  if (jenis === "hewan") {
    track.jenis = STREAK_HEWAN[track.jenis] ? track.jenis : "";
    track.baju = Array.isArray(track.baju) ? track.baju.filter((id) => STREAK_BAJU.some((i) => i.id === id)) : [];
    track.mainan = Array.isArray(track.mainan) ? track.mainan.filter((id) => STREAK_MAINAN.some((i) => i.id === id)) : [];
    track.pakaiBaju = track.baju.includes(track.pakaiBaju) ? track.pakaiBaju : "";
    track.pakaiMainan = track.mainan.includes(track.pakaiMainan) ? track.pakaiMainan : "";
  }

  gameProsesHari(track);
  return track;
}

function gameNormalisasi(raw) {
  if (!raw || typeof raw !== "object") return gameStateAwal();
  return {
    koin: gameAngka(raw.koin),
    pohon: gameNormalisasiTrack(raw.pohon, "pohon"),
    hewan: gameNormalisasiTrack(raw.hewan, "hewan"),
    quiz: gameNormalisasiQuiz(raw.quiz),
    diperbarui: gameAngka(raw.diperbarui),
  };
}

function gameCacheKey(absen) {
  return `${GAME_CACHE_PREFIX}${absen}`;
}

function gameMuatCache(absen) {
  try {
    const raw = JSON.parse(localStorage.getItem(gameCacheKey(absen)) || "null");
    return raw ? gameNormalisasi(raw) : null;
  } catch (e) {
    return null;
  }
}

function gameSimpanCache() {
  if (!gameUserAbsen || !gameState) return;
  try {
    localStorage.setItem(gameCacheKey(gameUserAbsen), JSON.stringify(gameState));
  } catch (e) {}
}

function gameSimpanCloud() {
  if (!gameUserAbsen || !gameState) return;
  clearTimeout(gameSaveTimer);
  const absen = gameUserAbsen;
  const payload = JSON.parse(JSON.stringify(gameState));
  const { quiz, ...streak } = payload;
  const data = { streak };
  if (quiz) data.quiz = quiz;
  gameSaveTimer = setTimeout(() => {
    db.collection("games")
      .doc(String(absen))
      .set(data, { merge: true })
      .catch((err) => {
        if (!gameCloudWarned) {
          console.warn("Game disimpan di perangkat dulu (rules Firestore games belum aktif):", err.code || err.message);
          gameCloudWarned = true;
        }
      });
  }, 160);
}

function gameLangganan(absen) {
  if (gameUnsubscribe) {
    gameUnsubscribe();
    gameUnsubscribe = null;
  }
  const token = ++gameToken;
  gameUnsubscribe = db.collection("games").doc(String(absen)).onSnapshot(
    (snap) => {
      if (token !== gameToken || !currentUser || currentUser.absen !== absen || !gameState) return;
      if (snap.exists) {
        const data = snap.data();
        const remote = gameNormalisasi({ ...(data.streak || {}), quiz: data.quiz });
        if (remote.diperbarui >= gameState.diperbarui) {
          gameState = remote;
          gameSimpanCache();
          renderGames();
        } else {
          gameSimpanCloud();
        }
      } else if (gameState.diperbarui > 0) {
        gameSimpanCloud();
      }
    },
    (err) => {
      if (!gameCloudWarned) {
        console.warn("Game Streak jalan dari penyimpanan perangkat dulu:", err.code || err.message);
        gameCloudWarned = true;
      }
    }
  );
}

function gameLanggananPeringkat() {
  if (gamePeringkatUnsub) return;
  gamePeringkatSiap = false;
  gamePeringkatGagal = false;
  const token = ++gamePeringkatToken;
  gamePeringkatUnsub = db.collection("games").onSnapshot(
    (snap) => {
      if (token !== gamePeringkatToken) return;
      const peta = {};
      snap.forEach((doc) => {
        const absen = Number(doc.id);
        if (!Number.isInteger(absen)) return;
        const data = doc.data();
        peta[absen] = gameNormalisasi({ ...(data.streak || {}), quiz: data.quiz });
      });
      gamePeringkatCloud = peta;
      gamePeringkatSiap = true;
      gamePeringkatGagal = false;
      renderStreakPeringkat();
      renderQuizPeringkat();
    },
    (err) => {
      if (token !== gamePeringkatToken) return;
      gamePeringkatSiap = false;
      gamePeringkatGagal = true;
      if (!gamePeringkatWarned) {
        console.warn("Peringkat sementara dari perangkat ini:", err.code || err.message);
        gamePeringkatWarned = true;
      }
      renderStreakPeringkat();
      renderQuizPeringkat();
    }
  );
}

function gameHentikanPeringkat() {
  gamePeringkatToken++;
  if (gamePeringkatUnsub) {
    gamePeringkatUnsub();
    gamePeringkatUnsub = null;
  }
  gamePeringkatCloud = {};
  gamePeringkatSiap = false;
  gamePeringkatGagal = false;
}

function gamePetaSemua() {
  const peta = {};

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const kunci = localStorage.key(i);
      if (!kunci || kunci.indexOf(GAME_CACHE_PREFIX) !== 0) continue;
      const absen = Number(kunci.slice(GAME_CACHE_PREFIX.length));
      if (!Number.isInteger(absen) || !dataSiswa.some((s) => s.absen === absen)) continue;
      const state = gameMuatCache(absen);
      if (state) peta[absen] = state;
    }
  } catch (e) {}

  Object.keys(gamePeringkatCloud).forEach((kunci) => {
    const absen = Number(kunci);
    const remote = gamePeringkatCloud[kunci];
    if (!Number.isInteger(absen) || !remote) return;
    const lokal = peta[absen];
    if (!lokal || remote.diperbarui >= lokal.diperbarui) peta[absen] = remote;
  });

  if (gameUserAbsen && gameState) peta[gameUserAbsen] = gameState;
  return peta;
}

function gameEntriPeringkat() {
  const peta = gamePetaSemua();
  const entri = [];
  Object.keys(peta).forEach((kunci) => {
    const absen = Number(kunci);
    const state = peta[kunci];
    if (!state || !state.pohon || !state.hewan) return;
    const pohon = gameAngka(state.pohon.streak);
    const hewan = gameAngka(state.hewan.streak);
    const total = pohon + hewan;
    if (total <= 0) return;
    const akun = getMergedAccount(absen);
    if (!akun) return;
    entri.push({
      absen,
      nama: akun.namaPanggilan || `Absen ${absen}`,
      total,
      pohon,
      hewan,
      koin: gameAngka(state.koin),
      jenis: STREAK_HEWAN[state.hewan.jenis] ? state.hewan.jenis : "",
    });
  });

  entri.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.pohon !== a.pohon) return b.pohon - a.pohon;
    if (b.hewan !== a.hewan) return b.hewan - a.hewan;
    if (b.koin !== a.koin) return b.koin - a.koin;
    return a.absen - b.absen;
  });
  return entri;
}

function gameAmanTeks(teks) {
  return String(teks == null ? "" : teks)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function gameAvatarPeringkat(entri) {
  const hewan = STREAK_HEWAN[entri.jenis];
  return hewan ? hewan.emoji : "🌳";
}

function gameBarisPeringkat(entri, posisi) {
  const kamu = !!gameUserAbsen && entri.absen === gameUserAbsen;
  return `
    <li class="peringkat-row${kamu ? " is-kamu" : ""}">
      <span class="peringkat-rank">${posisi}</span>
      <span class="peringkat-avatar peringkat-avatar-kecil" aria-hidden="true">${gameAvatarPeringkat(entri)}</span>
      <span class="peringkat-info">
        <strong><span class="peringkat-nama-baris">${gameAmanTeks(entri.nama)}</span>${kamu ? `<span class="peringkat-kamu">Kamu</span>` : ""}</strong>
        <small>🌳 ${entri.pohon} hari · 🐾 ${entri.hewan} hari</small>
      </span>
      <span class="peringkat-total">🔥 ${entri.total}</span>
    </li>`;
}

function renderStreakPeringkat() {
  const el = document.getElementById("streak-peringkat");
  if (!el) return;
  if (!gameState) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;

  const entri = gameEntriPeringkat();
  const memuat = !gamePeringkatSiap && !gamePeringkatGagal;

  let status = "Peringkat sekelas, otomatis diperbarui.";
  if (memuat) status = "Memuat peringkat sekelas...";
  else if (gamePeringkatGagal) status = "Sementara dari perangkat ini.";

  const kepala = `
    <div class="streak-card-head">
      <div>
        <span class="streak-kind">🏆 Peringkat</span>
        <h3>Paling Rajin</h3>
      </div>
      <span class="streak-fire streak-fire-coin">${entri.length ? `🔥 ${entri.length} siswa` : "🌱 Mulai"}</span>
    </div>
    <p class="streak-hint">Total hari streak pohon + hewan. Makin rutin rawatnya, makin naik peringkatnya.</p>`;

  if (!entri.length) status = gamePeringkatGagal ? "Belum bisa memuat peringkat sekelas." : status;

  if (!entri.length && memuat) {
    el.innerHTML = `
      ${kepala}
      <div class="peringkat-skeleton" aria-hidden="true">
        ${Array.from({ length: 3 }, () => `
          <div class="peringkat-skeleton-row">
            <span class="skeleton peringkat-skeleton-avatar"></span>
            <span class="skeleton peringkat-skeleton-nama"></span>
            <span class="skeleton peringkat-skeleton-angka"></span>
          </div>`).join("")}
      </div>
      <p class="peringkat-status">${status}</p>`;
    return;
  }

  if (!entri.length) {
    el.innerHTML = `
      ${kepala}
      <div class="peringkat-kosong">
        <span class="peringkat-kosong-icon" aria-hidden="true">🌱</span>
        <strong>Belum ada yang mulai streak</strong>
        <p>Rawat pohon atau hewanmu hari ini, kamu bakal jadi yang pertama di papan peringkat!</p>
      </div>
      <p class="peringkat-status">${status}</p>`;
    return;
  }

  const juara = entri.slice(0, 3);
  const urutanPodium = [juara[1], juara[0], juara[2]].filter(Boolean);
  const medali = ["🥇", "🥈", "🥉"];
  const podiumHtml = `
    <div class="peringkat-podium">
      ${urutanPodium
        .map((e) => {
          const pos = juara.indexOf(e) + 1;
          const kamu = !!gameUserAbsen && e.absen === gameUserAbsen;
          return `
            <div class="peringkat-slot peringkat-slot-${pos}${kamu ? " is-kamu" : ""}">
              <div class="peringkat-podium-card">
                ${kamu ? `<span class="peringkat-kamu">Kamu</span>` : ""}
                <span class="peringkat-medal" aria-hidden="true">${medali[pos - 1]}</span>
                <span class="peringkat-avatar" aria-hidden="true">${gameAvatarPeringkat(e)}</span>
                <strong class="peringkat-nama" title="${gameAmanTeks(e.nama)}">${gameAmanTeks(e.nama)}</strong>
                <span class="peringkat-total">🔥 ${e.total} hari</span>
              </div>
              <span class="peringkat-base" aria-hidden="true">${pos}</span>
            </div>`;
        })
        .join("")}
    </div>`;

  const sisa = entri.slice(3, GAME_PERINGKAT_JUMLAH);
  const barisHtml = sisa.map((e) => gameBarisPeringkat(e, entri.indexOf(e) + 1)).join("");
  const posisiKamu = entri.findIndex((e) => e.absen === gameUserAbsen);
  const ekstraHtml =
    posisiKamu >= GAME_PERINGKAT_JUMLAH
      ? `<li class="peringkat-pisah" aria-hidden="true">···</li>${gameBarisPeringkat(entri[posisiKamu], posisiKamu + 1)}`
      : "";
  const ajakanHtml =
    posisiKamu === -1
      ? `<p class="peringkat-ajakan">Kamu belum masuk peringkat. Rawat pohon atau hewan hari ini buat mulai! 🌱</p>`
      : "";

  el.innerHTML = `
    ${kepala}
    ${podiumHtml}
    <ol class="peringkat-list">
      ${barisHtml}
      ${ekstraHtml}
    </ol>
    ${ajakanHtml}
    <p class="peringkat-status">${status}</p>`;
}

function updateGamesAccount() {
  const absen = currentUser ? Number(currentUser.absen) : null;
  if (absen === gameUserAbsen) {
    if (gameState) renderGames();
    return;
  }

  gamesSearchQuery = "";
  const cariGame = document.getElementById("games-search");
  if (cariGame) cariGame.value = "";

  gameUserAbsen = absen;
  gameToken++;
  gameQuizSesi = null;
  gameQuizLayar = "home";
  gameQuizRankFilter = QUIZ_RANK_TOTAL;
  if (gameUnsubscribe) {
    gameUnsubscribe();
    gameUnsubscribe = null;
  }
  if (typeof window.fishingAkunBerubah === "function") window.fishingAkunBerubah();
  if (typeof window.tableverseAkunBerubah === "function") window.tableverseAkunBerubah(currentUser || null);
  if (typeof window.gtcAkunBerubah === "function") window.gtcAkunBerubah(currentUser || null);

  if (!absen) {
    gameState = null;
    gameQuizSesi = null;
    gameQuizLayar = "home";
    gameQuizRankFilter = QUIZ_RANK_TOTAL;
    quizHentikanConfig();
    gameHentikanPeringkat();
    renderGames();
    return;
  }

  gameState = gameMuatCache(absen) || gameNormalisasi(gameStateAwal());
  gameQuizConfig = quizMuatConfigCache() || gameQuizConfig || quizNormalisasiConfig(null);
  renderGames();
  gameLangganan(absen);
  gameLanggananPeringkat();
  quizLanggananConfig();
}

function gameTahapPohon(streak) {
  if (streak >= 30) return 5;
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  if (streak >= 1) return 1;
  return 0;
}

function gameSvgPohon() {
  return `
    <svg class="pohon-svg" viewBox="0 0 220 200" role="img" aria-label="Pohon streak kamu">
      <defs>
        <linearGradient id="pohonDaun" x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0" stop-color="#63cc8e"/>
          <stop offset="0.55" stop-color="#2f8f5b"/>
          <stop offset="1" stop-color="#1f6d45"/>
        </linearGradient>
        <radialGradient id="pohonDaun2" cx="0.35" cy="0.28" r="0.9">
          <stop offset="0" stop-color="#74d89e"/>
          <stop offset="0.6" stop-color="#3aa265"/>
          <stop offset="1" stop-color="#24784e"/>
        </radialGradient>
        <linearGradient id="pohonBatang" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#b07f58"/>
          <stop offset="0.5" stop-color="#8a5a3b"/>
          <stop offset="1" stop-color="#6f452b"/>
        </linearGradient>
        <radialGradient id="pohonTanah" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stop-color="#bce0ca"/>
          <stop offset="1" stop-color="#dcefe2"/>
        </radialGradient>
      </defs>
      <ellipse class="pohon-tanah" cx="110" cy="184" rx="60" ry="9"/>
      <rect class="pohon-batang" x="101" y="96" width="18" height="86" rx="9"/>
      <ellipse class="pohon-batang-kilau" cx="106" cy="140" rx="3" ry="27"/>
      <path class="pohon-cabang" d="M110 130 L82 108 M110 120 L138 98"/>
      <g class="pohon-ayun">
        <g class="pohon-ranting">
          <circle cx="110" cy="72" r="42"/>
          <circle cx="76" cy="100" r="30"/>
          <circle cx="144" cy="100" r="30"/>
          <circle cx="92" cy="58" r="22"/>
          <circle cx="130" cy="58" r="22"/>
          <ellipse class="pohon-kilau" cx="88" cy="52" rx="17" ry="10" transform="rotate(-16 88 52)"/>
          <ellipse class="pohon-kilau pohon-kilau-kecil" cx="141" cy="92" rx="9" ry="6" transform="rotate(-20 141 92)"/>
          <g class="pohon-muka">
            <ellipse class="pohon-pipi" cx="91" cy="88" rx="7" ry="4.5"/>
            <ellipse class="pohon-pipi" cx="129" cy="88" rx="7" ry="4.5"/>
            <circle cx="98" cy="74" r="4"/>
            <circle cx="122" cy="74" r="4"/>
            <path d="M102 86 Q110 94 118 86"/>
          </g>
        </g>
        <g class="pohon-bunga">
          <circle cx="86" cy="63" r="5"/>
          <circle cx="130" cy="62" r="5"/>
          <circle cx="110" cy="39" r="5"/>
          <circle cx="66" cy="98" r="5"/>
          <circle cx="154" cy="98" r="5"/>
        </g>
      </g>
      <g class="pohon-tunas">
        <path d="M110 96 C96 90 92 78 94 70 C106 74 112 84 110 96Z"/>
        <path d="M110 96 C124 90 128 78 126 70 C114 74 108 84 110 96Z"/>
      </g>
    </svg>`;
}

/* ===== Update List (footer) ===== */
const UPDATE_LOG = [
  {
    tanggal: "14/11/26",
    items: [
      "Version 2.3.0 Game Guess the Color: Duel 1 vs 1 Tebak Urutan Warna",
      "Version 2.2.0 Game Timer: Stopwatch & Rundown",
      "Version 2.1.0 Pencarian Game, Pengaturan Urutan, dan Update List",
    ],
  },
  {
    tanggal: "11/11/26",
    items: [
      "Version 1.8.1 Second Games Quiz, Update",
      "Version 1.8 First Game Streaks, Update",
      "Version 1.7 Visual Update",
    ],
  },
];

function renderUpdateList() {
  const el = document.getElementById("updates-list");
  if (!el) return;
  el.innerHTML = UPDATE_LOG.map((grup) => `
    <section class="update-group">
      <h4 class="update-date">${grup.tanggal}</h4>
      <ul class="update-items">
        ${grup.items.map((teks) => `<li>${teks}</li>`).join("")}
      </ul>
    </section>`).join("");
}

function setupUpdatesModal() {
  const modal = document.getElementById("modal-updates");
  if (!modal) return;
  renderUpdateList();
  document.querySelectorAll("[data-open-updates]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openModal(modal);
      SoundFX.buttonClick();
    });
  });
  setupModalDismiss(modal);
}

/* ===== Pengaturan urutan game ===== */
// Fishing & TableVerse sengaja tidak ikut diatur.
const GAME_IDS_ATUR = ["timer", "guesscolor", "streak", "quiz"];
const GAME_INFO_ATUR = {
  timer: { judul: "Timer", icon: "⏱️" },
  guesscolor: { judul: "Guess the Color", icon: "🎨" },
  streak: { judul: "Streak", icon: "🔥" },
  quiz: { judul: "Quiz", icon: "🧠" },
};
const GAME_MODE_INFO = [
  { id: "default", judul: "Default", sub: "Urutan bawaan web." },
  { id: "recent", judul: "Recently Played", sub: "Terakhir dibuka di atas." },
  { id: "most", judul: "Most Played", sub: "Paling sering dimainkan di atas." },
  { id: "manual", judul: "Up to You", sub: "Atur sendiri pakai tombol panah." },
];

let gamesSearchQuery = "";
const gamesPrefs = { mode: "default", order: [...GAME_IDS_ATUR], usage: {} };

function gamesSettingsKey() {
  const absen = currentUser ? Number(currentUser.absen) : null;
  return `kelas73-games-prefs-v1-${absen || "guest"}`;
}

function gamesMuatPrefs() {
  gamesPrefs.mode = "default";
  gamesPrefs.order = [...GAME_IDS_ATUR];
  gamesPrefs.usage = {};
  try {
    const raw = JSON.parse(localStorage.getItem(gamesSettingsKey()) || "null");
    if (!raw) return gamesPrefs;
    if (GAME_MODE_INFO.some((m) => m.id === raw.mode)) gamesPrefs.mode = raw.mode;
    const order = Array.isArray(raw.order)
      ? raw.order.filter((id) => GAME_IDS_ATUR.includes(id))
      : [];
    gamesPrefs.order = [...new Set([...order, ...GAME_IDS_ATUR])];
    if (raw.usage && typeof raw.usage === "object") gamesPrefs.usage = raw.usage;
  } catch (e) {}
  return gamesPrefs;
}

function gamesSimpanPrefs() {
  try {
    localStorage.setItem(gamesSettingsKey(), JSON.stringify(gamesPrefs));
  } catch (e) {}
}

function gamesUrutanManual() {
  const urut = gamesPrefs.order.filter((id) => GAME_IDS_ATUR.includes(id));
  GAME_IDS_ATUR.forEach((id) => {
    if (!urut.includes(id)) urut.push(id);
  });
  return urut;
}

function gamesUrutkan(items) {
  const dasar = GAME_IDS_ATUR
    .map((id) => items.find((k) => k.id === id))
    .filter(Boolean);
  const indeks = (k) => dasar.findIndex((x) => x.id === k.id);

  if (gamesPrefs.mode === "recent" || gamesPrefs.mode === "most") {
    const kunci = gamesPrefs.mode === "recent" ? "last" : "plays";
    return [...dasar].sort((a, b) => {
      const ua = Number((gamesPrefs.usage[a.id] || {})[kunci]) || 0;
      const ub = Number((gamesPrefs.usage[b.id] || {})[kunci]) || 0;
      return ub - ua || indeks(a) - indeks(b);
    });
  }

  if (gamesPrefs.mode === "manual") {
    return gamesUrutanManual()
      .map((id) => dasar.find((k) => k.id === id))
      .filter(Boolean);
  }

  return dasar;
}

function catatGameDimainkan(id) {
  if (!GAME_IDS_ATUR.includes(id)) return;
  gamesMuatPrefs();
  const lama = gamesPrefs.usage[id] || {};
  gamesPrefs.usage[id] = {
    plays: (Number(lama.plays) || 0) + 1,
    last: Date.now(),
  };
  gamesSimpanPrefs();
}

function renderGamesSettings() {
  const modes = document.getElementById("games-settings-modes");
  const list = document.getElementById("games-settings-list");
  const hint = document.getElementById("games-settings-hint");
  if (!modes || !list || !hint) return;

  modes.innerHTML = GAME_MODE_INFO.map((mode) => `
    <button type="button" class="games-mode ${gamesPrefs.mode === mode.id ? "is-active" : ""}"
      data-games-mode="${mode.id}" role="radio" aria-checked="${gamesPrefs.mode === mode.id}">
      <strong>${mode.judul}</strong>
      <span>${mode.sub}</span>
    </button>`).join("");

  // Saat mode selain manual, tampilkan urutan efektif yang sedang dipakai.
  const urut = gamesPrefs.mode === "manual"
    ? gamesUrutanManual()
    : gamesUrutkan(GAME_IDS_ATUR.map((id) => ({ id }))).map((k) => k.id);
  list.innerHTML = urut.map((id, i) => {
    const info = GAME_INFO_ATUR[id];
    return `
      <div class="games-order-item">
        <span class="games-order-icon" aria-hidden="true">${info.icon}</span>
        <strong>${info.judul}</strong>
        <div class="games-order-actions">
          <button type="button" class="games-order-btn" data-games-move="up" data-game-id="${id}"
            ${i === 0 ? "disabled" : ""} aria-label="Naikkan ${info.judul}">&#8593;</button>
          <button type="button" class="games-order-btn" data-games-move="down" data-game-id="${id}"
            ${i === urut.length - 1 ? "disabled" : ""} aria-label="Turunkan ${info.judul}">&#8595;</button>
        </div>
      </div>`;
  }).join("");

  const petunjuk = {
    default: "Urutan bawaan: Timer, Guess the Color, Streak, lalu Quiz.",
    recent: "Game yang terakhir kamu buka tampil paling atas.",
    most: "Game yang paling sering kamu mainkan tampil paling atas.",
    manual: "Pakai tombol panah buat mengatur urutan game.",
  };
  let teks = petunjuk[gamesPrefs.mode] || petunjuk.default;
  if (gamesPrefs.mode === "recent" || gamesPrefs.mode === "most") {
    const adaRiwayat = GAME_IDS_ATUR.some((id) => {
      const u = gamesPrefs.usage[id] || {};
      return Number(u.plays) || Number(u.last);
    });
    if (!adaRiwayat) teks += " Belum ada riwayat, sementara pakai urutan default.";
  }
  hint.textContent = teks;
}

function gamesPilihMode(mode) {
  if (!GAME_MODE_INFO.some((m) => m.id === mode)) return;
  gamesPrefs.mode = mode;
  gamesSimpanPrefs();
  renderGamesSettings();
  renderGames();
  SoundFX.buttonClick();
}

function gamesPindahGame(id, arah) {
  const urut = gamesPrefs.mode === "manual"
    ? gamesUrutanManual()
    : gamesUrutkan(GAME_IDS_ATUR.map((x) => ({ id: x }))).map((k) => k.id);
  const i = urut.indexOf(id);
  const j = arah === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= urut.length) return;
  [urut[i], urut[j]] = [urut[j], urut[i]];
  gamesPrefs.order = urut;
  gamesPrefs.mode = "manual";
  gamesSimpanPrefs();
  renderGamesSettings();
  renderGames();
  SoundFX.buttonClick();
}

function setupGamesListExtras() {
  const search = document.getElementById("games-search");
  if (search) {
    search.addEventListener("input", () => {
      gamesSearchQuery = search.value;
      renderGames();
    });
  }

  const settingsBtn = document.getElementById("btn-games-settings");
  const modal = document.getElementById("modal-games-settings");
  if (settingsBtn && modal) {
    settingsBtn.addEventListener("click", () => {
      gamesMuatPrefs();
      renderGamesSettings();
      openModal(modal);
      SoundFX.buttonClick();
    });
    modal.addEventListener("click", (e) => {
      const modeBtn = e.target.closest("[data-games-mode]");
      if (modeBtn) {
        gamesPilihMode(modeBtn.dataset.gamesMode);
        return;
      }
      const moveBtn = e.target.closest("[data-games-move]");
      if (moveBtn && !moveBtn.disabled) {
        gamesPindahGame(moveBtn.dataset.gameId, moveBtn.dataset.gamesMove);
      }
    });
    setupModalDismiss(modal);
  }
}

function gameCardHTML(k) {
  return `
    <button class="game-card ${k.kelas || ""}" type="button" data-open-game="${k.id}">
      <span class="game-icon" aria-hidden="true">${k.icon}<span class="game-icon-spark">${k.spark}</span></span>
      <span class="game-info">
        <strong>${k.judul}</strong>
        <small>${k.deskripsi}</small>
        <span class="game-progress">${k.progress}</span>
      </span>
      <span class="game-play">Main <span aria-hidden="true">→</span></span>
    </button>`;
}

function renderGames() {
  const list = document.getElementById("games-list");
  if (!list) return;

  gamesMuatPrefs();

  const login = !!(currentUser && gameState);
  let ringkas = "Login dulu buat simpan progres di akunmu";
  if (login) {
    const hewan = gameState.hewan.jenis
      ? `${STREAK_HEWAN[gameState.hewan.jenis].emoji} ${gameState.hewan.streak} hari`
      : "belum pilih hewan";
    ringkas = `🔥 ${gameState.pohon.streak} hari pohon · ${hewan}`;
  }

  let ringkasQuiz = "Login dulu buat mulai kuis";
  if (login) {
    const quiz = gameState.quiz;
    ringkasQuiz = quiz.total > 0
      ? `🏅 ${quiz.poin} poin · ${quiz.benar}/${quiz.total} benar · ${quiz.sesi} sesi`
      : "Belum pernah main. Coba tema pertamamu!";
  }

  // TableVerse disembunyikan sementara (script-nya juga dinonaktifkan di index.html).
  const katalog = [
    {
      id: "timer",
      judul: "Timer",
      deskripsi: "Stopwatch atau timer rundown. Pilih durasi, langsung jalan tanpa login.",
      progress: "Tanpa login · Stopwatch & rundown",
      icon: "⏱️",
      spark: "⏳",
      kelas: "game-card-timer",
      cari: "timer stopwatch rundown hitung waktu jam menit detik alarm",
    },
    {
      id: "guesscolor",
      judul: "Guess the Color",
      deskripsi: "Duel 1 lawan 1. Susun 4 warna rahasia, tebak kode lawan sebelum percobaanmu habis.",
      progress: login ? "Siap duel · 5 menit & 5 percobaan" : "Login dulu buat duel sama teman",
      icon: "🎨",
      spark: "🌈",
      kelas: "game-card-guesscolor",
      cari: "guess the color warna tebak duel 1v1 lawan teman undangan room kode rahasia",
    },
    {
      id: "streak",
      judul: "Streak",
      deskripsi: "Rawat pohon & hewan tiap hari, kumpulkan coin buat hias pet.",
      progress: ringkas,
      icon: "🔥",
      spark: "✨",
      kelas: "",
      cari: "streak pohon hewan coin hias pet rawat harian",
    },
    {
      id: "quiz",
      judul: "Quiz",
      deskripsi: "Latihan pilihan ganda A–D dari banyak mapel. Kumpulkan poin, naik peringkat!",
      progress: ringkasQuiz,
      icon: "🧠",
      spark: "💡",
      kelas: "game-card-quiz",
      cari: "quiz kuis pilihan ganda mapel poin peringkat latihan",
    },
  ];

  const semua = gamesUrutkan(katalog);
  const q = gamesSearchQuery.trim().toLowerCase();
  const tampil = q
    ? semua.filter((k) => `${k.judul} ${k.deskripsi} ${k.cari}`.toLowerCase().includes(q))
    : semua;

  list.innerHTML = tampil.map(gameCardHTML).join("");

  const kosong = document.getElementById("games-empty");
  if (kosong) kosong.hidden = tampil.length > 0;

  renderQuiz();

  const locked = document.getElementById("streak-locked");
  const content = document.getElementById("streak-content");
  const koinEl = document.getElementById("streak-koin");
  if (!locked || !content) return;

  if (!login) {
    content.hidden = true;
    locked.hidden = false;
    locked.innerHTML = `
      <div class="streak-locked-card">
        <span class="streak-locked-icon" aria-hidden="true">🔒</span>
        <h3>Login dulu buat mulai Streak</h3>
        <p>Progres pohon, hewan, coin, dan hiasan disimpan di akunmu. Jadi kalau ganti perangkat, progresnya tetap ada.</p>
        <button class="btn-primary" type="button" data-game-login>Login Sekarang</button>
      </div>`;
    if (koinEl) koinEl.textContent = "💰 0 coin";
    return;
  }

  locked.hidden = true;
  content.hidden = false;
  if (koinEl) koinEl.textContent = `💰 ${gameState.koin} coin`;
  renderStreakPohon();
  renderStreakHewan();
  renderStreakPeringkat();
  renderStreakHias();
}

function renderStreakPohon() {
  const el = document.getElementById("streak-pohon");
  if (!el || !gameState) return;
  const track = gameState.pohon;
  const hariIni = gameTanggal();
  const sudahSiram = track.siram === hariIni;
  const sudahBersih = track.bersih === hariIni;
  const tahap = gameTahapPohon(track.streak);

  let petunjuk = "Siram pohon setiap hari biar streak gak putus.";
  if (sudahSiram && sudahBersih) petunjuk = "Hari ini pohonmu sudah terawat. Balik lagi besok ya!";
  else if (sudahSiram) petunjuk = "Masih ada daun berguguran. Bersihkan buat +5 coin.";
  else if (track.streak === 0) petunjuk = "Siram pohon hari ini buat mulai streak pertamamu.";

  el.innerHTML = `
    <div class="streak-card-head">
      <div>
        <span class="streak-kind">🌳 Tipe Streak 1</span>
        <h3>Rawat Pohon</h3>
      </div>
      <span class="streak-fire">🔥 ${track.streak} hari</span>
    </div>
    <div class="streak-stats">
      <span class="streak-chip" title="Tiap sehari yang kelewatan memakai 1 kesempatan.">🛡️ ${track.kesempatan}/${GAME_MAKS_KESEMPATAN} kesempatan</span>
      <span class="streak-chip">${sudahSiram ? "✅ Sudah disiram" : "💧 Belum disiram"}</span>
    </div>
    <div class="pohon-stage" data-stage="${tahap}">
      <span class="scene" aria-hidden="true">
        <span class="scene-sun"></span>
        <span class="scene-cloud scene-cloud-1">☁️</span>
        <span class="scene-cloud scene-cloud-2">☁️</span>
        <span class="scene-hill scene-hill-1"></span>
        <span class="scene-hill scene-hill-2"></span>
        <span class="scene-grass scene-grass-1">🌿</span>
        <span class="scene-grass scene-grass-2">🌱</span>
        <span class="scene-grass scene-grass-3">🌿</span>
        ${tahap >= 3 ? `<span class="scene-firefly scene-firefly-1">✨</span><span class="scene-firefly scene-firefly-2">✨</span>` : ""}
      </span>
      ${gameSvgPohon()}
      <span class="pohon-kesiram" aria-hidden="true">💧</span>
      ${sudahBersih ? "" : `<span class="daun-gugur daun-gugur-1" aria-hidden="true">🍂</span><span class="daun-gugur daun-gugur-2" aria-hidden="true">🍃</span><span class="daun-gugur daun-gugur-3" aria-hidden="true">🍂</span>`}
    </div>
    <p class="streak-hint">${petunjuk}</p>
    <div class="streak-actions">
      <button class="btn-primary" type="button" data-game-action="siram" ${sudahSiram ? "disabled" : ""}>
        ${sudahSiram ? "✅ Sudah Disiram" : "💧 Siram · +2 coin"}
      </button>
      <button class="btn-secondary" type="button" data-game-action="bersih" ${sudahBersih ? "disabled" : ""}>
        ${sudahBersih ? "✅ Daun Sudah Bersih" : "🍂 Bersihkan Daun · +5 coin"}
      </button>
    </div>
    <p class="streak-hint streak-hint-small">Kesempatan otomatis reset tiap tanggal 1. Pohon makin besar kalau streak makin panjang.</p>`;
}

function renderStreakHewan() {
  const el = document.getElementById("streak-hewan");
  if (!el || !gameState) return;
  const track = gameState.hewan;
  const hariIni = gameTanggal();
  const info = STREAK_HEWAN[track.jenis];

  if (!info) {
    el.innerHTML = `
      <div class="streak-card-head">
        <div>
          <span class="streak-kind">🐾 Tipe Streak 2</span>
          <h3>Rawat Hewan</h3>
        </div>
      </div>
      <p class="streak-hint">Pilih satu hewan peliharaan buat dirawat dan dihias. Pilihan ini disimpan di akunmu.</p>
      <div class="pet-pilih-grid">
        ${Object.entries(STREAK_HEWAN)
          .map(
            ([id, h]) => `
            <button class="pet-pilih" type="button" data-game-action="pilih-hewan" data-hewan="${id}">
              <span class="pet-pilih-emoji" aria-hidden="true">${h.emoji}</span>
              <strong>${h.nama}</strong>
            </button>`
          )
          .join("")}
      </div>`;
    return;
  }

  const sudahMakan = track.makan === hariIni;
  const sudahMinum = track.minum === hariIni;
  const lengkap = sudahMakan && sudahMinum;
  const baju = STREAK_BAJU.find((i) => i.id === track.pakaiBaju);
  const mainan = STREAK_MAINAN.find((i) => i.id === track.pakaiMainan);
  const mood = lengkap ? "😊" : "🥺";

  let petunjuk = "Beri makan + minum setiap hari buat jaga streak.";
  if (lengkap) petunjuk = "Hari ini hewanmu sudah kenyang dan segar. Balik lagi besok ya!";
  else if (!sudahMakan && gameState.koin < 1) petunjuk = "Coin habis. Siram & bersihkan pohon dulu biar bisa beli makanan.";
  else if (sudahMakan) petunjuk = "Tinggal kasih minum gratis buat lengkapi rawatan hari ini.";

  const tombolMakan = sudahMakan
    ? `<button class="btn-secondary" type="button" disabled>✅ Sudah Makan</button>`
    : `<button class="btn-secondary" type="button" data-game-action="makan" data-harga="1" ${gameState.koin < 1 ? "disabled" : ""}>
         🍖 Makanan Biasa · 1 coin
       </button>
       <button class="btn-secondary" type="button" data-game-action="makan" data-harga="2" ${gameState.koin < 2 ? "disabled" : ""}>
         🍗 Makanan Spesial · 2 coin
       </button>`;

  el.innerHTML = `
    <div class="streak-card-head">
      <div>
        <span class="streak-kind">🐾 Tipe Streak 2</span>
        <h3>Rawat Hewan</h3>
      </div>
      <span class="streak-fire">🔥 ${track.streak} hari</span>
    </div>
    <div class="streak-stats">
      <span class="streak-chip" title="Tiap sehari yang kelewatan memakai 1 kesempatan.">🛡️ ${track.kesempatan}/${GAME_MAKS_KESEMPATAN} kesempatan</span>
      <span class="streak-chip">${lengkap ? "✅ Sudah dirawat" : "⏳ Belum lengkap"}</span>
    </div>
    <div class="pet-stage">
      <span class="scene" aria-hidden="true">
        <span class="scene-sun"></span>
        <span class="scene-cloud scene-cloud-1">☁️</span>
        <span class="scene-cloud scene-cloud-2">☁️</span>
        <span class="scene-hill scene-hill-1"></span>
        <span class="scene-hill scene-hill-2"></span>
        <span class="scene-grass scene-grass-1">🌿</span>
        <span class="scene-grass scene-grass-2">🌱</span>
        <span class="scene-grass scene-grass-3">🌿</span>
      </span>
      <span class="pet-shadow" aria-hidden="true"></span>
      ${baju ? `<span class="pet-aksesoris" title="${baju.nama}" aria-hidden="true">${baju.emoji}</span>` : ""}
      <span class="pet-emoji" aria-hidden="true">${info.emoji}</span>
      ${mainan ? `<span class="pet-mainan" title="${mainan.nama}" aria-hidden="true">${mainan.emoji}</span>` : ""}
      <span class="pet-mood ${lengkap ? "happy" : "sad"}">
        <span class="pet-mood-emoji" aria-hidden="true">${mood}</span>
        <span class="pet-mood-text">${lengkap ? "Sehat!" : "Lapar..."}</span>
      </span>
      ${lengkap ? `<span class="pet-sparkle pet-sparkle-1" aria-hidden="true">✨</span><span class="pet-sparkle pet-sparkle-2" aria-hidden="true">✨</span><span class="pet-sparkle pet-sparkle-3" aria-hidden="true">✨</span>` : ""}
    </div>
    <p class="pet-name">${info.emoji} ${info.nama} Kamu</p>
    <div class="pet-checklist">
      <span class="pet-task ${sudahMakan ? "done" : ""}">${sudahMakan ? "✅" : "🍖"} Makan</span>
      <span class="pet-task ${sudahMinum ? "done" : ""}">${sudahMinum ? "✅" : "💧"} Minum</span>
    </div>
    <p class="streak-hint">${petunjuk}</p>
    <div class="pet-actions">
      ${tombolMakan}
      <button class="btn-secondary" type="button" data-game-action="minum" ${sudahMinum ? "disabled" : ""}>
        ${sudahMinum ? "✅ Sudah Minum" : "💧 Air Minum · Gratis"}
      </button>
    </div>`;
}

function gameKartuToko(item, jenis, track) {
  const daftar = jenis === "baju" ? track.baju : track.mainan;
  const dipakai = jenis === "baju" ? track.pakaiBaju : track.pakaiMainan;
  const dimiliki = daftar.includes(item.id);
  const terpakai = dipakai === item.id;

  if (dimiliki) {
    return `
      <button class="shop-item dimiliki ${terpakai ? "terpakai" : ""}" type="button" data-game-action="pakai" data-jenis="${jenis}" data-item="${item.id}">
        <span class="shop-emoji" aria-hidden="true">${item.emoji}</span>
        <span class="shop-name">${item.nama}</span>
        <span class="shop-state">${terpakai ? "✓ Dipakai" : "Pakai"}</span>
      </button>`;
  }

  const cukup = gameState.koin >= item.harga;
  return `
    <button class="shop-item ${cukup ? "" : "kurang"}" type="button" data-game-action="beli" data-jenis="${jenis}" data-item="${item.id}" ${cukup ? "" : "disabled"}>
      <span class="shop-emoji" aria-hidden="true">${item.emoji}</span>
      <span class="shop-name">${item.nama}</span>
      <span class="shop-price">💰 ${item.harga}</span>
      <span class="shop-state">${cukup ? "Beli" : "Coin kurang"}</span>
    </button>`;
}

function renderStreakHias() {
  const el = document.getElementById("streak-hias");
  if (!el || !gameState) return;
  const track = gameState.hewan;
  const info = STREAK_HEWAN[track.jenis];
  if (!info) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }

  el.hidden = false;
  el.innerHTML = `
    <div class="streak-card-head">
      <div>
        <span class="streak-kind">✨ Hias Pet</span>
        <h3>Bikin ${info.nama} Kamu Gaya</h3>
      </div>
      <span class="streak-fire streak-fire-coin">💰 ${gameState.koin} coin</span>
    </div>
    <p class="streak-hint">Beli baju & mainan pakai coin dari rawat pohon. Barang yang sudah dimiliki bisa dipakai atau dilepas kapan aja.</p>
    <div class="shop-groups">
      <div class="shop-group">
        <h4>👕 Baju</h4>
        <div class="shop-grid">
          ${STREAK_BAJU.map((item) => gameKartuToko(item, "baju", track)).join("")}
        </div>
      </div>
      <div class="shop-group">
        <h4>🧸 Mainan</h4>
        <div class="shop-grid">
          ${STREAK_MAINAN.map((item) => gameKartuToko(item, "mainan", track)).join("")}
        </div>
      </div>
    </div>`;
}

function gameTampilNotice(pesan) {
  const el = document.getElementById("streak-notice");
  if (!el) return;
  el.textContent = pesan;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(gameNoticeTimer);
  gameNoticeTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

function gameSelesaiAksi(pesan, animasi = null) {
  gameState.diperbarui = Date.now();
  gameSimpanCache();
  gameSimpanCloud();
  renderGames();
  gameTampilNotice(pesan);
  SoundFX.resultReveal();

  if (animasi === "siram") {
    const stage = document.querySelector("#streak-pohon .pohon-stage");
    if (stage) {
      stage.classList.add("disiram");
      setTimeout(() => stage.classList.remove("disiram"), 900);
    }
  }
}

function gameCatatRawat(track, hariIni) {
  if (track.terakhir === hariIni) return false;
  track.streak = Math.max(0, track.streak) + 1;
  track.terakhir = hariIni;
  track.dicek = hariIni;
  return true;
}

function gameCariItem(jenis, id) {
  return (jenis === "baju" ? STREAK_BAJU : STREAK_MAINAN).find((i) => i.id === id) || null;
}

function gameTanganiAksi(aksi, btn) {
  if (!currentUser || !gameState) {
    document.getElementById("btn-show-login").click();
    return;
  }

  const hariIni = gameTanggal();
  gameProsesHari(gameState.pohon, hariIni);
  gameProsesHari(gameState.hewan, hariIni);
  const pohon = gameState.pohon;
  const hewan = gameState.hewan;

  if (aksi === "siram") {
    if (pohon.siram === hariIni) return;
    pohon.siram = hariIni;
    gameState.koin += 2;
    const naik = gameCatatRawat(pohon, hariIni);
    gameSelesaiAksi(
      naik ? `+2 coin! Pohon disiram, streak jadi ${pohon.streak} hari.` : "+2 coin! Pohon sudah disiram hari ini.",
      "siram"
    );
    return;
  }

  if (aksi === "bersih") {
    if (pohon.bersih === hariIni) return;
    pohon.bersih = hariIni;
    gameState.koin += 5;
    gameSelesaiAksi("+5 coin! Daun-daun pohonmu sudah bersih.");
    return;
  }

  if (aksi === "pilih-hewan") {
    const id = btn.dataset.hewan;
    const info = STREAK_HEWAN[id];
    if (!info || hewan.jenis) return;
    hewan.jenis = id;
    gameState.diperbarui = Date.now();
    gameSimpanCache();
    gameSimpanCloud();
    renderGames();
    gameTampilNotice(`Kamu memilih ${info.nama}! Rawat dia tiap hari ya.`);
    SoundFX.teamsReady();
    return;
  }

  if (aksi === "makan") {
    if (!hewan.jenis || hewan.makan === hariIni) return;
    const harga = gameAngka(btn.dataset.harga, 1, 2) || 1;
    if (gameState.koin < harga) {
      gameTampilNotice("Coin belum cukup. Rawat pohon dulu buat nambah coin.");
      SoundFX.lockedPick();
      return;
    }
    gameState.koin -= harga;
    hewan.makan = hariIni;
    const lengkapMakan = hewan.minum === hariIni;
    const baruRawat = lengkapMakan && gameCatatRawat(hewan, hariIni);
    let pesanMakan = `Makanan habis, -${harga} coin. Tinggal kasih minum gratis ya.`;
    if (baruRawat) pesanMakan = `Makanan habis, -${harga} coin. Hari ini hewanmu sudah dirawat, streak jadi ${hewan.streak} hari!`;
    else if (lengkapMakan) pesanMakan = `Makanan habis, -${harga} coin. Rawatan hari ini sudah lengkap.`;
    gameSelesaiAksi(pesanMakan);
    return;
  }

  if (aksi === "minum") {
    if (!hewan.jenis || hewan.minum === hariIni) return;
    hewan.minum = hariIni;
    const lengkapMinum = hewan.makan === hariIni;
    const baruRawat = lengkapMinum && gameCatatRawat(hewan, hariIni);
    let pesanMinum = "Air minum gratis sudah diberikan. Jangan lupa beri makan juga ya.";
    if (baruRawat) pesanMinum = `Hewanmu segar! Hari ini sudah dirawat, streak jadi ${hewan.streak} hari.`;
    else if (lengkapMinum) pesanMinum = "Hewanmu segar! Rawatan hari ini sudah lengkap.";
    gameSelesaiAksi(pesanMinum);
    return;
  }

  if (aksi === "beli") {
    const jenis = btn.dataset.jenis;
    const item = gameCariItem(jenis, btn.dataset.item);
    if (!item) return;
    const daftar = jenis === "baju" ? hewan.baju : hewan.mainan;
    if (daftar.includes(item.id)) return;
    if (gameState.koin < item.harga) {
      gameTampilNotice("Coin belum cukup buat beli ini.");
      SoundFX.lockedPick();
      return;
    }

    gameState.koin -= item.harga;
    daftar.push(item.id);
    if (jenis === "baju") hewan.pakaiBaju = item.id;
    else hewan.pakaiMainan = item.id;
    gameSelesaiAksi(`${item.nama} dibeli (-${item.harga} coin) dan langsung dipakai!`);
    return;
  }

  if (aksi === "pakai") {
    const jenis = btn.dataset.jenis;
    const item = gameCariItem(jenis, btn.dataset.item);
    if (!item) return;
    const daftar = jenis === "baju" ? hewan.baju : hewan.mainan;
    if (!daftar.includes(item.id)) return;
    const kunci = jenis === "baju" ? "pakaiBaju" : "pakaiMainan";
    const sedangDipakai = hewan[kunci] === item.id;
    hewan[kunci] = sedangDipakai ? "" : item.id;
    gameState.diperbarui = Date.now();
    gameSimpanCache();
    gameSimpanCloud();
    renderGames();
    gameTampilNotice(sedangDipakai ? `${item.nama} dilepas.` : `${item.nama} dipakai!`);
    SoundFX.buttonClick();
  }
}

/* ===================================================
   12b. GAMES: QUIZ
   - Banyak mapel & tema, soal pilihan ganda A-D.
   - Soal tidak diulang sampai semua soal tema sudah dicoba.
   - Admin / Owner bisa mengubah mapel, tema, dan menambah soal.
   - Progres per akun: gameState.quiz (lokal + games/{absen}.quiz).
   - Konfigurasi tema global: quizConfig/main (fallback lokal).
=================================================== */
const QUIZ_CACHE_CONFIG = "kelas73_quiz_config";
const QUIZ_PER_SESI = 10;
const QUIZ_MAKS_SOAL_CUSTOM = 200;
const QUIZ_POIN_BENAR = 10;
const QUIZ_BONUS_SEMPURNA = 25;
const QUIZ_RANK_JUMLAH = 10;
const QUIZ_RANK_TOTAL = "total";

const QUIZ_SUBJECTS_DEFAULT = [
  {
    id: "matematika",
    nama: "Matematika",
    emoji: "📐",
    topics: [
      { id: "mtk-skala", nama: "Skala", emoji: "🗺️" },
      { id: "mtk-perbandingan", nama: "Perbandingan", emoji: "⚖️" },
      { id: "mtk-rasio", nama: "Rasio", emoji: "➗" },
      { id: "mtk-senilai", nama: "Senilai & Berbalik Nilai", emoji: "🔄" },
    ],
  },
  {
    id: "bindo",
    nama: "Bahasa Indonesia",
    emoji: "📖",
    topics: [
      { id: "bindo-konjungsi", nama: "Konjungsi", emoji: "🔗" },
      { id: "bindo-kataganti", nama: "Kata Ganti", emoji: "🙋" },
    ],
  },
  { id: "pancasila", nama: "Pancasila", emoji: "🦅", topics: [{ id: "pancasila-norma", nama: "Norma-Norma", emoji: "📜" }] },
  { id: "pjok", nama: "PJOK", emoji: "⚾", topics: [{ id: "pjok-kasti", nama: "Bola Kasti", emoji: "🥎" }] },
  { id: "inggris", nama: "Bahasa Inggris", emoji: "🇬🇧", topics: [{ id: "inggris-simplepresent", nama: "Simple Present Tense", emoji: "⏰" }] },
  { id: "sunda", nama: "Bahasa Sunda", emoji: "🏞️", topics: [{ id: "sunda-cerita", nama: "Cerita", emoji: "📚" }] },
  {
    id: "tik",
    nama: "TIK",
    emoji: "💻",
    topics: [
      { id: "tik-scratch", nama: "Scratch", emoji: "🐱" },
      { id: "tik-pictoblox", nama: "Pictoblox Block", emoji: "🧩" },
    ],
  },
  {
    id: "ipa",
    nama: "IPA",
    emoji: "🔬",
    topics: [
      { id: "ipa-fisika", nama: "Fisika", emoji: "🧲" },
      { id: "ipa-kimia", nama: "Kimia", emoji: "⚗️" },
    ],
  },
  { id: "pai", nama: "Agama Islam", emoji: "🕌", topics: [{ id: "pai-sujud", nama: "Macam-Macam Sujud", emoji: "🤲" }] },
  { id: "ips", nama: "IPS", emoji: "🌏", topics: [{ id: "ips-ekonomi", nama: "Ekonomi: Produksi, Distribusi, Konsumsi", emoji: "💰" }] },
  { id: "seni", nama: "Seni Musik", emoji: "🎵", topics: [{ id: "seni-ritme", nama: "Ritme", emoji: "🥁" }] },
];

// Format: [pertanyaan, "A|B|C|D", index jawaban benar, pembahasan]
const QUIZ_BANK_DASAR = {
  "mtk-skala": [
    ["Skala 1 : 500 artinya 1 cm pada peta mewakili ...", "5 m|50 m|500 m|0,5 m", 0, "1 × 500 cm = 500 cm = 5 m."],
    ["Jarak dua tempat pada peta 4 cm. Jika skala 1 : 200.000, jarak sebenarnya ...", "8 km|2 km|80 km|800 m", 0, "4 × 200.000 cm = 800.000 cm = 8 km."],
    ["Jarak sebenarnya dua kota 24 km. Pada peta jaraknya 6 cm. Skala peta adalah ...", "1 : 400.000|1 : 40.000|1 : 4.000.000|1 : 240.000", 0, "24 km = 2.400.000 cm. Skala = 6 : 2.400.000 = 1 : 400.000."],
    ["Skala peta 1 : 1.000.000. Jarak sebenarnya 50 km. Jarak pada peta ...", "5 cm|50 cm|0,5 cm|500 cm", 0, "50 km = 5.000.000 cm. 5.000.000 : 1.000.000 = 5 cm."],
    ["Rumus skala yang benar adalah ...", "skala = jarak pada gambar : jarak sebenarnya|skala = jarak sebenarnya : jarak pada gambar|skala = jarak sebenarnya × jarak pada gambar|skala = jarak pada gambar + jarak sebenarnya", 0, "Skala membandingkan jarak pada gambar dengan jarak sebenarnya."],
    ["Panjang sebuah gedung digambar 8 cm dengan skala 1 : 250. Panjang sebenarnya ...", "20 m|2 m|200 m|32 m", 0, "8 × 250 cm = 2.000 cm = 20 m."],
    ["Peta berskala 1 : 400.000. Jarak 2,5 cm pada peta sama dengan ...", "10 km|1 km|100 km|4 km", 0, "2,5 × 400.000 = 1.000.000 cm = 10 km."],
    ["Skala 1 : 50. Tinggi gambar 12 cm. Tinggi sebenarnya ...", "6 m|60 m|0,6 m|600 cm", 0, "12 × 50 = 600 cm = 6 m."],
    ["Membandingkan skala 1 : 100 dengan 1 : 1.000, yang benar adalah ...", "1 : 100 menggambar objek lebih besar|1 : 1.000 menggambar objek lebih besar|keduanya sama besar|1 : 100 tidak punya satuan", 0, "Angka skala 1 : 100 lebih kecil, jadi gambar relatif lebih besar."],
    ["Jarak kota A dan B 120 km. Skala 1 : 1.500.000. Jarak pada peta ...", "8 cm|12 cm|80 cm|6 cm", 0, "120 km = 12.000.000 cm. 12.000.000 : 1.500.000 = 8 cm."],
  ],
  "mtk-perbandingan": [
    ["Perbandingan kelereng Andi dan Budi 3 : 5. Jika jumlahnya 40, kelereng Andi ...", "15|25|24|10", 0, "3 + 5 = 8 bagian. 40 : 8 = 5. Andi = 3 × 5 = 15."],
    ["Perbandingan A : B = 2 : 3. Jika selisihnya 10, nilai B ...", "30|20|15|40", 0, "Selisih 1 bagian = 10. B = 3 × 10 = 30."],
    ["Perbandingan 12 : 15 dalam bentuk paling sederhana ...", "4 : 5|3 : 4|2 : 3|6 : 5", 0, "Keduanya dibagi 3."],
    ["Uang Andi : Budi = 5 : 7. Uang Budi Rp35.000. Uang Andi ...", "Rp25.000|Rp35.000|Rp49.000|Rp20.000", 0, "1 bagian = 35.000 : 7 = 5.000. Andi = 5 × 5.000 = 25.000."],
    ["Perbandingan 0,5 : 2 sama dengan ...", "1 : 4|1 : 2|2 : 4|4 : 1", 0, "Kalikan 2 menjadi 1 : 4."],
    ["Kelereng Ani dan Budi 5 : 3. Jumlahnya 64. Kelereng Ani ...", "40|24|32|45", 0, "8 bagian = 64, 1 bagian = 8. Ani = 40."],
    ["Perbandingan A : B : C = 2 : 3 : 5. Jumlahnya 100. Nilai C ...", "50|30|20|40", 0, "10 bagian = 100, 1 bagian = 10. C = 50."],
    ["Rasio 18 : 24 paling sederhana ...", "3 : 4|2 : 3|4 : 5|6 : 8", 0, "Dibagi 6."],
    ["Perbandingan banyak siswa laki-laki dan perempuan 4 : 5. Jika total 36, siswa laki-laki ...", "16|20|18|15", 0, "9 bagian = 36, 1 bagian = 4. Laki-laki = 16."],
    ["Umur ayah : anak = 7 : 2. Umur anak 14 tahun. Umur ayah ...", "49 tahun|42 tahun|28 tahun|35 tahun", 0, "2 bagian = 14, 1 bagian = 7. Ayah = 49 tahun."],
  ],
  "mtk-rasio": [
    ["Rasio 15 : 25 dalam bentuk sederhana ...", "3 : 5|5 : 3|2 : 5|15 : 25", 0, "Dibagi 5 menjadi 3 : 5."],
    ["Rasio siswa laki-laki : perempuan = 3 : 4. Total 28. Laki-laki ...", "12|16|10|14", 0, "7 bagian = 28, 1 bagian = 4. Laki-laki = 12."],
    ["Dua bilangan berbanding 4 : 7. Jumlahnya 55. Bilangan terkecil ...", "20|35|25|15", 0, "11 bagian = 55, 1 bagian = 5. Terkecil = 20."],
    ["Rasio 0,25 : 0,75 sama dengan ...", "1 : 3|1 : 2|3 : 1|2 : 3", 0, "Kalikan 4 menjadi 1 : 3."],
    ["Rasio 2/5 : 3/5 sama dengan ...", "2 : 3|3 : 2|5 : 3|2 : 5", 0, "Penyebut sama, bandingkan pembilangnya."],
    ["Resep memakai 3 gelas tepung dan 2 gelas gula. Jika tepung 9 gelas, gula ...", "6 gelas|8 gelas|4 gelas|12 gelas", 0, "3 → 9 dikali 3, maka gula 2 × 3 = 6."],
    ["Umur kakak : adik = 3 : 2. Umur kakak 24 tahun. Umur adik ...", "16 tahun|18 tahun|12 tahun|20 tahun", 0, "3 bagian = 24, 1 bagian = 8. Adik = 16 tahun."],
    ["Di kelas ada 40 siswa, 24 di antaranya perempuan. Rasio laki-laki : perempuan ...", "2 : 3|3 : 2|3 : 5|2 : 5", 0, "Laki-laki 16, perempuan 24. 16 : 24 = 2 : 3."],
    ["Bentuk paling sederhana 45 : 60 ...", "3 : 4|4 : 3|5 : 6|9 : 12", 0, "Dibagi 15 menjadi 3 : 4."],
    ["Rasio 1 jam : 30 menit ...", "2 : 1|1 : 2|1 : 30|30 : 1", 0, "1 jam = 60 menit. 60 : 30 = 2 : 1."],
  ],
  "mtk-senilai": [
    ["Harga 5 buku Rp20.000. Harga 8 buku ...", "Rp32.000|Rp30.000|Rp40.000|Rp28.000", 0, "1 buku Rp4.000, 8 buku Rp32.000."],
    ["6 pekerja menyelesaikan pekerjaan dalam 18 hari. Jika 9 pekerja, waktu ...", "12 hari|27 hari|9 hari|15 hari", 0, "Berbalik nilai: 6 × 18 : 9 = 12 hari."],
    ["Mobil menempuh perjalanan 4 jam dengan kecepatan 60 km/jam. Dengan kecepatan 80 km/jam, waktu ...", "3 jam|5 jam|3,5 jam|4,5 jam", 0, "Jarak 240 km. 240 : 80 = 3 jam."],
    ["Harga 3 kg apel Rp45.000. Harga 5 kg apel ...", "Rp75.000|Rp60.000|Rp80.000|Rp90.000", 0, "1 kg Rp15.000, 5 kg Rp75.000."],
    ["Persediaan makanan 12 ekor sapi cukup 10 hari. Jika 15 ekor sapi, cukup ...", "8 hari|12 hari|6 hari|9 hari", 0, "Berbalik nilai: 12 × 10 : 15 = 8 hari."],
    ["Contoh perbandingan berbalik nilai adalah ...", "banyak pekerja dan lama pekerjaan|banyak barang dan total harga|jumlah liter dan jarak tempuh|banyak buku dan beratnya", 0, "Makin banyak pekerja, makin singkat waktu pekerjaan."],
    ["4 mesin menyelesaikan pekerjaan dalam 30 menit. Jika 6 mesin, waktu ...", "20 menit|45 menit|25 menit|15 menit", 0, "Berbalik nilai: 4 × 30 : 6 = 20 menit."],
    ["2 liter bensin menempuh 40 km. 5 liter bensin menempuh ...", "100 km|80 km|120 km|90 km", 0, "1 liter = 20 km. 5 liter = 100 km."],
    ["8 orang menyelesaikan pekerjaan 15 hari. Jika 10 orang, waktu ...", "12 hari|18 hari|10 hari|14 hari", 0, "Berbalik nilai: 8 × 15 : 10 = 12 hari."],
    ["Harga 1 lusin pensil Rp36.000. Harga 5 pensil ...", "Rp15.000|Rp12.000|Rp18.000|Rp20.000", 0, "1 pensil Rp3.000. 5 pensil Rp15.000."],
  ],
  "bindo-konjungsi": [
    ["Saya ingin pergi, ... hujan turun sangat deras.", "tetapi|karena|sehingga|atau", 0, "Menghubungkan dua hal yang bertentangan."],
    ["Dia rajin belajar ... menjadi juara kelas.", "sehingga|tetapi|atau|meskipun", 0, "Menunjukkan akibat."],
    ["Kamu mau minum teh ... kopi?", "atau|karena|sehingga|tetapi", 0, "Menunjukkan pilihan."],
    ["Saya tidak masuk sekolah ... sakit.", "karena|tetapi|atau|sehingga", 0, "Menunjukkan sebab."],
    ["Belajarlah dengan rajin ... kamu lulus ujian.", "agar|tetapi|meskipun|atau", 0, "Menunjukkan tujuan."],
    ["Dia tetap tersenyum ... hatinya sedih.", "meskipun|sehingga|karena|dan", 0, "Menunjukkan pertentangan atau pengandaian."],
    ["Ibu memasak di dapur, ... ayah membaca koran.", "sedangkan|sehingga|karena|atau", 0, "Menunjukkan dua kegiatan yang dibandingkan."],
    ["Konjungsi yang menyatakan pertentangan adalah ...", "tetapi|dan|karena|sehingga", 0, "Tetapi, namun, dan melainkan menyatakan pertentangan."],
    ["Konjungsi kausalitas adalah konjungsi yang menyatakan ...", "sebab akibat|pertentangan|pilihan|penambahan", 0, "Contohnya karena, sebab, dan sehingga."],
    ["Baik ... buruk harus kita terima dengan lapang.", "maupun|tetapi|karena|sehingga", 0, "Maupun menghubungkan dua hal setara."],
    ["Kalimat yang memakai konjungsi temporal adalah ...", "Setelah makan, ia belajar.|Ia rajin karena pintar.|Mau teh atau kopi?|Ia kaya tetapi pelit.", 0, "Setelah makan menunjukkan waktu."],
    ["Kata kemudian termasuk konjungsi ...", "temporal|kausalitas|pertentangan|pilihan", 0, "Menunjukkan urutan waktu."],
  ],
  "bindo-kataganti": [
    ["Kata saya termasuk kata ganti orang ...", "pertama tunggal|kedua tunggal|ketiga tunggal|pertama jamak", 0, "Dipakai untuk diri sendiri."],
    ["Kalian termasuk kata ganti orang ...", "kedua jamak|kedua tunggal|ketiga jamak|pertama jamak", 0, "Dipakai untuk banyak orang yang diajak bicara."],
    ["Mereka termasuk kata ganti orang ...", "ketiga jamak|ketiga tunggal|kedua jamak|pertama jamak", 0, "Dipakai untuk banyak orang yang dibicarakan."],
    ["Dia termasuk kata ganti orang ...", "ketiga tunggal|pertama tunggal|kedua tunggal|ketiga jamak", 0, "Dipakai untuk satu orang yang dibicarakan."],
    ["Kami digunakan untuk ...", "orang pertama jamak tanpa pendengar|orang pertama jamak termasuk pendengar|orang kedua jamak|orang ketiga tunggal", 0, "Kami tidak mencakup orang yang diajak bicara."],
    ["Kita digunakan untuk ...", "orang pertama jamak termasuk pendengar|orang pertama jamak tanpa pendengar|orang kedua tunggal|orang ketiga jamak", 0, "Kita mencakup pembicara dan pendengar."],
    ["Kata ganti aku biasanya dipakai dalam ragam ...", "tidak formal|resmi|hukum|ilmiah", 0, "Aku lebih akrab untuk percakapan sehari-hari."],
    ["Pada kata bukunya, -nya merupakan kata ganti ...", "orang ketiga|orang pertama|orang kedua|penunjuk", 0, "-nya menggantikan orang atau benda yang dibicarakan."],
    ["Contoh kata ganti penunjuk adalah ...", "ini dan itu|saya dan kamu|mereka dan dia|siapa dan apa", 0, "Ini dan itu menunjuk benda."],
    ["Kata beliau dipakai untuk ...", "orang yang dihormati|diri sendiri|benda|hewan", 0, "Beliau adalah bentuk hormat orang ketiga."],
  ],
  "pancasila-norma": [
    ["Norma adalah ...", "aturan atau kaidah yang mengikat masyarakat|kebiasaan pribadi tanpa sanksi|hukuman dari negara|pendapat satu orang", 0, "Norma mengatur perilaku dalam masyarakat."],
    ["Norma agama bersumber dari ...", "Tuhan melalui kitab suci|hati nurani|negara|kebiasaan masyarakat", 0, "Contohnya perintah ibadah dan larangan berbuat jahat."],
    ["Norma kesusilaan bersumber dari ...", "hati nurani|kitab suci|undang-undang|adat istiadat", 0, "Norma kesusilaan berkaitan dengan baik dan buruk."],
    ["Norma kesopanan bersumber dari ...", "kebiasaan dan tata krama masyarakat|hati nurani|Tuhan|negara", 0, "Contohnya menghormati orang yang lebih tua."],
    ["Norma hukum memiliki sanksi yang ...", "tegas dan memaksa|hanya berupa celaan|berupa dosa|tidak ada sanksi", 0, "Sanksinya bisa denda atau penjara."],
    ["Sanksi bagi pelanggar norma agama adalah ...", "dosa|denda|penjara|celaan", 0, "Pelanggaran norma agama berdosa."],
    ["Rasa menyesal dan malu merupakan sanksi norma ...", "kesusilaan|hukum|agama|kesopanan", 0, "Berasal dari hati nurani."],
    ["Celaan dari masyarakat merupakan sanksi norma ...", "kesopanan|hukum|agama|kesusilaan", 0, "Masyarakat memberi teguran atau celaan."],
    ["Contoh norma hukum di Indonesia adalah ...", "peraturan lalu lintas|mengucapkan permisi|berdoa sebelum makan|menghormati tetangga", 0, "Peraturan lalu lintas tertulis dan memiliki sanksi."],
    ["Manfaat menaati norma adalah ...", "terciptanya ketertiban dan keamanan|banyak musuh|bebas dari hukuman|bisa berbuat sesuka hati", 0, "Norma membuat hidup bersama lebih teratur."],
    ["Contoh norma kesopanan adalah ...", "mengucapkan permisi saat lewat|membayar pajak|beribadah|memakai helm", 0, "Itu tata krama dalam pergaulan."],
    ["Pancasila disahkan sebagai dasar negara pada ...", "18 Agustus 1945|17 Agustus 1945|1 Juni 1945|28 Oktober 1928", 0, "Disahkan sehari setelah proklamasi kemerdekaan."],
    ["Sila ketiga Pancasila berbunyi ...", "Persatuan Indonesia|Kemanusiaan yang adil dan beradab|Ketuhanan Yang Maha Esa|Keadilan sosial bagi seluruh rakyat Indonesia", 0, "Sila ketiga menekankan persatuan."],
  ],
  "pjok-kasti": [
    ["Bola kasti dimainkan oleh ... regu.", "2|3|4|5", 0, "Kasti mempertemukan dua regu."],
    ["Jumlah pemain inti bola kasti setiap regu adalah ...", "12 orang|6 orang|9 orang|11 orang", 0, "Setiap regu memiliki 12 pemain inti."],
    ["Alat pemukul bola kasti terbuat dari ...", "kayu|besi|plastik keras|kaca", 0, "Pemukul kasti berupa kayu berbentuk seperti dayung."],
    ["Permainan kasti dibagi menjadi ... babak.", "2|1|3|4", 0, "Kasti dimainkan dalam dua babak."],
    ["Tugas regu pemukul adalah ...", "memukul bola lalu berlari ke tiang|menangkap bola|menjaga tiang|melambungkan bola", 0, "Setelah memukul, pemain berlari ke tiang hinggap."],
    ["Jumlah tiang hinggap dalam permainan kasti adalah ...", "3|2|4|1", 0, "Ada tiga tiang hinggap."],
    ["Pemain yang bertugas melambungkan bola ke pemukul disebut ...", "pelambung|penjaga|pemukul|pelari", 0, "Pelambung memberi bola kepada pemukul."],
    ["Regu penjaga bertugas ...", "menangkap bola dan mematikan pemukul|memukul bola|berlari ke tiang|menghitung nilai", 0, "Regu penjaga berusaha menangkap bola dan mematikan pelari."],
    ["Alat berikut yang tidak dipakai dalam bola kasti adalah ...", "raket|bola|pemukul|tiang", 0, "Kasti tidak memakai raket."],
    ["Pemain kasti mendapat nilai jika ...", "berhasil memukul dan kembali ke ruang bebas|memukul bola keluar lapangan|menangkap bola|berdiri di tiang", 0, "Nilai diperoleh setelah kembali ke ruang bebas dengan selamat."],
    ["Bola kasti berukuran ... dan padat.", "kecil|besar|sangat besar|sebesar bola basket", 0, "Bola kasti kecil dan padat."],
    ["Posisi awal pemukul berada di ...", "ruang pemukul|tiang hinggap|ruang bebas|lapangan tengah", 0, "Pemukul memulai dari ruang pemukul."],
  ],
  "inggris-simplepresent": [
    ["He ... to school every day.", "goes|go|going|gone", 0, "Subjek he/she/it memakai verb + s/es."],
    ["They ... football on Sunday.", "play|plays|playing|played", 0, "Subjek they memakai bentuk dasar."],
    ["She ... not like coffee.", "does|do|is|are", 0, "Subjek she memakai does not."],
    ["... you speak English?", "Do|Does|Is|Are", 0, "Subjek you memakai Do."],
    ["My mother ... breakfast every morning.", "cooks|cook|cooking|cooked", 0, "My mother = she, jadi cooks."],
    ["The sun ... in the east.", "rises|rise|rose|rising", 0, "Fakta umum memakai simple present."],
    ["Simple present tense dipakai untuk ...", "kebiasaan dan fakta umum|kejadian yang sedang berlangsung|kejadian masa lalu|rencana masa depan", 0, "Contohnya kebiasaan sehari-hari."],
    ["Time signal yang cocok untuk simple present adalah ...", "every day|yesterday|tomorrow|last night", 0, "Every day menunjukkan kebiasaan."],
    ["I ... a student.", "am|is|are|be", 0, "Subjek I memakai am."],
    ["It ... a lot in January.", "rains|rain|raining|rained", 0, "Subjek it memakai verb + s."],
    ["Setelah does, kata kerja kembali ke bentuk ...", "dasar|ing|past|s", 0, "Does not diikuti verb dasar."],
    ["Kalimat negatif yang benar adalah ...", "He does not play tennis.|He does not plays tennis.|He not play tennis.|He do not play tennis.", 0, "Does not + verb dasar."],
    ["She always ... her homework.", "does|do|doing|did", 0, "She memakai does."],
    ["Do they live here? ...", "Yes, they do.|Yes, they does.|Yes, they are.|Yes, they live.", 0, "Jawaban pendek memakai do."],
  ],
  "sunda-cerita": [
    ["Dongeng nyaeta carita anu ...", "teu nyata atawa fiksi|nyata kajadianana|wangun laporan|eusi berita", 0, "Dongeng umumnya berupa cerita fiksi."],
    ["Tokoh anu jahat dina carita disebut ...", "antagonis|protagonis|tritagonis|narator", 0, "Antagonis adalah tokoh penentang."],
    ["Tokoh utama dina carita disebut ...", "protagonis|antagonis|figuran|narator", 0, "Protagonis adalah tokoh utama."],
    ["Carita anu tokohna sato disebut ...", "fabel|legenda|mite|sage", 0, "Fabel memakai tokoh binatang."],
    ["Bagian carita anu jadi puncak masalah disebut ...", "klimaks|bubuka|panutup|latar", 0, "Klimaks adalah puncak konflik."],
    ["Amanat nyaeta ...", "pesen moral anu hayang ditepikeun|tempat kajadian|waktu kajadian|ngaran tokoh", 0, "Amanat berisi pesan moral."],
    ["Latar dina carita ngawengku ...", "tempat, waktu, jeung suasana|tema jeung amanat|tokoh jeung galur|judul jeung pangarang", 0, "Latar menjelaskan tempat, waktu, dan suasana."],
    ["Unsur carita di antarana ...", "tema, tokoh, latar, galur|judul, halaman, penerbit|paragraf, kalimah, kecap|daptar eusi, indeks, glosarium", 0, "Itu unsur intrinsik cerita."],
    ["Sangkuriang kaasup kana ...", "legenda|fabel|pantun|sajak", 0, "Sangkuriang adalah legenda dari Jawa Barat."],
    ["Lutung Kasarung asalna ti ...", "Jawa Barat|Jawa Tengah|Jawa Timur|Bali", 0, "Lutung Kasarung merupakan cerita rakyat Jawa Barat."],
    ["Bagian carita anu eusina bubuka disebut ...", "orientasi|klimaks|konflik|resolusi", 0, "Orientasi memperkenalkan tokoh dan latar."],
    ["Ngadongeng anu hade kudu make ...", "lentong jeung wirahma|sora gede wungkul|gancang wungkul|teu make ekspresi", 0, "Lentong dan wirama membuat dongeng hidup."],
  ],
  "tik-scratch": [
    ["Scratch adalah bahasa pemrograman berbasis ...", "blok|teks|suara|gambar", 0, "Blok disusun seperti puzzle."],
    ["Kategori blok untuk menggerakkan sprite adalah ...", "Motion|Looks|Sound|Variables", 0, "Motion mengatur gerakan sprite."],
    ["Blok when green flag clicked termasuk kategori ...", "Events|Motion|Sensing|Operators", 0, "Events memulai skrip."],
    ["Objek yang bergerak di panggung Scratch disebut ...", "sprite|backdrop|stage|script", 0, "Sprite adalah karakter atau objek."],
    ["Latar panggung Scratch disebut ...", "backdrop|sprite|costume|block", 0, "Backdrop adalah latar panggung."],
    ["Blok say Hello! terdapat pada kategori ...", "Looks|Motion|Sound|Control", 0, "Looks mengatur tampilan dan dialog."],
    ["Blok repeat 10 termasuk blok ...", "kontrol atau perulangan|gerak|suara|variabel", 0, "Repeat mengulang blok di dalamnya."],
    ["Variabel dipakai untuk ...", "menyimpan nilai|menggambar|memutar suara|mengubah latar", 0, "Variabel menyimpan angka atau teks."],
    ["Untuk memutar bunyi memakai blok kategori ...", "Sound|Looks|Motion|Sensing", 0, "Sound berisi blok audio."],
    ["Skrip dijalankan ketika ...", "bendera hijau diklik|tombol stop diklik|sprite dihapus|panggung diganti", 0, "Bendera hijau adalah tombol mulai."],
    ["Blok if ... then termasuk ...", "percabangan|perulangan|variabel|suara", 0, "If then menjalankan blok bila syarat terpenuhi."],
    ["Costume pada sprite berfungsi untuk ...", "mengubah tampilan sprite|mengubah suara|mengubah latar|mengubah skor", 0, "Costume adalah tampilan alternatif sprite."],
  ],
  "tik-pictoblox": [
    ["Pictoblox adalah aplikasi pemrograman berbasis ...", "blok|teks murni|spreadsheet|presentasi", 0, "Pictoblox memakai blok seperti Scratch."],
    ["Kategori blok di Pictoblox pada dasarnya mirip dengan ...", "Scratch|Excel|PowerPoint|Word", 0, "Keduanya memakai pemrograman blok."],
    ["Blok forever artinya ...", "ulangi terus-menerus|ulangi sekali|berhenti|hapus semua", 0, "Forever adalah perulangan tanpa henti."],
    ["Blok move 10 steps digunakan untuk ...", "menggerakkan sprite|mengubah latar|memutar suara|menyimpan proyek", 0, "Move menggerakkan sprite."],
    ["Fitur AI di Pictoblox bisa dipakai untuk ...", "mendeteksi wajah|mengetik dokumen|mengedit video|membuat presentasi", 0, "Pictoblox punya ekstensi AI."],
    ["Stage di Pictoblox berfungsi untuk ...", "menampilkan hasil program|menyimpan file|menulis kode teks|mengatur printer", 0, "Stage adalah panggung program."],
    ["Sprite adalah ...", "karakter atau objek yang diprogram|alat input|menu penyimpanan|jenis variabel", 0, "Sprite adalah objek di panggung."],
    ["Ekstensi Pictoblox ditambahkan melalui menu ...", "Extensions|File|Edit|View", 0, "Menu Extensions menambah fitur."],
    ["Untuk menyimpan proyek Pictoblox memilih menu ...", "Save|Delete|Close|Print", 0, "Save menyimpan proyek."],
    ["Blok if ... then dipakai untuk ...", "membuat percabangan|mengulang tanpa henti|menyimpan nilai|memutar suara", 0, "If then adalah percabangan."],
  ],
  "ipa-fisika": [
    ["Satuan gaya dalam SI adalah ...", "Newton|Joule|Watt|Pascal", 0, "Gaya diukur dalam Newton."],
    ["Hukum Newton I menyatakan benda ...", "tetap diam atau bergerak lurus beraturan jika tidak ada gaya|selalu bergerak dipercepat|selalu berhenti|tidak punya massa", 0, "Itu hukum kelembaman."],
    ["Massa jenis dihitung dengan rumus ...", "massa : volume|massa × volume|volume : massa|massa + volume", 0, "Massa jenis = massa dibagi volume."],
    ["Perubahan wujud dari padat menjadi cair disebut ...", "mencair|membeku|menguap|mengembun", 0, "Es mencair menjadi air."],
    ["Alat untuk mengukur suhu adalah ...", "termometer|barometer|dinamometer|higrometer", 0, "Termometer mengukur suhu."],
    ["Energi kinetik dipengaruhi oleh ...", "massa dan kecepatan|massa dan suhu|warna dan bentuk|volume dan massa jenis", 0, "Ek = 1/2 mv²."],
    ["Bunyi merambat paling cepat melalui ...", "zat padat|udara|air|ruang hampa", 0, "Partikel padat lebih rapat."],
    ["Peristiwa pelangi merupakan contoh ...", "dispersi cahaya|pemantulan bunyi|konduksi panas|induksi listrik", 0, "Cahaya terurai menjadi warna."],
    ["Kalor adalah ...", "energi panas|energi bunyi|energi listrik|energi cahaya", 0, "Kalor berkaitan dengan suhu."],
    ["Arah gaya gesek ...", "berlawanan dengan arah gerak benda|searah gerak benda|selalu ke atas|selalu ke bawah", 0, "Gesekan melawan gerak."],
    ["Berat benda dipengaruhi oleh ...", "gravitasi|warna benda|bentuk benda|suhu benda", 0, "Berat = massa × gravitasi."],
    ["Satuan suhu dalam SI adalah ...", "Kelvin|Celsius|Fahrenheit|Reamur", 0, "Satuan SI suhu adalah Kelvin."],
  ],
  "ipa-kimia": [
    ["Lambang unsur oksigen adalah ...", "O|Ox|Ok|On", 0, "Oksigen memiliki lambang O."],
    ["Rumus kimia air adalah ...", "H2O|CO2|NaCl|O2", 0, "Air tersusun dari 2 atom H dan 1 atom O."],
    ["Contoh perubahan kimia adalah ...", "pembakaran kertas|es mencair|gula larut dalam air|air menguap", 0, "Pembakaran menghasilkan zat baru."],
    ["Contoh perubahan fisika adalah ...", "es mencair|besi berkarat|kertas terbakar|susu basi", 0, "Es mencair tidak menghasilkan zat baru."],
    ["Zat asam memiliki pH ...", "kurang dari 7|lebih dari 7|sama dengan 7|selalu 14", 0, "pH asam di bawah 7."],
    ["Berikut yang termasuk unsur logam adalah ...", "besi|oksigen|karbon|helium", 0, "Besi adalah logam."],
    ["Campuran yang tercampur merata disebut ...", "campuran homogen|campuran heterogen|senyawa|unsur", 0, "Contohnya larutan gula."],
    ["Rumus kimia garam dapur adalah ...", "NaCl|KCl|CaCO3|H2SO4", 0, "Garam dapur adalah natrium klorida."],
    ["Rumus kimia karbon dioksida adalah ...", "CO2|CO|C2O|O2C", 0, "Karbon dioksida = CO2."],
    ["Fotosintesis menghasilkan gas ...", "oksigen|karbon dioksida|nitrogen|hidrogen", 0, "Tumbuhan melepas oksigen."],
    ["Bagian terkecil dari suatu materi disebut ...", "atom|sel|jaringan|organ", 0, "Atom adalah bagian terkecil unsur."],
    ["Asam dan basa jika dicampur akan menghasilkan ...", "garam dan air|gas oksigen|logam|karbon", 0, "Itu reaksi netralisasi."],
  ],
  "pai-sujud": [
    ["Sujud yang dilakukan ketika mendapat nikmat atau kabar gembira disebut sujud ...", "syukur|tilawah|sahwi|wajib", 0, "Sujud syukur sebagai rasa terima kasih kepada Allah."],
    ["Sujud yang dilakukan ketika membaca atau mendengar ayat sajdah disebut sujud ...", "tilawah|syukur|sahwi|janazah", 0, "Sujud tilawah berkaitan dengan ayat sajdah."],
    ["Sujud yang dilakukan karena lupa dalam salat disebut sujud ...", "sahwi|syukur|tilawah|syukr", 0, "Sujud sahwi menutup kekurangan karena lupa."],
    ["Sujud sahwi dilakukan sebanyak ...", "2 kali|1 kali|3 kali|4 kali", 0, "Sujud sahwi dua kali."],
    ["Sujud sahwi dilakukan ...", "di akhir salat sebelum salam|setelah salam|di luar salat|sebelum takbir", 0, "Dikerjakan sebelum salam."],
    ["Sujud syukur dilakukan ...", "di luar salat|di dalam salat|setelah rukuk|sebelum wudhu", 0, "Sujud syukur di luar salat."],
    ["Sujud tilawah yang dilakukan di dalam salat dikerjakan ...", "di tempat saat membaca ayat sajdah|setelah salam|setelah salat selesai|di luar masjid", 0, "Langsung saat menemui ayat sajdah."],
    ["Jumlah sujud dalam satu rakaat salat adalah ...", "2 kali|1 kali|3 kali|4 kali", 0, "Setiap rakaat dua kali sujud."],
    ["Anggota sujud ada ...", "7|5|6|8", 0, "Dahi, hidung, dua tangan, dua lutut, dua ujung kaki."],
    ["Bacaan sujud yang benar adalah ...", "Subhana rabbiyal ala wa bihamdihi|Subhana rabbiyal azim|Allahu akbar kabira|Sami Allahu liman hamidah", 0, "Itu bacaan sujud."],
    ["Sujud dilakukan dengan ...", "menempelkan dahi ke lantai|berdiri tegak|duduk bersila|berbaring", 0, "Sujud menempelkan dahi ke tempat sujud."],
    ["Hukum sujud tilawah ketika membaca ayat sajdah adalah ...", "sunah|wajib|haram|makruh", 0, "Menurut pendapat yang umum, hukumnya sunah."],
    ["Sujud syukur dilakukan dengan menghadap ...", "kiblat|matahari|guru|timur", 0, "Sujud menghadap kiblat."],
  ],
  "ips-ekonomi": [
    ["Kegiatan menghasilkan barang atau jasa disebut ...", "produksi|distribusi|konsumsi|investasi", 0, "Produksi menghasilkan barang atau jasa."],
    ["Kegiatan menyalurkan barang dari produsen ke konsumen disebut ...", "distribusi|produksi|konsumsi|promosi", 0, "Distribusi menyalurkan barang."],
    ["Kegiatan memakai barang atau jasa disebut ...", "konsumsi|produksi|distribusi|transaksi", 0, "Konsumsi adalah pemakaian."],
    ["Pihak yang menghasilkan barang disebut ...", "produsen|konsumen|distributor|kolektor", 0, "Produsen menghasilkan barang."],
    ["Pihak yang memakai barang disebut ...", "konsumen|produsen|distributor|investor", 0, "Konsumen memakai barang atau jasa."],
    ["Pihak yang menyalurkan barang disebut ...", "distributor|produsen|konsumen|penjual", 0, "Distributor menyalurkan barang."],
    ["Faktor produksi terdiri dari ...", "alam, tenaga kerja, modal, kewirausahaan|uang, emas, perak, tanah|barang, jasa, uang, pasar|produsen, konsumen, distributor, penjual", 0, "Itu empat faktor produksi."],
    ["Contoh kegiatan distribusi adalah ...", "mengirim barang dari pabrik ke toko|menanam padi|memakai sepatu|memasak makanan", 0, "Distribusi memindahkan barang ke konsumen."],
    ["Rumah tangga konsumen berperan sebagai ...", "pemakai barang dan jasa|penghasil barang|penyalur barang|penentu harga", 0, "Konsumen adalah pemakai."],
    ["Tujuan utama konsumsi adalah ...", "memenuhi kebutuhan|menambah utang|mengurangi produksi|menimbun barang", 0, "Konsumsi untuk memenuhi kebutuhan."],
    ["Alat pembayaran yang sah di Indonesia adalah ...", "rupiah|dolar|ringgit|yen", 0, "Rupiah adalah mata uang Indonesia."],
    ["Kegiatan ekonomi utama masyarakat pesisir adalah ...", "nelayan|petani sawah|penambang emas|peternak sapi", 0, "Masyarakat pesisir banyak bekerja sebagai nelayan."],
    ["Kebutuhan primer meliputi ...", "makanan, pakaian, dan rumah|mobil mewah dan perhiasan|liburan dan hiburan|gadget terbaru", 0, "Kebutuhan primer adalah kebutuhan pokok."],
  ],
  "seni-ritme": [
    ["Ritme adalah ...", "pola panjang dan pendek bunyi|tinggi rendah nada|keras lembut suara|cepat lambat lagu", 0, "Ritme mengatur panjang pendek bunyi."],
    ["Birama 4/4 berarti setiap birama memiliki ... ketukan.", "4|2|3|6", 0, "Angka 4 di atas menunjukkan empat ketukan."],
    ["Tempo cepat dalam musik disebut ...", "allegro|adagio|largo|andante", 0, "Allegro berarti cepat."],
    ["Tempo lambat dalam musik disebut ...", "adagio|allegro|presto|vivace", 0, "Adagio berarti lambat."],
    ["Ketukan yang teratur dalam musik disebut ...", "pulsa|melodi|harmoni|timbre", 0, "Pulsa adalah ketukan teratur."],
    ["Not 1/4 bernilai ... ketukan.", "1|2|4|1/2", 0, "Not seperempat bernilai satu ketukan."],
    ["Tanda birama biasanya ditulis di ...", "awal lagu|akhir lagu|tengah lagu|belakang judul", 0, "Tanda birama ada di awal lagu."],
    ["Ritme dibentuk oleh ...", "not dan tanda istirahat|warna dan bentuk|gerak dan tari|kata dan kalimat", 0, "Not dan istirahat membentuk pola ritme."],
    ["Contoh alat musik ritmis adalah ...", "drum|piano|gitar|seruling", 0, "Drum mengatur ritme."],
    ["Contoh alat musik melodis adalah ...", "piano|tamborin|kendang|marakas", 0, "Piano memainkan melodi."],
    ["Birama 3/4 memiliki ... ketukan per birama.", "3|2|4|6", 0, "Birama 3/4 bertanda tiga ketukan."],
    ["Tempo sedang dalam musik disebut ...", "andante|presto|largo|allegro", 0, "Andante berarti sedang."],
    ["Fungsi utama ritme adalah ...", "mengatur pola bunyi dalam waktu|menentukan lirik|menentukan alat musik|menentukan penyanyi", 0, "Ritme mengatur bunyi dalam waktu."],
  ],
};

const QUIZ_BANK_STATIS = {};
Object.keys(QUIZ_BANK_DASAR).forEach((topikId) => {
  QUIZ_BANK_STATIS[topikId] = QUIZ_BANK_DASAR[topikId].map((item, i) => ({
    id: `${topikId}-s${i + 1}`,
    tanya: item[0],
    opsi: item[1].split("|"),
    jawab: item[2],
    bahas: item[3] || "",
    asal: "dasar",
  }));
});

function quizPrng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quizPilih(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

function quizAngkaTeks(n) {
  return String(Number(Number(n).toFixed(2))).replace(".", ",");
}

function quizRupiah(n) {
  return `Rp${Number(n).toLocaleString("id-ID")}`;
}

function quizAcakOpsi(benar, salah, rnd) {
  const uniq = [];
  const pakai = new Set([String(benar)]);
  salah.forEach((s) => {
    const t = String(s);
    if (!t || pakai.has(t)) return;
    pakai.add(t);
    uniq.push(t);
  });
  if (uniq.length < 3) return null;
  const pilihan = [String(benar), uniq[0], uniq[1], uniq[2]];
  for (let i = pilihan.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pilihan[i], pilihan[j]] = [pilihan[j], pilihan[i]];
  }
  return { opsi: pilihan, jawab: pilihan.indexOf(String(benar)) };
}

function quizSalahAngka(benar, kandidat) {
  const hasil = [];
  const pakai = new Set([String(benar)]);
  kandidat.forEach((v) => {
    if (!Number.isFinite(v) || v <= 0) return;
    const t = quizAngkaTeks(v);
    if (pakai.has(t)) return;
    pakai.add(t);
    hasil.push(t);
  });
  return hasil.slice(0, 3);
}

function quizGenSkala(rnd) {
  if (rnd() < 0.6) {
    const skala = quizPilih([100, 200, 400, 500], rnd);
    const cm = 2 + Math.floor(rnd() * 10);
    const meter = (cm * skala) / 100;
    const opsi = quizAcakOpsi(quizAngkaTeks(meter) + " m", quizSalahAngka(meter, [meter / 10, meter * 2, meter * 10, meter * 100]).map((v) => v + " m"), rnd);
    if (!opsi) return null;
    return { tanya: `Pada peta berskala 1 : ${skala}, jarak dua tempat ${cm} cm. Jarak sebenarnya ...`, ...opsi };
  }
  const skala = quizPilih([100000, 200000, 500000, 1000000], rnd);
  const km = quizPilih([2, 4, 6, 8, 10, 15, 20, 25, 30, 40, 50], rnd);
  const cm = (km * 100000) / skala;
  if (!Number.isInteger(cm) || cm < 1) return null;
  const opsi = quizAcakOpsi(cm + " cm", quizSalahAngka(cm, [cm * 2, cm + 1, cm * 10, cm / 2]).map((v) => v + " cm"), rnd);
  if (!opsi) return null;
  return { tanya: `Jarak sebenarnya dua kota ${km} km. Jika skala peta 1 : ${skala}, jarak pada peta ...`, ...opsi };
}

function quizGenPerbandingan(rnd) {
  const a = 2 + Math.floor(rnd() * 5);
  const b = a + 1 + Math.floor(rnd() * 4);
  const k = 2 + Math.floor(rnd() * 6);
  if (rnd() < 0.55) {
    const total = (a + b) * k;
    const benar = a * k;
    const opsi = quizAcakOpsi(benar, [b * k, total, benar + k, b * k - k], rnd);
    if (!opsi) return null;
    return { tanya: `Perbandingan kelereng Andi dan Budi ${a} : ${b}. Jika jumlahnya ${total}, kelereng Andi ...`, ...opsi };
  }
  const selisih = (b - a) * k;
  const benar = b * k;
  const opsi = quizAcakOpsi(benar, [a * k, selisih, benar + k, a * k + k], rnd);
  if (!opsi) return null;
  return { tanya: `Perbandingan A : B = ${a} : ${b}. Jika selisihnya ${selisih}, nilai B ...`, ...opsi };
}

function quizGenRasio(rnd) {
  const x = 2 + Math.floor(rnd() * 5);
  const y = x + 1 + Math.floor(rnd() * 4);
  const f = 2 + Math.floor(rnd() * 7);
  const A = x * f;
  const B = y * f;
  if (rnd() < 0.5) {
    const benar = `${x} : ${y}`;
    const opsi = quizAcakOpsi(benar, [`${y} : ${x}`, `${x + 1} : ${y}`, `${x} : ${y + 1}`, `${A} : ${B}`], rnd);
    if (!opsi) return null;
    return { tanya: `Bentuk paling sederhana dari ${A} : ${B} adalah ...`, ...opsi };
  }
  const total = (x + y) * f;
  const benar = x * f;
  const opsi = quizAcakOpsi(benar, [y * f, total, benar + f, y * f - f], rnd);
  if (!opsi) return null;
  return { tanya: `Rasio banyak siswa laki-laki : perempuan = ${x} : ${y}. Jika totalnya ${total}, siswa laki-laki ...`, ...opsi };
}

function quizGenSenilai(rnd) {
  if (rnd() < 0.5) {
    const pekerja = 4 + Math.floor(rnd() * 9);
    const hari = 6 + Math.floor(rnd() * 15);
    const tambah = 1 + Math.floor(rnd() * 4);
    const pekerja2 = pekerja + tambah;
    const hari2 = (pekerja * hari) / pekerja2;
    if (!Number.isInteger(hari2) || hari2 < 1) return null;
    const opsi = quizAcakOpsi(hari2 + " hari", quizSalahAngka(hari2, [hari2 + 1, hari2 - 1, hari + tambah, hari2 + 2]).map((v) => v + " hari"), rnd);
    if (!opsi) return null;
    return { tanya: `Sebuah pekerjaan selesai dalam ${hari} hari oleh ${pekerja} pekerja. Jika dikerjakan ${pekerja2} pekerja, waktu yang dibutuhkan ...`, ...opsi };
  }
  const jumlah1 = 2 + Math.floor(rnd() * 4);
  const satuan = (2 + Math.floor(rnd() * 8)) * 1000;
  const jumlah2 = jumlah1 + 1 + Math.floor(rnd() * 4);
  const benar = satuan * jumlah2;
  const opsi = quizAcakOpsi(quizRupiah(benar), [quizRupiah(satuan * jumlah1), quizRupiah(benar + satuan), quizRupiah(benar - satuan), quizRupiah(satuan * (jumlah2 + 1))], rnd);
  if (!opsi) return null;
  return { tanya: `Harga ${jumlah1} buku ${quizRupiah(satuan * jumlah1)}. Harga ${jumlah2} buku ...`, ...opsi };
}

const QUIZ_BANK_GENERATED = {};
[
  ["mtk-skala", quizGenSkala, 1201],
  ["mtk-perbandingan", quizGenPerbandingan, 2207],
  ["mtk-rasio", quizGenRasio, 3301],
  ["mtk-senilai", quizGenSenilai, 4507],
].forEach(([topikId, generator, seed]) => {
  const rnd = quizPrng(seed);
  const daftar = [];
  const teksTerpakai = new Set((QUIZ_BANK_STATIS[topikId] || []).map((q) => q.tanya.trim().toLowerCase()));
  for (let i = 0; i < 30; i++) {
    const soal = generator(rnd);
    if (!soal) continue;
    const kunci = soal.tanya.trim().toLowerCase();
    if (teksTerpakai.has(kunci)) continue;
    teksTerpakai.add(kunci);
    daftar.push({ id: `${topikId}-g${i + 1}`, tanya: soal.tanya, opsi: soal.opsi, jawab: soal.jawab, bahas: "Hitung dengan teliti, ya.", asal: "dasar" });
  }
  QUIZ_BANK_GENERATED[topikId] = daftar;
});

let gameQuizConfig = null;
let gameQuizConfigUnsub = null;
let gameQuizConfigToken = 0;
let gameQuizConfigWarned = false;
let gameQuizLayar = "home";
let gameQuizSubjekId = "";
let gameQuizTopikId = "";
let gameQuizSesi = null;
let gameQuizAdminSubjekId = "";
let gameQuizAdminTopikId = "";
let gameQuizNoticeTimer = null;
let gameQuizRankFilter = QUIZ_RANK_TOTAL;
const quizBankCache = new Map();

function quizEsc(nilai) {
  return String(nilai == null ? "" : nilai).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function quizTeksBersih(nilai, maks) {
  const teks = String(nilai == null ? "" : nilai).trim();
  return teks.slice(0, maks);
}

function quizIdBaru(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function gameQuizStateAwal() {
  return {
    benar: 0,
    total: 0,
    sesi: 0,
    poin: 0,
    poinMapel: {},
    seen: {},
    stat: {},
    statMapel: {},
    diperbarui: 0,
  };
}

function gameNormalisasiQuiz(raw) {
  const dasar = gameQuizStateAwal();
  if (!raw || typeof raw !== "object") return dasar;
  const quiz = { ...dasar };
  quiz.total = gameAngka(raw.total);
  quiz.benar = Math.min(gameAngka(raw.benar), quiz.total);
  quiz.sesi = gameAngka(raw.sesi);
  quiz.poin = gameAngka(raw.poin);
  quiz.diperbarui = gameAngka(raw.diperbarui);

  if (raw.seen && typeof raw.seen === "object") {
    Object.keys(raw.seen).slice(0, 200).forEach((topikId) => {
      if (!/^[a-z0-9-]{1,80}$/i.test(topikId)) return;
      const daftar = [];
      (Array.isArray(raw.seen[topikId]) ? raw.seen[topikId] : []).slice(0, 5000).forEach((id) => {
        if (typeof id === "string" && id.length <= 100 && !daftar.includes(id)) daftar.push(id);
      });
      quiz.seen[topikId] = daftar;
    });
  }

  if (raw.stat && typeof raw.stat === "object") {
    Object.keys(raw.stat).slice(0, 200).forEach((topikId) => {
      if (!/^[a-z0-9-]{1,80}$/i.test(topikId)) return;
      const stat = raw.stat[topikId];
      if (!stat || typeof stat !== "object") return;
      quiz.stat[topikId] = { benar: gameAngka(stat.benar), total: gameAngka(stat.total) };
    });
  }

  if (raw.poinMapel && typeof raw.poinMapel === "object") {
    Object.keys(raw.poinMapel).slice(0, 100).forEach((mapelId) => {
      if (!/^[a-z0-9-]{1,80}$/i.test(mapelId)) return;
      quiz.poinMapel[mapelId] = gameAngka(raw.poinMapel[mapelId]);
    });
  }

  if (raw.statMapel && typeof raw.statMapel === "object") {
    Object.keys(raw.statMapel).slice(0, 100).forEach((mapelId) => {
      if (!/^[a-z0-9-]{1,80}$/i.test(mapelId)) return;
      const stat = raw.statMapel[mapelId];
      if (!stat || typeof stat !== "object") return;
      quiz.statMapel[mapelId] = { benar: gameAngka(stat.benar), total: gameAngka(stat.total) };
    });
  }
  return quiz;
}

function quizNormalisasiSoal(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tanya = quizTeksBersih(raw.tanya, 400);
  const opsi = Array.isArray(raw.opsi) ? raw.opsi.map((o) => quizTeksBersih(o, 160)).slice(0, 4) : [];
  if (!tanya || opsi.length !== 4 || opsi.some((o) => !o)) return null;
  const jawab = Math.floor(Number(raw.jawab));
  if (!Number.isInteger(jawab) || jawab < 0 || jawab > 3) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? quizTeksBersih(raw.id, 100) : quizIdBaru("soal"),
    tanya,
    opsi,
    jawab,
    bahas: quizTeksBersih(raw.bahas, 400),
    asal: "custom",
  };
}

function quizConfigDefault() {
  return JSON.parse(JSON.stringify(QUIZ_SUBJECTS_DEFAULT));
}

function quizNormalisasiConfig(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.subjects) || raw.subjects.length === 0) {
    return { subjects: quizConfigDefault(), diperbarui: 0, editedBy: "" };
  }

  const idMapel = new Set();
  const subjects = raw.subjects
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const nama = quizTeksBersih(s.nama, 60);
      if (!nama) return null;
      let id = quizTeksBersih(s.id, 60) || quizIdBaru("mapel");
      if (idMapel.has(id)) id = quizIdBaru("mapel");
      idMapel.add(id);

      const idTopik = new Set();
      const topics = (Array.isArray(s.topics) ? s.topics : [])
        .map((t) => {
          if (!t || typeof t !== "object") return null;
          const namaTopik = quizTeksBersih(t.nama, 60);
          if (!namaTopik) return null;
          let idT = quizTeksBersih(t.id, 60) || quizIdBaru("tema");
          if (idTopik.has(idT)) idT = quizIdBaru("tema");
          idTopik.add(idT);
          const soal = (Array.isArray(t.soal) ? t.soal : [])
            .slice(0, QUIZ_MAKS_SOAL_CUSTOM)
            .map((q) => quizNormalisasiSoal(q))
            .filter(Boolean);
          return { id: idT, nama: namaTopik, emoji: quizTeksBersih(t.emoji, 8) || "📝", soal };
        })
        .filter(Boolean);

      return { id, nama, emoji: quizTeksBersih(s.emoji, 8) || "📚", topics };
    })
    .filter(Boolean);

  return {
    subjects: subjects.length ? subjects : quizConfigDefault(),
    diperbarui: gameAngka(raw.diperbarui),
    editedBy: quizTeksBersih(raw.editedBy, 60),
  };
}

function quizMuatConfigCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUIZ_CACHE_CONFIG) || "null");
    return raw ? quizNormalisasiConfig(raw) : null;
  } catch (e) {
    return null;
  }
}

function quizSimpanConfigCache() {
  try {
    localStorage.setItem(QUIZ_CACHE_CONFIG, JSON.stringify(gameQuizConfig));
  } catch (e) {}
}

function quizSimpanConfigCloud() {
  if (!gameQuizConfig) return;
  db.collection("quizConfig")
    .doc("main")
    .set({
      subjects: JSON.parse(JSON.stringify(gameQuizConfig.subjects)),
      diperbarui: gameQuizConfig.diperbarui,
      editedBy: gameQuizConfig.editedBy,
    })
    .catch((err) => {
      if (!gameQuizConfigWarned) {
        console.warn("Tema Quiz disimpan di perangkat ini dulu (rules quizConfig belum aktif):", err.code || err.message);
        gameQuizConfigWarned = true;
      }
    });
}

function quizHentikanConfig() {
  gameQuizConfigToken++;
  if (gameQuizConfigUnsub) {
    gameQuizConfigUnsub();
    gameQuizConfigUnsub = null;
  }
}

function quizLanggananConfig() {
  if (gameQuizConfigUnsub) return;
  const token = ++gameQuizConfigToken;
  gameQuizConfigUnsub = db
    .collection("quizConfig")
    .doc("main")
    .onSnapshot(
      (snap) => {
        if (token !== gameQuizConfigToken) return;
        if (!snap.exists) {
          if (gameQuizConfig && gameQuizConfig.diperbarui > 0) quizSimpanConfigCloud();
          return;
        }
        const remote = quizNormalisasiConfig(snap.data());
        if (!gameQuizConfig || remote.diperbarui >= gameQuizConfig.diperbarui) {
          gameQuizConfig = remote;
          quizBankCache.clear();
          quizSimpanConfigCache();
          renderQuiz();
        } else {
          quizSimpanConfigCloud();
        }
      },
      (err) => {
        if (token !== gameQuizConfigToken) return;
        if (!gameQuizConfigWarned) {
          console.warn("Tema Quiz berjalan dari perangkat dulu:", err.code || err.message);
          gameQuizConfigWarned = true;
        }
      }
    );
}

function quizBolehKelola() {
  return !!(currentUser && (currentUser.role === "admin" || currentUser.role === "owner"));
}

function quizCariMapel(mapelId) {
  return (gameQuizConfig ? gameQuizConfig.subjects : []).find((s) => s.id === mapelId) || null;
}

function quizCariTopik(topikId) {
  const subjects = gameQuizConfig ? gameQuizConfig.subjects : [];
  for (let i = 0; i < subjects.length; i++) {
    const topik = subjects[i].topics.find((t) => t.id === topikId);
    if (topik) return topik;
  }
  return null;
}

function quizCariMapelDariTopik(topikId) {
  const subjects = gameQuizConfig ? gameQuizConfig.subjects : [];
  for (let i = 0; i < subjects.length; i++) {
    if (subjects[i].topics.some((t) => t.id === topikId)) return subjects[i];
  }
  return null;
}

function quizBankUntuk(topikId) {
  if (quizBankCache.has(topikId)) return quizBankCache.get(topikId);
  const topik = quizCariTopik(topikId);
  const peta = new Map();
  (QUIZ_BANK_STATIS[topikId] || []).forEach((q) => peta.set(q.id, q));
  (QUIZ_BANK_GENERATED[topikId] || []).forEach((q) => peta.set(q.id, q));
  if (topik && Array.isArray(topik.soal)) {
    topik.soal.forEach((q) => peta.set(q.id, q));
  }
  const hasil = Array.from(peta.values());
  quizBankCache.set(topikId, hasil);
  return hasil;
}

function quizStatTopik(topikId) {
  const quiz = gameState && gameState.quiz ? gameState.quiz : gameQuizStateAwal();
  const stat = quiz.stat[topikId] && typeof quiz.stat[topikId] === "object" ? quiz.stat[topikId] : { benar: 0, total: 0 };
  const bank = quizBankUntuk(topikId);
  const seen = new Set(Array.isArray(quiz.seen[topikId]) ? quiz.seen[topikId] : []);
  const dilihat = bank.reduce((n, q) => n + (seen.has(q.id) ? 1 : 0), 0);
  return { benar: gameAngka(stat.benar), total: gameAngka(stat.total), bank: bank.length, dilihat };
}

function quizAcakPosisiJawaban(soal) {
  const urutan = [0, 1, 2, 3];
  for (let i = urutan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [urutan[i], urutan[j]] = [urutan[j], urutan[i]];
  }
  return {
    ...soal,
    opsi: urutan.map((i) => soal.opsi[i]),
    jawab: urutan.indexOf(soal.jawab),
  };
}

function quizAmbilSoal(topikId, jumlah) {
  const bank = quizBankUntuk(topikId);
  if (!bank.length) return { soal: [], ulang: false };
  const quiz = gameState.quiz;
  const seen = new Set(Array.isArray(quiz.seen[topikId]) ? quiz.seen[topikId] : []);
  const acak = (arr) => {
    const salinan = arr.slice();
    for (let i = salinan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [salinan[i], salinan[j]] = [salinan[j], salinan[i]];
    }
    return salinan;
  };

  const belum = acak(bank.filter((q) => !seen.has(q.id)));
  const dipakai = new Set();
  const pilih = [];
  belum.slice(0, jumlah).forEach((q) => {
    dipakai.add(q.id);
    pilih.push(q);
  });
  const ulang = seen.size > 0 && belum.length < jumlah;
  if (pilih.length < jumlah) {
    acak(bank).forEach((q) => {
      if (pilih.length >= jumlah || dipakai.has(q.id)) return;
      dipakai.add(q.id);
      pilih.push(q);
    });
  }
  return { soal: acak(pilih).slice(0, jumlah).map(quizAcakPosisiJawaban), ulang };
}

function quizTandaiDilihat(topikId, soalId) {
  const quiz = gameState.quiz;
  if (!Array.isArray(quiz.seen[topikId])) quiz.seen[topikId] = [];
  if (!quiz.seen[topikId].includes(soalId)) quiz.seen[topikId].push(soalId);
}

function quizCatatJawaban(topikId, benar) {
  const quiz = gameState.quiz;
  const stat = quiz.stat[topikId] && typeof quiz.stat[topikId] === "object" ? quiz.stat[topikId] : { benar: 0, total: 0 };
  stat.total = gameAngka(stat.total) + 1;
  stat.benar = gameAngka(stat.benar) + (benar ? 1 : 0);
  quiz.stat[topikId] = stat;
  quiz.total = gameAngka(quiz.total) + 1;
  quiz.benar = gameAngka(quiz.benar) + (benar ? 1 : 0);

  const mapel = quizCariMapelDariTopik(topikId);
  const mapelId = mapel ? mapel.id : "";
  const poin = benar ? QUIZ_POIN_BENAR : 0;
  quiz.poin = gameAngka(quiz.poin) + poin;
  if (mapelId) {
    if (!quiz.poinMapel || typeof quiz.poinMapel !== "object") quiz.poinMapel = {};
    if (!quiz.statMapel || typeof quiz.statMapel !== "object") quiz.statMapel = {};
    quiz.poinMapel[mapelId] = gameAngka(quiz.poinMapel[mapelId]) + poin;
    const statMapel = quiz.statMapel[mapelId] && typeof quiz.statMapel[mapelId] === "object"
      ? quiz.statMapel[mapelId]
      : { benar: 0, total: 0 };
    statMapel.total = gameAngka(statMapel.total) + 1;
    statMapel.benar = gameAngka(statMapel.benar) + (benar ? 1 : 0);
    quiz.statMapel[mapelId] = statMapel;
  }

  const waktu = Date.now();
  quiz.diperbarui = waktu;
  gameState.diperbarui = waktu;
  gameSimpanCache();
  gameSimpanCloud();
  return poin;
}

function quizTampilNotice(pesan) {
  const el = document.getElementById("quiz-notice");
  if (!el) return;
  el.textContent = pesan;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(gameQuizNoticeTimer);
  gameQuizNoticeTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function quizSimpanConfig(pesan) {
  if (!gameQuizConfig) return;
  gameQuizConfig.diperbarui = Date.now();
  gameQuizConfig.editedBy = currentUser ? `${currentUser.namaPanggilan || "Admin"} (${currentUser.absen})` : "";
  quizBankCache.clear();
  quizSimpanConfigCache();
  quizSimpanConfigCloud();
  renderQuiz();
  quizTampilNotice(pesan);
}

function quizMulai(topikId) {
  if (!gameState || !gameQuizConfig) return;
  const topik = quizCariTopik(topikId);
  if (!topik) {
    quizTampilNotice("Tema ini sudah tidak ada. Pilih tema lain ya.");
    gameQuizLayar = "home";
    renderQuiz();
    return;
  }
  const hasil = quizAmbilSoal(topikId, QUIZ_PER_SESI);
  if (!hasil.soal.length) {
    quizTampilNotice("Tema ini belum punya soal. Admin bisa menambahkannya.");
    return;
  }
  const mapel = quizCariMapelDariTopik(topikId);
  if (mapel) gameQuizSubjekId = mapel.id;
  gameQuizTopikId = topikId;
  gameQuizSesi = {
    topikId,
    soal: hasil.soal,
    posisi: 0,
    benar: 0,
    pilih: -1,
    terjawab: false,
    jawab: [],
    ulang: hasil.ulang,
    poin: 0,
    bonus: 0,
  };
  gameQuizLayar = "main";
  renderQuiz();
  SoundFX.buttonClick();
}

function quizJawab(pilihan) {
  const sesi = gameQuizSesi;
  if (!sesi || sesi.terjawab) return;
  const soal = sesi.soal[sesi.posisi];
  if (!soal) return;
  const pilih = Number(pilihan);
  if (!Number.isInteger(pilih) || pilih < 0 || pilih > 3) return;
  const benar = pilih === soal.jawab;
  sesi.terjawab = true;
  sesi.pilih = pilih;
  sesi.jawab[sesi.posisi] = pilih;
  if (benar) sesi.benar += 1;
  quizTandaiDilihat(sesi.topikId, soal.id);
  sesi.poin += quizCatatJawaban(sesi.topikId, benar);
  if (benar) SoundFX.resultReveal();
  else SoundFX.errorSound();
  renderQuiz();
}

function quizLanjut() {
  const sesi = gameQuizSesi;
  if (!sesi || !sesi.terjawab) return;
  if (sesi.posisi + 1 >= sesi.soal.length) {
    gameQuizLayar = "hasil";
    const quiz = gameState.quiz;
    const sempurna = !sesi.bonus && sesi.soal.length >= QUIZ_PER_SESI && sesi.benar === sesi.soal.length;
    if (sempurna) {
      sesi.bonus = QUIZ_BONUS_SEMPURNA;
      sesi.poin += QUIZ_BONUS_SEMPURNA;
      quiz.poin = gameAngka(quiz.poin) + QUIZ_BONUS_SEMPURNA;
      const mapel = quizCariMapelDariTopik(sesi.topikId);
      if (mapel) {
        if (!quiz.poinMapel || typeof quiz.poinMapel !== "object") quiz.poinMapel = {};
        quiz.poinMapel[mapel.id] = gameAngka(quiz.poinMapel[mapel.id]) + QUIZ_BONUS_SEMPURNA;
      }
    }
    quiz.sesi = gameAngka(quiz.sesi) + 1;
    quiz.diperbarui = Date.now();
    gameState.diperbarui = quiz.diperbarui;
    gameSimpanCache();
    gameSimpanCloud();
    sesi.terjawab = false;
    renderQuiz();
    SoundFX.teamsReady();
    return;
  }
  sesi.posisi += 1;
  sesi.pilih = -1;
  sesi.terjawab = false;
  renderQuiz();
  SoundFX.buttonClick();
}

function quizInisial(nama) {
  const teks = String(nama == null ? "" : nama).trim();
  return teks ? teks.charAt(0).toUpperCase() : "?";
}

function quizMapelFilter() {
  if (!gameQuizConfig || gameQuizRankFilter === QUIZ_RANK_TOTAL) return null;
  return gameQuizConfig.subjects.find((s) => s.id === gameQuizRankFilter) || null;
}

function quizEntriPeringkat(filter) {
  const peta = gamePetaSemua();
  const satuan = filter !== QUIZ_RANK_TOTAL;
  const entri = [];

  Object.keys(peta).forEach((kunci) => {
    const absen = Number(kunci);
    const state = peta[kunci];
    if (!Number.isInteger(absen) || !state || !state.quiz) return;
    const quiz = state.quiz;
    const poin = satuan ? gameAngka(quiz.poinMapel[filter]) : gameAngka(quiz.poin);
    if (poin <= 0) return;
    const statSatuan = satuan && quiz.statMapel[filter] && typeof quiz.statMapel[filter] === "object"
      ? quiz.statMapel[filter]
      : { benar: 0, total: 0 };
    const akun = getMergedAccount(absen);
    if (!akun) return;
    entri.push({
      absen,
      nama: akun.namaPanggilan || `Absen ${absen}`,
      poin,
      benar: gameAngka(quiz.benar),
      total: gameAngka(quiz.total),
      benarSatuan: gameAngka(statSatuan.benar),
      totalSatuan: gameAngka(statSatuan.total),
      satuan,
    });
  });

  entri.sort((a, b) => {
    if (b.poin !== a.poin) return b.poin - a.poin;
    const benarA = a.satuan ? a.benarSatuan : a.benar;
    const benarB = b.satuan ? b.benarSatuan : b.benar;
    if (benarB !== benarA) return benarB - benarA;
    return a.absen - b.absen;
  });
  return entri;
}

function quizAvatarPeringkat(entri) {
  return quizEsc(quizInisial(entri.nama));
}

function quizBarisPeringkat(entri, posisi) {
  const kamu = !!gameUserAbsen && entri.absen === gameUserAbsen;
  const jawab = entri.satuan
    ? `✅ ${entri.benarSatuan}/${entri.totalSatuan} benar di mapel ini`
    : `✅ ${entri.benar}/${entri.total} jawaban benar`;
  return `
    <li class="peringkat-row${kamu ? " is-kamu" : ""}">
      <span class="peringkat-rank">${posisi}</span>
      <span class="peringkat-avatar peringkat-avatar-kecil peringkat-avatar-huruf" aria-hidden="true">${quizAvatarPeringkat(entri)}</span>
      <span class="peringkat-info">
        <strong><span class="peringkat-nama-baris">${gameAmanTeks(entri.nama)}</span>${kamu ? `<span class="peringkat-kamu">Kamu</span>` : ""}</strong>
        <small>${jawab}</small>
      </span>
      <span class="peringkat-total peringkat-poin">🏅 ${entri.poin}</span>
    </li>`;
}

function quizPeringkatIsi() {
  if (gameQuizRankFilter !== QUIZ_RANK_TOTAL && !quizMapelFilter()) gameQuizRankFilter = QUIZ_RANK_TOTAL;
  const mapel = quizMapelFilter();
  const entri = quizEntriPeringkat(gameQuizRankFilter);
  const memuat = !gamePeringkatSiap && !gamePeringkatGagal;

  const chips = [
    `<button class="quiz-rank-chip${gameQuizRankFilter === QUIZ_RANK_TOTAL ? " is-active" : ""}" type="button" data-quiz-action="rank-filter" data-filter="${QUIZ_RANK_TOTAL}" aria-pressed="${gameQuizRankFilter === QUIZ_RANK_TOTAL}"><span aria-hidden="true">🧠</span> Keseluruhan</button>`,
    ...gameQuizConfig.subjects.map(
      (s) => `<button class="quiz-rank-chip${gameQuizRankFilter === s.id ? " is-active" : ""}" type="button" data-quiz-action="rank-filter" data-filter="${quizEsc(s.id)}" aria-pressed="${gameQuizRankFilter === s.id}"><span aria-hidden="true">${quizEsc(s.emoji)}</span> ${quizEsc(s.nama)}</button>`
    ),
  ].join("");

  const kepala = `
    <div class="streak-card-head quiz-rank-head">
      <div>
        <span class="streak-kind">🏆 Peringkat</span>
        <h3>Poin Quiz${mapel ? ` · ${quizEsc(mapel.emoji)} ${quizEsc(mapel.nama)}` : " Keseluruhan"}</h3>
      </div>
      <span class="streak-fire streak-fire-coin">🏅 ${entri.length} siswa</span>
    </div>
    <p class="streak-hint">+${QUIZ_POIN_BENAR} poin tiap jawaban benar, bonus +${QUIZ_BONUS_SEMPURNA} kalau sesi ${QUIZ_PER_SESI} soal semuanya benar. Peringkat bisa dilihat keseluruhan atau per mata pelajaran.</p>
    <div class="quiz-rank-filter" role="group" aria-label="Pilih jenis peringkat">${chips}</div>`;

  let status = "Peringkat sekelas, otomatis diperbarui.";
  if (memuat) status = "Memuat peringkat sekelas...";
  else if (gamePeringkatGagal) status = "Sementara dari perangkat ini.";

  if (!entri.length && memuat) {
    return `${kepala}
      <div class="peringkat-skeleton" aria-hidden="true">
        ${Array.from({ length: 3 }, () => `
          <div class="peringkat-skeleton-row">
            <span class="skeleton peringkat-skeleton-avatar"></span>
            <span class="skeleton peringkat-skeleton-nama"></span>
            <span class="skeleton peringkat-skeleton-angka"></span>
          </div>`).join("")}
      </div>
      <p class="peringkat-status">${status}</p>`;
  }

  if (!entri.length) {
    const pesanMapel = mapel
      ? `Belum ada yang dapat poin di ${quizEsc(mapel.nama)}.`
      : "Belum ada yang dapat poin Quiz.";
    return `${kepala}
      <div class="peringkat-kosong">
        <span class="peringkat-kosong-icon" aria-hidden="true">🧠</span>
        <strong>${pesanMapel}</strong>
        <p>Jawab soal dengan benar buat dapat ${QUIZ_POIN_BENAR} poin per soal dan naik ke papan peringkat!</p>
      </div>
      <p class="peringkat-status">${status}</p>`;
  }

  const juara = entri.slice(0, 3);
  const urutanPodium = [juara[1], juara[0], juara[2]].filter(Boolean);
  const medali = ["🥇", "🥈", "🥉"];
  const podiumHtml = `
    <div class="peringkat-podium">
      ${urutanPodium
        .map((e) => {
          const pos = juara.indexOf(e) + 1;
          const kamu = !!gameUserAbsen && e.absen === gameUserAbsen;
          return `
            <div class="peringkat-slot peringkat-slot-${pos}${kamu ? " is-kamu" : ""}">
              <div class="peringkat-podium-card">
                ${kamu ? `<span class="peringkat-kamu">Kamu</span>` : ""}
                <span class="peringkat-medal" aria-hidden="true">${medali[pos - 1]}</span>
                <span class="peringkat-avatar peringkat-avatar-huruf" aria-hidden="true">${quizAvatarPeringkat(e)}</span>
                <strong class="peringkat-nama" title="${gameAmanTeks(e.nama)}">${gameAmanTeks(e.nama)}</strong>
                <span class="peringkat-total peringkat-poin">🏅 ${e.poin} poin</span>
              </div>
              <span class="peringkat-base" aria-hidden="true">${pos}</span>
            </div>`;
        })
        .join("")}
    </div>`;

  const sisa = entri.slice(3, QUIZ_RANK_JUMLAH);
  const barisHtml = sisa.map((e) => quizBarisPeringkat(e, entri.indexOf(e) + 1)).join("");
  const posisiKamu = entri.findIndex((e) => e.absen === gameUserAbsen);
  const ekstraHtml =
    posisiKamu >= QUIZ_RANK_JUMLAH
      ? `<li class="peringkat-pisah" aria-hidden="true">···</li>${quizBarisPeringkat(entri[posisiKamu], posisiKamu + 1)}`
      : "";
  const ajakanHtml =
    posisiKamu === -1
      ? `<p class="peringkat-ajakan">Kamu belum masuk peringkat${mapel ? ` ${quizEsc(mapel.nama)}` : ""}. Jawab soal dengan benar buat mulai! 🧠</p>`
      : "";

  return `${kepala}
    ${podiumHtml}
    <ol class="peringkat-list">
      ${barisHtml}
      ${ekstraHtml}
    </ol>
    ${ajakanHtml}
    <p class="peringkat-status">${status}</p>`;
}

function renderQuizPeringkat() {
  const el = document.getElementById("quiz-peringkat");
  if (!el || !gameState || !gameQuizConfig) return;
  el.innerHTML = quizPeringkatIsi();
}

function quizRenderHome(el) {
  const quiz = gameState.quiz;
  const akurasi = quiz.total > 0 ? Math.round((quiz.benar / quiz.total) * 100) : 0;
  const admin = quizBolehKelola();
  const jumlahMapel = gameQuizConfig.subjects.length;

  const kartu = gameQuizConfig.subjects
    .map((mapel) => {
      let bank = 0;
      let dilihat = 0;
      let benar = 0;
      let total = 0;
      mapel.topics.forEach((topik) => {
        const stat = quizStatTopik(topik.id);
        bank += stat.bank;
        dilihat += stat.dilihat;
        benar += stat.benar;
        total += stat.total;
      });
      const persen = bank > 0 ? Math.round((dilihat / bank) * 100) : 0;
      const poinMapel = gameAngka(quiz.poinMapel[mapel.id]);
      return `
        <button class="quiz-mapel" type="button" data-quiz-action="buka-mapel" data-mapel="${quizEsc(mapel.id)}">
          <span class="quiz-mapel-emoji" aria-hidden="true">${quizEsc(mapel.emoji)}</span>
          <span class="quiz-mapel-body">
            <strong>${quizEsc(mapel.nama)}</strong>
            <span class="quiz-mapel-meta">${mapel.topics.length} tema · ${bank} soal</span>
            <span class="quiz-mini-row">
              <span class="quiz-mini-bar"><span style="width:${persen}%"></span></span>
              <small>${total > 0 ? `${benar}/${total} benar` : "belum main"}</small>
            </span>
          </span>
          <span class="quiz-mapel-side">
            ${poinMapel > 0 ? `<span class="quiz-mapel-poin">🏅 ${poinMapel}</span>` : ""}
            <span class="quiz-mapel-go" aria-hidden="true">›</span>
          </span>
        </button>`;
    })
    .join("");

  el.innerHTML = `
    <div class="quiz-hero">
      <span class="quiz-hero-emoji" aria-hidden="true">🧠</span>
      <div class="quiz-hero-body">
        <strong>🏅 ${quiz.poin} poin${quiz.total > 0 ? ` · ${quiz.benar}/${quiz.total} benar` : ""}</strong>
        <span>Akurasi ${akurasi}% · ${quiz.sesi} sesi selesai · ${jumlahMapel} mata pelajaran</span>
      </div>
    </div>
    <div class="quiz-toolbar">
      <span><strong>${jumlahMapel}</strong> mata pelajaran siap dimainkan</span>
      ${admin ? `<button class="btn-secondary quiz-admin-btn" type="button" data-quiz-action="admin">⚙️ Kelola Tema</button>` : ""}
    </div>
    ${kartu ? `<div class="quiz-mapel-grid">${kartu}</div>` : `<div class="quiz-empty">Belum ada mata pelajaran. Admin bisa menambahkannya lewat Kelola Tema.</div>`}
    <section id="quiz-peringkat" class="streak-card quiz-rank" aria-label="Peringkat Quiz">${quizPeringkatIsi()}</section>`;
}

function quizRenderTopik(el) {
  let mapel = quizCariMapel(gameQuizSubjekId);
  if (!mapel) {
    gameQuizLayar = "home";
    quizRenderHome(el);
    return;
  }
  const admin = quizBolehKelola();
  const kartu = mapel.topics
    .map((topik) => {
      const stat = quizStatTopik(topik.id);
      const persen = stat.bank > 0 ? Math.round((stat.dilihat / stat.bank) * 100) : 0;
      return `
        <article class="quiz-tema-card">
          <div class="quiz-tema-head">
            <span class="quiz-tema-emoji" aria-hidden="true">${quizEsc(topik.emoji)}</span>
            <div>
              <strong>${quizEsc(topik.nama)}</strong>
              <small>${stat.bank} soal · ${stat.dilihat} sudah dicoba</small>
            </div>
          </div>
          <span class="quiz-mini-bar quiz-mini-bar-wide"><span style="width:${persen}%"></span></span>
          <div class="quiz-tema-foot">
            <small>${stat.total > 0 ? `${stat.benar}/${stat.total} benar (${Math.round((stat.benar / stat.total) * 100)}%)` : "Belum pernah dikerjakan"}</small>
            <button class="btn-primary quiz-start-btn" type="button" data-quiz-action="mulai" data-topik="${quizEsc(topik.id)}">Mulai →</button>
          </div>
        </article>`;
    })
    .join("");

  el.innerHTML = `
    <div class="quiz-crumb">
      <button class="quiz-back-link" type="button" data-quiz-action="home">← Semua Mapel</button>
      <span class="quiz-crumb-title">${quizEsc(mapel.emoji)} ${quizEsc(mapel.nama)}</span>
      ${admin ? `<button class="quiz-mini-admin" type="button" data-quiz-action="admin-mapel" data-mapel="${quizEsc(mapel.id)}">⚙️</button>` : ""}
    </div>
    ${kartu ? `<div class="quiz-tema-grid">${kartu}</div>` : `<div class="quiz-empty">Mapel ini belum punya tema. ${admin ? "Tambahkan lewat tombol ⚙️." : "Tunggu admin menambahkan tema ya."}</div>`}`;
}

function quizRenderMain(el) {
  const sesi = gameQuizSesi;
  if (!sesi || !sesi.soal.length) {
    gameQuizLayar = "topik";
    quizRenderTopik(el);
    return;
  }
  const soal = sesi.soal[sesi.posisi];
  const topik = quizCariTopik(sesi.topikId);
  const mapel = quizCariMapelDariTopik(sesi.topikId);
  const nomor = sesi.posisi + 1;
  const total = sesi.soal.length;
  const persen = Math.round((nomor / total) * 100);

  const opsi = soal.opsi
    .map((teks, i) => {
      let kelas = "quiz-opsi";
      if (sesi.terjawab) {
        if (i === soal.jawab) kelas += " benar";
        else if (i === sesi.pilih) kelas += " salah";
        else kelas += " redup";
      }
      return `
        <button class="${kelas}" type="button" data-quiz-action="jawab" data-opsi="${i}" ${sesi.terjawab ? "disabled" : ""}>
          <span class="quiz-opsi-ab">${"ABCD"[i]}</span>
          <span class="quiz-opsi-teks">${quizEsc(teks)}</span>
        </button>`;
    })
    .join("");

  const jawabanBenar = "ABCD"[soal.jawab];
  const umpan = sesi.terjawab
    ? `<div class="quiz-feedback ${sesi.pilih === soal.jawab ? "benar" : "salah"}">
        <strong>${sesi.pilih === soal.jawab ? "✅ Benar!" : `❌ Belum tepat. Jawaban benar: ${jawabanBenar}`}</strong>
        ${soal.bahas ? `<span>${quizEsc(soal.bahas)}</span>` : ""}
      </div>`
    : "";

  el.innerHTML = `
    <div class="quiz-play-top">
      <button class="quiz-back-link" type="button" data-quiz-action="keluar-main">← Keluar</button>
      <span class="quiz-play-count">Soal ${nomor} dari ${total}</span>
      <span class="quiz-play-score">✅ ${sesi.benar}</span>
    </div>
    <span class="quiz-mini-bar quiz-mini-bar-wide"><span style="width:${persen}%"></span></span>
    ${sesi.ulang && nomor === 1 ? `<p class="quiz-repeat-note">Semua soal tema ini sudah kamu coba. Soal diulang dari awal, ya.</p>` : ""}
    <article class="quiz-question">
      <span class="quiz-topic-tag">${quizEsc(mapel ? mapel.nama : "Quiz")} · ${quizEsc(topik ? topik.nama : "Tema")}</span>
      <h3>${quizEsc(soal.tanya)}</h3>
      <div class="quiz-opsi-list">${opsi}</div>
      ${umpan}
      ${sesi.terjawab
        ? `<button class="btn-primary quiz-next" type="button" data-quiz-action="lanjut">${nomor >= total ? "Lihat Hasil 🏁" : "Soal Berikutnya →"}</button>`
        : `<p class="quiz-hint">Pilih satu jawaban A, B, C, atau D.</p>`}
    </article>`;
}

function quizRenderHasil(el) {
  const sesi = gameQuizSesi;
  if (!sesi) {
    gameQuizLayar = "home";
    quizRenderHome(el);
    return;
  }
  const topik = quizCariTopik(sesi.topikId);
  const mapel = quizCariMapelDariTopik(sesi.topikId);
  const total = sesi.soal.length;
  const persen = total > 0 ? Math.round((sesi.benar / total) * 100) : 0;
  let judul = "Semangat, coba lagi ya!";
  let emoji = "💪";
  if (persen >= 80) {
    judul = "Luar biasa!";
    emoji = "🏆";
  } else if (persen >= 60) {
    judul = "Bagus, terus latihan!";
    emoji = "🎉";
  }

  const ulasan = sesi.soal
    .map((soal, i) => {
      const pilih = sesi.jawab[i];
      const benar = pilih === soal.jawab;
      return `
        <li class="${benar ? "benar" : "salah"}">
          <strong>${i + 1}. ${quizEsc(soal.tanya)}</strong>
          <span>Jawabanmu: ${pilih != null ? `${"ABCD"[pilih]}. ${quizEsc(soal.opsi[pilih])}` : "-"}</span>
          ${benar ? "" : `<span class="quiz-review-correct">Jawaban benar: ${"ABCD"[soal.jawab]}. ${quizEsc(soal.opsi[soal.jawab])}</span>`}
          ${soal.bahas ? `<span class="quiz-review-bahas">${quizEsc(soal.bahas)}</span>` : ""}
        </li>`;
    })
    .join("");

  el.innerHTML = `
    <div class="quiz-result-card">
      <span class="quiz-result-emoji" aria-hidden="true">${emoji}</span>
      <h3>${judul}</h3>
      <strong class="quiz-result-score">${sesi.benar}/${total}</strong>
      <p>${quizEsc(mapel ? mapel.nama : "Quiz")} · ${quizEsc(topik ? topik.nama : "Tema")} · akurasi ${persen}%</p>
      <div class="quiz-result-poin">
        <strong>🏅 +${gameAngka(sesi.poin)} poin</strong>
        ${sesi.bonus ? `<span>termasuk bonus sempurna +${sesi.bonus}</span>` : `<span>${QUIZ_POIN_BENAR} poin per jawaban benar</span>`}
      </div>
      <div class="quiz-result-actions">
        <button class="btn-primary" type="button" data-quiz-action="ulang">🔁 Ulangi Tema</button>
        <button class="btn-secondary" type="button" data-quiz-action="pilih-tema">📚 Pilih Tema</button>
        <button class="btn-secondary" type="button" data-quiz-action="home">🏠 Semua Mapel</button>
      </div>
      <details class="quiz-review">
        <summary>Lihat pembahasan</summary>
        <ol>${ulasan}</ol>
      </details>
    </div>`;
}

function quizRenderAdmin(el) {
  const daftar = gameQuizConfig.subjects
    .map((mapel) => {
      const soalCustom = mapel.topics.reduce((n, t) => n + (Array.isArray(t.soal) ? t.soal.length : 0), 0);
      return `
        <div class="quiz-admin-row">
          <button class="quiz-admin-open" type="button" data-quiz-action="admin-mapel" data-mapel="${quizEsc(mapel.id)}">
            <span class="quiz-admin-emoji" aria-hidden="true">${quizEsc(mapel.emoji)}</span>
            <span class="quiz-admin-info">
              <strong>${quizEsc(mapel.nama)}</strong>
              <small>${mapel.topics.length} tema · ${soalCustom} soal custom</small>
            </span>
            <span class="quiz-mapel-go" aria-hidden="true">›</span>
          </button>
          <button class="quiz-admin-del" type="button" data-quiz-action="hapus-mapel" data-mapel="${quizEsc(mapel.id)}" aria-label="Hapus mapel">🗑️</button>
        </div>`;
    })
    .join("");

  el.innerHTML = `
    <div class="quiz-crumb">
      <button class="quiz-back-link" type="button" data-quiz-action="home">← Kembali ke Quiz</button>
      <span class="quiz-crumb-title">⚙️ Kelola Tema</span>
    </div>
    <p class="quiz-admin-note">Perubahan tema dan soal langsung dipakai semua akun. Soal bawaan tetap ada dan tidak bisa dihapus, tapi kamu bisa menambah soal sendiri di tiap tema.</p>
    <div class="quiz-admin-form">
      <input id="quiz-new-mapel-nama" type="text" maxlength="40" placeholder="Nama mata pelajaran baru">
      <input id="quiz-new-mapel-emoji" type="text" maxlength="8" placeholder="📚">
      <button class="btn-primary" type="button" data-quiz-action="tambah-mapel">+ Tambah Mapel</button>
    </div>
    <div class="quiz-admin-list">${daftar || `<div class="quiz-empty">Belum ada mapel.</div>`}</div>
    <p class="quiz-admin-foot">Diedit oleh: ${quizEsc(gameQuizConfig.editedBy || "belum ada")} · ${gameQuizConfig.diperbarui ? new Date(gameQuizConfig.diperbarui).toLocaleString("id-ID") : "belum disimpan"}</p>`;
}

function quizRenderAdminMapel(el) {
  const mapel = quizCariMapel(gameQuizAdminSubjekId);
  if (!mapel) {
    gameQuizLayar = "admin";
    quizRenderAdmin(el);
    return;
  }
  const daftar = mapel.topics
    .map((topik) => {
      const bank = quizBankUntuk(topik.id).length;
      const custom = Array.isArray(topik.soal) ? topik.soal.length : 0;
      return `
        <div class="quiz-admin-row">
          <button class="quiz-admin-open" type="button" data-quiz-action="admin-topik" data-mapel="${quizEsc(mapel.id)}" data-topik="${quizEsc(topik.id)}">
            <span class="quiz-admin-emoji" aria-hidden="true">${quizEsc(topik.emoji)}</span>
            <span class="quiz-admin-info">
              <strong>${quizEsc(topik.nama)}</strong>
              <small>${bank} soal · ${custom} soal custom</small>
            </span>
            <span class="quiz-mapel-go" aria-hidden="true">›</span>
          </button>
          <button class="quiz-admin-del" type="button" data-quiz-action="hapus-topik" data-mapel="${quizEsc(mapel.id)}" data-topik="${quizEsc(topik.id)}" aria-label="Hapus tema">🗑️</button>
        </div>`;
    })
    .join("");

  el.innerHTML = `
    <div class="quiz-crumb">
      <button class="quiz-back-link" type="button" data-quiz-action="admin">← Semua Mapel</button>
      <span class="quiz-crumb-title">⚙️ ${quizEsc(mapel.emoji)} ${quizEsc(mapel.nama)}</span>
    </div>
    <div class="quiz-admin-block">
      <h4>Nama Mapel</h4>
      <div class="quiz-admin-form">
        <input id="quiz-mapel-nama" type="text" maxlength="40" value="${quizEsc(mapel.nama)}">
        <input id="quiz-mapel-emoji" type="text" maxlength="8" value="${quizEsc(mapel.emoji)}">
        <button class="btn-secondary" type="button" data-quiz-action="simpan-mapel" data-mapel="${quizEsc(mapel.id)}">Simpan Nama</button>
      </div>
    </div>
    <div class="quiz-admin-block">
      <h4>Tambah Tema</h4>
      <div class="quiz-admin-form">
        <input id="quiz-new-tema-nama" type="text" maxlength="60" placeholder="Nama tema baru">
        <input id="quiz-new-tema-emoji" type="text" maxlength="8" placeholder="📝">
        <button class="btn-primary" type="button" data-quiz-action="tambah-topik" data-mapel="${quizEsc(mapel.id)}">+ Tambah Tema</button>
      </div>
    </div>
    <div class="quiz-admin-list">${daftar || `<div class="quiz-empty">Mapel ini belum punya tema. Tambahkan di atas.</div>`}</div>`;
}

function quizRenderAdminTopik(el) {
  const mapel = quizCariMapel(gameQuizAdminSubjekId);
  const topik = mapel ? mapel.topics.find((t) => t.id === gameQuizAdminTopikId) : null;
  if (!mapel || !topik) {
    gameQuizLayar = "admin";
    quizRenderAdmin(el);
    return;
  }
  const bank = quizBankUntuk(topik.id);
  const custom = Array.isArray(topik.soal) ? topik.soal : [];

  const daftarCustom = custom
    .map(
      (soal, i) => `
      <li class="quiz-admin-soal">
        <div>
          <strong>${i + 1}. ${quizEsc(soal.tanya)}</strong>
          <small>Jawaban: ${"ABCD"[soal.jawab]}. ${quizEsc(soal.opsi[soal.jawab])}</small>
        </div>
        <button class="quiz-admin-del" type="button" data-quiz-action="hapus-soal" data-topik="${quizEsc(topik.id)}" data-soal="${quizEsc(soal.id)}" aria-label="Hapus soal">🗑️</button>
      </li>`
    )
    .join("");

  el.innerHTML = `
    <div class="quiz-crumb">
      <button class="quiz-back-link" type="button" data-quiz-action="admin-mapel" data-mapel="${quizEsc(mapel.id)}">← ${quizEsc(mapel.nama)}</button>
      <span class="quiz-crumb-title">⚙️ ${quizEsc(topik.emoji)} ${quizEsc(topik.nama)}</span>
    </div>
    <div class="quiz-admin-block">
      <h4>Nama Tema</h4>
      <div class="quiz-admin-form">
        <input id="quiz-tema-nama" type="text" maxlength="60" value="${quizEsc(topik.nama)}">
        <input id="quiz-tema-emoji" type="text" maxlength="8" value="${quizEsc(topik.emoji)}">
        <button class="btn-secondary" type="button" data-quiz-action="simpan-topik" data-mapel="${quizEsc(mapel.id)}" data-topik="${quizEsc(topik.id)}">Simpan Nama</button>
      </div>
    </div>
    <div class="quiz-admin-block">
      <h4>Tambah Soal (${custom.length}/${QUIZ_MAKS_SOAL_CUSTOM})</h4>
      <p class="quiz-admin-sub">Total soal tema ini: ${bank.length} (termasuk soal bawaan). Soal baru muncul untuk semua akun.</p>
      <div class="quiz-soal-form">
        <textarea id="quiz-soal-tanya" rows="2" maxlength="400" placeholder="Tulis pertanyaan..."></textarea>
        <input id="quiz-soal-a" type="text" maxlength="160" placeholder="Pilihan A">
        <input id="quiz-soal-b" type="text" maxlength="160" placeholder="Pilihan B">
        <input id="quiz-soal-c" type="text" maxlength="160" placeholder="Pilihan C">
        <input id="quiz-soal-d" type="text" maxlength="160" placeholder="Pilihan D">
        <select id="quiz-soal-jawab">
          <option value="0">Jawaban benar: A</option>
          <option value="1">Jawaban benar: B</option>
          <option value="2">Jawaban benar: C</option>
          <option value="3">Jawaban benar: D</option>
        </select>
        <input id="quiz-soal-bahas" type="text" maxlength="400" placeholder="Pembahasan (opsional)">
        <button class="btn-primary" type="button" data-quiz-action="tambah-soal" data-mapel="${quizEsc(mapel.id)}" data-topik="${quizEsc(topik.id)}" ${custom.length >= QUIZ_MAKS_SOAL_CUSTOM ? "disabled" : ""}>+ Tambah Soal</button>
      </div>
    </div>
    <div class="quiz-admin-block">
      <h4>Soal Custom</h4>
      ${daftarCustom ? `<ul class="quiz-admin-soal-list">${daftarCustom}</ul>` : `<div class="quiz-empty">Belum ada soal custom. Soal bawaan tetap dipakai.</div>`}
    </div>`;
}

function renderQuiz() {
  const view = document.getElementById("game-quiz-view");
  if (!view) return;
  if (!gameQuizConfig) gameQuizConfig = quizNormalisasiConfig(null);

  const locked = document.getElementById("quiz-locked");
  const content = document.getElementById("quiz-content");
  const badge = document.getElementById("quiz-badge");
  if (!locked || !content) return;

  const login = !!(currentUser && gameState);
  const quiz = login ? gameState.quiz : gameQuizStateAwal();
  if (badge) badge.textContent = `🏅 ${quiz.poin} poin`;

  if (!login) {
    content.hidden = true;
    locked.hidden = false;
    locked.innerHTML = `
      <div class="streak-locked-card">
        <span class="streak-locked-icon" aria-hidden="true">🔒</span>
        <h3>Login dulu buat mulai Quiz</h3>
        <p>Skor, soal yang sudah kamu coba, dan progres per tema disimpan di akunmu. Jadi tidak mengulang soal yang sama.</p>
        <button class="btn-primary" type="button" data-game-login>Login Sekarang</button>
      </div>`;
    return;
  }

  locked.hidden = true;
  content.hidden = false;

  if (gameQuizLayar === "main" || gameQuizLayar === "hasil") {
    if (!gameQuizSesi) gameQuizLayar = "home";
  }
  if (gameQuizLayar === "topik" && !gameQuizSubjekId) gameQuizLayar = "home";
  if (gameQuizLayar === "admin" && !quizBolehKelola()) gameQuizLayar = "home";
  if ((gameQuizLayar === "admin-mapel" || gameQuizLayar === "admin-topik") && !quizBolehKelola()) gameQuizLayar = "home";
  if (gameQuizLayar === "admin-topik" && !gameQuizAdminTopikId) gameQuizLayar = "admin-mapel";

  switch (gameQuizLayar) {
    case "topik":
      quizRenderTopik(content);
      break;
    case "main":
      quizRenderMain(content);
      break;
    case "hasil":
      quizRenderHasil(content);
      break;
    case "admin":
      quizRenderAdmin(content);
      break;
    case "admin-mapel":
      quizRenderAdminMapel(content);
      break;
    case "admin-topik":
      quizRenderAdminTopik(content);
      break;
    default:
      gameQuizLayar = "home";
      quizRenderHome(content);
  }
}

function quizTanganiAksi(aksi, btn) {
  if (!currentUser || !gameState) {
    document.getElementById("btn-show-login").click();
    return;
  }
  const mapelId = btn.dataset.mapel || "";
  const topikId = btn.dataset.topik || "";
  const soalId = btn.dataset.soal || "";

  if (aksi === "home") {
    gameQuizLayar = "home";
    gameQuizSesi = null;
    renderQuiz();
    SoundFX.modalClose();
    return;
  }

  if (aksi === "rank-filter") {
    gameQuizRankFilter = btn.dataset.filter || QUIZ_RANK_TOTAL;
    renderQuizPeringkat();
    SoundFX.buttonClick();
    return;
  }

  if (aksi === "buka-mapel") {
    gameQuizSubjekId = mapelId;
    gameQuizLayar = "topik";
    renderQuiz();
    SoundFX.cardOpen();
    return;
  }

  if (aksi === "pilih-tema") {
    gameQuizLayar = "topik";
    renderQuiz();
    SoundFX.buttonClick();
    return;
  }

  if (aksi === "mulai") {
    quizMulai(topikId);
    return;
  }

  if (aksi === "ulang") {
    quizMulai(gameQuizTopikId);
    return;
  }

  if (aksi === "keluar-main") {
    gameQuizLayar = "topik";
    gameQuizSesi = null;
    renderQuiz();
    SoundFX.modalClose();
    return;
  }

  if (aksi === "jawab") {
    quizJawab(Number(btn.dataset.opsi));
    return;
  }

  if (aksi === "lanjut") {
    quizLanjut();
    return;
  }

  if (aksi === "admin") {
    if (!quizBolehKelola()) return;
    gameQuizLayar = "admin";
    gameQuizAdminSubjekId = "";
    gameQuizAdminTopikId = "";
    renderQuiz();
    SoundFX.cardOpen();
    return;
  }

  if (aksi === "admin-mapel") {
    if (!quizBolehKelola()) return;
    gameQuizAdminSubjekId = mapelId;
    gameQuizAdminTopikId = "";
    gameQuizLayar = "admin-mapel";
    renderQuiz();
    SoundFX.buttonClick();
    return;
  }

  if (aksi === "admin-topik") {
    if (!quizBolehKelola()) return;
    gameQuizAdminSubjekId = mapelId;
    gameQuizAdminTopikId = topikId;
    gameQuizLayar = "admin-topik";
    renderQuiz();
    SoundFX.buttonClick();
    return;
  }

  if (aksi === "tambah-mapel") {
    if (!quizBolehKelola()) return;
    const namaEl = document.getElementById("quiz-new-mapel-nama");
    const emojiEl = document.getElementById("quiz-new-mapel-emoji");
    const nama = quizTeksBersih(namaEl ? namaEl.value : "", 40);
    if (!nama) {
      quizTampilNotice("Nama mapel belum diisi.");
      return;
    }
    gameQuizConfig.subjects.push({
      id: quizIdBaru("mapel"),
      nama,
      emoji: quizTeksBersih(emojiEl ? emojiEl.value : "", 8) || "📚",
      topics: [],
    });
    quizSimpanConfig(`Mapel ${nama} ditambahkan.`);
    SoundFX.resultReveal();
    return;
  }

  if (aksi === "simpan-mapel") {
    if (!quizBolehKelola()) return;
    const mapel = quizCariMapel(mapelId);
    if (!mapel) return;
    const namaEl = document.getElementById("quiz-mapel-nama");
    const emojiEl = document.getElementById("quiz-mapel-emoji");
    const nama = quizTeksBersih(namaEl ? namaEl.value : "", 40);
    if (!nama) {
      quizTampilNotice("Nama mapel tidak boleh kosong.");
      return;
    }
    mapel.nama = nama;
    mapel.emoji = quizTeksBersih(emojiEl ? emojiEl.value : "", 8) || "📚";
    quizSimpanConfig("Nama mapel disimpan.");
    SoundFX.buttonClick();
    return;
  }

  if (aksi === "hapus-mapel") {
    if (!quizBolehKelola()) return;
    if (gameQuizConfig.subjects.length <= 1) {
      quizTampilNotice("Minimal harus ada satu mata pelajaran.");
      return;
    }
    const mapel = quizCariMapel(mapelId);
    if (!mapel) return;
    if (!window.confirm(`Hapus mapel "${mapel.nama}" beserta tema dan soal customnya?`)) return;
    gameQuizConfig.subjects = gameQuizConfig.subjects.filter((s) => s.id !== mapelId);
    if (gameQuizAdminSubjekId === mapelId) gameQuizAdminSubjekId = "";
    quizSimpanConfig(`Mapel ${mapel.nama} dihapus.`);
    SoundFX.errorSound();
    return;
  }

  if (aksi === "tambah-topik") {
    if (!quizBolehKelola()) return;
    const mapel = quizCariMapel(mapelId);
    if (!mapel) return;
    const namaEl = document.getElementById("quiz-new-tema-nama");
    const emojiEl = document.getElementById("quiz-new-tema-emoji");
    const nama = quizTeksBersih(namaEl ? namaEl.value : "", 60);
    if (!nama) {
      quizTampilNotice("Nama tema belum diisi.");
      return;
    }
    mapel.topics.push({
      id: quizIdBaru("tema"),
      nama,
      emoji: quizTeksBersih(emojiEl ? emojiEl.value : "", 8) || "📝",
      soal: [],
    });
    quizSimpanConfig(`Tema ${nama} ditambahkan.`);
    SoundFX.resultReveal();
    return;
  }

  if (aksi === "simpan-topik") {
    if (!quizBolehKelola()) return;
    const mapel = quizCariMapel(mapelId);
    const topik = mapel ? mapel.topics.find((t) => t.id === topikId) : null;
    if (!topik) return;
    const namaEl = document.getElementById("quiz-tema-nama");
    const emojiEl = document.getElementById("quiz-tema-emoji");
    const nama = quizTeksBersih(namaEl ? namaEl.value : "", 60);
    if (!nama) {
      quizTampilNotice("Nama tema tidak boleh kosong.");
      return;
    }
    topik.nama = nama;
    topik.emoji = quizTeksBersih(emojiEl ? emojiEl.value : "", 8) || "📝";
    quizSimpanConfig("Nama tema disimpan.");
    SoundFX.buttonClick();
    return;
  }

  if (aksi === "hapus-topik") {
    if (!quizBolehKelola()) return;
    const mapel = quizCariMapel(mapelId);
    const topik = mapel ? mapel.topics.find((t) => t.id === topikId) : null;
    if (!topik) return;
    if (!window.confirm(`Hapus tema "${topik.nama}"? Soal custom di dalamnya ikut terhapus.`)) return;
    mapel.topics = mapel.topics.filter((t) => t.id !== topikId);
    quizBankCache.delete(topikId);
    if (gameQuizAdminTopikId === topikId) {
      gameQuizAdminTopikId = "";
      gameQuizLayar = "admin-mapel";
    }
    quizSimpanConfig(`Tema ${topik.nama} dihapus.`);
    SoundFX.errorSound();
    return;
  }

  if (aksi === "tambah-soal") {
    if (!quizBolehKelola()) return;
    const mapel = quizCariMapel(mapelId);
    const topik = mapel ? mapel.topics.find((t) => t.id === topikId) : null;
    if (!topik) return;
    if (!Array.isArray(topik.soal)) topik.soal = [];
    if (topik.soal.length >= QUIZ_MAKS_SOAL_CUSTOM) {
      quizTampilNotice(`Maksimal ${QUIZ_MAKS_SOAL_CUSTOM} soal custom per tema.`);
      return;
    }
    const ambil = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : "";
    };
    const tanya = quizTeksBersih(ambil("quiz-soal-tanya"), 400);
    const opsi = ["a", "b", "c", "d"].map((k) => quizTeksBersih(ambil(`quiz-soal-${k}`), 160));
    const jawabEl = document.getElementById("quiz-soal-jawab");
    const jawab = jawabEl ? Math.floor(Number(jawabEl.value)) : 0;
    if (!tanya) {
      quizTampilNotice("Pertanyaan belum diisi.");
      return;
    }
    if (opsi.some((o) => !o)) {
      quizTampilNotice("Semua pilihan A, B, C, D harus diisi.");
      return;
    }
    if (!Number.isInteger(jawab) || jawab < 0 || jawab > 3) {
      quizTampilNotice("Pilih jawaban yang benar.");
      return;
    }
    topik.soal.push({
      id: quizIdBaru("soal"),
      tanya,
      opsi,
      jawab,
      bahas: quizTeksBersih(ambil("quiz-soal-bahas"), 400),
      asal: "custom",
    });
    quizSimpanConfig("Soal baru ditambahkan.");
    SoundFX.resultReveal();
    return;
  }

  if (aksi === "hapus-soal") {
    if (!quizBolehKelola()) return;
    const mapel = quizCariMapel(mapelId);
    const topik = mapel ? mapel.topics.find((t) => t.id === topikId) : null;
    if (!topik || !Array.isArray(topik.soal)) return;
    if (!window.confirm("Hapus soal custom ini?")) return;
    topik.soal = topik.soal.filter((q) => q.id !== soalId);
    quizSimpanConfig("Soal dihapus.");
    SoundFX.errorSound();
    return;
  }
}

function setupGamesTab() {
  const panel = document.querySelector('[data-page-panel="games"]');
  if (!panel) return;

  renderGames();
  setupGamesListExtras();

  document.getElementById("btn-game-back").addEventListener("click", () => {
    document.getElementById("game-streak-view").hidden = true;
    document.getElementById("games-list-view").hidden = false;
    SoundFX.modalClose();
  });

  const btnTimerBack = document.getElementById("btn-timer-back");
  if (btnTimerBack) {
    btnTimerBack.addEventListener("click", () => {
      document.getElementById("game-timer-view").hidden = true;
      document.getElementById("games-list-view").hidden = false;
      renderGames();
      SoundFX.modalClose();
    });
  }

  const btnGtcBack = document.getElementById("btn-gtc-back");
  if (btnGtcBack) {
    btnGtcBack.addEventListener("click", () => {
      if (typeof window.gtcTutup === "function") window.gtcTutup();
      document.getElementById("game-guesscolor-view").hidden = true;
      document.getElementById("games-list-view").hidden = false;
      renderGames();
      SoundFX.modalClose();
    });
  }

  const btnQuizBack = document.getElementById("btn-quiz-back");
  if (btnQuizBack) {
    btnQuizBack.addEventListener("click", () => {
      document.getElementById("game-quiz-view").hidden = true;
      document.getElementById("games-list-view").hidden = false;
      gameQuizLayar = "home";
      gameQuizSesi = null;
      SoundFX.modalClose();
    });
  }

  const btnFishingBack = document.getElementById("btn-fishing-back");
  if (btnFishingBack) {
    btnFishingBack.addEventListener("click", () => {
      if (typeof window.fishingTutup === "function" && window.fishingTutup() === false) return;
      document.getElementById("game-fishing-view").hidden = true;
      document.getElementById("games-list-view").hidden = false;
      renderGames();
      SoundFX.modalClose();
    });
  }

  const btnTableverseBack = document.getElementById("btn-tableverse-back");
  if (btnTableverseBack) {
    btnTableverseBack.addEventListener("click", () => {
      if (typeof window.tableverseTutup === "function") window.tableverseTutup();
      document.getElementById("game-tableverse-view").hidden = true;
      document.getElementById("games-list-view").hidden = false;
      renderGames();
      SoundFX.modalClose();
    });
  }

  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-game-login]")) {
      document.getElementById("btn-show-login").click();
      return;
    }

    const kartu = e.target.closest("[data-open-game]");
    if (kartu) {
      const game = kartu.dataset.openGame;
      if (GAME_IDS_ATUR.includes(game)) catatGameDimainkan(game);
      if (game !== "fishing" && typeof window.fishingTutup === "function" && window.fishingTutup() === false) return;
      if (game !== "tableverse" && typeof window.tableverseTutup === "function") window.tableverseTutup();
      if (game !== "guesscolor" && typeof window.gtcTutup === "function") window.gtcTutup();
      document.getElementById("games-list-view").hidden = true;
      document.getElementById("game-timer-view").hidden = game !== "timer";
      document.getElementById("game-guesscolor-view").hidden = game !== "guesscolor";
      document.getElementById("game-streak-view").hidden = game !== "streak";
      document.getElementById("game-quiz-view").hidden = game !== "quiz";
      document.getElementById("game-fishing-view").hidden = game !== "fishing";
      document.getElementById("game-tableverse-view").hidden = game !== "tableverse";
      if (game === "timer") {
        timerRender();
      } else if (game === "guesscolor") {
        if (typeof window.gtcBuka === "function") window.gtcBuka();
      } else if (game === "quiz") {
        gameQuizLayar = "home";
        gameQuizSesi = null;
        gameQuizSubjekId = "";
        gameQuizTopikId = "";
        renderQuiz();
      } else if (game === "tableverse") {
        if (typeof window.tableverseBuka === "function") window.tableverseBuka();
      } else if (game === "fishing") {
        if (typeof window.fishingBuka === "function") window.fishingBuka();
      } else {
        renderGames();
      }
      SoundFX.cardOpen();
      return;
    }

    const quizBtn = e.target.closest("[data-quiz-action]");
    if (quizBtn && !quizBtn.disabled) {
      quizTanganiAksi(quizBtn.dataset.quizAction, quizBtn);
      return;
    }

    const btn = e.target.closest("[data-game-action]");
    if (!btn || btn.disabled) return;
    gameTanganiAksi(btn.dataset.gameAction, btn);
  });
}

/* ===================================================
   13. NOTIFIKASI ESKUL (5 menit sebelum, 1x per akun per eskul)
   Catatan: cuma jalan kalau web ini lagi kebuka di browser.
=================================================== */
function setupNotifikasiEskul() {
  setInterval(cekNotifikasiEskul, 30 * 1000);
}

function cekNotifikasiEskul() {
  if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return; // di APK pakai native-notif.js
  if (!currentUser || !currentUser.notifEskul) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const now = new Date();
  const namaHariIni = HARI[now.getDay()];
  const daftarEskulHariIni = jadwalEskul[namaHariIni] || [];
  const eskulSaya = [currentUser.eskulWajib, ...(currentUser.eskulPilihan || [])].filter(Boolean);

  daftarEskulHariIni.forEach((entry) => {
    const nama = entry.split(" (")[0];
    if (!eskulSaya.includes(nama)) return;

    const jamMatch = /(\d{1,2})\.(\d{2})-/.exec(entry);
    if (!jamMatch) return;

    const mulai = new Date(now);
    mulai.setHours(Number(jamMatch[1]), Number(jamMatch[2]), 0, 0);
    const target = new Date(mulai.getTime() - 5 * 60 * 1000);
    const bedaMenit = (now - target) / 60000;

    if (bedaMenit < 0 || bedaMenit > 1) return; // cuma nembak di jendela 1 menit biar gak dobel

    const kunciNotif = `kelas73-notif-${dateKey(now)}-${nama}`;
    if (localStorage.getItem(kunciNotif)) return;

    new Notification("Eskul 5 menit lagi!", {
      body: `${nama} mulai jam ${jamMatch[1]}.${jamMatch[2]}, siap-siap yuk!`,
    });
    localStorage.setItem(kunciNotif, "1");
  });
}


/* ===================================================
   13. TES NOTIFIKASI ESKUL (10 detik setelah tombol diklik, eskul wajib)
=================================================== */
async function tesNotifikasiEskul() {
  const status = document.getElementById("tes-notif-status");
  const tampil = (teks) => { status.textContent = teks; status.hidden = false; };

  const wajib =
    document.querySelector('input[name="eskul-wajib"]:checked')?.value ||
    (currentUser && currentUser.eskulWajib) ||
    "";
  if (!wajib) { tampil("Pilih Eskul Wajib dulu ya."); return; }

  const entry = Object.values(jadwalEskul).flat().find((e) => e.split(" (")[0] === wajib);
  const jam = entry ? /(\d{1,2})\.(\d{2})-/.exec(entry) : null;
  const judul = "Tes Notifikasi Eskul";
  const isi = jam ? `${wajib} mulai jam ${jam[1]}.${jam[2]}, siap-siap yuk!` : `${wajib}, siap-siap yuk!`;

  // Versi APK: notif lokal Android (tetap bunyi walau app ditutup)
  if (window.nativeTesNotif) {
    const ok = await window.nativeTesNotif(judul, isi, 10);
    tampil(ok
      ? `Oke! Notif ${wajib} muncul 10 detik lagi. Boleh langsung tutup app buat ngetes.`
      : "Izin notifikasi belum diberikan. Aktifin dulu di Pengaturan HP.");
    return;
  }

  // Versi web
  if (typeof Notification === "undefined") {
    tampil("Browser ini gak support notifikasi. Coba pakai aplikasi Kelas 7.3-nya.");
    return;
  }
  let izin = Notification.permission;
  if (izin !== "granted") izin = await Notification.requestPermission();
  if (izin !== "granted") { tampil("Izin notifikasi ditolak. Aktifin dulu di pengaturan browser."); return; }

  tampil(`Oke! Notif ${wajib} muncul 10 detik lagi. Jangan tutup halaman ini ya.`);
  setTimeout(() => {
    try {
      new Notification(judul, { body: isi });
    } catch (err) {
      tampil("Browser ini gak bisa nampilin notifikasi dari web. Coba pakai aplikasi Kelas 7.3-nya.");
    }
  }, 10000);
}


/* ===================================================
   14. ALBUM FOTO (maks 3 foto per siswa)
   Foto dikecilin di HP dulu (maks 900px, JPEG) lalu disimpan sebagai teks di
   koleksi Firestore "albums" (1 dokumen per siswa). Dimuat cuma pas Album dibuka,
   jadi gak bikin halaman utama berat.
=================================================== */
const ALBUM_SLOTS = ["f1", "f2", "f3"];
const ALBUM_MAKS_SISI = 900;
const ALBUM_MAKS_KARAKTER = 200000;
let albumEdit = {};          // isi album yang lagi diedit (f1, f2, f3)
let albumEditAbsen = null;
let albumSlotAktif = null;
let albumToken = 0;

async function ambilAlbum(absen) {
  const doc = await db.collection("albums").doc(String(absen)).get();
  return doc.exists ? doc.data() : {};
}

function kompresFoto(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("bukan-gambar")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const skala = Math.min(1, ALBUM_MAKS_SISI / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * skala));
      canvas.height = Math.max(1, Math.round(img.height * skala));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let kualitas = 0.8;
      let hasil = canvas.toDataURL("image/jpeg", kualitas);
      while (hasil.length > ALBUM_MAKS_KARAKTER && kualitas > 0.35) {
        kualitas -= 0.1;
        hasil = canvas.toDataURL("image/jpeg", kualitas);
      }
      if (hasil.length > ALBUM_MAKS_KARAKTER) { reject(new Error("terlalu-besar")); return; }
      resolve(hasil);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("gagal-baca")); };
    img.src = url;
  });
}

/* ---------- Lihat album (dari tombol Album di profil) ---------- */
async function bukaAlbum(absen) {
  const modal = document.getElementById("modal-album");
  const grid = document.getElementById("album-grid");
  const status = document.getElementById("album-status");
  const merged = getMergedAccount(absen);
  const token = ++albumToken;

  document.getElementById("album-title").textContent = `Album ${merged.namaPanggilan}`;
  grid.innerHTML = ALBUM_SLOTS.map(() => `<span class="album-skeleton skeleton" aria-hidden="true"></span>`).join("");
  status.textContent = "Memuat foto...";
  openModal(modal);

  try {
    const data = await ambilAlbum(absen);
    if (token !== albumToken) return; // album lain keburu dibuka
    const fotos = ALBUM_SLOTS.map((slot) => data[slot]).filter(Boolean);
    status.textContent = fotos.length ? "" : `${merged.namaPanggilan} belum upload foto.`;
    grid.innerHTML = "";
    fotos.forEach((src, i) => {
      const img = document.createElement("img");
      img.className = "album-foto";
      img.alt = `Foto ${i + 1} milik ${merged.namaPanggilan}`;
      img.src = src;
      grid.appendChild(img);
    });
  } catch (err) {
    if (token !== albumToken) return;
    console.error("Gagal muat album:", err);
    grid.innerHTML = "";
    status.textContent = `Gagal muat album (${err.code || err.message}).`;
  }
}

/* ---------- Upload / Ganti / Hapus (di Edit Profil) ---------- */
function statusAlbumEdit(teks) {
  const el = document.getElementById("album-edit-status");
  el.textContent = teks;
  el.hidden = !teks;
}

function renderSlotAlbumEdit() {
  const wrap = document.getElementById("profil-album-slots");
  wrap.innerHTML = "";
  ALBUM_SLOTS.forEach((slot, i) => {
    const ada = !!albumEdit[slot];
    const el = document.createElement("div");
    el.className = "album-slot";
    el.innerHTML = `
      <div class="album-thumb">${ada ? `<img alt="Foto ${i + 1}">` : `<span>Foto ${i + 1}<br>kosong</span>`}</div>
      <button type="button" class="btn-secondary album-btn" data-aksi="upload" data-slot="${slot}">${ada ? "Ganti" : "Upload"}</button>
      ${ada ? `<button type="button" class="btn-text-only album-btn album-hapus" data-aksi="hapus" data-slot="${slot}">Hapus</button>` : ""}
    `;
    if (ada) el.querySelector("img").src = albumEdit[slot];
    wrap.appendChild(el);
  });
}

async function muatAlbumEdit(absen) {
  albumEditAbsen = absen;
  albumEdit = {};
  renderSlotAlbumEdit();
  statusAlbumEdit("Memuat album...");
  try {
    const data = await ambilAlbum(absen);
    if (albumEditAbsen !== absen) return;
    albumEdit = data;
    renderSlotAlbumEdit();
    statusAlbumEdit("");
  } catch (err) {
    statusAlbumEdit(`Gagal memuat album (${err.code || err.message}).`);
  }
}

async function simpanSlotAlbum(slot, nilai) {
  await db.collection("albums").doc(String(albumEditAbsen)).set(
    { [slot]: nilai, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  albumEdit[slot] = nilai;
  renderSlotAlbumEdit();
}

async function uploadFotoAlbum(slot, file) {
  statusAlbumEdit("Memproses foto...");
  try {
    const dataUrl = await kompresFoto(file);
    statusAlbumEdit("Menyimpan...");
    await simpanSlotAlbum(slot, dataUrl);
    statusAlbumEdit("Foto tersimpan ✓");
    SoundFX.resultReveal();
  } catch (err) {
    const pesan = {
      "bukan-gambar": "Itu bukan file gambar.",
      "gagal-baca": "Foto gak bisa dibaca. Coba foto lain (JPG atau PNG).",
      "terlalu-besar": "Foto terlalu besar buat dikecilin. Coba foto lain.",
    }[err.message] || `Gagal simpan (${err.code || err.message}).`;
    console.error("Gagal upload foto album:", err);
    statusAlbumEdit(pesan);
    SoundFX.errorSound();
  }
}

async function hapusFotoAlbum(slot) {
  if (!confirm("Hapus foto ini dari album?")) return;
  statusAlbumEdit("Menghapus...");
  try {
    await simpanSlotAlbum(slot, "");
    statusAlbumEdit("Foto dihapus.");
  } catch (err) {
    console.error("Gagal hapus foto album:", err);
    statusAlbumEdit(`Gagal hapus (${err.code || err.message}).`);
  }
}

function setupAlbum() {
  const modal = document.getElementById("modal-album");
  setupModalDismiss(modal);
  // album ditutup tapi modal profil masih kebuka di bawahnya -> kunci scroll lagi
  modal.addEventListener("click", () => setTimeout(() => {
    if (!document.getElementById("modal-detail").hidden) document.body.style.overflow = "hidden";
  }, 0));

  const input = document.getElementById("album-file-input");
  document.getElementById("profil-album-slots").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-aksi]");
    if (!btn) return;
    if (btn.dataset.aksi === "upload") {
      albumSlotAktif = btn.dataset.slot;
      input.value = "";
      input.click();
    } else {
      hapusFotoAlbum(btn.dataset.slot);
    }
  });
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file && albumSlotAktif) uploadFotoAlbum(albumSlotAktif, file);
  });
}
