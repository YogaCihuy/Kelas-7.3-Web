/* ===================================================
   SUDOKU — 9x9, 4 level, 5 kesempatan
   - Easy / Medium / Hard / WNI (cuma 3-5 angka awalan)
   - salah 5 kali = gagal, selesai dapat poin sesuai level
   - poin tersimpan di perangkat + Firestore per akun
   - leaderboard kelas: top 5 poin
   Catatan: soal dibuat & dicek di browser. Rules cuma
   memvalidasi bentuk dokumen (tanpa Cloud Functions).
=================================================== */
(function () {
  "use strict";

  const UKURAN = 9;
  const TOTAL = 81;
  const MAX_SALAH = 5;
  const KUNCI = "kelas73-sudoku-v1-";

  const TINGKAT = {
    easy: { id: "easy", label: "Easy", givens: 40, poin: 10, ket: "40 angka awalan" },
    medium: { id: "medium", label: "Medium", givens: 32, poin: 25, ket: "32 angka awalan" },
    hard: { id: "hard", label: "Hard", givens: 26, poin: 50, ket: "26 angka awalan" },
    wni: { id: "wni", label: "WNI", givens: 4, poin: 100, ket: "3-5 angka awalan" },
  };
  const URUT_LEVEL = ["easy", "medium", "hard", "wni"];
  const DIGIT = [];
  for (let v = 1; v <= 9; v += 1) DIGIT[1 << (v - 1)] = v;
  const HITUNG_BIT = new Array(512).fill(0);
  for (let i = 1; i < 512; i += 1) HITUNG_BIT[i] = HITUNG_BIT[i >> 1] + (i & 1);

  const S = {
    user: null,
    viewOpen: false,
    started: false,
    tingkat: "easy",
    solusi: [],
    papan: [],
    awal: [],
    sel: -1,
    salah: 0,
    status: "pilih",
    poin: 0,
    wins: 0,
    games: 0,
    waktu: 0,
    interval: null,
    peringkat: null,
    peringkatErr: "",
    noticeTimer: null,
    genId: 0,
  };

  let elApp = null;
  let elBoard = null;
  let elPad = null;
  let elLevel = null;
  let elChance = null;
  let elPoin = null;
  let elTime = null;
  let elStart = null;
  let elStartNote = null;
  let elOver = null;
  let elOverIcon = null;
  let elOverTitle = null;
  let elOverSub = null;
  let elOverPoin = null;
  let elOverNote = null;
  let elRank = null;
  let elNotice = null;

  function getCurrentUser() {
    try {
      return typeof currentUser !== "undefined" ? currentUser : null;
    } catch (err) {
      return null;
    }
  }

  function firestore() {
    try {
      if (typeof db !== "undefined" && db) return db;
    } catch (err) { /* db belum siap */ }
    try {
      if (window.firebase && typeof firebase.firestore === "function") return firebase.firestore();
    } catch (err) { /* firebase belum termuat */ }
    return null;
  }

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function namaSiswa(absen, cadangan) {
    const key = String(absen);
    try {
      const kustom = typeof window.gameProfilNama === "function" ? window.gameProfilNama(absen) : "";
      if (kustom) return kustom;
    } catch (err) { /* profil game belum ada */ }
    try {
      if (typeof accountsData !== "undefined" && accountsData[key]) {
        const akun = accountsData[key];
        const nama = akun.namaPanggilan || akun.namaLengkap;
        if (nama) return nama;
      }
    } catch (err) { /* bukan global */ }
    try {
      const siswa = (typeof dataSiswa !== "undefined" ? dataSiswa : []).find((s) => String(s.absen) === key);
      if (siswa) return siswa.namaPanggilan || siswa.namaLengkap || "Siswa " + key;
    } catch (err) { /* data belum termuat */ }
    return cadangan || "Siswa " + key;
  }

  function sfx(nama) {
    try {
      if (typeof SoundFX !== "undefined" && SoundFX && typeof SoundFX[nama] === "function") SoundFX[nama]();
    } catch (err) { /* audio diblokir browser */ }
  }

  function getar(pola) {
    try {
      if (navigator.vibrate) navigator.vibrate(pola);
    } catch (err) { /* perangkat gak dukung getar */ }
  }

  function formatWaktu(detik) {
    const d = Math.max(0, Math.floor(Number(detik) || 0));
    const m = Math.floor(d / 60);
    const s = d % 60;
    if (m < 60) return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    const j = Math.floor(m / 60);
    return `${String(j).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /* ================= STATS ================= */

  function kunciStats() {
    return KUNCI + (S.user ? String(S.user.absen) : "guest");
  }

  function muatLokal() {
    S.poin = 0;
    S.wins = 0;
    S.games = 0;
    try {
      const raw = JSON.parse(localStorage.getItem(kunciStats()) || "null");
      if (!raw) return;
      S.poin = Math.max(0, Number(raw.points) || 0);
      S.wins = Math.max(0, Number(raw.wins) || 0);
      S.games = Math.max(0, Number(raw.games) || 0);
    } catch (err) { /* cache rusak */ }
  }

  function simpanLokal() {
    try {
      localStorage.setItem(kunciStats(), JSON.stringify({
        absen: S.user ? Number(S.user.absen) : 0,
        points: S.poin,
        wins: S.wins,
        games: S.games,
        updatedAt: Date.now(),
      }));
    } catch (err) { /* storage penuh */ }
  }

  function muatStats() {
    muatLokal();
    renderHud();
    if (!S.user) {
      muatPeringkat();
      return;
    }
    const fs = firestore();
    if (!fs) {
      muatPeringkat();
      return;
    }
    fs.collection("sudoku").doc(String(S.user.absen)).get()
      .then((snap) => {
        if (!snap || !snap.exists) return;
        const d = snap.data() || {};
        const poin = Math.max(0, Number(d.points) || 0);
        const wins = Math.max(0, Number(d.wins) || 0);
        const games = Math.max(0, Number(d.games) || 0);
        let berubah = false;
        if (poin > S.poin) { S.poin = poin; berubah = true; }
        if (wins > S.wins) { S.wins = wins; berubah = true; }
        if (games > S.games) { S.games = games; berubah = true; }
        if (berubah) simpanLokal();
        renderHud();
      })
      .catch(() => { /* offline: pakai data lokal */ })
      .then(() => muatPeringkat());
  }

  function simpanHasil(hadiah) {
    if (!S.user) return;
    const fs = firestore();
    if (!fs) return;
    const absen = Number(S.user.absen);
    const ref = fs.collection("sudoku").doc(String(absen));
    const now = Date.now();
    const nama = String(namaSiswa(absen, S.user.namaPanggilan || S.user.namaLengkap || "Siswa")).slice(0, 60);

    if (typeof fs.runTransaction !== "function") {
      ref.set({
        absen,
        name: nama,
        points: S.poin,
        wins: S.wins,
        games: S.games,
        createdAt: now,
        updatedAt: now,
      }, { merge: true })
        .then(() => muatPeringkat())
        .catch(() => tampilNotice("Poin tersimpan di perangkat. Sinkron ke akun gagal."));
      return;
    }

    fs.runTransaction((tx) => tx.get(ref).then((snap) => {
      const d = snap && snap.exists ? snap.data() || {} : {};
      const data = {
        absen,
        name: nama,
        points: Math.min(1000000000, (Number(d.points) || 0) + hadiah),
        wins: (Number(d.wins) || 0) + 1,
        games: (Number(d.games) || 0) + 1,
        createdAt: Number(d.createdAt) || now,
        updatedAt: now,
      };
      tx.set(ref, data, { merge: true });
      return data;
    }))
      .then((data) => {
        S.poin = Math.max(S.poin, Number(data.points) || 0);
        S.wins = Math.max(S.wins, Number(data.wins) || 0);
        S.games = Math.max(S.games, Number(data.games) || 0);
        simpanLokal();
        renderHud();
        muatPeringkat();
      })
      .catch(() => tampilNotice("Poin tersimpan di perangkat. Sinkron ke akun gagal."));
  }

  function muatPeringkat() {
    S.peringkat = null;
    S.peringkatErr = "";
    renderPeringkat();
    if (!S.user) return;
    const fs = firestore();
    if (!fs) {
      S.peringkatErr = "Peringkat butuh koneksi internet.";
      renderPeringkat();
      return;
    }
    fs.collection("sudoku").orderBy("points", "desc").limit(5).get()
      .then((snap) => {
        const list = [];
        snap.forEach((doc) => {
          list.push(doc.data() || {});
        });
        S.peringkat = list;
        renderPeringkat();
      })
      .catch(() => {
        S.peringkatErr = "Peringkat belum bisa dimuat.";
        renderPeringkat();
      });
  }

  function renderPeringkat() {
    if (!elRank) return;
    if (!S.user) {
      elRank.innerHTML = `
        <div class="sd-rank-card">
          <div class="sd-rank-head"><h3>Papan Peringkat</h3></div>
          <p class="sd-rank-hint">Login dulu buat lihat peringkat poin kelas.</p>
        </div>`;
      return;
    }
    let isi = "";
    if (S.peringkatErr) {
      isi = `<p class="sd-rank-hint">${esc(S.peringkatErr)}</p>`;
    } else if (!S.peringkat) {
      isi = `<p class="sd-rank-hint">Memuat peringkat...</p>`;
    } else if (!S.peringkat.length) {
      isi = `<p class="sd-rank-hint">Belum ada poin. Jadi yang pertama!</p>`;
    } else {
      const medali = ["🥇", "🥈", "🥉"];
      isi = `<ol class="sd-rank-list">${S.peringkat.map((d, i) => {
        const absen = String(d.absen);
        const aku = S.user && String(S.user.absen) === absen;
        return `<li class="${aku ? "is-me" : ""}">
          <span class="sd-rank-no">${medali[i] || i + 1}</span>
          <span class="sd-rank-name">${esc(namaSiswa(absen, d.name))}</span>
          <strong>${(Number(d.points) || 0).toLocaleString("id-ID")}</strong>
        </li>`;
      }).join("")}</ol>`;
    }
    elRank.innerHTML = `
      <div class="sd-rank-card">
        <div class="sd-rank-head"><h3>Papan Peringkat</h3><span>Top 5 poin</span></div>
        ${isi}
      </div>`;
  }

  /* ================= GENERATOR ================= */

  function acak(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function buatSolusi() {
    const polabaris = [];
    acak([0, 1, 2]).forEach((band) => {
      acak([0, 1, 2]).forEach((r) => polabaris.push(band * 3 + r));
    });
    const polaKolom = [];
    acak([0, 1, 2]).forEach((stack) => {
      acak([0, 1, 2]).forEach((c) => polaKolom.push(stack * 3 + c));
    });
    const angka = acak([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const grid = new Array(TOTAL);
    for (let r = 0; r < UKURAN; r += 1) {
      for (let c = 0; c < UKURAN; c += 1) {
        const rr = polabaris[r];
        const cc = polaKolom[c];
        grid[r * UKURAN + c] = angka[(rr * 3 + Math.floor(rr / 3) + cc) % 9];
      }
    }
    return grid;
  }

  // Hitung solusi (berhenti di "batas") buat cek keunikan soal.
  function hitungSolusi(papan, batas) {
    const rows = new Array(9).fill(0);
    const cols = new Array(9).fill(0);
    const box = new Array(9).fill(0);
    for (let i = 0; i < TOTAL; i += 1) {
      const v = papan[i];
      if (!v) continue;
      const bit = 1 << (v - 1);
      const r = Math.floor(i / UKURAN);
      const c = i % UKURAN;
      rows[r] |= bit;
      cols[c] |= bit;
      box[Math.floor(r / 3) * 3 + Math.floor(c / 3)] |= bit;
    }
    let jumlah = 0;

    function dfs() {
      if (jumlah >= batas) return;
      let pilih = -1;
      let pilihMask = 0;
      let pilihKecil = 10;
      for (let i = 0; i < TOTAL; i += 1) {
        if (papan[i]) continue;
        const r = Math.floor(i / UKURAN);
        const c = i % UKURAN;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        const mask = 0x1ff & ~(rows[r] | cols[c] | box[b]);
        const n = HITUNG_BIT[mask];
        if (n === 0) return;
        if (n < pilihKecil) {
          pilihKecil = n;
          pilih = i;
          pilihMask = mask;
          if (n === 1) break;
        }
      }
      if (pilih === -1) {
        jumlah += 1;
        return;
      }
      const r = Math.floor(pilih / UKURAN);
      const c = pilih % UKURAN;
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      let opsi = pilihMask;
      while (opsi) {
        const bit = opsi & -opsi;
        opsi ^= bit;
        papan[pilih] = DIGIT[bit];
        rows[r] |= bit;
        cols[c] |= bit;
        box[b] |= bit;
        dfs();
        papan[pilih] = 0;
        rows[r] ^= bit;
        cols[c] ^= bit;
        box[b] ^= bit;
        if (jumlah >= batas) return;
      }
    }

    dfs();
    return jumlah;
  }

  function buatPuzzle(tingkatId) {
    const solusi = buatSolusi();
    const papan = solusi.slice();
    const awal = new Array(TOTAL).fill(true);

    if (tingkatId === "wni") {
      const n = 3 + Math.floor(Math.random() * 3);
      const urut = acak(Array.from({ length: TOTAL }, (_, i) => i));
      awal.fill(false);
      for (let i = 0; i < n; i += 1) awal[urut[i]] = true;
      for (let i = 0; i < TOTAL; i += 1) if (!awal[i]) papan[i] = 0;
      return { solusi, papan, awal };
    }

    const target = TINGKAT[tingkatId].givens;
    const urut = acak(Array.from({ length: TOTAL }, (_, i) => i));
    let givens = TOTAL;
    const batasWaktu = Date.now() + 1500;
    for (let i = 0; i < urut.length && givens > target; i += 1) {
      if (Date.now() > batasWaktu) break;
      const idx = urut[i];
      const simpan = papan[idx];
      papan[idx] = 0;
      if (hitungSolusi(papan.slice(), 2) === 1) {
        awal[idx] = false;
        givens -= 1;
      } else {
        papan[idx] = simpan;
      }
    }
    return { solusi, papan, awal };
  }

  /* ================= RENDER ================= */

  function renderHud() {
    if (elLevel) elLevel.textContent = TINGKAT[S.tingkat].label;
    if (elChance) {
      const sisa = Math.max(0, MAX_SALAH - S.salah);
      elChance.textContent = "❤️".repeat(sisa) + "🖤".repeat(MAX_SALAH - sisa);
    }
    if (elPoin) elPoin.textContent = S.poin.toLocaleString("id-ID");
    if (elTime) elTime.textContent = formatWaktu(S.waktu);
  }

  function renderPapan() {
    if (!elBoard) return;
    if (S.status === "siap") {
      elBoard.innerHTML = `<p class="sd-loading">Menyiapkan soal...</p>`;
      return;
    }
    if (!S.papan.length) {
      elBoard.innerHTML = `<p class="sd-loading">Pilih level dulu ya.</p>`;
      return;
    }
    const sel = S.sel;
    const sr = sel >= 0 ? Math.floor(sel / UKURAN) : -1;
    const sc = sel >= 0 ? sel % UKURAN : -1;
    const nilaiSel = sel >= 0 ? S.papan[sel] : 0;
    let html = "";
    for (let i = 0; i < TOTAL; i += 1) {
      const r = Math.floor(i / UKURAN);
      const c = i % UKURAN;
      const v = S.papan[i];
      let cls = "sd-cell";
      if (S.awal[i]) cls += " is-given";
      else if (v) cls += " is-user";
      if (i === sel) cls += " is-sel";
      else if (sel >= 0 && (r === sr || c === sc
        || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)))) {
        cls += " is-peer";
      }
      if (nilaiSel && v === nilaiSel && i !== sel) cls += " is-same";
      if (!S.awal[i] && v && v !== S.solusi[i]) cls += " is-wrong";
      html += `<button type="button" class="${cls}" data-sd-cell="${i}"
        aria-label="Baris ${r + 1} kolom ${c + 1}${v ? ", angka " + v : ", kosong"}">${v || ""}</button>`;
    }
    elBoard.innerHTML = html;
  }

  function renderPad() {
    if (!elPad) return;
    const siap = S.status === "main" && S.sel >= 0 && !S.awal[S.sel];
    let html = "";
    for (let n = 1; n <= 9; n += 1) {
      html += `<button type="button" class="sd-num" data-sd-num="${n}"
        aria-label="Isi angka ${n}"${siap ? "" : " disabled"}>${n}</button>`;
    }
    html += `<button type="button" class="sd-num sd-erase" data-sd-num="0"
      aria-label="Hapus angka"${siap ? "" : " disabled"}>&#9003;</button>`;
    elPad.innerHTML = html;
  }

  function renderStart(tampil) {
    if (!elStart) return;
    elStart.hidden = !tampil;
    if (elStartNote) {
      elStartNote.textContent = S.user
        ? `Poin kamu sekarang: ${S.poin.toLocaleString("id-ID")}. Selesaikan soal buat nambah poin.`
        : "Main tanpa login tetap bisa. Login kalau mau poin masuk leaderboard kelas.";
    }
  }

  function renderOver(menang) {
    if (!elOver) return;
    elOver.hidden = false;
    const t = TINGKAT[S.tingkat];
    if (elOverIcon) elOverIcon.textContent = menang ? "🎉" : "💥";
    if (elOverTitle) elOverTitle.textContent = menang ? "Sudoku Selesai!" : "Kesempatan Habis";
    if (elOverSub) elOverSub.textContent = menang
      ? `Level ${t.label} · ${formatWaktu(S.waktu)}`
      : `Salah ${MAX_SALAH} kali di level ${t.label}`;
    if (elOverPoin) {
      elOverPoin.textContent = menang ? `+${t.poin} poin` : "Belum dapat poin";
    }
    if (elOverNote) {
      elOverNote.textContent = menang
        ? (S.user
          ? `Total poinmu sekarang ${S.poin.toLocaleString("id-ID")}.`
          : "Login buat menyimpan poin ke leaderboard kelas.")
        : "Pelan-pelan aja. Coba lagi pasti bisa.";
    }
  }

  function sembunyikanOver() {
    if (elOver) elOver.hidden = true;
  }

  function tampilNotice(teks) {
    if (!elNotice) return;
    elNotice.textContent = teks || "";
    elNotice.classList.toggle("is-on", !!teks);
    clearTimeout(S.noticeTimer);
    if (!teks) return;
    S.noticeTimer = setTimeout(() => {
      elNotice.classList.remove("is-on");
    }, 2800);
  }

  function renderAll() {
    renderHud();
    renderPapan();
    renderPad();
  }

  /* ================= ALUR MAIN ================= */

  function mulaiTimer() {
    hentikanTimer();
    if (S.status !== "main") return;
    S.interval = setInterval(() => {
      S.waktu += 1;
      if (elTime) elTime.textContent = formatWaktu(S.waktu);
    }, 1000);
  }

  function hentikanTimer() {
    if (S.interval) {
      clearInterval(S.interval);
      S.interval = null;
    }
  }

  function mulai(tingkatId) {
    const t = TINGKAT[tingkatId] ? tingkatId : "easy";
    S.tingkat = t;
    S.sel = -1;
    S.salah = 0;
    S.waktu = 0;
    S.status = "siap";
    S.started = true;
    const gen = S.genId + 1;
    S.genId = gen;
    hentikanTimer();
    sembunyikanOver();
    renderStart(false);
    renderHud();
    renderPad();
    renderPapan();
    tampilNotice("Menyiapkan soal...");

    setTimeout(() => {
      if (gen !== S.genId) return;
      try {
        const hasil = buatPuzzle(S.tingkat);
        if (gen !== S.genId) return;
        S.solusi = hasil.solusi;
        S.papan = hasil.papan;
        S.awal = hasil.awal;
        S.status = "main";
        renderAll();
        if (S.viewOpen) mulaiTimer();
        const jumlahAwal = S.awal.filter(Boolean).length;
        tampilNotice(`${TINGKAT[S.tingkat].label}: ${jumlahAwal} angka awalan. Salah ${MAX_SALAH} kali = gagal.`);
      } catch (err) {
        if (gen !== S.genId) return;
        S.status = "pilih";
        renderStart(true);
        tampilNotice("Gagal menyiapkan soal. Coba lagi.");
      }
    }, 40);
  }

  function pilihSel(i) {
    if (S.status !== "main") return;
    S.sel = i;
    renderPapan();
    renderPad();
    sfx("shuffleTick");
  }

  function isiAngka(v) {
    if (S.status !== "main" || S.sel < 0) return;
    if (S.awal[S.sel]) {
      tampilNotice("Angka awalan gak bisa diubah.");
      return;
    }
    if (S.papan[S.sel] === v) return;

    S.papan[S.sel] = v;
    if (v && v !== S.solusi[S.sel]) {
      S.salah += 1;
      sfx("errorSound");
      getar([0, 35, 35, 35]);
      renderAll();
      if (S.salah >= MAX_SALAH) {
        tampilNotice("Kesempatan habis. Coba level lagi ya.");
        selesai(false);
        return;
      }
      tampilNotice(`Salah! Kesempatan tinggal ${MAX_SALAH - S.salah}.`);
      return;
    }

    if (v) sfx("shuffleTick");
    else sfx("buttonClick");
    renderAll();
    if (v) cekMenang();
  }

  function cekMenang() {
    for (let i = 0; i < TOTAL; i += 1) {
      if (S.papan[i] !== S.solusi[i]) return;
    }
    selesai(true);
  }

  function selesai(menang) {
    if (S.status !== "main") return;
    S.status = menang ? "menang" : "gagal";
    hentikanTimer();
    S.sel = -1;

    if (menang) {
      const hadiah = TINGKAT[S.tingkat].poin;
      S.poin += hadiah;
      S.wins += 1;
      S.games += 1;
      simpanLokal();
      renderHud();
      simpanHasil(hadiah);
      sfx("win");
      getar([0, 30, 45, 30, 45, 60]);
    } else {
      sfx("lose");
      getar([0, 60, 40, 60]);
    }

    renderAll();
    renderOver(menang);
  }

  function pindahSel(dr, dc) {
    if (S.status !== "main") return;
    let r = S.sel >= 0 ? Math.floor(S.sel / UKURAN) : 0;
    let c = S.sel >= 0 ? S.sel % UKURAN : 0;
    r = Math.max(0, Math.min(UKURAN - 1, r + dr));
    c = Math.max(0, Math.min(UKURAN - 1, c + dc));
    pilihSel(r * UKURAN + c);
  }

  /* ================= LIFECYCLE ================= */

  function buka() {
    S.viewOpen = true;
    const view = document.getElementById("game-sudoku-view");
    if (view) view.hidden = false;
    const listView = document.getElementById("games-list-view");
    if (listView) listView.hidden = true;

    const user = getCurrentUser();
    const lama = S.user ? String(S.user.absen) : "";
    const baru = user ? String(user.absen) : "";
    if (lama !== baru) {
      S.user = user || null;
      S.started = false;
      S.status = "pilih";
      S.solusi = [];
      S.papan = [];
      S.awal = [];
      hentikanTimer();
    }

    if (!S.started) {
      S.status = "pilih";
      renderStart(true);
      sembunyikanOver();
      renderPapan();
      renderPad();
      renderHud();
      muatStats();
    } else {
      renderAll();
      if (S.status === "main") mulaiTimer();
      if (S.status === "menang" || S.status === "gagal") renderOver(S.status === "menang");
    }
  }

  function tutup() {
    S.viewOpen = false;
    hentikanTimer();
    return true;
  }

  function akunBerubah(user) {
    const u = user || null;
    const lama = S.user ? String(S.user.absen) : "";
    const baru = u ? String(u.absen) : "";
    S.user = u;
    if (lama === baru) {
      renderHud();
      renderPeringkat();
      return;
    }
    hentikanTimer();
    S.started = false;
    S.status = "pilih";
    S.solusi = [];
    S.papan = [];
    S.awal = [];
    S.sel = -1;
    sembunyikanOver();
    muatLokal();
    if (S.viewOpen) {
      renderStart(true);
      renderAll();
      muatStats();
    } else {
      renderHud();
      renderPeringkat();
    }
  }

  function ringkas(login) {
    try {
      const user = getCurrentUser();
      const key = KUNCI + (user ? String(user.absen) : "guest");
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      const poin = raw ? Number(raw.points) || 0 : 0;
      const wins = raw ? Number(raw.wins) || 0 : 0;
      if (poin > 0) return `🏆 ${poin.toLocaleString("id-ID")} poin · ${wins} menang`;
      if (login) return "Belum pernah main · 4 level Sudoku";
      return "Tanpa login · Main langsung, poin di perangkat";
    } catch (err) {
      return "Sudoku 9x9 · 4 level";
    }
  }

  function init() {
    elApp = document.getElementById("sd-app");
    if (!elApp) return;
    elBoard = document.getElementById("sd-board");
    elPad = document.getElementById("sd-pad");
    elLevel = document.getElementById("sd-level");
    elChance = document.getElementById("sd-chance");
    elPoin = document.getElementById("sd-points");
    elTime = document.getElementById("sd-time");
    elStart = document.getElementById("sd-start");
    elStartNote = document.getElementById("sd-start-note");
    elOver = document.getElementById("sd-over");
    elOverIcon = document.getElementById("sd-over-icon");
    elOverTitle = document.getElementById("sd-over-title");
    elOverSub = document.getElementById("sd-over-sub");
    elOverPoin = document.getElementById("sd-over-points");
    elOverNote = document.getElementById("sd-over-note");
    elRank = document.getElementById("sd-rank");
    elNotice = document.getElementById("sd-notice");

    const levels = document.getElementById("sd-levels");
    if (levels) {
      levels.innerHTML = URUT_LEVEL.map((id) => {
        const t = TINGKAT[id];
        return `<button type="button" class="sd-level-btn" data-sd-level="${id}">
          <strong>${t.label}</strong>
          <small>${t.ket}</small>
          <span>+${t.poin} poin</span>
        </button>`;
      }).join("");
    }

    elApp.addEventListener("click", (e) => {
      const lv = e.target.closest("[data-sd-level]");
      if (lv) {
        sfx("buttonClick");
        mulai(lv.dataset.sdLevel);
        return;
      }
      const aksi = e.target.closest("[data-sd-action]");
      if (aksi) {
        const act = aksi.dataset.sdAction;
        sfx("buttonClick");
        if (act === "ulang") {
          mulai(S.tingkat);
        } else if (act === "level") {
          hentikanTimer();
          S.status = "pilih";
          S.sel = -1;
          sembunyikanOver();
          renderStart(true);
          renderPad();
          renderPapan();
        }
        return;
      }
      const num = e.target.closest("[data-sd-num]");
      if (num) {
        if (num.disabled) return;
        isiAngka(Number(num.dataset.sdNum));
        return;
      }
      const cell = e.target.closest("[data-sd-cell]");
      if (cell) pilihSel(Number(cell.dataset.sdCell));
    });

    document.addEventListener("keydown", (e) => {
      if (!S.viewOpen || S.status !== "main") return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (/^[1-9]$/.test(e.key)) {
        isiAngka(Number(e.key));
        e.preventDefault();
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        isiAngka(0);
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        pindahSel(-1, 0);
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        pindahSel(1, 0);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        pindahSel(0, -1);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        pindahSel(0, 1);
        e.preventDefault();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hentikanTimer();
      else if (S.viewOpen && S.status === "main") mulaiTimer();
    });

    renderStart(true);
    renderPapan();
    renderPad();
    renderHud();
    renderPeringkat();
  }

  // Hook dipasang langsung sebelum init, biar katalog Games
  // bisa baca ringkasan walau init jalan setelah script.js.
  window.sudokuBuka = buka;
  window.sudokuTutup = tutup;
  window.sudokuAkunBerubah = akunBerubah;
  window.sudokuRingkas = ringkas;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
