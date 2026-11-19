"use strict";

const { HttpError } = require("../util");

const ID = "ludo";
const MODE = "party";
const MIN = 2;
const MAX = 4;

const START = [0, 13, 26, 39];
const SAFE = new Set();
START.forEach((s) => {
  SAFE.add(s);
  SAFE.add((s + 8) % 52);
});

function berikut(jumlah, slot) {
  return (slot + 1) % jumlah;
}

function absolut(slot, pos) {
  if (pos < 0 || pos > 51) return null;
  return (START[slot] + pos) % 52;
}

function legalTokens(state, slot, dice) {
  const hasil = [];
  const tokens = state.tokens[slot];
  for (let i = 0; i < tokens.length; i += 1) {
    const pos = tokens[i];
    if (pos === 57) continue;
    if (pos === -1) {
      if (dice === 6) hasil.push(i);
      continue;
    }
    if (pos + dice <= 57) hasil.push(i);
  }
  return hasil;
}

function create(players) {
  return {
    state: {
      tokens: players.map(() => [-1, -1, -1, -1]),
      turn: 0,
      dice: null,
      rolled: false,
      lastRoll: null,
      lastEvent: "Pertandingan dimulai. Lempar dadu, dapat 6 untuk keluar dari base.",
    },
  };
}

function move(state, slot, payload, ctx) {
  const next = JSON.parse(JSON.stringify(state));
  if (next.turn !== slot) throw new HttpError(400, "Bukan giliranmu.", "not-your-turn");
  const jumlah = next.tokens.length;
  const tipe = payload && payload.type === "move" ? "move" : "roll";

  if (tipe === "roll") {
    if (next.rolled) throw new HttpError(400, "Selesaikan langkah dengan dadu ini dulu.", "invalid-move");
    const dice = ctx.rngInt(6) + 1;
    const legal = legalTokens(next, slot, dice);
    next.dice = dice;
    next.lastRoll = dice;
    if (!legal.length) {
      next.rolled = false;
      if (dice === 6) {
        next.lastEvent = "Dapat 6, tapi tidak ada bidak yang bisa jalan. Lempar lagi.";
      } else {
        next.turn = berikut(jumlah, slot);
        next.lastEvent = `Dapat ${dice}, tidak ada langkah. Giliran pemain ${next.turn + 1}.`;
      }
      return { state: next, finished: false, event: next.lastEvent };
    }
    next.rolled = true;
    next.lastEvent = `Dapat ${dice}. Pilih bidak yang mau dijalankan.`;
    return { state: next, finished: false, event: next.lastEvent };
  }

  if (!next.rolled) throw new HttpError(400, "Lempar dadu dulu.", "invalid-move");
  const token = Number(payload.token);
  if (!Number.isInteger(token) || token < 0 || token > 3) {
    throw new HttpError(400, "Bidak tidak valid.", "invalid-move");
  }
  const dice = next.dice;
  if (!legalTokens(next, slot, dice).includes(token)) {
    throw new HttpError(400, "Bidak itu tidak bisa dijalankan dengan dadu ini.", "invalid-move");
  }

  const tokens = next.tokens[slot];
  let pos = tokens[token];
  let keluar = false;
  if (pos === -1) {
    pos = 0;
    keluar = true;
  } else {
    pos += dice;
  }
  tokens[token] = pos;

  let tertangkap = 0;
  if (pos <= 51) {
    const abs = absolut(slot, pos);
    if (!SAFE.has(abs)) {
      for (let s = 0; s < next.tokens.length; s += 1) {
        if (s === slot) continue;
        for (let t = 0; t < 4; t += 1) {
          if (absolut(s, next.tokens[s][t]) === abs) {
            next.tokens[s][t] = -1;
            tertangkap += 1;
          }
        }
      }
    }
  }

  next.rolled = false;
  next.dice = null;

  if (tokens.every((p) => p === 57)) {
    next.lastEvent = `Pemain ${slot + 1} memasukkan semua bidak ke rumah dan menang!`;
    return { state: next, finished: true, winners: [slot], draw: false, event: next.lastEvent };
  }

  const dapatLagi = dice === 6 || tertangkap > 0;
  if (dapatLagi) {
    next.lastEvent = `${keluar ? "Bidak keluar dari base. " : ""}${tertangkap ? "Bidak lawan tertangkap! " : ""}Dapat giliran tambahan, lempar lagi.`;
  } else {
    next.turn = berikut(jumlah, slot);
    next.lastEvent = `${keluar ? "Bidak keluar dari base. " : ""}Giliran pemain ${next.turn + 1}.`;
  }

  return { state: next, finished: false, event: next.lastEvent };
}

module.exports = {
  id: ID,
  mode: MODE,
  minPlayers: MIN,
  maxPlayers: MAX,
  judul: "Ludo",
  create,
  move,
  START,
  SAFE: Array.from(SAFE),
  absolut,
};
