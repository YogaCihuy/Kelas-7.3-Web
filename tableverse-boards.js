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
    stick: {
      id: "stick",
      judul: "StickEskrim",
      mode: "party",
      desc: "Tepok stick es krim lawan pakai arah dan power. Stick terakhir yang bertahan menang.",
      tag: "Party",
      accent: "amber",
    },
  };

  const GAME_ORDER = ["ttt", "checkers", "chess", "ludo", "snakes", "stick"];

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

  // Label bidak: inisial pemain. Kalau ada yang bentrok, pakai dua huruf
  // pertama nama (dan terus memanjang kalau masih sama).
  function tokenLabels(room) {
    const aktif = (room && room.players ? room.players : []).filter((p) => !p.left);
    const dasar = aktif.map((p) => ({
      slot: Number(p.slot),
      absen: Number(p.absen),
      inis: inisial(p.nama),
      huruf: String(p.nama || "?").replace(/\s+/g, "").toUpperCase() || "?",
    }));
    const jumlah = {};
    dasar.forEach((p) => { jumlah[p.inis] = (jumlah[p.inis] || 0) + 1; });
    const pakai = new Set();
    const hasil = {};
    dasar.forEach((p) => {
      let label = p.inis;
      if (jumlah[p.inis] > 1) {
        let n = 2;
        label = p.huruf.slice(0, n);
        while (n < p.huruf.length && (pakai.has(label) || dasar.some((q) => q !== p && q.huruf.slice(0, n) === label))) {
          n += 1;
          label = p.huruf.slice(0, n);
        }
        if (pakai.has(label)) label = `${p.huruf.slice(0, 2)}${p.absen}`;
      }
      pakai.add(label);
      hasil[p.slot] = label;
    });
    return hasil;
  }

  function hue(absen) {
    return (Number(absen) * 47) % 360;
  }

  function avatar(nama, absen, ekstra) {
    let isi = "";
    let foto = "";
    try {
      foto = typeof window.gameProfilFoto === "function" ? window.gameProfilFoto(absen) : "";
      isi = typeof window.gameProfilAvatar === "function" ? window.gameProfilAvatar(absen) : "";
    } catch (err) {
      foto = "";
      isi = "";
    }
    let dalam = esc(inisial(nama));
    if (foto) dalam = `<img class="tv-avatar-foto" src="${esc(foto)}" alt="">`;
    else if (isi) dalam = `<span class="tv-avatar-emoji">${esc(isi)}</span>`;
    return `<span class="tv-avatar ${ekstra || ""}" style="--tv-h:${hue(absen)}" aria-hidden="true">${dalam}</span>`;
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
      case "stick":
        return `<span class="tv-thumb-art tv-thumb-stick"><i></i><i></i><b>👋</b></span>`;
      case "uno":
        return `<span class="tv-thumb-art tv-thumb-uno"><i class="u-r">7</i><i class="u-y">+2</i><i class="u-g">★</i></span>`;
      default:
        return `<span class="tv-thumb-art">🎲</span>`;
    }
  }

  /* ---------------- TIC TAC TOE ---------------- */
  function papanTTT(room, mySlot, ui) {
    const st = room.state || {};
    const board = st.board || Array(9).fill(null);
    const aktif = room.status === "playing" && st.turn === mySlot;
    const last = st.lastMove ? st.lastMove.index : -1;
    const segar = !!(ui && ui.animate && st.lastMove);
    const cells = board.map((v, i) => {
      const disabled = !aktif || !!v;
      const kelas = [
        "tv-ttt-cell",
        v ? `is-${v.toLowerCase()}` : "",
        last === i ? "is-last" : "",
        segar && last === i ? "is-pop" : "",
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
    const board = st.board || {};
    const aktif = room.status === "playing" && st.turn === mySlot;
    const legal = aktif ? chkLegal(board, mySlot, st.pending || null) : [];
    const sel = ui && ui.sel ? ui.sel : null;
    const tujuan = new Set();
    if (sel) legal.forEach((m) => { if (m.from[0] === sel[0] && m.from[1] === sel[1]) tujuan.add(`${m.to[0]},${m.to[1]}`); });
    const bisaDipilih = new Set(legal.map((m) => `${m.from[0]},${m.from[1]}`));

    const anim = ui && ui.animate && st.lastMove ? st.lastMove : null;
    const segar = !!(ui && ui.animate && !st.lastMove);
    const mvDari = anim && Array.isArray(anim.from) ? anim.from : null;
    const mvKe = anim && Array.isArray(anim.to) ? anim.to : null;
    const mvTangkap = anim && anim.capture && mvDari && mvKe
      ? [(mvDari[0] + mvKe[0]) / 2, (mvDari[1] + mvKe[1]) / 2]
      : null;

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
        let isi = "";
        if (piece) {
          const pindah = !!(mvDari && mvKe && mvKe[0] === r && mvKe[1] === c);
          const holderKelas = `tv-chk-holder ${pindah ? "is-moving" : ""}`;
          const gaya = pindah ? ` style="--dx:${(mvDari[1] - mvKe[1]) * 100}%;--dy:${(mvDari[0] - mvKe[0]) * 100}%"` : "";
          isi = `<span class="${holderKelas}"${gaya}><span class="tv-chk-piece ${milik === "r" ? "is-r" : "is-b"} ${piece === "R" || piece === "B" ? "is-king" : ""}">${piece === "R" || piece === "B" ? "♛" : ""}</span></span>`;
        } else if (mvTangkap && mvTangkap[0] === r && mvTangkap[1] === c) {
          isi = `<span class="tv-chk-burst" aria-hidden="true"></span>`;
        }
        cells += `<button type="button" class="${kelas}" data-tv-act="chk" data-r="${r}" data-c="${c}" ${tombol ? "" : "disabled"} aria-label="Baris ${r + 1} kolom ${c + 1}">${isi}</button>`;
      }
    }
    return `
      <div class="tv-board-wrap">
        <div class="tv-board tv-chk ${segar ? "is-fresh" : ""}">${cells}</div>
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
    const anim = ui && ui.animate && last.from && last.to ? last : null;
    const segar = !!(ui && ui.animate && !st.lastMove);
    let cells = "";

    const keRC = (sq) => [8 - Number(sq[1]), sq.charCodeAt(0) - 97];

    for (let br = 0; br < 8; br += 1) {
      for (let bc = 0; bc < 8; bc += 1) {
        const r = putih ? br : 7 - br;
        const c = putih ? bc : 7 - bc;
        const piece = board[r] ? board[r][c] : null;
        const sq = files[c] + (8 - r);
        const terang = (r + c) % 2 === 0;
        const milikku = piece && (putih ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
        const rajaDiskak = st.check && !!(piece && ((st.turn === 0 && piece === "K") || (st.turn === 1 && piece === "k")));
        const kelas = [
          "tv-chess-cell",
          terang ? "is-light" : "is-dark",
          milikku && aktif ? "is-mine" : "",
          sel === sq ? "is-sel" : "",
          last.from === sq ? "is-last" : "",
          last.to === sq ? "is-last-to" : "",
          rajaDiskak ? "is-check" : "",
        ].filter(Boolean).join(" ");
        let isi = "";
        if (piece) {
          const pindah = !!(anim && last.to === sq);
          let gaya = "";
          if (pindah) {
            const [r0, c0] = keRC(last.from);
            const [r1, c1] = keRC(last.to);
            const dr = putih ? r0 - r1 : r1 - r0;
            const dc = putih ? c0 - c1 : c1 - c0;
            gaya = ` style="--dx:${dc * 100}%;--dy:${dr * 100}%"`;
          }
          isi = `<span class="tv-chess-holder ${pindah ? "is-moving" : ""}"${gaya}><span class="tv-chess-piece ${piece === piece.toUpperCase() ? "is-putih" : "is-hitam"}">${CHESS_GLYPH[piece] || ""}</span></span>`;
        }
        cells += `<button type="button" class="${kelas}" data-tv-act="chess" data-sq="${sq}" ${aktif ? "" : "disabled"} aria-label="${sq}">${isi}</button>`;
      }
    }
    return `
      <div class="tv-board-wrap">
        <div class="tv-board tv-chess ${segar ? "is-fresh" : ""}">${cells}</div>
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
  function papanLudo(room, mySlot, ui) {
    const st = room.state || {};
    const tokens = st.tokens && typeof st.tokens === "object" ? st.tokens : {};
    const labels = tokenLabels(room);
    const aktif = room.status === "playing" && st.turn === mySlot;
    const legal = aktif && st.rolled ? ludoLegal(tokens, mySlot, st.dice) : [];
    const segar = !!(ui && ui.animate && !st.lastMove);
    const mv = ui && ui.animate && st.lastMove ? st.lastMove : null;
    const jumlahPemain = room.players ? room.players.filter((p) => !p.left).length : 2;

    const startSet = {};
    LUDO_START.forEach((idx, slot) => { startSet[idx] = slot; });
    const laneSet = {};
    LUDO_LANES.forEach((lane, slot) => lane.forEach((p) => { laneSet[`${p[0]},${p[1]}`] = slot; }));
    const safeSet = new Set(Array.from(LUDO_SAFE).map((idx) => (LUDO_PATH[idx] ? `${LUDO_PATH[idx][0]},${LUDO_PATH[idx][1]}` : "")));

    let cells = "";
    for (let r = 0; r < 15; r += 1) {
      for (let c = 0; c < 15; c += 1) {
        const k = `${r},${c}`;
        let kelas = "tv-ludo-blank";
        let isi = "";
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
            if (startSet[idx] !== undefined) {
              kelas += ` tv-ludo-start tv-ludo-start-${startSet[idx]}`;
              isi = `<span class="tv-ludo-mark" aria-hidden="true">★</span>`;
            } else if (safeSet.has(k)) {
              kelas += " tv-ludo-safe";
              isi = `<span class="tv-ludo-mark" aria-hidden="true">✦</span>`;
            }
          }
          if (laneSet[k] !== undefined) kelas = `tv-ludo-lane tv-ludo-lane-${laneSet[k]}`;
        }
        cells += `<span class="${kelas}">${isi}</span>`;
      }
    }

    let dekor = "";
    for (let slot = 0; slot < jumlahPemain && slot < 4; slot += 1) {
      const q = LUDO_BASE_QUADRANTS[slot];
      const top = ((q[0] + q[2]) / 2 + 0.5) / 15 * 100;
      const left = ((q[1] + q[3]) / 2 + 0.5) / 15 * 100;
      dekor += `<span class="tv-ludo-pad tv-ludo-pad-${slot}" style="left:${left}%;top:${top}%"><i></i><i></i><i></i><i></i></span>`;
    }
    dekor += `<span class="tv-ludo-home" aria-hidden="true">★</span>`;

    const posisi = [];
    Object.keys(tokens).forEach((key) => {
      const slot = Number(key);
      (tokens[key] || []).forEach((pos, i) => {
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
        const label = labels[t.slot] || String(t.slot + 1);
        let kelas = `tv-ludo-token tv-ludo-token-${t.slot}`;
        if (label.length > 1) kelas += " is-dua";
        let gaya = `left:${left}%;top:${top}%`;
        let awal = "";
        if (mv && mv.slot === t.slot && mv.token === t.i) {
          const [fr, fc] = ludoCell(t.slot, mv.from, t.i);
          awal = ` data-mv-l="${((fc + 0.5) / 15) * 100}" data-mv-t="${((fr + 0.5) / 15) * 100}"`;
          kelas += " is-moving";
        }
        if (bisa) kelas += " is-action";
        tokenHtml += `<button type="button" class="${kelas}" style="${gaya}" data-tv-act="ludo-token" data-token="${t.i}" data-slot="${t.slot}"${awal} ${bisa ? "" : "disabled"} title="${esc(namaPemain(room, t.slot))} bidak ${t.i + 1}">${esc(label)}</button>`;
      });
    });

    let burst = "";
    if (mv && Array.isArray(mv.captured)) {
      mv.captured.forEach((cap) => {
        const [r, c] = ludoCell(cap.slot, cap.pos, cap.token);
        burst += `<span class="tv-burst tv-burst-ludo" aria-hidden="true" style="left:${((c + 0.5) / 15) * 100}%;top:${((r + 0.5) / 15) * 100}%"></span>`;
      });
    }

    const legenda = (room.players || []).filter((p) => !p.left).map((p) => `
      <span class="tv-legend-chip"><b class="tv-legend-dot tv-legend-${p.slot}">${esc(labels[p.slot] || p.slot + 1)}</b>${esc(p.nama)}</span>`).join("");

    const dice = st.dice ? dadu(st.dice) : `<span class="tv-dice tv-dice-kosong">?</span>`;
    const status = aktif
      ? st.rolled
        ? "Pilih bidak yang mau dijalankan."
        : "Lempar dadu untuk jalan."
      : `Menunggu ${esc(namaPemain(room, st.turn))}.`;

    return `
      <div class="tv-board-wrap tv-ludo-wrap">
        <div class="tv-board tv-ludo ${segar ? "is-fresh" : ""}">${cells}${dekor}${tokenHtml}${burst}</div>
        <div class="tv-dice-row">
          <span class="tv-dice-slot ${ui && ui.animate && st.dice ? "is-rolling" : ""}">${dice}</span>
          ${aktif && !st.rolled ? `<button type="button" class="tv-btn tv-btn-primary" data-tv-act="ludo-roll">Lempar Dadu</button>` : ""}
          <span class="tv-board-note">${status}</span>
        </div>
        <div class="tv-board-legend">${legenda}</div>
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
  function snakePoint(n) {
    const [r, c] = snakeCellCenter(Math.max(1, Math.min(100, Number(n) || 1)));
    return [(c + 0.5) * 10, (r + 0.5) * 10];
  }
  function snakePercent(pos) {
    const [r, c] = snakeCellCenter(Math.max(1, Math.min(100, Number(pos) || 1)));
    return { l: ((c + 0.5) / 10) * 100, t: ((r + 0.5) / 10) * 100 };
  }

  /* Jalur animasi bidak: satu titik per kotak supaya gerakan tidak melompat. */
  function ludoTrack(slot, token, from, to) {
    const f = Number(from);
    const t = Number(to);
    const daftar = [];
    daftar.push(f);
    const mulai = f === -1 ? 0 : f + 1;
    for (let p = mulai; p <= t; p += 1) daftar.push(p);
    if (!daftar.length) daftar.push(f);
    return daftar.map((p) => {
      const [r, c] = ludoCell(slot, p, token);
      return { l: ((c + 0.5) / 15) * 100, t: ((r + 0.5) / 15) * 100 };
    });
  }

  function snakeTrack(mv, msPerStep) {
    const langkah = Math.max(120, Number(msPerStep) || 250);
    const from = Math.max(0, Number(mv && mv.from) || 0);
    const landed = Math.max(1, Math.min(100, Number(mv && mv.landed) || 1));
    const akhir = Math.max(1, Math.min(100, Number(mv && mv.to) || landed));
    const clampPct = (v) => Math.max(4, Math.min(96, v));
    const mulai = snakePercent(from);
    const titik = [{ l: clampPct(mulai.l), t: clampPct(mulai.t), ms: 0 }];
    for (let n = Math.max(from + 1, 2); n <= landed; n += 1) {
      const p = snakePercent(n);
      titik.push({ l: clampPct(p.l), t: clampPct(p.t), ms: langkah });
    }
    const jump = mv && (mv.jump === "ladder" || mv.jump === "snake") ? mv.jump : "";
    if (jump && akhir !== landed) {
      const [x1, y1] = snakePoint(landed);
      const [x2, y2] = snakePoint(akhir);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const bengkok = jump === "snake" ? Math.min(9, len * 0.34) : 0;
      const mx = (x1 + x2) / 2 + (-dy / len) * bengkok;
      const my = (y1 + y2) / 2 + (dx / len) * bengkok;
      const totalMs = jump === "ladder" ? 780 : 1000;
      const sampel = jump === "ladder" ? 6 : 10;
      for (let i = 1; i <= sampel; i += 1) {
        const t = i / sampel;
        const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
        const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
        titik.push({ l: clampPct(x), t: clampPct(y), ms: totalMs / sampel });
      }
    }
    return titik;
  }
  function papanSnakes(room, mySlot, ui) {
    const st = room.state || {};
    const positions = st.positions || [];
    const labels = tokenLabels(room);
    const aktif = room.status === "playing" && st.turn === mySlot;
    const segar = !!(ui && ui.animate && !st.lastMove);
    const mv = ui && ui.animate && st.lastMove ? st.lastMove : null;
    const ladders = st.ladders && typeof st.ladders === "object" ? st.ladders : SNAKES_LADDERS;
    const ular = st.snakes && typeof st.snakes === "object" ? st.snakes : SNAKES_SNAKES;
    const kakiTangga = new Set(Object.keys(ladders).map(Number));
    const ujungTangga = new Set(Object.keys(ladders).map((k) => Number(ladders[k])));
    const kepalaUlar = new Set(Object.keys(ular).map(Number));
    const ekorUlar = new Set(Object.keys(ular).map((k) => Number(ular[k])));

    let cells = "";
    for (let i = 0; i < 100; i += 1) {
      const rowDisplay = Math.floor(i / 10);
      const pos = i % 10;
      const b = 9 - rowDisplay;
      const n = b * 10 + (b % 2 === 0 ? pos + 1 : 10 - pos);
      const kelas = [
        "tv-snake-cell",
        (Math.floor((n - 1) / 10) + (n % 10)) % 2 === 0 ? "is-alt" : "",
        n === 1 ? "is-start" : "",
        n === 100 ? "is-finish" : "",
        kakiTangga.has(n) ? "is-ladder-foot" : "",
        ujungTangga.has(n) ? "is-ladder-top" : "",
        kepalaUlar.has(n) ? "is-snake-head" : "",
        ekorUlar.has(n) ? "is-snake-tail" : "",
      ].filter(Boolean).join(" ");
      cells += `<span class="${kelas}">${n}</span>`;
    }

    const posisi = positions.map((pos, slot) => {
      const tampil = pos > 0 ? Math.min(100, pos) : 1;
      const [r, c] = snakeCellCenter(tampil);
      return { slot, pos: tampil, r, c };
    });
    const grup = {};
    posisi.forEach((t) => { grup[`${t.r},${t.c}`] = grup[`${t.r},${t.c}`] || []; grup[`${t.r},${t.c}`].push(t); });
    let tokens = "";
    Object.values(grup).forEach((list) => {
      list.forEach((t, idx) => {
        // Bidak yang menempati kotak sama digeser menyamping supaya dua
        // inisial tetap terbaca, bukan saling menumpuk di satu titik.
        const off = list.length > 1 ? (idx - (list.length - 1) / 2) * 0.46 : 0;
        const left = Math.max(4, Math.min(96, ((t.c + 0.5 + off) / 10) * 100));
        const top = Math.max(4, Math.min(96, ((t.r + 0.5 + (list.length > 1 ? off * 0.35 : 0)) / 10) * 100));
        const label = labels[t.slot] || String(t.slot + 1);
        let kelas = `tv-snake-token tv-ludo-token-${t.slot}`;
        if (list.length > 1) kelas += " is-tumpuk";
        if (label.length > 1) kelas += " is-dua";
        let gaya = `left:${left}%;top:${top}%`;
        let awal = "";
        if (mv && mv.slot === t.slot) {
          const p0 = snakePercent(mv.from);
          awal = ` data-mv-l="${p0.l}" data-mv-t="${p0.t}"`;
          kelas += " is-hopping";
        }
        tokens += `<span class="${kelas}" style="${gaya}" data-slot="${t.slot}"${awal} title="${esc(namaPemain(room, t.slot))}">${esc(label)}</span>`;
      });
    });

    let svg = "";
    Object.keys(ladders).forEach((from) => {
      const to = Number(ladders[from]);
      const [x1, y1] = snakePoint(Number(from));
      const [x2, y2] = snakePoint(to);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * 1.25;
      const py = (dx / len) * 1.25;
      const jumlah = Math.max(3, Math.round(len / 3.6));
      let rungs = "";
      for (let i = 1; i < jumlah; i += 1) {
        const t = i / jumlah;
        const cx = x1 + dx * t;
        const cy = y1 + dy * t;
        rungs += `<line x1="${(cx + px).toFixed(2)}" y1="${(cy + py).toFixed(2)}" x2="${(cx - px).toFixed(2)}" y2="${(cy - py).toFixed(2)}" class="tv-ladder-rung" />`;
      }
      const nyala = mv && mv.jump === "ladder" && Number(mv.landed) === Number(from);
      svg += `<g class="tv-ladder ${nyala ? "is-active" : ""}">
        <line x1="${(x1 + px).toFixed(2)}" y1="${(y1 + py).toFixed(2)}" x2="${(x2 + px).toFixed(2)}" y2="${(y2 + py).toFixed(2)}" class="tv-ladder-rail" />
        <line x1="${(x1 - px).toFixed(2)}" y1="${(y1 - py).toFixed(2)}" x2="${(x2 - px).toFixed(2)}" y2="${(y2 - py).toFixed(2)}" class="tv-ladder-rail" />
        ${rungs}
      </g>`;
    });
    Object.keys(ular).forEach((from) => {
      const to = Number(ular[from]);
      const [x1, y1] = snakePoint(Number(from));
      const [x2, y2] = snakePoint(to);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const bengkok = Math.min(9, len * 0.34);
      const mx = (x1 + x2) / 2 + (-dy / len) * bengkok;
      const my = (y1 + y2) / 2 + (dx / len) * bengkok;
      const d = `M ${x1} ${y1} Q ${mx.toFixed(2)} ${my.toFixed(2)} ${x2} ${y2}`;
      const nyala = mv && mv.jump === "snake" && Number(mv.landed) === Number(from);
      svg += `<g class="tv-snake-body ${nyala ? "is-active" : ""}">
        <path d="${d}" class="tv-snake-line" />
        <path d="${d}" class="tv-snake-scale" />
        <circle cx="${x2}" cy="${y2}" r="1.5" class="tv-snake-tail" />
        <circle cx="${x1}" cy="${y1}" r="2.1" class="tv-snake-head" />
        <circle cx="${(x1 - 0.7).toFixed(2)}" cy="${(y1 - 0.6).toFixed(2)}" r="0.48" class="tv-snake-eye" />
        <circle cx="${(x1 + 0.7).toFixed(2)}" cy="${(y1 - 0.6).toFixed(2)}" r="0.48" class="tv-snake-eye" />
      </g>`;
    });

    const legenda = (room.players || []).filter((p) => !p.left).map((p) => `
      <span class="tv-legend-chip"><b class="tv-legend-dot tv-legend-${p.slot}">${esc(labels[p.slot] || p.slot + 1)}</b>${esc(p.nama)}</span>`).join("");

    const dice = st.dice ? dadu(st.dice) : `<span class="tv-dice tv-dice-kosong">?</span>`;
    return `
      <div class="tv-board-wrap tv-snake-wrap">
        <div class="tv-board tv-snake ${segar ? "is-fresh" : ""}">
          ${cells}
          <svg class="tv-snake-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>
          ${tokens}
        </div>
        <div class="tv-dice-row">
          <span class="tv-dice-slot ${ui && ui.animate && st.dice ? "is-rolling" : ""}">${dice}</span>
          ${aktif ? `<button type="button" class="tv-btn tv-btn-primary" data-tv-act="snakes-roll">Lempar Dadu</button>` : ""}
          <span class="tv-board-note">${aktif ? "Lempar dadu, jalan otomatis." : `Menunggu ${esc(namaPemain(room, st.turn))}.`}</span>
        </div>
        <div class="tv-board-legend">${legenda}</div>
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
      case "stick": return window.TVStick ? window.TVStick.papan(room, mySlot, ui) : `<p>StickEskrim belum siap.</p>`;
      case "uno": return papanUno(room, mySlot, ui);
      default: return `<p>Game belum tersedia.</p>`;
    }
  }

  window.TVBoards = {
    GAMES,
    GAME_ORDER,
    esc,
    inisial,
    tokenLabels,
    avatar,
    thumbnail,
    papan,
    dadu,
    ludoLegal,
    ludoCell,
    ludoTrack,
    snakeTrack,
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
