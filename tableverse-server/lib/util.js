"use strict";

const crypto = require("crypto");

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status || 400;
    this.code = code || "bad-request";
  }
}

function now() {
  return Date.now();
}

function newId(prefix) {
  return `${prefix || ""}${crypto.randomBytes(9).toString("hex")}`;
}

function roomId() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0) return 0;
  return crypto.randomInt(max);
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max || 80);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

function profilePublic(player) {
  if (!player) return null;
  return {
    absen: Number(player.absen),
    nama: player.nama || "",
    username: player.username || "",
    lastSeen: Number(player.lastSeen) || 0,
    roomId: player.roomId || null,
    roomStatus: player.roomStatus || null,
    stats: player.stats || null,
  };
}

module.exports = {
  HttpError,
  now,
  newId,
  roomId,
  randomInt,
  shuffle,
  deepClone,
  b64url,
  safeEqual,
  cleanText,
  clampInt,
  toMillis,
  profilePublic,
};
