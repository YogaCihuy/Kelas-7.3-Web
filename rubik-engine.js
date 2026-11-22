/* ===================================================
   RUBIK ENGINE — model kubus 3x3 tanpa server
   - cubie model (posisi + sticker per arah)
   - putar lapisan lewat sumbu/layer atau notasi U D L R F B
   - acak, cek solved, parser rumus (R U R' U' dst.)
   Dipakai rubik.js di browser dan tes Node.
=================================================== */
(function (root) {
  "use strict";

  const FACES = ["U", "D", "L", "R", "F", "B"];
  const FACE_LETTER = { U: "U", D: "D", L: "L", R: "R", F: "F", B: "B" };
  const FACE_COLORS = {
    U: "#f5f6f1",
    D: "#ffd43b",
    F: "#23b26d",
    B: "#2f7de1",
    R: "#e5474c",
    L: "#ff922b",
  };

  // axis + arah normal luar (sama seperti versi Python 3x3)
  const FACE_INFO = {
    R: [0, 1], L: [0, -1],
    U: [1, 1], D: [1, -1],
    F: [2, 1], B: [2, -1],
  };

  const NORMAL_TO_FACE = {
    "1,0,0": "R", "-1,0,0": "L",
    "0,1,0": "U", "0,-1,0": "D",
    "0,0,1": "F", "0,0,-1": "B",
  };

  // cross(u, v) = normal keluar, supaya arah geser di layar konsisten
  const FACE_BASIS = {
    "1,0,0": [[0, 0, -1], [0, 1, 0]],
    "-1,0,0": [[0, 0, 1], [0, 1, 0]],
    "0,1,0": [[1, 0, 0], [0, 0, -1]],
    "0,-1,0": [[1, 0, 0], [0, 0, 1]],
    "0,0,1": [[1, 0, 0], [0, 1, 0]],
    "0,0,-1": [[-1, 0, 0], [0, 1, 0]],
  };

  function nkey(v) {
    return v[0] + "," + v[1] + "," + v[2];
  }

  function rotateQuarter(v, axis, dir) {
    const x = v[0], y = v[1], z = v[2];
    if (axis === 0) return dir === 1 ? [x, -z, y] : [x, z, -y];
    if (axis === 1) return dir === 1 ? [z, y, -x] : [-z, y, x];
    return dir === 1 ? [-y, x, z] : [y, -x, z];
  }

  function rotateFloat(v, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const x = v[0], y = v[1], z = v[2];
    if (axis === 0) return [x, y * c - z * s, y * s + z * c];
    if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
    return [x * c - y * s, x * s + y * c, z];
  }

  function Cube() {
    this.reset();
  }

  Cube.prototype.reset = function () {
    const cubies = [];
    for (let x = 0; x < 3; x += 1) {
      for (let y = 0; y < 3; y += 1) {
        for (let z = 0; z < 3; z += 1) {
          const stickers = {};
          if (x === 2) stickers["1,0,0"] = "R";
          if (x === 0) stickers["-1,0,0"] = "L";
          if (y === 2) stickers["0,1,0"] = "U";
          if (y === 0) stickers["0,-1,0"] = "D";
          if (z === 2) stickers["0,0,1"] = "F";
          if (z === 0) stickers["0,0,-1"] = "B";
          if (Object.keys(stickers).length) cubies.push({ pos: [x, y, z], stickers });
        }
      }
    }
    this.cubies = cubies;
    return this;
  };

  Cube.prototype.clone = function () {
    const c = new Cube();
    c.cubies = this.cubies.map((k) => ({
      pos: k.pos.slice(),
      stickers: Object.assign({}, k.stickers),
    }));
    return c;
  };

  Cube.prototype.turnAxis = function (axis, layer, dir, quarters) {
    const q = quarters == null ? 1 : Math.max(1, Math.abs(quarters));
    for (let step = 0; step < q; step += 1) {
      for (const cubie of this.cubies) {
        if (cubie.pos[axis] !== layer) continue;
        const centered = [
          2 * cubie.pos[0] - 2,
          2 * cubie.pos[1] - 2,
          2 * cubie.pos[2] - 2,
        ];
        const rot = rotateQuarter(centered, axis, dir);
        cubie.pos = [(rot[0] + 2) / 2, (rot[1] + 2) / 2, (rot[2] + 2) / 2];
        const next = {};
        for (const k of Object.keys(cubie.stickers)) {
          const normal = k.split(",").map(Number);
          next[nkey(rotateQuarter(normal, axis, dir))] = cubie.stickers[k];
        }
        cubie.stickers = next;
      }
    }
    return this;
  };

  Cube.prototype.turn = function (face, turns) {
    const info = FACE_INFO[face];
    if (!info) throw new Error("Gerakan tidak dikenal: " + face);
    const t = turns == null ? 1 : Number(turns);
    if (!t) return this;
    const axis = info[0];
    const sign = info[1];
    const layer = sign > 0 ? 2 : 0;
    const dir = t > 0 ? -sign : sign;
    return this.turnAxis(axis, layer, dir, Math.abs(t));
  };

  Cube.prototype.isSolved = function () {
    const colors = { U: new Set(), D: new Set(), L: new Set(), R: new Set(), F: new Set(), B: new Set() };
    const counts = { U: 0, D: 0, L: 0, R: 0, F: 0, B: 0 };
    for (const cubie of this.cubies) {
      for (const k of Object.keys(cubie.stickers)) {
        const face = NORMAL_TO_FACE[k];
        if (!face) return false;
        colors[face].add(cubie.stickers[k]);
        counts[face] += 1;
      }
    }
    return FACES.every((f) => colors[f].size === 1 && counts[f] === 9);
  };

  Cube.prototype.serialize = function () {
    return this.cubies
      .slice()
      .sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2])
      .map((c) => c.pos.join("") + ":" + Object.keys(c.stickers).sort()
        .map((k) => k + "=" + c.stickers[k]).join(";"))
      .join("|");
  };

  Cube.prototype.equals = function (other) {
    if (!other) return false;
    return this.serialize() === other.serialize();
  };

  function normalizeAlg(text) {
    return String(text == null ? "" : text)
      .replace(/[’‘`]/g, "'")
      .replace(/[()[\],]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseAlg(text) {
    const tokens = [];
    normalizeAlg(text).split(" ").forEach((raw) => {
      if (!raw) return;
      const m = /^([UDLRFB])(2|')?$/.exec(raw.toUpperCase());
      if (!m) return;
      tokens.push({ face: m[1], turns: m[2] === "2" ? 2 : m[2] === "'" ? -1 : 1 });
    });
    return tokens;
  }

  function formatMove(move) {
    const suffix = move.turns === -1 ? "'" : move.turns === 2 ? "2" : "";
    return move.face + suffix;
  }

  function formatAlg(tokens) {
    return (tokens || []).map(formatMove).join(" ");
  }

  function invertAlg(tokens) {
    return (tokens || []).slice().reverse().map((m) => ({
      face: m.face,
      turns: m.turns === 2 ? 2 : -m.turns,
    }));
  }

  function applyAlg(cube, text) {
    const tokens = Array.isArray(text) ? text : parseAlg(text);
    for (const m of tokens) cube.turn(m.face, m.turns);
    return cube;
  }

  function randomScramble(count) {
    const total = Math.max(8, Number(count) || 21);
    const tokens = [];
    let prev = "";
    for (let i = 0; i < total; i += 1) {
      const pilihan = FACES.filter((f) => f !== prev);
      const face = pilihan[Math.floor(Math.random() * pilihan.length)];
      const turns = [1, -1, 2][Math.floor(Math.random() * 3)];
      prev = face;
      tokens.push({ face, turns });
    }
    return tokens;
  }

  function moveFromFace(face, turns) {
    const info = FACE_INFO[face];
    if (!info) throw new Error("Gerakan tidak dikenal: " + face);
    const t = turns == null ? 1 : Number(turns);
    const sign = info[1];
    return {
      axis: info[0],
      layer: sign > 0 ? 2 : 0,
      dir: t > 0 ? -sign : sign,
      quarters: Math.abs(t) || 1,
    };
  }

  function inverseMove(move) {
    return {
      axis: move.axis,
      layer: move.layer,
      dir: -move.dir,
      quarters: move.quarters,
    };
  }

  const api = {
    FACES,
    FACE_LETTER,
    FACE_COLORS,
    FACE_INFO,
    FACE_BASIS,
    NORMAL_TO_FACE,
    Cube,
    nkey,
    rotateQuarter,
    rotateFloat,
    parseAlg,
    formatMove,
    formatAlg,
    invertAlg,
    applyAlg,
    randomScramble,
    moveFromFace,
    inverseMove,
  };

  root.RubikEngine = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
