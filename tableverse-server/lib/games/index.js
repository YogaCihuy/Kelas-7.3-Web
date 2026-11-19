"use strict";

const ttt = require("./ttt");
const checkers = require("./checkers");
const chess = require("./chess");
const ludo = require("./ludo");
const snakes = require("./snakes");
const uno = require("./uno");

const GAMES = { ttt, checkers, chess, ludo, snakes, uno };

function ambil(id) {
  return GAMES[id] || null;
}

function katalog() {
  return Object.values(GAMES).map((g) => ({
    id: g.id,
    judul: g.judul,
    mode: g.mode,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
  }));
}

module.exports = { GAMES, ambil, katalog };
