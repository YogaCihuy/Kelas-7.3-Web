"use strict";

const { HttpError } = require("../lib/util");
const { katalog } = require("../lib/games");
const auth = require("../lib/auth");
const rooms = require("../lib/rooms");

const attempts = new Map();

function bodyDari(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      return {};
    }
  }
  return typeof req.body === "object" ? req.body : {};
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
}

function cekBatasLogin(req, absen) {
  const ip = (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "local").toString().split(",")[0].trim();
  const kunci = `${ip}:${absen || "-"}`;
  const now = Date.now();
  const data = attempts.get(kunci) || { count: 0, mulai: now };
  if (now - data.mulai > 5 * 60 * 1000) {
    data.count = 0;
    data.mulai = now;
  }
  data.count += 1;
  attempts.set(kunci, data);
  if (data.count > 12) {
    throw new HttpError(429, "Terlalu banyak percobaan. Tunggu beberapa menit.", "too-many-requests");
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: { message: "Gunakan POST.", code: "method-not-allowed" } });
    return;
  }

  const body = bodyDari(req);
  const action = typeof body.action === "string" ? body.action : "";

  try {
    let hasil;
    if (action === "ping") {
      hasil = { ok: true, games: katalog(), inviteTtl: rooms.INVITE_TTL };
    } else if (action === "login") {
      cekBatasLogin(req, body.absen);
      hasil = await auth.login(body);
    } else {
      const absen = auth.requireAuth(req);
      switch (action) {
        case "sync": hasil = await rooms.sync(absen); break;
        case "players": hasil = { ok: true, players: await rooms.daftarPemain(absen) }; break;
        case "listRooms": hasil = await rooms.listRooms(body); break;
        case "createRoom": hasil = await rooms.createRoom(absen, body); break;
        case "joinRoom": hasil = await rooms.joinRoom(absen, body); break;
        case "leaveRoom": hasil = await rooms.leaveRoom(absen, body); break;
        case "ready": hasil = await rooms.setReady(absen, body); break;
        case "visibility": hasil = await rooms.setVisibility(absen, body); break;
        case "kick": hasil = await rooms.kick(absen, body); break;
        case "start": hasil = await rooms.start(absen, body); break;
        case "state": hasil = await rooms.stateOf(absen, body); break;
        case "move": hasil = await rooms.move(absen, body); break;
        case "rematch": hasil = await rooms.rematch(absen, body); break;
        case "invite": hasil = await rooms.invite(absen, body); break;
        case "respondInvite": hasil = await rooms.respondInvite(absen, body); break;
        case "myInvites": hasil = await rooms.myInvites(absen); break;
        case "history": hasil = await rooms.history(absen); break;
        case "profile": hasil = await rooms.profile(absen); break;
        case "logout": hasil = { ok: true }; break;
        default:
          throw new HttpError(400, "Aksi TableVerse tidak dikenal.", "invalid-argument");
      }
    }
    if (hasil && typeof hasil === "object" && hasil.serverNow === undefined) {
      hasil.serverNow = Date.now();
    }
    res.status(200).json(hasil);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status || 400).json({
        ok: false,
        error: { message: err.message, code: err.code || "error" },
        serverNow: Date.now(),
      });
      return;
    }
    console.error("tableverse error:", action, err);
    res.status(500).json({
      ok: false,
      error: { message: "Server TableVerse sedang sibuk. Coba lagi sebentar.", code: "internal" },
      serverNow: Date.now(),
    });
  }
};
