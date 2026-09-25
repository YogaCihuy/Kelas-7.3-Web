// schedule.js
// Data jadwal tetap mingguan Kelas 7.3 (SMP Smart Cibinong, TP 2026-2027)
// Dipakai buat nampilin info "besok" secara otomatis di Tab Info.

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const jadwalMapel = {
  Senin: ["BK", "MTK", "B.Indo", "Pancasila"],
  Selasa: ["PJOK", "MTK", "B.Inggris"],
  Rabu: ["B.Sunda", "Informatika", "B.Indo", "IPA"],
  Kamis: ["IPA", "PAI", "IPS"],
  Jumat: ["Seni", "B.Indo"],
};

const jadwalSeragam = {
  Senin: "Putih - Putih",
  Selasa: "Putih - Biru (bawa baju ganti olahraga)",
  Rabu: "Pramuka",
  Kamis: "Putih - Biru - Rompi",
  Jumat: "Batik Biru",
};

// Piket per hari, nama sesuai nama panggilan di data.js
const jadwalPiket = {
  Senin: ["Alexa", "Amar", "Bayu", "Bianca", "Keenan", "Abi", "Ben"],
  Selasa: ["Icha", "Akmal", "Eza", "Nisa", "Kenzie", "Fahri", "Yoga"],
  Rabu: ["Ayla", "Bian", "Fayyad", "Rindu", "Keyvan", "Sofia"],
  Kamis: ["Ria", "Al", "Reja", "Aira", "Naufal", "Rafa"],
  Jumat: ["Inaya", "Apple", "Natan", "Raisa", "Mecca", "Saif"],
};

// Eskul: satu hari bisa lebih dari satu eskul jalan bareng
const jadwalEskul = {
  Senin: ["Club IT (14.00-16.00)", "FKP Musik (14.00-16.00)"],
  Selasa: ["Basket (14.00-16.00)", "FKP Tari (14.00-16.00)"],
  Rabu: ["Pramuka (14.00-16.00)"],
  Kamis: ["Paskibra (14.00-16.00)", "PMR (14.15-16.15)"],
  Jumat: ["Futsal (13.00-15.00)", "English Club (13.00-14.30)"],
};

// Cari hari sekolah berikutnya (skip Sabtu & Minggu), dihitung dari hari ini
function getHariBesokSekolah(dariTanggal = new Date()) {
  const tanggal = new Date(dariTanggal);
  do {
    tanggal.setDate(tanggal.getDate() + 1);
  } while (tanggal.getDay() === 0 || tanggal.getDay() === 6); // 0=Minggu, 6=Sabtu
  return tanggal;
}

function formatTanggalID(date) {
  return date.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// key tanggal dipake buat nyimpen override PR / status eskul di Firestore, format YYYY-MM-DD
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getJadwalUntukTanggal(date) {
  const namaHari = HARI[date.getDay()];
  return {
    tanggal: date,
    namaHari,
    tanggalFormatted: formatTanggalID(date),
    key: dateKey(date),
    mapel: jadwalMapel[namaHari] || [],
    seragam: jadwalSeragam[namaHari] || "-",
    piket: jadwalPiket[namaHari] || [],
    eskul: jadwalEskul[namaHari] || [],
  };
}

function getInfoBesok() {
  // Ganti "hari yang ditampilin" jam 12 siang, bukan jam 00:00 —
  // biar orang yang nyiapin buku pagi-pagi masih liat info hari itu juga,
  // bukan langsung loncat ke besoknya lagi.
  const sekarang = new Date();
  const acuan = new Date(sekarang);
  if (sekarang.getHours() < 12) {
    acuan.setDate(acuan.getDate() - 1);
  }

  const tgl = getHariBesokSekolah(acuan);
  return getJadwalUntukTanggal(tgl);
}

// Reverse-map: nama eskul -> hari (dipake buat validasi pilihan eskul siswa)
function getEskulHariMap() {
  const map = {};
  Object.entries(jadwalEskul).forEach(([hari, daftar]) => {
    daftar.forEach((entry) => {
      const nama = entry.split(" (")[0];
      map[nama] = hari;
    });
  });
  return map;
}

const ESKUL_WAJIB = ["Pramuka", "PMR", "Paskibra"];
function getDaftarEskulPilihan() {
  const map = getEskulHariMap();
  return Object.keys(map)
    .filter((nama) => !ESKUL_WAJIB.includes(nama))
    .map((nama) => ({ nama, hari: map[nama] }));
}
