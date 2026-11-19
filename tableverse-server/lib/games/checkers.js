"use strict";

const { HttpError } = require("../util");

const ID = "checkers";
const MODE = "duel";
const MIN = 2;
const MAX = 2;

function boardAwal() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) board[r][c] = "b";
      else if (r > 4) board[r][c] = "r";
    }
  }
  return board;
}

function milik(piece) {
  if (piece === "r" || piece === "R") return "r";
  if (piece === "b" || piece === "B") return "b";
  return null;
}

function arah(piece) {
  if (piece === "R" || piece === "B") return [-1, 1];
  if (piece === "r") return [-1];
  return [1];
}

function diPapan(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function legalMoves(board, slot, pending) {
  const kode = slot === 0 ? "r" : "b";
  const lawan = slot === 0 ? "b" : "r";
  const captures = [];
  const biasa = [];

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece || milik(piece) !== kode) continue;
      if (pending && (pending.r !== r || pending.c !== c)) continue;

      for (const dr of arah(piece)) {
        for (const dc of [-1, 1]) {
          const r1 = r + dr;
          const c1 = c + dc;
          const r2 = r + dr * 2;
          const c2 = c + dc * 2;
          if (!diPapan(r1, c1)) continue;
          if (diPapan(r2, c2) && board[r2][c2] === null && milik(board[r1][c1]) === lawan) {
            captures.push({ from: [r, c], to: [r2, c2], capture: [r1, c1] });
          }
          if (!pending && board[r1][c1] === null) {
            biasa.push({ from: [r, c], to: [r1, c1], capture: null });
          }
        }
      }
    }
  }

  return captures.length ? captures : biasa;
}

function create(players) {
  return {
    state: {
      board: boardAwal(),
      turn: 0,
      pending: null,
      sinceCapture: 0,
      lastMove: null,
      lastEvent: "Pertandingan dimulai. Bidak merah jalan duluan.",
    },
  };
}

function samePos(a, b) {
  return Array.isArray(a) && a[0] === b[0] && a[1] === b[1];
}

function move(state, slot, payload) {
  const next = JSON.parse(JSON.stringify(state));
  if (next.turn !== slot) throw new HttpError(400, "Bukan giliranmu.", "not-your-turn");
  if (next.pending && next.pending.slot !== slot) {
    throw new HttpError(400, "Selesaikan dulu lompatan beruntunmu.", "invalid-move");
  }

  const from = payload && payload.from;
  const to = payload && payload.to;
  if (!Array.isArray(from) || !Array.isArray(to)) {
    throw new HttpError(400, "Gerakan tidak valid.", "invalid-move");
  }

  const legal = legalMoves(next.board, slot, next.pending);
  const pilihan = legal.find((m) => samePos(m.from, from) && samePos(m.to, to));
  if (!pilihan) {
    const wajibLompat = legal.length > 0 && legal[0].capture;
    throw new HttpError(
      400,
      wajibLompat ? "Ada bidak yang bisa dilompati. Lompatan wajib." : "Gerakan itu tidak legal.",
      "invalid-move"
    );
  }

  const [r0, c0] = pilihan.from;
  const [r1, c1] = pilihan.to;
  let piece = next.board[r0][c0];
  next.board[r0][c0] = null;
  if (pilihan.capture) {
    const [cr, cc] = pilihan.capture;
    next.board[cr][cc] = null;
  }
  next.board[r1][c1] = piece;

  if (piece === "r" && r1 === 0) {
    piece = "R";
    next.board[r1][c1] = "R";
  } else if (piece === "b" && r1 === 7) {
    piece = "B";
    next.board[r1][c1] = "B";
  }

  next.lastMove = { from: pilihan.from, to: pilihan.to, capture: !!pilihan.capture };
  next.sinceCapture = pilihan.capture ? 0 : next.sinceCapture + 1;

  const lanjut = legalMoves(next.board, slot, { slot, r: r1, c: c1 });
  if (lanjut.length && lanjut[0].capture) {
    next.pending = { slot, r: r1, c: c1 };
    next.lastEvent = `Tangkapan beruntun! Lanjutkan lompatan dengan bidak yang sama.`;
    return { state: next, finished: false, event: next.lastEvent };
  }

  next.pending = null;
  const lawan = slot === 0 ? 1 : 0;
  const sisaLawan = next.board.some((row) => row.some((cell) => milik(cell) === (lawan === 0 ? "r" : "b")));
  const gerakLawan = sisaLawan ? legalMoves(next.board, lawan, null) : [];

  if (!sisaLawan || gerakLawan.length === 0) {
    next.lastEvent = `Pemain ${slot + 1} menang!`;
    return { state: next, finished: true, winners: [slot], draw: false, event: next.lastEvent };
  }

  if (next.sinceCapture >= 80) {
    next.lastEvent = "80 langkah tanpa tangkapan. Pertandingan seri.";
    return { state: next, finished: true, winners: [], draw: true, event: next.lastEvent };
  }

  next.turn = lawan;
  next.lastEvent = `Giliran pemain ${next.turn + 1}.`;
  return { state: next, finished: false };
}

module.exports = {
  id: ID,
  mode: MODE,
  minPlayers: MIN,
  maxPlayers: MAX,
  judul: "Checkers",
  create,
  move,
};
