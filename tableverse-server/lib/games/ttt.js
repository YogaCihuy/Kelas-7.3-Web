"use strict";

const { HttpError } = require("../util");

const ID = "ttt";
const MODE = "duel";
const MIN = 2;
const MAX = 2;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function pemenang(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) return v;
  }
  return null;
}

function create(players) {
  return {
    state: {
      board: Array(9).fill(null),
      turn: 0,
      lastMove: null,
      lastEvent: "Pertandingan dimulai. X jalan duluan.",
    },
  };
}

function move(state, slot, payload) {
  const next = JSON.parse(JSON.stringify(state));
  if (next.turn !== slot) throw new HttpError(400, "Bukan giliranmu.", "not-your-turn");
  const index = Number(payload && payload.index);
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    throw new HttpError(400, "Kotak tidak valid.", "invalid-move");
  }
  if (next.board[index] !== null) throw new HttpError(400, "Kotak itu sudah terisi.", "invalid-move");

  const mark = slot === 0 ? "X" : "O";
  next.board[index] = mark;
  next.lastMove = { slot, index };

  const winner = pemenang(next.board);
  if (winner) {
    next.lastEvent = `${winner} menang!`;
    return {
      state: next,
      finished: true,
      winners: [slot],
      draw: false,
      event: next.lastEvent,
    };
  }
  if (next.board.every((v) => v !== null)) {
    next.lastEvent = "Papan penuh. Pertandingan berakhir seri.";
    return { state: next, finished: true, winners: [], draw: true, event: next.lastEvent };
  }

  next.turn = slot === 0 ? 1 : 0;
  next.lastEvent = `Giliran ${next.turn === 0 ? "X" : "O"}.`;
  return { state: next, finished: false };
}

module.exports = {
  id: ID,
  mode: MODE,
  minPlayers: MIN,
  maxPlayers: MAX,
  judul: "Tic Tac Toe",
  create,
  move,
};
