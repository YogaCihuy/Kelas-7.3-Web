"use strict";

// Salinan nama dari data.js. Dipakai server sebagai fallback kalau dokumen
// accounts/{absen} belum ada. Nama panggilan yang sudah diedit tetap diambil
// dari accounts saat login.
const STUDENTS = {
  1: "Amar",
  2: "Akmal",
  3: "Bian",
  4: "Alek",
  5: "Icha",
  6: "Al",
  7: "Apple",
  8: "Ayla",
  9: "Charles",
  10: "Bayu",
  11: "Eza",
  12: "Fayyad",
  13: "Reja",
  14: "Inaya",
  15: "Natan",
  16: "Bianca",
  17: "Keenan",
  18: "Kenzie",
  19: "Keyvan",
  20: "Nisa",
  21: "Rindu",
  22: "Naufal",
  23: "Aksara",
  24: "Abi",
  25: "Fahri",
  26: "Rafa",
  27: "Saif",
  28: "Ben",
  29: "Yoga",
  30: "Aira",
  31: "Raisa",
  32: "Sofia",
};

function namaSiswa(absen) {
  return STUDENTS[Number(absen)] || `Siswa ${absen}`;
}

function daftarSiswa() {
  return Object.keys(STUDENTS).map((absen) => ({ absen: Number(absen), nama: STUDENTS[absen] }));
}

module.exports = { STUDENTS, namaSiswa, daftarSiswa };
