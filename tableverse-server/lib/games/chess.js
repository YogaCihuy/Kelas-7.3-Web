"use strict";

const { Chess } = require("chess.js");
const { HttpError } = require("../util");

const ID = "chess";
const MODE = "duel";
const MIN = 2;
const MAX = 2;

function create(players) {
  const chess = new Chess();
  return {
    state: {
      fen: chess.fen(),
      turn: 0,
      lastMove: null,
      status: "playing",
      check: false,
      history: [],
      lastEvent: "Pertandingan dimulai. Putih jalan duluan.",
    },
  };
}

function move(state, slot, payload) {
  if (slot !== state.turn) throw new HttpError(400, "Bukan giliranmu.", "not-your-turn");
  if (state.status !== "playing") throw new HttpError(400, "Pertandingan sudah selesai.", "invalid-move");

  const from = payload && typeof payload.from === "string" ? payload.from.toLowerCase() : "";
  const to = payload && typeof payload.to === "string" ? payload.to.toLowerCase() : "";
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
    throw new HttpError(400, "Kotak asal/tujuan tidak valid.", "invalid-move");
  }
  const promo = payload && typeof payload.promotion === "string" ? payload.promotion.toLowerCase() : "q";
  const promotion = ["q", "r", "b", "n"].includes(promo) ? promo : "q";

  const chess = new Chess(state.fen);
  const warna = chess.turn();
  if ((warna === "w" && slot !== 0) || (warna === "b" && slot !== 1)) {
    throw new HttpError(400, "Bidak itu bukan milikmu.", "invalid-move");
  }

  let hasil;
  try {
    hasil = chess.move({ from, to, promotion });
  } catch (err) {
    throw new HttpError(400, "Langkah catur itu tidak legal.", "invalid-move");
  }
  if (!hasil) throw new HttpError(400, "Langkah catur itu tidak legal.", "invalid-move");

  const next = {
    ...state,
    fen: chess.fen(),
    lastMove: { from, to, san: hasil.san, color: warna },
    history: chess.history().slice(-12),
    check: chess.in_check(),
  };

  if (chess.game_over()) {
    next.status = chess.in_checkmate()
      ? "checkmate"
      : chess.in_draw() || chess.in_stalemate()
        ? "draw"
        : "finished";
    if (chess.in_checkmate()) {
      next.lastEvent = `Skakmat! Pemain ${slot + 1} menang.`;
      return { state: next, finished: true, winners: [slot], draw: false, event: next.lastEvent };
    }
    next.lastEvent = "Pertandingan berakhir seri.";
    return { state: next, finished: true, winners: [], draw: true, event: next.lastEvent };
  }

  next.turn = slot === 0 ? 1 : 0;
  next.lastEvent = chess.in_check()
    ? `Raja pemain ${next.turn + 1} diskak! Giliran pemain ${next.turn + 1}.`
    : `Giliran pemain ${next.turn + 1}.`;
  return { state: next, finished: false, event: next.lastEvent };
}

module.exports = {
  id: ID,
  mode: MODE,
  minPlayers: MIN,
  maxPlayers: MAX,
  judul: "Chess",
  create,
  move,
};
