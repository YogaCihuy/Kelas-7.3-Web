"use strict";

const { HttpError, shuffle } = require("../util");

const ID = "uno";
const MODE = "party";
const MIN = 2;
const MAX = 4;
const COLORS = ["r", "y", "g", "b"];

function buatDeck() {
  const deck = [];
  let n = 0;
  const tambah = (color, kind, value) => {
    n += 1;
    deck.push({ id: `${color}-${kind}-${value === null ? "x" : value}-${n}`, color, kind, value });
  };
  for (const color of COLORS) {
    tambah(color, "num", 0);
    for (let v = 1; v <= 9; v += 1) {
      tambah(color, "num", v);
      tambah(color, "num", v);
    }
    for (const kind of ["skip", "rev", "d2"]) {
      tambah(color, kind, null);
      tambah(color, kind, null);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    tambah("w", "wild", null);
    tambah("w", "wild4", null);
  }
  return deck;
}

function key(absen) {
  return String(absen);
}

function bisaDimainkan(card, state) {
  if (card.kind === "wild" || card.kind === "wild4") return true;
  if (card.color === state.color) return true;
  if (card.kind === "num" && state.top.kind === "num") return card.value === state.top.value;
  if (card.kind !== "num" && card.kind === state.top.kind) return true;
  return false;
}

function langkah(jumlah, slot, dir, n) {
  let s = slot;
  for (let i = 0; i < n; i += 1) s = (s + dir + jumlah) % jumlah;
  return s;
}

function ambilKartu(hidden, hand, n) {
  const hasil = [];
  for (let i = 0; i < n; i += 1) {
    if (!hidden.deck.length) {
      const top = hidden.discard[hidden.discard.length - 1];
      const sisa = hidden.discard.slice(0, -1);
      if (!sisa.length) break;
      hidden.deck = shuffle(sisa);
      hidden.discard = top ? [top] : [];
    }
    if (!hidden.deck.length) break;
    const kartu = hidden.deck.pop();
    hand.push(kartu);
    hasil.push(kartu);
  }
  return hasil;
}

function hitungTangan(state, players, hidden) {
  const counts = {};
  for (const p of players) counts[key(p.absen)] = (hidden.hands[key(p.absen)] || []).length;
  state.handCounts = counts;
  state.deckCount = hidden.deck.length;
  state.discardCount = hidden.discard.length;
}

function create(players) {
  const deck = shuffle(buatDeck());
  const hands = {};
  for (const p of players) hands[key(p.absen)] = deck.splice(0, 7);
  let top = deck.pop();
  let guard = 0;
  while ((top.kind === "wild" || top.kind === "wild4") && guard < 200) {
    guard += 1;
    deck.unshift(top);
    top = deck.pop();
  }
  const discard = [top];
  const hidden = { hands, deck, discard };
  const state = {
    top,
    color: top.color,
    turn: 0,
    direction: 1,
    handCounts: {},
    deckCount: 0,
    discardCount: 0,
    drawOpen: null,
    lastAction: "Kartu dibagikan. Pemain 1 jalan duluan.",
  };
  hitungTangan(state, players, hidden);
  return { state, hidden };
}

function move(state, slot, payload, ctx) {
  const players = ctx.players;
  const hidden = JSON.parse(JSON.stringify(ctx.hidden || { hands: {}, deck: [], discard: [] }));
  const jumlah = players.length;
  const actor = key(players[slot].absen);
  const next = JSON.parse(JSON.stringify(state));
  if (next.turn !== slot) throw new HttpError(400, "Bukan giliranmu.", "not-your-turn");
  const tipe = payload && payload.type;

  if (tipe === "play") {
    if (next.drawOpen && next.drawOpen.slot !== slot) {
      throw new HttpError(400, "Tunggu pemain itu menyelesaikan kartu hasil ambil.", "invalid-move");
    }
    const hand = hidden.hands[actor] || [];
    const cardId = typeof payload.cardId === "string" ? payload.cardId : "";
    const index = hand.findIndex((c) => c.id === cardId);
    if (index < 0) throw new HttpError(400, "Kartu itu tidak ada di tanganmu.", "invalid-move");
    if (next.drawOpen && next.drawOpen.cardId !== cardId) {
      throw new HttpError(400, "Kamu hanya boleh memainkan kartu yang baru diambil, atau pilih Lewat.", "invalid-move");
    }
    const card = hand[index];
    if (!bisaDimainkan(card, next)) {
      throw new HttpError(400, "Kartu itu tidak cocok dengan warna/angka di atas.", "invalid-move");
    }
    let warna = card.color;
    if (card.kind === "wild" || card.kind === "wild4") {
      warna = typeof payload.color === "string" ? payload.color : "";
      if (!COLORS.includes(warna)) throw new HttpError(400, "Pilih warna untuk kartu Wild.", "invalid-move");
    }

    hand.splice(index, 1);
    next.drawOpen = null;
    next.top = { id: card.id, color: card.color, kind: card.kind, value: card.value };
    next.color = warna;
    hidden.discard.push(card);
    hitungTangan(next, players, hidden);

    let teks = `Pemain ${slot + 1} memainkan ${namaKartu(card, warna)}.`;
    const dir = next.direction;
    const target = langkah(jumlah, slot, dir, 1);

    if (hand.length === 0) {
      next.lastAction = `${teks} Habis! Pemain ${slot + 1} menang.`;
      return {
        state: next,
        hidden,
        hand: [],
        touched: [actor],
        finished: true,
        winners: [slot],
        draw: false,
        event: next.lastAction,
      };
    }

    if (card.kind === "skip") {
      next.turn = langkah(jumlah, slot, dir, 2);
      teks += ` Pemain ${target + 1} terlewat.`;
    } else if (card.kind === "rev") {
      next.direction = -dir;
      if (jumlah === 2) {
        next.turn = slot;
        teks += " Arah dibalik, pemain lawan terlewat.";
      } else {
        next.turn = langkah(jumlah, slot, next.direction, 1);
        teks += " Arah permainan dibalik.";
      }
    } else if (card.kind === "d2" || card.kind === "wild4") {
      const n = card.kind === "d2" ? 2 : 4;
      const korban = hidden.hands[key(players[target].absen)] || [];
      ambilKartu(hidden, korban, n);
      next.turn = langkah(jumlah, slot, dir, 2);
      teks += ` Pemain ${target + 1} ambil ${n} kartu dan terlewat.`;
    } else {
      next.turn = langkah(jumlah, slot, dir, 1);
    }

    hitungTangan(next, players, hidden);
    next.lastAction = `${teks} Giliran pemain ${next.turn + 1}.`;
    const touched = [actor];
    if (card.kind === "d2" || card.kind === "wild4") touched.push(key(players[target].absen));
    return { state: next, hidden, hand, touched, finished: false, event: next.lastAction };
  }

  if (tipe === "draw") {
    if (next.drawOpen && next.drawOpen.slot === slot) {
      throw new HttpError(400, "Mainkan kartu yang barusan diambil atau pilih Lewat.", "invalid-move");
    }
    const actorHand = hidden.hands[actor] || [];
    const hasil = ambilKartu(hidden, actorHand, 1);
    hitungTangan(next, players, hidden);
    if (!hasil.length) {
      next.turn = langkah(jumlah, slot, next.direction, 1);
      next.lastAction = `Tumpukan habis, pemain ${slot + 1} tidak dapat kartu. Giliran pemain ${next.turn + 1}.`;
      return { state: next, hidden, hand: actorHand, touched: [actor], finished: false, event: next.lastAction };
    }
    const kartu = hasil[0];
    if (bisaDimainkan(kartu, next)) {
      next.drawOpen = { slot, cardId: kartu.id };
      next.lastAction = `Pemain ${slot + 1} mengambil kartu. Boleh langsung dimainkan atau Lewat.`;
    } else {
      next.turn = langkah(jumlah, slot, next.direction, 1);
      next.lastAction = `Pemain ${slot + 1} mengambil kartu dan tidak bisa memainkannya. Giliran pemain ${next.turn + 1}.`;
    }
    return { state: next, hidden, hand: actorHand, touched: [actor], finished: false, event: next.lastAction };
  }

  if (tipe === "pass") {
    if (!next.drawOpen || next.drawOpen.slot !== slot) {
      throw new HttpError(400, "Tidak ada kartu hasil ambil yang menunggu.", "invalid-move");
    }
    next.drawOpen = null;
    next.turn = langkah(jumlah, slot, next.direction, 1);
    next.lastAction = `Pemain ${slot + 1} memilih lewat. Giliran pemain ${next.turn + 1}.`;
    hitungTangan(next, players, hidden);
    return { state: next, hidden, hand: hidden.hands[actor], touched: [actor], finished: false, event: next.lastAction };
  }

  throw new HttpError(400, "Aksi kartu tidak dikenal.", "invalid-move");
}

function namaKartu(card, warna) {
  const label = { r: "Merah", y: "Kuning", g: "Hijau", b: "Biru", w: "Wild" };
  if (card.kind === "num") return `${card.value} ${label[card.color] || ""}`;
  if (card.kind === "skip") return `Skip ${label[card.color] || ""}`;
  if (card.kind === "rev") return `Reverse ${label[card.color] || ""}`;
  if (card.kind === "d2") return `Draw Two ${label[card.color] || ""}`;
  if (card.kind === "wild") return `Wild (${label[warna] || "?"})`;
  if (card.kind === "wild4") return `Wild Draw Four (${label[warna] || "?"})`;
  return "kartu";
}

module.exports = {
  id: ID,
  mode: MODE,
  minPlayers: MIN,
  maxPlayers: MAX,
  judul: "UNO",
  create,
  move,
  COLORS,
  bisaDimainkan,
};
