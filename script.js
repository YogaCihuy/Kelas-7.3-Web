// script.js

document.addEventListener("DOMContentLoaded", () => {
  setupSoundToggle();
  renderGridSiswa();
  setupDetailModal();
  setupPickerModal();
});

/* ===================================================
   0. SOUND EFFECTS
   Sintesis nada pendek pakai Web Audio API, jadi gak
   butuh file audio eksternal — semuanya self-contained.
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
   1. RENDER GRID SISWA
=================================================== */
function renderGridSiswa() {
  const grid = document.getElementById("grid-siswa");
  const fragment = document.createDocumentFragment();

  dataSiswa.forEach((siswa) => {
    const card = document.createElement("button");
    card.className = "siswa-card";
    card.type = "button";
    card.dataset.absen = siswa.absen;
    card.innerHTML = `
      <span class="siswa-absen">${String(siswa.absen).padStart(2, "0")}</span>
      <div class="siswa-nama">${siswa.namaPanggilan}</div>
    `;
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

/* ===================================================
   2. MODAL DETAIL SISWA
=================================================== */
function setupDetailModal() {
  const grid = document.getElementById("grid-siswa");
  const modal = document.getElementById("modal-detail");
  const modalBox = modal.querySelector(".modal-box");

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".siswa-card");
    if (!card) return;

    const siswa = dataSiswa.find((s) => s.absen === Number(card.dataset.absen));
    if (!siswa) return;

    document.getElementById("detail-absen").textContent = String(siswa.absen).padStart(2, "0");
    document.getElementById("detail-nama").textContent = siswa.namaLengkap;
    document.getElementById("detail-panggilan").textContent = siswa.namaPanggilan;
    document.getElementById("detail-cita").textContent = siswa.citaCita;
    document.getElementById("detail-lagu").textContent = siswa.laguFavorit;

    openModal(modal);
    playSproutAnimation(modalBox, card);
    SoundFX.cardOpen();
  });

  setupModalDismiss(modal);
}

/* Animasi "tumbuh" dari titik kartu yang diklik, kayak daun yang mekar */
function playSproutAnimation(modalBox, originEl) {
  // reset dulu biar animasi bisa diputar ulang tiap kali modal dibuka
  modalBox.classList.remove("sprout");

  const originRect = originEl.getBoundingClientRect();
  const clickX = originRect.left + originRect.width / 2;
  const clickY = originRect.top + originRect.height / 2;

  // paksa reflow supaya posisi box sudah final sebelum dihitung
  void modalBox.offsetWidth;
  const boxRect = modalBox.getBoundingClientRect();

  const ox = clickX - boxRect.left;
  const oy = clickY - boxRect.top;
  modalBox.style.setProperty("--ox", `${ox}px`);
  modalBox.style.setProperty("--oy", `${oy}px`);

  // paksa reflow lagi supaya class bisa ditambahkan ulang (restart animasi)
  void modalBox.offsetWidth;
  modalBox.classList.add("sprout");
}

/* ===================================================
   3. GENERIC MODAL HELPERS
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
   4. PICKER MODAL (Person & Teams)
=================================================== */
function setupPickerModal() {
  const modal = document.getElementById("modal-picker");
  const openBtn = document.getElementById("btn-open-picker");

  openBtn.addEventListener("click", () => {
    openModal(modal);
    SoundFX.buttonClick();
  });
  setupModalDismiss(modal);

  setupTabs();
  const personPicker = setupPersonPicker();
  const teamsPicker = setupTeamsPicker();

  document.getElementById("btn-reset").addEventListener("click", () => {
    personPicker.reset();
    teamsPicker.reset();
    SoundFX.resetSound();
  });
}

/* ---- Tabs ---- */
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

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
  const isSisa = () => dataSiswa.filter((s) => !sudahTerpilih.includes(s.absen));

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
    shuffleAndPick(dataSiswa, (terpilih) => {
      sudahTerpilih = [terpilih.absen];
      updateRemainingLabel();
      pickBtn.disabled = false;
      pickBtn.textContent = "Pick Randomly";
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
  const total = dataSiswa.length;

  // Isi dropdown ukuran tim: 2 sampai 8 orang per tim
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
    const acak = acakArray(dataSiswa);
    const jumlahTim = Math.ceil(total / ukuran);
    const tim = Array.from({ length: jumlahTim }, () => []);

    acak.forEach((siswa, idx) => {
      tim[idx % jumlahTim].push(siswa);
    });

    resultBox.innerHTML = tim
      .map((anggota, i) => `
        <div class="team-block">
          <h4>Tim ${i + 1}</h4>
          <ul>
            ${anggota.map((s) => `<li>${s.namaPanggilan} (absen ${String(s.absen).padStart(2, "0")})</li>`).join("")}
          </ul>
        </div>
      `)
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
