"use strict";

// Uji alur backend TableVerse tanpa Firebase (mock Firestore + HTTP lokal).
// Jalankan: npm test

process.env.TV_SESSION_SECRET = "tableverse-test-secret-0123456789";

const http = require("http");
const { boot } = require("./mock-firestore");

const db = boot();
const handler = require("../api/tableverse");

let server;
let base;
const hasil = [];

function assert(kondisi, pesan) {
  if (!kondisi) throw new Error(pesan);
}

async function post(action, body, token) {
  const res = await fetch(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...(body || {}) }),
  });
  const json = await res.json();
  return { status: res.status, ...json };
}

async function login(absen) {
  const res = await post("login", { absen, password: `73${absen}` });
  assert(res.ok && res.token, `login absen ${absen} gagal: ${JSON.stringify(res.error)}`);
  return { absen, token: res.token };
}

async function bersihkan(p) {
  const sync = await post("sync", {}, p.token);
  const rid = sync.currentRoom && sync.currentRoom.id;
  if (rid) await post("leaveRoom", { roomId: rid }, p.token);
}

async function buatRoom(gameId, pemain, visibilitas) {
  const [host, ...lain] = pemain;
  for (const p of pemain) await bersihkan(p);
  const create = await post("createRoom", { gameId, visibility: visibilitas || "public" }, host.token);
  assert(create.ok && create.room, `createRoom ${gameId} gagal: ${JSON.stringify(create.error)}`);
  const rid = create.room.id;
  for (const p of lain) {
    const join = await post("joinRoom", { roomId: rid }, p.token);
    assert(join.ok, `joinRoom ${gameId} gagal: ${JSON.stringify(join.error)}`);
  }
  return { rid, room: create.room, host };
}

async function siapkanSemua(rid, pemain) {
  for (const p of pemain) {
    const res = await post("ready", { roomId: rid, ready: true }, p.token);
    assert(res.ok, `ready gagal: ${JSON.stringify(res.error)}`);
  }
}

async function mulai(rid, host) {
  const res = await post("start", { roomId: rid }, host.token);
  assert(res.ok && res.room && res.room.status === "playing", `start gagal: ${JSON.stringify(res.error)}`);
  return res;
}

async function uji(nama, fn) {
  try {
    await fn();
    hasil.push({ nama, ok: true });
    console.log(`  PASS  ${nama}`);
  } catch (err) {
    hasil.push({ nama, ok: false, err });
    console.log(`  FAIL  ${nama}`);
    console.log(`        ${err.message}`);
  }
}

function cariInvite(toAbsen) {
  const map = db.data.get("tvInvites") || new Map();
  for (const [id, doc] of map) {
    if (Number(doc.toAbsen) === Number(toAbsen) && doc.status === "pending") return { id, doc };
  }
  return null;
}

async function main() {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      req.body = Buffer.concat(chunks).toString("utf8");
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (payload) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(payload));
        return res;
      };
      handler(req, res).catch((err) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: { message: String(err) } }));
      });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/tableverse`;
  console.log(`Mock API: ${base}\n`);

  const p1 = await login(11);
  const p2 = await login(12);
  const p3 = await login(13);

  await uji("login menolak password salah", async () => {
    const res = await post("login", { absen: 11, password: "salah" });
    assert(!res.ok && res.status === 401, "password salah seharusnya 401");
  });

  await uji("tidak bisa aksi tanpa token", async () => {
    const res = await post("sync", {});
    assert(!res.ok && res.status === 401, "sync tanpa token seharusnya 401");
  });

  await uji("Tic Tac Toe: room penuh, giliran, dan kemenangan + statistik", async () => {
    const { rid } = await buatRoom("ttt", [p1, p2]);

    const dobel = await post("joinRoom", { roomId: rid }, p2.token);
    assert(dobel.ok && dobel.room.players.length === 2, "join dobel tidak boleh menambah pemain");

    const penuh = await post("joinRoom", { roomId: rid }, p3.token);
    assert(!penuh.ok && penuh.error.code === "room-full", "pemain ke-3 harus ditolak (room-full)");

    await siapkanSemua(rid, [p1, p2]);
    const bukanHost = await post("start", { roomId: rid }, p2.token);
    assert(!bukanHost.ok, "non-host tidak boleh start");

    await mulai(rid, p1);

    const salahGiliran = await post("move", { roomId: rid, move: { index: 0 } }, p2.token);
    assert(!salahGiliran.ok && salahGiliran.error.code === "not-your-turn", "p2 belum boleh jalan");

    const langkah = [[p1, 4], [p2, 0], [p1, 2], [p2, 8], [p1, 6]];
    let terakhir = null;
    for (const [p, index] of langkah) {
      terakhir = await post("move", { roomId: rid, move: { index } }, p.token);
      assert(terakhir.ok, `move ttt ${index} gagal: ${JSON.stringify(terakhir.error)}`);
    }
    assert(terakhir.room.status === "finished", "game ttt harus selesai");
    assert(terakhir.room.winnerSlots.includes(0), "slot 0 harus menang");

    const profilA = await post("profile", {}, p1.token);
    const profilB = await post("profile", {}, p2.token);
    assert(profilA.player.stats.matches === 1 && profilA.player.stats.wins === 1, "statistik pemenang salah");
    assert(profilB.player.stats.matches === 1 && profilB.player.stats.losses === 1, "statistik pecundang salah");

    const riwayat = await post("history", {}, p1.token);
    assert(riwayat.history.some((h) => h.roomId === rid), "riwayat harus memuat pertandingan");

    const rematch = await post("rematch", { roomId: rid }, p1.token);
    assert(rematch.ok && rematch.room.status === "lobby", "rematch harus kembali ke lobby");

    await bersihkan(p1);
    await bersihkan(p2);
  });

  await uji("Chess: skakmat terdeteksi server", async () => {
    const { rid } = await buatRoom("chess", [p1, p2]);
    await siapkanSemua(rid, [p1, p2]);
    await mulai(rid, p1);

    const langkah = [
      [p1, { from: "f2", to: "f3" }],
      [p2, { from: "e7", to: "e5" }],
      [p1, { from: "g2", to: "g4" }],
      [p2, { from: "d8", to: "h4" }],
    ];
    let terakhir = null;
    for (const [p, move] of langkah) {
      terakhir = await post("move", { roomId: rid, move }, p.token);
      assert(terakhir.ok, `move chess gagal: ${JSON.stringify(terakhir.error)}`);
    }
    assert(terakhir.room.status === "finished", "chess harus selesai");
    assert(terakhir.room.state.status === "checkmate", "status harus checkmate");
    assert(terakhir.room.winnerSlots.includes(1), "hitam (slot 1) harus menang");
    await bersihkan(p1);
    await bersihkan(p2);
  });

  await uji("Checkers: langkah ilegal ditolak, langkah legal diterima", async () => {
    const { rid } = await buatRoom("checkers", [p1, p2]);
    await siapkanSemua(rid, [p1, p2]);
    await mulai(rid, p1);

    const ilegal = await post("move", { roomId: rid, move: { from: [2, 1], to: [3, 0] } }, p1.token);
    assert(!ilegal.ok, "merah tidak boleh menggerakkan bidak hitam");

    const legal = await post("move", { roomId: rid, move: { from: [5, 0], to: [4, 1] } }, p1.token);
    assert(legal.ok, `langkah checkers legal gagal: ${JSON.stringify(legal.error)}`);
    assert(legal.room.state.turn === 1, "giliran harus pindah ke hitam");

    const balas = await post("move", { roomId: rid, move: { from: [2, 1], to: [3, 0] } }, p2.token);
    assert(balas.ok, `balasan hitam gagal: ${JSON.stringify(balas.error)}`);
    await bersihkan(p1);
    await bersihkan(p2);
  });

  await uji("Ludo: lempar dadu dan validasi langkah", async () => {
    const { rid } = await buatRoom("ludo", [p1, p2]);
    await siapkanSemua(rid, [p1, p2]);
    await mulai(rid, p1);

    const roll = await post("move", { roomId: rid, move: { type: "roll" } }, p1.token);
    assert(roll.ok, `roll ludo gagal: ${JSON.stringify(roll.error)}`);
    assert(roll.room.state.dice >= 1 && roll.room.state.dice <= 6, "dadu harus 1..6");

    const ilegal = await post("move", { roomId: rid, move: { type: "move", token: 9 } }, p1.token);
    assert(!ilegal.ok, "token 9 tidak ada");
    await bersihkan(p1);
    await bersihkan(p2);
  });

  await uji("Ular Tangga: lempar dadu menggerakkan pion", async () => {
    const { rid } = await buatRoom("snakes", [p1, p2]);
    await siapkanSemua(rid, [p1, p2]);
    await mulai(rid, p1);

    const roll = await post("move", { roomId: rid, move: { type: "roll" } }, p1.token);
    assert(roll.ok, `roll snakes gagal: ${JSON.stringify(roll.error)}`);
    const dadu = roll.room.state.dice;
    assert(dadu >= 1 && dadu <= 6, "dadu harus 1..6");
    assert(typeof roll.room.state.positions[0] === "number", "posisi pion harus ada");
    await bersihkan(p1);
    await bersihkan(p2);
  });

  await uji("UNO: kartu lawan & dek tidak bocor, ambil kartu berfungsi", async () => {
    const { rid } = await buatRoom("uno", [p1, p2]);
    await siapkanSemua(rid, [p1, p2]);
    await mulai(rid, p1);

    const s1 = await post("state", { roomId: rid }, p1.token);
    const st = s1.room.state;
    assert(Array.isArray(s1.hand) && s1.hand.length === 7, "pemain harus pegang 7 kartu");
    assert(!("hands" in st) && !("deck" in st) && !("hand" in st), "state publik tidak boleh memuat tangan/dek");
    assert(!JSON.stringify(st).includes('"cards"'), "state publik tidak boleh memuat isi kartu");
    assert(st.handCounts[String(p2.absen)] === 7, "jumlah kartu lawan harus terlihat");

    const palsu = await post("move", { roomId: rid, move: { type: "play", cardId: "palsu-123" } }, p1.token);
    assert(!palsu.ok, "kartu yang tidak dipegang harus ditolak");

    const ambil = await post("move", { roomId: rid, move: { type: "draw" } }, p1.token);
    assert(ambil.ok, `draw uno gagal: ${JSON.stringify(ambil.error)}`);
    assert(Array.isArray(ambil.hand) && ambil.hand.length === 8, "setelah ambil kartu, tangan jadi 8");

    // Kartu hasil ambil bisa dimainkan -> giliran tetap + drawOpen (boleh pass).
    // Kalau tidak bisa dimainkan, server otomatis mengakhiri giliran.
    const lewat = await post("move", { roomId: rid, move: { type: "pass" } }, p1.token);
    if (ambil.room.state.drawOpen && ambil.room.state.drawOpen.slot === 0) {
      assert(lewat.ok, `pass uno gagal: ${JSON.stringify(lewat.error)}`);
      assert(lewat.room.state.turn === 1, "setelah pass giliran harus pindah");
    } else {
      assert(!lewat.ok && lewat.error.code === "not-your-turn", "tanpa drawOpen, pass harus ditolak");
    }
    await bersihkan(p1);
    await bersihkan(p2);
  });

  await uji("Undangan: anti-duplikat, terima, dan kedaluwarsa 2 menit", async () => {
    await bersihkan(p1);
    await bersihkan(p2);
    await bersihkan(p3);

    const kirim = await post("invite", { gameId: "ttt", toAbsen: [p2.absen] }, p1.token);
    assert(kirim.ok && kirim.room, `invite gagal: ${JSON.stringify(kirim.error)}`);

    const dobel = await post("invite", { gameId: "ttt", toAbsen: [p2.absen] }, p1.token);
    assert(dobel.ok && dobel.invited.length === 0, "undangan duplikat harus dilewati");

    const masuk = await post("myInvites", {}, p2.token);
    assert(masuk.inbound.length === 1 && masuk.inbound[0].status === "pending", "undangan masuk harus 1");

    const terima = await post("respondInvite", { inviteId: masuk.inbound[0].id, accept: true }, p2.token);
    assert(terima.ok && terima.room.players.length === 2, "menerima undangan harus masuk room");

    await bersihkan(p1);
    await bersihkan(p2);

    const kirim2 = await post("invite", { gameId: "ttt", toAbsen: [p3.absen] }, p1.token);
    assert(kirim2.ok, "invite kedua gagal");
    const undangan = cariInvite(p3.absen);
    assert(undangan, "dokumen undangan tidak ditemukan");
    await db.collection("tvInvites").doc(undangan.id).set({ expiresAt: Date.now() - 5000 }, { merge: true });

    const telat = await post("respondInvite", { inviteId: undangan.id, accept: true }, p3.token);
    assert(!telat.ok && telat.expired === true, "undangan kedaluwarsa harus ditolak");

    await bersihkan(p1);
  });

  await uji("Keluar saat bertanding dihitung kalah", async () => {
    const { rid } = await buatRoom("ttt", [p1, p2]);
    await siapkanSemua(rid, [p1, p2]);
    await mulai(rid, p1);
    const keluar = await post("leaveRoom", { roomId: rid }, p1.token);
    assert(keluar.ok && keluar.finished, "keluar saat main harus menyelesaikan game");
    assert(keluar.room.winnerSlots.includes(1), "pemain yang bertahan harus menang");
    await bersihkan(p2);
  });

  await uji("Cleanup room lobby basi", async () => {
    const { rid } = await buatRoom("ttt", [p1]);
    const room = await db.collection("tvRooms").doc(rid).get();
    const data = room.data();
    data.lastActivity = Date.now() - 46 * 60 * 1000;
    await db.collection("tvRooms").doc(rid).set(data);
    await post("sync", {}, p1.token);
    // cleanup berjalan otomatis di listRooms (throttle 10 menit, panggilan pertama pasti jalan)
    const rooms = await post("listRooms", { gameId: "ttt" }, p1.token);
    assert(!rooms.rooms.some((r) => r.id === rid), "room basi harus dibersihkan");
    await bersihkan(p1);
  });

  const gagal = hasil.filter((h) => !h.ok).length;
  console.log(`\n${hasil.length - gagal}/${hasil.length} uji lulus.`);
  server.close();
  process.exit(gagal ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  if (server) server.close();
  process.exit(1);
});
