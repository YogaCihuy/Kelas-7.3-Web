"use strict";

const crypto = require("crypto");
const { getDb, timestamp } = require("./firebase");
const { namaSiswa, STUDENTS } = require("./students");
const { HttpError, b64url, safeEqual, profilePublic } = require("./util");

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.TV_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new HttpError(500, "Server belum dikonfigurasi: TV_SESSION_SECRET belum diisi.", "server-unconfigured");
  }
  return value;
}

function signToken(absen) {
  const payload = b64url(JSON.stringify({ a: Number(absen), exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== "string" || token.indexOf(".") < 0) {
    throw new HttpError(401, "Sesi TableVerse tidak valid. Silakan masuk lagi.", "unauthorized");
  }
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) {
    throw new HttpError(401, "Sesi TableVerse tidak valid. Silakan masuk lagi.", "unauthorized");
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (err) {
    throw new HttpError(401, "Sesi TableVerse tidak valid. Silakan masuk lagi.", "unauthorized");
  }
  if (!data || !STUDENTS[Number(data.a)] || Number(data.exp) < Date.now()) {
    throw new HttpError(401, "Sesi TableVerse sudah kedaluwarsa. Silakan masuk lagi.", "unauthorized");
  }
  return Number(data.a);
}

function requireAuth(req) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!header || !/^Bearer\s+/i.test(header)) {
    throw new HttpError(401, "Kamu belum terhubung ke TableVerse.", "unauthorized");
  }
  return verifyToken(header.replace(/^Bearer\s+/i, "").trim());
}

function emptyStats() {
  return { matches: 0, wins: 0, losses: 0, draws: 0, playtime: 0, perGame: {} };
}

function normalStats(raw) {
  const base = emptyStats();
  if (!raw || typeof raw !== "object") return base;
  return {
    matches: Number(raw.matches) || 0,
    wins: Number(raw.wins) || 0,
    losses: Number(raw.losses) || 0,
    draws: Number(raw.draws) || 0,
    playtime: Number(raw.playtime) || 0,
    perGame: raw.perGame && typeof raw.perGame === "object" ? raw.perGame : {},
  };
}

async function ensurePlayer(absen) {
  const db = getDb();
  const ref = db.collection("tvPlayers").doc(String(absen));
  const snap = await ref.get();
  if (snap.exists) return { ref, data: snap.data(), created: false };
  const data = {
    absen: Number(absen),
    nama: namaSiswa(absen),
    username: namaSiswa(absen),
    stats: emptyStats(),
    lastSeen: 0,
    roomId: null,
    roomStatus: null,
    createdAt: timestamp(),
  };
  return { ref, data, created: true };
}

async function login(body) {
  const absen = Number(body && body.absen);
  const password = body && typeof body.password === "string" ? body.password : "";
  if (!STUDENTS[absen]) throw new HttpError(400, "Akun tidak ditemukan.", "invalid-argument");

  const db = getDb();
  const accountSnap = await db.collection("accounts").doc(String(absen)).get();
  const account = accountSnap.exists ? accountSnap.data() : null;
  const expected = account && typeof account.password === "string" && account.password.length
    ? account.password
    : `73${absen}`;
  if (!password || !safeEqual(password, expected)) {
    throw new HttpError(401, "Password akun kelas salah.", "unauthorized");
  }

  const { ref, data } = await ensurePlayer(absen);
  const nama = account && account.namaPanggilan ? String(account.namaPanggilan) : data.nama;
  const username = account && account.username ? String(account.username) : nama;
  const next = {
    ...data,
    absen,
    nama,
    username,
    stats: normalStats(data.stats),
    lastSeen: Date.now(),
  };
  await ref.set(next, { merge: true });

  return {
    ok: true,
    token: signToken(absen),
    player: profilePublic(next),
    serverNow: Date.now(),
  };
}

async function touchPresence(ref, data, force) {
  const last = Number(data.lastSeen) || 0;
  if (!force && Date.now() - last < 45000) return data;
  const patch = { lastSeen: Date.now() };
  await ref.set(patch, { merge: true });
  return { ...data, ...patch };
}

module.exports = {
  signToken,
  verifyToken,
  requireAuth,
  emptyStats,
  normalStats,
  ensurePlayer,
  login,
  touchPresence,
  TOKEN_TTL_MS,
};
