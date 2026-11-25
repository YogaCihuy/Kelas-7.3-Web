// kisi-kisi.js
// Tab Kisi Kisi: kategori + materi PDF, rangkuman & kuis AI (Gemini).
// PDF disimpan di Firestore per potongan (tanpa Storage/Blaze).
// Key Gemini disimpan di perangkat admin dan dibagikan lewat aiConfig/kelas73
// supaya AI Chat bisa dipakai semua siswa tanpa isi key sendiri.
(() => {
  "use strict";

  const ADMIN_ABSEN = 29;
  const CHUNK_CHARS = 700000; // aman di bawah batas 1 MB per dokumen Firestore
  const MAX_BYTES = 6 * 1024 * 1024;
  const KEY_STORE = "kelas73-kisi-gemini-key";
  const MODEL_STORE = "kelas73-kisi-gemini-model";
  const DEFAULT_MODEL = "gemini-flash-latest";
  const AI_COL = "aiConfig";
  const AI_DOC = "kelas73";

  const state = {
    panel: null,
    adminBar: null,
    locked: null,
    katView: null,
    materiView: null,
    daftarKat: null,
    daftarMateri: null,
    materiHead: null,
    materiKosong: null,
    kosong: null,
    loading: null,
    modalRoot: null,
    toastEl: null,
    kategori: [],
    materi: [],
    catAktif: null,
    memuat: false,
    terakhirMuat: 0,
    berkasCache: new Map(),
    objUrl: "",
    kuis: null,
    busy: false,
    modalJenis: "",
    aiCek: "",
  };

  const el = {};

  // Key bersama: perangkat admin jadi sumber, siswa cuma membaca.
  let publikKey = "";
  let publikModel = "";
  let publikDimuat = false;
  let publikProses = null;

  /* ---------------- util ---------------- */

  function fs() {
    try {
      return typeof db !== "undefined" ? db : null;
    } catch (err) {
      return null;
    }
  }

  function akun() {
    try {
      return typeof currentUser !== "undefined" ? currentUser : null;
    } catch (err) {
      return null;
    }
  }

  function isAdmin() {
    const user = akun();
    return !!user && Number(user.absen) === ADMIN_ABSEN;
  }

  function esc(nilai) {
    return String(nilai == null ? "" : nilai)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function idBaru(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function ukuranTeks(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
  }

  function tanggalTeks(ms) {
    const n = Number(ms);
    if (!n) return "";
    try {
      return new Date(n).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    } catch (err) {
      return "";
    }
  }

  function potong(teks, maks) {
    const t = String(teks == null ? "" : teks).trim();
    return t.length > maks ? t.slice(0, maks) : t;
  }

  function pesanErr(err) {
    const pesan = String((err && err.message) || err || "Terjadi kesalahan.");
    if (/permission|insufficient/i.test(pesan)) return "Firestore menolak akses. Pastikan rules Kisi Kisi sudah dipublish.";
    if (/network|offline|unavailable|failed to fetch|load failed/i.test(pesan)) return "Koneksi bermasalah. Coba lagi.";
    return pesan;
  }

  function toastK(pesan, jenis) {
    if (!state.toastEl) return;
    const t = state.toastEl;
    t.textContent = pesan;
    t.className = `kisi-toast is-${jenis || "info"}`;
    t.hidden = false;
    window.clearTimeout(toastK._t);
    toastK._t = window.setTimeout(() => { t.hidden = true; }, 3200);
  }

  /* ---------------- muat data ---------------- */

  async function muatData(paksa) {
    const store = fs();
    if (!store) {
      toastK("Database belum siap.", "error");
      return;
    }
    if (state.memuat) return;
    if (!paksa && state.terakhirMuat && Date.now() - state.terakhirMuat < 15000) return;
    state.memuat = true;
    document.getElementById("kisi-loading").hidden = false;
    try {
      const [katSnap, materiSnap] = await Promise.all([
        store.collection("kisiKategori").get(),
        store.collection("kisiMateri").get(),
      ]);
      state.kategori = katSnap.docs
        .map((d) => Object.assign({ id: d.id }, d.data()))
        .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      state.materi = materiSnap.docs
        .map((d) => Object.assign({ id: d.id }, d.data()))
        .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      state.terakhirMuat = Date.now();
      const locked = document.getElementById("kisi-locked");
      if (locked) { locked.textContent = ""; locked.hidden = true; }
      if (state.catAktif && !state.kategori.some((k) => k.id === state.catAktif)) state.catAktif = null;
    } catch (err) {
      document.getElementById("kisi-locked").hidden = false;
      document.getElementById("kisi-locked").textContent = pesanErr(err);
    } finally {
      state.memuat = false;
      document.getElementById("kisi-loading").hidden = true;
      render();
    }
  }

  function materiKategori(catId) {
    return state.materi.filter((m) => m.kategoriId === catId);
  }

  function cariMateri(id) {
    return state.materi.find((m) => m.id === id) || null;
  }

  /* ---------------- render ---------------- */

  function render() {
    if (!el.panel) return;
    const admin = isAdmin();
    el.adminBar.hidden = !admin;
    el.locked.hidden = el.locked.textContent ? false : true;

    if (state.catAktif) {
      el.katView.hidden = true;
      el.materiView.hidden = false;
      renderMateri();
    } else {
      el.katView.hidden = false;
      el.materiView.hidden = true;
      renderKategori();
    }
  }

  function renderKategori() {
    const daftar = state.kategori;
    el.kosong.hidden = !state.terakhirMuat || daftar.length > 0;
    if (!daftar.length) {
      el.daftarKat.innerHTML = "";
      return;
    }
    const admin = isAdmin();
    el.daftarKat.innerHTML = daftar.map((kat) => {
      const isi = materiKategori(kat.id);
      const rangkuman = isi.filter((m) => m.rangkuman).length;
      const kuis = isi.filter((m) => Array.isArray(m.kuis) && m.kuis.length).length;
      return `
        <article class="kisi-kategori-card">
          <button type="button" class="kisi-kategori-main" data-kisi-buka="${esc(kat.id)}">
            <span class="kisi-kategori-icon" aria-hidden="true">📚</span>
            <span class="kisi-kategori-body">
              <strong>${esc(kat.nama)}</strong>
              <small>${isi.length} materi · ${rangkuman} rangkuman · ${kuis} kuis</small>
            </span>
            <span class="kisi-chevron" aria-hidden="true">›</span>
          </button>
          ${admin ? `
            <div class="kisi-tools">
              <button type="button" class="kisi-tool" data-kisi-edit-kategori="${esc(kat.id)}">Ubah</button>
              <button type="button" class="kisi-tool is-danger" data-kisi-hapus-kategori="${esc(kat.id)}">Hapus</button>
            </div>` : ""}
        </article>`;
    }).join("");
  }

  function renderMateri() {
    const kat = state.kategori.find((k) => k.id === state.catAktif);
    if (!kat) {
      state.catAktif = null;
      render();
      return;
    }
    const admin = isAdmin();
    const isi = materiKategori(kat.id);
    el.materiHead.innerHTML = `
      <div class="kisi-materi-head-row">
        <div>
          <span class="kisi-kicker">Kategori</span>
          <h3>${esc(kat.nama)}</h3>
          <small>${isi.length} materi</small>
        </div>
        ${admin ? `<button type="button" class="btn-primary kisi-btn" data-kisi-tambah-materi="${esc(kat.id)}">+ Materi</button>` : ""}
      </div>`;
    el.materiKosong.hidden = isi.length > 0;
    el.daftarMateri.innerHTML = isi.map((m) => renderMateriCard(m, admin)).join("");
  }

  function renderMateriCard(m, admin) {
    const adaRangkuman = !!String(m.rangkuman || "").trim();
    const jumlahSoal = Array.isArray(m.kuis) ? m.kuis.length : 0;
    const aiGagal = m.aiStatus === "error" && m.aiPesan;
    return `
      <article class="kisi-materi-card">
        <div class="kisi-materi-top">
          <span class="kisi-pdf-badge" aria-hidden="true">PDF</span>
          <div class="kisi-materi-info">
            <strong>${esc(m.judul)}</strong>
            <small>${esc(m.namaFile || "file.pdf")} · ${ukuranTeks(m.ukuran)} · ${esc(tanggalTeks(m.createdAt))}</small>
            ${m.catatan ? `<p class="kisi-catatan">${esc(m.catatan)}</p>` : ""}
            <div class="kisi-badges">
              <span class="kisi-badge ${adaRangkuman ? "is-ada" : ""}">${adaRangkuman ? "Rangkuman siap" : "Belum ada rangkuman"}</span>
              <span class="kisi-badge ${jumlahSoal ? "is-ada" : ""}">${jumlahSoal ? `Kuis ${jumlahSoal} soal` : "Belum ada kuis"}</span>
              ${aiGagal ? `<span class="kisi-badge is-error" title="${esc(m.aiPesan)}">AI gagal</span>` : ""}
            </div>
          </div>
        </div>
        <div class="kisi-materi-actions">
          <button type="button" class="kisi-act is-pdf" data-kisi-pdf="${esc(m.id)}">Buka PDF</button>
          <button type="button" class="kisi-act ${adaRangkuman ? "" : "is-off"}" data-kisi-rangkuman="${esc(m.id)}">Rangkuman</button>
          <button type="button" class="kisi-act ${jumlahSoal ? "" : "is-off"}" data-kisi-kuis="${esc(m.id)}">Kuis Soal</button>
        </div>
        ${admin ? `
          <div class="kisi-tools">
            <button type="button" class="kisi-tool" data-kisi-ai="${esc(m.id)}">Buat/ulang AI</button>
            <button type="button" class="kisi-tool" data-kisi-edit-materi="${esc(m.id)}">Ubah</button>
            <button type="button" class="kisi-tool is-danger" data-kisi-hapus-materi="${esc(m.id)}">Hapus</button>
          </div>` : ""}
      </article>`;
  }

  /* ---------------- modal ---------------- */

  function bukaModal(isi, opsi) {
    if (!state.modalRoot) return;
    state.modalRoot.innerHTML = `
      <div class="modal-overlay kisi-overlay">
        <div class="modal-box kisi-modal ${opsi && opsi.lebar ? "kisi-modal-wide" : ""}" role="dialog" aria-modal="true">
          ${opsi && opsi.tanpaTutup ? "" : `<button class="modal-close" type="button" data-kisi-close aria-label="Tutup">&times;</button>`}
          ${isi}
        </div>
      </div>`;
  }

  function tutupModal() {
    if (state.modalRoot) state.modalRoot.innerHTML = "";
    state.kuis = null;
    state.modalJenis = "";
    if (state.objUrl) {
      try { URL.revokeObjectURL(state.objUrl); } catch (err) { /* abaikan */ }
      state.objUrl = "";
    }
  }

  /* ---------------- kategori ---------------- */

  function formKategori(kat) {
    const ubah = !!kat;
    bukaModal(`
      <form class="kisi-form" data-kisi-form="kategori" data-kisi-id="${ubah ? esc(kat.id) : ""}">
        <h3>${ubah ? "Ubah Kategori" : "Kategori Baru"}</h3>
        <label class="kisi-field">
          <span>Nama kategori</span>
          <input name="nama" maxlength="80" required placeholder="Contoh: Kisi Kisi ASAS Kelas 7" value="${ubah ? esc(kat.nama) : ""}">
        </label>
        <div class="kisi-form-actions">
          <button type="button" class="btn-secondary" data-kisi-close>Batal</button>
          <button type="submit" class="btn-primary">Simpan</button>
        </div>
      </form>`);
    const input = state.modalRoot.querySelector("[name=nama]");
    if (input) input.focus();
  }

  async function simpanKategori(form) {
    const id = form.getAttribute("data-kisi-id");
    const nama = potong(form.nama.value, 80);
    if (!nama) return toastK("Nama kategori wajib diisi.", "warn");
    const store = fs();
    if (!store) return;
    try {
      if (id) {
        await store.collection("kisiKategori").doc(id).set({ nama }, { merge: true });
      } else {
        const urutan = state.kategori.reduce((n, k) => Math.max(n, Number(k.urutan) || 0), 0) + 1;
        await store.collection("kisiKategori").doc(idBaru("kat")).set({
          nama,
          urutan,
          dibuatOleh: ADMIN_ABSEN,
          createdAt: Date.now(),
        });
      }
      tutupModal();
      toastK("Kategori tersimpan.", "ok");
      await muatData(true);
    } catch (err) {
      toastK(pesanErr(err), "error");
    }
  }

  async function hapusKategori(id) {
    const kat = state.kategori.find((k) => k.id === id);
    if (!kat) return;
    if (materiKategori(id).length) {
      toastK("Kategori masih ada materi. Hapus materinya dulu.", "warn");
      return;
    }
    if (!window.confirm(`Hapus kategori "${kat.nama}"?`)) return;
    try {
      await fs().collection("kisiKategori").doc(id).delete();
      toastK("Kategori dihapus.", "ok");
      await muatData(true);
    } catch (err) {
      toastK(pesanErr(err), "error");
    }
  }

  /* ---------------- materi ---------------- */

  function formMateri(catId, materi) {
    const ubah = !!materi;
    const keyAda = !!apiKey();
    bukaModal(`
      <form class="kisi-form" data-kisi-form="materi" data-kisi-kategori="${esc(catId)}" data-kisi-id="${ubah ? esc(materi.id) : ""}">
        <h3>${ubah ? "Ubah Materi" : "Materi Baru"}</h3>
        <label class="kisi-field">
          <span>Judul materi</span>
          <input name="judul" maxlength="120" required placeholder="Contoh: Ringkasan Bab 1-3" value="${ubah ? esc(materi.judul) : ""}">
        </label>
        ${ubah ? "" : `
        <label class="kisi-field">
          <span>File PDF (maks 6 MB)</span>
          <input name="file" type="file" accept="application/pdf,.pdf" required>
        </label>`}
        <label class="kisi-field">
          <span>Catatan kecil (opsional)</span>
          <textarea name="catatan" maxlength="300" rows="2" placeholder="Contoh: fokus bab 2">${ubah ? esc(materi.catatan || "") : ""}</textarea>
        </label>
        ${ubah ? "" : `
        <div class="kisi-ai-opsi">
          <label class="kisi-check"><input type="checkbox" name="rangkuman" ${keyAda ? "checked" : "disabled"}> Buat rangkuman AI</label>
          <label class="kisi-check"><input type="checkbox" name="kuis" ${keyAda ? "checked" : "disabled"}> Buat kuis AI</label>
          <label class="kisi-field kisi-field-inline">
            <span>Jumlah soal</span>
            <select name="jumlah">
              <option value="5">5 soal</option>
              <option value="10" selected>10 soal</option>
              <option value="15">15 soal</option>
            </select>
          </label>
          <p class="kisi-note">${keyAda ? "Rangkuman & kuis dibuat di perangkat ini lalu disimpan untuk semua siswa." : "API key Gemini belum diisi. PDF tetap tersimpan; rangkuman/kuis bisa dibuat nanti lewat Pengaturan AI."}</p>
        </div>`}
        <div class="kisi-form-actions">
          <button type="button" class="btn-secondary" data-kisi-close>Batal</button>
          <button type="submit" class="btn-primary">${ubah ? "Simpan" : "Upload"}</button>
        </div>
      </form>`);
  }

  function progressModal(judul) {
    bukaModal(`
      <div class="kisi-progress">
        <h3 data-kisi-progress-judul>${esc(judul)}</h3>
        <div class="kisi-progress-bar"><i data-kisi-progress-bar style="width:0%"></i></div>
        <p class="kisi-progress-text" data-kisi-progress-text>Menyiapkan…</p>
      </div>`, { tanpaTutup: true });
  }

  function setProgress(teks, persen) {
    const t = state.modalRoot.querySelector("[data-kisi-progress-text]");
    const b = state.modalRoot.querySelector("[data-kisi-progress-bar]");
    if (t) t.textContent = teks;
    if (b) b.style.width = `${Math.max(0, Math.min(100, Math.round(persen)))}%`;
  }

  function bacaFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]*,/, ""));
      reader.onerror = () => reject(new Error("Gagal membaca file."));
      reader.readAsDataURL(file);
    });
  }

  async function uploadMateri(catId, form) {
    if (state.busy) return;
    const store = fs();
    if (!store) return;
    const file = form.file && form.file.files ? form.file.files[0] : null;
    if (!file) return toastK("Pilih file PDF dulu.", "warn");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return toastK("File harus PDF.", "warn");
    if (file.size > MAX_BYTES) return toastK("PDF maksimal 6 MB.", "warn");
    const judul = potong(form.judul.value, 120);
    if (!judul) return toastK("Judul wajib diisi.", "warn");
    const catatan = potong(form.catatan.value, 300);
    const mauRangkuman = !!(form.rangkuman && form.rangkuman.checked);
    const mauKuis = !!(form.kuis && form.kuis.checked);
    const jumlahSoal = Number((form.jumlah && form.jumlah.value) || 10);
    const id = idBaru("materi");

    state.busy = true;
    progressModal("Menyimpan materi");
    try {
      setProgress("Membaca file PDF…", 4);
      const b64 = await bacaFileBase64(file);
      const bagian = Math.ceil(b64.length / CHUNK_CHARS);
      await store.collection("kisiMateri").doc(id).set({
        kategoriId: catId,
        judul,
        catatan,
        namaFile: potong(file.name, 120),
        ukuran: file.size,
        bagian,
        rangkuman: "",
        kuis: [],
        aiModel: "",
        aiAt: 0,
        aiStatus: "none",
        aiPesan: "",
        dibuatOleh: ADMIN_ABSEN,
        createdAt: Date.now(),
      });
      for (let i = 0; i < bagian; i += 1) {
        const potongan = b64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS);
        await store.collection("kisiBerkas").doc(`${id}_${i}`).set({
          materiId: id,
          i,
          data: potongan,
          createdAt: Date.now(),
        });
        setProgress(`Mengunggah PDF ${i + 1}/${bagian}…`, 5 + ((i + 1) / bagian) * 55);
      }
      state.berkasCache.set(id, b64);

      const materi = {
        id,
        kategoriId: catId,
        judul,
        catatan,
        namaFile: file.name,
        ukuran: file.size,
        bagian,
        rangkuman: "",
        kuis: [],
        aiModel: "",
        aiAt: 0,
        aiStatus: "none",
        aiPesan: "",
        dibuatOleh: ADMIN_ABSEN,
        createdAt: Date.now(),
      };

      let gagalAI = "";
      if (mauRangkuman || mauKuis) {
        try {
          if (mauRangkuman) {
            setProgress("AI menyusun rangkuman…", 65);
            materi.rangkuman = await buatRangkuman(id, b64);
          }
          if (mauKuis) {
            setProgress("AI menyusun soal kuis…", 85);
            materi.kuis = await buatKuis(id, b64, jumlahSoal);
          }
          materi.aiModel = modelAI();
          materi.aiAt = Date.now();
          materi.aiStatus = "ok";
        } catch (err) {
          gagalAI = pesanErr(err);
          materi.aiStatus = "error";
          materi.aiPesan = potong(gagalAI, 200);
        }
      }

      setProgress("Menyimpan hasil…", 97);
      await store.collection("kisiMateri").doc(id).set(
        {
          rangkuman: potong(materi.rangkuman, 30000),
          kuis: materi.kuis,
          aiModel: materi.aiModel,
          aiAt: materi.aiAt,
          aiStatus: materi.aiStatus,
          aiPesan: materi.aiPesan,
        },
        { merge: true }
      );

      tutupModal();
      if (gagalAI) toastK(`PDF tersimpan, tapi AI gagal: ${gagalAI}`, "warn");
      else toastK("Materi tersimpan.", "ok");
      state.catAktif = catId;
      await muatData(true);
    } catch (err) {
      tutupModal();
      toastK(pesanErr(err), "error");
    } finally {
      state.busy = false;
    }
  }

  async function simpanUbahMateri(form) {
    const id = form.getAttribute("data-kisi-id");
    const judul = potong(form.judul.value, 120);
    if (!judul) return toastK("Judul wajib diisi.", "warn");
    try {
      await fs().collection("kisiMateri").doc(id).set(
        { judul, catatan: potong(form.catatan.value, 300) },
        { merge: true }
      );
      tutupModal();
      toastK("Materi diperbarui.", "ok");
      await muatData(true);
    } catch (err) {
      toastK(pesanErr(err), "error");
    }
  }

  async function hapusMateri(id) {
    const materi = cariMateri(id);
    if (!materi) return;
    if (!window.confirm(`Hapus "${materi.judul}" beserta PDF-nya?`)) return;
    const store = fs();
    try {
      const bagian = Number(materi.bagian) || 0;
      for (let i = 0; i < bagian; i += 1) {
        try {
          await store.collection("kisiBerkas").doc(`${id}_${i}`).delete();
        } catch (err) {
          /* biarkan lanjut, dokumen utama tetap dihapus */
        }
      }
      await store.collection("kisiMateri").doc(id).delete();
      state.berkasCache.delete(id);
      toastK("Materi dihapus.", "ok");
      await muatData(true);
    } catch (err) {
      toastK(pesanErr(err), "error");
    }
  }

  /* ---------------- berkas PDF ---------------- */

  async function bacaBerkas(materi) {
    if (state.berkasCache.has(materi.id)) return state.berkasCache.get(materi.id);
    const bagian = Number(materi.bagian) || 0;
    if (!bagian) throw new Error("Berkas PDF tidak ditemukan.");
    const store = fs();
    const jobs = [];
    for (let i = 0; i < bagian; i += 1) {
      jobs.push(store.collection("kisiBerkas").doc(`${materi.id}_${i}`).get());
    }
    const snaps = await Promise.all(jobs);
    const potongan = [];
    snaps.forEach((snap, i) => {
      if (!snap.exists) return;
      potongan.push({ i: Number(snap.data().i) || i, data: String(snap.data().data || "") });
    });
    potongan.sort((a, b) => a.i - b.i);
    if (potongan.length !== bagian) throw new Error("Berkas PDF tidak lengkap. Coba upload ulang.");
    const b64 = potongan.map((p) => p.data).join("");
    state.berkasCache.set(materi.id, b64);
    return b64;
  }

  function blobUrlPdf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  }

  async function bukaPdf(materi) {
    toastK("Menyiapkan PDF…", "info");
    try {
      const b64 = await bacaBerkas(materi);
      if (state.objUrl) {
        try { URL.revokeObjectURL(state.objUrl); } catch (err) { /* abaikan */ }
      }
      state.objUrl = blobUrlPdf(b64);
      bukaModal(`
        <div class="kisi-viewer">
          <h3>${esc(materi.judul)}</h3>
          <iframe class="kisi-viewer-frame" src="${state.objUrl}" title="PDF ${esc(materi.judul)}"></iframe>
          <p class="kisi-viewer-note">Di HP, PDF kadang cuma bisa dibuka di aplikasi PDF. Pakai tombol di bawah kalau layar kosong.</p>
          <div class="kisi-form-actions">
            <button type="button" class="btn-secondary" data-kisi-close>Tutup</button>
            <a class="btn-primary" href="${state.objUrl}" target="_blank" rel="noopener">Buka di Tab Baru</a>
          </div>
        </div>`, { lebar: true });
    } catch (err) {
      toastK(pesanErr(err), "error");
    }
  }

  /* ---------------- rangkuman ---------------- */

  function rangkumanHtml(teks) {
    const baris = String(teks || "").split(/\r?\n/);
    const bagian = [];
    let list = [];
    const tutupList = () => {
      if (list.length) {
        bagian.push(`<ul>${list.join("")}</ul>`);
        list = [];
      }
    };
    baris.forEach((raw) => {
      const t = raw.trim();
      if (!t) return;
      let aman = esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      if (/^[-•*]\s+/.test(t)) {
        list.push(`<li>${aman.replace(/^[-•*]\s+/, "")}</li>`);
        return;
      }
      tutupList();
      if (/^#{1,4}\s+/.test(t)) {
        bagian.push(`<h4>${aman.replace(/^#{1,4}\s+/, "")}</h4>`);
        return;
      }
      bagian.push(`<p>${aman}</p>`);
    });
    tutupList();
    return bagian.join("");
  }

  function bukaRangkuman(materi) {
    const teks = String(materi.rangkuman || "").trim();
    if (!teks) {
      toastK("Rangkuman belum dibuat untuk materi ini.", "warn");
      return;
    }
    bukaModal(`
      <div class="kisi-rangkuman">
        <h3>Rangkuman: ${esc(materi.judul)}</h3>
        ${materi.aiAt ? `<p class="kisi-ai-meta">Dibuat ${esc(tanggalTeks(materi.aiAt))} · ${esc(materi.aiModel || "Gemini")}</p>` : ""}
        <div class="kisi-rangkuman-body">${rangkumanHtml(teks)}</div>
        <p class="kisi-viewer-note">Rangkuman AI bisa keliru. Cocokkan lagi dengan PDF aslinya.</p>
        <div class="kisi-form-actions">
          <button type="button" class="btn-secondary" data-kisi-close>Tutup</button>
          <button type="button" class="btn-primary" data-kisi-pdf="${esc(materi.id)}">Buka PDF</button>
        </div>
      </div>`, { lebar: true });
  }

  /* ---------------- kuis ---------------- */

  function bukaKuis(materi) {
    const soal = Array.isArray(materi.kuis) ? materi.kuis : [];
    if (!soal.length) {
      toastK("Kuis belum dibuat untuk materi ini.", "warn");
      return;
    }
    state.kuis = { materi, soal, idx: 0, pilih: null, benar: 0, selesai: false };
    renderKuis();
  }

  function renderKuis() {
    const k = state.kuis;
    if (!k) return;
    if (k.selesai) {
      const total = k.soal.length;
      const persen = Math.round((k.benar / total) * 100);
      const emoji = persen >= 80 ? "🏆" : persen >= 50 ? "👍" : "💪";
      bukaModal(`
        <div class="kisi-kuis kisi-kuis-selesai">
          <span class="kisi-kuis-emoji" aria-hidden="true">${emoji}</span>
          <h3>Kuis selesai</h3>
          <p class="kisi-kuis-skor"><strong>${k.benar}</strong> / ${total} benar (${persen}%)</p>
          <p class="kisi-note">${persen >= 80 ? "Mantap, materi ini sudah kamu kuasai." : "Baca rangkuman atau PDF lagi, lalu ulangi kuisnya."}</p>
          <div class="kisi-form-actions">
            <button type="button" class="btn-secondary" data-kisi-close>Tutup</button>
            <button type="button" class="btn-primary" data-kisi-ulang-kuis="${esc(k.materi.id)}">Ulangi</button>
          </div>
        </div>`);
      return;
    }
    const s = k.soal[k.idx];
    const opsi = (s.o || []).map((teks, i) => {
      let kelas = "";
      if (k.pilih !== null) {
        if (i === s.a) kelas = "is-benar";
        else if (i === k.pilih) kelas = "is-salah";
      }
      return `<button type="button" class="kisi-opsi ${kelas}" data-kisi-jawab="${i}" ${k.pilih !== null ? "disabled" : ""}>
        <span class="kisi-opsi-huruf">${"ABCD"[i] || i + 1}</span>
        <span>${esc(teks)}</span>
      </button>`;
    }).join("");
    bukaModal(`
      <div class="kisi-kuis">
        <div class="kisi-kuis-top">
          <span class="kisi-kicker">Kuis · ${esc(state.kuis.materi.judul)}</span>
          <span class="kisi-kuis-progress">${k.idx + 1}/${k.soal.length}</span>
        </div>
        <h3 class="kisi-soal">${esc(s.q)}</h3>
        <div class="kisi-opsi-list">${opsi}</div>
        ${k.pilih !== null ? `
          <div class="kisi-jawaban ${k.pilih === s.a ? "is-benar" : "is-salah"}">
            <strong>${k.pilih === s.a ? "Benar!" : "Belum tepat."}</strong>
            ${s.e ? `<span>${esc(s.e)}</span>` : ""}
          </div>
          <div class="kisi-form-actions">
            <button type="button" class="btn-primary" data-kisi-lanjut>${k.idx + 1 >= k.soal.length ? "Lihat Hasil" : "Soal Berikutnya"}</button>
          </div>` : ""}
      </div>`);
  }

  function jawabKuis(i) {
    const k = state.kuis;
    if (!k || k.pilih !== null) return;
    const s = k.soal[k.idx];
    k.pilih = i;
    if (i === s.a) k.benar += 1;
    renderKuis();
  }

  function lanjutKuis() {
    const k = state.kuis;
    if (!k) return;
    if (k.idx + 1 >= k.soal.length) {
      k.selesai = true;
    } else {
      k.idx += 1;
      k.pilih = null;
    }
    renderKuis();
  }

  /* ---------------- AI ---------------- */

  function bersihKey(teks) {
    return String(teks == null ? "" : teks).replace(/\s+/g, "");
  }

  function keyLokal() {
    try { return bersihKey(localStorage.getItem(KEY_STORE)); } catch (err) { return ""; }
  }

  function modelLokal() {
    try { return localStorage.getItem(MODEL_STORE) || ""; } catch (err) { return ""; }
  }

  function apiKey() {
    // Admin pakai key perangkatnya; siswa selalu pakai key bersama dari Kisi Kisi.
    if (isAdmin()) return keyLokal() || publikKey;
    return publikKey;
  }

  function modelAI() {
    if (isAdmin()) return modelLokal() || publikModel || DEFAULT_MODEL;
    return publikModel || DEFAULT_MODEL;
  }

  function refPublik() {
    const store = fs();
    return store ? store.collection(AI_COL).doc(AI_DOC) : null;
  }

  // Siswa memanggil ini sekali sebelum AI Chat dipakai.
  function muatPublik(paksa) {
    if (publikProses && !paksa) return publikProses;
    const ref = refPublik();
    if (!ref) {
      publikDimuat = true;
      return Promise.resolve(false);
    }
    publikProses = (async () => {
      try {
        const snap = await ref.get();
        const data = snap && snap.exists ? snap.data() || {} : {};
        publikKey = bersihKey(data.geminiKey);
        publikModel = String(data.geminiModel || "");
        publikDimuat = true;
        return !!apiKey();
      } catch (err) {
        publikDimuat = true;
        return !!apiKey();
      } finally {
        publikProses = null;
      }
    })();
    return publikProses;
  }

  async function kirimPublik() {
    if (!isAdmin()) return false;
    const key = keyLokal() || publikKey;
    const ref = refPublik();
    if (!key || !ref) return false;
    try {
      await ref.set({
        geminiKey: key,
        geminiModel: modelAI(),
        updatedAt: Date.now(),
        updatedBy: ADMIN_ABSEN,
      });
      publikKey = key;
      publikModel = modelAI();
      publikDimuat = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  async function matikanPublik() {
    if (!isAdmin()) return false;
    const ref = refPublik();
    if (!ref) return false;
    try {
      await ref.set({
        geminiKey: "",
        geminiModel: modelLokal() || DEFAULT_MODEL,
        updatedAt: Date.now(),
        updatedBy: ADMIN_ABSEN,
      });
      publikKey = "";
      publikModel = modelLokal() || DEFAULT_MODEL;
      publikDimuat = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function pesanGemini(status, data) {
    const asli = data && data.error && data.error.message ? String(data.error.message) : "";
    if (status === 400 && /api key/i.test(asli)) return "API key Gemini ditolak Google. Paste ulang key-nya di Pengaturan AI.";
    if (status === 401) return `Key ditolak Google (401). Pastikan key masih aktif.${asli ? ` (${asli})` : ""}`;
    if (status === 403) return "API key tidak punya akses. Pastikan Gemini API aktif di Google AI Studio.";
    if (status === 404) return `Model AI sudah tidak tersedia (404).${asli ? ` (${asli})` : ""}`;
    if (status === 429) return "Kuota Gemini habis / terlalu sering. Tunggu sebentar lalu coba lagi.";
    if (status >= 500) return "Server Gemini sedang sibuk. Coba lagi nanti.";
    return asli || `Gemini error (${status}).`;
  }

  async function kirimGemini(model, key, isi) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isi),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function panggilGemini(parts, opsi) {
    if (!apiKey() && !publikDimuat) await muatPublik();
    const key = apiKey();
    if (!key) throw new Error("AI belum aktif. Admin belum memasang key Gemini di Kisi Kisi.");
    const contents = [];
    if (opsi && Array.isArray(opsi.riwayat)) {
      opsi.riwayat.forEach((m) => {
        if (!m || !m.teks) return;
        contents.push({ role: m.role === "model" ? "model" : "user", parts: [{ text: String(m.teks) }] });
      });
    }
    contents.push({ role: "user", parts });
    const isi = {
      contents,
      generationConfig: Object.assign(
        {
          temperature: opsi && typeof opsi.temperature === "number" ? opsi.temperature : 0.35,
          maxOutputTokens: (opsi && opsi.maxOutputTokens) || 8192,
        },
        opsi && opsi.json ? { responseMimeType: "application/json" } : {}
      ),
    };
    if (opsi && opsi.system) isi.systemInstruction = { parts: [{ text: String(opsi.system) }] };
    let model = (opsi && opsi.model) || modelAI();
    let hasil = await kirimGemini(model, key, isi);
    if (!hasil.res.ok && hasil.res.status === 404 && model !== DEFAULT_MODEL) {
      // Model lama bisa pensiun kapan saja; coba sekali pakai alias terbaru.
      model = DEFAULT_MODEL;
      hasil = await kirimGemini(model, key, isi);
      if (hasil.res.ok) {
        try { localStorage.setItem(MODEL_STORE, model); } catch (err) { /* abaikan */ }
      }
    }
    if (!hasil.res.ok) throw new Error(pesanGemini(hasil.res.status, hasil.data));
    const teks = ((hasil.data.candidates && hasil.data.candidates[0] && hasil.data.candidates[0].content && hasil.data.candidates[0].content.parts) || [])
      .map((p) => p.text || "")
      .join("")
      .trim();
    if (!teks) throw new Error("AI tidak mengembalikan jawaban. Coba lagi.");
    state.modelTerakhir = model;
    return teks;
  }

  async function daftarModelAI(key) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(pesanGemini(res.status, data));
    return (data.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.indexOf("generateContent") >= 0)
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  }

  function bagianPdf(b64) {
    return { inline_data: { mime_type: "application/pdf", data: b64 } };
  }

  const PROMPT_RANGKUMAN = [
    "Kamu guru SMP di Indonesia. Baca file PDF kisi-kisi berikut dengan teliti.",
    "Buat RANGKUMAN belajar dalam bahasa Indonesia yang padat, urut dari bagian paling atas sampai paling bawah dokumen.",
    "Aturan:",
    "- Maksimal 30 poin, tiap poin 1-2 baris.",
    "- Dahulukan materi yang paling penting dan paling sering keluar sebagai soal atau paling menjebak; awali poin itu dengan 'PENTING:'.",
    "- Tebalkan istilah kunci dengan **dua bintang**.",
    "- Sebut nomor halaman atau bagian kalau terlihat.",
    "- Jangan mengarang materi yang tidak ada di PDF.",
    "Keluaran: baris-baris yang diawali '- '.",
  ].join("\n");

  function promptKuis(jumlah) {
    return [
      "Kamu guru SMP di Indonesia. Dari file PDF kisi-kisi di atas, buat kuis pilihan ganda.",
      `Jumlah soal: ${jumlah}. Bahasa Indonesia, tingkat kesulitan campuran, sesuai isi PDF saja.`,
      "Balas HANYA JSON valid (tanpa penjelasan di luar JSON) dengan bentuk:",
      '[{"q":"pertanyaan","o":["pilihan A","pilihan B","pilihan C","pilihan D"],"a":0,"e":"penjelasan singkat"}]',
      "Keterangan: a = indeks jawaban benar (0-3). e = alasan singkat. Jangan pakai markdown.",
    ].join("\n");
  }

  async function buatRangkuman(id, b64) {
    const teks = await panggilGemini([bagianPdf(b64), { text: PROMPT_RANGKUMAN }]);
    const hasil = potong(teks, 30000);
    await fs().collection("kisiMateri").doc(id).set({ rangkuman: hasil }, { merge: true });
    const materi = cariMateri(id);
    if (materi) materi.rangkuman = hasil;
    return hasil;
  }

  function parseKuis(teks, jumlah) {
    let isi = String(teks || "").trim();
    isi = isi.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let arr;
    try {
      arr = JSON.parse(isi);
    } catch (err) {
      const a = isi.indexOf("[");
      const b = isi.lastIndexOf("]");
      if (a >= 0 && b > a) {
        try { arr = JSON.parse(isi.slice(a, b + 1)); } catch (e2) { arr = null; }
      }
    }
    if (!Array.isArray(arr)) throw new Error("Format kuis dari AI tidak terbaca. Coba ulang.");
    const bersih = arr.map((item) => {
      const o = Array.isArray(item && item.o) ? item.o : [];
      const a = Number(item && item.a);
      return {
        q: potong(item && item.q, 300),
        o: o.slice(0, 4).map((x) => potong(x, 160)),
        a: Number.isInteger(a) && a >= 0 && a <= 3 ? a : 0,
        e: potong(item && item.e, 300),
      };
    }).filter((x) => x.q && x.o.length === 4);
    if (!bersih.length) throw new Error("AI tidak menghasilkan soal yang valid. Coba ulang.");
    return bersih.slice(0, Math.max(1, Number(jumlah) || 10));
  }

  async function buatKuis(id, b64, jumlah) {
    const teks = await panggilGemini([bagianPdf(b64), { text: promptKuis(jumlah) }], { json: true });
    const soal = parseKuis(teks, jumlah);
    await fs().collection("kisiMateri").doc(id).set({ kuis: soal }, { merge: true });
    const materi = cariMateri(id);
    if (materi) materi.kuis = soal;
    return soal;
  }

  function formAI(materi) {
    const keyAda = !!apiKey();
    bukaModal(`
      <div class="kisi-form">
        <h3>Buat Ulang AI</h3>
        <p class="kisi-note">${esc(materi.judul)}</p>
        ${keyAda ? "" : `<p class="kisi-warn">API key Gemini belum diisi. Buka Pengaturan AI dulu.</p>`}
        <label class="kisi-check"><input type="checkbox" name="ai-rangkuman" ${materi.rangkuman ? "" : "checked"}> Rangkuman</label>
        <label class="kisi-check"><input type="checkbox" name="ai-kuis" ${Array.isArray(materi.kuis) && materi.kuis.length ? "" : "checked"}> Kuis</label>
        <label class="kisi-field kisi-field-inline">
          <span>Jumlah soal</span>
          <select name="ai-jumlah">
            <option value="5">5 soal</option>
            <option value="10" selected>10 soal</option>
            <option value="15">15 soal</option>
          </select>
        </label>
        <div class="kisi-form-actions">
          <button type="button" class="btn-secondary" data-kisi-close>Batal</button>
          <button type="button" class="btn-primary" data-kisi-ai-jalan="${esc(materi.id)}" ${keyAda ? "" : "disabled"}>Jalankan AI</button>
        </div>
      </div>`);
  }

  async function jalankanAI(id) {
    const materi = cariMateri(id);
    if (!materi || state.busy) return;
    const root = state.modalRoot;
    const mauRangkuman = root.querySelector("[name=ai-rangkuman]") && root.querySelector("[name=ai-rangkuman]").checked;
    const mauKuis = root.querySelector("[name=ai-kuis]") && root.querySelector("[name=ai-kuis]").checked;
    const jumlah = Number(root.querySelector("[name=ai-jumlah]") && root.querySelector("[name=ai-jumlah]").value) || 10;
    if (!mauRangkuman && !mauKuis) return toastK("Pilih minimal satu: rangkuman atau kuis.", "warn");

    state.busy = true;
    progressModal("AI sedang bekerja");
    try {
      setProgress("Mengambil PDF…", 6);
      const b64 = await bacaBerkas(materi);
      let pesanGagal = "";
      try {
        if (mauRangkuman) {
          setProgress("Menyusun rangkuman…", 30);
          materi.rangkuman = await buatRangkuman(id, b64);
        }
        if (mauKuis) {
          setProgress("Menyusun soal kuis…", 65);
          materi.kuis = await buatKuis(id, b64, jumlah);
        }
        await fs().collection("kisiMateri").doc(id).set(
          { aiModel: modelAI(), aiAt: Date.now(), aiStatus: "ok", aiPesan: "" },
          { merge: true }
        );
        materi.aiStatus = "ok";
        materi.aiPesan = "";
      } catch (err) {
        pesanGagal = pesanErr(err);
        await fs().collection("kisiMateri").doc(id).set(
          { aiStatus: "error", aiPesan: potong(pesanGagal, 200) },
          { merge: true }
        ).catch(() => {});
        materi.aiStatus = "error";
        materi.aiPesan = potong(pesanGagal, 200);
      }
      tutupModal();
      if (pesanGagal) toastK(`AI gagal: ${pesanGagal}`, "error");
      else toastK("Rangkuman/kuis diperbarui.", "ok");
      await muatData(true);
    } catch (err) {
      tutupModal();
      toastK(pesanErr(err), "error");
    } finally {
      state.busy = false;
    }
  }

  function tampilHasilAI(hasil, jenis, teks) {
    if (!hasil) return;
    hasil.hidden = false;
    hasil.className = jenis === "ok" ? "kisi-ok" : jenis === "warn" ? "kisi-warn" : "kisi-note";
    hasil.textContent = teks;
  }

  function formPengaturanAI() {
    const key = apiKey();
    const model = modelAI();
    const modelDikenal = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"];
    bukaModal(`
      <div class="kisi-form">
        <h3>Pengaturan AI</h3>
        <p class="kisi-note">Key Gemini disimpan di perangkat admin dan dibagikan ke semua siswa lewat Firestore. AI Chat 7.3 langsung aktif tanpa siswa isi key sendiri.</p>
        <label class="kisi-field">
          <span>Gemini API key <span class="kisi-key-status" data-kisi-key-status>${key ? `${key.length} karakter tersimpan` : "belum ada"}</span></span>
          <span class="kisi-key-wrap">
            <input name="ai-key" type="password" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${key ? "Kosongkan = tetap pakai key lama" : "Tempel API key di sini"}">
            <button type="button" class="kisi-key-toggle" data-kisi-key-lihat>Lihat</button>
          </span>
        </label>
        <label class="kisi-field">
          <span>Model</span>
          <select name="ai-model">
            <option value="gemini-flash-latest" ${model === "gemini-flash-latest" ? "selected" : ""}>Gemini Flash terbaru (disarankan)</option>
            <option value="gemini-flash-lite-latest" ${model === "gemini-flash-lite-latest" ? "selected" : ""}>Gemini Flash Lite terbaru</option>
            <option value="gemini-2.5-flash" ${model === "gemini-2.5-flash" ? "selected" : ""}>Gemini 2.5 Flash (kalau masih tersedia)</option>
            ${modelDikenal.indexOf(model) >= 0 ? "" : `<option value="${esc(model)}" selected>${esc(model)}</option>`}
          </select>
        </label>
        <p class="kisi-note">Key dari AI Studio sekarang bisa diawali <strong>AQ.</strong> atau <strong>AIza</strong> — dua-duanya bisa. Kalau angka di atas cuma beberapa karakter, paste-nya kepotong, ulangi paste.</p>
        <p class="kisi-note">Setelah disimpan, AI Chat semua siswa ikut pakai key ini. Kalau gagal dibagikan, pastikan rules Firestore sudah dipublish.</p>
        <p class="kisi-note">Buat key di aistudio.google.com/apikey.</p>
        <p class="kisi-warn" data-kisi-ai-test hidden></p>
        <div class="kisi-form-actions kisi-form-actions-3">
          <button type="button" class="btn-secondary" data-kisi-ai-tes>Tes koneksi</button>
          ${key ? `<button type="button" class="btn-secondary is-danger" data-kisi-ai-hapus>Hapus key</button>` : ""}
          <button type="button" class="btn-primary" data-kisi-ai-simpan>Simpan</button>
        </div>
      </div>`);
  }

  async function simpanPengaturanAI() {
    const root = state.modalRoot;
    const input = root.querySelector("[name=ai-key]");
    const model = root.querySelector("[name=ai-model]").value || DEFAULT_MODEL;
    const baru = input ? bersihKey(input.value) : "";
    if (baru && baru.length < 30) {
      toastK(`Key cuma ${baru.length} karakter, sepertinya kepotong. Paste ulang ya.`, "error");
      return;
    }
    try {
      localStorage.setItem(MODEL_STORE, model);
      if (baru) localStorage.setItem(KEY_STORE, baru);
    } catch (err) {
      toastK("Browser menolak menyimpan key.", "error");
      return;
    }
    const dibagi = (keyLokal() || publikKey) ? await kirimPublik() : false;
    tutupModal();
    const panjang = apiKey().length;
    if (!panjang) {
      toastK("Model disimpan, tapi key masih kosong.", "warn");
    } else if (!dibagi) {
      toastK(`Key tersimpan (${panjang} karakter), tapi gagal dibagikan. Cek rules Firestore.`, "warn");
    } else {
      toastK(`Pengaturan AI tersimpan. AI Chat semua siswa pakai key ini (${panjang} karakter).`, "ok");
    }
    render();
  }

  async function tesAI() {
    const root = state.modalRoot;
    const hasil = root.querySelector("[data-kisi-ai-test]");
    const input = root.querySelector("[name=ai-key]");
    const pilih = root.querySelector("[name=ai-model]");
    const status = root.querySelector("[data-kisi-key-status]");
    let model = (pilih && pilih.value) || modelAI();
    const baru = input ? bersihKey(input.value) : "";
    if (baru && baru.length < 30) {
      tampilHasilAI(hasil, "warn", `Key cuma ${baru.length} karakter, sepertinya kepotong. Paste ulang dulu.`);
      return;
    }
    const asli = apiKey();
    if (!asli && !publikDimuat) await muatPublik();
    if (baru) {
      try { localStorage.setItem(KEY_STORE, baru); } catch (err) { /* abaikan */ }
    }
    const key = baru || apiKey();
    if (!key) {
      tampilHasilAI(hasil, "warn", "API key masih kosong. Tempel key dulu.");
      return;
    }
    tampilHasilAI(hasil, "", "Mengetes key dan model…");
    try {
      const daftar = await daftarModelAI(key);
      if (!daftar.length) throw new Error("Key tidak mengembalikan model. Pastikan Gemini API aktif.");
      if (daftar.indexOf(model) < 0) {
        const cadangan = daftar.filter((m) => /flash-latest$/.test(m))[0]
          || daftar.filter((m) => /flash/i.test(m))[0]
          || daftar[0];
        model = cadangan;
        if (pilih) {
          const opsi = document.createElement("option");
          opsi.value = cadangan;
          opsi.textContent = cadangan;
          pilih.appendChild(opsi);
          pilih.value = cadangan;
        }
        try { localStorage.setItem(MODEL_STORE, cadangan); } catch (err) { /* abaikan */ }
      }
      await panggilGemini([{ text: "Balas satu kata: siap" }], { model, json: false });
      const dipakai = state.modelTerakhir || model;
      model = dipakai;
      if (pilih) {
        if (!Array.from(pilih.options).some((o) => o.value === dipakai)) {
          const opsi = document.createElement("option");
          opsi.value = dipakai;
          opsi.textContent = dipakai;
          pilih.appendChild(opsi);
        }
        pilih.value = dipakai;
      }
      try { localStorage.setItem(MODEL_STORE, dipakai); } catch (err) { /* abaikan */ }
      if (keyLokal()) await kirimPublik();
      tampilHasilAI(hasil, "ok", `Berhasil (${dipakai}) · ${daftar.length} model tersedia`);
      if (status) status.textContent = `${key.length} karakter tersimpan`;
    } catch (err) {
      tampilHasilAI(hasil, "warn", pesanErr(err));
      if (baru && asli) {
        try { localStorage.setItem(KEY_STORE, asli); } catch (e2) { /* abaikan */ }
      }
    }
  }

  async function hapusKeyAI() {
    try { localStorage.removeItem(KEY_STORE); } catch (err) { /* abaikan */ }
    const mati = await matikanPublik();
    tutupModal();
    toastK(
      mati
        ? "Key Gemini dihapus dan AI Chat dimatikan untuk semua siswa."
        : "Key di HP ini dihapus, tapi key bersama gagal dimatikan. Cek rules Firestore.",
      mati ? "ok" : "warn"
    );
    render();
  }

  /* ---------------- event ---------------- */

  function onClick(e) {
    const t = e.target.closest(
      "[data-kisi-buka],[data-kisi-edit-kategori],[data-kisi-hapus-kategori],[data-kisi-tambah-materi]," +
      "[data-kisi-edit-materi],[data-kisi-hapus-materi],[data-kisi-pdf],[data-kisi-rangkuman],[data-kisi-kuis],[data-kisi-ai]"
    );
    if (!t) return;

    if (t.hasAttribute("data-kisi-buka")) {
      state.catAktif = t.getAttribute("data-kisi-buka");
      render();
      return;
    }
    if (t.hasAttribute("data-kisi-edit-kategori")) {
      const kat = state.kategori.find((k) => k.id === t.getAttribute("data-kisi-edit-kategori"));
      if (kat) formKategori(kat);
      return;
    }
    if (t.hasAttribute("data-kisi-hapus-kategori")) { hapusKategori(t.getAttribute("data-kisi-hapus-kategori")); return; }
    if (t.hasAttribute("data-kisi-tambah-materi")) { formMateri(t.getAttribute("data-kisi-tambah-materi"), null); return; }
    if (t.hasAttribute("data-kisi-edit-materi")) {
      const m = cariMateri(t.getAttribute("data-kisi-edit-materi"));
      if (m) formMateri(m.kategoriId, m);
      return;
    }
    if (t.hasAttribute("data-kisi-hapus-materi")) { hapusMateri(t.getAttribute("data-kisi-hapus-materi")); return; }
    if (t.hasAttribute("data-kisi-pdf")) {
      const m = cariMateri(t.getAttribute("data-kisi-pdf"));
      if (m) bukaPdf(m);
      return;
    }
    if (t.hasAttribute("data-kisi-rangkuman")) {
      const m = cariMateri(t.getAttribute("data-kisi-rangkuman"));
      if (m) bukaRangkuman(m);
      return;
    }
    if (t.hasAttribute("data-kisi-kuis")) {
      const m = cariMateri(t.getAttribute("data-kisi-kuis"));
      if (m) bukaKuis(m);
      return;
    }
    if (t.hasAttribute("data-kisi-ai")) {
      const m = cariMateri(t.getAttribute("data-kisi-ai"));
      if (m) formAI(m);
    }
  }

  function onModalInput(e) {
    const t = e.target;
    if (!t || t.name !== "ai-key") return;
    const status = state.modalRoot.querySelector("[data-kisi-key-status]");
    if (!status) return;
    const n = bersihKey(t.value).length;
    status.textContent = n ? `${n} karakter diketik` : "belum ada";
  }

  function onModalClick(e) {
    if (e.target.closest("[data-kisi-key-lihat]")) {
      const input = state.modalRoot.querySelector("[name=ai-key]");
      if (input) {
        const tampil = input.type === "password";
        input.type = tampil ? "text" : "password";
        e.target.closest("[data-kisi-key-lihat]").textContent = tampil ? "Sembunyikan" : "Lihat";
      }
      return;
    }
    if (e.target.closest("[data-kisi-close]")) {
      if (state.busy) return;
      tutupModal();
      return;
    }
    if (e.target.closest("[data-kisi-jawab]")) {
      jawabKuis(Number(e.target.closest("[data-kisi-jawab]").getAttribute("data-kisi-jawab")));
      return;
    }
    if (e.target.closest("[data-kisi-lanjut]")) { lanjutKuis(); return; }
    if (e.target.closest("[data-kisi-ulang-kuis]")) {
      const m = cariMateri(e.target.closest("[data-kisi-ulang-kuis]").getAttribute("data-kisi-ulang-kuis"));
      if (m) bukaKuis(m);
      return;
    }
    if (e.target.closest("[data-kisi-ai-simpan]")) { simpanPengaturanAI(); return; }
    if (e.target.closest("[data-kisi-ai-hapus]")) { hapusKeyAI(); return; }
    if (e.target.closest("[data-kisi-ai-tes]")) { tesAI(); return; }
    if (e.target.closest("[data-kisi-ai-jalan]")) {
      jalankanAI(e.target.closest("[data-kisi-ai-jalan]").getAttribute("data-kisi-ai-jalan"));
      return;
    }
    const pdf = e.target.closest("[data-kisi-pdf]");
    if (pdf) {
      const m = cariMateri(pdf.getAttribute("data-kisi-pdf"));
      if (m) bukaPdf(m);
      return;
    }
    // klik di overlay kosong = tutup
    if (e.target.classList && e.target.classList.contains("kisi-overlay") && !state.busy) tutupModal();
  }

  function onModalSubmit(e) {
    const form = e.target.closest("[data-kisi-form]");
    if (!form) return;
    e.preventDefault();
    if (state.busy) return;
    const jenis = form.getAttribute("data-kisi-form");
    if (jenis === "kategori") { simpanKategori(form); return; }
    if (jenis === "materi") {
      const id = form.getAttribute("data-kisi-id");
      if (id) simpanUbahMateri(form);
      else uploadMateri(form.getAttribute("data-kisi-kategori"), form);
    }
  }

  function pasang() {
    state.panel = document.querySelector('[data-page-panel="kisi"]');
    if (!state.panel) return;
    state.modalRoot = document.getElementById("kisi-modal-root");
    state.toastEl = document.getElementById("kisi-toast");
    el.panel = state.panel;
    el.adminBar = document.getElementById("kisi-admin-bar");
    el.locked = document.getElementById("kisi-locked");
    el.katView = document.getElementById("kisi-kategori-view");
    el.materiView = document.getElementById("kisi-materi-view");
    el.daftarKat = document.getElementById("kisi-daftar-kategori");
    el.daftarMateri = document.getElementById("kisi-daftar-materi");
    el.materiHead = document.getElementById("kisi-materi-head");
    el.materiKosong = document.getElementById("kisi-materi-kosong");
    el.kosong = document.getElementById("kisi-kosong");
    el.loading = document.getElementById("kisi-loading");

    state.panel.addEventListener("click", onClick);
    state.modalRoot.addEventListener("click", onModalClick);
    state.modalRoot.addEventListener("submit", onModalSubmit);
    state.modalRoot.addEventListener("input", onModalInput);

    document.getElementById("kisi-btn-kategori").addEventListener("click", () => formKategori(null));
    document.getElementById("kisi-btn-ai").addEventListener("click", formPengaturanAI);
    document.getElementById("kisi-btn-kembali").addEventListener("click", () => {
      state.catAktif = null;
      render();
    });

    render();
  }

  window.kisiKisiBuka = function () {
    muatPublik().then(() => { if (el.panel) render(); });
    if (!state.terakhirMuat) muatData();
    else if (Date.now() - state.terakhirMuat > 15000) muatData(true);
    else render();
  };
  window.kisiKisiTutup = function () {
    if (!state.busy) tutupModal();
  };
  window.kisiKisiAkunBerubah = function () {
    render();
  };

  // Dipakai juga oleh AI Chat 7.3 di chat.js (key & model yang sama).
  window.geminiKelas73 = {
    muatPublik: muatPublik,
    tersedia: function () {
      return !!apiKey();
    },
    panggil: panggilGemini,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", pasang);
  } else {
    pasang();
  }
})();
