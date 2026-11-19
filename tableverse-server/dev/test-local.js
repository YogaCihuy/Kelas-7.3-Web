/* test-local.js
   Tes alur TableVerse tanpa server/Vercel, memakai Firestore tiruan.
   Jalankan: node tableverse-server/dev/test-local.js */
"use strict";

const path = require("path");

global.window = globalThis;

const SISWA = [
  { absen: 1, namaPanggilan: "Alya", namaLengkap: "Alya Putri" },
  { absen: 2, namaPanggilan: "Bima", namaLengkap: "Bima Saputra" },
  { absen: 3, namaPanggilan: "Citra", namaLengkap: "Citra Dewi" },
  { absen: 4, namaPanggilan: "Dimas", namaLengkap: "Dimas Prakoso" },
  { absen: 5, namaPanggilan: "Eka", namaLengkap: "Eka Lestari" },
  { absen: 6, namaPanggilan: "Fajar", namaLengkap: "Fajar Nugroho" },
  { absen: 7, namaPanggilan: "Gita", namaLengkap: "Gita Maharani" },
];
global.dataSiswa = SISWA;

const { createFakeFirestore } = require("./fake-firestore");
global.db = createFakeFirestore();

require(path.join(__dirname, "../../tableverse-chess.js"));
require(path.join(__dirname, "../../tableverse-local.js"));

const TV = window.TableVerseLocal;
const GAME_IDS = ["ttt", "checkers", "chess", "ludo", "snakes", "stick"];
const RANDOM_ASLI = Math.random;

let lulus = 0;
const gagal = [];

function nama(absen) {
  const s = SISWA.find((x) => x.absen === Number(absen));
  return s ? s.namaPanggilan : `Siswa ${absen}`;
}

function pakaiUser(absen) {
  global.currentUser = absen
    ? { absen: Number(absen), namaPanggilan: nama(absen), namaLengkap: nama(absen) }
    : null;
}

async function panggil(absen, action, body) {
  pakaiUser(absen);
  try {
    return await TV.call(action, body || {});
  } catch (err) {
    console.log(`ERROR ${absen} ${action} ${JSON.stringify(body || {})} -> ${err.code}: ${err.message}`);
    throw err;
  }
}

function cek(syarat, label, detail) {
  if (syarat) {
    lulus += 1;
  } else {
    gagal.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function cekError(label, kode, fn) {
  try {
    await fn();
    cek(false, label, "tidak melempar error");
  } catch (err) {
    cek(err.code === kode, label, `kode ${err.code} != ${kode} (${err.message})`);
  }
}

function dadu(n) {
  Math.random = () => (n - 1) / 6 + 0.001;
}

function lepasDadu() {
  Math.random = RANDOM_ASLI;
}

async function main() {
  /* ---------- ping & login ---------- */
  const ping = await panggil(1, "ping");
  cek(ping.ok === true, "ping ok");
  const ids = ping.games.map((g) => g.id);
  cek(ids.length === 6 && GAME_IDS.every((id) => ids.includes(id)), "katalog 6 game tanpa UNO", ids.join(","));

  const login1 = await panggil(1, "login", { absen: 1 });
  cek(login1.ok && login1.token === "local" && login1.player.absen === 1, "login lokal");

  const sync1 = await panggil(1, "sync");
  cek(sync1.ok && sync1.profile && sync1.profile.nama === "Alya", "sync membuat profil pemain");
  const daftar = await panggil(1, "players");
  cek(daftar.players.length === SISWA.length && daftar.players[0].online, "daftar pemain online");

  /* ---------- TIC TAC TOE: menang, seri, forfeit ---------- */
  const tttRoom = await panggil(1, "createRoom", { gameId: "ttt", visibility: "public" });
  const rid = tttRoom.room.id;
  cek(tttRoom.room.status === "lobby" && tttRoom.room.gameId === "ttt", "TTT room dibuat");

  const daftarRoom = await panggil(1, "listRooms", { gameId: "ttt" });
  cek(daftarRoom.rooms.some((r) => r.id === rid), "TTT room publik muncul di daftar");

  await panggil(2, "joinRoom", { roomId: rid });
  const isiTtt = await panggil(2, "state", { roomId: rid });
  cek(isiTtt.room.players.length === 2, "TTT pemain kedua join");
  await cekError("TTT room penuh menolak pemain ketiga", "room-full", () => panggil(3, "joinRoom", { roomId: rid }));

  await panggil(1, "ready", { roomId: rid, ready: true });
  await cekError("TTT start ditolak kalau belum semua ready", "not-ready", () => panggil(1, "start", { roomId: rid }));
  await panggil(2, "ready", { roomId: rid, ready: true });
  await cekError("TTT hanya host yang bisa start", "forbidden", () => panggil(2, "start", { roomId: rid }));
  const mulaiTtt = await panggil(1, "start", { roomId: rid });
  cek(mulaiTtt.room.status === "playing" && mulaiTtt.room.turnSlot === 0, "TTT pertandingan mulai");
  await cekError("TTT tidak bisa join setelah mulai", "room-started", () => panggil(3, "joinRoom", { roomId: rid }));

  await panggil(1, "move", { roomId: rid, move: { index: 0 } });
  await cekError("TTT menolak langkah di luar giliran", "not-your-turn", () => panggil(1, "move", { roomId: rid, move: { index: 1 } }));
  await cekError("TTT menolak kotak terisi", "invalid-move", () => panggil(2, "move", { roomId: rid, move: { index: 0 } }));
  await panggil(2, "move", { roomId: rid, move: { index: 3 } });
  await panggil(1, "move", { roomId: rid, move: { index: 1 } });
  await panggil(2, "move", { roomId: rid, move: { index: 4 } });
  const menangTtt = await panggil(1, "move", { roomId: rid, move: { index: 2 } });
  cek(menangTtt.room.status === "finished" && menangTtt.room.winnerSlots[0] === 0 && !menangTtt.room.draw, "TTT X menang");
  cek(!!menangTtt.room.result && menangTtt.room.result.winners[0].absen === 1, "TTT hasil mencatat pemenang");
  cek(!!menangTtt.room.historyId, "TTT history id dibuat");

  const profil1a = await panggil(1, "profile");
  const profil2a = await panggil(2, "profile");
  cek(profil1a.player.stats.matches === 1 && profil1a.player.stats.wins === 1, "statistik pemenang TTT");
  cek(profil2a.player.stats.matches === 1 && profil2a.player.stats.losses === 1, "statistik pecundang TTT");

  const riwayat1 = await panggil(1, "history");
  cek(riwayat1.history.length === 1 && riwayat1.history[0].winnerAbsens.includes(1), "riwayat pertandingan TTT");

  await cekError("TTT rematch hanya host", "forbidden", () => panggil(2, "rematch", { roomId: rid }));
  const ulang = await panggil(1, "rematch", { roomId: rid });
  cek(ulang.room.status === "lobby" && ulang.room.state === null && ulang.room.turnSlot === null, "TTT rematch kembali ke lobby");

  await panggil(1, "ready", { roomId: rid, ready: true });
  await panggil(2, "ready", { roomId: rid, ready: true });
  await panggil(1, "start", { roomId: rid });
  const seri = await (async () => {
    const langkah = [[1, 0], [2, 1], [1, 2], [2, 4], [1, 3], [2, 5], [1, 7], [2, 6], [1, 8]];
    let res = null;
    for (const [absen, index] of langkah) {
      res = await panggil(absen, "move", { roomId: rid, move: { index } });
    }
    return res;
  })();
  cek(seri.room.status === "finished" && seri.room.draw === true && seri.room.winnerSlots.length === 0, "TTT seri saat papan penuh");

  await panggil(1, "rematch", { roomId: rid });
  await panggil(1, "ready", { roomId: rid, ready: true });
  await panggil(2, "ready", { roomId: rid, ready: true });
  await panggil(1, "start", { roomId: rid });
  const kabur = await panggil(2, "leaveRoom", { roomId: rid });
  cek(kabur.finished === true && kabur.room.winnerSlots[0] === 0 && kabur.room.status === "finished", "TTT keluar saat main = kalah");
  await panggil(1, "leaveRoom", { roomId: rid });

  /* ---------- CHECKERS: wajib lompat + lompat beruntun ---------- */
  const chk = await panggil(3, "createRoom", { gameId: "checkers", visibility: "public" });
  const crid = chk.room.id;
  await panggil(4, "joinRoom", { roomId: crid });
  await panggil(3, "ready", { roomId: crid, ready: true });
  await panggil(4, "ready", { roomId: crid, ready: true });
  await panggil(3, "start", { roomId: crid });
  await cekError("Checkers menolak langkah tidak legal", "invalid-move", () =>
    panggil(3, "move", { roomId: crid, move: { from: [0, 0], to: [1, 1] } })
  );
  await panggil(3, "move", { roomId: crid, move: { from: [5, 2], to: [4, 3] } });
  await panggil(4, "move", { roomId: crid, move: { from: [2, 1], to: [3, 2] } });
  const lompat1 = await panggil(3, "move", { roomId: crid, move: { from: [4, 3], to: [2, 1] } });
  const sisaHitam = Object.values(lompat1.room.state.board).reduce((n, row) => n + row.filter((p) => p === "b" || p === "B").length, 0);
  cek(lompat1.room.state.pending === null && lompat1.room.state.turn === 1, "Checkers giliran pindah setelah lompat");
  cek(sisaHitam === 11, "Checkers bidak lawan tertangkap", String(sisaHitam));
  cek(
    lompat1.room.state.board && !Array.isArray(lompat1.room.state.board) && Object.keys(lompat1.room.state.board).length === 8,
    "Checkers papan disimpan sebagai map (aman Firestore)"
  );

  const chkEngine = TV.GAMES.checkers;
  const papan = {};
  for (let r = 0; r < 8; r += 1) papan[r] = Array(8).fill(null);
  papan[4][1] = "r";
  papan[3][2] = "b";
  papan[1][2] = "b";
  const chkState = { board: papan, turn: 0, pending: null, sinceCapture: 0, lastMove: null };
  const lompatA = chkEngine.move(chkState, 0, { from: [4, 1], to: [2, 3] });
  cek(lompatA.state.pending && lompatA.state.pending.slot === 0, "Checkers lompatan beruntun menunggu bidak yang sama");
  await cekError("Checkers menolak bidak lain saat lompat beruntun", "invalid-move", async () => {
    chkEngine.move(lompatA.state, 0, { from: [5, 0], to: [4, 1] });
  });
  const lompatB = chkEngine.move(lompatA.state, 0, { from: [2, 3], to: [0, 1] });
  cek(lompatB.finished === true && lompatB.winners[0] === 0, "Checkers lompat ganda menghabiskan bidak lawan");
  const chkKabur = await panggil(4, "leaveRoom", { roomId: crid });
  cek(chkKabur.finished === true && chkKabur.room.winnerSlots[0] === 0, "Checkers keluar = lawan menang");
  await panggil(3, "leaveRoom", { roomId: crid });

  /* ---------- CHESS: langkah legal + skakmat ---------- */
  const chm = await panggil(1, "createRoom", { gameId: "chess", visibility: "public" });
  const mrid = chm.room.id;
  await panggil(2, "joinRoom", { roomId: mrid });
  await panggil(1, "ready", { roomId: mrid, ready: true });
  await panggil(2, "ready", { roomId: mrid, ready: true });
  await panggil(1, "start", { roomId: mrid });
  await cekError("Chess menolak langkah lawan", "not-your-turn", () =>
    panggil(2, "move", { roomId: mrid, move: { from: "e7", to: "e5" } })
  );
  await panggil(1, "move", { roomId: mrid, move: { from: "e2", to: "e4" } });
  await panggil(2, "move", { roomId: mrid, move: { from: "e7", to: "e5" } });
  await cekError("Chess menolak langkah ilegal", "invalid-move", () =>
    panggil(1, "move", { roomId: mrid, move: { from: "f1", to: "e3" } })
  );
  await panggil(1, "move", { roomId: mrid, move: { from: "f1", to: "c4" } });
  await panggil(2, "move", { roomId: mrid, move: { from: "b8", to: "c6" } });
  await panggil(1, "move", { roomId: mrid, move: { from: "d1", to: "h5" } });
  await panggil(2, "move", { roomId: mrid, move: { from: "g8", to: "f6" } });
  const skakmat = await panggil(1, "move", { roomId: mrid, move: { from: "h5", to: "f7" } });
  cek(skakmat.room.status === "finished" && skakmat.room.state.status === "checkmate", "Chess skakmat terdeteksi");
  cek(skakmat.room.winnerSlots[0] === 0 && /skakmat/i.test(skakmat.room.lastEvent), "Chess pemenang skakmat");
  await panggil(1, "leaveRoom", { roomId: mrid });
  await panggil(2, "leaveRoom", { roomId: mrid });

  /* ---------- LUDO: dadu, tangkap, 57 ---------- */
  const ludo = await panggil(2, "createRoom", { gameId: "ludo", visibility: "public" });
  const lrid = ludo.room.id;
  await panggil(4, "joinRoom", { roomId: lrid });
  await panggil(2, "ready", { roomId: lrid, ready: true });
  await panggil(4, "ready", { roomId: lrid, ready: true });
  await panggil(2, "start", { roomId: lrid });

  dadu(6);
  await panggil(2, "move", { roomId: lrid, move: { type: "roll" } });
  let ludoRes = await panggil(2, "move", { roomId: lrid, move: { type: "move", token: 0 } });
  cek(ludoRes.room.state.tokens[0][0] === 0, "Ludo bidak keluar dari base dengan dadu 6");
  cek(
    ludoRes.room.state.tokens && !Array.isArray(ludoRes.room.state.tokens) && Object.keys(ludoRes.room.state.tokens).length === 2,
    "Ludo bidak disimpan sebagai map (aman Firestore)"
  );
  for (let i = 0; i < 9; i += 1) {
    await panggil(2, "move", { roomId: lrid, move: { type: "roll" } });
    ludoRes = await panggil(2, "move", { roomId: lrid, move: { type: "move", token: 0 } });
  }
  cek(ludoRes.room.state.tokens[0][0] === 54, "Ludo bidak maju ke 54 dengan dadu 6", String(ludoRes.room.state.tokens[0][0]));
  dadu(3);
  await panggil(2, "move", { roomId: lrid, move: { type: "roll" } });
  const ludoSelesai = await panggil(2, "move", { roomId: lrid, move: { type: "move", token: 0 } });
  lepasDadu();
  cek(ludoSelesai.room.state.tokens[0][0] === 57 && ludoSelesai.room.status === "playing", "Ludo satu bidak sampai rumah (57)");

  const ludoEngineWin = TV.GAMES.ludo;
  dadu(3);
  const ludoRollWin = ludoEngineWin.move(
    { tokens: { 0: [57, 57, 57, 54], 1: [-1, -1, -1, -1] }, turn: 0, dice: null, rolled: false },
    0,
    { type: "roll" },
    { rngInt: (max) => Math.floor(Math.random() * max) }
  );
  const ludoSemua = ludoEngineWin.move(ludoRollWin.state, 0, { type: "move", token: 3 }, { rngInt: () => 0 });
  lepasDadu();
  cek(ludoSemua.finished === true && ludoSemua.winners[0] === 0, "Ludo menang saat semua bidak di rumah");

  const ludoKabur = await panggil(4, "leaveRoom", { roomId: lrid });
  cek(ludoKabur.finished === true && ludoKabur.room.winnerSlots[0] === 0, "Ludo keluar saat main = lawan menang");
  await panggil(2, "leaveRoom", { roomId: lrid });

  const ludoEngine = TV.GAMES.ludo;
  dadu(1);
  const ludoRoll = ludoEngine.move(
    { tokens: { 0: [3, -1, -1, -1], 1: [43, -1, -1, -1] }, turn: 0, dice: null, rolled: false },
    0,
    { type: "roll" },
    { rngInt: (max) => Math.floor(Math.random() * max) }
  );
  const ludoTangkap = ludoEngine.move(ludoRoll.state, 0, { type: "move", token: 0 }, { rngInt: () => 0 });
  lepasDadu();
  cek(
    ludoTangkap.state.tokens[0][0] === 4 &&
      ludoTangkap.state.tokens[1][0] === -1 &&
      ludoTangkap.state.turn === 0,
    "Ludo menangkap bidak lawan dan dapat giliran tambahan"
  );

  /* ---------- SNAKES: tangga, ular, finis ---------- */
  const snk = await panggil(4, "createRoom", { gameId: "snakes", visibility: "public" });
  const srid = snk.room.id;
  await panggil(5, "joinRoom", { roomId: srid });
  await panggil(4, "ready", { roomId: srid, ready: true });
  await panggil(5, "ready", { roomId: srid, ready: true });
  const mulaiSnk = await panggil(4, "start", { roomId: srid });
  const petaSnk = mulaiSnk.room.state;
  cek(
    !Array.isArray(petaSnk.ladders) && !Array.isArray(petaSnk.snakes) &&
      Object.keys(petaSnk.ladders || {}).length === 8 && Object.keys(petaSnk.snakes || {}).length === 8,
    "Ular Tangga punya 8 tangga + 8 ular (map, aman Firestore)"
  );
  cek(Object.keys(petaSnk.ladders).every((k) => Number(petaSnk.ladders[k]) > Number(k)), "semua tangga naik");
  cek(Object.keys(petaSnk.snakes).every((k) => Number(petaSnk.snakes[k]) < Number(k)), "semua ular turun");

  dadu(1);
  const snkRoll = await panggil(4, "move", { roomId: srid, move: { type: "roll" } });
  cek(snkRoll.room.state.positions[0] === 1 && /kotak 1/.test(snkRoll.room.lastEvent), "Ular Tangga dadu 1 pindah ke kotak 1");
  cek(!!snkRoll.room.state.lastMove && snkRoll.room.state.lastMove.dice === 1, "Ular Tangga mencatat langkah terakhir");

  const snakesEngine = TV.GAMES.snakes;
  const petaUji = { ladders: { 4: 40 }, snakes: { 16: 6 } };
  const snakeLadder = snakesEngine.move(
    { positions: [3, 0], turn: 0, dice: null, lastRoll: null, ladders: petaUji.ladders, snakes: petaUji.snakes },
    0,
    { type: "roll" },
    { rngInt: () => 0 }
  );
  cek(snakeLadder.state.positions[0] === 40 && /tangga/i.test(snakeLadder.state.lastEvent), "Ular Tangga naik tangga 4 ke 40");

  const snakeJump = snakesEngine.move(
    { positions: [15, 0], turn: 0, dice: null, lastRoll: null, ladders: petaUji.ladders, snakes: petaUji.snakes },
    0,
    { type: "roll" },
    { rngInt: () => 0 }
  );
  cek(snakeJump.state.positions[0] === 6 && /ular/i.test(snakeJump.state.lastEvent), "Ular Tangga kena ular 16 ke 6");

  const snakeFinish = snakesEngine.move(
    { positions: [99, 0], turn: 0, dice: null, lastRoll: null, ladders: petaUji.ladders, snakes: petaUji.snakes },
    0,
    { type: "roll" },
    { rngInt: () => 0 }
  );
  lepasDadu();
  cek(
    snakeFinish.finished === true &&
      snakeFinish.winners[0] === 0 &&
      snakeFinish.state.positions[0] === 100 &&
      /100/.test(snakeFinish.state.lastEvent),
    "Ular Tangga menang saat mendarat di 100"
  );

  const petaRng1 = snakesEngine.create([{}, {}], { rngInt: () => 0 }).state;
  const petaRng2 = snakesEngine.create([{}, {}], { rngInt: (n) => n - 1 }).state;
  cek(
    JSON.stringify(petaRng1.ladders) !== JSON.stringify(petaRng2.ladders) &&
      JSON.stringify(petaRng1.snakes) !== JSON.stringify(petaRng2.snakes),
    "Peta ular & tangga berbeda tiap pertandingan"
  );
  const snkKabur = await panggil(5, "leaveRoom", { roomId: srid });
  cek(snkKabur.finished === true && snkKabur.room.winnerSlots[0] === 0, "Ular Tangga keluar saat main = lawan menang");
  await panggil(4, "leaveRoom", { roomId: srid });

  /* ---------- UNDANGAN & ROOM PRIVAT ---------- */
  const priv = await panggil(5, "createRoom", { gameId: "ttt", visibility: "private" });
  const prid = priv.room.id;
  const undang = await panggil(5, "invite", { gameId: "ttt", toAbsen: [6] });
  cek(undang.invited.length === 1 && undang.room.visibility === "private", "Undangan membuat room privat");
  const masuk6 = await panggil(6, "myInvites");
  cek(masuk6.inbound.some((i) => i.roomId === prid && i.fromAbsen === 5), "Undangan masuk ke pemain tujuan");
  const iid = masuk6.inbound.find((i) => i.roomId === prid).id;
  await cekError("respondInvite menolak id undangan asal-asalan", "not-found", () =>
    panggil(6, "respondInvite", { inviteId: "ttt", accept: true })
  );
  const diterima = await panggil(6, "respondInvite", { inviteId: iid, accept: true });
  cek(diterima.joined === true && diterima.room.players.length === 2, "Undangan diterima dan pemain masuk room");
  const tendang = await panggil(5, "kick", { roomId: prid, absen: 6 });
  cek(tendang.room.players.length === 1, "Host bisa mengeluarkan pemain");

  const undangLagi = await panggil(5, "invite", { gameId: "ttt", toAbsen: [6] });
  cek(undangLagi.invited.length === 1, "Undangan bisa dikirim ulang");
  const tolak = await panggil(6, "respondInvite", { inviteId: `${prid}_5_6`, accept: false });
  cek(tolak.declined === true, "Undangan bisa ditolak");

  await panggil(5, "invite", { gameId: "ttt", toAbsen: [6] });
  const iidKedaluwarsa = `${prid}_5_6`;
  const invLama = global.db.__get("tvInvites", iidKedaluwarsa);
  global.db.__set("tvInvites", iidKedaluwarsa, Object.assign({}, invLama, { expiresAt: Date.now() - 1000, status: "pending" }));
  const kedaluwarsa = await panggil(6, "respondInvite", { inviteId: iidKedaluwarsa, accept: true });
  cek(kedaluwarsa.expired === true, "Undangan kedaluwarsa setelah 2 menit");

  await cekError("Room privat menolak kode salah", "forbidden", () =>
    panggil(6, "joinRoom", { roomId: prid, code: "SALAH" })
  );
  const joinKode = await panggil(6, "joinRoom", { roomId: prid, code: prid });
  cek(joinKode.joined === true, "Room privat bisa dimasuki dengan kode benar");
  await panggil(6, "leaveRoom", { roomId: prid });

  const publik = await panggil(7, "createRoom", { gameId: "ttt", visibility: "public" });
  const rid7 = publik.room.id;
  const listSebelum = await panggil(5, "listRooms", { gameId: "ttt" });
  cek(listSebelum.rooms.some((r) => r.id === rid7) && !listSebelum.rooms.some((r) => r.id === prid), "Daftar room hanya menampilkan room publik");
  await panggil(7, "visibility", { roomId: rid7, visibility: "private" });
  const listSesudah = await panggil(5, "listRooms", { gameId: "ttt" });
  cek(!listSesudah.rooms.some((r) => r.id === rid7), "Room hilang dari daftar saat dijadikan privat");
  await cekError("Hanya host yang bisa ubah visibilitas", "forbidden", () =>
    panggil(6, "visibility", { roomId: rid7, visibility: "public" })
  );

  await panggil(6, "joinRoom", { roomId: rid7, code: rid7 });
  const hostPindah = await panggil(7, "leaveRoom", { roomId: rid7 });
  cek(hostPindah.room && hostPindah.room.hostAbsen === 6, "Status host pindah saat host keluar");
  const tutup = await panggil(6, "leaveRoom", { roomId: rid7 });
  cek(tutup.roomClosed === true && !global.db.__get("tvRooms", rid7), "Lobby ditutup saat pemain terakhir keluar");

  await panggil(5, "leaveRoom", { roomId: prid });

  /* ---------- STICK ESKRIM: giliran, power, Move, OOB, forfeit ---------- */
  const stickEngine = TV.GAMES.stick;
  cek(stickEngine.mode === "party" && stickEngine.minPlayers === 2 && stickEngine.maxPlayers === 4, "StickEskrim party 2-4 pemain");

  const stk = await panggil(5, "createRoom", { gameId: "stick", visibility: "public" });
  const stid = stk.room.id;
  cek(stk.room.status === "lobby" && stk.room.gameId === "stick" && stk.room.mode === "party", "StickEskrim room dibuat");
  await panggil(6, "joinRoom", { roomId: stid });
  await panggil(7, "joinRoom", { roomId: stid });
  await panggil(5, "ready", { roomId: stid, ready: true });
  await panggil(6, "ready", { roomId: stid, ready: true });
  await panggil(7, "ready", { roomId: stid, ready: true });
  const mulaiStk = await panggil(5, "start", { roomId: stid });
  cek(mulaiStk.room.status === "playing" && mulaiStk.room.state.sticks.length === 3, "StickEskrim mulai dengan 3 stick");
  cek(mulaiStk.room.state.sticks.every((s) => s.alive && s.movesLeft === 2), "StickEskrim tiap pemain punya 2 Move");
  cek(mulaiStk.room.turnSlot === 0, "StickEskrim pemain pertama jalan duluan");

  await cekError("StickEskrim menolak langkah di luar giliran", "not-your-turn", () =>
    panggil(6, "move", { roomId: stid, move: { type: "slap", angle: 90, power: 50 } })
  );
  await cekError("StickEskrim menolak power di bawah batas", "invalid-argument", () =>
    panggil(5, "move", { roomId: stid, move: { type: "slap", angle: 90, power: 5 } })
  );
  const pindahStk = await panggil(5, "move", { roomId: stid, move: { type: "move", x: 50, y: 36 } });
  cek(pindahStk.room.state.sticks[0].movesLeft === 1 && pindahStk.room.state.sticks[0].y === 36, "StickEskrim Move mengubah posisi dan mengurangi jatah");
  cek(pindahStk.room.turnSlot === 1 && pindahStk.room.state.lastAction.type === "move", "StickEskrim Move langsung habis giliran");

  const sk4 = stickEngine.create([{}, {}, {}, {}], {}).state;
  cek(sk4.sticks.length === 4 && sk4.sticks.every((s) => s.alive), "StickEskrim 4 pemain dapat 4 posisi simetris");

  const skHabis = stickEngine.create([{}, {}], {}).state;
  skHabis.sticks[0].movesLeft = 0;
  await cekError("StickEskrim menolak Move saat jatah habis", "no-moves", async () => {
    stickEngine.move(skHabis, 0, { type: "move", x: 50, y: 50 });
  });
  await cekError("StickEskrim menolak Move keluar arena", "out-of-bounds", async () => {
    stickEngine.move(stickEngine.create([{}, {}], {}).state, 0, { type: "move", x: 2, y: 50 });
  });

  const skHit = stickEngine.move(stickEngine.create([{}, {}], {}).state, 0, { type: "slap", angle: 90, power: 73 });
  cek(
    skHit.finished === true && skHit.winners[0] === 0 && skHit.state.sticks[1].alive === false,
    "StickEskrim tepokan pas kena stick lawan = tereliminasi"
  );

  const skLewatState = stickEngine.create([{}, {}], {}).state;
  skLewatState.sticks[0].y = 30;
  skLewatState.sticks[1].y = 50;
  const skLewat = stickEngine.move(skLewatState, 0, { type: "slap", angle: 90, power: 55 });
  cek(
    skLewat.state.sticks[1].alive === true && skLewat.state.sticks[0].y > 58 && skLewat.finished === false,
    "StickEskrim lewat di atas stick lawan tidak menghapus"
  );

  const skOob = stickEngine.move(stickEngine.create([{}, {}], {}).state, 0, { type: "slap", angle: 90, power: 100 });
  cek(
    skOob.state.lastAction.oob === true &&
      skOob.state.sticks[0].y === 16 &&
      skOob.state.sticks[0].alive && skOob.state.sticks[1].alive,
    "StickEskrim keluar arena balik ke posisi awal tanpa eliminasi"
  );

  const keluar7 = await panggil(7, "leaveRoom", { roomId: stid });
  cek(
    keluar7.finished === false && keluar7.room.status === "playing" && keluar7.room.state.sticks[2].alive === false,
    "StickEskrim forfeit = stick hilang, match lanjut"
  );
  const keluar6 = await panggil(6, "leaveRoom", { roomId: stid });
  cek(
    keluar6.finished === true && keluar6.room.status === "finished" && keluar6.room.winnerSlots[0] === 0,
    "StickEskrim sisa satu pemain = menang"
  );
  await panggil(5, "leaveRoom", { roomId: stid });

  /* ---------- STATISTIK AKHIR ---------- */
  const akhir1 = await panggil(1, "profile");
  const akhir2 = await panggil(2, "profile");
  cek(
    akhir1.player.stats.matches === 4 && akhir1.player.stats.wins === 3 && akhir1.player.stats.draws === 1,
    "Statistik Alya: 4 main, 3 menang, 1 seri",
    JSON.stringify(akhir1.player.stats)
  );
  cek(
    akhir2.player.stats.matches === 5 && akhir2.player.stats.wins === 1 && akhir2.player.stats.losses === 3 && akhir2.player.stats.draws === 1,
    "Statistik Bima: 5 main, 1 menang, 3 kalah, 1 seri",
    JSON.stringify(akhir2.player.stats)
  );
  const riwayatAkhir = await panggil(1, "history");
  cek(riwayatAkhir.history.length === 4, "Riwayat Alya berisi 4 pertandingan", String(riwayatAkhir.history.length));

  /* ---------- BENTUK DOKUMEN SESUAI FIRESTORE RULES ---------- */
  periksaBentuk();

  console.log(`\n${lulus} cek lulus, ${gagal.length} gagal.`);
  if (gagal.length) {
    console.log("\nDaftar gagal:");
    gagal.forEach((g) => console.log(`- ${g}`));
    process.exitCode = 1;
  }
}

/* ---------- validator bentuk dokumen (mirror firestore.rules) ---------- */
const IZIN = {
  tvPlayers: ["absen", "nama", "username", "stats", "lastSeen", "roomId", "roomStatus", "createdAt", "lastMatchAt"],
  tvRooms: [
    "id", "gameId", "gameTitle", "mode", "visibility", "code", "hostAbsen", "players",
    "minPlayers", "maxPlayers", "status", "state", "seq", "turnSlot", "handVersions",
    "winnerSlots", "draw", "result", "historyId", "createdAt", "startedAt", "finishedAt",
    "lastActivity", "lastEvent",
  ],
  tvInvites: ["id", "roomId", "fromAbsen", "fromNama", "toAbsen", "toNama", "gameId", "mode", "status", "createdAt", "expiresAt", "respondedAt"],
  tvHistory: ["roomId", "gameId", "gameTitle", "mode", "playerAbsens", "players", "winnerAbsens", "winnerNama", "draw", "durationMs", "startedAt", "finishedAt"],
};

function periksaBentuk() {
  const ids = new Set(GAME_IDS);
  const cekKunci = (col, id, data) => {
    const asing = Object.keys(data).filter((k) => !IZIN[col].includes(k));
    cek(asing.length === 0, `${col}/${id} tidak punya field asing`, asing.join(","));
  };

  global.db.__all("tvPlayers").forEach(({ id, data }) => {
    cekKunci("tvPlayers", id, data);
    cek(typeof data.absen === "number" && typeof data.nama === "string" && data.nama.length <= 60, `tvPlayers/${id} wajib absen & nama`);
    cek(!data.roomStatus || ["waiting", "playing", "finished"].includes(data.roomStatus), `tvPlayers/${id} roomStatus valid`);
    cek(!data.roomId || String(data.roomId).length <= 24, `tvPlayers/${id} roomId pendek`);
    cek(data.stats == null || (typeof data.stats === "object" && !Array.isArray(data.stats)), `tvPlayers/${id} stats map`);
  });

  global.db.__all("tvRooms").forEach(({ id, data }) => {
    cekKunci("tvRooms", id, data);
    cek(data.id === id && data.id.length <= 24, `tvRooms/${id} id konsisten`);
    cek(ids.has(data.gameId), `tvRooms/${id} gameId valid`);
    cek(typeof data.hostAbsen === "number", `tvRooms/${id} hostAbsen number`);
    cek(Array.isArray(data.players) && data.players.length >= 1 && data.players.length <= 4, `tvRooms/${id} players 1-4`);
    cek(["lobby", "playing", "finished"].includes(data.status), `tvRooms/${id} status valid`);
    cek(typeof data.seq === "number" && data.seq >= 0, `tvRooms/${id} seq valid`);
    cek(!data.mode || ["duel", "party"].includes(data.mode), `tvRooms/${id} mode valid`);
    cek(!data.visibility || ["public", "private"].includes(data.visibility), `tvRooms/${id} visibility valid`);
    cek(!data.state || (typeof data.state === "object" && !Array.isArray(data.state)), `tvRooms/${id} state map`);
    cek(data.turnSlot == null || (Number.isInteger(data.turnSlot) && data.turnSlot >= 0 && data.turnSlot <= 3), `tvRooms/${id} turnSlot valid`);
    cek(!data.handVersions || (typeof data.handVersions === "object" && !Array.isArray(data.handVersions)), `tvRooms/${id} handVersions map`);
    cek(!data.winnerSlots || Array.isArray(data.winnerSlots), `tvRooms/${id} winnerSlots list`);
    cek(typeof data.draw === "boolean", `tvRooms/${id} draw bool`);
    cek(data.result == null || (typeof data.result === "object" && !Array.isArray(data.result)), `tvRooms/${id} result map`);
    cek(data.historyId == null || typeof data.historyId === "string", `tvRooms/${id} historyId string`);
    cek(typeof data.createdAt === "number" && typeof data.lastActivity === "number", `tvRooms/${id} timestamp number`);
    cek(typeof data.lastEvent === "string" && data.lastEvent.length <= 300, `tvRooms/${id} lastEvent <=300`, data.lastEvent);
  });

  global.db.__all("tvInvites").forEach(({ id, data }) => {
    cekKunci("tvInvites", id, data);
    cek(data.id === id && data.id.length <= 200, `tvInvites/${id} id valid`);
    cek(typeof data.roomId === "string" && data.roomId.length <= 24, `tvInvites/${id} roomId valid`);
    cek(typeof data.fromAbsen === "number" && typeof data.toAbsen === "number", `tvInvites/${id} absen number`);
    cek(ids.has(data.gameId), `tvInvites/${id} gameId valid`);
    cek(["pending", "accepted", "declined", "expired"].includes(data.status), `tvInvites/${id} status valid`);
    cek(data.respondedAt == null || typeof data.respondedAt === "number", `tvInvites/${id} respondedAt valid`);
  });

  global.db.__all("tvHistory").forEach(({ id, data }) => {
    cekKunci("tvHistory", id, data);
    cek(typeof data.roomId === "string" && ids.has(data.gameId), `tvHistory/${id} roomId/gameId valid`);
    cek(Array.isArray(data.playerAbsens) && data.playerAbsens.length >= 1 && data.playerAbsens.length <= 4, `tvHistory/${id} playerAbsens 1-4`);
    cek(typeof data.finishedAt === "number", `tvHistory/${id} finishedAt number`);
    cek(data.players == null || Array.isArray(data.players), `tvHistory/${id} players list`);
    cek(data.winnerAbsens == null || Array.isArray(data.winnerAbsens), `tvHistory/${id} winnerAbsens list`);
  });
}

main().catch((err) => {
  console.error("Tes berhenti karena error tak terduga:", err);
  process.exitCode = 1;
});
