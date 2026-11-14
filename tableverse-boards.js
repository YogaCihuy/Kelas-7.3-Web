/* TableVerse board renderers (client side).
   Semua papan hanya untuk tampilan + input; validasi tetap di server. */
(function () {
  "use strict";

  const GAMES = {
    ttt: {
      id: "ttt",
      judul: "Tic Tac Toe",
      mode: "duel",
      desc: "Susun tiga X atau O berderet sebelum lawan. Cepat, klasik, seru.",
      tag: "Klasik",
      accent: "mint",
    },
    checkers: {
      id: "checkers",
      judul: "Checkers",
      mode: "duel",
      desc: "Lompati bidak lawan dan jadikan king. Lompatan wajib kalau ada.",
      tag: "Strategi",
      accent: "amber",
    },
    chess: {
      id: "chess",
      judul: "Chess",
      mode: "duel",
      desc: "Catur lengkap: skak, skakmat, remis, promosi. Otakmu diuji.",
      tag: "Strategi",
      accent: "violet",
    },
    ludo: {
      id: "ludo",
      judul: "Ludo",
      mode: "party",
      desc: "Balapan 4 bidak pulang ke rumah. Tangkap lawan, hindari zona aman.",
      tag: "Party",
      accent: "rose",
    },
    snakes: {
      id: "snakes",
      judul: "Ular Tangga",
      mode: "party",
      desc: "Lempar dadu, naik tangga, kabur dari ular. Pertama sampai 100 menang.",
      tag: "Party",
      accent: "teal",
    },
    uno: {
      id: "uno",
      judul: "UNO",
      mode: "party",
      desc: "Kartu warna, skip, reverse, +2, wild +4. Habiskan kartu duluan.",
      tag: "Kartu",
      accent: "coral",
    },
  };

  const GAME_ORDER = ["ttt", "checkers", "chess", "ludo", "snakes", "uno"];

  const LUDO_PATH = [
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
    [0, 7],
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    [7, 14],
    [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    [14, 7],
    [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [7, 0],
    [6, 0],
  ];
  const LUDO_START = [0, 13, 26, 39];
  const LUDO_LANES = [
    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  ];
  const LUDO_BASE = [
    [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
    [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
    [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
    [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
  ];
  const LUDO_BASE_QUADRANTS = [
    [0, 0, 5, 5], [0, 9, 5, 14], [9, 9, 14, 14], [9, 0, 14, 5],
  ];
  const LUDO_SAFE = new Set();
  LUDO_START.forEach((s) => { LUDO_SAFE.add(s); LUDO_SAFE.add((s + 8) % 52); });

  const SNAKES_LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
  const SNAKES_SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };

  const CHESS_GLYPH = {
    K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
    k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function inisial(nama) {
    const bersih = String(nama || "?").trim();
    if (!bersih) return "?";
    return bersih.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }

  function hue(absen) {
    return (Number(absen) * 47) % 360;
  }

  function avatar(nama, absen, ekstra) {
    return `<span class="tv-avatar ${ekstra || ""}" style="--tv-h:${hue(absen)}" aria-hidden="true">${esc(inisial(nama))}</span>`;
  }

  function namaPemain(room, slot) {
    const p = room && room.players ? room.players.find((x) => x.slot === slot) : null;
    return p ? p.nama : `Pemain ${slot + 1}`;
  }

  function thumbnail(gameId) {
    switch (gameId) {
      case "ttt":
        return `<span class="tv-thumb-art tv-thumb-ttt"><i>X</i><i>O</i><i>X</i><i>O</i><i>X</i></span>`;
      case "checkers":
        return `<span class="tv-thumb-art tv-thumb-checkers"><i></i><i></i><i></i><i></i></span>`;
      case "chess":
        return `<span class="tv-thumb-art tv-thumb-chess"><b>♞</b><span></span></span>`;
      case "ludo":
        return `<span class="tv-thumb-art tv-thumb-ludo"><i></i><i></i><i></i><i></i><b>●</b></span>`;
      case "snakes":
        return `<span class="tv-thumb-art tv-thumb-snakes"><b>🐍</b><i></i><i></i><i></i><i></i><em>100</em></span>`;
      case "uno":
        return `<span class="tv-thumb-art tv-thumb-uno"><i class="u-r">7</i><i class="u-y">+2</i><i class="u-g">★</i></span>`;
      default:
        return `<span class="tv-thumb-art">🎲</span>`;
    }
  }

  /* ---------------- TIC TAC TOE ---------------- */
  function papanTTT(room, mySlot) {
    const st = room.state || {};
    const board = st.board || Array(9).fill(null);
    const aktif = room.status === "playing" && st.turn === mySlot;
    const last = st.lastMove ? st.lastMove.index : -1;
    const cells = board.map((v, i) => {
      const disabled = !aktif || !!v;
      const kelas = [
        "tv-ttt-cell",
        v ? `is-${v.toLowerCase()}` : "",
        last === i ? "is-last" : "",
        !disabled ? "is-open" : "",
      ].filter(Boolean).join(" ");
      return `<button type="button" class="${kelas}" data-tv-act="ttt" data-index="${i}" ${disabled ? "disabled" : ""} aria-label="Kotak ${i + 1}">${v ? `<span>${v}</span>` : ""}</button>`;
    }).join("");
    return `
      <div class="tv-board-wrap">
        <div class="tv-board tv-ttt">${cells}</div>
        <p class="tv-board-note">${aktif ? "Giliranmu. Pilih kotak kosong." : `Menunggu ${esc(namaPemain(room, st.turn))}.`}</p>
      </div>`;
  }

  /* ---------------- CHECKERS ---------------- */
  function chkOwner(piece) {
    if (piece === "r" || piece === "R") return "r";
    if (piece === "b" || piece === "B") return "b";
    return null;
  }
  function chkDirs(piece) {
    if (piece === "R" || piece === "B") return [-1, 1];
    return piece === "r" ? [-1] : [1];
  }
  function chkLegal(board, slot, pending) {
    const kode = slot === 0 ? "r" : "b";
    const lawan = slot === 0 ? "b" : "r";
    const caps = [];
    const plain = [];
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const piece = board[r] && board[r][c];
        if (!piece || chkOwner(piece) !== kode) continue;
        if (pending && (pending.r !== r || pending.c !== c)) continue;
        for (const dr of chkDirs(piece)) {
          for (const dc of [-1, 1]) {
            const r1 = r + dr, c1 = c + dc, r2 = r + dr * 2, c2 = c + dc * 2;
            if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
            if (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && !board[r2][c2] && chkOwner(board[r1][c1]) === lawan) {
              caps.push({ from: [r, c], to: [r2, c2] });
            }
            if (!pending && !board[r1][c1]) plain.push({ from: [r, c], to: [r1, c1] });
          }
        }
      }
    }
    return caps.length ? caps : plain;
  }
  function papanCheckers(room, mySlot, ui) {
    const st = room.state || {};
    const board = st.board || [];
    const aktif = room.status === "playing" && st.turn === mySlot;
    const legal = aktif ? chkLegal(board, mySlot, st.pending || null) : [];
    const sel = ui && ui.sel ? ui.sel : null;
    const tujuan = new Set();
    if (sel) legal.forEach((m) => { if (m.from[0] === sel[0] && m.from[1] === sel[1]) tujuan.add(`${m.to[0]},${m.to[1]}`); });
    const bisaDipilih = new Set(legal.map((m) => `${m.from[0]},${m.from[1]}`));

    let cells = "";
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const terang = (r + c) % 2 === 0;
        const piece = board[r] ? board[r][c] : null;
        const milik = piece && chkOwner(piece);
        const tombol = iiBisaAksi(aktif, milik, mySlot, bisaDipilih, tujuan, r, c);
        const kelas = [
          "tv-chk-cell",
          terang ? "is-light" : "is-dark",
          sel && sel[0] === r && sel[1] === c ? "is-sel" : "",
          tujuan.has(`${r},${c}`) ? "is-target" : "",
          tombol ? "is-action" : "",
        ].filter(Boolean).join(" ");
        cells += `<button type="button" class="${kelas}" data-tv-act="chk" data-r="${r}" data-c="${c}" ${tombol ? "" : "disabled"} aria-label="Baris ${r + 1} kolom ${c + 1}">${
          piece ? `<span class="tv-chk-piece ${milik === "r" ? "is-r" : "is-b"} ${piece === "R" || piece === "B" ? "is-king" : ""}">${piece === "R" || piece === "B" ? "♛" : ""}</span>` : ""
        }</button>`;
      }
    }
    return `
      <div class="tv-board-wrap">
        <div class="tv-board tv-chk">${cells}</div>
        <p class="tv-board-note">${aktif ? (st.pending ? "Lompatan beruntun: lanjutkan dengan bidak yang sama." : "Giliranmu. Pilih bidak lalu tujuan.") : `Menunggu ${esc(namaPemain(room, st.turn))}.`}</p>
      </div>`;
  }
  function iiBisaAksi(aktif, milik, mySlot, bisaDipilih, tujuan, r, c) {
    if (!aktif) return false;
    if (milik === (mySlot === 0 ? "r" : "b") && bisaDipilih.has(`${r},${c}`)) return true;
    return tujuan.has(`${r},${c}`);
  }

  /* ---------------- CHESS ---------------- */
  function fenBoard(fen) {
    const rows = String(fen || "").split(" ")[0].split("/");
    return rows.map((row) => {
      const line = [];
      for (const ch of row) {
        if (/\d/.test(ch)) {
          for (let i = 0; i < Number(ch); i += 1) line.push(null);
        } else {
          line.push(ch);
        }
      }
      return line;
    });
  }
  function papanChess(room, mySlot, ui) {
    const st = room.state || {};
    const board = fenBoard(st.fen || "8/8/8/8/8/8/8/8 w - - 0 1");
    const putih = mySlot === 0;
    const aktif = room.status === "playing" && st.turn === mySlot;
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const last = st.lastMove || {};
    const sel = ui && ui.sel ? ui.sel : null;
    let cells = "";

    for (let br = 0; br < 8; br += 1) {
      for (let bc = 0; bc < 8; bc += 1) {
        const r = putih ? br : 7 - br;
        const c = putih ? bc : 7 - bc;
        const piece = board[r] ? board[r][c] : null;
        const sq = files[c] + (8 - r);
        const terang = (r + c) % 2 === 0;
        const milikku = piece && (putih ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
        const kelas = [
          "tv-chess-cell",
          terang ? "is-light" : "is-dark",
          milikku && aktif ? "is-mine" : "",
          sel === sq ? "is-sel" : "",
          last.from === sq ? "is-last" : "",
          last.to === sq ? "is-last-to" : "",
        ].filter(Boolean).join(" ");
        cells += `<button type="button" class="${kelas}" data-tv-act="chess" data-sq="${sq}" ${aktif ? "" : "disabled"} aria-label="${sq}">
          ${piece ? `<span class="tv-chess-piece ${piece === piece.toUpperCase() ? "is-putih" : "is-hitam"}">${CHESS_GLYPH[piece] || ""}</span>` : ""}
        </button>`;
      }
    }
    return `
      <div class="tv-board-wrap">
        <div class="tv-board tv-chess">${cells}</div>
        <p class="tv-board-note">${aktif ? "Giliranmu. Klik bidak lalu kotak tujuan. Promosi otomatis jadi Ratu." : `Menunggu ${esc(namaPemain(room, st.turn))}.`}${st.check ? " Raja sedang diskak!" : ""}</p>
      </div>`;
  }

  /* ---------------- LUDO ---------------- */
  function ludoCell(slot, pos, tokenIndex) {
    if (pos === -1) return LUDO_BASE[slot][tokenIndex];
    if (pos <= 51) return LUDO_PATH[(LUDO_START[slot] + pos) % 52];
    if (pos <= 56) return LUDO_LANES[slot][pos - 52];
    return [7, 7];
  }
  function ludoLegal(tokens, slot, dice) {
    const hasil = [];
    for (let i = 0; i < 4; i += 1) {
      const pos = tokens[slot][i];
      if (pos === 57) continue;
      if (pos === -1) {
        if (dice === 6) hasil.push(i);
      } else if (pos + dice <= 57) {
        hasil.push(i);
      }
    }
    return hasil;
  }
  function papanLudo(room, mySlot) {
    const st = room.state || {};
    const tokens = st.tokens || [[-1, -1, -1, -1], [-1, -1, -1, -1]];
    const aktif = room.status === "playing" && st.turn === mySlot;
    const legal = aktif && st.rolled ? ludoLegal(tokens, mySlot, st.dice) : [];
    const startSet = {};
    LUDO_START.forEach((idx, slot) => { startSet[idx] = slot; });

    let cells = "";
    for (let r = 0; r < 15; r += 1) {
      for (let c = 0; c < 15; c += 1) {
        let kelas = "tv-ludo-blank";
        let slotBase = -1;
        LUDO_BASE_QUADRANTS.forEach((q, slot) => {
          if (r >= q[0] && r <= q[2] && c >= q[1] && c <= q[3]) slotBase = slot;
        });
        if (slotBase >= 0) {
          kelas = `tv-ludo-base tv-ludo-base-${slotBase}`;
        } else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
          kelas = "tv-ludo-center";
        } else {
          const idx = LUDO_PATH.findIndex((p) => p[0] === r && p[1] === c);
          if (idx >= 0) {
            kelas = "tv-ludo-path";
            if (startSet[idx] !== undefined) kelas += ` tv-ludo-start tv-ludo-start-${startSet[idx]}`;
            LUDO_LANES.forEach((lane, slot) => {
              if (lane.some((p) => p[0] === r && p[1] === c)) kelas = `tv-ludo-lane tv-ludo-lane-${slot}`;
            });
          } else {
            LUDO_LANES.forEach((lane, slot) => {
              if (lane.some((p) => p[0] === r && p[1] === c)) kelas = `tv-ludo-lane tv-ludo-lane-${slot}`;
            });
          }
        }
        cells += `<span class="${kelas}"></span>`;
      }
    }

    const posisi = [];
    tokens.forEach((row, slot) => {
      row.forEach((pos, i) => {
        const [r, c] = ludoCell(slot, pos, i);
        posisi.push({ slot, i, pos, r, c });
      });
    });
    const grup = {};
    posisi.forEach((t) => {
      const k = `${t.r.toFixed(2)},${t.c.toFixed(2)}`;
      grup[k] = grup[k] || [];
      grup[k].push(t);
    });
    let tokenHtml = "";
    Object.keys(grup).forEach((k) => {
      const list = grup[k];
      list.forEach((t, idx) => {
        const offset = list.length > 1 ? (idx - (list.length - 1) / 2) * 0.38 : 0;
        const left = ((t.c + 0.5 + offset) / 15) * 100;
        const top = ((t.r + 0.5 + (list.length > 1 ? offset * 0.5 : 0)) / 15) * 100;
        const bisa = aktif && legal.includes(t.i) && t.slot === mySlot;
        tokenHtml += `<button type="button" class="tv-ludo-token tv-ludo-token-${t.slot} ${bisa ? "is-action" : ""}" style="left:${left}%;top:${top}%" data-tv-act="ludo-token" data-token="${t.i}" ${bisa ? "" : "disabled"} title="${esc(namaPemain(room, t.slot))} bidak ${t.i + 1}">${t.i + 1}</button>`;
      });
    });

    const dice = st.dice ? dadu(st.dice) : `<span class="tv-dice tv-dice-kosong">?</span>`;
    const status = aktif
      ? st.rolled
        ? "Pilih bidak yang mau dijalankan."
        : "Lempar dadu untuk jalan."
      : `Menunggu ${esc(namaPemain(room, st.turn))}.`;

    return `
      <div class="tv-board-wrap tv-ludo-wrap">
        <div class="tv-board tv-ludo">${cells}${tokenHtml}</div>
        <div class="tv-dice-row">
          ${dice}
          ${aktif && !st.rolled ? `<button type="button" class="tv-btn tv-btn-primary" data-tv-act="ludo-roll">Lempar Dadu</button>` : ""}
          <span class="tv-board-note">${status}</span>
        </div>
      </div>`;
  }

  function dadu(n) {
    if (!n) return `<span class="tv-dice tv-dice-kosong">?</span>`;
    const pips = {
      1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
    };
    const set = new Set(pips[n] || []);
    let isi = "";
    for (let i = 0; i < 9; i += 1) isi += `<i class="${set.has(i) ? "on" : ""}"></i>`;
    return `<span class="tv-dice" aria-label="Dadu ${n}">${isi}</span>`;
  }

  /* ---------------- SNAKES & LADDERS ---------------- */
  function snakeCellCenter(n) {
    const b = Math.floor((n - 1) / 10);
    const pos = (n - 1) % 10;
    const col = b % 2 === 0 ? pos : 9 - pos;
    const row = 9 - b;
    return [row, col];
  }
  function papanSnakes(room, mySlot) {
    const st = room.state || {};
    const positions = st.positions || [];
    const aktif = room.status === "playing" && st.turn === mySlot;
    let cells = "";
    for (let i = 0; i < 100; i += 1) {
      const rowDisplay = Math.floor(i / 10);
      const pos = i % 10;
      const b = 9 - rowDisplay;
      const n = b * 10 + (b % 2 === 0 ? pos + 1 : 10 - pos);
      const kelas = `tv-snake-cell ${(Math.floor((n - 1) / 10) + (n % 10)) % 2 === 0 ? "is-alt" : ""} ${n === 100 ? "is-finish" : ""}`;
      cells += `<span class="${kelas}">${n}</span>`;
    }

    const posisi = [];
    positions.forEach((pos, slot) => {
      const tampil = pos || 1; // pemain di posisi 0 tetap kelihatan di kotak start
      let [r, c] = snakeCellCenter(tampil);
      if (tampil === 100) [r, c] = [0, 9];
      posisi.push({ slot, pos: tampil, r, c });
    });
    const grup = {};
    posisi.forEach((t) => { grup[`${t.r},${t.c}`] = grup[`${t.r},${t.c}`] || []; grup[`${t.r},${t.c}`].push(t); });
    let tokens = "";
    Object.values(grup).forEach((list) => {
      list.forEach((t, idx) => {
        const off = list.length > 1 ? (idx - (list.length - 1) / 2) * 0.24 : 0;
        const left = ((t.c + 0.5 + off) / 10) * 100;
        const top = ((t.r + 0.5 + (list.length > 1 ? off * 0.6 : 0)) / 10) * 100;
        tokens += `<span class="tv-snake-token tv-ludo-token-${t.slot}" style="left:${left}%;top:${top}%">${t.slot + 1}</span>`;
      });
    });

    let svg = "";
    Object.keys(SNAKES_LADDERS).forEach((from) => {
      const [r1, c1] = snakeCellCenter(Number(from));
      const [r2, c2] = snakeCellCenter(SNAKES_LADDERS[from]);
      svg += `<line x1="${(c1 + 0.5) * 10}" y1="${(r1 + 0.5) * 10}" x2="${(c2 + 0.5) * 10}" y2="${(r2 + 0.5) * 10}" class="tv-ladder-line" />`;
    });
    Object.keys(SNAKES_SNAKES).forEach((from) => {
      const [r1, c1] = snakeCellCenter(Number(from));
      const [r2, c2] = snakeCellCenter(SNAKES_SNAKES[from]);
      const mx = ((c1 + c2) / 2 + (c1 % 2 === 0 ? 2.5 : -2.5)) * 10;
      const my = ((r1 + r2) / 2) * 10;
      svg += `<path d="M ${(c1 + 0.5) * 10} ${(r1 + 0.5) * 10} Q ${mx} ${my} ${(c2 + 0.5) * 10} ${(r2 + 0.5) * 10}" class="tv-snake-line" />`;
    });

    const dice = st.dice ? dadu(st.dice) : `<span class="tv-dice tv-dice-kosong">?</span>`;
    return `
      <div class="tv-board-wrap tv-snake-wrap">
        <div class="tv-board tv-snake">
          ${cells}
          <svg class="tv-snake-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>
          ${tokens}
        </div>
        <div class="tv-dice-row">
          ${dice}
          ${aktif ? `<button type="button" class="tv-btn tv-btn-primary" data-tv-act="snakes-roll">Lempar Dadu</button>` : ""}
          <span class="tv-board-note">${aktif ? "Lempar dadu, jalan otomatis." : `Menunggu ${esc(namaPemain(room, st.turn))}.`}</span>
        </div>
      </div>`;
  }

  /* ---------------- UNO ---------------- */
  function unoLabel(card) {
    if (!card) return "";
    if (card.kind === "num") return String(card.value);
    if (card.kind === "skip") return "⊘";
    if (card.kind === "rev") return "⇄";
    if (card.kind === "d2") return "+2";
    if (card.kind === "wild") return "★";
    if (card.kind === "wild4") return "+4";
    return "?";
  }
  function unoColorName(color) {
    return { r: "Merah", y: "Kuning", g: "Hijau", b: "Biru", w: "Wild" }[color] || color;
  }
  function unoCard(card, opts) {
    if (!card) return "";
    const o = opts || {};
    const warna = card.color === "w" ? "w" : card.color;
    const kelas = [
      "tv-uno-card",
      `is-${warna}`,
      o.disabled ? "is-disabled" : "",
      o.playable ? "is-playable" : "",
      o.dim ? "is-dim" : "",
      o.small ? "is-small" : "",
    ].filter(Boolean).join(" ");
    const isi = `<span class="tv-uno-collar"><b>${esc(unoLabel(card))}</b>${card.kind === "d2" || card.kind === "wild4" ? `<em>${card.kind === "wild4" ? "WILD" : ""}</em>` : ""}</span>`;
    if (o.button) {
      return `<button type="button" class="${kelas}" data-tv-act="uno-play" data-card="${esc(card.id)}" ${o.disabled ? "disabled" : ""} aria-label="${esc(unoColorName(card.color))} ${esc(unoLabel(card))}">${isi}</button>`;
    }
    return `<span class="${kelas}">${isi}</span>`;
  }
  function unoPlayable(card, st) {
    if (!card || !st || !st.top) return false;
    if (card.kind === "wild" || card.kind === "wild4") return true;
    if (card.color === st.color) return true;
    if (card.kind === "num" && st.top.kind === "num") return card.value === st.top.value;
    if (card.kind !== "num" && card.kind === st.top.kind) return true;
    return false;
  }
  function papanUno(room, mySlot, ui) {
    const st = room.state || {};
    const aktif = room.status === "playing" && st.turn === mySlot;
    const tangan = (ui && ui.hand) || [];
    const drawOpen = st.drawOpen && st.drawOpen.slot === mySlot ? st.drawOpen : null;
    const players = room.players || [];
    const urut = [];
    for (let i = 1; i < players.length; i += 1) urut.push(players[(mySlot + i) % players.length]);

    const opponents = urut.map((p) => {
      const count = (st.handCounts && st.handCounts[String(p.absen)]) || 0;
      const bergilir = st.turn === p.slot;
      return `
        <div class="tv-uno-seat ${bergilir ? "is-turn" : ""} ${p.left ? "is-left" : ""}">
          ${avatar(p.nama, p.absen)}
          <strong>${esc(p.nama)}</strong>
          <span class="tv-uno-count">${count} kartu${count === 1 ? " · UNO!" : ""}</span>
        </div>`;
    }).join("");

    const kartu = tangan.map((c) => {
      const legal = aktif && (!drawOpen || drawOpen.cardId === c.id) && unoPlayable(c, st);
      return unoCard(c, { button: true, playable: legal, disabled: !legal, dim: !legal && aktif });
    }).join("");

    const arah = st.direction === -1 ? "↺" : "↻";
    return `
      <div class="tv-uno-table">
        <div class="tv-uno-opponents">${opponents}</div>
        <div class="tv-uno-center">
          <div class="tv-uno-piles">
            <button type="button" class="tv-uno-deck" data-tv-act="uno-draw" ${aktif && !drawOpen ? "" : "disabled"} aria-label="Ambil kartu">
              <span class="tv-uno-back">UNO</span>
              <small>${st.deckCount || 0}</small>
            </button>
            <div class="tv-uno-discard">${unoCard(st.top, {})}</div>
          </div>
          <div class="tv-uno-meta">
            <span class="tv-uno-color is-${st.color}">${esc(unoColorName(st.color))}</span>
            <span class="tv-uno-dir" title="Arah permainan">${arah}</span>
          </div>
          <p class="tv-board-note">${aktif ? (drawOpen ? "Kamu baru ambil kartu. Mainkan atau Lewat." : "Giliranmu. Pilih kartu yang cocok.") : `Menunggu ${esc(namaPemain(room, st.turn))}.`}</p>
          ${drawOpen ? `<button type="button" class="tv-btn tv-btn-ghost" data-tv-act="uno-pass">Lewat</button>` : ""}
        </div>
        <div class="tv-uno-hand-wrap">
          <div class="tv-uno-hand">${kartu || `<span class="tv-uno-empty">Tanganmu kosong.</span>`}</div>
        </div>
      </div>`;
  }

  function papan(gameId, room, mySlot, ui) {
    switch (gameId) {
      case "ttt": return papanTTT(room, mySlot, ui);
      case "checkers": return papanCheckers(room, mySlot, ui);
      case "chess": return papanChess(room, mySlot, ui);
      case "ludo": return papanLudo(room, mySlot, ui);
      case "snakes": return papanSnakes(room, mySlot, ui);
      case "uno": return papanUno(room, mySlot, ui);
      default: return `<p>Game belum tersedia.</p>`;
    }
  }

  window.TVBoards = {
    GAMES,
    GAME_ORDER,
    esc,
    inisial,
    avatar,
    thumbnail,
    papan,
    dadu,
    ludoLegal,
    ludoCell,
    chkLegal,
    fenBoard,
    unoCard,
    unoPlayable,
    unoLabel,
    unoColorName,
    LUDO_PATH,
    LUDO_START,
    LUDO_LANES,
    SNAKES_LADDERS,
    SNAKES_SNAKES,
  };
})();
