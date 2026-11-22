/* test-rubik-engine.js
   Tes model kubus 3x3 tanpa browser.
   Jalankan: node tableverse-server/dev/test-rubik-engine.js */
"use strict";

const path = require("path");
const E = require(path.join(__dirname, "../../rubik-engine.js"));

let lulus = 0;
const gagal = [];

function cek(kondisi, nama, detail) {
  if (kondisi) {
    lulus += 1;
    return;
  }
  gagal.push(`${nama}${detail ? ` (${detail})` : ""}`);
}

function ulang(cube, alg, kali) {
  for (let i = 0; i < kali; i += 1) E.applyAlg(cube, alg);
  return cube;
}

// Solusi awal
const awal = new E.Cube();
cek(awal.isSolved(), "kubus baru langsung solved");
cek(awal.cubies.length === 26, "kubus 3x3 punya 26 cubie", String(awal.cubies.length));

// Empat putaran searah = kembali
E.FACES.forEach((f) => {
  const c = new E.Cube();
  for (let i = 0; i < 4; i += 1) c.turn(f, 1);
  cek(c.isSolved(), `4x putar ${f} balik solved`);
  const d = new E.Cube();
  d.turn(f, 1).turn(f, -1);
  cek(d.isSolved(), `${f} lalu ${f}' balik solved`);
  const h = new E.Cube();
  h.turn(f, 2).turn(f, 2);
  cek(h.isSolved(), `${f}2 dua kali balik solved`);
});

// Arah U: sticker F di atas pindah ke kiri
const u = new E.Cube();
u.turn("U", 1);
const cubieL = u.cubies.find((k) => k.pos.join("") === "022");
cek(cubieL && cubieL.stickers["-1,0,0"] === "F", "U memindah sticker depan atas ke kiri", cubieL && JSON.stringify(cubieL.stickers));

// Arah R: putaran searah jarum jam dilihat dari kanan, U pindah ke belakang
const r = new E.Cube();
r.turn("R", 1);
const cubieF = r.cubies.find((k) => k.pos.join("") === "212");
cek(cubieF && cubieF.stickers["0,0,1"] === "D", "R membawa sticker bawah ke depan", cubieF && JSON.stringify(cubieF.stickers));
const cubieB = r.cubies.find((k) => k.pos.join("") === "220");
cek(cubieB && cubieB.stickers["0,0,-1"] === "U", "R membawa sticker atas ke belakang", cubieB && JSON.stringify(cubieB.stickers));

// Trigger dasar punya orde yang dikenal
cek(ulang(new E.Cube(), "R U R' U'", 6).isSolved(), "sexy move 6x solved");
cek(ulang(new E.Cube(), "R U R' U R U2 R'", 6).isSolved(), "Sune 6x solved");
cek(ulang(new E.Cube(), "R U R' U' R' F R2 U' R' U' R U R' F'", 2).isSolved(), "T-perm 2x solved");
cek(ulang(new E.Cube(), "L' U' L U", 6).isSolved(), "trigger kiri 6x solved");

// Acak + kebalikannya
const acak = E.randomScramble(21);
cek(acak.length === 21, "scramble 21 langkah", String(acak.length));
let sama = false;
for (let i = 1; i < acak.length; i += 1) if (acak[i].face === acak[i - 1].face) sama = true;
cek(!sama, "scramble tidak mengulang muka yang sama");
const sc = new E.Cube();
E.applyAlg(sc, acak);
cek(!sc.isSolved(), "scramble mengubah kubus");
E.applyAlg(sc, E.invertAlg(acak));
cek(sc.isSolved(), "rumus kebalikan menyelesaikan scramble");

// Parser dan format
const tokens = E.parseAlg("(R U R' U') F2  L'");
cek(E.formatAlg(tokens) === "R U R' U' F2 L'", "parser membuang kurung dan spasi", E.formatAlg(tokens));
cek(E.parseAlg("R3 X M").length === 0, "token ngawur diabaikan");

// Salinan independen
const asli = new E.Cube();
const salinan = asli.clone();
salinan.turn("F", 1);
cek(asli.isSolved() && !salinan.isSolved(), "clone tidak mengubah kubus asli");
cek(!asli.equals(salinan), "equals mendeteksi perbedaan");

// Notasi ke move layer
const m = E.moveFromFace("U", 1);
cek(m.axis === 1 && m.layer === 2 && m.dir === -1, "U=clockwise memutar layer atas arah -y", JSON.stringify(m));
const mi = E.inverseMove(m);
const u2 = new E.Cube();
u2.turnAxis(m.axis, m.layer, m.dir, m.quarters);
u2.turnAxis(mi.axis, mi.layer, mi.dir, mi.quarters);
cek(u2.isSolved(), "inverseMove membatalkan putaran");

// Slice tengah lewat turnAxis
const slice = new E.Cube();
slice.turnAxis(0, 1, 1, 1);
cek(!slice.isSolved(), "slice tengah mengubah kubus");
slice.turnAxis(0, 1, -1, 1);
cek(slice.isSolved(), "slice tengah dibalik kembali");

console.log(`${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) {
  gagal.forEach((g) => console.log("  GAGAL:", g));
  process.exitCode = 1;
}
