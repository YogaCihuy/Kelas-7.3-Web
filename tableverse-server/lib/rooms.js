"use strict";

const { getDb } = require("./firebase");
const {
  HttpError,
  roomId,
  randomInt,
  cleanText,
  toMillis,
  profilePublic,
} = require("./util");
const { GAMES, ambil } = require("./games");
const { ensurePlayer, normalStats } = require("./auth");
const { catatHasil } = require("./stats");
const { STUDENTS, namaSiswa, daftarSiswa } = require("./students");

const INVITE_TTL = 2 * 60 * 1000;
const ONLINE_MS = 75 * 1000;
const MAX_INVITE_AGE = 24 * 60 * 60 * 1000;

let cleanupAt = 0;

function db() {
  return getDb();
}

function roomRef(id) {
  return db().collection("tvRooms").doc(String(id));
}

function playerRef(absen) {
  return db().collection("tvPlayers").doc(String(absen));
}

function inviteRef(id) {
  return db().collection("tvInvites").doc(String(id));
}

function inviteDocId(rid, from, to) {
  return `${rid}_${from}_${to}`;
}

function isMember(room, absen) {
  return !!room && room.players.some((p) => Number(p.absen) === Number(absen));
}

function slotOf(room, absen) {
  const p = room.players.find((x) => Number(x.absen) === Number(absen));
  return p ? p.slot : -1;
}

function roomBaru({ id, absen, nama, game, visibility }) {
  return {
    id,
    gameId: game.id,
    gameTitle: game.judul,
    mode: game.mode,
    visibility: visibility === "private" ? "private" : "public",
    code: id,
    hostAbsen: Number(absen),
    players: [
      { absen: Number(absen), nama, slot: 0, ready: false, joinedAt: Date.now(), left: false },
    ],
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    status: "lobby",
    state: null,
    seq: 0,
    turnSlot: null,
    handVersions: {},
    winnerSlots: [],
    draw: false,
    result: null,
    historyId: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    lastActivity: Date.now(),
    lastEvent: "",
  };
}

function statusRoom(room) {
  if (!room) return null;
  if (room.status === "playing") return "playing";
  if (room.status === "lobby") return "waiting";
  return "finished";
}

function publik(room) {
  return JSON.parse(JSON.stringify(room));
}

async function sync(absen) {
  const { ref, data, created } = await ensurePlayer(absen);
  const nowMs = Date.now();
  const patch = {};
  if (created || nowMs - (Number(data.lastSeen) || 0) > 45000) patch.lastSeen = nowMs;

  let room = null;
  if (data.roomId) {
    const snap = await roomRef(data.roomId).get();
    if (snap.exists) room = snap.data();
    else patch.roomId = null;
  }
  if (room) {
    const st = statusRoom(room);
    if (data.roomStatus !== st) patch.roomStatus = st;
  } else if (data.roomStatus) {
    patch.roomStatus = null;
  }

  if (Object.keys(patch).length) await ref.set(patch, { merge: true });
  const profile = { ...data, ...patch };
  return {
    ok: true,
    profile: profilePublic(profile),
    currentRoom: room ? publik(room) : null,
    serverNow: nowMs,
  };
}

async function daftarPemain() {
  const snap = await db().collection("tvPlayers").get();
  const map = {};
  snap.forEach((doc) => { map[doc.id] = doc.data(); });
  const nowMs = Date.now();
  return daftarSiswa().map((s) => {
    const p = map[String(s.absen)] || {};
    const online = nowMs - (Number(p.lastSeen) || 0) < ONLINE_MS;
    const status = !online
      ? "offline"
      : p.roomStatus === "playing"
        ? "playing"
        : p.roomStatus === "waiting"
          ? "in_lobby"
          : "online";
    return {
      absen: s.absen,
      nama: p.nama || s.nama,
      username: p.username || p.nama || s.nama,
      online,
      status,
      lastSeen: Number(p.lastSeen) || 0,
    };
  });
}

async function cleanup() {
  if (Date.now() - cleanupAt < 10 * 60 * 1000) return;
  cleanupAt = Date.now();
  try {
    const snap = await db().collection("tvRooms").where("status", "==", "lobby").limit(50).get();
    const nowMs = Date.now();
    const batch = db().batch();
    let jumlah = 0;
    snap.forEach((doc) => {
      const room = doc.data();
      if (nowMs - (Number(room.lastActivity) || 0) > 45 * 60 * 1000) {
        batch.delete(doc.ref);
        jumlah += 1;
      }
    });
    if (jumlah) await batch.commit();
  } catch (err) {
    console.error("cleanup room gagal:", err);
  }
}

async function listRooms(body) {
  await cleanup();
  const gameId = cleanText(body.gameId, 32);
  if (!gameId || !GAMES[gameId]) throw new HttpError(400, "Game tidak dikenal.", "invalid-argument");
  const snap = await db().collection("tvRooms").where("gameId", "==", gameId).limit(60).get();
  const rooms = [];
  snap.forEach((doc) => {
    const room = doc.data();
    if (room.status !== "lobby" || room.visibility !== "public") return;
    rooms.push(publik(room));
  });
  rooms.sort((a, b) => b.createdAt - a.createdAt);
  return { ok: true, rooms };
}

async function createRoom(absen, body) {
  const game = ambil(cleanText(body.gameId, 32));
  if (!game) throw new HttpError(400, "Game tidak dikenal.", "invalid-argument");
  const visibility = body.visibility === "private" ? "private" : "public";

  return db().runTransaction(async (tx) => {
    const pRef = playerRef(absen);
    const pSnap = await tx.get(pRef);
    const profile = pSnap.exists ? pSnap.data() : { absen, nama: namaSiswa(absen) };
    if (profile.roomId) {
      const rSnap = await tx.get(roomRef(profile.roomId));
      if (rSnap.exists) {
        const existing = rSnap.data();
        if (existing.status === "lobby" || existing.status === "playing") {
          return { ok: true, room: publik(existing), reused: true };
        }
      }
    }
    const id = roomId();
    const nama = profile.nama || namaSiswa(absen);
    const room = roomBaru({ id, absen, nama, game, visibility });
    tx.set(roomRef(id), room);
    tx.set(pRef, { roomId: id, roomStatus: "waiting", lastSeen: Date.now(), nama }, { merge: true });
    return { ok: true, room: publik(room), reused: false };
  });
}

async function joinRoom(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  const iid = cleanText(body.inviteId, 160);
  if (!rid) throw new HttpError(400, "Kode room kosong.", "invalid-argument");

  return db().runTransaction(async (tx) => {
    const rRef = roomRef(rid);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpError(404, "Room tidak ditemukan atau sudah ditutup.", "not-found");
    const room = rSnap.data();
    const pRef = playerRef(absen);
    const pSnap = await tx.get(pRef);
    const profile = pSnap.exists ? pSnap.data() : { absen, nama: namaSiswa(absen) };
    const nama = profile.nama || namaSiswa(absen);

    if (isMember(room, absen)) {
      tx.set(pRef, { roomId: room.id, roomStatus: statusRoom(room), lastSeen: Date.now() }, { merge: true });
      return { ok: true, room: publik(room), joined: false };
    }

    if (room.status !== "lobby") {
      throw new HttpError(409, "Pertandingan di room ini sudah dimulai.", "room-started");
    }
    if (room.players.length >= room.maxPlayers) {
      throw new HttpError(409, "Room sudah penuh.", "room-full");
    }

    let invite = null;
    if (iid) {
      const iRef = inviteRef(iid);
      const iSnap = await tx.get(iRef);
      if (!iSnap.exists) throw new HttpError(404, "Undangan tidak ditemukan.", "not-found");
      const data = iSnap.data();
      if (Number(data.toAbsen) !== Number(absen) || data.roomId !== room.id) {
        throw new HttpError(403, "Undangan ini bukan untukmu.", "forbidden");
      }
      if (data.status === "pending" && Number(data.expiresAt) < Date.now()) {
        tx.set(iRef, { status: "expired", respondedAt: Date.now() }, { merge: true });
        return { ok: false, expired: true, message: "Undangan sudah kedaluwarsa." };
      }
      if (data.status !== "pending" && data.status !== "accepted") {
        throw new HttpError(409, "Undangan ini sudah tidak berlaku.", "invite-inactive");
      }
      invite = { ref: iRef, data };
    } else if (room.visibility === "private" && cleanText(body.code, 64).toUpperCase() !== room.id) {
      throw new HttpError(403, "Room privat. Masukkan kode room atau lewat undangan.", "forbidden");
    }

    if (profile.roomId && profile.roomId !== room.id) {
      const otherSnap = await tx.get(roomRef(profile.roomId));
      if (otherSnap.exists) {
        const other = otherSnap.data();
        if (other.status === "lobby" || other.status === "playing") {
          throw new HttpError(409, "Kamu masih berada di room lain. Keluar dulu ya.", "already-in-room");
        }
      }
    }

    const used = new Set(room.players.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot += 1;
    room.players.push({ absen: Number(absen), nama, slot, ready: false, joinedAt: Date.now(), left: false });
    room.players.sort((a, b) => a.slot - b.slot);
    room.lastActivity = Date.now();
    tx.set(rRef, room);
    tx.set(pRef, { roomId: room.id, roomStatus: "waiting", lastSeen: Date.now(), nama }, { merge: true });
    if (invite) tx.set(invite.ref, { status: "accepted", respondedAt: Date.now() }, { merge: true });
    return { ok: true, room: publik(room), joined: true };
  });
}

async function leaveRoom(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  return db().runTransaction(async (tx) => {
    const pRef = playerRef(absen);
    const pSnap = await tx.get(pRef);
    const profile = pSnap.exists ? pSnap.data() : {};
    const targetId = rid || profile.roomId;
    if (!targetId) throw new HttpError(400, "Kamu sedang tidak di room mana pun.", "invalid-argument");
    const rRef = roomRef(targetId);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) {
      tx.set(pRef, { roomId: null, roomStatus: null }, { merge: true });
      return { ok: true, left: true };
    }
    const room = rSnap.data();
    const idx = room.players.findIndex((p) => Number(p.absen) === Number(absen));
    if (idx < 0) {
      tx.set(pRef, { roomId: null, roomStatus: null }, { merge: true });
      return { ok: true, left: true };
    }

    if (room.status === "playing") {
      const leaver = room.players[idx];
      room.players[idx].left = true;
      let hasil;
      if (room.players.filter((p) => !p.left).length === 1) {
        const sisa = room.players.filter((p) => !p.left)[0];
        hasil = { winners: [sisa.slot], draw: false, event: `${leaver.nama} keluar. ${sisa.nama} menang.` };
      } else {
        hasil = { winners: [], draw: true, event: `${leaver.nama} keluar. Pertandingan dihentikan.` };
      }
      const info = await catatHasil(tx, room, hasil);
      room.status = "finished";
      room.finishedAt = Date.now();
      room.winnerSlots = hasil.winners;
      room.draw = !!hasil.draw;
      room.result = info.result;
      room.historyId = info.historyId;
      room.lastEvent = hasil.event;
      room.lastActivity = Date.now();
      tx.set(rRef, room);
      tx.set(pRef, { roomId: null, roomStatus: null }, { merge: true });
      room.players.forEach((p) => {
        if (Number(p.absen) !== Number(absen)) {
          tx.set(playerRef(p.absen), { roomStatus: "finished" }, { merge: true });
        }
      });
      return { ok: true, room: publik(room), finished: true };
    }

    if (room.status === "lobby") {
      room.players.splice(idx, 1);
      tx.set(pRef, { roomId: null, roomStatus: null }, { merge: true });
      if (!room.players.length) {
        tx.delete(rRef);
        return { ok: true, left: true, roomClosed: true };
      }
      if (Number(room.hostAbsen) === Number(absen)) room.hostAbsen = room.players[0].absen;
      room.players.forEach((p, i) => { p.slot = i; });
      room.lastActivity = Date.now();
      tx.set(rRef, room);
      return { ok: true, left: true, room: publik(room) };
    }

    room.players[idx].left = true;
    tx.set(rRef, room);
    tx.set(pRef, { roomId: null, roomStatus: null }, { merge: true });
    return { ok: true, left: true };
  });
}

async function setReady(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  const ready = body.ready === true;
  return db().runTransaction(async (tx) => {
    const rRef = roomRef(rid);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpError(404, "Room tidak ditemukan.", "not-found");
    const room = rSnap.data();
    if (room.status !== "lobby") throw new HttpError(409, "Pertandingan sudah dimulai.", "room-started");
    const p = room.players.find((x) => Number(x.absen) === Number(absen));
    if (!p) throw new HttpError(403, "Kamu bukan anggota room ini.", "forbidden");
    p.ready = ready;
    room.lastActivity = Date.now();
    tx.set(rRef, room);
    return { ok: true, room: publik(room) };
  });
}

async function setVisibility(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  const visibility = body.visibility === "private" ? "private" : "public";
  return db().runTransaction(async (tx) => {
    const rRef = roomRef(rid);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpError(404, "Room tidak ditemukan.", "not-found");
    const room = rSnap.data();
    if (Number(room.hostAbsen) !== Number(absen)) throw new HttpError(403, "Hanya host yang bisa mengubah room.", "forbidden");
    if (room.status !== "lobby") throw new HttpError(409, "Pertandingan sudah dimulai.", "room-started");
    room.visibility = visibility;
    room.lastActivity = Date.now();
    tx.set(rRef, room);
    return { ok: true, room: publik(room) };
  });
}

async function kick(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  const target = Number(body.absen);
  return db().runTransaction(async (tx) => {
    const rRef = roomRef(rid);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpError(404, "Room tidak ditemukan.", "not-found");
    const room = rSnap.data();
    if (Number(room.hostAbsen) !== Number(absen)) throw new HttpError(403, "Hanya host yang bisa mengeluarkan pemain.", "forbidden");
    if (room.status !== "lobby") throw new HttpError(409, "Pertandingan sudah dimulai.", "room-started");
    if (target === Number(absen)) throw new HttpError(400, "Host tidak bisa mengeluarkan dirinya sendiri.", "invalid-argument");
    const idx = room.players.findIndex((p) => Number(p.absen) === target);
    if (idx < 0) throw new HttpError(404, "Pemain itu tidak ada di room.", "not-found");
    room.players.splice(idx, 1);
    room.players.forEach((p, i) => { p.slot = i; });
    room.lastActivity = Date.now();
    tx.set(rRef, room);
    tx.set(playerRef(target), { roomId: null, roomStatus: null }, { merge: true });
    return { ok: true, room: publik(room) };
  });
}

async function start(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  return db().runTransaction(async (tx) => {
    const rRef = roomRef(rid);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpError(404, "Room tidak ditemukan.", "not-found");
    const room = rSnap.data();
    if (Number(room.hostAbsen) !== Number(absen)) throw new HttpError(403, "Hanya host yang bisa memulai.", "forbidden");
    if (room.status !== "lobby") throw new HttpError(409, "Pertandingan sudah dimulai.", "room-started");
    const aktif = room.players.filter((p) => !p.left);
    const game = GAMES[room.gameId];
    if (!game) throw new HttpError(400, "Game tidak dikenal.", "invalid-argument");
    if (aktif.length < game.minPlayers) {
      throw new HttpError(409, `Butuh minimal ${game.minPlayers} pemain untuk mulai.`, "not-enough-players");
    }
    if (aktif.length > game.maxPlayers) {
      throw new HttpError(409, `Maksimal ${game.maxPlayers} pemain untuk game ini.`, "too-many-players");
    }
    if (!aktif.every((p) => p.ready)) {
      throw new HttpError(409, "Semua pemain harus menekan Ready dulu.", "not-ready");
    }

    aktif.forEach((p, i) => { p.slot = i; });
    room.players = aktif;

    const created = game.create(room.players, { rngInt: randomInt, players: room.players });
    room.status = "playing";
    room.state = created.state;
    room.startedAt = Date.now();
    room.lastActivity = Date.now();
    room.turnSlot = Number.isInteger(created.state.turn) ? created.state.turn : 0;
    room.seq = (Number(room.seq) || 0) + 1;
    room.lastEvent = created.state.lastEvent || "Pertandingan dimulai.";
    room.handVersions = {};
    room.players.forEach((p) => { room.handVersions[String(p.absen)] = 1; });

    if (created.hidden) {
      tx.set(db().collection("tvHidden").doc(room.id), created.hidden);
    }
    tx.set(rRef, room);
    room.players.forEach((p) => {
      tx.set(playerRef(p.absen), { roomStatus: "playing", lastSeen: Date.now() }, { merge: true });
    });

    const hand = created.hidden ? created.hidden.hands[String(absen)] || [] : null;
    return { ok: true, room: publik(room), hand, handVersion: room.handVersions[String(absen)] };
  });
}

async function stateOf(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  const rSnap = await roomRef(rid).get();
  if (!rSnap.exists) return { ok: true, room: null, serverNow: Date.now() };
  const room = rSnap.data();
  if (!isMember(room, absen)) throw new HttpError(403, "Kamu bukan anggota room ini.", "forbidden");
  let hand = null;
  let handVersion = room.handVersions ? room.handVersions[String(absen)] || 0 : 0;
  if (room.gameId === "uno" && room.status === "playing") {
    const hSnap = await db().collection("tvHidden").doc(rid).get();
    if (hSnap.exists) {
      const data = hSnap.data();
      hand = (data.hands && data.hands[String(absen)]) || [];
    } else {
      hand = [];
    }
  }
  return { ok: true, room: publik(room), hand, handVersion, serverNow: Date.now() };
}

async function move(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  const payload = body.move && typeof body.move === "object" ? body.move : {};

  return db().runTransaction(async (tx) => {
    const rRef = roomRef(rid);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpError(404, "Room tidak ditemukan.", "not-found");
    const room = rSnap.data();
    const slot = slotOf(room, absen);
    if (slot < 0) throw new HttpError(403, "Kamu bukan anggota room ini.", "forbidden");
    if (room.status !== "playing") throw new HttpError(409, "Pertandingan belum berjalan atau sudah selesai.", "room-not-playing");
    const game = GAMES[room.gameId];
    if (!game) throw new HttpError(400, "Game tidak dikenal.", "invalid-argument");

    const hRef = db().collection("tvHidden").doc(rid);
    const hSnap = await tx.get(hRef);
    const ctx = {
      rngInt: randomInt,
      players: room.players,
      hidden: hSnap.exists ? hSnap.data() : null,
    };

    const out = game.move(room.state, slot, payload, ctx);
    room.state = out.state;
    room.seq = (Number(room.seq) || 0) + 1;
    room.lastActivity = Date.now();
    room.lastEvent = out.event || out.state.lastEvent || "";
    room.turnSlot = Number.isInteger(out.state.turn) ? out.state.turn : room.turnSlot;

    if (out.hidden) tx.set(hRef, out.hidden);
    if (out.touched) {
      out.touched.forEach((k) => {
        room.handVersions[k] = (Number(room.handVersions[k]) || 0) + 1;
      });
    }

    if (out.finished) {
      const info = await catatHasil(tx, room, out);
      room.status = "finished";
      room.finishedAt = Date.now();
      room.winnerSlots = out.winners || [];
      room.draw = !!out.draw;
      room.result = info.result;
      room.historyId = info.historyId;
      room.players.forEach((p) => {
        tx.set(playerRef(p.absen), { roomStatus: "finished" }, { merge: true });
      });
    }

    tx.set(rRef, room);
    return {
      ok: true,
      room: publik(room),
      hand: out.hand === undefined ? null : out.hand,
      handVersion: room.handVersions[String(absen)] || 0,
      event: room.lastEvent,
    };
  });
}

async function rematch(absen, body) {
  const rid = cleanText(body.roomId, 64).toUpperCase();
  return db().runTransaction(async (tx) => {
    const rRef = roomRef(rid);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpError(404, "Room tidak ditemukan.", "not-found");
    const room = rSnap.data();
    if (!isMember(room, absen)) throw new HttpError(403, "Kamu bukan anggota room ini.", "forbidden");
    if (room.status !== "finished") throw new HttpError(409, "Pertandingan belum selesai.", "room-not-finished");
    if (Number(room.hostAbsen) !== Number(absen)) throw new HttpError(403, "Hanya host yang bisa mengulang pertandingan.", "forbidden");

    room.players = room.players.filter((p) => !p.left);
    if (!room.players.length) throw new HttpError(409, "Semua pemain sudah keluar.", "empty-room");
    room.players.forEach((p, i) => {
      p.slot = i;
      p.ready = false;
      p.left = false;
    });
    if (!room.players.some((p) => Number(p.absen) === Number(room.hostAbsen))) {
      room.hostAbsen = room.players[0].absen;
    }
    room.status = "lobby";
    room.state = null;
    room.startedAt = null;
    room.finishedAt = null;
    room.winnerSlots = [];
    room.draw = false;
    room.result = null;
    room.historyId = null;
    room.lastEvent = "Siap main lagi. Semua pemain harus Ready.";
    room.lastActivity = Date.now();
    room.seq = (Number(room.seq) || 0) + 1;
    room.handVersions = {};
    room.turnSlot = null;
    tx.delete(db().collection("tvHidden").doc(room.id));
    tx.set(rRef, room);
    room.players.forEach((p) => {
      tx.set(playerRef(p.absen), { roomStatus: "waiting" }, { merge: true });
    });
    return { ok: true, room: publik(room) };
  });
}

async function invite(absen, body) {
  const game = ambil(cleanText(body.gameId, 32));
  if (!game) throw new HttpError(400, "Game tidak dikenal.", "invalid-argument");
  const targets = Array.from(
    new Set(
      (Array.isArray(body.toAbsen) ? body.toAbsen : [])
        .map((v) => Number(v))
        .filter((v) => STUDENTS[v] && v !== Number(absen))
    )
  );
  if (!targets.length) throw new HttpError(400, "Pilih minimal satu pemain untuk diundang.", "invalid-argument");
  if (targets.length > game.maxPlayers - 1) {
    throw new HttpError(400, `Maksimal ${game.maxPlayers - 1} pemain bisa diundang untuk game ini.`, "invalid-argument");
  }

  return db().runTransaction(async (tx) => {
    const pRef = playerRef(absen);
    const pSnap = await tx.get(pRef);
    const profile = pSnap.exists ? pSnap.data() : { absen, nama: namaSiswa(absen) };
    const nama = profile.nama || namaSiswa(absen);

    let room = null;
    if (profile.roomId) {
      const curSnap = await tx.get(roomRef(profile.roomId));
      if (curSnap.exists) {
        const cur = curSnap.data();
        if (cur.status === "playing") {
          throw new HttpError(409, "Kamu sedang bermain. Selesaikan dulu pertandingannya.", "already-playing");
        }
        if (cur.status === "lobby") {
          if (cur.gameId !== game.id) {
            throw new HttpError(409, "Kamu masih di lobby game lain. Keluar dulu ya.", "already-in-lobby");
          }
          if (Number(cur.hostAbsen) !== Number(absen)) {
            throw new HttpError(403, "Hanya host yang bisa mengundang pemain.", "forbidden");
          }
          room = cur;
        }
      }
    }

    const rid = room ? room.id : roomId();
    const targetRefs = targets.map((a) => playerRef(a));
    const targetSnaps = await tx.getAll(...targetRefs);
    const iRefs = targets.map((a) => inviteRef(inviteDocId(rid, absen, a)));
    const iSnaps = await tx.getAll(...iRefs);
    const nowMs = Date.now();
    const invited = [];
    const skipped = [];

    targets.forEach((target, i) => {
      const tSnap = targetSnaps[i];
      const t = tSnap.exists ? tSnap.data() : { nama: namaSiswa(target) };
      if (room && room.players.some((p) => Number(p.absen) === target)) {
        skipped.push({ absen: target, reason: "sudah di room" });
        return;
      }
      if (t.roomStatus === "playing") {
        skipped.push({ absen: target, reason: "sedang bermain" });
        return;
      }
      if (t.roomStatus === "waiting" && t.roomId && t.roomId !== rid) {
        skipped.push({ absen: target, reason: "sedang di room lain" });
        return;
      }
      const old = iSnaps[i].exists ? iSnaps[i].data() : null;
      if (old && old.status === "pending" && Number(old.expiresAt) > nowMs) {
        skipped.push({ absen: target, reason: "sudah diundang" });
        return;
      }
      const doc = {
        id: inviteDocId(rid, absen, target),
        roomId: rid,
        fromAbsen: Number(absen),
        fromNama: nama,
        toAbsen: Number(target),
        toNama: t.nama || namaSiswa(target),
        gameId: game.id,
        mode: game.mode,
        status: "pending",
        createdAt: nowMs,
        expiresAt: nowMs + INVITE_TTL,
        respondedAt: null,
      };
      invited.push({ ref: iRefs[i], doc, target });
    });

    if (!room && !invited.length) {
      throw new HttpError(409, "Semua pemain yang dipilih sedang sibuk. Coba yang lain.", "all-busy");
    }

    if (!room) {
      room = roomBaru({ id: rid, absen, nama, game, visibility: "private" });
    }
    room.lastActivity = nowMs;
    tx.set(roomRef(rid), room);
    tx.set(pRef, { roomId: rid, roomStatus: "waiting", lastSeen: nowMs, nama }, { merge: true });

    invited.forEach(({ ref, doc }) => tx.set(ref, doc));

    return {
      ok: true,
      room: publik(room),
      invited: invited.map(({ doc }) => ({ absen: doc.toAbsen, nama: doc.toNama })),
      skipped,
    };
  });
}

async function respondInvite(absen, body) {
  const iid = cleanText(body.inviteId, 160);
  const accept = body.accept === true;
  if (!iid) throw new HttpError(400, "Undangan tidak valid.", "invalid-argument");

  return db().runTransaction(async (tx) => {
    const iRef = inviteRef(iid);
    const iSnap = await tx.get(iRef);
    if (!iSnap.exists) throw new HttpError(404, "Undangan tidak ditemukan.", "not-found");
    const inv = iSnap.data();
    if (Number(inv.toAbsen) !== Number(absen)) throw new HttpError(403, "Undangan ini bukan untukmu.", "forbidden");
    if (inv.status !== "pending") throw new HttpError(409, "Undangan ini sudah diproses.", "invite-inactive");
    if (Number(inv.expiresAt) < Date.now()) {
      tx.set(iRef, { status: "expired", respondedAt: Date.now() }, { merge: true });
      return { ok: false, expired: true, message: "Undangan sudah kedaluwarsa (maksimal 2 menit)." };
    }
    if (!accept) {
      tx.set(iRef, { status: "declined", respondedAt: Date.now() }, { merge: true });
      return { ok: true, declined: true };
    }

    const rRef = roomRef(inv.roomId);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) {
      tx.set(iRef, { status: "expired", respondedAt: Date.now() }, { merge: true });
      return { ok: false, expired: true, message: "Room sudah ditutup." };
    }
    const room = rSnap.data();
    if (room.status !== "lobby") {
      tx.set(iRef, { status: "expired", respondedAt: Date.now() }, { merge: true });
      return { ok: false, expired: true, message: "Pertandingan sudah dimulai." };
    }
    if (room.players.length >= room.maxPlayers) {
      throw new HttpError(409, "Room sudah penuh.", "room-full");
    }

    const pRef = playerRef(absen);
    const pSnap = await tx.get(pRef);
    const profile = pSnap.exists ? pSnap.data() : { absen, nama: namaSiswa(absen) };
    if (!room.players.some((p) => Number(p.absen) === Number(absen))) {
      if (profile.roomId && profile.roomId !== room.id) {
        const otherSnap = await tx.get(roomRef(profile.roomId));
        if (otherSnap.exists) {
          const other = otherSnap.data();
          if (other.status === "lobby" || other.status === "playing") {
            throw new HttpError(409, "Kamu masih berada di room lain. Keluar dulu ya.", "already-in-room");
          }
        }
      }
      const used = new Set(room.players.map((p) => p.slot));
      let slot = 0;
      while (used.has(slot)) slot += 1;
      room.players.push({
        absen: Number(absen),
        nama: profile.nama || namaSiswa(absen),
        slot,
        ready: false,
        joinedAt: Date.now(),
        left: false,
      });
      room.players.sort((a, b) => a.slot - b.slot);
    }
    room.lastActivity = Date.now();
    tx.set(rRef, room);
    tx.set(pRef, { roomId: room.id, roomStatus: "waiting", lastSeen: Date.now() }, { merge: true });
    tx.set(iRef, { status: "accepted", respondedAt: Date.now() }, { merge: true });
    return { ok: true, room: publik(room), joined: true };
  });
}

async function myInvites(absen) {
  const nowMs = Date.now();
  const inboundSnap = await db().collection("tvInvites").where("toAbsen", "==", Number(absen)).limit(40).get();
  const outboundSnap = await db().collection("tvInvites").where("fromAbsen", "==", Number(absen)).limit(40).get();

  const batch = db().batch();
  let tulis = 0;
  const map = (doc) => {
    const data = doc.data();
    if (data.status === "pending" && Number(data.expiresAt) < nowMs) {
      batch.set(doc.ref, { status: "expired", respondedAt: nowMs }, { merge: true });
      tulis += 1;
      data.status = "expired";
      data.respondedAt = nowMs;
    }
    return data;
  };
  const inbound = inboundSnap.docs.map(map).sort((a, b) => b.createdAt - a.createdAt);
  const outbound = outboundSnap.docs.map(map).sort((a, b) => b.createdAt - a.createdAt);
  if (tulis) await batch.commit();

  const prune = db().batch();
  let hapus = 0;
  inbound.concat(outbound).forEach((inv) => {
    if (nowMs - Number(inv.createdAt || 0) > MAX_INVITE_AGE) {
      prune.delete(inviteRef(inv.id));
      hapus += 1;
    }
  });
  if (hapus) await prune.commit();

  return {
    ok: true,
    inbound: inbound.filter((i) => nowMs - Number(i.createdAt || 0) <= MAX_INVITE_AGE),
    outbound: outbound.filter((i) => nowMs - Number(i.createdAt || 0) <= MAX_INVITE_AGE),
    serverNow: nowMs,
  };
}

async function history(absen) {
  const snap = await db()
    .collection("tvHistory")
    .where("playerAbsens", "array-contains", Number(absen))
    .limit(40)
    .get();
  const list = snap.docs.map((doc) => doc.data()).sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 30);
  return { ok: true, history: list, serverNow: Date.now() };
}

async function profile(absen) {
  const { data } = await ensurePlayer(absen);
  return { ok: true, player: profilePublic({ ...data, stats: normalStats(data.stats) }), serverNow: Date.now() };
}

module.exports = {
  sync,
  daftarPemain,
  listRooms,
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  setVisibility,
  kick,
  start,
  stateOf,
  move,
  rematch,
  invite,
  respondInvite,
  myInvites,
  history,
  profile,
  INVITE_TTL,
};
