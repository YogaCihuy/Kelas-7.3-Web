/* ===================================================
   STREAK 3D — model pohon & hewan (CSS 3D, tanpa library)
   Dipakai oleh renderStreakPohon() dan renderStreakHewan().
   Semua bagian disusun dari anchor .s3d-p3 supaya bisa
   diputar (yaw/pitch) tanpa merusak posisi bagian lain.
=================================================== */
(function () {
  "use strict";

  const DEG = Math.PI / 180;

  const DAUN_A = { hi: "#a6eec4", mid: "#46b477", lo: "#1e6c47" };
  const DAUN_B = { hi: "#8ee0a8", mid: "#35a065", lo: "#175f40" };
  const DAUN_C = { hi: "#c2f3d5", mid: "#5ec38a", lo: "#25794f" };
  const BATANG = { hi: "#d2aa7a", mid: "#9a6a43", lo: "#6a4428" };
  const BATANG_TUA = { hi: "#b98f61", mid: "#845631", lo: "#58351d" };

  const PET = {
    kucing: {
      pal: { hi: "#ffe8c4", mid: "#f4bb74", lo: "#c98a4a" },
      belly: "#fff5e6", cream: "#fff1dc", dark: "#3a2b20",
      pink: "#f4a3a0", earHi: "#e7a75f", earLo: "#c07f3f", type: "cat",
    },
    anjing: {
      pal: { hi: "#f3dcc0", mid: "#c9925f", lo: "#8f5f38" },
      belly: "#fbeedd", cream: "#fbeedb", dark: "#3a2b20",
      pink: "#eda49c", earHi: "#8a5832", earLo: "#6b4224", type: "dog",
    },
    panda: {
      pal: { hi: "#ffffff", mid: "#f2f5f3", lo: "#d2dad5" },
      belly: "#ffffff", cream: "#ffffff", dark: "#2c3430",
      pink: "#f0b4b0", earHi: "#3a433e", earLo: "#232b27", type: "panda",
    },
  };

  const memory = { pohon: { yaw: -16, pitch: 9 }, hewan: { yaw: -12, pitch: 8 } };
  const DEFAULT_VIEW = { yaw: -16, pitch: 9 };

  /* ---------- helper ---------- */
  function px(v) {
    return Math.round(v * 100) / 100 + "px";
  }

  function shade(hex, k) {
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
  }

  function p3(x, y, z, inner, cls, extra) {
    return (
      '<div class="s3d-p3 ' + (cls || "") + '" style="--x:' + px(x) + ";--y:" + px(y) + ";--z:" + px(z) + ";" +
      (extra || "") + '">' + inner + "</div>"
    );
  }

  // decal = bidang datar yang menempel di permukaan model (muka, mata, aksesoris)
  function decal(x, y, z, w, h, cls, inner, extra) {
    return (
      '<span class="s3d-decal ' + (cls || "") + '" style="--x:' + px(x) + ";--y:" + px(y) + ";--z:" + px(z) +
      ";--w:" + px(w) + ";--h:" + px(h) + ";" + (extra || "") + '">' + (inner || "") + "</span>"
    );
  }

  // bola: 3 cakram bersilang. Siluetnya tetap bulat dari sudut mana pun.
  function sphere(x, y, z, size, pal, opt) {
    opt = opt || {};
    const discs = opt.discs || 3;
    const sx = opt.sx || 1;
    const sy = opt.sy || 1;
    let inner = "";
    for (let i = 0; i < discs; i++) {
      const a = (180 / discs) * i;
      inner +=
        '<span class="s3d-disc" style="--size:' + px(size) + ";--a:" + a + "deg;--sx:" + sx + ";--sy:" + sy +
        ";--hi:" + pal.hi + ";--mid:" + pal.mid + ";--lo:" + pal.lo + '"></span>';
    }
    return p3(x, y, z, inner, opt.cls, (opt.extra || "") + ";--sz:" + (opt.sz || 1));
  }

  function groundDisc(size) {
    return p3(0, 0, 0, '<span class="s3d-disc s3d-ground" style="--size:' + px(size) + ';--rx:90deg"></span>');
  }

  function shadowDisc(w, h, o) {
    return p3(0, -0.6, 0,
      '<span class="s3d-decal s3d-shadow" style="--w:' + px(w) + ";--h:" + px(h) + ";--rx:90deg;--o:" + (o || 0.34) + '"></span>');
  }

  function cylinder(x, y, z, r, h, seg, pal, cls, extra) {
    let panels = "";
    const width = 2 * r * Math.tan(Math.PI / seg) + 1.6;
    for (let i = 0; i < seg; i++) {
      const a = (360 / seg) * i;
      const light = Math.cos((a - 38) * DEG);
      const k = 0.64 + 0.44 * Math.max(0, light);
      panels +=
        '<span class="s3d-panel" style="--a:' + a + "deg;--r:" + px(r) + ";--w:" + px(width) + ";--h:" + px(h) +
        ";--pc:" + shade(pal.mid, k) + ";--phi:" + pal.hi + ";--plo:" + pal.lo + '"></span>';
    }
    return p3(x, y, z, panels, "s3d-cyl " + (cls || ""), extra);
  }

  /* ---------- POHON ---------- */
  function pohon(o) {
    o = o || {};
    const tahap = Math.max(0, Math.min(5, Number(o.tahap) || 0));
    const s = [0.28, 0.52, 0.72, 0.86, 1, 1.06][tahap];

    const clumps = [
      [0, -32, 0, 86, 0],
      [-37, -14, 6, 68, 1],
      [37, -14, 6, 68, 2],
      [-18, 9, 30, 54, 1],
      [20, 8, 28, 54, 2],
      [0, 0, -36, 60, 1],
      [-24, -48, 4, 50, 2],
      [24, -48, 2, 48, 1],
      [0, -58, -8, 46, 1],
      [-8, 16, 40, 30, 2],
      [15, 14, 38, 28, 1],
    ];
    let crown = "";
    for (let i = 0; i < clumps.length; i++) {
      const c = clumps[i];
      const pal = c[4] === 1 ? DAUN_B : c[4] === 2 ? DAUN_C : DAUN_A;
      crown += sphere(c[0], c[1], c[2], c[3], pal);
    }

    const bunga =
      tahap >= 5
        ? [
            [-54, -26, 30, -12],
            [53, -30, 26, 10],
            [2, -60, 30, 0],
            [-30, 14, 40, -18],
            [33, 13, 36, 16],
          ]
            .map((b) => decal(b[0], b[1], b[2], 17, 17, "s3d-bunga", "🌼", "--rz:" + b[3] + "deg"))
            .join("")
        : "";

    const tunas =
      '<span class="s3d-leaf s3d-leaf-1"></span><span class="s3d-leaf s3d-leaf-2"></span>';

    return (
      '<div class="s3d s3d-pohon" data-s3d="pohon" data-tahap="' + tahap + '">' +
      '<div class="s3d-viewport" data-s3d-key="pohon" tabindex="0" role="img" ' +
      'aria-label="Pohon streak 3D. Geser ke kiri atau kanan untuk memutar, panah atas dan bawah untuk mengubah sudut.">' +
      '<div class="s3d-sway"><div class="s3d-world">' +
      groundDisc(206) +
      shadowDisc(74, 46, 0.3) +
      cylinder(0, -9, 0, 27, 16, 10, BATANG_TUA, "s3d-root") +
      cylinder(0, -54, 0, 20, 74, 14, BATANG, "s3d-trunk") +
      p3(0, -90, 0, '<span class="s3d-disc s3d-wood-top" style="--size:37px;--rx:90deg"></span>') +
      decal(-9, -58, 20.6, 8, 9, "s3d-tree-eye", '<span class="s3d-ink"></span>') +
      decal(9, -58, 20.6, 8, 9, "s3d-tree-eye", '<span class="s3d-ink"></span>') +
      decal(0, -47, 20.6, 18, 10, "s3d-tree-mouth") +
      decal(-16, -50, 20.4, 11, 7, "s3d-tree-blush") +
      decal(16, -50, 20.4, 11, 7, "s3d-tree-blush") +
      p3(0, -90, 0, tunas, "s3d-tunas") +
      p3(0, -94 - 36 * s, 0, crown + bunga, "s3d-crown", "--s:" + s) +
      "</div></div>" +
      '<div class="s3d-fx s3d-fx-siram" aria-hidden="true"><span>💧</span><span>💧</span><span>💧</span><span>💧</span></div>' +
      '<div class="s3d-bar"><span class="s3d-tip">🖐️ Geser buat putar</span>' +
      '<button class="s3d-reset" type="button" data-s3d-reset="pohon" aria-label="Reset putaran pohon">⟳</button></div>' +
      "</div></div>"
    );
  }

  /* ---------- HEWAN ---------- */
  function earsFor(p) {
    if (p.type === "panda") {
      return (
        sphere(-32, -36, 0, 40, { hi: "#46504a", mid: "#2c3430", lo: "#1b221e" }) +
        sphere(32, -36, 0, 40, { hi: "#46504a", mid: "#2c3430", lo: "#1b221e" })
      );
    }
    if (p.type === "dog") {
      return (
        decal(-33, -20, 6, 27, 58, "s3d-ear-dog", '<span class="s3d-ear-inner s3d-ear-inner-dog"></span>',
          "--rz:-16deg;--ry:-10deg;--eh:" + p.earHi + ";--el:" + p.earLo) +
        decal(33, -20, 6, 27, 58, "s3d-ear-dog", '<span class="s3d-ear-inner s3d-ear-inner-dog"></span>',
          "--rz:16deg;--ry:10deg;--eh:" + p.earHi + ";--el:" + p.earLo)
      );
    }
    return (
      decal(-30, -36, 4, 40, 42, "s3d-ear-cat", '<span class="s3d-ear-inner"></span>',
        "--rz:-13deg;--eh:" + p.earHi + ";--el:" + p.earLo) +
      decal(30, -36, 4, 40, 42, "s3d-ear-cat", '<span class="s3d-ear-inner"></span>',
        "--rz:13deg;--eh:" + p.earHi + ";--el:" + p.earLo)
    );
  }

  function stripesFor(p) {
    if (p.type !== "cat") return "";
    return (
      decal(0, -34, 42, 20, 7, "s3d-stripe") +
      decal(-14, -39, 36, 15, 6, "s3d-stripe", "", "--rz:-24deg") +
      decal(14, -39, 36, 15, 6, "s3d-stripe", "", "--rz:24deg")
    );
  }

  function tailFor(p) {
    if (p.type === "panda") {
      return p3(0, -30, -42, sphere(0, 0, 0, 20, { hi: "#ffffff", mid: "#eef2ef", lo: "#cdd6d0" }), "s3d-tail-ball");
    }
    const cls = p.type === "dog" ? "s3d-tail-dog" : "s3d-tail-cat";
    return p3(
      0, -30, -42,
      '<div class="s3d-tail-wag"><span class="s3d-tail ' + cls + '" style="--tail-hi:' + p.pal.hi +
        ";--tail-mid:" + p.pal.mid + ";--tail-lo:" + p.pal.lo + '"></span></div>',
      "s3d-tail-base"
    );
  }

  function aksesoris(id, p) {
    if (id === "kacamata") {
      const lens = (x, ry) =>
        decal(x, -6, 54, 31, 23, "s3d-lens", "", "--ry:" + ry + "deg");
      return (
        lens(-19, 8) + lens(19, -8) +
        decal(0, -6, 55, 10, 3.5, "s3d-glass-bridge") +
        decal(-35, -6, 47, 22, 4, "s3d-glass-arm", "", "--ry:64deg") +
        decal(35, -6, 47, 22, 4, "s3d-glass-arm", "", "--ry:-64deg")
      );
    }
    if (id === "topi") {
      return (
        p3(0, -50, 6,
          '<span class="s3d-cap-crown"></span><span class="s3d-cap-seam"></span><span class="s3d-cap-button"></span>',
          "s3d-cap") +
        p3(0, -36, 16, '<span class="s3d-cap-brim"></span>', "s3d-cap-brim-anchor")
      );
    }
    if (id === "mahkota") {
      return p3(0, -54, 8,
        '<span class="s3d-mahkota"></span><span class="s3d-mahkota-gem"></span>', "s3d-mahkota-anchor");
    }
    return "";
  }

  function hewan(o) {
    o = o || {};
    const p = PET[o.jenis] || PET.kucing;
    const darkPaw = p.type === "panda";

    const pawPal = darkPaw ? { hi: "#46504a", mid: "#2c3430", lo: "#1b221e" } : p.pal;

    const muzzle =
      sphere(0, 8, 43, 48, { hi: p.cream, mid: p.cream, lo: shade(p.cream, 0.86) }, { sy: 0.71, sz: 0.42 }) +
      decal(0, 9, 53, 30, 22, "s3d-muzzle-soft", "", "--mc:" + p.belly) +
      decal(0, 2, 53.5, 11, 9, "s3d-nose") +
      decal(-5.5, 12, 53, 11, 8, "s3d-mouth") +
      decal(5.5, 12, 53, 11, 8, "s3d-mouth") +
      decal(-33, 0, 46, 15, 9, "s3d-cheek") +
      decal(33, 0, 46, 15, 9, "s3d-cheek");

    const patch =
      p.type === "panda"
        ? decal(-19, -6, 52, 33, 37, "s3d-patch", "", "--rz:-10deg") +
          decal(19, -6, 52, 33, 37, "s3d-patch", "", "--rz:10deg")
        : "";

    const head =
      p3(0, -112, 12,
        '<div class="s3d-head-bob">' +
          sphere(0, 0, 0, 102, p.pal, { sy: 0.94 }) +
          earsFor(p) +
          stripesFor(p) +
          patch +
          muzzle +
          (p.type === "panda"
            ? decal(-19, -6, 52.6, 17, 18, "s3d-eye-white") +
              decal(19, -6, 52.6, 17, 18, "s3d-eye-white")
            : "") +
          decal(-19, -6, 53, 13, 15, "s3d-eye", '<span class="s3d-eye-ink"><i></i></span>') +
          decal(19, -6, 53, 13, 15, "s3d-eye", '<span class="s3d-eye-ink"><i></i></span>') +
          (o.baju ? aksesoris(o.baju, p) : "") +
        "</div>",
        "s3d-head-group");

    const body =
      p3(0, -48, 0,
        '<div class="s3d-body-bob">' +
          sphere(0, 0, 0, 100, p.pal, { sy: 0.86 }) +
          sphere(0, 8, 33, 52, { hi: p.belly, mid: p.belly, lo: shade(p.belly, 0.9) }, { sy: 0.88, sz: 0.5 }) +
          (p.type === "panda"
            ? sphere(-46, 0, 4, 34, { hi: "#46504a", mid: "#2c3430", lo: "#1b221e" }) +
              sphere(46, 0, 4, 34, { hi: "#46504a", mid: "#2c3430", lo: "#1b221e" })
            : "") +
          (o.baju === "jaket" ? jaket() : "") +
          (o.baju === "bandana" ? bandana() : "") +
        "</div>",
        "s3d-body-group");

    const paws =
      sphere(-23, -14, 34, 33, pawPal, { sy: 0.92 }) +
      sphere(23, -14, 34, 33, pawPal, { sy: 0.92 }) +
      sphere(-33, -12, -24, 31, pawPal, { sy: 0.9 }) +
      sphere(33, -12, -24, 31, pawPal, { sy: 0.9 });

    const toy = o.mainan ? mainan(o.mainan) : "";

    return (
      '<div class="s3d s3d-hewan" data-s3d="hewan" data-jenis="' + (o.jenis || "kucing") + '">' +
      '<div class="s3d-viewport" data-s3d-key="hewan" tabindex="0" role="img" ' +
      'aria-label="Hewan peliharaan 3D. Geser ke kiri atau kanan untuk memutar, panah atas dan bawah untuk mengubah sudut.">' +
      '<div class="s3d-sway"><div class="s3d-world">' +
      groundDisc(178) +
      shadowDisc(104, 52, 0.3) +
      '<div class="s3d-p3 s3d-pet-rig">' +
      '<div class="s3d-p3 s3d-pet-play"><div class="s3d-p3 s3d-pet-breathe">' +
      body + head + paws + tailFor(p) +
      "</div></div></div>" +
      toy +
      (o.mainan
        ? '<span class="s3d-decal s3d-toy-spark s3d-toy-spark-1">✨</span>' +
          '<span class="s3d-decal s3d-toy-spark s3d-toy-spark-2">✨</span>'
        : "") +
      "</div></div>" +
      '<div class="s3d-fx s3d-fx-makan" aria-hidden="true"><span class="s3d-bowl">🥣</span></div>' +
      '<div class="s3d-fx s3d-fx-minum" aria-hidden="true"><span>💧</span><span>💧</span><span>💧</span></div>' +
      '<div class="s3d-bar"><span class="s3d-tip">🖐️ Geser buat putar</span>' +
      '<button class="s3d-reset" type="button" data-s3d-reset="hewan" aria-label="Reset putaran hewan">⟳</button></div>' +
      "</div></div>"
    );
  }

  function jaket() {
    let panels = "";
    const r = 52.5;
    const seg = 12;
    const width = 2 * r * Math.tan(Math.PI / seg) + 1.6;
    for (let i = 0; i < seg; i++) {
      const a = (360 / seg) * i;
      const light = Math.cos((a - 38) * DEG);
      const k = 0.66 + 0.4 * Math.max(0, light);
      const base = a === 0 ? "#2a6c4d" : "#2f7f5a";
      panels +=
        '<span class="s3d-panel s3d-jacket-panel" style="--a:' + a + "deg;--r:" + r + "px;--w:" + px(width) +
        ";--h:44px;--pc:" + shade(base, k) + '"></span>';
    }
    return (
      p3(0, 0, 0, panels, "s3d-jacket") +
      p3(-15, -24, 50, '<span class="s3d-jacket-collar s3d-collar-l"></span>', "s3d-collar-anchor", "--rz:24deg") +
      p3(15, -24, 50, '<span class="s3d-jacket-collar s3d-collar-r"></span>', "s3d-collar-anchor", "--rz:-24deg") +
      decal(0, 2, 54, 4, 38, "s3d-zipper")
    );
  }

  function bandana() {
    return (
      cylinder(0, -22, 0, 44, 12, 10, { hi: "#f690ae", mid: "#e2678f", lo: "#b34769" }, "s3d-bandana") +
      p3(0, -18, 43, '<span class="s3d-bandana-knot"></span><span class="s3d-bandana-tail s3d-bandana-tail-1"></span><span class="s3d-bandana-tail s3d-bandana-tail-2"></span>', "s3d-knot-anchor")
    );
  }

  function mainan(id) {
    let inner = "";
    if (id === "bola") {
      inner = '<span class="s3d-ball"></span>';
    } else if (id === "tulang") {
      inner =
        '<span class="s3d-bone"></span>' +
        '<span class="s3d-bone-knob s3d-bone-knob-1"></span>' +
        '<span class="s3d-bone-knob s3d-bone-knob-2"></span>' +
        '<span class="s3d-bone-knob s3d-bone-knob-3"></span>' +
        '<span class="s3d-bone-knob s3d-bone-knob-4"></span>';
    } else if (id === "boneka") {
      inner =
        '<span class="s3d-bear-body"></span><span class="s3d-bear-head"></span>' +
        '<span class="s3d-bear-ear s3d-bear-ear-l"></span><span class="s3d-bear-ear s3d-bear-ear-r"></span>' +
        '<span class="s3d-bear-face"></span>';
    } else if (id === "robot") {
      inner =
        '<span class="s3d-robot"><i class="s3d-robot-eye s3d-robot-eye-l"></i><i class="s3d-robot-eye s3d-robot-eye-r"></i><i class="s3d-robot-mouth"></i><i class="s3d-robot-antenna"></i></span>';
    }

    return p3(78, 0, 34,
      '<div class="s3d-toy-bounce"><div class="s3d-toy ' + (id ? "s3d-toy-" + id : "") + '">' + inner + "</div></div>",
      "s3d-toy-rig");
  }

  /* ---------- KONTROL PUTAR ---------- */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function applyView(vp, view) {
    vp.style.setProperty("--s3d-yaw", view.yaw.toFixed(2) + "deg");
    vp.style.setProperty("--s3d-pitch", view.pitch.toFixed(2) + "deg");
  }

  function bindViewport(vp) {
    if (vp.dataset.s3dBound) return;
    vp.dataset.s3dBound = "1";
    const key = vp.dataset.s3dKey || "pohon";
    const view = memory[key] || (memory[key] = { yaw: DEFAULT_VIEW.yaw, pitch: DEFAULT_VIEW.pitch });

    let dragging = false;
    let pointerId = null;
    let lastX = 0;
    let lastY = 0;
    let lastT = 0;
    let vx = 0;
    let vy = 0;
    let raf = 0;

    applyView(vp, view);

    function glide() {
      raf = 0;
      view.yaw = clamp(view.yaw + vx, -58, 58);
      view.pitch = clamp(view.pitch + vy, -2, 26);
      vx *= 0.92;
      vy *= 0.88;
      applyView(vp, view);
      if (Math.abs(vx) > 0.06 || Math.abs(vy) > 0.06) raf = requestAnimationFrame(glide);
    }

    function onDown(e) {
      if (e.target.closest("[data-s3d-reset]")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      pointerId = e.pointerId;
      vp.classList.add("is-dragging");
      try { vp.setPointerCapture(pointerId); } catch (err) {}
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = performance.now();
      vx = 0;
      vy = 0;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      try { vp.focus({ preventScroll: true }); } catch (err) { vp.focus(); }
    }

    function onMove(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const now = performance.now();
      const dt = Math.max(10, now - lastT);
      lastT = now;
      view.yaw = clamp(view.yaw - dx * 0.42, -58, 58);
      view.pitch = clamp(view.pitch + dy * 0.22, -2, 26);
      vx = clamp((-dx * 0.42 * 16) / dt, -13, 13);
      vy = clamp((dy * 0.22 * 16) / dt, -7, 7);
      applyView(vp, view);
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      vp.classList.remove("is-dragging");
      try { vp.releasePointerCapture(pointerId); } catch (err) {}
      if (!raf) raf = requestAnimationFrame(glide);
    }

    vp.addEventListener("pointerdown", onDown);
    vp.addEventListener("pointermove", onMove);
    vp.addEventListener("pointerup", onUp);
    vp.addEventListener("pointercancel", onUp);
    vp.addEventListener("lostpointercapture", onUp);
    vp.addEventListener("keydown", function (e) {
      const k = e.key;
      if (k === "ArrowLeft") view.yaw = clamp(view.yaw + 7, -58, 58);
      else if (k === "ArrowRight") view.yaw = clamp(view.yaw - 7, -58, 58);
      else if (k === "ArrowUp") view.pitch = clamp(view.pitch - 3, -2, 26);
      else if (k === "ArrowDown") view.pitch = clamp(view.pitch + 3, -2, 26);
      else if (k === "Home" || k === "0") {
        view.yaw = DEFAULT_VIEW.yaw;
        view.pitch = DEFAULT_VIEW.pitch;
      } else return;
      e.preventDefault();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      applyView(vp, view);
    });
  }

  function init(root) {
    if (!root) return;
    const card = root.closest(".streak-card") || root;
    const vps = root.querySelectorAll ? root.querySelectorAll(".s3d-viewport") : [];
    for (let i = 0; i < vps.length; i++) bindViewport(vps[i]);

    if (!card.dataset.s3dReady) {
      card.dataset.s3dReady = "1";
      card.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-s3d-reset]");
        if (!btn) return;
        const key = btn.getAttribute("data-s3d-reset");
        const view = memory[key] || (memory[key] = { yaw: DEFAULT_VIEW.yaw, pitch: DEFAULT_VIEW.pitch });
        view.yaw = DEFAULT_VIEW.yaw;
        view.pitch = DEFAULT_VIEW.pitch;
        const vp = card.querySelector('.s3d-viewport[data-s3d-key="' + key + '"]');
        if (vp) applyView(vp, view);
      });
    }
  }

  window.Streak3D = { pohon: pohon, hewan: hewan, init: init };
})();
