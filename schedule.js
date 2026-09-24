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

function getInfoBesok() {
  const tgl = getHariBesokSekolah();
  const namaHari = HARI[tgl.getDay()];
  return {
    tanggal: tgl,
    namaHari,
    tanggalFormatted: formatTanggalID(tgl),
    key: dateKey(tgl),
    mapel: jadwalMapel[namaHari] || [],
    seragam: jadwalSeragam[namaHari] || "-",
    piket: jadwalPiket[namaHari] || [],
    eskul: jadwalEskul[namaHari] || [],
  };
}
