/* ===================================================
   BLOCK BLAST — puzzle blok 8x8, tanpa server
   - 3 blok di tray, tanpa rotasi, drag atau tap buat pasang
   - baris/kolom penuh hilang, combo bikin skor makin besar
   - skor terbaik disimpan di perangkat + Firestore per akun
   - bentuk dokumen Firestore dijaga rules blockblast
   Catatan: mesin main jalan di browser. Rules cuma memvalidasi
   bentuk dokumen (tanpa Cloud Functions / Blaze).
=================================================== */
(function () {
  "use strict";

  const UKURAN = 8;
  const TOTAL = UKURAN * UKURAN;
  const SKOR_KEY = "kelas73-blockblast-v1-";
  const WARNA = ["#2f9e63", "#3fb27c", "#78c98f", "#e2b03a", "#e3853f", "#4a90d9", "#a06ad4", "#e0678c"];

  // Semua bentuk tanpa rotasi, sama seperti Block Blast asli.
  const BENTUK = [
    { id: "dot", sel: [[0, 0]], bobot: 6, label: "1 kotak" },
    { id: "i2h", sel: [[0, 0], [0, 1]], bobot: 9, label: "2 kotak" },
    { id: "i2v", sel: [[0, 0], [1, 0]], bobot: 9, label: "2 kotak" },
    { id: "i3h", sel: [[0, 0], [0, 1], [0, 2]], bobot: 7, label: "3 kotak" },
    { id: "i3v", sel: [[0, 0], [1, 0], [2, 0]], bobot: 7, label: "3 kotak" },
    { id: "i4h", sel: [[0, 0], [0, 1], [0, 2], [0, 3]], bobot: 5, label: "4 kotak" },
    { id: "i4v", sel: [[0, 0], [1, 0], [2, 0], [3, 0]], bobot: 5, label: "4 kotak" },
    { id: "i5h", sel: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], bobot: 2, label: "5 kotak" },
    { id: "i5v", sel: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], bobot: 2, label: "5 kotak" },
    { id: "o2", sel: [[0, 0], [0, 1], [1, 0], [1, 1]], bobot: 8, label: "kotak 2x2" },
    { id: "o3", sel: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], bobot: 2, label: "kotak 3x3" },
    { id: "l3a", sel: [[0, 0], [1, 0], [1, 1]], bobot: 6, label: "L kecil" },
    { id: "l3b", sel: [[0, 1], [1, 0], [1, 1]], bobot: 6, label: "L kecil" },
    { id: "l3c", sel: [[0, 0], [0, 1], [1, 0]], bobot: 6, label: "L kecil" },
    { id: "l3d", sel: [[0, 0], [0, 1], [1, 1]], bobot: 6, label: "L kecil" },
    { id: "l4a", sel: [[0, 0], [1, 0], [2, 0], [2, 1]], bobot: 4, label: "L panjang" },
    { id: "l4b", sel: [[0, 1], [1, 1], [2, 1], [2, 0]], bobot: 4, label: "L panjang" },
    { id: "l4c", sel: [[0, 0], [0, 1], [0, 2], [1, 0]], bobot: 4, label: "L panjang" },
    { id: "l4d", sel: [[0, 0], [0, 1], [0, 2], [1, 2]], bobot: 4, label: "L panjang" },
    { id: "t4a", sel: [[0, 0], [0, 1], [0, 2], [1, 1]], bobot: 4, label: "T" },
    { id: "t4b", sel: [[0, 1], [1, 0], [1, 1], [1, 2]], bobot: 4, label: "T" },
    { id: "t4c", sel: [[0, 0], [1, 0], [2, 0], [1, 1]], bobot: 4, label: "T" },
    { id: "t4d", sel: [[0, 1], [1, 0], [1, 1], [2, 1]], bobot: 4, label: "T" },
    { id: "s4h", sel: [[0, 1], [0, 2], [1, 0], [1, 1]], bobot: 4, label: "S" },
    { id: "z4h", sel: [[0, 0], [0, 1], [1, 1], [1, 2]], bobot: 4, label: "Z" },
    { id: "s4v", sel: [[0, 0], [1, 0], [1, 1], [2, 1]], bobot: 4, label: "S" },
    { id: "z4v", sel: [[0, 1], [1, 0], [1, 1], [2, 0]], bobot: 4, label: "Z" },
  ];

  const S = {
    user: null,
    viewOpen: false,
    started: false,
    board: new Array(TOTAL).fill(null),
    tray: [],
    score: 0,
    combo: 0,
    runLines: 0,
    runBestCombo: 0,
    over: false,
    selected: -1,
    drag: null,
    busy: false,
    best: 0,
    bestCombo: 0,
    lines: 0,
    games: 0,
    docCreatedAt: 0,
    peringkat: null,
    peringkatErr: "",
    noticeTimer: null,
  };

  let elBoard = null;
  let elTray = null;
  let elScore = null;
  let elBest = null;
  let elLines = null;
  let elCombo = null;
  let elOver = null;
  let elFinal = null;
  let elFinalBest = null;
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

  function sfx(nama, ...args) {
    try {
      if (typeof SoundFX !== "undefined" && SoundFX && typeof SoundFX[nama] === "function") {
        SoundFX[nama](...args);
      }
    } catch (err) { /* audio diblokir browser */ }
  }

  function getar(pola) {
    try {
      if (navigator.vibrate) navigator.vibrate(pola);
    } catch (err) { /* perangkat gak dukung getar */ }
  }

  function kunciStats() {
    return SKOR_KEY + (S.user ? String(S.user.absen) : "guest");
  }

  function muatStatsLokal() {
    S.best = 0;
    S.bestCombo = 0;
    S.lines = 0;
    S.games = 0;
    S.docCreatedAt = 0;
    try {
      const raw = JSON.parse(localStorage.getItem(kunciStats()) || "null");
      if (!raw) return;
      S.best = Math.max(0, Number(raw.best) || 0);
      S.bestCombo = Math.max(0, Number(raw.bestCombo) || 0);
      S.lines = Math.max(0, Number(raw.lines) || 0);
      S.games = Math.max(0, Number(raw.games) || 0);
    } catch (err) { /* cache rusak */ }
  }

  function simpanStatsLokal() {
    try {
      localStorage.setItem(kunciStats(), JSON.stringify({
        absen: S.user ? Number(S.user.absen) : 0,
        best: S.best,
        bestCombo: S.bestCombo,
        lines: S.lines,
        games: S.games,
        updatedAt: Date.now(),
      }));
    } catch (err) { /* storage penuh / private mode */ }
  }

  function muatStats() {
    muatStatsLokal();
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
    fs.collection("blockblast").doc(String(S.user.absen)).get()
      .then((snap) => {
        if (!snap || !snap.exists) return;
        const d = snap.data() || {};
        S.docCreatedAt = Number(d.createdAt) || 0;
        let berubah = false;
        const serap = (kunci, nilai) => {
          const v = Math.max(0, Number(nilai) || 0);
          if (v > S[kunci]) { S[kunci] = v; berubah = true; }
        };
        serap("best", d.bestScore);
        serap("bestCombo", d.bestCombo);
        serap("lines", d.lines);
        serap("games", d.games);
        if (berubah) simpanStatsLokal();
        renderHud();
      })
      .catch(() => { /* offline: pakai data lokal */ })
      .then(() => muatPeringkat());
  }

  function simpanKeServer() {
    if (!S.user) return;
    const fs = firestore();
    if (!fs) return;
    const absen = Number(S.user.absen);
    const now = Date.now();
    const data = {
      absen,
      name: String(S.user.namaPanggilan || S.user.namaLengkap || "Siswa").slice(0, 60),
      bestScore: S.best,
      bestCombo: S.bestCombo,
      lines: S.lines,
      games: S.games,
      createdAt: S.docCreatedAt || now,
      updatedAt: now,
    };
    fs.collection("blockblast").doc(String(absen)).set(data, { merge: true })
      .then(() => {
        S.docCreatedAt = data.createdAt;
        muatPeringkat();
      })
      .catch(() => {
        tampilNotice("Skor tersimpan di perangkat. Sinkron ke akun gagal.");
      });
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
    fs.collection("blockblast").orderBy("bestScore", "desc").limit(5).get()
      .then((snap) => {
        const list = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          list.push(d);
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
        <div class="bb-rank-card">
          <div class="bb-rank-head"><h3>Papan Peringkat</h3></div>
          <p class="bb-rank-hint">Login dulu buat lihat skor terbaik kelas.</p>
        </div>`;
      return;
    }
    let isi = "";
    if (S.peringkatErr) {
      isi = `<p class="bb-rank-hint">${esc(S.peringkatErr)}</p>`;
    } else if (!S.peringkat) {
      isi = `<p class="bb-rank-hint">Memuat peringkat...</p>`;
    } else if (!S.peringkat.length) {
      isi = `<p class="bb-rank-hint">Belum ada skor. Jadi yang pertama!</p>`;
    } else {
      const medali = ["🥇", "🥈", "🥉"];
      isi = `<ol class="bb-rank-list">${S.peringkat.map((d, i) => {
        const absen = String(d.absen);
        const aku = S.user && String(S.user.absen) === absen;
        return `<li class="${aku ? "is-me" : ""}">
          <span class="bb-rank-no">${medali[i] || i + 1}</span>
          <span class="bb-rank-name">${esc(namaSiswa(absen, d.name))}</span>
          <strong>${(Number(d.bestScore) || 0).toLocaleString("id-ID")}</strong>
        </li>`;
      }).join("")}</ol>`;
    }
    elRank.innerHTML = `
      <div class="bb-rank-card">
        <div class="bb-rank-head"><h3>Papan Peringkat</h3><span>Top 5 kelas</span></div>
        ${isi}
      </div>`;
  }

  function bentukAcak() {
    const total = BENTUK.reduce((n, b) => n + b.bobot, 0);
    let sisa = Math.random() * total;
    for (let i = 0; i < BENTUK.length; i += 1) {
      sisa -= BENTUK[i].bobot;
      if (sisa <= 0) return BENTUK[i];
    }
    return BENTUK[0];
  }

  function buatBlok() {
    const bentuk = bentukAcak();
    let minR = Infinity;
    let minC = Infinity;
    let maxR = 0;
    let maxC = 0;
    bentuk.sel.forEach(([r, c]) => {
      if (r < minR) minR = r;
      if (c < minC) minC = c;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    });
    const sel = bentuk.sel.map(([r, c]) => [r - minR, c - minC]);
    return {
      bentuk: bentuk.id,
      label: bentuk.label,
      sel,
      h: maxR - minR + 1,
      w: maxC - minC + 1,
      color: WARNA[Math.floor(Math.random() * WARNA.length)],
    };
  }

  function cocok(blok, tlR, tlC) {
    if (tlR < 0 || tlC < 0 || tlR + blok.h > UKURAN || tlC + blok.w > UKURAN) return false;
    for (let i = 0; i < blok.sel.length; i += 1) {
      const r = tlR + blok.sel[i][0];
      const c = tlC + blok.sel[i][1];
      if (S.board[r * UKURAN + c] != null) return false;
    }
    return true;
  }

  function adaTempat(blok) {
    for (let r = 0; r <= UKURAN - blok.h; r += 1) {
      for (let c = 0; c <= UKURAN - blok.w; c += 1) {
        if (cocok(blok, r, c)) return true;
      }
    }
    return false;
  }

  function isiTray() {
    const baru = [buatBlok(), buatBlok(), buatBlok()];
    // Usahakan selalu ada satu blok yang muat, biar game gak berhenti
    // gara-gara kombinasi yang mustahil.
    for (let coba = 0; coba < 40 && !baru.some(adaTempat); coba += 1) {
      baru[Math.floor(Math.random() * baru.length)] = buatBlok();
    }
    if (!baru.some(adaTempat)) {
      baru[0] = { bentuk: "dot", label: "1 kotak", sel: [[0, 0]], h: 1, w: 1, color: WARNA[Math.floor(Math.random() * WARNA.length)] };
    }
    S.tray = baru;
  }

  function paintBoard(preview) {
    if (!elBoard) return;
    const peta = preview && preview.map;
    for (let i = 0; i < TOTAL; i += 1) {
      const cell = elBoard.children[i];
      if (!cell) continue;
      const nilai = S.board[i];
      let kelas = "bb-cell";
      if (nilai) kelas += " is-filled";
      if (peta && peta.has(i)) kelas += peta.get(i) === "ok" ? " is-preview-ok" : " is-preview-bad";
      if (cell.className !== kelas) cell.className = kelas;
      if (nilai) cell.style.setProperty("--bc", nilai);
    }
  }

  function petaPreview(blok, tlR, tlC) {
    const map = new Map();
    let ok = true;
    for (let i = 0; i < blok.sel.length; i += 1) {
      const r = tlR + blok.sel[i][0];
      const c = tlC + blok.sel[i][1];
      if (r < 0 || r >= UKURAN || c < 0 || c >= UKURAN) {
        ok = false;
        continue;
      }
      const idx = r * UKURAN + c;
      const terisi = S.board[idx] != null;
      if (terisi) ok = false;
      map.set(idx, terisi ? "bad" : "ok");
    }
    return { map, ok };
  }

  function renderTray() {
    if (!elTray) return;
    if (!S.tray.length) {
      elTray.innerHTML = `<span class="bb-tray-ghost">Menyiapkan blok...</span>`;
      return;
    }
    elTray.innerHTML = S.tray.map((blok, i) => {
      const isi = new Set(blok.sel.map(([r, c]) => r + "," + c));
      let sel = "";
      for (let r = 0; r < blok.h; r += 1) {
        for (let c = 0; c < blok.w; c += 1) {
          sel += `<i class="${isi.has(r + "," + c) ? "is-on" : ""}"></i>`;
        }
      }
      return `<button type="button" class="bb-piece ${S.selected === i ? "is-selected" : ""}"
        data-bb-piece="${i}" aria-label="Blok ${esc(blok.label)}"
        style="--bc:${blok.color};--cols:${blok.w};--rows:${blok.h}">
        <span class="bb-piece-grid">${sel}</span>
      </button>`;
    }).join("");
  }

  function renderHud() {
    if (elScore) elScore.textContent = S.score.toLocaleString("id-ID");
    if (elBest) elBest.textContent = Math.max(S.best, S.score).toLocaleString("id-ID");
    if (elLines) elLines.textContent = (S.lines + S.runLines).toLocaleString("id-ID");
    if (elCombo) {
      if (S.combo >= 2) {
        elCombo.hidden = false;
        elCombo.textContent = `Combo x${S.combo}`;
      } else {
        elCombo.hidden = true;
      }
    }
  }

  function renderOver(tampil) {
    if (!elOver) return;
    elOver.hidden = !tampil;
    if (!tampil) return;
    if (elFinal) elFinal.textContent = S.score.toLocaleString("id-ID");
    if (elFinalBest) elFinalBest.textContent = S.best.toLocaleString("id-ID");
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

  function posisiKotak(idx) {
    if (!elBoard || !elBoard.parentElement) return null;
    const cell = elBoard.children[idx];
    if (!cell) return null;
    const a = cell.getBoundingClientRect();
    const b = elBoard.parentElement.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  }

  function tampilPoin(teks, idx, varian) {
    const wrap = elBoard && elBoard.parentElement;
    const pos = posisiKotak(idx);
    if (!wrap || !pos) return;
    const el = document.createElement("span");
    el.className = "bb-pop" + (varian ? ` is-${varian}` : "");
    el.textContent = teks;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function tandaiBlokBaru(blok, tlR, tlC) {
    if (!elBoard) return;
    blok.sel.forEach(([dr, dc]) => {
      const cell = elBoard.children[(tlR + dr) * UKURAN + (tlC + dc)];
      if (!cell) return;
      cell.classList.add("is-drop");
      setTimeout(() => cell.classList.remove("is-drop"), 280);
    });
  }

  function hujanKilau() {
    const wrap = elBoard && elBoard.parentElement;
    if (!wrap) return;
    for (let i = 0; i < 16; i += 1) {
      const s = document.createElement("span");
      s.className = "bb-spark";
      s.style.left = `${8 + Math.random() * 84}%`;
      s.style.top = `${8 + Math.random() * 84}%`;
      s.style.setProperty("--d", `${(Math.random() * 0.22).toFixed(2)}s`);
      s.style.setProperty("--x", `${Math.round(Math.random() * 90 - 45)}px`);
      s.style.setProperty("--y", `${Math.round(-45 - Math.random() * 80)}px`);
      wrap.appendChild(s);
      setTimeout(() => s.remove(), 1200);
    }
  }

  function mulaiBaru() {
    S.board = new Array(TOTAL).fill(null);
    S.tray = [];
    S.score = 0;
    S.combo = 0;
    S.runLines = 0;
    S.runBestCombo = 0;
    S.over = false;
    S.selected = -1;
    S.busy = false;
    S.started = true;
    batalDrag();
    isiTray();
    paintBoard();
    renderTray();
    renderHud();
    renderOver(false);
    tampilNotice("Susun blok buat hapus baris atau kolom penuh.");
  }

  function pasangBlok(idx, tlR, tlC) {
    if (S.busy || S.over) return false;
    const blok = S.tray[idx];
    if (!blok) return false;
    if (!cocok(blok, tlR, tlC)) return false;

    S.busy = true;
    S.selected = -1;
    blok.sel.forEach(([dr, dc]) => {
      S.board[(tlR + dr) * UKURAN + (tlC + dc)] = blok.color;
    });
    S.score += blok.sel.length;
    S.tray.splice(idx, 1);
    sfx("blockPlace");
    getar(18);
    paintBoard();
    renderTray();
    renderHud();
    const pusatR = Math.round(tlR + blok.sel.reduce((n, p) => n + p[0], 0) / blok.sel.length);
    const pusatC = Math.round(tlC + blok.sel.reduce((n, p) => n + p[1], 0) / blok.sel.length);
    const pusatIdx = Math.max(0, Math.min(TOTAL - 1, pusatR * UKURAN + pusatC));
    tampilPoin(`+${blok.sel.length}`, pusatIdx, "kecil");

    const baris = [];
    const kolom = [];
    for (let r = 0; r < UKURAN; r += 1) {
      let penuh = true;
      for (let c = 0; c < UKURAN; c += 1) {
        if (S.board[r * UKURAN + c] == null) { penuh = false; break; }
      }
      if (penuh) baris.push(r);
    }
    for (let c = 0; c < UKURAN; c += 1) {
      let penuh = true;
      for (let r = 0; r < UKURAN; r += 1) {
        if (S.board[r * UKURAN + c] == null) { penuh = false; break; }
      }
      if (penuh) kolom.push(c);
    }

    const jumlahGaris = baris.length + kolom.length;
    if (!jumlahGaris) {
      S.combo = 0;
      renderHud();
      selesaikanGiliran();
      tandaiBlokBaru(blok, tlR, tlC);
      return true;
    }

    const hapus = new Set();
    baris.forEach((r) => {
      for (let c = 0; c < UKURAN; c += 1) hapus.add(r * UKURAN + c);
    });
    kolom.forEach((c) => {
      for (let r = 0; r < UKURAN; r += 1) hapus.add(r * UKURAN + c);
    });

    S.combo += 1;
    if (S.combo > S.runBestCombo) S.runBestCombo = S.combo;
    S.runLines += jumlahGaris;
    const dasar = jumlahGaris * 100 + Math.max(0, jumlahGaris - 1) * 50;
    const bonus = Math.round(dasar * (1 + 0.25 * (S.combo - 1)));

    // Papan kosong total dapat bonus besar, bukan cuma poin per garis.
    const sisa = S.board.reduce((n, v, i) => n + (v && !hapus.has(i) ? 1 : 0), 0);
    const sempurna = sisa === 0;
    const bonusBersih = sempurna ? 1000 : 0;
    S.score += bonus + bonusBersih;

    sfx("blockLine", jumlahGaris);
    if (S.combo >= 2) sfx("blockCombo", S.combo);
    getar([0, 18, 28, 22]);
    hapus.forEach((i) => {
      const cell = elBoard.children[i];
      if (cell) cell.classList.add("is-clearing");
    });
    renderHud();
    tampilPoin(
      `+${(bonus + bonusBersih).toLocaleString("id-ID")}`,
      pusatIdx,
      sempurna ? "emas" : "besar"
    );
    tampilNotice(sempurna
      ? "PAPAN BERSIH! Bonus +1.000"
      : `+${bonus.toLocaleString("id-ID")} · ${jumlahGaris} garis${S.combo >= 2 ? ` · Combo x${S.combo}` : ""}`);

    setTimeout(() => {
      hapus.forEach((i) => { S.board[i] = null; });
      paintBoard();
      if (sempurna) {
        sfx("blockPerfect");
        getar([0, 30, 30, 30, 30, 70]);
        elBoard.classList.add("is-perfect");
        hujanKilau();
        setTimeout(() => elBoard.classList.remove("is-perfect"), 950);
      }
      selesaikanGiliran();
    }, 240);
    return true;
  }

  function selesaikanGiliran() {
    if (S.tray.length === 0) isiTray();
    renderTray();
    if (!S.tray.some(adaTempat)) {
      S.busy = false;
      gameOver();
      return;
    }
    S.busy = false;
    renderHud();
    paintBoard();
  }

  function gameOver() {
    if (S.over) return;
    S.over = true;
    S.busy = false;
    S.selected = -1;
    const rekor = S.score > S.best;
    if (rekor) S.best = S.score;
    if (S.runBestCombo > S.bestCombo) S.bestCombo = S.runBestCombo;
    S.lines += S.runLines;
    S.games += 1;
    simpanStatsLokal();
    simpanKeServer();
    renderHud();
    renderTray();
    renderOver(true);
    sfx(rekor ? "win" : "lose");
    if (rekor) tampilNotice("Rekor baru! Skor terbaikmu tersimpan.");
  }

  /* ================= DRAG & TAP ================= */

  function geometriBoard() {
    if (!elBoard || elBoard.children.length < 9) return null;
    const r0 = elBoard.children[0].getBoundingClientRect();
    const r1 = elBoard.children[1].getBoundingClientRect();
    const r8 = elBoard.children[8].getBoundingClientRect();
    const pitchX = r1.left - r0.left;
    const pitchY = r8.top - r0.top;
    if (!pitchX || !pitchY || !r0.width) return null;
    return {
      firstLeft: r0.left,
      firstTop: r0.top,
      pitchX,
      pitchY,
      cellW: r0.width,
      cellH: r0.height,
      gap: Math.max(2, r1.left - r0.right),
    };
  }

  function tlDariTitik(blok, x, y, lift) {
    const g = geometriBoard();
    if (!g) return null;
    const anchorC = Math.round((x - g.firstLeft) / g.pitchX);
    const anchorR = Math.round((y - lift - g.firstTop) / g.pitchY);
    if (anchorR < -1 || anchorR > UKURAN || anchorC < -1 || anchorC > UKURAN) return null;
    return {
      r: anchorR - Math.floor((blok.h - 1) / 2),
      c: anchorC - Math.floor((blok.w - 1) / 2),
    };
  }

  function buatGhost(d) {
    const g = geometriBoard();
    if (!g) return;
    const el = document.createElement("div");
    el.className = "bb-ghost";
    el.style.setProperty("--bc", d.blok.color);
    el.style.gridTemplateColumns = `repeat(${d.blok.w}, ${g.cellW}px)`;
    el.style.gridTemplateRows = `repeat(${d.blok.h}, ${g.cellH}px)`;
    el.style.gap = `${g.gap}px`;
    const isi = new Set(d.blok.sel.map(([r, c]) => r + "," + c));
    let sel = "";
    for (let r = 0; r < d.blok.h; r += 1) {
      for (let c = 0; c < d.blok.w; c += 1) {
        sel += `<i class="${isi.has(r + "," + c) ? "is-on" : ""}"></i>`;
      }
    }
    el.innerHTML = sel;
    document.body.appendChild(el);
    d.ghost = el;
    d.ghostW = d.blok.w * g.cellW + (d.blok.w - 1) * g.gap;
    d.ghostH = d.blok.h * g.cellH + (d.blok.h - 1) * g.gap;
  }

  function posisiGhost(d, x, y) {
    if (!d.ghost) return;
    d.ghost.style.left = `${x - d.ghostW / 2}px`;
    d.ghost.style.top = `${y - d.ghostH / 2 - d.lift}px`;
  }

  // Ghost ditempel ke kotak tujuan. Jadi yang kelihatan diangkat jari
  // dan kotak yang bakal diisi selalu sejajar, gak selisih setengah kotak.
  function tempelGhost(d, tl) {
    const g = geometriBoard();
    if (!g || !d.ghost) return;
    d.ghost.style.left = `${g.firstLeft + tl.c * g.pitchX}px`;
    d.ghost.style.top = `${g.firstTop + tl.r * g.pitchY - d.lift}px`;
  }

  function onDragMove(e) {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.sqrt(dx * dx + dy * dy) < 7) return;
    if (!d.moved) {
      d.moved = true;
      if (d.pieceEl) d.pieceEl.classList.add("is-dragging");
      buatGhost(d);
    }
    if (e.cancelable) e.preventDefault();
    const tl = tlDariTitik(d.blok, e.clientX, e.clientY, d.lift);
    if (!tl) {
      d.bisa = false;
      d.tl = null;
      posisiGhost(d, e.clientX, e.clientY);
      paintBoard();
      return;
    }
    const peta = petaPreview(d.blok, tl.r, tl.c);
    d.bisa = peta.ok;
    d.tl = tl;
    tempelGhost(d, tl);
    if (d.ghost) d.ghost.classList.toggle("is-bad", !peta.ok);
    if (d.touch && d.previewOk !== peta.ok) {
      if (peta.ok) getar(8);
      d.previewOk = peta.ok;
    }
    paintBoard(peta);
  }

  function onDragUp(e) {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    if (d.moved) {
      if (d.bisa && d.tl) {
        const idx = S.tray.indexOf(d.blok);
        if (idx >= 0) pasangBlok(idx, d.tl.r, d.tl.c);
      } else {
        getar(12);
      }
    } else {
      const idx = S.tray.indexOf(d.blok);
      if (idx >= 0) {
        S.selected = S.selected === idx ? -1 : idx;
        if (elTray) {
          Array.prototype.forEach.call(elTray.querySelectorAll(".bb-piece"), (el, i) => {
            el.classList.toggle("is-selected", i === S.selected);
          });
        }
        if (S.selected >= 0) {
          sfx("buttonClick");
          tampilNotice("Blok dipilih. Tap papan buat pasang.");
        }
      }
    }
    bersihkanDrag();
    paintBoard();
  }

  function onDragCancel() {
    bersihkanDrag();
    paintBoard();
  }

  function bersihkanDrag() {
    const d = S.drag;
    S.drag = null;
    if (!d) return;
    if (d.ghost) d.ghost.remove();
    if (d.pieceEl) d.pieceEl.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragCancel);
  }

  function batalDrag() {
    if (S.drag) bersihkanDrag();
  }

  function mulaiDrag(e, idx, pieceEl) {
    if (S.drag || S.busy || S.over) return;
    const blok = S.tray[idx];
    if (!blok) return;
    S.selected = -1;
    Array.prototype.forEach.call(elTray.querySelectorAll(".bb-piece"), (el) => el.classList.remove("is-selected"));
    const touch = e.pointerType !== "mouse";
    const g = geometriBoard();
    const lift = touch
      ? Math.round(Math.min(72, Math.max(44, (g ? g.cellH : 48) * 1.05)))
      : 0;
    S.drag = {
      id: e.pointerId,
      idx,
      blok,
      pieceEl,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ghost: null,
      touch,
      lift,
      previewOk: null,
      bisa: false,
      tl: null,
    };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragCancel);
  }

  /* ================= LIFECYCLE ================= */

  function renderAll() {
    renderHud();
    renderTray();
    paintBoard();
    renderOver(S.over);
    renderPeringkat();
  }

  function buka() {
    S.viewOpen = true;
    const view = document.getElementById("game-blockblast-view");
    if (view) view.hidden = false;
    const listView = document.getElementById("games-list-view");
    if (listView) listView.hidden = true;

    const user = getCurrentUser();
    const lama = S.user ? String(S.user.absen) : "";
    const baru = user ? String(user.absen) : "";
    if (lama !== baru) {
      S.user = user || null;
      S.started = false;
    }
    if (!S.started) {
      mulaiBaru();
      muatStats();
    } else {
      renderAll();
    }
    requestAnimationFrame(() => paintBoard());
  }

  function tutup() {
    S.viewOpen = false;
    batalDrag();
    const view = document.getElementById("game-blockblast-view");
    if (view) view.hidden = true;
    return true;
  }

  function akunBerubah(user) {
    const u = user || null;
    const lama = S.user ? String(S.user.absen) : "";
    const baru = u ? String(u.absen) : "";
    S.user = u;
    if (lama === baru) {
      renderPeringkat();
      return;
    }
    S.started = false;
    muatStatsLokal();
    if (S.viewOpen) {
      mulaiBaru();
      muatStats();
    } else {
      renderHud();
      renderPeringkat();
    }
  }

  function ringkas(login) {
    try {
      const user = getCurrentUser();
      const key = SKOR_KEY + (user ? String(user.absen) : "guest");
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      const best = raw ? Number(raw.best) || 0 : 0;
      const games = raw ? Number(raw.games) || 0 : 0;
      if (best > 0) return `🏆 Terbaik ${best.toLocaleString("id-ID")} · ${games} game`;
      if (login) return "Belum pernah main · puzzle blok 8x8";
      return "Tanpa login · Main langsung, skor di perangkat";
    } catch (err) {
      return "Puzzle blok 8x8";
    }
  }

  function init() {
    const app = document.getElementById("bb-app");
    if (!app) return;
    elBoard = document.getElementById("bb-board");
    elTray = document.getElementById("bb-tray");
    elScore = document.getElementById("bb-score");
    elBest = document.getElementById("bb-best");
    elLines = document.getElementById("bb-lines");
    elCombo = document.getElementById("bb-combo");
    elOver = document.getElementById("bb-over");
    elFinal = document.getElementById("bb-final");
    elFinalBest = document.getElementById("bb-final-best");
    elRank = document.getElementById("bb-rank");
    elNotice = document.getElementById("bb-notice");

    if (elBoard) {
      let isi = "";
      for (let i = 0; i < TOTAL; i += 1) isi += `<div class="bb-cell" data-i="${i}" role="gridcell"></div>`;
      elBoard.innerHTML = isi;
    }

    app.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bb-action]");
      if (!btn) return;
      if (btn.dataset.bbAction === "restart") {
        sfx("buttonClick");
        mulaiBaru();
        muatPeringkat();
      }
    });

    if (elTray) {
      elTray.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        const pieceEl = e.target.closest("[data-bb-piece]");
        if (!pieceEl) return;
        e.preventDefault();
        mulaiDrag(e, Number(pieceEl.dataset.bbPiece), pieceEl);
      });
    }

    if (elBoard) {
      elBoard.addEventListener("pointermove", (e) => {
        if (S.drag || S.busy || S.over || S.selected < 0) return;
        const blok = S.tray[S.selected];
        const cell = e.target.closest(".bb-cell");
        if (!blok || !cell) return;
        const i = Number(cell.dataset.i);
        const r = Math.floor(i / UKURAN);
        const c = i % UKURAN;
        const tlR = Math.max(0, Math.min(UKURAN - blok.h, r));
        const tlC = Math.max(0, Math.min(UKURAN - blok.w, c));
        paintBoard(petaPreview(blok, tlR, tlC));
      });
      elBoard.addEventListener("pointerleave", () => {
        if (!S.drag) paintBoard();
      });
      elBoard.addEventListener("pointerup", (e) => {
        if (S.drag || S.busy || S.over || S.selected < 0) return;
        const cell = e.target.closest(".bb-cell");
        if (!cell) return;
        const blok = S.tray[S.selected];
        if (!blok) return;
        const i = Number(cell.dataset.i);
        const r = Math.floor(i / UKURAN);
        const c = i % UKURAN;
        const tlR = Math.max(0, Math.min(UKURAN - blok.h, r));
        const tlC = Math.max(0, Math.min(UKURAN - blok.w, c));
        if (!pasangBlok(S.selected, tlR, tlC)) {
          sfx("errorSound");
          tampilNotice("Blok gak muat di situ. Coba tempat lain.");
          elBoard.classList.remove("is-shake");
          void elBoard.offsetWidth;
          elBoard.classList.add("is-shake");
        }
      });
    }

    window.addEventListener("resize", () => {
      if (!S.drag) paintBoard();
    });

    S.user = getCurrentUser();
    muatStatsLokal();
    renderHud();
    renderPeringkat();
  }

  // Hook dipasang langsung, biar katalog Games bisa baca ringkasan skor
  // walau init DOM blockblast.js jalan setelah script.js.
  window.blockblastBuka = buka;
  window.blockblastTutup = tutup;
  window.blockblastAkunBerubah = akunBerubah;
  window.blockblastRingkas = ringkas;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
