// firebase-init.js
// Config ini aman buat di-share (bukan rahasia) — keamanan data diatur
// lewat Firestore Security Rules, bukan lewat nyembunyiin config ini.

const firebaseConfig = {
  apiKey: "AIzaSyBy9dvC105K0q5OGcBbklHmT6ZOR3cLrpQ",
  authDomain: "kelas73-web.firebaseapp.com",
  projectId: "kelas73-web",
  storageBucket: "kelas73-web.firebasestorage.app",
  messagingSenderId: "110170356296",
  appId: "1:110170356296:web:272a85b614f1d9a4fc767d",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Wifi sekolah/jaringan yang ketat kadang blokir koneksi streaming biasa,
// jadi Firestore dipaksa deteksi otomatis & pindah ke "long polling" kalau perlu.
db.settings({ experimentalAutoDetectLongPolling: true });

/* ===================================================
   STATUS SERVER (kuota Firestore)
   Kalau kuota baca harian habis, semua game yang butuh internet
   bakal gagal. Semua galat kuota dari SDK Firestore ditangkap di
   sini lalu memunculkan spanduk peringatan di atas semua halaman.
=================================================== */
(function () {
  const POLA_KUOTA = /resource-exhausted|quota exceeded/i;
  const ISI_NORMAL = `
      <strong>Server sedang ditutup</strong>
      <span>Kuota harian server habis. Game yang butuh internet dipause sampai jam 15:00 WIB.</span>`;

  let elemen = null;
  let isi = null;
  let tombol = null;
  let statusTampil = false;
  let sedangCek = null;
  let timerUlang = 0;
  let timerSukses = 0;

  function adalahKuota(err) {
    if (!err) return false;
    return POLA_KUOTA.test(String(err.code || "")) || POLA_KUOTA.test(String(err.message || ""));
  }

  function buatElemen() {
    if (elemen || !document.body) return;
    elemen = document.createElement("div");
    elemen.id = "server-status";
    elemen.className = "server-status";
    elemen.hidden = true;
    elemen.setAttribute("role", "status");
    elemen.setAttribute("aria-live", "polite");
    elemen.innerHTML = `
      <span class="server-status-icon" aria-hidden="true">⚠️</span>
      <div class="server-status-text">${ISI_NORMAL}</div>
      <button type="button" class="server-status-retry">Coba Lagi</button>`;
    isi = elemen.querySelector(".server-status-text");
    tombol = elemen.querySelector(".server-status-retry");
    tombol.addEventListener("click", () => { cek(true); });
    document.body.appendChild(elemen);
  }

  function aturTinggi() {
    if (!elemen || elemen.hidden) {
      document.documentElement.style.removeProperty("--server-bar-h");
      return;
    }
    const tinggi = Math.ceil(elemen.getBoundingClientRect().height) || 0;
    document.documentElement.style.setProperty("--server-bar-h", tinggi + "px");
  }

  function tampil() {
    buatElemen();
    if (!elemen) return;
    if (timerSukses) { clearTimeout(timerSukses); timerSukses = 0; }
    if (isi) isi.innerHTML = ISI_NORMAL;
    if (!statusTampil) {
      statusTampil = true;
      document.documentElement.classList.add("server-down");
      if (timerUlang) clearInterval(timerUlang);
      timerUlang = setInterval(() => { if (statusTampil) cek(false); }, 120000);
    }
    elemen.hidden = false;
    aturTinggi();
  }

  function sembunyi() {
    statusTampil = false;
    if (timerSukses) { clearTimeout(timerSukses); timerSukses = 0; }
    document.documentElement.classList.remove("server-down");
    document.documentElement.style.removeProperty("--server-bar-h");
    if (timerUlang) { clearInterval(timerUlang); timerUlang = 0; }
    if (elemen) elemen.hidden = true;
  }

  function cek(manual) {
    if (sedangCek) return sedangCek;
    if (manual && tombol) { tombol.disabled = true; tombol.textContent = "Mencoba..."; }
    sedangCek = db.collection("accounts").limit(1).get()
      .then(() => {
        if (statusTampil) {
          if (isi) {
            isi.innerHTML = `
              <strong>Server sudah normal ✅</strong>
              <span>Game yang butuh internet sudah bisa dipakai lagi.</span>`;
          }
          timerSukses = setTimeout(sembunyi, 1500);
        }
        return true;
      })
      .catch((err) => {
        if (adalahKuota(err)) tampil();
        return false;
      })
      .finally(() => {
        sedangCek = null;
        if (tombol) { tombol.disabled = false; tombol.textContent = "Coba Lagi"; }
      });
    return sedangCek;
  }

  function lapor(err) {
    if (adalahKuota(err)) tampil();
    return err;
  }

  function bungkusJanji(fn) {
    return function wrapped(...args) {
      let hasil;
      try {
        hasil = fn.apply(this, args);
      } catch (err) {
        lapor(err);
        throw err;
      }
      if (hasil && typeof hasil.then === "function") {
        hasil.then(undefined, (err) => { lapor(err); });
      }
      return hasil;
    };
  }

  function bungkusSnapshot(fn) {
    return function wrapped(...args) {
      try {
        if (typeof args[0] === "function") {
          const errorAsli = args[1];
          args[1] = function (err) {
            lapor(err);
            if (typeof errorAsli === "function") return errorAsli.apply(this, arguments);
          };
        } else if (args[0] && typeof args[0] === "object") {
          const obs = args[0];
          const errorAsli = obs.error;
          args[0] = Object.assign({}, obs, {
            error: function (err) {
              lapor(err);
              if (typeof errorAsli === "function") return errorAsli.apply(this, arguments);
            },
          });
        }
      } catch (err) { /* biarkan pemanggilan asli jalan */ }
      return fn.apply(this, args);
    };
  }

  (function pasangPenjaga() {
    const F = window.firebase && window.firebase.firestore;
    if (!F || !F.Query || !F.DocumentReference) return;
    F.Query.prototype.get = bungkusJanji(F.Query.prototype.get);
    F.Query.prototype.onSnapshot = bungkusSnapshot(F.Query.prototype.onSnapshot);
    F.DocumentReference.prototype.get = bungkusJanji(F.DocumentReference.prototype.get);
    F.DocumentReference.prototype.set = bungkusJanji(F.DocumentReference.prototype.set);
    F.DocumentReference.prototype.update = bungkusJanji(F.DocumentReference.prototype.update);
    F.DocumentReference.prototype.delete = bungkusJanji(F.DocumentReference.prototype.delete);
    F.DocumentReference.prototype.onSnapshot = bungkusSnapshot(F.DocumentReference.prototype.onSnapshot);
    F.CollectionReference.prototype.add = bungkusJanji(F.CollectionReference.prototype.add);
    F.WriteBatch.prototype.commit = bungkusJanji(F.WriteBatch.prototype.commit);
    F.Firestore.prototype.runTransaction = bungkusJanji(F.Firestore.prototype.runTransaction);
  })();

  function mulai() {
    buatElemen();
    if (document.visibilityState === "visible") setTimeout(() => cek(false), 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai);
  else mulai();

  window.ServerStatus = {
    tampil,
    sembunyi,
    cek,
    lapor,
    aktif: () => statusTampil,
  };
})();
