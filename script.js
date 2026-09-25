// script.js

let currentUser = null;      // objek akun (merged) yang lagi login, atau null kalau Guest
let accountsData = {};       // cache dari koleksi Firestore "accounts", key = absen (string)
let infoBesok = null;        // hasil getInfoBesok() dari schedule.js
let infoOverrideData = {};   // override PR / eskul libur / catatan dari Firestore utk besok
let pollingCache = [];       // cache data polling terbaru buat referensi klik vote/setting

document.addEventListener("DOMContentLoaded", () => {
  setupSoundToggle();
  setupAccountsListener();
  setupPageTabs();
  renderGridSiswa();
  setupDetailModal();
  setupPickerModal();
  setupAccountUI();
  setupInfoTab();
  setupMedsosTab();
  setupPollingTab();
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

  dataSiswa.forEach((siswa) => {
    const merged = getMergedAccount(siswa.absen);
    const card = document.createElement("button");
    card.className = "siswa-card";
    card.type = "button";
    card.dataset.absen = siswa.absen;
    card.innerHTML = `
      <span class="siswa-absen">${String(siswa.absen).padStart(2, "0")}</span>
      <div class="siswa-nama">${merged.namaPanggilan}</div>
    `;
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
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

    document.getElementById("detail-absen").textContent = String(siswa.absen).padStart(2, "0");
    document.getElementById("detail-nama").textContent = siswa.namaLengkap;
    document.getElementById("detail-panggilan").textContent = merged.namaPanggilan;
    document.getElementById("detail-cita").textContent = merged.citaCita;
    document.getElementById("detail-lagu").textContent = merged.laguFavorit;

    const bioEl = document.getElementById("detail-bio");
    const bioToggle = document.getElementById("btn-bio-toggle");
    bioEl.textContent = merged.bio && merged.bio.trim() ? merged.bio : "belom ada Bio";
    bioEl.classList.remove("expanded");
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
    btn.textContent = expand ? "Sembunyikan" : "Baca selengkapnya";
  });

  document.getElementById("btn-edit-this-profil").addEventListener("click", () => {
    if (!currentUser) return;
    closeModal(modal);
    openEditProfilModal(currentUser.absen);
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

  setupPickerTabs();
  const personPicker = setupPersonPicker();
  const teamsPicker = setupTeamsPicker();

  document.getElementById("btn-reset").addEventListener("click", () => {
    personPicker.reset();
    teamsPicker.reset();
    SoundFX.resetSound();
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
  const isSisa = () => getLiveSiswaList().filter((s) => !sudahTerpilih.includes(s.absen));

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
    shuffleAndPick(getLiveSiswaList(), (terpilih) => {
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

  function acakArray(arr) {
    const hasil = [...arr];
    for (let i = hasil.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
    }
    return hasil;
  }

  function buatTim() {
    const ukuran = Number(sizeSelect.value);
    const acak = acakArray(getLiveSiswaList());
    const jumlahTim = Math.ceil(acak.length / ukuran);
    const tim = Array.from({ length: jumlahTim }, () => []);

    acak.forEach((siswa, idx) => {
      tim[idx % jumlahTim].push(siswa);
    });

    resultBox.innerHTML = tim
      .map(
        (anggota, i) => `
        <div class="team-block">
          <h4>Tim ${i + 1}</h4>
          <ul>
            ${anggota.map((s) => `<li>${s.namaPanggilan} (absen ${String(s.absen).padStart(2, "0")})</li>`).join("")}
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
    eskulLiburList: Array.from(document.querySelectorAll('input[name="eskul-libur"]:checked')).map((el) => el.value),
    catatan: document.getElementById("edit-catatan").value.trim(),
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
    document.getElementById("profil-bio-count").textContent = `${e.target.value.length}/150`;
  });

  document.getElementById("profil-notif").addEventListener("change", (e) => {
    if (e.target.checked && typeof Notification !== "undefined") {
      Notification.requestPermission().then((perm) => {
        if (perm !== "granted") e.target.checked = false;
      });
    }
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
  document.getElementById("profil-bio-count").textContent = `${merged.bio.length}/150`;
  document.getElementById("profil-notif").checked = !!merged.notifEskul;
  renderEskulPilihanForm(merged);
  document.getElementById("profil-error").hidden = true;
  openModal(document.getElementById("modal-edit-profil"));
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
    eskulWajib,
    eskulPilihan,
    notifEskul: document.getElementById("profil-notif").checked,
  };

  try {
    await db.collection("accounts").doc(String(currentUser.absen)).set(payload, { merge: true });
    closeModal(document.getElementById("modal-edit-profil"));
    SoundFX.resultReveal();
  } catch (err) {
    errorEl.textContent = "Gagal simpan, cek koneksi internet.";
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
      (err) => console.error("Gagal ambil data medsos:", err)
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
  db.collection("polling")
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snap) => {
        const daftar = [];
        snap.forEach((doc) => daftar.push({ id: doc.id, ...doc.data() }));
        pollingCache = daftar;
        renderPollingList(daftar);
      },
      (err) => console.error("Gagal ambil polling:", err)
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
   12. NOTIFIKASI ESKUL (5 menit sebelum, 1x per akun per eskul)
   Catatan: cuma jalan kalau web ini lagi kebuka di browser.
=================================================== */
function setupNotifikasiEskul() {
  setInterval(cekNotifikasiEskul, 30 * 1000);
}

function cekNotifikasiEskul() {
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
