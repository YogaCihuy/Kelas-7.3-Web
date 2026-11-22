/* ===================================================
   RUBIK CUBE 3x3 — main, tutorial, dan latihan rumus
   - Kubus 3x3 digambar sendiri di canvas (tanpa library)
   - Putar sisi dengan geser di permukaan kubus / tombol U D L R F B
   - Timer mulai di langkah pertama setelah acak, berhenti saat solved
   - Top 3 penyelesai tercepat (Firestore, satu dokumen per akun)
   - Tutorial metode Pemula & CFOP + latihan rumus berulang
   Catatan: kubus dihitung di browser. Rules hanya memvalidasi
   bentuk dokumen rekor, sama seperti Sudoku & Block Blast.
=================================================== */
(function () {
  "use strict";

  const E = typeof window !== "undefined" ? window.RubikEngine : null;
  if (!E) return;

  const KUNCI_LOKAL = "kelas73-rubik-v1-";
  const KUNCI_LATIHAN = "kelas73-rubik-latihan-v1-";
  const CAM_DIST = 9.5;
  const AWAL = { yaw: -0.62, pitch: 0.5, zoom: 1 };
  const FACE_LABEL = { U: "atas", D: "bawah", L: "kiri", R: "kanan", F: "depan", B: "belakang" };

  const ALGS = [
    { id: "sexy", nama: "Sexy Move", rumus: "R U R' U'", ket: "Rumus dasar paling sering dipakai di semua metode." },
    { id: "kiri", nama: "Trigger Kiri", rumus: "L' U' L U", ket: "Pasangan kiri dari Sexy Move." },
    { id: "insert-kanan", nama: "Masuk Slot Kanan", rumus: "R U' R'", ket: "F2L: pasang pojok + edge ke slot kanan." },
    { id: "insert-kiri", nama: "Masuk Slot Kiri", rumus: "L' U L", ket: "F2L: pasang pojok + edge ke slot kiri." },
    { id: "sune", nama: "Sune", rumus: "R U R' U R U2 R'", ket: "Orientasi sudut kuning di layer atas." },
    { id: "antisune", nama: "Antisune", rumus: "R U2 R' U' R U' R'", ket: "Kebalikan Sune, untuk pola sudut yang berlawanan." },
    { id: "cross", nama: "Cross Kuning", rumus: "F R U R' U' F'", ket: "Membentuk plus kuning dari pola garis." },
    { id: "tperm", nama: "T-Perm", rumus: "R U R' U' R' F R2 U' R' U' R U R' F'", ket: "PLL: tukar dua sudut dan dua edge." },
    { id: "ua", nama: "Ua-Perm", rumus: "R U' R U R U R U' R' U' R2", ket: "PLL: putar tiga edge atas searah." },
    { id: "ub", nama: "Ub-Perm", rumus: "R2 U R U R' U' R' U' R' U R'", ket: "PLL: putar tiga edge atas berlawanan arah." },
  ];
  ALGS.forEach((a) => {
    a.tokens = E.parseAlg(a.rumus);
    a.goal = 0;
  });

  const TUTORIAL = {
    pemula: {
      judul: "Metode Pemula",
      sub: "Paling gampang buat pertama kali. Selesaikan per layer: cross putih, layer putih, layer kedua, lalu layer kuning.",
      langkah: [
        {
          judul: "Kenali notasi",
          isi: "U = atas, D = bawah, L = kiri, R = kanan, F = depan, B = belakang. Tanda ' artinya putar balik, angka 2 artinya dua kali. Contoh: R U R' U' berarti kanan searah, atas searah, kanan balik, atas balik.",
          rumus: [],
        },
        {
          judul: "1. Cross putih",
          isi: "Buat tanda plus putih di sisi bawah. Belum perlu rumus: pindahkan edge putih satu per satu sampai membentuk plus dan warna sisinya cocok dengan center.",
          rumus: [],
        },
        {
          judul: "2. Sudut putih (layer 1)",
          isi: "Cocokkan sudut putih tepat di atas slotnya, lalu ulangi rumus sampai masuk. Kalau sudutnya di sisi kiri, pakai rumus pasangannya.",
          rumus: ["R U R' U'", "L' U' L U"],
        },
        {
          judul: "3. Layer kedua",
          isi: "Balik kubus supaya putih di bawah. Masukkan edge tanpa warna kuning ke slot kanan atau kiri. Kalau edge sudah nyangkut di slot yang salah, keluarkan dulu dengan rumus yang sama.",
          rumus: ["U R U' R' U' F' U F", "U' L' U L U F U' F'"],
        },
        {
          judul: "4. Cross kuning",
          isi: "Di sisi atas akan ada titik, garis, atau huruf L. Hadapkan garis mendatar, lalu ulangi rumus sampai terbentuk plus kuning.",
          rumus: ["F R U R' U' F'"],
        },
        {
          judul: "5. Kuning di atas",
          isi: "Pakai Sune atau Antisune untuk memutar sudut kuning sampai seluruh sisi atas berwarna kuning. Pilih yang polanya paling mirip.",
          rumus: ["R U R' U R U2 R'", "R U2 R' U' R U' R'"],
        },
        {
          judul: "6. Susun sudut kuning",
          isi: "Cari sudut yang sudah berada di posisi benar (warna sisinya cocok dengan center), taruh di kanan depan, lalu jalankan rumus. Ulangi kalau belum semua pas.",
          rumus: ["U R U' L' U R' U' L"],
        },
        {
          judul: "7. Putar sudut terakhir",
          isi: "Kalau posisi sudut sudah benar tapi warnanya masih miring, hadapkan sudut itu ke kanan bawah lalu ulangi R' D' R D sampai kuningnya menghadap atas. Pindah sudut dengan U, jangan putar seluruh kubus.",
          rumus: ["R' D' R D"],
        },
        {
          judul: "8. Edge terakhir",
          isi: "Tinggal edge atas yang belum pas. Pakai Ua-Perm atau Ub-Perm sesuai arah putarannya. Setelah ini kubus solved.",
          rumus: ["R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'"],
        },
      ],
    },
    cfop: {
      judul: "CFOP",
      sub: "Metode speedcubing paling terkenal: Cross → F2L → OLL → PLL. Butuh hafalan lebih banyak, tapi jauh lebih cepat.",
      langkah: [
        {
          judul: "Kenali 4 tahap CFOP",
          isi: "C = Cross (plus bawah), F = F2L (dua layer pertama sekaligus), O = OLL (orientasi layer atas), P = PLL (posisi layer atas). Fokus dulu ke Cross dan F2L karena paling banyak menghemat waktu.",
          rumus: [],
        },
        {
          judul: "1. Cross bawah",
          isi: "Buat cross putih langsung di bawah, maksimal 8 langkah. Latih dari berbagai posisi dan biasakan melihat seluruh kubus, bukan satu sisi saja.",
          rumus: [],
        },
        {
          judul: "2. F2L — pasang pasangan",
          isi: "Pasang pojok putih dan edge tengah sekaligus ke slotnya. Dua rumus dasar: masuk slot kanan dan masuk slot kiri. Kalau pasangan belum menyatu, pecah dulu lalu bentuk ulang.",
          rumus: ["U R U' R'", "U' L' U L"],
        },
        {
          judul: "3. OLL 2-look: edge",
          isi: "Tahap pertama OLL: orientasi edge atas sampai terbentuk plus kuning. Pola garis pakai rumus ini; pola titik atau L diulang setelah dibentuk.",
          rumus: ["F R U R' U' F'"],
        },
        {
          judul: "4. OLL 2-look: sudut",
          isi: "Setelah plus kuning, pakai Sune atau Antisune sampai seluruh sisi atas kuning. Ini sudah cukup untuk 2-look OLL.",
          rumus: ["R U R' U R U2 R'", "R U2 R' U' R U' R'"],
        },
        {
          judul: "5. PLL 2-look: sudut",
          isi: "Samakan posisi sudut atas. Cari dua sudut yang warnanya sudah sepasang (headlights), hadapkan ke belakang, lalu jalankan rumus.",
          rumus: ["U R U' L' U R' U' L"],
        },
        {
          judul: "6. PLL 2-look: edge",
          isi: "Tinggal memutar tiga edge atas. Pilih Ua-Perm atau Ub-Perm sesuai arah. Setelah ini kubus solved.",
          rumus: ["R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'"],
        },
        {
          judul: "Tips latihan",
          isi: "Hafal satu rumus per hari, lalu ulangi di tab Latihan sampai tangan ingat sendiri. Kecepatan F2L lebih penting daripada menghafal semua OLL/PLL.",
          rumus: [],
        },
      ],
    },
  };

  const R = {
    user: null,
    viewOpen: false,
    tab: "main",
    tutMode: "pemula",
    arah: 1,
    yaw: AWAL.yaw,
    pitch: AWAL.pitch,
    zoom: AWAL.zoom,
    drag: null,
    anim: null,
    animJob: null,
    queue: [],
    raf: 0,
    timerInt: 0,
    noticeTimer: 0,
    rank: null,
    rankErr: "",
    stats: { bestMs: 0, bestMoves: 0, solves: 0 },
    trainStats: {},
    main: {
      cube: new E.Cube(),
      history: [],
      moves: 0,
      armed: false,
      started: false,
      running: false,
      elapsed: 0,
      startAt: 0,
      solved: false,
      scrambled: false,
    },
    train: {
      cube: new E.Cube(),
      alg: ALGS[0],
      reps: 0,
      langkah: 0,
      showAlg: true,
    },
  };

  let elApp = null;
  let elTime = null;
  let elMoves = null;
  let elStatus = null;
  let elBest = null;
  let elStart = null;
  let elStartNote = null;
  let elOver = null;
  let elOverIcon = null;
  let elOverTime = null;
  let elOverNote = null;
  let elRank = null;
  let elNotice = null;
  let elTutorial = null;
  let elTrainAlgs = null;
  let elTrainPanel = null;
  let canvasMain = null;
  let canvasTrain = null;

  /* ================= UTIL ================= */

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

  function kunciLokal() {
    return KUNCI_LOKAL + (R.user ? String(R.user.absen) : "guest");
  }

  function kunciLatihan() {
    return KUNCI_LATIHAN + (R.user ? String(R.user.absen) : "guest");
  }

  function formatMs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0));
    const menit = Math.floor(total / 60000);
    const detik = Math.floor((total % 60000) / 1000);
    const seratus = Math.floor((total % 1000) / 10);
    return String(menit).padStart(2, "0") + ":" + String(detik).padStart(2, "0") + "." + String(seratus).padStart(2, "0");
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function tampilNotice(teks) {
    if (!elNotice) return;
    elNotice.textContent = teks;
    elNotice.classList.add("is-on");
    clearTimeout(R.noticeTimer);
    R.noticeTimer = setTimeout(() => elNotice.classList.remove("is-on"), 3400);
  }

  /* ================= DATA LOKAL ================= */

  function muatLokal() {
    R.stats = { bestMs: 0, bestMoves: 0, solves: 0 };
    try {
      const raw = JSON.parse(localStorage.getItem(kunciLokal()) || "null");
      if (!raw) return;
      const best = Number(raw.bestMs) || 0;
      R.stats.bestMs = best > 0 && best < 86400000 ? Math.round(best) : 0;
      R.stats.bestMoves = Math.max(0, Math.min(100000, Number(raw.bestMoves) || 0));
      R.stats.solves = Math.max(0, Math.min(1000000, Number(raw.solves) || 0));
    } catch (err) { /* localStorage penuh / diblokir */ }
  }

  function simpanLokal() {
    try {
      localStorage.setItem(kunciLokal(), JSON.stringify({
        bestMs: R.stats.bestMs,
        bestMoves: R.stats.bestMoves,
        solves: R.stats.solves,
        updatedAt: Date.now(),
      }));
    } catch (err) { /* abaikan */ }
  }

  function muatLatihan() {
    R.trainStats = {};
    try {
      const raw = JSON.parse(localStorage.getItem(kunciLatihan()) || "null");
      if (raw && typeof raw === "object") R.trainStats = raw;
    } catch (err) { /* abaikan */ }
  }

  function simpanLatihan() {
    try {
      localStorage.setItem(kunciLatihan(), JSON.stringify(R.trainStats));
    } catch (err) { /* abaikan */ }
  }

  function catatLatihan(id, reps) {
    if (!id) return;
    const lama = R.trainStats[id] || { total: 0 };
    R.trainStats[id] = { total: Math.max(0, Number(lama.total) || 0) + reps };
    simpanLatihan();
  }

  /* ================= TIMER ================= */

  function waktuSekarang() {
    if (R.main.running) return R.main.elapsed + (performance.now() - R.main.startAt);
    return R.main.elapsed;
  }

  function mulaiIntervalTimer() {
    if (R.timerInt) return;
    R.timerInt = setInterval(() => {
      if (elTime) elTime.textContent = formatMs(waktuSekarang());
    }, 80);
  }

  function hentikanIntervalTimer() {
    if (R.timerInt) {
      clearInterval(R.timerInt);
      R.timerInt = 0;
    }
  }

  function mulaiHitung() {
    R.main.armed = false;
    R.main.started = true;
    R.main.running = true;
    R.main.startAt = performance.now();
    mulaiIntervalTimer();
    renderHud();
    sfx("timerStart");
  }

  function jedaTimer() {
    if (R.main.running) {
      R.main.elapsed = waktuSekarang();
      R.main.running = false;
    }
    hentikanIntervalTimer();
    renderHud();
  }

  function lanjutTimer() {
    if (!R.main.started || R.main.solved || R.main.running) return;
    R.main.running = true;
    R.main.startAt = performance.now();
    mulaiIntervalTimer();
    renderHud();
  }

  /* ================= STATUS & OVERLAY ================= */

  function statusTeks() {
    if (R.main.solved) return "Solved!";
    if (R.main.running) return "Berjalan";
    if (R.main.started) return "Jeda";
    if (R.main.armed) return "Siap";
    return "Acak dulu";
  }

  function renderHud() {
    if (elTime) elTime.textContent = formatMs(waktuSekarang());
    if (elMoves) elMoves.textContent = String(R.main.moves);
    if (elStatus) elStatus.textContent = statusTeks();
    if (elBest) elBest.textContent = R.stats.bestMs ? formatMs(R.stats.bestMs) : "—";
    renderStartOverlay();
  }

  function renderStartOverlay() {
    if (!elStart) return;
    const tampil = !R.main.armed && !R.main.started && !R.main.solved;
    elStart.hidden = !tampil;
    if (tampil && elStartNote) {
      elStartNote.textContent = R.stats.bestMs
        ? "Rekor kamu " + formatMs(R.stats.bestMs) + " (" + R.stats.bestMoves + " langkah). Timer mulai di langkah pertama setelah acak."
        : "Timer mulai di langkah pertama setelah acak. Geser permukaan kubus untuk memutar baris, atau pakai tombol sisi.";
    }
  }

  /* ================= RENDER KUBUS ================= */

  function geoKamera(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    return {
      w,
      h,
      cx: w / 2,
      cy: h / 2,
      F: Math.min(w, h) * 1.92 * R.zoom,
    };
  }

  function rotKamera(v, cam) {
    const x1 = v[0] * cam.cy + v[2] * cam.sy;
    const z1 = -v[0] * cam.sy + v[2] * cam.cy;
    const y2 = v[1] * cam.cp - z1 * cam.sp;
    const z2 = v[1] * cam.sp + z1 * cam.cp;
    return [x1, y2, z2];
  }

  function proyeksi(geo, cam, p) {
    const v = rotKamera([p[0] - 1.5, p[1] - 1.5, p[2] - 1.5], cam);
    const zc = Math.max(0.6, CAM_DIST - v[2]);
    const f = geo.F / zc;
    return { x: geo.cx + v[0] * f, y: geo.cy - v[1] * f, z: zc };
  }

  function warnaLight(hex, factor) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * factor), 0, 255);
    const g = clamp(Math.round(((n >> 8) & 255) * factor), 0, 255);
    const b = clamp(Math.round((n & 255) * factor), 0, 255);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function gambarKubus(canvas, cube) {
    if (!canvas || !cube) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pxW = Math.round(rect.width * dpr);
    const pxH = Math.round(rect.height * dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineJoin = "round";

    const geo = geoKamera(canvas);
    const cam = {
      cy: Math.cos(R.yaw),
      sy: Math.sin(R.yaw),
      cp: Math.cos(R.pitch),
      sp: Math.sin(R.pitch),
    };
    const anim = R.anim;
    const items = [];
    const hits = [];

    cube.cubies.forEach((cubie) => {
      const pos = cubie.pos;
      const kena = anim && pos[anim.axis] === anim.layer;
      const angle = kena ? anim.angle || 0 : 0;

      function putarTitik(p) {
        if (!kena) return p;
        const r = E.rotateFloat([p[0] - 1.5, p[1] - 1.5, p[2] - 1.5], anim.axis, angle);
        return [r[0] + 1.5, r[1] + 1.5, r[2] + 1.5];
      }

      Object.keys(cubie.stickers).forEach((key) => {
        const normal = key.split(",").map(Number);
        const nRot = kena ? E.rotateFloat(normal, anim.axis, angle) : normal;
        const nCam = rotKamera(nRot, cam);
        if (nCam[2] <= 0.02) return;

        const sumbu = normal.findIndex((v) => v !== 0);
        if (sumbu < 0) return;
        const e1 = [0, 0, 0];
        const e2 = [0, 0, 0];
        e1[(sumbu + 1) % 3] = 1;
        e2[(sumbu + 2) % 3] = 1;

        const tengah = [
          pos[0] + normal[0] * 0.5,
          pos[1] + normal[1] * 0.5,
          pos[2] + normal[2] * 0.5,
        ];
        const tanda = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

        function sudut(extent) {
          return tanda.map((t) => {
            const p = [
              tengah[0] + e1[0] * extent * t[0] + e2[0] * extent * t[1],
              tengah[1] + e1[1] * extent * t[0] + e2[1] * extent * t[1],
              tengah[2] + e1[2] * extent * t[0] + e2[2] * extent * t[1],
            ];
            return putarTitik(p);
          });
        }

        const titikBase = sudut(0.5).map((p) => proyeksi(geo, cam, p));
        const titikStiker = sudut(0.42).map((p) => proyeksi(geo, cam, p));
        const depth = (titikStiker[0].z + titikStiker[1].z + titikStiker[2].z + titikStiker[3].z) / 4;

        const cahaya = Math.max(0, nCam[0] * -0.25 + nCam[1] * 0.72 + nCam[2] * 0.62);
        const shade = 0.72 + 0.28 * cahaya;

        items.push({
          depth: depth + 0.03,
          poly: titikBase,
          fill: "#0d1f16",
          stroke: null,
          urut: 0,
        });
        items.push({
          depth,
          poly: titikStiker,
          fill: warnaLight(E.FACE_COLORS[cubie.stickers[key]], shade),
          stroke: "rgba(6, 16, 11, 0.55)",
          urut: 1,
        });

        hits.push({
          depth,
          pos: pos.slice(),
          normal: normal.slice(),
          face: cubie.stickers[key],
          quad: titikStiker,
          centerWorld: putarTitik(tengah),
        });
      });
    });

    items.sort((a, b) => b.depth - a.depth || a.urut - b.urut);

    items.forEach((it) => {
      ctx.beginPath();
      it.poly.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = it.fill;
      ctx.fill();
      if (it.stroke) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = it.stroke;
        ctx.stroke();
      }
    });

    canvas._rbHits = hits;
    canvas._rbGeo = { geo, cam };
  }

  function gambarKedua() {
    gambarKubus(canvasMain, R.main.cube);
    gambarKubus(canvasTrain, R.train.cube);
  }

  function dalamPoligon(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function cariStiker(canvas, x, y) {
    const hits = canvas._rbHits || [];
    let best = null;
    hits.forEach((hit) => {
      if (!dalamPoligon(hit.quad, x, y)) return;
      if (!best || hit.depth < best.depth) best = hit;
    });
    return best;
  }

  function sumbuVektor(v) {
    for (let i = 0; i < 3; i += 1) if (v[i] !== 0) return i;
    return 0;
  }

  function hitungGeser(hit, canvas, dx, dy) {
    const info = canvas._rbGeo;
    const basis = E.FACE_BASIS[E.nkey(hit.normal)];
    if (!info || !basis) return null;
    const c = hit.centerWorld;
    const p0 = proyeksi(info.geo, info.cam, c);
    const pu = proyeksi(info.geo, info.cam, [
      c[0] + basis[0][0] * 0.5,
      c[1] + basis[0][1] * 0.5,
      c[2] + basis[0][2] * 0.5,
    ]);
    const pv = proyeksi(info.geo, info.cam, [
      c[0] + basis[1][0] * 0.5,
      c[1] + basis[1][1] * 0.5,
      c[2] + basis[1][2] * 0.5,
    ]);
    const sux = pu.x - p0.x;
    const suy = pu.y - p0.y;
    const svx = pv.x - p0.x;
    const svy = pv.y - p0.y;
    const lu = Math.hypot(sux, suy) || 1;
    const lv = Math.hypot(svx, svy) || 1;
    const du = (dx * sux + dy * suy) / lu;
    const dv = (dx * svx + dy * svy) / lv;

    if (Math.abs(du) >= Math.abs(dv)) {
      const axis = sumbuVektor(basis[1]);
      return { axis, layer: hit.pos[axis], dir: du >= 0 ? 1 : -1, quarters: 1 };
    }
    const axis = sumbuVektor(basis[0]);
    return { axis, layer: hit.pos[axis], dir: dv >= 0 ? -1 : 1, quarters: 1 };
  }

  /* ================= ANTREAN & ANIMASI ================= */

  function kubusUntuk(sumber) {
    return sumber === "train" ? R.train.cube : R.main.cube;
  }

  function kanvasUntuk(sumber) {
    return sumber === "train" ? canvasTrain : canvasMain;
  }

  function antri(move, opsi) {
    const o = opsi || {};
    R.queue.push({
      move,
      sumber: o.sumber === "train" ? "train" : "main",
      catat: o.catat !== false,
      hitung: o.hitung !== false,
      demo: !!o.demo,
      selesai: typeof o.selesai === "function" ? o.selesai : null,
    });
    if (!R.anim) mulaiAntrean();
  }

  function mulaiAntrean() {
    if (R.anim || !R.queue.length) return;
    const job = R.queue.shift();
    job.cube = kubusUntuk(job.sumber);
    job.canvas = kanvasUntuk(job.sumber);
    R.animJob = job;
    const quarters = job.move.quarters || 1;
    R.anim = {
      axis: job.move.axis,
      layer: job.move.layer,
      total: job.move.dir * (Math.PI / 2) * quarters,
      t0: performance.now(),
      dur: 150 * quarters,
      angle: 0,
    };
    if (job.sumber === "main" && job.catat && R.main.armed && !R.main.started) mulaiHitung();
    gambarKubus(job.canvas, job.cube);
    R.raf = requestAnimationFrame(gulirAnim);
  }

  function gulirAnim(now) {
    const a = R.anim;
    const job = R.animJob;
    if (!a || !job) return;
    const t = Math.min(1, (now - a.t0) / a.dur);
    const ease = t * t * (3 - 2 * t);
    a.angle = a.total * ease;
    gambarKubus(job.canvas, job.cube);
    if (t < 1) {
      R.raf = requestAnimationFrame(gulirAnim);
      return;
    }
    R.raf = 0;
    R.anim = null;
    R.animJob = null;
    selesaikanJob(job);
    gambarKubus(job.canvas, job.cube);
    mulaiAntrean();
  }

  function selesaikanJob(job) {
    job.cube.turnAxis(job.move.axis, job.move.layer, job.move.dir, job.move.quarters || 1);

    if (job.sumber === "main") {
      if (job.catat) {
        R.main.history.push(job.move);
        if (job.hitung) R.main.moves += 1;
        if (!R.main.started) R.main.started = true;
        sfx("placePiece");
        renderHud();
        if (!R.queue.some((q) => q.sumber === "main")) cekSelesaiMain();
      }
    } else {
      sfx("placePiece");
      if (!job.demo) {
        R.train.langkah += 1;
        if (!R.queue.some((q) => q.sumber === "train")) cekLatihan();
      }
    }

    if (job.selesai) job.selesai();
  }

  function selesaikanAntrean() {
    if (R.raf) {
      cancelAnimationFrame(R.raf);
      R.raf = 0;
    }
    R.anim = null;
    if (R.animJob) {
      const job = R.animJob;
      R.animJob = null;
      selesaikanJob(job);
    }
    while (R.queue.length) selesaikanJob(R.queue.shift());
  }

  /* ================= MAIN ================= */

  function resetMain() {
    selesaikanAntrean();
    hentikanIntervalTimer();
    R.main.cube = new E.Cube();
    R.main.history = [];
    R.main.moves = 0;
    R.main.armed = false;
    R.main.started = false;
    R.main.running = false;
    R.main.elapsed = 0;
    R.main.startAt = 0;
    R.main.solved = false;
    R.main.scrambled = false;
    if (elOver) elOver.hidden = true;
    renderHud();
    gambarKedua();
  }

  function scrambleMain() {
    if (R.anim || R.queue.length) return;
    hentikanIntervalTimer();

    let tokens = [];
    for (let coba = 0; coba < 20; coba += 1) {
      tokens = E.randomScramble(21);
      const cek = new E.Cube();
      E.applyAlg(cek, tokens);
      if (!cek.isSolved()) break;
    }

    R.main.cube = new E.Cube();
    E.applyAlg(R.main.cube, tokens);
    R.main.history = [];
    R.main.moves = 0;
    R.main.armed = true;
    R.main.started = false;
    R.main.running = false;
    R.main.elapsed = 0;
    R.main.startAt = 0;
    R.main.solved = false;
    R.main.scrambled = true;

    if (elOver) elOver.hidden = true;
    sfx("shuffleTick");
    renderHud();
    gambarKedua();
    tampilNotice("Kubus diacak 21 langkah. Langkah pertamamu langsung mulai timer.");
  }

  function undoMain() {
    if (R.anim || R.queue.length) return;
    const move = R.main.history.pop();
    if (!move) {
      tampilNotice("Belum ada langkah yang bisa dibatalkan.");
      return;
    }
    R.main.moves = Math.max(0, R.main.moves - 1);
    antri(E.inverseMove(move), { sumber: "main", catat: false, hitung: false });
    sfx("buttonClick");
    renderHud();
  }

  function cekSelesaiMain() {
    if (R.main.solved) return;
    if (!R.main.cube.isSolved()) return;
    if (!R.main.scrambled) {
      if (R.main.moves > 0) {
        tampilNotice("Kubus solved! Tekan Acak buat mulai tantangan waktu.");
        sfx("resultReveal");
      }
      return;
    }
    if (!R.main.started) return;
    selesaikanMain();
  }

  function selesaikanMain() {
    R.main.solved = true;
    R.main.armed = false;
    jedaTimer();
    const ms = Math.max(1, Math.round(R.main.elapsed));
    const langkah = R.main.moves;
    const info = simpanRekor(ms, langkah);

    sfx("timerFinish");
    if (elOver) elOver.hidden = false;
    if (elStart) elStart.hidden = true;
    if (elOverTime) elOverTime.textContent = formatMs(ms);
    if (elOverIcon) elOverIcon.textContent = info.rekorBaru ? "🏆" : "🎉";
    if (elOverNote) {
      let catatan = langkah + " langkah.";
      if (info.rekorBaru && info.lamaBest) catatan += " Rekor pribadi baru (sebelumnya " + formatMs(info.lamaBest) + ").";
      else if (info.rekorBaru) catatan += " Rekor pribadi pertamamu tersimpan.";
      else if (R.stats.bestMs) catatan += " Rekor kamu " + formatMs(R.stats.bestMs) + ".";
      catatan += R.user ? " Papan Top 3 ikut diperbarui." : " Login biar waktumu masuk papan Top 3.";
      elOverNote.textContent = catatan;
    }
    renderHud();
  }

  /* ================= REKOR & TOP 3 ================= */

  function simpanRekor(ms, langkah) {
    const lama = R.stats.bestMs;
    const rekorBaru = !lama || ms < lama;
    if (rekorBaru) {
      R.stats.bestMs = ms;
      R.stats.bestMoves = langkah;
    }
    R.stats.solves = Math.min(1000000, (R.stats.solves || 0) + 1);
    simpanLokal();
    if (R.user) simpanFirestore(ms, langkah);
    return { rekorBaru, lamaBest: lama };
  }

  function simpanFirestore(ms, langkah) {
    if (!R.user) return;
    const fs = firestore();
    if (!fs) return;
    const absen = Number(R.user.absen);
    if (!absen) return;
    const ref = fs.collection("rubik").doc(String(absen));
    const now = Date.now();
    const nama = String(namaSiswa(absen, R.user.namaPanggilan || R.user.namaLengkap || "Siswa")).slice(0, 60);

    if (typeof fs.runTransaction !== "function") {
      ref.set({
        absen,
        name: nama,
        bestMs: ms,
        bestMoves: langkah,
        solves: R.stats.solves,
        createdAt: now,
        updatedAt: now,
      }, { merge: true })
        .then(() => muatPeringkat())
        .catch(() => tampilNotice("Rekor tersimpan di perangkat. Sinkron ke akun gagal."));
      return;
    }

    fs.runTransaction((tx) => tx.get(ref).then((snap) => {
      const d = snap && snap.exists ? snap.data() || {} : {};
      const bestLama = Number(d.bestMs) || 0;
      const lebihBaik = !bestLama || ms < bestLama;
      const data = {
        absen,
        name: nama,
        bestMs: lebihBaik ? ms : bestLama,
        bestMoves: lebihBaik ? langkah : Math.max(0, Number(d.bestMoves) || 0),
        solves: Math.min(1000000, (Number(d.solves) || 0) + 1),
        createdAt: Number(d.createdAt) || now,
        updatedAt: now,
      };
      tx.set(ref, data, { merge: true });
      return data;
    }))
      .then((data) => {
        if (data && Number(data.bestMs) > 0) R.stats.bestMs = Number(data.bestMs);
        if (data) R.stats.solves = Math.max(R.stats.solves, Number(data.solves) || 0);
        simpanLokal();
        renderHud();
        muatPeringkat();
      })
      .catch(() => tampilNotice("Rekor tersimpan di perangkat. Sinkron ke akun gagal."));
  }

  function muatDariAkun() {
    if (!R.user) return;
    const fs = firestore();
    if (!fs) return;
    fs.collection("rubik").doc(String(R.user.absen)).get()
      .then((snap) => {
        if (!snap || !snap.exists) return;
        const d = snap.data() || {};
        const best = Number(d.bestMs) || 0;
        const bestMoves = Math.max(0, Number(d.bestMoves) || 0);
        const solves = Math.max(0, Number(d.solves) || 0);
        let berubah = false;
        if (best > 0 && (!R.stats.bestMs || best < R.stats.bestMs)) {
          R.stats.bestMs = best;
          R.stats.bestMoves = bestMoves;
          berubah = true;
        }
        if (solves > R.stats.solves) {
          R.stats.solves = solves;
          berubah = true;
        }
        if (berubah) {
          simpanLokal();
          renderHud();
        }
      })
      .catch(() => { /* offline: pakai data lokal */ });
  }

  function muatPeringkat() {
    R.rank = null;
    R.rankErr = "";
    renderRank();
    const fs = firestore();
    if (!fs) {
      R.rankErr = "Papan Top 3 butuh koneksi internet.";
      renderRank();
      return;
    }
    fs.collection("rubik")
      .where("bestMs", ">", 0)
      .orderBy("bestMs", "asc")
      .limit(3)
      .get()
      .then((snap) => {
        const list = [];
        snap.forEach((doc) => list.push(doc.data() || {}));
        R.rank = list;
        renderRank();
      })
      .catch(() => {
        R.rankErr = "Papan Top 3 belum bisa dimuat.";
        renderRank();
      });
  }

  function renderRank() {
    if (!elRank) return;
    let isi = "";
    if (R.rankErr) {
      isi = '<p class="rb-rank-hint">' + esc(R.rankErr) + "</p>";
    } else if (!R.rank) {
      isi = '<p class="rb-rank-hint">Memuat Top 3...</p>';
    } else if (!R.rank.length) {
      isi = '<p class="rb-rank-hint">Belum ada penyelesai. Jadi yang pertama!</p>';
    } else {
      const medali = ["🥇", "🥈", "🥉"];
      isi = '<ol class="rb-rank-list">' + R.rank.map((d, i) => {
        const absen = String(d.absen);
        const aku = R.user && String(R.user.absen) === absen;
        return '<li class="' + (aku ? "is-me" : "") + '">' +
          '<span class="rb-rank-no">' + (medali[i] || i + 1) + "</span>" +
          '<span class="rb-rank-name">' + esc(namaSiswa(absen, d.name)) + "</span>" +
          '<span class="rb-rank-time">' + formatMs(Number(d.bestMs) || 0) + "</span>" +
          '<small>' + (Number(d.bestMoves) || 0) + "×</small>" +
          "</li>";
      }).join("") + "</ol>";
    }
    const rekor = R.stats.bestMs
      ? '<p class="rb-rank-me">Rekor kamu: <strong>' + formatMs(R.stats.bestMs) + "</strong> · " + R.stats.bestMoves + " langkah</p>"
      : '<p class="rb-rank-me">' + (R.user ? "Belum pernah solve. Ayo coba!" : "Login biar rekormu ikut masuk papan Top 3.") + "</p>";
    elRank.innerHTML =
      '<div class="rb-rank-card">' +
        '<div class="rb-rank-head"><h3>Top 3 Tercepat</h3><span>Speedrun 3×3</span></div>' +
        isi +
        rekor +
      "</div>";
  }

  /* ================= GESER & TOMBOL ================= */

  function pasangKanvas(canvas, sumber) {
    if (!canvas) return;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
      if (R.anim || R.queue.length) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = cariStiker(canvas, x, y);
      R.drag = {
        id: e.pointerId,
        canvas,
        sumber,
        hit,
        x0: x,
        y0: y,
        orbit: !hit,
        yaw: R.yaw,
        pitch: R.pitch,
        done: false,
      };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) { /* browser lama */ }
      e.preventDefault();
    });

    canvas.addEventListener("pointermove", (e) => {
      const d = R.drag;
      if (!d || d.id !== e.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (d.orbit) {
        R.yaw = d.yaw + (x - d.x0) * 0.012;
        R.pitch = clamp(d.pitch + (y - d.y0) * 0.012, -1.35, 1.35);
        gambarKedua();
        e.preventDefault();
        return;
      }

      if (d.done) return;
      const dx = x - d.x0;
      const dy = y - d.y0;
      if (Math.hypot(dx, dy) < 13) return;
      d.done = true;
      const move = hitungGeser(d.hit, d.canvas, dx, dy);
      if (!move) return;
      antri(move, { sumber: d.sumber });
      e.preventDefault();
    });

    function lepas(e) {
      const d = R.drag;
      if (!d || d.id !== e.pointerId) return;
      R.drag = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) { /* sudah lepas */ }
    }

    canvas.addEventListener("pointerup", lepas);
    canvas.addEventListener("pointercancel", lepas);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      R.zoom = clamp(R.zoom * (e.deltaY < 0 ? 1.08 : 0.92), 0.75, 1.5);
      gambarKedua();
    }, { passive: false });
  }

  function putarSisi(face, turns, sumber) {
    if (R.queue.length > 12) return;
    antri(E.moveFromFace(face, turns), { sumber });
  }

  function putarAlg(tokens, sumber, selesai) {
    tokens.forEach((m, i) => {
      antri(E.moveFromFace(m.face, m.turns), {
        sumber,
        catat: false,
        hitung: false,
        demo: sumber === "train",
        selesai: i === tokens.length - 1 ? selesai : null,
      });
    });
  }

  function orbitArah(arah) {
    if (arah === "left") R.yaw -= 0.16;
    else if (arah === "right") R.yaw += 0.16;
    else if (arah === "up") R.pitch = clamp(R.pitch + 0.14, -1.35, 1.35);
    else if (arah === "down") R.pitch = clamp(R.pitch - 0.14, -1.35, 1.35);
    else {
      R.yaw = AWAL.yaw;
      R.pitch = AWAL.pitch;
      R.zoom = AWAL.zoom;
    }
    gambarKedua();
  }

  /* ================= PAD SISI ================= */

  function suffixArah() {
    return R.arah < 0 ? "'" : "";
  }

  function toggleHTML(sumber) {
    return '<div class="rb-toggle" role="group" aria-label="Arah putaran">' +
      '<button type="button" class="' + (R.arah > 0 ? "is-active" : "") + '" data-rb-arah="1" data-rb-for="' + sumber + '">⟳ Searah</button>' +
      '<button type="button" class="' + (R.arah < 0 ? "is-active" : "") + '" data-rb-arah="-1" data-rb-for="' + sumber + '">⟲ Balik</button>' +
      "</div>";
  }

  function renderPad(el, sumber) {
    if (!el) return;
    el.innerHTML = E.FACES.map((f) =>
      '<button type="button" data-rb-face="' + f + '" data-rb-for="' + sumber + '">' +
        "<strong>" + f + suffixArah() + "</strong>" +
        "<small>" + FACE_LABEL[f] + "</small>" +
      "</button>"
    ).join("");
  }

  function gantiArah(arah) {
    R.arah = arah < 0 ? -1 : 1;
    elApp.querySelectorAll("[data-rb-arah]").forEach((b) => {
      b.classList.toggle("is-active", Number(b.dataset.rbArah) === R.arah);
    });
    renderPad(document.getElementById("rb-pad"), "main");
    renderPad(document.getElementById("rb-train-pad"), "train");
    sfx("tabSwitch");
  }

  /* ================= TUTORIAL ================= */

  function renderTutorial() {
    if (!elTutorial) return;
    const data = TUTORIAL[R.tutMode] || TUTORIAL.pemula;
    const tombolMode = Object.keys(TUTORIAL).map((id) =>
      '<button type="button" class="' + (R.tutMode === id ? "is-active" : "") + '" data-rb-tut="' + id + '">' +
        esc(TUTORIAL[id].judul) +
      "</button>"
    ).join("");

    const langkah = data.langkah.map((step, i) => {
      const rumus = (step.rumus || []).map((alg) =>
        '<div class="rb-tut-rumus">' +
          '<code>' + esc(alg) + "</code>" +
          '<button type="button" class="rb-tut-coba" data-rb-coba="' + esc(alg) + '" data-rb-nama="' + esc(step.judul) + '">Coba</button>' +
        "</div>"
      ).join("");
      return '<div class="rb-tut-step">' +
        '<span class="rb-tut-no">' + (i + 1) + "</span>" +
        '<div class="rb-tut-body">' +
          "<h4>" + esc(step.judul) + "</h4>" +
          '<p>' + esc(step.isi) + "</p>" +
          (rumus ? '<div class="rb-tut-rumus-list">' + rumus + "</div>" : "") +
        "</div>" +
      "</div>";
    }).join("");

    elTutorial.innerHTML =
      '<div class="rb-tut-switch">' + tombolMode + "</div>" +
      '<p class="rb-tut-sub">' + esc(data.sub) + "</p>" +
      '<div class="rb-tut-steps">' + langkah + "</div>" +
      '<p class="rb-tut-tip">Tips: tiap rumus ada tombol Coba. Kubus latihan langsung dipasang di tab Latihan, aman dan tidak mengganggu solve-mu.</p>';
  }

  /* ================= LATIHAN ================= */

  function hitungGoal(tokens) {
    if (!tokens || !tokens.length) return 0;
    const c = new E.Cube();
    for (let i = 1; i <= 24; i += 1) {
      E.applyAlg(c, tokens);
      if (c.isSolved()) return i;
    }
    return 0;
  }

  function pilihAlg(alg) {
    if (R.anim || R.queue.length) selesaikanAntrean();
    R.train.alg = alg;
    R.train.cube = new E.Cube();
    R.train.reps = 0;
    R.train.langkah = 0;
    R.train.showAlg = true;
    renderLatihan();
    gambarKedua();
    sfx("cardOpen");
  }

  function mulaiLatihanRumus(rumus, nama) {
    const tokens = E.parseAlg(rumus);
    if (!tokens.length) return;
    const alg = {
      id: "custom:" + rumus,
      nama: nama || "Rumus Tutorial",
      rumus: E.formatAlg(tokens),
      ket: "Dibuka dari tutorial. Ulangi sampai hafal.",
      tokens,
      goal: 0,
    };
    pilihAlg(alg);
    pindahTab("latihan");
    tampilNotice("Rumus dipasang di kubus latihan: " + alg.rumus);
  }

  function resetLatihan() {
    selesaikanAntrean();
    R.train.cube = new E.Cube();
    R.train.reps = 0;
    R.train.langkah = 0;
    renderPanelLatihan();
    gambarKedua();
  }

  function putarRumusLatihan() {
    if (R.anim || R.queue.length) return;
    const alg = R.train.alg;
    if (!alg || !alg.tokens.length) return;
    if (alg.goal == null) alg.goal = hitungGoal(alg.tokens);
    const jumlah = alg.tokens.length;
    putarAlg(alg.tokens, "train", () => {
      R.train.reps += 1;
      catatLatihan(alg.id, 1);
      const solved = R.train.cube.isSolved();
      if (solved) {
        sfx("resultReveal");
        tampilNotice("Kubus kembali solved setelah " + R.train.reps + "× putaran. Polanya ketemu!");
      } else {
        sfx("teamsReady");
      }
      renderPanelLatihan();
      renderLatihanCards();
    });
    tampilNotice("Memutar " + jumlah + " langkah rumus...");
  }

  function cekLatihan() {
    if (!R.train.cube.isSolved()) return;
    if (R.train.langkah <= 0) return;
    R.train.langkah = 0;
    sfx("resultReveal");
    tampilNotice("Kubus latihan solved! Ulangi lagi buat menguatkan ingatan.");
    renderPanelLatihan();
  }

  function renderLatihanCards() {
    if (!elTrainAlgs) return;
    elTrainAlgs.innerHTML = ALGS.map((a) => {
      const stat = R.trainStats[a.id] || { total: 0 };
      const aktif = R.train.alg && R.train.alg.id === a.id;
      return '<button type="button" class="rb-alg' + (aktif ? " is-active" : "") + '" data-rb-alg="' + a.id + '">' +
        "<strong>" + esc(a.nama) + "</strong>" +
        "<small>" + esc(a.rumus) + "</small>" +
        "<span>" + (stat.total ? stat.total + "× diputar" : "Belum dicoba") + "</span>" +
      "</button>";
    }).join("");
  }

  function renderLatihan() {
    renderLatihanCards();
    renderPanelLatihan();
  }

  function renderPanelLatihan() {
    if (!elTrainPanel) return;
    const alg = R.train.alg;
    if (!alg) {
      elTrainPanel.innerHTML = '<p class="rb-hint">Pilih satu rumus di daftar.</p>';
      return;
    }
    if (alg.goal == null) alg.goal = hitungGoal(alg.tokens);
    const stat = R.trainStats[alg.id] || { total: 0 };
    const goal = alg.goal;
    elTrainPanel.innerHTML =
      '<div class="rb-train-head">' +
        "<div>" +
          "<h3>" + esc(alg.nama) + "</h3>" +
          '<p class="rb-train-sub">' + esc(alg.ket || "Ulangi rumus ini sampai hafal.") + "</p>" +
        "</div>" +
        '<button type="button" class="rb-eye' + (R.train.showAlg ? "" : " is-off") + '" data-rb-train="sembunyi" aria-label="Sembunyikan atau tampilkan rumus">' +
          (R.train.showAlg ? "👁" : "🙈") +
        "</button>" +
      "</div>" +
      '<p class="rb-train-alg' + (R.train.showAlg ? "" : " is-off") + '">' +
        (R.train.showAlg ? esc(alg.rumus) : "Rumus disembunyikan — coba ingat sendiri.") +
      "</p>" +
      '<p class="rb-train-goal">' +
        (goal
          ? "Kubus kembali solved setiap <strong>" + goal + "×</strong> putaran."
          : "Putar berulang untuk melihat pola rumusnya.") +
      "</p>" +
      '<div class="rb-train-count">' +
        "<div><span>Sudah diputar</span><strong>" + (Number(stat.total) || 0) + "×</strong></div>" +
        "<div><span>Sesi ini</span><strong>" + R.train.reps + "×</strong></div>" +
        "<div><span>Langkah manual</span><strong>" + R.train.langkah + "</strong></div>" +
      "</div>" +
      '<div class="rb-train-actions">' +
        '<button class="btn-primary" type="button" data-rb-train="putar">Putar Rumus</button>' +
        '<button class="btn-secondary" type="button" data-rb-train="reset">Reset Kubus</button>' +
      "</div>" +
      '<div class="rb-mode-row"><span>Arah tombol</span>' + toggleHTML("train") + "</div>" +
      '<p class="rb-hint">Ulangi sendiri pakai tombol sisi di bawah. Kalau lupa, sembunyikan rumus di atas.</p>' +
      '<div id="rb-train-pad" class="rb-pad rb-pad-train"></div>';

    renderPad(document.getElementById("rb-train-pad"), "train");
  }

  /* ================= TAB ================= */

  function terapkanTab() {
    if (!elApp) return;
    elApp.querySelectorAll("[data-rb-tab]").forEach((b) => {
      const aktif = b.dataset.rbTab === R.tab;
      b.classList.toggle("is-active", aktif);
      b.setAttribute("aria-selected", aktif ? "true" : "false");
    });
    ["main", "tutorial", "latihan"].forEach((t) => {
      const panel = document.getElementById("rb-panel-" + t);
      if (panel) panel.hidden = t !== R.tab;
    });
  }

  function pindahTab(tab) {
    if (!["main", "tutorial", "latihan"].includes(tab) || tab === R.tab) return;
    selesaikanAntrean();
    const dariMain = R.tab === "main";
    R.tab = tab;
    if (dariMain && R.main.running) jedaTimer();
    terapkanTab();
    if (tab === "main" && R.main.started && !R.main.solved) lanjutTimer();
    if (tab === "tutorial") renderTutorial();
    if (tab === "latihan") renderLatihan();
    sfx("tabSwitch");
    requestAnimationFrame(() => {
      gambarKedua();
    });
  }

  /* ================= LIFECYCLE ================= */

  function buka() {
    R.viewOpen = true;
    const view = document.getElementById("game-rubik-view");
    if (view) view.hidden = false;

    const user = getCurrentUser();
    const lama = R.user ? String(R.user.absen) : "";
    const baru = user ? String(user.absen) : "";
    if (lama !== baru) {
      R.user = user || null;
      resetMain();
      resetLatihan();
    }

    muatLokal();
    muatLatihan();
    renderHud();
    renderRank();
    renderTutorial();
    renderLatihan();
    terapkanTab();
    muatPeringkat();
    muatDariAkun();
    if (R.main.running) mulaiIntervalTimer();
    requestAnimationFrame(() => {
      gambarKedua();
    });
  }

  function tutup() {
    selesaikanAntrean();
    R.viewOpen = false;
    R.drag = null;
    jedaTimer();
    return true;
  }

  function akunBerubah(user) {
    const lama = R.user ? String(R.user.absen) : "";
    const baru = user ? String(user.absen) : "";
    R.user = user || null;
    resetMain();
    resetLatihan();
    muatLokal();
    muatLatihan();
    renderHud();
    renderRank();
    renderTutorial();
    renderLatihan();
    muatPeringkat();
    muatDariAkun();
    if (lama !== baru) renderHud();
  }

  function ringkas(login) {
    try {
      const user = getCurrentUser();
      const key = KUNCI_LOKAL + (user ? String(user.absen) : "guest");
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      const best = raw ? Number(raw.bestMs) || 0 : 0;
      const solves = raw ? Number(raw.solves) || 0 : 0;
      if (best > 0) return "🏆 " + formatMs(best) + " · " + solves + " solve";
      if (login) return "Rubik 3×3 · 10 rumus latihan";
      return "Tanpa login · Rubik 3×3";
    } catch (err) {
      return "Rubik 3×3 · Touchscreen";
    }
  }

  /* ================= INIT ================= */

  function init() {
    elApp = document.getElementById("rb-app");
    if (!elApp) return;
    elTime = document.getElementById("rb-time");
    elMoves = document.getElementById("rb-moves");
    elStatus = document.getElementById("rb-status");
    elBest = document.getElementById("rb-best");
    elStart = document.getElementById("rb-start");
    elStartNote = document.getElementById("rb-start-note");
    elOver = document.getElementById("rb-over");
    elOverIcon = document.getElementById("rb-over-icon");
    elOverTime = document.getElementById("rb-over-time");
    elOverNote = document.getElementById("rb-over-note");
    elRank = document.getElementById("rb-rank");
    elNotice = document.getElementById("rb-notice");
    elTutorial = document.getElementById("rb-tutorial");
    elTrainAlgs = document.getElementById("rb-train-algs");
    elTrainPanel = document.getElementById("rb-train-panel");
    canvasMain = document.getElementById("rb-canvas");
    canvasTrain = document.getElementById("rb-canvas-train");

    renderPad(document.getElementById("rb-pad"), "main");
    renderTutorial();
    renderLatihan();
    renderHud();
    renderRank();
    terapkanTab();
    pasangKanvas(canvasMain, "main");
    pasangKanvas(canvasTrain, "train");

    elApp.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-rb-tab]");
      if (tab) {
        pindahTab(tab.dataset.rbTab);
        return;
      }
      const arah = e.target.closest("[data-rb-arah]");
      if (arah) {
        gantiArah(Number(arah.dataset.rbArah));
        return;
      }
      const face = e.target.closest("[data-rb-face]");
      if (face) {
        const sumber = face.dataset.rbFor === "train" ? "train" : "main";
        putarSisi(face.dataset.rbFace, R.arah, sumber);
        return;
      }
      const cam = e.target.closest("[data-rb-cam]");
      if (cam) {
        orbitArah(cam.dataset.rbCam);
        sfx("buttonClick");
        return;
      }
      const act = e.target.closest("[data-rb-action]");
      if (act) {
        const aksi = act.dataset.rbAction;
        if (aksi === "scramble") {
          scrambleMain();
          sfx("buttonClick");
        } else if (aksi === "undo") {
          undoMain();
        } else if (aksi === "reset") {
          resetMain();
          sfx("resetSound");
          tampilNotice("Kubus direset. Tekan Acak buat mulai tantangan.");
        } else if (aksi === "close-over") {
          if (elOver) elOver.hidden = true;
          sfx("modalClose");
        }
        return;
      }
      const tut = e.target.closest("[data-rb-tut]");
      if (tut) {
        R.tutMode = tut.dataset.rbTut === "cfop" ? "cfop" : "pemula";
        renderTutorial();
        sfx("tabSwitch");
        return;
      }
      const coba = e.target.closest("[data-rb-coba]");
      if (coba) {
        mulaiLatihanRumus(coba.dataset.rbCoba, coba.dataset.rbNama);
        return;
      }
      const alg = e.target.closest("[data-rb-alg]");
      if (alg) {
        const pilih = ALGS.find((a) => a.id === alg.dataset.rbAlg);
        if (pilih) pilihAlg(pilih);
        return;
      }
      const train = e.target.closest("[data-rb-train]");
      if (train) {
        const aksi = train.dataset.rbTrain;
        if (aksi === "putar") {
          putarRumusLatihan();
        } else if (aksi === "reset") {
          resetLatihan();
          sfx("resetSound");
        } else if (aksi === "sembunyi") {
          R.train.showAlg = !R.train.showAlg;
          renderPanelLatihan();
          sfx("buttonClick");
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (!R.viewOpen) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      if (e.target && e.target.isContentEditable) return;
      if (R.tab !== "main" && R.tab !== "latihan") return;
      const sumber = R.tab;

      const key = String(e.key || "").toLowerCase();
      if ("udlrfb".includes(key) && key.length === 1) {
        putarSisi(key.toUpperCase(), e.shiftKey ? -1 : 1, sumber);
        e.preventDefault();
        return;
      }
      if (e.key === "Backspace") {
        if (sumber === "main") undoMain();
        e.preventDefault();
        return;
      }
      if (e.key === " " || e.code === "Space") {
        if (sumber === "main") {
          scrambleMain();
          e.preventDefault();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        orbitArah("left");
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        orbitArah("right");
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        orbitArah("up");
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        orbitArah("down");
        e.preventDefault();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) jedaTimer();
      else if (R.viewOpen && R.tab === "main" && R.main.started && !R.main.solved) lanjutTimer();
    });

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (R.viewOpen) gambarKedua();
      }, 120);
    });
  }

  window.rubikBuka = buka;
  window.rubikTutup = tutup;
  window.rubikAkunBerubah = akunBerubah;
  window.rubikRingkas = ringkas;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
