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
