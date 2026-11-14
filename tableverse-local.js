/* tableverse-local.js
   Backend TableVerse versi tanpa server (langsung Firestore).
   Semua validasi gerakan, giliran, room, dan statistik dijalankan di browser
   lewat transaksi Firestore. Dipakai oleh tableverse.js sebagai pengganti API
   Vercel. Tidak ada UNO: hanya 5 game meja yang state-nya publik. */
(function () {
  "use strict";

  const INVITE_TTL = 2 * 60 * 1000;
  const ONLINE_MS = 75 * 1000;
  const MAX_INVITE_AGE = 24 * 60 * 60 * 1000;

  /* ---------------- util ---------------- */

  function err(status, message, code) {
    const e = new Error(message || "Terjadi kesalahan.");
    e.status = status || 400;
    e.code = code || "bad-request";
    return e;
  }

  function fs() {
    try {
      return typeof db !== "undefined" ? db : null;
    } catch (e) {
      return null;
    }
  }

  function requireFs() {
    const f = fs();
    if (!f) throw err(500, "Firebase/Firestore belum siap. Cek koneksi lalu muat ulang.", "server-unconfigured");
    return f;
  }

  function clean(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max || 80) : "";
  }

  function now() {
    return Date.now();
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function publik(room) {
    return room ? clone(room) : null;
  }

  function rngInt(max) {
    if (!Number.isInteger(max) || max <= 0) return 0;
    return Math.floor(Math.random() * max);
  }

  function studentMap() {
    const map = {};
    try {
      (dataSiswa || []).forEach((s) => {
        map[Number(s.absen)] = s.namaPanggilan || s.namaLengkap || `Siswa ${s.absen}`;
      });
    } catch (e) {
      /* dataSiswa belum ada */
    }
    return map;
  }

  function namaSiswa(absen) {
    return studentMap()[Number(absen)] || `Siswa ${absen}`;
  }

  function namaSaya(absen) {
    try {
      if (currentUser && Number(currentUser.absen) === Number(absen)) {
        return currentUser.namaPanggilan || currentUser.namaLengkap || namaSiswa(absen);
      }
    } catch (e) {
      /* currentUser belum ada */
    }
    return namaSiswa(absen);
  }

  function currentAbsen() {
    try {
      return currentUser && currentUser.absen ? Number(currentUser.absen) : null;
    } catch (e) {
      return null;
    }
  }

  function requireUser() {
    const absen = currentAbsen();
    if (!absen) throw err(401, "Kamu belum login ke Web Kelas.", "unauthorized");
    return absen;
  }

  function roomIdBaru() {
    const bytes = new Uint8Array(6);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function roomRef(id) {
    return requireFs().collection("tvRooms").doc(String(id || "").toUpperCase());
  }

  function playerRef(absen) {
    return requireFs().collection("tvPlayers").doc(String(absen));
  }

  function inviteRef(id) {
    return requireFs().collection("tvInvites").doc(String(id));
  }

  function inviteDocId(rid, from, to) {
    return `${rid}_${from}_${to}`;
  }

  function emptyStats() {
    return { matches: 0, wins: 0, losses: 0, draws: 0, playtime: 0, perGame: {} };
  }

  function normalStats(raw) {
    if (!raw || typeof raw !== "object") return emptyStats();
    return {
      matches: Number(raw.matches) || 0,
      wins: Number(raw.wins) || 0,
      losses: Number(raw.losses) || 0,
      draws: Number(raw.draws) || 0,
      playtime: Number(raw.playtime) || 0,
      perGame: raw.perGame && typeof raw.perGame === "object" ? raw.perGame : {},
    };
  }

  function profilePublic(player) {
    if (!player) return null;
    return {
      absen: Number(player.absen),
      nama: player.nama || "",
      username: player.username || "",
      lastSeen: Number(player.lastSeen) || 0,
      roomId: player.roomId || null,
      roomStatus: player.roomStatus || null,
      stats: player.stats ? normalStats(player.stats) : null,
    };
  }

  function playerBaru(absen) {
    const nama = namaSaya(absen);
    return {
      absen: Number(absen),
      nama,
      username: nama,
      stats: emptyStats(),
      lastSeen: 0,
      roomId: null,
      roomStatus: null,
      createdAt: now(),
    };
  }

  async function bacaPemain(tx, absen) {
    const ref = playerRef(absen);
    const snap = tx ? await tx.get(ref) : await ref.get();
    return { ref, data: snap.exists ? snap.data() : playerBaru(absen), exists: snap.exists };
  }

  function statusRoom(room) {
    if (!room) return null;
    if (room.status === "playing") return "playing";
    if (room.status === "lobby") return "waiting";
    return "finished";
  }

  function isMember(room, absen) {
    return !!room && Array.isArray(room.players) && room.players.some((p) => Number(p.absen) === Number(absen));
  }

  function slotOf(room, absen) {
    const p = room && Array.isArray(room.players)
      ? room.players.find((x) => Number(x.absen) === Number(absen))
      : null;
    return p ? Number(p.slot) : -1;
  }

  /* ---------------- engine: Tic Tac Toe ---------------- */

  const ttt = (function () {
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

    function create() {
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
      const next = clone(state);
      if (next.turn !== slot) throw err(400, "Bukan giliranmu.", "not-your-turn");
      const index = Number(payload && payload.index);
      if (!Number.isInteger(index) || index < 0 || index > 8) {
        throw err(400, "Kotak tidak valid.", "invalid-move");
      }
      if (next.board[index] !== null) throw err(400, "Kotak itu sudah terisi.", "invalid-move");

      const mark = slot === 0 ? "X" : "O";
      next.board[index] = mark;
      next.lastMove = { slot, index };

      const winner = pemenang(next.board);
      if (winner) {
        next.lastEvent = `${winner} menang!`;
        return { state: next, finished: true, winners: [slot], draw: false, event: next.lastEvent };
      }
      if (next.board.every((v) => v !== null)) {
        next.lastEvent = "Papan penuh. Pertandingan berakhir seri.";
        return { state: next, finished: true, winners: [], draw: true, event: next.lastEvent };
      }

      next.turn = slot === 0 ? 1 : 0;
      next.lastEvent = `Giliran ${next.turn === 0 ? "X" : "O"}.`;
      return { state: next, finished: false, event: next.lastEvent };
    }

    return { id: "ttt", mode: "duel", minPlayers: 2, maxPlayers: 2, judul: "Tic Tac Toe", create, move };
  })();

  /* ---------------- engine: Checkers ---------------- */

  const checkers = (function () {
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

    function create() {
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
      const next = clone(state);
      if (next.turn !== slot) throw err(400, "Bukan giliranmu.", "not-your-turn");
      if (next.pending && next.pending.slot !== slot) {
        throw err(400, "Selesaikan dulu lompatan beruntunmu.", "invalid-move");
      }

      const from = payload && payload.from;
      const to = payload && payload.to;
      if (!Array.isArray(from) || !Array.isArray(to)) {
        throw err(400, "Gerakan tidak valid.", "invalid-move");
      }

      const legal = legalMoves(next.board, slot, next.pending);
      const pilihan = legal.find((m) => samePos(m.from, from) && samePos(m.to, to));
      if (!pilihan) {
        const wajibLompat = legal.length > 0 && legal[0].capture;
        throw err(
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
        next.lastEvent = "Tangkapan beruntun! Lanjutkan lompatan dengan bidak yang sama.";
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
      return { state: next, finished: false, event: next.lastEvent };
    }

    return { id: "checkers", mode: "duel", minPlayers: 2, maxPlayers: 2, judul: "Checkers", create, move };
  })();

  /* ---------------- engine: Chess ---------------- */

  const chess = (function () {
    function create() {
      const Ctor = window.Chess;
      if (typeof Ctor !== "function") {
        throw err(500, "Mesin catur belum termuat. Muat ulang halaman.", "no-chess");
      }
      const c = new Ctor();
      return {
        state: {
          fen: c.fen(),
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
      const Ctor = window.Chess;
      if (typeof Ctor !== "function") {
        throw err(500, "Mesin catur belum termuat. Muat ulang halaman.", "no-chess");
      }
      if (slot !== state.turn) throw err(400, "Bukan giliranmu.", "not-your-turn");
      if (state.status !== "playing") throw err(400, "Pertandingan sudah selesai.", "invalid-move");

      const from = payload && typeof payload.from === "string" ? payload.from.toLowerCase() : "";
      const to = payload && typeof payload.to === "string" ? payload.to.toLowerCase() : "";
      if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
        throw err(400, "Kotak asal/tujuan tidak valid.", "invalid-move");
      }
      const promo = payload && typeof payload.promotion === "string" ? payload.promotion.toLowerCase() : "q";
      const promotion = ["q", "r", "b", "n"].includes(promo) ? promo : "q";

      const c = new Ctor(state.fen);
      const warna = c.turn();
      if ((warna === "w" && slot !== 0) || (warna === "b" && slot !== 1)) {
        throw err(400, "Bidak itu bukan milikmu.", "invalid-move");
      }

      let hasil;
      try {
        hasil = c.move({ from, to, promotion });
      } catch (e) {
        throw err(400, "Langkah catur itu tidak legal.", "invalid-move");
      }
      if (!hasil) throw err(400, "Langkah catur itu tidak legal.", "invalid-move");

      const next = {
        ...state,
        fen: c.fen(),
        lastMove: { from, to, san: hasil.san, color: warna },
        history: c.history().slice(-12),
        check: c.in_check(),
      };

      if (c.game_over()) {
        next.status = c.in_checkmate()
          ? "checkmate"
          : c.in_draw() || c.in_stalemate()
            ? "draw"
            : "finished";
        if (c.in_checkmate()) {
          next.lastEvent = `Skakmat! Pemain ${slot + 1} menang.`;
          return { state: next, finished: true, winners: [slot], draw: false, event: next.lastEvent };
        }
        next.lastEvent = "Pertandingan berakhir seri.";
        return { state: next, finished: true, winners: [], draw: true, event: next.lastEvent };
      }

      next.turn = slot === 0 ? 1 : 0;
      next.lastEvent = c.in_check()
        ? `Raja pemain ${next.turn + 1} diskak! Giliran pemain ${next.turn + 1}.`
        : `Giliran pemain ${next.turn + 1}.`;
      return { state: next, finished: false, event: next.lastEvent };
    }

    return { id: "chess", mode: "duel", minPlayers: 2, maxPlayers: 2, judul: "Chess", create, move };
  })();

  /* ---------------- engine: Ludo ---------------- */

  const ludo = (function () {
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
      const next = clone(state);
      if (next.turn !== slot) throw err(400, "Bukan giliranmu.", "not-your-turn");
      const jumlah = next.tokens.length;
      const tipe = payload && payload.type === "move" ? "move" : "roll";

      if (tipe === "roll") {
        if (next.rolled) throw err(400, "Selesaikan langkah dengan dadu ini dulu.", "invalid-move");
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

      if (!next.rolled) throw err(400, "Lempar dadu dulu.", "invalid-move");
      const token = Number(payload.token);
      if (!Number.isInteger(token) || token < 0 || token > 3) {
        throw err(400, "Bidak tidak valid.", "invalid-move");
      }
      const dice = next.dice;
      if (!legalTokens(next, slot, dice).includes(token)) {
        throw err(400, "Bidak itu tidak bisa dijalankan dengan dadu ini.", "invalid-move");
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

    return { id: "ludo", mode: "party", minPlayers: 2, maxPlayers: 4, judul: "Ludo", create, move };
  })();

  /* ---------------- engine: Snakes & Ladders ---------------- */

  const snakes = (function () {
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
      const next = clone(state);
      if (next.turn !== slot) throw err(400, "Bukan giliranmu.", "not-your-turn");
      if (payload && payload.type !== "roll") throw err(400, "Aksi tidak dikenal.", "invalid-move");

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

    return { id: "snakes", mode: "party", minPlayers: 2, maxPlayers: 4, judul: "Ular Tangga", create, move };
  })();

  const GAMES = { ttt, checkers, chess, ludo, snakes };

  /* ---------------- room ---------------- */

  function roomBaru(o) {
    return {
      id: o.id,
      gameId: o.game.id,
      gameTitle: o.game.judul,
      mode: o.game.mode,
      visibility: o.visibility === "private" ? "private" : "public",
      code: o.id,
      hostAbsen: Number(o.absen),
      players: [
        { absen: Number(o.absen), nama: o.nama, slot: 0, ready: false, joinedAt: now(), left: false },
      ],
      minPlayers: o.game.minPlayers,
      maxPlayers: o.game.maxPlayers,
      status: "lobby",
      state: null,
      seq: 0,
      turnSlot: null,
      handVersions: {},
      winnerSlots: [],
      draw: false,
      result: null,
      historyId: null,
      createdAt: now(),
      startedAt: null,
      finishedAt: null,
      lastActivity: now(),
      lastEvent: "",
    };
  }

  async function sync(absen) {
    const ref = playerRef(absen);
    const snap = await ref.get();
    const nowMs = now();
    const nama = namaSaya(absen);
    const data = snap.exists ? snap.data() : playerBaru(absen);
    const patch = {};

    if (!snap.exists) {
      Object.assign(patch, data, { createdAt: nowMs, lastSeen: nowMs });
    } else {
      if (data.nama !== nama) patch.nama = nama;
      if (data.username !== nama) patch.username = nama;
      if (nowMs - (Number(data.lastSeen) || 0) > 45000) patch.lastSeen = nowMs;
    }

    let room = null;
    if (data.roomId) {
      const rs = await roomRef(data.roomId).get();
      if (rs.exists) room = rs.data();
      else patch.roomId = null;
    }
    const stt = statusRoom(room);
    if ((data.roomStatus || null) !== stt) patch.roomStatus = stt;

    if (Object.keys(patch).length) await ref.set(patch, { merge: true });
    const profile = { ...data, ...patch };
    profile.stats = normalStats(profile.stats);
    return { ok: true, profile: profilePublic(profile), currentRoom: room ? publik(room) : null, serverNow: nowMs };
  }

  async function daftarPemain() {
    const snap = await requireFs().collection("tvPlayers").get();
    const map = {};
    snap.forEach((doc) => { map[doc.id] = doc.data(); });
    const nowMs = now();
    return (dataSiswa || []).map((s) => {
      const p = map[String(s.absen)] || {};
      const online = nowMs - (Number(p.lastSeen) || 0) < ONLINE_MS;
      const status = !online
        ? "offline"
        : p.roomStatus === "playing"
          ? "playing"
          : p.roomStatus === "waiting"
            ? "in_lobby"
            : "online";
      return {
        absen: Number(s.absen),
        nama: p.nama || s.namaPanggilan || s.namaLengkap || `Siswa ${s.absen}`,
        username: p.username || p.nama || s.namaPanggilan || s.namaLengkap || `Siswa ${s.absen}`,
        online,
        status,
        lastSeen: Number(p.lastSeen) || 0,
      };
    });
  }

  async function listRooms(body) {
    const gameId = clean(body.gameId, 32);
    if (!GAMES[gameId]) throw err(400, "Game tidak dikenal.", "invalid-argument");
    const snap = await requireFs().collection("tvRooms").where("gameId", "==", gameId).limit(60).get();
    const rooms = [];
    snap.forEach((doc) => {
      const room = doc.data();
      if (room.status !== "lobby" || room.visibility !== "public") return;
      rooms.push(publik(room));
    });
    rooms.sort((a, b) => b.createdAt - a.createdAt);
    return { ok: true, rooms, serverNow: now() };
  }

  async function createRoom(absen, body) {
    const game = GAMES[clean(body.gameId, 32)];
    if (!game) throw err(400, "Game tidak dikenal.", "invalid-argument");
    const visibility = body.visibility === "private" ? "private" : "public";

    return requireFs().runTransaction(async (tx) => {
      const p = await bacaPemain(tx, absen);
      const profile = p.data;
      if (profile.roomId) {
        const rs = await tx.get(roomRef(profile.roomId));
        if (rs.exists) {
          const existing = rs.data();
          if (existing.status === "lobby" || existing.status === "playing") {
            return { ok: true, room: publik(existing), reused: true, serverNow: now() };
          }
        }
      }
      const id = roomIdBaru();
      const nama = namaSaya(absen);
      const room = roomBaru({ id, absen, nama, game, visibility });
      tx.set(roomRef(id), room);
      tx.set(playerRef(absen), {
        absen: Number(absen),
        nama,
        username: nama,
        roomId: id,
        roomStatus: "waiting",
        lastSeen: now(),
      }, { merge: true });
      return { ok: true, room: publik(room), reused: false, serverNow: now() };
    });
  }

  async function joinRoom(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    const iid = clean(body.inviteId, 160);
    if (!rid) throw err(400, "Kode room kosong.", "invalid-argument");

    return requireFs().runTransaction(async (tx) => {
      const rRef = roomRef(rid);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) throw err(404, "Room tidak ditemukan atau sudah ditutup.", "not-found");
      const room = rSnap.data();
      const p = await bacaPemain(tx, absen);
      const profile = p.data;
      const nama = namaSaya(absen);

      if (isMember(room, absen)) {
        tx.set(playerRef(absen), {
          absen: Number(absen),
          roomId: room.id,
          roomStatus: statusRoom(room),
          lastSeen: now(),
        }, { merge: true });
        return { ok: true, room: publik(room), joined: false, serverNow: now() };
      }

      if (room.status !== "lobby") throw err(409, "Pertandingan di room ini sudah dimulai.", "room-started");
      if (room.players.length >= room.maxPlayers) throw err(409, "Room sudah penuh.", "room-full");

      let invite = null;
      if (iid) {
        const iRef = inviteRef(iid);
        const iSnap = await tx.get(iRef);
        if (!iSnap.exists) throw err(404, "Undangan tidak ditemukan.", "not-found");
        const data = iSnap.data();
        if (Number(data.toAbsen) !== Number(absen) || data.roomId !== room.id) {
          throw err(403, "Undangan ini bukan untukmu.", "forbidden");
        }
        if (data.status === "pending" && Number(data.expiresAt) < now()) {
          tx.set(iRef, { status: "expired", respondedAt: now() }, { merge: true });
          return { ok: true, expired: true, message: "Undangan sudah kedaluwarsa.", serverNow: now() };
        }
        if (data.status !== "pending" && data.status !== "accepted") {
          throw err(409, "Undangan ini sudah tidak berlaku.", "invite-inactive");
        }
        invite = { ref: iRef };
      } else if (room.visibility === "private" && clean(body.code, 64).toUpperCase() !== room.id) {
        throw err(403, "Room privat. Masukkan kode room atau lewat undangan.", "forbidden");
      }

      if (profile.roomId && profile.roomId !== room.id) {
        const otherSnap = await tx.get(roomRef(profile.roomId));
        if (otherSnap.exists) {
          const other = otherSnap.data();
          if (other.status === "lobby" || other.status === "playing") {
            throw err(409, "Kamu masih berada di room lain. Keluar dulu ya.", "already-in-room");
          }
        }
      }

      const used = new Set(room.players.map((x) => x.slot));
      let slot = 0;
      while (used.has(slot)) slot += 1;
      room.players.push({ absen: Number(absen), nama, slot, ready: false, joinedAt: now(), left: false });
      room.players.sort((a, b) => a.slot - b.slot);
      room.lastActivity = now();
      tx.set(rRef, room);
      tx.set(playerRef(absen), {
        absen: Number(absen),
        nama,
        username: nama,
        roomId: room.id,
        roomStatus: "waiting",
        lastSeen: now(),
      }, { merge: true });
      if (invite) tx.set(invite.ref, { status: "accepted", respondedAt: now() }, { merge: true });
      return { ok: true, room: publik(room), joined: true, serverNow: now() };
    });
  }

  async function leaveRoom(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    return requireFs().runTransaction(async (tx) => {
      const p = await bacaPemain(tx, absen);
      const profile = p.data;
      const targetId = rid || profile.roomId;
      if (!targetId) throw err(400, "Kamu sedang tidak di room mana pun.", "invalid-argument");
      const rRef = roomRef(targetId);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) {
        tx.set(playerRef(absen), { absen: Number(absen), roomId: null, roomStatus: null }, { merge: true });
        return { ok: true, left: true, serverNow: now() };
      }
      const room = rSnap.data();
      const idx = room.players.findIndex((x) => Number(x.absen) === Number(absen));
      if (idx < 0) {
        tx.set(playerRef(absen), { absen: Number(absen), roomId: null, roomStatus: null }, { merge: true });
        return { ok: true, left: true, serverNow: now() };
      }

      if (room.status === "playing") {
        const leaver = room.players[idx];
        room.players[idx].left = true;
        let hasil;
        if (room.players.filter((x) => !x.left).length === 1) {
          const sisa = room.players.filter((x) => !x.left)[0];
          hasil = { winners: [sisa.slot], draw: false, event: `${leaver.nama} keluar. ${sisa.nama} menang.` };
        } else {
          hasil = { winners: [], draw: true, event: `${leaver.nama} keluar. Pertandingan dihentikan.` };
        }
        const info = await catatHasil(tx, room, hasil);
        room.status = "finished";
        room.finishedAt = now();
        room.winnerSlots = hasil.winners;
        room.draw = !!hasil.draw;
        room.result = info.result;
        room.historyId = info.historyId;
        room.lastEvent = hasil.event;
        room.lastActivity = now();
        tx.set(rRef, room);
        tx.set(playerRef(absen), { absen: Number(absen), roomId: null, roomStatus: null }, { merge: true });
        room.players.forEach((x) => {
          if (Number(x.absen) !== Number(absen)) {
            tx.set(playerRef(x.absen), { absen: Number(x.absen), roomStatus: "finished" }, { merge: true });
          }
        });
        return { ok: true, room: publik(room), finished: true, serverNow: now() };
      }

      if (room.status === "lobby") {
        room.players.splice(idx, 1);
        tx.set(playerRef(absen), { absen: Number(absen), roomId: null, roomStatus: null }, { merge: true });
        if (!room.players.length) {
          tx.delete(rRef);
          return { ok: true, left: true, roomClosed: true, serverNow: now() };
        }
        if (Number(room.hostAbsen) === Number(absen)) room.hostAbsen = room.players[0].absen;
        room.players.forEach((x, i) => { x.slot = i; });
        room.lastActivity = now();
        tx.set(rRef, room);
        return { ok: true, left: true, room: publik(room), serverNow: now() };
      }

      room.players[idx].left = true;
      tx.set(rRef, room);
      tx.set(playerRef(absen), { absen: Number(absen), roomId: null, roomStatus: null }, { merge: true });
      return { ok: true, left: true, serverNow: now() };
    });
  }

  async function setReady(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    const ready = body.ready === true;
    return requireFs().runTransaction(async (tx) => {
      const rRef = roomRef(rid);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) throw err(404, "Room tidak ditemukan.", "not-found");
      const room = rSnap.data();
      if (room.status !== "lobby") throw err(409, "Pertandingan sudah dimulai.", "room-started");
      const p = room.players.find((x) => Number(x.absen) === Number(absen));
      if (!p) throw err(403, "Kamu bukan anggota room ini.", "forbidden");
      p.ready = ready;
      room.lastActivity = now();
      tx.set(rRef, room);
      return { ok: true, room: publik(room), serverNow: now() };
    });
  }

  async function setVisibility(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    const visibility = body.visibility === "private" ? "private" : "public";
    return requireFs().runTransaction(async (tx) => {
      const rRef = roomRef(rid);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) throw err(404, "Room tidak ditemukan.", "not-found");
      const room = rSnap.data();
      if (Number(room.hostAbsen) !== Number(absen)) throw err(403, "Hanya host yang bisa mengubah room.", "forbidden");
      if (room.status !== "lobby") throw err(409, "Pertandingan sudah dimulai.", "room-started");
      room.visibility = visibility;
      room.lastActivity = now();
      tx.set(rRef, room);
      return { ok: true, room: publik(room), serverNow: now() };
    });
  }

  async function kick(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    const target = Number(body.absen);
    return requireFs().runTransaction(async (tx) => {
      const rRef = roomRef(rid);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) throw err(404, "Room tidak ditemukan.", "not-found");
      const room = rSnap.data();
      if (Number(room.hostAbsen) !== Number(absen)) throw err(403, "Hanya host yang bisa mengeluarkan pemain.", "forbidden");
      if (room.status !== "lobby") throw err(409, "Pertandingan sudah dimulai.", "room-started");
      if (target === Number(absen)) throw err(400, "Host tidak bisa mengeluarkan dirinya sendiri.", "invalid-argument");
      const idx = room.players.findIndex((x) => Number(x.absen) === target);
      if (idx < 0) throw err(404, "Pemain itu tidak ada di room.", "not-found");
      room.players.splice(idx, 1);
      room.players.forEach((x, i) => { x.slot = i; });
      room.lastActivity = now();
      tx.set(rRef, room);
      tx.set(playerRef(target), { absen: target, roomId: null, roomStatus: null }, { merge: true });
      return { ok: true, room: publik(room), serverNow: now() };
    });
  }

  async function start(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    return requireFs().runTransaction(async (tx) => {
      const rRef = roomRef(rid);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) throw err(404, "Room tidak ditemukan.", "not-found");
      const room = rSnap.data();
      if (Number(room.hostAbsen) !== Number(absen)) throw err(403, "Hanya host yang bisa memulai.", "forbidden");
      if (room.status !== "lobby") throw err(409, "Pertandingan sudah dimulai.", "room-started");
      const aktif = room.players.filter((x) => !x.left);
      const game = GAMES[room.gameId];
      if (!game) throw err(400, "Game tidak dikenal.", "invalid-argument");
      if (aktif.length < game.minPlayers) {
        throw err(409, `Butuh minimal ${game.minPlayers} pemain untuk mulai.`, "not-enough-players");
      }
      if (aktif.length > game.maxPlayers) {
        throw err(409, `Maksimal ${game.maxPlayers} pemain untuk game ini.`, "too-many-players");
      }
      if (!aktif.every((x) => x.ready)) {
        throw err(409, "Semua pemain harus menekan Ready dulu.", "not-ready");
      }

      aktif.forEach((x, i) => { x.slot = i; });
      room.players = aktif;

      const created = game.create(room.players, { rngInt, players: room.players });
      room.status = "playing";
      room.state = created.state;
      room.startedAt = now();
      room.lastActivity = now();
      room.turnSlot = Number.isInteger(created.state.turn) ? created.state.turn : 0;
      room.seq = (Number(room.seq) || 0) + 1;
      room.lastEvent = created.state.lastEvent || "Pertandingan dimulai.";
      room.handVersions = {};
      room.players.forEach((x) => { room.handVersions[String(x.absen)] = 1; });

      tx.set(rRef, room);
      room.players.forEach((x) => {
        tx.set(playerRef(x.absen), { absen: Number(x.absen), roomStatus: "playing", lastSeen: now() }, { merge: true });
      });

      return { ok: true, room: publik(room), hand: null, handVersion: 0, serverNow: now() };
    });
  }

  async function stateOf(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    const rs = await roomRef(rid).get();
    if (!rs.exists) return { ok: true, room: null, serverNow: now() };
    const room = rs.data();
    if (!isMember(room, absen)) throw err(403, "Kamu bukan anggota room ini.", "forbidden");
    return { ok: true, room: publik(room), hand: null, handVersion: 0, serverNow: now() };
  }

  async function move(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    const payload = body.move && typeof body.move === "object" ? body.move : {};

    return requireFs().runTransaction(async (tx) => {
      const rRef = roomRef(rid);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) throw err(404, "Room tidak ditemukan.", "not-found");
      const room = rSnap.data();
      const slot = slotOf(room, absen);
      if (slot < 0) throw err(403, "Kamu bukan anggota room ini.", "forbidden");
      if (room.status !== "playing") throw err(409, "Pertandingan belum berjalan atau sudah selesai.", "room-not-playing");
      const game = GAMES[room.gameId];
      if (!game) throw err(400, "Game tidak dikenal.", "invalid-argument");

      const out = game.move(room.state, slot, payload, { rngInt, players: room.players });
      room.state = out.state;
      room.seq = (Number(room.seq) || 0) + 1;
      room.lastActivity = now();
      room.lastEvent = out.event || (out.state && out.state.lastEvent) || "";
      room.turnSlot = Number.isInteger(out.state.turn) ? out.state.turn : room.turnSlot;

      if (out.finished) {
        const info = await catatHasil(tx, room, out);
        room.status = "finished";
        room.finishedAt = now();
        room.winnerSlots = out.winners || [];
        room.draw = !!out.draw;
        room.result = info.result;
        room.historyId = info.historyId;
        room.players.forEach((x) => {
          tx.set(playerRef(x.absen), { absen: Number(x.absen), roomStatus: "finished" }, { merge: true });
        });
      }

      tx.set(rRef, room);
      return { ok: true, room: publik(room), hand: null, handVersion: 0, event: room.lastEvent, serverNow: now() };
    });
  }

  async function rematch(absen, body) {
    const rid = clean(body.roomId, 64).toUpperCase();
    return requireFs().runTransaction(async (tx) => {
      const rRef = roomRef(rid);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) throw err(404, "Room tidak ditemukan.", "not-found");
      const room = rSnap.data();
      if (!isMember(room, absen)) throw err(403, "Kamu bukan anggota room ini.", "forbidden");
      if (room.status !== "finished") throw err(409, "Pertandingan belum selesai.", "room-not-finished");
      if (Number(room.hostAbsen) !== Number(absen)) throw err(403, "Hanya host yang bisa mengulang pertandingan.", "forbidden");

      room.players = room.players.filter((x) => !x.left);
      if (!room.players.length) throw err(409, "Semua pemain sudah keluar.", "empty-room");
      room.players.forEach((x, i) => {
        x.slot = i;
        x.ready = false;
        x.left = false;
      });
      if (!room.players.some((x) => Number(x.absen) === Number(room.hostAbsen))) {
        room.hostAbsen = room.players[0].absen;
      }
      room.status = "lobby";
      room.state = null;
      room.startedAt = null;
      room.finishedAt = null;
      room.winnerSlots = [];
      room.draw = false;
      room.result = null;
      room.historyId = null;
      room.lastEvent = "Siap main lagi. Semua pemain harus Ready.";
      room.lastActivity = now();
      room.seq = (Number(room.seq) || 0) + 1;
      room.handVersions = {};
      room.turnSlot = null;
      tx.set(rRef, room);
      room.players.forEach((x) => {
        tx.set(playerRef(x.absen), { absen: Number(x.absen), roomStatus: "waiting" }, { merge: true });
      });
      return { ok: true, room: publik(room), serverNow: now() };
    });
  }

  async function invite(absen, body) {
    const game = GAMES[clean(body.gameId, 32)];
    if (!game) throw err(400, "Game tidak dikenal.", "invalid-argument");
    const daftarSiswa = studentMap();
    const targets = Array.from(new Set(
      (Array.isArray(body.toAbsen) ? body.toAbsen : [])
        .map((v) => Number(v))
        .filter((v) => daftarSiswa[v] && v !== Number(absen))
    ));
    if (!targets.length) throw err(400, "Pilih minimal satu pemain untuk diundang.", "invalid-argument");
    if (targets.length > game.maxPlayers - 1) {
      throw err(400, `Maksimal ${game.maxPlayers - 1} pemain bisa diundang untuk game ini.`, "invalid-argument");
    }

    return requireFs().runTransaction(async (tx) => {
      const p = await bacaPemain(tx, absen);
      const profile = p.data;
      const nama = namaSaya(absen);

      let room = null;
      if (profile.roomId) {
        const curSnap = await tx.get(roomRef(profile.roomId));
        if (curSnap.exists) {
          const cur = curSnap.data();
          if (cur.status === "playing") {
            throw err(409, "Kamu sedang bermain. Selesaikan dulu pertandingannya.", "already-playing");
          }
          if (cur.status === "lobby") {
            if (cur.gameId !== game.id) {
              throw err(409, "Kamu masih di lobby game lain. Keluar dulu ya.", "already-in-lobby");
            }
            if (Number(cur.hostAbsen) !== Number(absen)) {
              throw err(403, "Hanya host yang bisa mengundang pemain.", "forbidden");
            }
            room = cur;
          }
        }
      }

      const rid = room ? room.id : roomIdBaru();
      const targetSnaps = await Promise.all(targets.map((a) => tx.get(playerRef(a))));
      const iRefs = targets.map((a) => inviteRef(inviteDocId(rid, absen, a)));
      const iSnaps = room ? await Promise.all(iRefs.map((ref) => tx.get(ref))) : iRefs.map(() => null);
      const nowMs = now();
      const invited = [];
      const skipped = [];

      targets.forEach((target, i) => {
        const tSnap = targetSnaps[i];
        const t = tSnap.exists ? tSnap.data() : { nama: daftarSiswa[target] };
        if (room && room.players.some((x) => Number(x.absen) === target)) {
          skipped.push({ absen: target, reason: "sudah di room" });
          return;
        }
        if (t.roomStatus === "playing") {
          skipped.push({ absen: target, reason: "sedang bermain" });
          return;
        }
        if (t.roomStatus === "waiting" && t.roomId && t.roomId !== rid) {
          skipped.push({ absen: target, reason: "sedang di room lain" });
          return;
        }
        const old = iSnaps[i] && iSnaps[i].exists ? iSnaps[i].data() : null;
        if (old && old.status === "pending" && Number(old.expiresAt) > nowMs) {
          skipped.push({ absen: target, reason: "sudah diundang" });
          return;
        }
        const doc = {
          id: inviteDocId(rid, absen, target),
          roomId: rid,
          fromAbsen: Number(absen),
          fromNama: nama,
          toAbsen: Number(target),
          toNama: t.nama || daftarSiswa[target],
          gameId: game.id,
          mode: game.mode,
          status: "pending",
          createdAt: nowMs,
          expiresAt: nowMs + INVITE_TTL,
          respondedAt: null,
        };
        invited.push({ ref: iRefs[i], doc });
      });

      if (!room && !invited.length) {
        throw err(409, "Semua pemain yang dipilih sedang sibuk. Coba yang lain.", "all-busy");
      }

      if (!room) room = roomBaru({ id: rid, absen, nama, game, visibility: "private" });
      room.lastActivity = nowMs;
      tx.set(roomRef(rid), room);
      tx.set(playerRef(absen), {
        absen: Number(absen),
        nama,
        username: nama,
        roomId: rid,
        roomStatus: "waiting",
        lastSeen: nowMs,
      }, { merge: true });
      invited.forEach(({ ref, doc }) => tx.set(ref, doc));

      return {
        ok: true,
        room: publik(room),
        invited: invited.map(({ doc }) => ({ absen: doc.toAbsen, nama: doc.toNama })),
        skipped,
        serverNow: nowMs,
      };
    });
  }

  async function respondInvite(absen, body) {
    const iid = clean(body.inviteId, 160);
    const accept = body.accept === true;
    if (!iid) throw err(400, "Undangan tidak valid.", "invalid-argument");

    return requireFs().runTransaction(async (tx) => {
      const iRef = inviteRef(iid);
      const iSnap = await tx.get(iRef);
      if (!iSnap.exists) throw err(404, "Undangan tidak ditemukan.", "not-found");
      const inv = iSnap.data();
      if (Number(inv.toAbsen) !== Number(absen)) throw err(403, "Undangan ini bukan untukmu.", "forbidden");
      if (inv.status !== "pending") throw err(409, "Undangan ini sudah diproses.", "invite-inactive");
      if (Number(inv.expiresAt) < now()) {
        tx.set(iRef, { status: "expired", respondedAt: now() }, { merge: true });
        return { ok: true, expired: true, message: "Undangan sudah kedaluwarsa (maksimal 2 menit).", serverNow: now() };
      }
      if (!accept) {
        tx.set(iRef, { status: "declined", respondedAt: now() }, { merge: true });
        return { ok: true, declined: true, serverNow: now() };
      }

      const rRef = roomRef(inv.roomId);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) {
        tx.set(iRef, { status: "expired", respondedAt: now() }, { merge: true });
        return { ok: true, expired: true, message: "Room sudah ditutup.", serverNow: now() };
      }
      const room = rSnap.data();
      if (room.status !== "lobby") {
        tx.set(iRef, { status: "expired", respondedAt: now() }, { merge: true });
        return { ok: true, expired: true, message: "Pertandingan sudah dimulai.", serverNow: now() };
      }
      if (room.players.length >= room.maxPlayers) throw err(409, "Room sudah penuh.", "room-full");

      const p = await bacaPemain(tx, absen);
      const profile = p.data;
      if (!room.players.some((x) => Number(x.absen) === Number(absen))) {
        if (profile.roomId && profile.roomId !== room.id) {
          const otherSnap = await tx.get(roomRef(profile.roomId));
          if (otherSnap.exists) {
            const other = otherSnap.data();
            if (other.status === "lobby" || other.status === "playing") {
              throw err(409, "Kamu masih berada di room lain. Keluar dulu ya.", "already-in-room");
            }
          }
        }
        const used = new Set(room.players.map((x) => x.slot));
        let slot = 0;
        while (used.has(slot)) slot += 1;
        room.players.push({
          absen: Number(absen),
          nama: profile.nama || namaSaya(absen),
          slot,
          ready: false,
          joinedAt: now(),
          left: false,
        });
        room.players.sort((a, b) => a.slot - b.slot);
      }
      room.lastActivity = now();
      tx.set(rRef, room);
      tx.set(playerRef(absen), {
        absen: Number(absen),
        roomId: room.id,
        roomStatus: "waiting",
        lastSeen: now(),
      }, { merge: true });
      tx.set(iRef, { status: "accepted", respondedAt: now() }, { merge: true });
      return { ok: true, room: publik(room), joined: true, serverNow: now() };
    });
  }

  async function myInvites(absen) {
    const db = requireFs();
    const nowMs = now();
    const [inboundSnap, outboundSnap] = await Promise.all([
      db.collection("tvInvites").where("toAbsen", "==", Number(absen)).limit(40).get(),
      db.collection("tvInvites").where("fromAbsen", "==", Number(absen)).limit(40).get(),
    ]);

    const batch = db.batch();
    let tulis = 0;
    const map = (doc) => {
      const data = doc.data();
      if (data.status === "pending" && Number(data.expiresAt) < nowMs) {
        batch.set(doc.ref, { status: "expired", respondedAt: nowMs }, { merge: true });
        tulis += 1;
        data.status = "expired";
        data.respondedAt = nowMs;
      }
      return data;
    };
    const inbound = inboundSnap.docs.map(map).sort((a, b) => b.createdAt - a.createdAt);
    const outbound = outboundSnap.docs.map(map).sort((a, b) => b.createdAt - a.createdAt);
    inbound.concat(outbound).forEach((inv) => {
      if (nowMs - Number(inv.createdAt || 0) > MAX_INVITE_AGE) {
        batch.delete(inviteRef(inv.id));
        tulis += 1;
      }
    });
    if (tulis) await batch.commit();

    return {
      ok: true,
      inbound: inbound.filter((i) => nowMs - Number(i.createdAt || 0) <= MAX_INVITE_AGE),
      outbound: outbound.filter((i) => nowMs - Number(i.createdAt || 0) <= MAX_INVITE_AGE),
      serverNow: nowMs,
    };
  }

  async function riwayat(absen) {
    const snap = await requireFs()
      .collection("tvHistory")
      .where("playerAbsens", "array-contains", Number(absen))
      .limit(40)
      .get();
    const list = snap.docs.map((doc) => doc.data()).sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 30);
    return { ok: true, history: list, serverNow: now() };
  }

  async function profile(absen) {
    const p = await bacaPemain(null, absen);
    if (!p.exists) {
      await p.ref.set({ ...playerBaru(absen), lastSeen: now() }, { merge: true });
      return { ok: true, player: profilePublic({ ...playerBaru(absen), lastSeen: now() }), serverNow: now() };
    }
    return { ok: true, player: profilePublic({ ...p.data, stats: normalStats(p.data.stats) }), serverNow: now() };
  }

  /* ---------------- hasil & statistik ---------------- */

  async function catatHasil(tx, room, hasil) {
    const players = room.players;
    const winnerSlots = new Set(hasil.winners || []);
    const draw = !!hasil.draw;
    const refs = players.map((p) => playerRef(p.absen));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const duration = Math.max(0, now() - (Number(room.startedAt) || now()));

    snaps.forEach((snap, i) => {
      const data = snap.exists ? snap.data() : playerBaru(players[i].absen);
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
      tx.set(refs[i], {
        absen: Number(players[i].absen),
        nama: players[i].nama,
        username: data.username || players[i].nama,
        stats,
        lastMatchAt: now(),
      }, { merge: true });
    });

    const historyRef = requireFs().collection("tvHistory").doc();
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
      finishedAt: now(),
    });

    return {
      historyId: historyRef.id,
      result: {
        winners: winners.map((p) => ({ absen: Number(p.absen), nama: p.nama })),
        draw,
        durationMs: duration,
      },
    };
  }

  /* ---------------- dispatcher ---------------- */

  async function call(action, body) {
    const data = body && typeof body === "object" ? body : {};
    if (action === "ping") {
      return {
        ok: true,
        games: Object.keys(GAMES).map((id) => {
          const g = GAMES[id];
          return { id: g.id, judul: g.judul, mode: g.mode, minPlayers: g.minPlayers, maxPlayers: g.maxPlayers };
        }),
        inviteTtl: INVITE_TTL,
        serverNow: now(),
      };
    }
    if (action === "login") {
      const absen = Number(data.absen) || currentAbsen();
      if (!absen) throw err(400, "Akun tidak ditemukan.", "invalid-argument");
      const p = await bacaPemain(null, absen);
      const nama = namaSaya(absen);
      await p.ref.set({ absen, nama, username: nama, lastSeen: now() }, { merge: true });
      return { ok: true, token: "local", player: profilePublic({ ...p.data, absen, nama, lastSeen: now() }), serverNow: now() };
    }

    const absen = requireUser();
    switch (action) {
      case "sync": return sync(absen);
      case "players": return { ok: true, players: await daftarPemain(), serverNow: now() };
      case "listRooms": return listRooms(data);
      case "createRoom": return createRoom(absen, data);
      case "joinRoom": return joinRoom(absen, data);
      case "leaveRoom": return leaveRoom(absen, data);
      case "ready": return setReady(absen, data);
      case "visibility": return setVisibility(absen, data);
      case "kick": return kick(absen, data);
      case "start": return start(absen, data);
      case "state": return stateOf(absen, data);
      case "move": return move(absen, data);
      case "rematch": return rematch(absen, data);
      case "invite": return invite(absen, data);
      case "respondInvite": return respondInvite(absen, data);
      case "myInvites": return myInvites(absen);
      case "history": return riwayat(absen);
      case "profile": return profile(absen);
      case "logout": return { ok: true, serverNow: now() };
      default: throw err(400, "Aksi TableVerse tidak dikenal.", "invalid-argument");
    }
  }

  window.TableVerseLocal = {
    call,
    GAMES,
    INVITE_TTL,
    roomIdBaru,
  };
})();
