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
  { absen: 17, tingkat: "hampir" },
  { absen: 25, tingkat: "hampir" },
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
  gameSaveTimer = setTimeout(() => {
    db.collection("games")
      .doc(String(absen))
      .set({ streak: payload }, { merge: true })
      .catch((err) => {
        if (!gameCloudWarned) {
          console.warn("Game Streak disimpan di perangkat dulu (rules Firestore games belum aktif):", err.code || err.message);
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
        const remote = gameNormalisasi(snap.data().streak);
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
        peta[absen] = gameNormalisasi(doc.data().streak);
      });
      gamePeringkatCloud = peta;
      gamePeringkatSiap = true;
      gamePeringkatGagal = false;
      renderStreakPeringkat();
    },
    (err) => {
      if (token !== gamePeringkatToken) return;
      gamePeringkatSiap = false;
      gamePeringkatGagal = true;
      if (!gamePeringkatWarned) {
        console.warn("Peringkat Streak sementara dari perangkat ini:", err.code || err.message);
        gamePeringkatWarned = true;
      }
      renderStreakPeringkat();
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

function gameEntriPeringkat() {
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

  gameUserAbsen = absen;
  gameToken++;
  if (gameUnsubscribe) {
    gameUnsubscribe();
    gameUnsubscribe = null;
  }

  if (!absen) {
    gameState = null;
    gameHentikanPeringkat();
    renderGames();
    return;
  }

  gameState = gameMuatCache(absen) || gameNormalisasi(gameStateAwal());
  renderGames();
  gameLangganan(absen);
  gameLanggananPeringkat();
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

function renderGames() {
  const list = document.getElementById("games-list");
  if (!list) return;

  const login = !!(currentUser && gameState);
  let ringkas = "Login dulu buat simpan progres di akunmu";
  if (login) {
    const hewan = gameState.hewan.jenis
      ? `${STREAK_HEWAN[gameState.hewan.jenis].emoji} ${gameState.hewan.streak} hari`
      : "belum pilih hewan";
    ringkas = `🔥 ${gameState.pohon.streak} hari pohon · ${hewan}`;
  }

  list.innerHTML = `
    <button class="game-card" type="button" data-open-game="streak">
      <span class="game-icon" aria-hidden="true">🔥<span class="game-icon-spark">✨</span></span>
      <span class="game-info">
        <strong>Streak</strong>
        <small>Rawat pohon & hewan tiap hari, kumpulkan coin buat hias pet.</small>
        <span class="game-progress">${ringkas}</span>
      </span>
      <span class="game-play">Main <span aria-hidden="true">→</span></span>
    </button>`;

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

function setupGamesTab() {
  const panel = document.querySelector('[data-page-panel="games"]');
  if (!panel) return;

  renderGames();

  document.getElementById("btn-game-back").addEventListener("click", () => {
    document.getElementById("game-streak-view").hidden = true;
    document.getElementById("games-list-view").hidden = false;
    SoundFX.modalClose();
  });

  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-game-login]")) {
      document.getElementById("btn-show-login").click();
      return;
    }

    const kartu = e.target.closest("[data-open-game]");
    if (kartu) {
      document.getElementById("games-list-view").hidden = true;
      document.getElementById("game-streak-view").hidden = false;
      renderGames();
      SoundFX.cardOpen();
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
