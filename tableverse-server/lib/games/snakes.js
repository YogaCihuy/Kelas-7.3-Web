"use strict";

const { HttpError } = require("../util");

const ID = "snakes";
const MODE = "party";
const MIN = 2;
const MAX = 4;

// Tangga & ular standar papan 100 kotak.
const LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
const SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };

function create(players) {
  return {
    state: {
      positions: players.map(() => 0),
      turn: 0,
      dice: null,
      lastRoll: null,
      lastEvent: "Pertandingan dimulai. Lempar dadu buat jalan.",
    },
  };
}

function berikut(jumlah, slot) {
  return (slot + 1) % jumlah;
}

function move(state, slot, payload, ctx) {
  const next = JSON.parse(JSON.stringify(state));
  if (next.turn !== slot) throw new HttpError(400, "Bukan giliranmu.", "not-your-turn");
  if (payload && payload.type !== "roll") throw new HttpError(400, "Aksi tidak dikenal.", "invalid-move");

  const jumlah = next.positions.length;
  const dice = ctx.rngInt(6) + 1;
  let pos = next.positions[slot] + dice;
  if (pos > 100) pos = 100;

  let lompat = "";
  if (LADDERS[pos]) {
    lompat = ` Naik tangga dari ${pos} ke ${LADDERS[pos]}.`;
    pos = LADDERS[pos];
  } else if (SNAKES[pos]) {
    lompat = ` Kena ular dari ${pos}, turun ke ${SNAKES[pos]}.`;
    pos = SNAKES[pos];
  }

  next.positions[slot] = pos;
  next.dice = dice;
  next.lastRoll = dice;
  next.lastEvent = `Pemain ${slot + 1} dapat ${dice}, sekarang di kotak ${pos}.${lompat}`;

  if (pos >= 100) {
    next.lastEvent = `Pemain ${slot + 1} mencapai kotak 100 dan menang!`;
    return { state: next, finished: true, winners: [slot], draw: false, event: next.lastEvent };
  }

  const dapatLagi = dice === 6;
  if (dapatLagi) next.lastEvent += " Dapat 6, lempar lagi.";
  else next.turn = berikut(jumlah, slot);

  return { state: next, finished: false, event: next.lastEvent };
}

module.exports = {
  id: ID,
  mode: MODE,
  minPlayers: MIN,
  maxPlayers: MAX,
  judul: "Ular Tangga",
  create,
  move,
  LADDERS,
  SNAKES,
};
