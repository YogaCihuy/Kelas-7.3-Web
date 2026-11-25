/* ===================================================
   AKUN GURU
   Biodata guru dipisah dari siswa (koleksi "guru").
   Akun guru cuma bisa lihat biodata + main Games.
   Dikelola lewat "Atur Akun Guru" oleh Admin/Owner.
=================================================== */
(function () {
  "use strict";

  const KOLEKSI_GURU = "guru";
  const CACHE_KEY = "kelas73-guru-cache";
  const GURU_ID_MIN = 33; // 1..32 dipakai siswa
  const GURU_ID_MAX = 64;
  const BATAS_NAMA = 80;
  const BATAS_PANGGILAN = 40;
  const BATAS_USERNAME = 40;
  const BATAS_PASSWORD = 80;
  const BATAS_MAPEL = 80;
  const BATAS_BIO = 300;

  let cacheGuru = {};
  let editId = null;
  let profilId = null;
  let profilModeEdit = false;
  let sesiTertunda = null;
  let resolveSiap = null;
  let listenerAktif = false;
  const siap = new Promise((resolve) => { resolveSiap = resolve; });

  function dbAman() {
    try {
      return typeof db !== "undefined" ? db : null;
    } catch (err) {
      return null;
    }
  }

  function teks(nilai, batas) {
    if (typeof nilai !== "string") return "";
    return nilai.trim().slice(0, batas);
  }

  function esc(nilai) {
    return String(nilai == null ? "" : nilai)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalisasi(id, raw) {
    const absen = Number(id);
    if (!Number.isInteger(absen) || absen < GURU_ID_MIN || absen > GURU_ID_MAX) return null;
    if (!raw || typeof raw !== "object") return null;
    const namaLengkap = teks(raw.namaLengkap, BATAS_NAMA) || `Guru ${absen}`;
    return {
      absen,
      namaLengkap,
      namaPanggilan: teks(raw.namaPanggilan, BATAS_PANGGILAN) || namaLengkap,
      mapel: teks(raw.mapel, BATAS_MAPEL),
      bio: teks(raw.bio, BATAS_BIO),
      username: teks(raw.username, BATAS_USERNAME),
      password: typeof raw.password === "string" ? raw.password : "",
      role: "guru",
      isGuru: true,
    };
  }

  function daftarGuru() {
    return Object.keys(cacheGuru)
      .map((kunci) => cacheGuru[kunci])
      .sort((a, b) => a.absen - b.absen);
  }

  function getGuru(id) {
    return cacheGuru[String(Number(id))] || null;
  }

  function cariUsername(username) {
    const cari = String(username || "").trim().toLowerCase();
    if (!cari) return null;
    return daftarGuru().find((guru) => String(guru.username || "").toLowerCase() === cari) || null;
  }

  function idKosong() {
    for (let id = GURU_ID_MIN; id <= GURU_ID_MAX; id++) {
      if (!cacheGuru[String(id)]) return id;
    }
    return null;
  }

  // Cache lokal biar sesi guru tetap kebuka walau pas reload lagi offline.
  // Password sengaja gak disimpan di perangkat.
  function simpanCacheLokal() {
    try {
      const ringkas = {};
      daftarGuru().forEach((guru) => {
        ringkas[String(guru.absen)] = {
          absen: guru.absen,
          namaLengkap: guru.namaLengkap,
          namaPanggilan: guru.namaPanggilan,
          mapel: guru.mapel,
          bio: guru.bio,
          username: guru.username,
          role: "guru",
        };
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(ringkas));
    } catch (err) {
      /* storage penuh; abaikan */
    }
  }

  function muatCacheLokal() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const simpan = JSON.parse(raw);
      const next = {};
      Object.keys(simpan || {}).forEach((id) => {
        const rec = normalisasi(id, simpan[id]);
        if (rec) next[String(rec.absen)] = rec;
      });
      cacheGuru = next;
    } catch (err) {
      /* cache rusak; abaikan */
    }
  }

  /* ---------- Daftar Guru (tab sendiri) ---------- */

  function renderGrid() {
    const grid = document.getElementById("grid-guru");
    if (!grid) return;
    const daftar = daftarGuru();
    if (!daftar.length) {
      grid.innerHTML = `<p class="guru-kosong">Belum ada akun guru. Akun guru bisa ditambah lewat menu Akun → Atur Akun Guru.</p>`;
      return;
    }
    grid.innerHTML = daftar
      .map(
        (guru) => `
        <button class="siswa-card guru-card" type="button" data-guru-id="${guru.absen}">
          <span class="siswa-absen guru-card-label">GURU</span>
          <div class="siswa-nama">${esc(guru.namaPanggilan)}</div>
          <span class="guru-mapel">${esc(guru.mapel || "Guru Kelas 7.3")}</span>
        </button>`
      )
      .join("");
  }

  /* ---------- Biodata Guru ---------- */

  function isiTampilanProfil(guru) {
    document.getElementById("guru-profil-title").textContent = guru.namaLengkap;
    document.getElementById("guru-profil-panggilan").textContent = `Dipanggil ${guru.namaPanggilan}`;
    document.getElementById("guru-profil-mapel").textContent = guru.mapel || "Belum diisi";
    document.getElementById("guru-profil-bio").textContent = guru.bio || "Belum ada bio.";
    document.getElementById("guru-profil-panggilan-input").value = guru.namaPanggilan;
    document.getElementById("guru-profil-mapel-input").value = guru.mapel;
    document.getElementById("guru-profil-bio-input").value = guru.bio;
    document.getElementById("guru-profil-error").hidden = true;
  }

  function terapkanModeProfil() {
    const tampilan = document.getElementById("guru-profil-tampilan");
    const form = document.getElementById("form-guru-profil");
    const btnEdit = document.getElementById("btn-guru-profil-edit");
    if (tampilan) tampilan.hidden = profilModeEdit;
    if (form) form.hidden = !profilModeEdit;
    if (btnEdit) btnEdit.hidden = profilModeEdit || !(typeof currentUser !== "undefined" && currentUser && currentUser.isGuru && Number(currentUser.absen) === Number(profilId));
  }

  function bukaProfil(id, langsungEdit) {
    const guru = getGuru(id);
    if (!guru) return;
    profilId = Number(id);
    const aku = typeof currentUser !== "undefined" && currentUser && currentUser.isGuru && Number(currentUser.absen) === Number(id);
    profilModeEdit = !!(aku && langsungEdit);
    isiTampilanProfil(guru);
    terapkanModeProfil();
    openModal(document.getElementById("modal-guru-profil"));
  }

  async function simpanProfil(e) {
    e.preventDefault();
    if (!profilId) return;
    const errorEl = document.getElementById("guru-profil-error");
    const namaPanggilan = teks(document.getElementById("guru-profil-panggilan-input").value, BATAS_PANGGILAN);
    if (!namaPanggilan) {
      errorEl.textContent = "Nama panggilan gak boleh kosong.";
      errorEl.hidden = false;
      return;
    }
    try {
      await dbAman()
        .collection(KOLEKSI_GURU)
        .doc(String(profilId))
        .set(
          {
            namaPanggilan,
            mapel: teks(document.getElementById("guru-profil-mapel-input").value, BATAS_MAPEL),
            bio: teks(document.getElementById("guru-profil-bio-input").value, BATAS_BIO),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      profilModeEdit = false;
      closeModal(document.getElementById("modal-guru-profil"));
      SoundFX.resultReveal();
    } catch (err) {
      console.error("Gagal simpan biodata guru:", err);
      errorEl.textContent = `Gagal simpan (${err.code || err.message}).`;
      errorEl.hidden = false;
      SoundFX.errorSound();
    }
  }

  /* ---------- Atur Akun Guru ---------- */

  function renderKelola() {
    const box = document.getElementById("daftar-kelola-guru");
    if (!box) return;
    const daftar = daftarGuru();
    if (!daftar.length) {
      box.innerHTML = `<p class="form-hint">Belum ada akun guru. Isi form di bawah buat nambah.</p>`;
      return;
    }
    box.innerHTML = daftar
      .map(
        (guru) => `
        <div class="kelola-admin-row guru-kelola-row">
          <span class="guru-kelola-info">
            <strong>${esc(guru.namaPanggilan)}</strong>
            <small>${esc(guru.mapel || "Guru")} &middot; @${esc(guru.username)}</small>
          </span>
          <span class="guru-kelola-aksi">
            <button type="button" class="btn-secondary btn-kecil" data-guru-edit="${guru.absen}">Edit</button>
            <button type="button" class="btn-secondary btn-kecil btn-hapus" data-guru-hapus="${guru.absen}">Hapus</button>
          </span>
        </div>`
      )
      .join("");
  }

  function resetFormKelola() {
    editId = null;
    const form = document.getElementById("form-kelola-guru");
    if (form) form.reset();
    document.getElementById("guru-form-title").textContent = "Tambah Akun Guru";
    document.getElementById("guru-form-submit").textContent = "Tambah Akun";
    document.getElementById("btn-guru-form-batal").hidden = true;
    const pass = document.getElementById("guru-form-password");
    pass.required = true;
    pass.placeholder = "Wajib diisi buat akun baru";
    document.getElementById("guru-form-error").hidden = true;
  }

  function isiFormKelola(guru) {
    editId = guru.absen;
    document.getElementById("guru-form-nama").value = guru.namaLengkap;
    document.getElementById("guru-form-panggilan").value = guru.namaPanggilan;
    document.getElementById("guru-form-mapel").value = guru.mapel;
    document.getElementById("guru-form-username").value = guru.username;
    const pass = document.getElementById("guru-form-password");
    pass.value = "";
    pass.required = false;
    pass.placeholder = "Kosongkan kalau gak mau ganti";
    document.getElementById("guru-form-title").textContent = `Edit Akun ${guru.namaPanggilan}`;
    document.getElementById("guru-form-submit").textContent = "Simpan Perubahan";
    document.getElementById("btn-guru-form-batal").hidden = false;
    document.getElementById("guru-form-error").hidden = true;
    document.getElementById("guru-form-status").hidden = true;
  }

  function bukaKelola() {
    renderKelola();
    resetFormKelola();
    document.getElementById("guru-form-status").hidden = true;
    openModal(document.getElementById("modal-kelola-guru"));
  }

  async function simpanKelola(e) {
    e.preventDefault();
    const errorEl = document.getElementById("guru-form-error");
    const statusEl = document.getElementById("guru-form-status");
    errorEl.hidden = true;
    statusEl.hidden = true;

    const namaLengkap = teks(document.getElementById("guru-form-nama").value, BATAS_NAMA);
    const namaPanggilan = teks(document.getElementById("guru-form-panggilan").value, BATAS_PANGGILAN);
    const mapel = teks(document.getElementById("guru-form-mapel").value, BATAS_MAPEL);
    const username = teks(document.getElementById("guru-form-username").value, BATAS_USERNAME);
    const password = document.getElementById("guru-form-password").value;

    if (!namaLengkap || !namaPanggilan || !username) {
      errorEl.textContent = "Nama lengkap, nama panggilan, dan username wajib diisi.";
      errorEl.hidden = false;
      return;
    }
    if (password.length > BATAS_PASSWORD) {
      errorEl.textContent = `Password maksimal ${BATAS_PASSWORD} karakter.`;
      errorEl.hidden = false;
      return;
    }
    if (!editId && !password) {
      errorEl.textContent = "Password wajib diisi buat akun baru.";
      errorEl.hidden = false;
      return;
    }

    const uname = username.toLowerCase();
    const dipakaiSiswa = (typeof dataSiswa !== "undefined" ? dataSiswa : []).some((siswa) => {
      const akun = typeof getMergedAccount === "function" ? getMergedAccount(siswa.absen) : null;
      return akun && String(akun.username || "").toLowerCase() === uname;
    });
    if (dipakaiSiswa) {
      errorEl.textContent = "Username itu udah dipakai siswa.";
      errorEl.hidden = false;
      return;
    }
    const dipakaiGuru = daftarGuru().some(
      (guru) => Number(guru.absen) !== Number(editId) && String(guru.username || "").toLowerCase() === uname
    );
    if (dipakaiGuru) {
      errorEl.textContent = "Username itu udah dipakai guru lain.";
      errorEl.hidden = false;
      return;
    }

    const database = dbAman();
    if (!database) {
      errorEl.textContent = "Database belum siap, coba lagi.";
      errorEl.hidden = false;
      return;
    }

    const tombol = document.getElementById("guru-form-submit");
    tombol.disabled = true;
    try {
      if (editId) {
        const payload = { namaLengkap, namaPanggilan, mapel, username, updatedAt: Date.now() };
        if (password) payload.password = password;
        await database.collection(KOLEKSI_GURU).doc(String(editId)).set(payload, { merge: true });
      } else {
        const id = idKosong();
        if (!id) {
          errorEl.textContent = "Slot akun guru penuh (maks 32 guru).";
          errorEl.hidden = false;
          return;
        }
        await database.collection(KOLEKSI_GURU).doc(String(id)).set({
          absen: id,
          namaLengkap,
          namaPanggilan,
          mapel,
          bio: "",
          username,
          password,
          role: "guru",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      resetFormKelola();
      statusEl.textContent = "Tersimpan. Akun guru langsung bisa dipakai login.";
      statusEl.hidden = false;
      SoundFX.resultReveal();
    } catch (err) {
      console.error("Gagal simpan akun guru:", err);
      errorEl.textContent = `Gagal simpan (${err.code || err.message}).`;
      errorEl.hidden = false;
      SoundFX.errorSound();
    } finally {
      tombol.disabled = false;
    }
  }

  async function hapusGuru(id) {
    const guru = getGuru(id);
    if (!guru) return;
    if (!window.confirm(`Hapus akun guru ${guru.namaPanggilan}? Tindakan ini gak bisa dibatalin.`)) return;
    try {
      await dbAman().collection(KOLEKSI_GURU).doc(String(id)).delete();
      if (Number(editId) === Number(id)) resetFormKelola();
      SoundFX.buttonClick();
    } catch (err) {
      console.error("Gagal hapus akun guru:", err);
      window.alert("Gagal hapus akun guru. Coba lagi.");
      SoundFX.errorSound();
    }
  }

  /* ---------- Sesi & listener ---------- */

  function muatSesi(id) {
    sesiTertunda = Number(id);
    siap.then(() => {
      if (!sesiTertunda) return;
      const target = sesiTertunda;
      sesiTertunda = null;
      const rec = getGuru(target);
      if (typeof window.sesiGuruSiap === "function") window.sesiGuruSiap(rec);
    });
  }

  function pasangListener() {
    if (listenerAktif) return;
    const database = dbAman();
    if (!database) {
      if (resolveSiap) { resolveSiap(); resolveSiap = null; }
      return;
    }
    listenerAktif = true;
    database.collection(KOLEKSI_GURU).onSnapshot(
      (snap) => {
        const next = {};
        snap.forEach((doc) => {
          const rec = normalisasi(doc.id, doc.data());
          if (rec) next[String(rec.absen)] = rec;
        });
        cacheGuru = next;
        simpanCacheLokal();
        renderGrid();
        renderKelola();

        const modalProfil = document.getElementById("modal-guru-profil");
        if (profilId && modalProfil && !modalProfil.hidden) {
          const aktif = getGuru(profilId);
          if (aktif) isiTampilanProfil(aktif);
        }

        if (typeof currentUser !== "undefined" && currentUser && currentUser.isGuru) {
          const rec = getGuru(currentUser.absen);
          if (rec && typeof window.guruAkunTerbarui === "function") window.guruAkunTerbarui(rec);
          else if (!rec && typeof window.guruSesiHilang === "function") window.guruSesiHilang();
        }

        if (resolveSiap) { resolveSiap(); resolveSiap = null; }
      },
      (err) => {
        console.error("Gagal memuat akun guru:", err);
        renderGrid();
        if (resolveSiap) { resolveSiap(); resolveSiap = null; }
      }
    );
  }

  /* ---------- Init ---------- */

  function init() {
    const grid = document.getElementById("grid-guru");
    if (grid) {
      grid.addEventListener("click", (e) => {
        const card = e.target.closest("[data-guru-id]");
        if (!card) return;
        SoundFX.buttonClick();
        bukaProfil(Number(card.dataset.guruId));
      });
    }

    const box = document.getElementById("daftar-kelola-guru");
    if (box) {
      box.addEventListener("click", (e) => {
        const edit = e.target.closest("[data-guru-edit]");
        if (edit) {
          const guru = getGuru(edit.dataset.guruEdit);
          if (guru) { isiFormKelola(guru); SoundFX.buttonClick(); }
          return;
        }
        const hapus = e.target.closest("[data-guru-hapus]");
        if (hapus) hapusGuru(Number(hapus.dataset.guruHapus));
      });
    }

    const formKelola = document.getElementById("form-kelola-guru");
    if (formKelola) formKelola.addEventListener("submit", simpanKelola);
    const batal = document.getElementById("btn-guru-form-batal");
    if (batal) {
      batal.addEventListener("click", () => {
        resetFormKelola();
        document.getElementById("guru-form-status").hidden = true;
      });
    }

    const formProfil = document.getElementById("form-guru-profil");
    if (formProfil) formProfil.addEventListener("submit", simpanProfil);
    const btnEdit = document.getElementById("btn-guru-profil-edit");
    if (btnEdit) {
      btnEdit.addEventListener("click", () => {
        profilModeEdit = true;
        terapkanModeProfil();
      });
    }

    if (typeof setupModalDismiss === "function") {
      setupModalDismiss(document.getElementById("modal-guru-profil"));
      setupModalDismiss(document.getElementById("modal-kelola-guru"));
    }

    muatCacheLokal();
    renderGrid();
    renderKelola();
    pasangListener();
  }

  window.guruInit = init;
  window.guruDaftar = daftarGuru;
  window.guruGet = getGuru;
  window.guruCariUsername = cariUsername;
  window.guruMuatSesi = muatSesi;
  window.guruBukaProfil = bukaProfil;
  window.guruBukaKelola = bukaKelola;
  window.guruAkunBerubah = function (user) {
    const aktif = !!(user && user.isGuru);
    const kelola = document.getElementById("modal-kelola-guru");
    if (aktif && kelola && !kelola.hidden) closeModal(kelola);
    const profil = document.getElementById("modal-guru-profil");
    if (aktif && profil && !profil.hidden && Number(profilId) !== Number(user.absen)) closeModal(profil);
  };
})();
