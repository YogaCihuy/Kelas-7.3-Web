// Daftar absen resmi kelas 7.3. Server hanya menerima absen yang ada di sini.
const STUDENTS = {
  1: "Amar", 2: "Akmal", 3: "Bian", 4: "Alek", 5: "Icha", 6: "Al", 7: "Apple",
  8: "Ayla", 9: "Charles", 10: "Bayu", 11: "Eza", 12: "Fayyad", 13: "Reja",
  14: "Inaya", 15: "Natan", 16: "Bianca", 17: "Keenan", 18: "Kenzie", 19: "Keyvan",
  20: "Nisa", 21: "Rindu", 22: "Naufal", 23: "Aksara", 24: "Abi", 25: "Fahri",
  26: "Rafa", 27: "Saif", 28: "Ben", 29: "Yoga", 30: "Aira", 31: "Raisa", 32: "Sofia",
};

function isValidAbsen(absen) {
  return Number.isInteger(absen) && Object.prototype.hasOwnProperty.call(STUDENTS, absen);
}

module.exports = { STUDENTS, isValidAbsen };
