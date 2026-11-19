"use strict";

const { getDb } = require("./firebase");
const { normalStats } = require("./auth");

async function catatHasil(tx, room, hasil) {
  const db = getDb();
  const players = room.players;
  const winnerSlots = new Set(hasil.winners || []);
  const draw = !!hasil.draw;
  const refs = players.map((p) => db.collection("tvPlayers").doc(String(p.absen)));
  const snaps = await tx.getAll(...refs);
  const duration = Math.max(0, Date.now() - (Number(room.startedAt) || Date.now()));
  const perGame = {};

  snaps.forEach((snap, i) => {
    const data = snap.exists ? snap.data() : {};
    const stats = normalStats(data.stats);
    stats.matches += 1;
    stats.playtime += duration;
    const per = stats.perGame[room.gameId] || { matches: 0, wins: 0, losses: 0, draws: 0 };
    per.matches += 1;
    if (draw) {
      stats.draws += 1;
      per.draws += 1;
    } else if (winnerSlots.has(i)) {
      stats.wins += 1;
      per.wins += 1;
    } else {
      stats.losses += 1;
      per.losses += 1;
    }
    stats.perGame[room.gameId] = per;
    perGame[players[i].absen] = { ...per };
    tx.set(refs[i], { stats, lastMatchAt: Date.now() }, { merge: true });
  });

  const historyRef = db.collection("tvHistory").doc();
  const winners = (hasil.winners || []).map((s) => players[s]).filter(Boolean);
  tx.set(historyRef, {
    roomId: room.id,
    gameId: room.gameId,
    gameTitle: room.gameTitle,
    mode: room.mode,
    playerAbsens: players.map((p) => Number(p.absen)),
    players: players.map((p) => ({ absen: Number(p.absen), nama: p.nama, slot: p.slot })),
    winnerAbsens: winners.map((p) => Number(p.absen)),
    winnerNama: winners.map((p) => p.nama),
    draw,
    durationMs: duration,
    startedAt: Number(room.startedAt) || null,
    finishedAt: Date.now(),
  });

  return {
    historyId: historyRef.id,
    perGame,
    result: {
      winners: winners.map((p) => ({ absen: Number(p.absen), nama: p.nama })),
      draw,
      durationMs: duration,
    },
  };
}

module.exports = { catatHasil };
