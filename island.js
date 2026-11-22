/* ===================================================
   ISLAND TYCOON — UI canvas isometrik + panel game
   Memakai mesin window.IslandLocal (Firestore + simulasi).
=================================================== */
(function () {
  "use strict";

  const C = window.IslandCatalog;
  const TILE_W = 64;
  const TILE_H = 32;
  const W2 = TILE_W / 2;
  const H2 = TILE_H / 2;
  const RINGKAS_KEY = "islandRingkas";
  const TOOLS = [
    { id: "build", icon: "🏗️", label: "Bangun" },
    { id: "shop", icon: "🏪", label: "Toko" },
    { id: "inventory", icon: "🎒", label: "Tas" },
    { id: "workers", icon: "🧑‍🌾", label: "Kru" },
    { id: "factories", icon: "🏭", label: "Pabrik" },
    { id: "vehicles", icon: "🚗", label: "Kendaraan" },
    { id: "market", icon: "🤝", label: "Market" },
    { id: "players", icon: "👥", label: "Pemain" },
    { id: "camera", icon: "🎥", label: "Kamera" },
  ];
  const WARNA = {
    rumah: { dinding: "#f4e8d1", dinding2: "#e3d3b2", atap: "#c96f52", atap2: "#a94f39", aksen: "#8f4b37" },
    gudang: { dinding: "#ddcba7", dinding2: "#c9b891", atap: "#7f9078", atap2: "#65775f", aksen: "#5f6c58" },
    pondok: { dinding: "#efe1bf", dinding2: "#dccaa3", atap: "#b98e4f", atap2: "#99713a", aksen: "#7d5a2e" },
    "pabrik-kayu": { dinding: "#cdd8c9", dinding2: "#b7c4b3", atap: "#5f8468", atap2: "#4d6d55", aksen: "#8a5a33" },
    "pabrik-semen": { dinding: "#c9cfce", dinding2: "#b2b9b8", atap: "#6f7c7a", atap2: "#596664", aksen: "#8d968f" },
    "pabrik-pertanian": { dinding: "#d9d7bd", dinding2: "#c3c1a5", atap: "#7f9a5f", atap2: "#67834b", aksen: "#b48a3f" },
    "pabrik-makanan": { dinding: "#e7d7c3", dinding2: "#d2c1aa", atap: "#c07a55", atap2: "#a36141", aksen: "#8e5a3a" },
    "pabrik-air": { dinding: "#c9dbe2", dinding2: "#b3c8d1", atap: "#4f8ea8", atap2: "#3e738a", aksen: "#2f6278" },
  };

  let aktif = false;
  let siap = false;
  let mode = "own";
  let state = null;
  let objects = [];
  let kunjungan = null;
  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let VW = 0;
  let VH = 0;
  let cam = { x: 0, y: 470, zoom: 0.85 };
  let camSiap = false;
  let player = { x: 9.6, y: 10.4, dir: 1, jalan: 0 };
  let driving = false;
  let selectedId = "";
  let placing = null;
  let moving = null;
  let hover = null;
  let panel = null;
  let busy = false;
  let ticker = null;
  let uiTimer = null;
  let raf = 0;
  let lastFrame = 0;
  let lastSel = 0;
  let toastTimer = 0;
  let particles = [];
  let stick = { x: 0, y: 0, aktif: false };
  let keys = new Set();
  let pointerMap = new Map();
  let drag = null;
  let pinch = null;
  let dipasang = false;
  let klikSiap = false;
  let lastTick = 0;
  let marketMemuat = false;
  let labels = [];

  const $ = (id) => document.getElementById(id);

  /* ================= UTIL ================= */
  function esc(nilai) {
    return String(nilai == null ? "" : nilai).replace(/[&<>"']/g, (m) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
    ));
  }
  function fmt(n) {
    const x = Math.floor(Number(n) || 0);
    try { return new Intl.NumberFormat("id-ID").format(x); } catch (err) { return String(x); }
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, Number(n) || 0)); }
  function reqId() {
    try {
      if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch (err) { /* fallback */ }
    return `island-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  function hash(s) {
    let h = 0;
    const t = String(s || "");
    for (let i = 0; i < t.length; i += 1) h = (h * 31 + t.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function durasi(ms) {
    const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m >= 60) return `${Math.floor(m / 60)} j ${m % 60} m`;
    if (m > 0) return `${m} m ${s} s`;
    return `${s} s`;
  }
  function infoObjek(type) {
    return C.BUILDING_BY_ID[type] || C.DECOR_BY_ID[type] || C.NATURAL_BY_ID[type] || null;
  }
  function invOf(id) {
    return state ? Math.max(0, Math.floor(Number(state.inventory[id]) || 0)) : 0;
  }
  function kapasitasGudang() {
    const g = objects.filter((o) => o.type === "gudang");
    if (!g.length) return C.ECONOMY.storageBase;
    return C.storageCapacity(Math.max(...g.map((o) => o.level)), g.length);
  }
  function totalBarang() {
    if (!state) return 0;
    return Object.keys(state.inventory).reduce((n, id) => n + invOf(id), 0);
  }
  function batasPekerja() {
    return C.maxPekerja(objects.filter((o) => o.type === "pondok").map((o) => o.level));
  }
  function pemilikNow() {
    try {
      if (window.currentUser) return window.currentUser;
      return typeof currentUser !== "undefined" ? currentUser : null;
    } catch (err) { return null; }
  }
  function objekTerpilih() {
    return objects.find((o) => o.id === selectedId) || null;
  }
  function bunyi(nama) {
    try {
      if (window.SoundFX && typeof window.SoundFX[nama] === "function") window.SoundFX[nama]();
    } catch (err) { /* audio opsional */ }
  }
  function pesanGalat(err) {
    const kode = err && err.code;
    if (kode === "permission-denied") return "Akses ditolak. Aturan Firestore mungkin belum diperbarui.";
    if (kode === "unauthenticated") return "Login dulu untuk membuka pulau.";
    return (err && err.message) || "Terjadi kesalahan. Coba lagi.";
  }

  /* ================= PALET ================= */
  let palet = {};
  function bacaPalet() {
    const tema = String(document.documentElement.getAttribute("data-theme") || "");
    const gelap = tema.indexOf("dark") >= 0;
    palet = gelap ? {
      seaA: "#0b2426", seaB: "#103336", foam: "rgba(180,235,220,.22)",
      sand: "#6f6a45", sand2: "#5d5939",
      rumputA: "#2f6b49", rumputB: "#2a6243", rumputGaris: "rgba(190,235,205,.10)",
      rumputTepi: "#204d34", bayang: "rgba(0,0,0,.32)",
      pohon: "#2c6b45", pohon2: "#245a3a", batang: "#5c3f27",
      batu: "#6c7772", batu2: "#59645f", tanah: "#4a3a28", tanah2: "#3d3022",
      ink: "#e7f2ea", soft: "rgba(231,242,234,.72)", aksen: "#46b27f",
      panel: "rgba(10,25,18,.82)",
    } : {
      seaA: "#3a949a", seaB: "#2b7b81", foam: "rgba(255,255,255,.38)",
      sand: "#ead8a5", sand2: "#ddc992",
      rumputA: "#8ac98f", rumputB: "#80c187", rumputGaris: "rgba(255,255,255,.14)",
      rumputTepi: "#6aa873", bayang: "rgba(24,58,40,.20)",
      pohon: "#3c8a58", pohon2: "#2f7048", batang: "#8a5a33",
      batu: "#9aa39b", batu2: "#808b83", tanah: "#b58a5c", tanah2: "#a1794d",
      ink: "#1c3a2a", soft: "rgba(28,58,42,.7)", aksen: "#2f9e68",
      panel: "rgba(255,255,255,.86)",
    };
  }

  /* ================= PROYEKSI ================= */
  function iso(x, y) {
    return { x: (x - y) * W2, y: (x + y) * H2 };
  }
  function keLayar(sx, sy) {
    return { x: (sx - cam.x) * cam.zoom + VW / 2, y: (sy - cam.y) * cam.zoom + VH / 2 };
  }
  function keDunia(px, py) {
    const sx = (px - VW / 2) / cam.zoom + cam.x;
    const sy = (py - VH / 2) / cam.zoom + cam.y;
    return { x: (sx / W2 + sy / H2) / 2, y: (sy / H2 - sx / W2) / 2 };
  }
  function batasKam() {
    cam.x = clamp(cam.x, -40 * W2 - 260, 40 * W2 + 260);
    cam.y = clamp(cam.y, -200, 40 * H2 + 220);
  }

  /* ================= HUD ================= */
  function perbaruiHud() {
    const badge = $("island-coin-badge");
    const sn = $("island-owner-name");
    const sl = $("island-owner-level");
    const xpBar = $("island-xp-bar");
    const world = $("island-world");
    if (mode === "visit" && kunjungan) {
      if (badge) badge.textContent = "👀 Kunjungan";
      if (sn) sn.textContent = kunjungan.name;
      if (sl) sl.textContent = `Lv ${kunjungan.level}`;
      if (xpBar) xpBar.style.width = "0%";
      if (world) {
        world.classList.add("is-visit");
        world.classList.remove("is-lemas");
      }
      return;
    }
    if (!state) return;
    if (badge) badge.textContent = `💰 ${fmt(state.money)}`;
    if (sn) sn.textContent = state.name;
    if (sl) sl.textContent = `Lv ${state.level}`;
    const awal = C.xpLevelAwal(state.level);
    const akhir = C.xpLevelBerikut(state.level);
    const pct = akhir ? clamp(((state.xp - awal) / Math.max(1, akhir - awal)) * 100, 0, 100) : 100;
    if (xpBar) xpBar.style.width = `${pct}%`;
    const rumah = objects.find((o) => o.type === "rumah");
    const red = C.kebutuhanTurun(rumah ? rumah.level : 1);
    const menit = Math.max(0, (Date.now() - (state.needs.updatedAt || Date.now())) / 60000);
    const hunger = clamp(state.needs.hunger - menit * C.NEEDS.hungerPerMenit * red, 0, C.NEEDS.max);
    const thirst = clamp(state.needs.thirst - menit * C.NEEDS.thirstPerMenit * red, 0, C.NEEDS.max);
    setBar("island-hunger", hunger);
    setBar("island-thirst", thirst);
    if (world) world.classList.toggle("is-lemas", hunger < C.NEEDS.lemasBatas || thirst < C.NEEDS.lemasBatas);
  }
  function setBar(id, nilai) {
    const bar = $(`${id}-bar`);
    const val = $(`${id}-val`);
    const v = Math.round(nilai);
    if (bar) {
      bar.style.width = `${clamp(nilai, 0, 100)}%`;
      bar.className = nilai < 20 ? "is-low" : nilai < 45 ? "is-mid" : "";
    }
    if (val) val.textContent = `${v}%`;
  }

  /* ================= TOAST ================= */
  function toast(pesan, jahat) {
    const el = $("island-toast");
    if (!el) return;
    el.textContent = String(pesan || "");
    el.classList.toggle("is-error", !!jahat);
    el.hidden = false;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("is-show");
      setTimeout(() => { if (!el.classList.contains("is-show")) el.hidden = true; }, 260);
    }, 2600);
  }

  /* ================= ENGINE BRIDGE ================= */
  function simpanRingkas() {
    if (!state) return;
    try {
      localStorage.setItem(RINGKAS_KEY, JSON.stringify({
        absen: state.absen,
        money: state.money,
        level: state.level,
        xp: state.xp,
        at: Date.now(),
      }));
    } catch (err) { /* penyimpanan penuh */ }
  }

  async function jalankan(nama, payload, opsi) {
    if (mode === "visit" && !["visit", "marketList"].includes(nama)) {
      toast("Kamu sedang berkunjung. Pulang dulu untuk mengubah pulau.", true);
      return null;
    }
    if (busy) return null;
    busy = true;
    try {
      const hasil = await window.IslandLocal.call(nama, { ...(payload || {}), requestId: reqId() });
      terapkanHasil(hasil);
      if (hasil && hasil.pesan) toast(hasil.pesan);
      if (panel && (!opsi || opsi.panel !== false)) renderPanel();
      return hasil;
    } catch (err) {
      toast(pesanGalat(err), true);
      return null;
    } finally {
      busy = false;
    }
  }

  function terapkanHasil(hasil) {
    if (!hasil) return;
    if (hasil.state) {
      state = hasil.state;
      simpanRingkas();
    }
    if (hasil.objects) objects = hasil.objects;
    if (hasil.got) {
      const o = objekTerpilih();
      const pos = o ? { x: o.kind === "building" || o.kind === "factory" || o.kind === "plot" ? o.x + o.w / 2 : o.x, y: o.kind === "building" || o.kind === "factory" || o.kind === "plot" ? o.y + o.h / 2 : o.y } : player;
      const info = C.RESOURCE_BY_ID[hasil.got.id];
      spawnTeks(pos.x, pos.y, `+${hasil.got.qty} ${info ? info.icon : ""}`, "#e9ffe9");
      bunyi("cardOpen");
    }
    if (hasil.levelUp) {
      toast(`Naik ke level ${hasil.levelUp}! Bangunan dan tanaman baru terbuka.`);
      bunyi("win");
    }
    if (selectedId && !objects.some((o) => o.id === selectedId)) selectedId = "";
    perbaruiHud();
    renderSelection();
    pasangActionbar();
  }

  function spawnTeks(x, y, teks, warna) {
    const p = iso(x, y);
    particles.push({ x: p.x, y: p.y - 26, teks, warna: warna || "#fff", hidup: 1.2, maks: 1.2 });
  }

  /* ================= CANVAS ================= */
  function ukurCanvas() {
    const world = $("island-world");
    if (!canvas || !world) return;
    const rect = world.getBoundingClientRect();
    VW = Math.max(240, Math.round(rect.width));
    VH = Math.max(320, Math.round(rect.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(VW * dpr);
    canvas.height = Math.round(VH * dpr);
    canvas.style.width = `${VW}px`;
    canvas.style.height = `${VH}px`;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetKamera() {
    const tengah = iso(15, 15);
    cam.x = tengah.x;
    cam.y = tengah.y;
    cam.zoom = VW < 640 ? 0.66 : 0.88;
    batasKam();
    camSiap = true;
  }

  function zoomKe(faktor, px, py) {
    const ax = px == null ? VW / 2 : px;
    const ay = py == null ? VH / 2 : py;
    const sebelum = keDunia(ax, ay);
    cam.zoom = clamp(cam.zoom * faktor, 0.42, 1.9);
    const isoX = (sebelum.x - sebelum.y) * W2;
    const isoY = (sebelum.x + sebelum.y) * H2;
    const setelah = keDunia(ax, ay);
    const isoX2 = (setelah.x - setelah.y) * W2;
    const isoY2 = (setelah.x + setelah.y) * H2;
    cam.x += isoX - isoX2;
    cam.y += isoY - isoY2;
    batasKam();
  }

  function gerakKamera(px, py) {
    const d = keDunia(px, py);
    if (placing) {
      const p = window.IslandLocal.pratinjau(placing.type, objects, d.x, d.y, placing.id || "");
      placing.pos = { x: p.x, y: p.y };
      placing.valid = p.valid;
      placing.pratinjau = p;
    } else if (moving) {
      const o = objekTerpilih();
      const p = window.IslandLocal.pratinjauGeser(o, objects, d.x, d.y);
      moving.pos = { x: p.x, y: p.y };
      moving.valid = p.valid;
      moving.pratinjau = p;
    } else if (!drag || Math.abs(drag.dx) + Math.abs(drag.dy) < 4) {
      hover = { x: d.x, y: d.y };
    }
  }

  /* ================= GAMBAR ================= */
  function mulaiLoop() {
    if (raf) cancelAnimationFrame(raf);
    lastFrame = performance.now();
    const frame = (ts) => {
      if (!aktif) return;
      const dt = Math.min(0.05, Math.max(0, (ts - lastFrame) / 1000)) || 0;
      lastFrame = ts;
      perbarui(dt, ts);
      gambar(ts);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function perbarui(dt, ts) {
    if (!siap) return;
    if (mode === "own" && !placing && !moving) {
      const v = vektorJalan();
      if (v.x || v.y) {
        const kendaraan = kendaraanAktif();
        let kecepatan = driving && kendaraan ? C.VEHICLE_BY_ID[kendaraan.type].speed : 2.2;
        if (mode === "own" && state) {
          const rumah = objects.find((o) => o.type === "rumah");
          const red = C.kebutuhanTurun(rumah ? rumah.level : 1);
          const menit = Math.max(0, (Date.now() - (state.needs.updatedAt || Date.now())) / 60000);
          const hunger = state.needs.hunger - menit * C.NEEDS.hungerPerMenit * red;
          const thirst = state.needs.thirst - menit * C.NEEDS.thirstPerMenit * red;
          if (hunger < C.NEEDS.lemasBatas || thirst < C.NEEDS.lemasBatas) kecepatan *= C.NEEDS.lemasSpeed;
        }
        const nx = player.x + v.x * kecepatan * dt;
        const ny = player.y + v.y * kecepatan * dt;
        if (bisaLewat(nx, player.y)) player.x = nx;
        if (bisaLewat(player.x, ny)) player.y = ny;
        player.dir = v.x < -0.05 ? -1 : v.x > 0.05 ? 1 : player.dir;
        player.jalan += dt * 9;
      } else {
        player.jalan += dt * 2;
      }
      if (driving) {
        const t = iso(player.x, player.y);
        cam.x += (t.x - cam.x) * Math.min(1, dt * 5);
        cam.y += (t.y - cam.y) * Math.min(1, dt * 5);
        batasKam();
      }
    }
    // pan kamera dengan panah keyboard
    let kx = 0;
    let ky = 0;
    if (keys.has("arrowleft")) kx += 1;
    if (keys.has("arrowright")) kx -= 1;
    if (keys.has("arrowup")) ky += 1;
    if (keys.has("arrowdown")) ky -= 1;
    if (kx || ky) {
      cam.x += (kx * 420 * dt) / cam.zoom;
      cam.y += (ky * 420 * dt) / cam.zoom;
      batasKam();
    }
    particles = particles.filter((p) => {
      p.hidup -= dt;
      p.y -= dt * 26;
      return p.hidup > 0;
    });
    if (ts - lastSel > 800) {
      lastSel = ts;
      if (selectedId) renderSelection();
      perbaruiHud();
    }
  }

  function vektorJalan() {
    let x = 0;
    let y = 0;
    if (keys.has("w")) y -= 1;
    if (keys.has("s")) y += 1;
    if (keys.has("a")) x -= 1;
    if (keys.has("d")) x += 1;
    if (stick.aktif) {
      x += stick.x;
      y += stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  function bisaLewat(x, y) {
    if (x < C.LAND_MIN + 0.35 || x > C.LAND_MAX + 0.65 || y < C.LAND_MIN + 0.35 || y > C.LAND_MAX + 0.65) return false;
    for (const o of objects) {
      if (o.kind === "decor") continue;
      if (o.kind === "building" || o.kind === "factory" || o.kind === "plot") {
        if (x > o.x - 0.28 && x < o.x + o.w + 0.28 && y > o.y - 0.28 && y < o.y + o.h + 0.28) return false;
      } else if (Math.hypot(o.x - x, o.y - y) < 0.52) {
        return false;
      }
    }
    return true;
  }

  function gambar(ts) {
    if (!ctx) return;
    labels = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const laut = ctx.createLinearGradient(0, 0, 0, VH);
    laut.addColorStop(0, palet.seaA);
    laut.addColorStop(1, palet.seaB);
    ctx.fillStyle = laut;
    ctx.fillRect(0, 0, VW, VH);
    gambarOmbak(ts);
    ctx.save();
    ctx.translate(VW / 2 - cam.x * cam.zoom, VH / 2 - cam.y * cam.zoom);
    ctx.scale(cam.zoom, cam.zoom);
    gambarPulau(ts);
    const item = [];
    objects.forEach((o) => {
      if (o.x < -2 || o.y < -2 || o.x > C.GRID + 2 || o.y > C.GRID + 2) return;
      const pusat = pusatObjek(o);
      item.push({ depth: pusat.x + pusat.y, fn: () => gambarObjek(o, ts, pusat) });
    });
    if (mode === "own") {
      state && state.workers.forEach((w, i) => {
        const pos = posisiPekerja(i);
        item.push({ depth: pos.x + pos.y - 0.01, fn: () => gambarPekerja(w, pos, ts, i) });
      });
      item.push({ depth: player.x + player.y, fn: () => gambarPemain(ts) });
    }
    item.sort((a, b) => a.depth - b.depth);
    item.forEach((it) => {
      ctx.save();
      it.fn();
      ctx.restore();
    });
    gambarNpc(9.2, 9.4, "🏪", "Toko", ts);
    gambarNpc(12.6, 9.4, "🤝", "Market", ts);
    if (hover && !placing && !moving && mode === "own") gambarHover();
    if (placing) gambarGhost(placing, ts);
    else if (moving) gambarGhost(moving, ts);
    gambarPartikel();
    ctx.restore();
    gambarLabel();
  }

  function gambarOmbak(ts) {
    ctx.save();
    ctx.strokeStyle = palet.foam;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const y = ((i * 137 + ts * 0.012) % (VH + 120)) - 60;
      const x = (i * 211) % Math.max(1, VW);
      ctx.beginPath();
      ctx.arc(x, y, 34 + (i % 3) * 12, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
    ctx.restore();
  }

  function diamond(sx, sy, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(sx, sy - ry);
    ctx.lineTo(sx + rx, sy);
    ctx.lineTo(sx, sy + ry);
    ctx.lineTo(sx - rx, sy);
    ctx.closePath();
  }

  function gambarPulau(ts) {
    // pasir / dasar pulau
    const kiri = iso(C.LAND_MIN - 0.9, C.LAND_MAX + 0.9);
    const atas = iso(C.LAND_MIN - 0.9, C.LAND_MIN - 0.9);
    const kanan = iso(C.LAND_MAX + 0.9, C.LAND_MIN - 0.9);
    const bawah = iso(C.LAND_MAX + 0.9, C.LAND_MAX + 0.9);
    ctx.beginPath();
    ctx.moveTo(atas.x, atas.y);
    ctx.lineTo(kanan.x, kanan.y);
    ctx.lineTo(bawah.x, bawah.y);
    ctx.lineTo(kiri.x, kiri.y);
    ctx.closePath();
    ctx.fillStyle = palet.sand;
    ctx.fill();
    ctx.strokeStyle = palet.sand2;
    ctx.lineWidth = 4;
    ctx.stroke();

    const sudut = [keKamera(2, 2), keKamera(C.GRID - 2, 2), keKamera(C.GRID - 2, C.GRID - 2), keKamera(2, C.GRID - 2)];
    const minX = Math.max(C.LAND_MIN, Math.floor(Math.min(...[0, 1].map((i) => keDunia(sudut[i].x, sudut[i].y).x)) - 4));
    const maxX = Math.min(C.LAND_MAX, Math.ceil(Math.max(...[1, 2].map((i) => keDunia(sudut[i].x, sudut[i].y).x)) + 4));
    const minY = Math.max(C.LAND_MIN, Math.floor(Math.min(...[0, 3].map((i) => keDunia(sudut[i].x, sudut[i].y).y)) - 4));
    const maxY = Math.min(C.LAND_MAX, Math.ceil(Math.max(...[2, 3].map((i) => keDunia(sudut[i].x, sudut[i].y).y)) + 4));
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const p = iso(x + 0.5, y + 0.5);
        diamond(p.x, p.y, W2, H2);
        ctx.fillStyle = (x + y) % 2 === 0 ? palet.rumputA : palet.rumputB;
        ctx.fill();
        ctx.strokeStyle = palet.rumputGaris;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        if ((hash(`${x}:${y}`) % 11) === 0) {
          ctx.strokeStyle = palet.rumputTepi;
          ctx.lineWidth = 1.2;
          const tx = p.x + ((hash(`${x}:${y}`) % 9) - 4);
          const ty = p.y + ((hash(`y${x}:${y}`) % 7) - 3);
          ctx.beginPath();
          ctx.moveTo(tx - 2, ty + 3);
          ctx.lineTo(tx - 1, ty - 2);
          ctx.moveTo(tx + 1, ty + 3);
          ctx.lineTo(tx + 2, ty - 1);
          ctx.stroke();
        }
      }
    }
    // grid saat menempatkan
    if (placing && placing.pratinjau && !placing.pratinjau.free) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 0.8;
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const p = iso(x + 0.5, y + 0.5);
          diamond(p.x, p.y, W2, H2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    // dermaga kecil
    const d = iso(19.2, 37.9);
    ctx.fillStyle = "#9a7446";
    ctx.fillRect(d.x - 16, d.y - 3, 32, 7);
    ctx.fillStyle = "#b98d58";
    for (let i = -12; i <= 12; i += 6) ctx.fillRect(d.x + i, d.y - 2, 2, 5);
  }

  function keKamera(x, y) {
    const p = iso(x, y);
    return keLayar(p.x, p.y);
  }

  function pusatObjek(o) {
    if (o.kind === "building" || o.kind === "factory" || o.kind === "plot") {
      return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    }
    return { x: o.x, y: o.y };
  }

  function gambarObjek(o, ts, pusat) {
    const p = iso(pusat.x, pusat.y);
    if (o.id === selectedId) {
      const rx = (o.kind === "building" || o.kind === "factory" || o.kind === "plot" ? o.w : 1) * W2;
      const ry = (o.kind === "building" || o.kind === "factory" || o.kind === "plot" ? o.h : 1) * H2;
      diamond(p.x, p.y + 2, rx + 4, ry + 3);
      ctx.fillStyle = "rgba(70,178,127,.28)";
      ctx.fill();
      ctx.strokeStyle = palet.aksen;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    const bayang = o.kind === "decor" || o.kind === "natural";
    ctx.fillStyle = palet.bayang;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + (bayang ? 3 : 4), (o.kind === "building" || o.kind === "factory" ? o.w : 0.72) * W2 * 0.82, (o.kind === "building" || o.kind === "factory" ? o.h : 0.72) * H2 * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();

    if (o.kind === "natural") {
      if (o.type === "pohon") gambarPohon(o, p, ts);
      else gambarBatu(o, p, ts);
      return;
    }
    if (o.kind === "decor") { gambarDekor(o, p, ts); return; }
    if (o.kind === "plot") { gambarLahan(o, p, ts); return; }
    if (o.kind === "factory") { gambarBangunan(o, p, ts, true); return; }
    gambarBangunan(o, p, ts, false);
  }

  function gambarPohon(o, p, ts) {
    const info = C.NATURAL_BY_ID.pohon;
    const hidup = o.respawnAt === 0 || o.respawnAt <= Date.now();
    if (!hidup || o.hp <= 0) {
      ctx.fillStyle = palet.batang;
      ctx.fillRect(p.x - 4, p.y - 8, 8, 10);
      ctx.fillStyle = palet.pohon2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 11, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (o.respawnAt > Date.now()) {
        const sisa = clamp((o.respawnAt - Date.now()) / info.respawnMs, 0, 1);
        ctx.strokeStyle = "rgba(255,255,255,.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 22, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - sisa));
        ctx.stroke();
      }
      return;
    }
    const goyang = Math.sin(ts / 900 + hash(o.id)) * 2.2;
    const tinggi = 20 + (hash(o.id) % 6);
    ctx.fillStyle = palet.batang;
    ctx.beginPath();
    ctx.moveTo(p.x - 3, p.y + 2);
    ctx.lineTo(p.x - 2, p.y - tinggi * 0.7);
    ctx.lineTo(p.x + 2, p.y - tinggi * 0.7);
    ctx.lineTo(p.x + 3, p.y + 2);
    ctx.closePath();
    ctx.fill();
    const cx = p.x + goyang;
    const cy = p.y - tinggi - 6;
    ctx.fillStyle = palet.pohon2;
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy + 8, 11, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 7, cy + 7, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palet.pohon;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 13, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 7, cy + 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 7, cy + 5, 8, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy - 3, 6, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function gambarBatu(o, p, ts) {
    const info = C.NATURAL_BY_ID.batu;
    const hidup = o.respawnAt === 0 || o.respawnAt <= Date.now();
    if (!hidup || o.hp <= 0) {
      ctx.fillStyle = palet.batu2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 2, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (o.respawnAt > Date.now()) {
        const sisa = clamp((o.respawnAt - Date.now()) / info.respawnMs, 0, 1);
        ctx.strokeStyle = "rgba(255,255,255,.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 16, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - sisa));
        ctx.stroke();
      }
      return;
    }
    const tinggi = 11 + (hash(o.id) % 5);
    ctx.fillStyle = palet.batu;
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y + 2);
    ctx.lineTo(p.x - 8, p.y - tinggi);
    ctx.lineTo(p.x + 1, p.y - tinggi - 3);
    ctx.lineTo(p.x + 11, p.y - tinggi + 2);
    ctx.lineTo(p.x + 13, p.y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palet.batu2;
    ctx.beginPath();
    ctx.moveTo(p.x + 1, p.y - tinggi - 3);
    ctx.lineTo(p.x + 11, p.y - tinggi + 2);
    ctx.lineTo(p.x + 12, p.y + 1);
    ctx.lineTo(p.x + 3, p.y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.2)";
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y - tinggi + 3);
    ctx.lineTo(p.x - 1, p.y - tinggi + 7);
    ctx.stroke();
  }

  function gambarDekor(o, p, ts) {
    if (o.type === "bunga") {
      const warna = ["#e8c85a", "#e58aa0", "#f0f0f0", "#c58ae0"][hash(o.id) % 4];
      ctx.strokeStyle = palet.pohon2;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i += 1) {
        const dx = (i - 1) * 5;
        ctx.beginPath();
        ctx.moveTo(p.x + dx, p.y + 1);
        ctx.lineTo(p.x + dx + Math.sin(ts / 900 + i) * 1.2, p.y - 9);
        ctx.stroke();
        ctx.fillStyle = warna;
        ctx.beginPath();
        ctx.arc(p.x + dx + Math.sin(ts / 900 + i) * 1.2, p.y - 10, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    if (o.type === "batu-hias") {
      ctx.fillStyle = palet.batu;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 3, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palet.batu2;
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y - 2, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (o.type === "bangku") {
      ctx.fillStyle = "#8a5a33";
      ctx.fillRect(p.x - 10, p.y - 7, 20, 4);
      ctx.fillRect(p.x - 9, p.y - 2, 3, 7);
      ctx.fillRect(p.x + 6, p.y - 2, 3, 7);
      ctx.fillStyle = "#a97c4f";
      ctx.fillRect(p.x - 10, p.y - 10, 20, 3);
      return;
    }
    if (o.type === "lampu") {
      ctx.fillStyle = "#4f5b54";
      ctx.fillRect(p.x - 1.5, p.y - 26, 3, 27);
      const glow = ctx.createRadialGradient(p.x, p.y - 29, 1, p.x, p.y - 29, 14);
      glow.addColorStop(0, "rgba(255,224,140,.75)");
      glow.addColorStop(1, "rgba(255,224,140,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 29, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2c14e";
      ctx.beginPath();
      ctx.arc(p.x, p.y - 29, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (o.type === "patung") {
      ctx.fillStyle = "#b8bdb6";
      ctx.fillRect(p.x - 9, p.y - 5, 18, 7);
      ctx.fillStyle = "#c9cec7";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 14, 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y - 27, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (o.type === "pohon-hias") {
      const goyang = Math.sin(ts / 1000 + hash(o.id)) * 1.6;
      ctx.fillStyle = palet.batang;
      ctx.fillRect(p.x - 2, p.y - 16, 4, 18);
      ctx.fillStyle = "#5c9d6b";
      ctx.beginPath();
      ctx.ellipse(p.x + goyang, p.y - 25, 10, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - 6 + goyang, p.y - 20, 7, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + 6 + goyang, p.y - 20, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)";
      [[-4, -27], [3, -23], [7, -29]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(p.x + dx + goyang, p.y + dy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }
  }

  function gambarLahan(o, p, ts) {
    ctx.fillStyle = palet.tanah;
    diamond(p.x, p.y, W2 * 0.88, H2 * 0.88);
    ctx.fill();
    ctx.strokeStyle = palet.tanah2;
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i += 1) {
      const a = iso(0.15, 0.5 + i * 0.16);
      const b = iso(0.85, 0.5 + i * 0.16);
      ctx.beginPath();
      ctx.moveTo(p.x + (a.x - (W2 * 0.5)) * 0.86, p.y + (a.y - H2 * 0.5) * 0.86);
      ctx.lineTo(p.x + (b.x - W2 * 0.5) * 0.86, p.y + (b.y - H2 * 0.5) * 0.86);
      ctx.stroke();
    }
    const crop = o.crop ? C.CROP_BY_ID[o.crop] : null;
    if (!crop) {
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.setLineDash([4, 4]);
      diamond(p.x, p.y, W2 * 0.6, H2 * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const total = Math.max(1, o.readyAt - o.plantedAt);
    const prog = clamp((Date.now() - o.plantedAt) / total, 0, 1);
    const siap = prog >= 1;
    const tinggi = 4 + prog * 13;
    for (let i = 0; i < 4; i += 1) {
      const dx = [-14, -5, 5, 14][i];
      const dy = [-3, 2, 2, -3][i];
      const sw = Math.sin(ts / 800 + i + hash(o.id)) * 1.4;
      ctx.strokeStyle = siap ? crop.warna : palet.pohon2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + dx, p.y + dy + 3);
      ctx.quadraticCurveTo(p.x + dx + sw, p.y + dy - tinggi * 0.6, p.x + dx + sw * 2, p.y + dy - tinggi);
      ctx.stroke();
      if (prog > 0.35) {
        ctx.fillStyle = siap ? crop.warna : "#7fae6b";
        ctx.beginPath();
        ctx.ellipse(p.x + dx - 3, p.y + dy - tinggi * 0.45, 3, 1.8, -0.5, 0, Math.PI * 2);
        ctx.ellipse(p.x + dx + 3, p.y + dy - tinggi * 0.6, 3, 1.8, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (siap) {
        ctx.fillStyle = crop.warna;
        ctx.beginPath();
        ctx.arc(p.x + dx + sw * 2, p.y + dy - tinggi, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (siap) {
      const naik = Math.sin(ts / 300) * 2;
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(crop.icon, p.x, p.y - 30 + naik);
    }
  }

  function gambarBangunan(o, p, ts, pabrik) {
    const warna = WARNA[o.type] || WARNA.rumah;
    const rx = o.w * W2;
    const ry = o.h * H2;
    const tinggi = (pabrik ? 30 : o.type === "gudang" ? 24 : o.type === "pondok" ? 19 : 27) + o.level * 3;
    const N = { x: p.x, y: p.y - ry };
    const E = { x: p.x + rx, y: p.y };
    const S = { x: p.x, y: p.y + ry };
    const Wc = { x: p.x - rx, y: p.y };
    ctx.beginPath();
    ctx.moveTo(Wc.x, Wc.y); ctx.lineTo(S.x, S.y); ctx.lineTo(S.x, S.y - tinggi); ctx.lineTo(Wc.x, Wc.y - tinggi); ctx.closePath();
    ctx.fillStyle = warna.dinding2;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(E.x, E.y); ctx.lineTo(S.x, S.y); ctx.lineTo(S.x, S.y - tinggi); ctx.lineTo(E.x, E.y - tinggi); ctx.closePath();
    ctx.fillStyle = warna.dinding;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // pintu
    ctx.fillStyle = warna.aksen;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, S.y - 2);
    ctx.lineTo(p.x - 7, S.y - tinggi * 0.55);
    ctx.lineTo(p.x + 7, S.y - tinggi * 0.42);
    ctx.lineTo(p.x + 7, S.y - 2);
    ctx.closePath();
    ctx.fill();
    // jendela
    if (!pabrik) {
      ctx.fillStyle = "rgba(255,240,190,.8)";
      ctx.fillRect(p.x - rx * 0.55, p.y - ry * 0.15 - tinggi * 0.7, 8, 7);
      ctx.fillRect(p.x + rx * 0.3, p.y - ry * 0.05 - tinggi * 0.6, 8, 7);
    }
    // atap
    const atapY = p.y - tinggi;
    ctx.beginPath();
    ctx.moveTo(N.x, atapY - ry * 0.62);
    ctx.lineTo(E.x - 4, atapY);
    ctx.lineTo(S.x, atapY + ry * 0.32);
    ctx.lineTo(Wc.x + 4, atapY);
    ctx.closePath();
    ctx.fillStyle = warna.atap;
    ctx.fill();
    ctx.strokeStyle = warna.atap2;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(N.x, atapY - ry * 0.62);
    ctx.lineTo(S.x, atapY + ry * 0.32);
    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.stroke();
    if (o.type === "gudang") {
      ctx.fillStyle = warna.aksen;
      ctx.fillRect(p.x + rx * 0.28, p.y + ry * 0.25 - tinggi, 14, 9);
    }
    if (o.type === "pondok") {
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.fillRect(p.x - rx * 0.5, p.y - tinggi * 0.5, 3, 10);
    }
    if (o.type === "rumah" && o.level > 1) {
      ctx.fillStyle = "#e7c96a";
      for (let i = 0; i < Math.min(4, o.level - 1); i += 1) {
        ctx.fillRect(p.x - 10 + i * 6, p.y - tinggi - 12, 3, 3);
      }
    }
    if (pabrik) {
      const info = C.BUILDING_BY_ID[o.type];
      const cerobongX = p.x + rx * 0.45;
      const cerobongY = p.y - 6;
      ctx.fillStyle = "#8b8f88";
      ctx.fillRect(cerobongX - 5, cerobongY - tinggi - 22, 10, tinggi + 22);
      ctx.fillStyle = "#6f736d";
      ctx.fillRect(cerobongX - 7, cerobongY - tinggi - 25, 14, 4);
      if (o.batchStartAt > 0) {
        for (let i = 0; i < 4; i += 1) {
          const ph = ((ts / 900 + i * 0.7 + hash(o.id)) % 1);
          ctx.fillStyle = `rgba(230,238,232,${0.34 * (1 - ph)})`;
          ctx.beginPath();
          ctx.arc(cerobongX + Math.sin(ph * 6) * 5, cerobongY - tinggi - 28 - ph * 30, 4 + ph * 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (o.batches > 0) {
        const out = C.RESOURCE_BY_ID[info.resep.output.id];
        ctx.fillStyle = "rgba(20,42,30,.72)";
        ctx.beginPath();
        ctx.roundRect(p.x - 22, p.y - tinggi - 34, 44, 15, 7);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${out.icon} ${o.batches}`, p.x, p.y - tinggi - 23);
      }
    }
    const label = infoObjek(o.type);
    if (o.level > 1 || o.type === "pabrik-kayu" || o.type === "pabrik-air" || o.type === "pabrik-semen" || o.type === "pabrik-pertanian" || o.type === "pabrik-makanan") {
      ctx.fillStyle = "rgba(20,42,30,.66)";
      ctx.beginPath();
      ctx.roundRect(p.x - 16, p.y + ry + 4, 32, 13, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Lv ${o.level}`, p.x, p.y + ry + 13.5);
    }
    void label;
  }

  function posisiPekerja(i) {
    const hidup = objects.filter((o) => o.type === "pohon" && (o.respawnAt === 0 || o.respawnAt <= Date.now()));
    const anchor = hidup.length ? hidup[i % hidup.length] : (objects.find((o) => o.type === "rumah") || { x: 8, y: 8 });
    const ax = anchor.kind === "building" ? anchor.x + anchor.w : anchor.x;
    const ay = anchor.kind === "building" ? anchor.y + anchor.h : anchor.y;
    const ph = performance.now() / 3200 + i * 2.2;
    return { x: ax + Math.cos(ph) * 1.15, y: ay + Math.sin(ph * 0.9) * 1.15, ph };
  }

  function gambarPekerja(w, pos, ts, i) {
    const p = iso(pos.x, pos.y);
    const bob = Math.sin(pos.ph * 4) * 1.5;
    const unpaid = w.unpaid;
    ctx.fillStyle = palet.bayang;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 8, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const baju = ["#4f9d6b", "#5d81c9", "#c98a4f", "#9a6bc9", "#4f9db0", "#c95d6f"][i % 6];
    ctx.fillStyle = baju;
    ctx.beginPath();
    ctx.roundRect(p.x - 5, p.y - 15 + bob, 10, 14, 4);
    ctx.fill();
    ctx.fillStyle = "#f0c49a";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 19 + bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5c4327";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 23 + bob, 6.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const ayun = unpaid ? 0 : Math.sin(ts / 260 + i) * 0.7;
    ctx.save();
    ctx.translate(p.x + 6, p.y - 12 + bob);
    ctx.rotate(-0.6 + ayun);
    ctx.strokeStyle = "#8a5a33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 12);
    ctx.stroke();
    ctx.fillStyle = "#b9c0b9";
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    ctx.lineTo(4, 10);
    ctx.lineTo(2, 16);
    ctx.lineTo(-2, 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (unpaid) {
      ctx.fillStyle = "rgba(214,83,70,.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y - 32 + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", p.x, p.y - 28 + bob);
    }
    if (cam.zoom > 1.05) {
      labels.push({ x: p.x, y: p.y - 38 + bob, teks: w.name, kecil: true });
    }
  }

  function kendaraanAktif() {
    if (!state || !state.activeVehicle) return null;
    return state.vehicles.find((v) => v.id === state.activeVehicle) || null;
  }

  function gambarPemain(ts) {
    const p = iso(player.x, player.y);
    ctx.fillStyle = palet.bayang;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, driving ? 16 : 8, driving ? 6 : 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const kendaraan = kendaraanAktif();
    if (driving && kendaraan) {
      const info = C.VEHICLE_BY_ID[kendaraan.type];
      const arah = player.dir;
      const ayun = Math.sin(ts / 120) * 1.2;
      ctx.save();
      ctx.translate(p.x, p.y - 8);
      ctx.scale(arah, 1);
      ctx.fillStyle = info.warna;
      ctx.beginPath();
      ctx.roundRect(-18, -7, 36, 13, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.beginPath();
      ctx.roundRect(-12, -11, 14, 8, 4);
      ctx.fill();
      ctx.fillStyle = "#2f3a35";
      ctx.beginPath();
      ctx.arc(-11, 6, 4, 0, Math.PI * 2);
      ctx.arc(11, 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d9e6df";
      ctx.beginPath();
      ctx.arc(-11, 6, 1.6, 0, Math.PI * 2);
      ctx.arc(11, 6, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      void ayun;
    } else {
      const jalan = Math.abs(Math.sin(player.jalan)) * 2;
      const arah = player.dir;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(arah, 1);
      ctx.strokeStyle = "#3a5f46";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-2, -4); ctx.lineTo(-4 - jalan * 0.4, 3);
      ctx.moveTo(2, -4); ctx.lineTo(4 + jalan * 0.4, 3);
      ctx.stroke();
      ctx.fillStyle = "#2f9e68";
      ctx.beginPath();
      ctx.roundRect(-6, -16 + jalan * 0.2, 12, 13, 4);
      ctx.fill();
      ctx.fillStyle = "#f0c49a";
      ctx.beginPath();
      ctx.arc(0, -20 + jalan * 0.2, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3b6f4d";
      ctx.beginPath();
      ctx.ellipse(0, -24 + jalan * 0.2, 7, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c3a2a";
      ctx.beginPath();
      ctx.arc(-5.5, -24 + jalan * 0.2, 1, 0, Math.PI * 2);
      ctx.arc(5.5, -24 + jalan * 0.2, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (cam.zoom > 1.15) {
      labels.push({ x: p.x, y: p.y - 40, teks: "Kamu", kecil: true });
    }
  }

  function gambarNpc(x, y, ikon, nama, ts) {
    const p = iso(x, y);
    ctx.fillStyle = palet.bayang;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a5a33";
    ctx.fillRect(p.x - 16, p.y - 2, 32, 6);
    ctx.fillStyle = "#e6d6b4";
    ctx.fillRect(p.x - 13, p.y - 24, 26, 22);
    ctx.fillStyle = "#c96f52";
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(p.x - 15 + i * 8, p.y - 30, 4, 7);
      ctx.fillStyle = i % 2 === 0 ? "#f2e6cf" : "#c96f52";
    }
    ctx.fillStyle = "#3c8a58";
    ctx.fillRect(p.x - 17, p.y - 32, 34, 3);
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ikon, p.x, p.y - 12);
    const naik = Math.sin(ts / 800) * 1.4;
    labels.push({ x: p.x, y: p.y - 38 + naik, teks: nama });
  }

  function gambarHover() {
    const o = objekDi(hover.x, hover.y);
    if (!o) return;
    const pusat = pusatObjek(o);
    const p = iso(pusat.x, pusat.y);
    const rx = (o.kind === "building" || o.kind === "factory" || o.kind === "plot" ? o.w : 1) * W2;
    const ry = (o.kind === "building" || o.kind === "factory" || o.kind === "plot" ? o.h : 1) * H2;
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 1.4;
    diamond(p.x, p.y + 2, rx + 2, ry + 2);
    ctx.stroke();
  }

  function gambarGhost(g, ts) {
    const pratinjau = g.pratinjau;
    if (!pratinjau) return;
    const pusat = pratinjau.free
      ? { x: pratinjau.x, y: pratinjau.y }
      : { x: pratinjau.x + pratinjau.w / 2, y: pratinjau.y + pratinjau.h / 2 };
    const p = iso(pusat.x, pusat.y);
    const rx = pratinjau.w * W2;
    const ry = pratinjau.h * H2;
    ctx.save();
    ctx.globalAlpha = 0.82;
    diamond(p.x, p.y, rx, ry);
    ctx.fillStyle = g.valid ? "rgba(70,178,127,.42)" : "rgba(214,83,70,.42)";
    ctx.fill();
    ctx.strokeStyle = g.valid ? "#46b27f" : "#d65346";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    const info = infoObjek(g.type || (moving && objekTerpilih() && objekTerpilih().type));
    if (info) {
      const naik = Math.sin(ts / 240) * 3;
      ctx.font = "20px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.95;
      ctx.fillText(info.icon, p.x, p.y - ry - 10 + naik);
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(16,35,25,.7)";
    const teks = g.valid ? "Lepas untuk menempatkan" : "Posisi tidak valid";
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    const lebar = ctx.measureText(teks).width + 18;
    ctx.beginPath();
    ctx.roundRect(p.x - lebar / 2, p.y + ry + 10, lebar, 20, 10);
    ctx.fill();
    ctx.fillStyle = g.valid ? "#d6ffe6" : "#ffd9d4";
    ctx.textAlign = "center";
    ctx.fillText(teks, p.x, p.y + ry + 24);
    ctx.restore();
  }

  function gambarPartikel() {
    particles.forEach((p) => {
      const alpha = clamp(p.hidup / p.maks, 0, 1);
      ctx.fillStyle = p.warna;
      ctx.globalAlpha = alpha;
      ctx.font = "bold 13px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.teks, p.x, p.y);
      ctx.globalAlpha = 1;
    });
  }

  function gambarLabel() {
    labels.forEach((l) => {
      const s = keLayar(l.x, l.y);
      if (s.x < -80 || s.x > VW + 80 || s.y < -30 || s.y > VH + 30) return;
      ctx.font = l.kecil ? "10px ui-sans-serif, system-ui, sans-serif" : "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      const lebar = ctx.measureText(l.teks).width + 12;
      ctx.fillStyle = "rgba(12,30,22,.62)";
      ctx.beginPath();
      ctx.roundRect(s.x - lebar / 2, s.y - 9, lebar, 15, 7);
      ctx.fill();
      ctx.fillStyle = "#eaf5ee";
      ctx.fillText(l.teks, s.x, s.y + 2);
    });
  }

  /* ================= PICKING & INPUT ================= */
  function objekDi(x, y) {
    let hasil = null;
    let depth = -1;
    objects.forEach((o) => {
      let kena = false;
      if (o.kind === "building" || o.kind === "factory" || o.kind === "plot") {
        kena = x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
      } else {
        kena = Math.hypot(o.x - x, o.y - y) <= 0.55;
      }
      if (kena) {
        const p = pusatObjek(o);
        if (p.x + p.y > depth) {
          depth = p.x + p.y;
          hasil = o;
        }
      }
    });
    return hasil;
  }

  function npcDi(x, y) {
    if (Math.hypot(x - 9.2, y - 9.4) < 0.85) return "shop";
    if (Math.hypot(x - 12.6, y - 9.4) < 0.85) return "market";
    return "";
  }

  function tanganiTap(px, py) {
    const d = keDunia(px, py);
    if (placing) {
      const p = window.IslandLocal.pratinjau(placing.type, objects, d.x, d.y, "");
      placing.pos = { x: p.x, y: p.y };
      placing.valid = p.valid;
      placing.pratinjau = p;
      if (!p.valid) { toast("Posisi itu tidak bisa dipakai.", true); return; }
      const tipe = placing.type;
      const rot = placing.rot;
      jalankan("place", { type: tipe, x: p.x, y: p.y, rot }, { panel: false }).then((r) => {
        if (r) batalPenempatan();
      });
      return;
    }
    if (moving) {
      const o = objekTerpilih();
      if (!o) { batalGeser(); return; }
      const p = window.IslandLocal.pratinjauGeser(o, objects, d.x, d.y);
      if (!p.valid) { toast("Posisi baru tidak valid.", true); return; }
      const id = o.id;
      jalankan("move", { id, x: p.x, y: p.y }, { panel: false }).then((r) => {
        if (r) batalGeser();
      });
      return;
    }
    const npc = npcDi(d.x, d.y);
    if (npc) {
      bukaPanel(npc);
      return;
    }
    const o = objekDi(d.x, d.y);
    if (o) {
      selectedId = o.id;
      renderSelection();
      bunyi("cardOpen");
      return;
    }
    selectedId = "";
    renderSelection();
  }

  function pasangInput() {
    if (dipasang) return;
    dipasang = true;
    canvas.addEventListener("pointerdown", (e) => {
      if (!aktif) return;
      canvas.setPointerCapture(e.pointerId);
      pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointerMap.size === 1) {
        const rect = canvas.getBoundingClientRect();
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, mulai: Date.now(), rect };
      } else if (pointerMap.size === 2) {
        drag = null;
        const pts = Array.from(pointerMap.values());
        pinch = {
          jarak: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          zoom: cam.zoom,
          cx: (pts[0].x + pts[1].x) / 2,
          cy: (pts[0].y + pts[1].y) / 2,
        };
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!aktif) return;
      const lama = pointerMap.get(e.pointerId);
      if (lama) pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = canvas.getBoundingClientRect();
      if (pointerMap.size >= 2 && pinch) {
        const pts = Array.from(pointerMap.values());
        const jarak = Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        const faktor = jarak / pinch.jarak;
        const target = clamp(pinch.zoom * faktor, 0.42, 1.9);
        const bx = pinch.cx - rect.left;
        const by = pinch.cy - rect.top;
        const sebelum = keDunia(bx, by);
        cam.zoom = target;
        const setelah = keDunia(bx, by);
        cam.x += (sebelum.x - setelah.x) * 0;
        const isoX = (sebelum.x - sebelum.y) * W2;
        const isoY = (sebelum.x + sebelum.y) * H2;
        const isoX2 = (setelah.x - setelah.y) * W2;
        const isoY2 = (setelah.x + setelah.y) * H2;
        cam.x += isoX - isoX2;
        cam.y += isoY - isoY2;
        batasKam();
        return;
      }
      if (drag && drag.id === e.pointerId) {
        drag.dx = e.clientX - drag.sx;
        drag.dy = e.clientY - drag.sy;
        if (Math.abs(drag.dx) + Math.abs(drag.dy) > 3) {
          cam.x -= (e.clientX - drag.x) / cam.zoom;
          cam.y -= (e.clientY - drag.y) / cam.zoom;
          batasKam();
        }
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      gerakKamera(px, py);
    });
    const lepas = (e) => {
      if (!aktif) return;
      const rect = canvas.getBoundingClientRect();
      const info = drag;
      const tap = info && info.id === e.pointerId && Math.abs(info.dx) + Math.abs(info.dy) < 7 && Date.now() - info.mulai < 700;
      pointerMap.delete(e.pointerId);
      if (pointerMap.size < 2) pinch = null;
      if (pointerMap.size === 0) drag = null;
      if (tap) tanganiTap(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener("pointerup", lepas);
    canvas.addEventListener("pointercancel", (e) => {
      pointerMap.delete(e.pointerId);
      if (pointerMap.size < 2) pinch = null;
      if (pointerMap.size === 0) drag = null;
    });
    canvas.addEventListener("pointerleave", () => {
      if (!drag) hover = null;
    });
    canvas.addEventListener("wheel", (e) => {
      if (!aktif) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomKe(e.deltaY > 0 ? 0.9 : 1.1, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
    window.addEventListener("resize", () => { if (aktif) ukurCanvas(); });
    window.addEventListener("keydown", (e) => {
      if (!aktif) return;
      const k = String(e.key).toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "+", "-", "=", "escape"].includes(k)) {
        if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
        keys.add(k);
        if (k === "escape") {
          if (placing) batalPenempatan();
          else if (moving) batalGeser();
          else { selectedId = ""; renderSelection(); }
        }
        if (k === "+" || k === "=") zoomKe(1.12);
        if (k === "-") zoomKe(0.9);
      }
    });
    window.addEventListener("keyup", (e) => {
      keys.delete(String(e.key).toLowerCase());
    });
    window.addEventListener("blur", () => keys.clear());
    const joy = $("island-joystick");
    const knob = $("island-joystick-knob");
    if (joy && knob) {
      let jid = null;
      const setJoy = (e) => {
        const rect = joy.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const jarak = Math.hypot(dx, dy);
        const maks = rect.width * 0.34;
        const nx = jarak > maks ? (dx / jarak) * maks : dx;
        const ny = jarak > maks ? (dy / jarak) * maks : dy;
        knob.style.transform = `translate(${nx}px, ${ny}px)`;
        stick.x = jarak > 6 ? clamp(nx / maks, -1, 1) : 0;
        stick.y = jarak > 6 ? clamp(ny / maks, -1, 1) : 0;
        stick.aktif = true;
      };
      joy.addEventListener("pointerdown", (e) => {
        jid = e.pointerId;
        joy.setPointerCapture(e.pointerId);
        setJoy(e);
      });
      joy.addEventListener("pointermove", (e) => {
        if (jid === e.pointerId) setJoy(e);
      });
      const stop = () => {
        jid = null;
        stick = { x: 0, y: 0, aktif: false };
        knob.style.transform = "translate(0,0)";
      };
      joy.addEventListener("pointerup", stop);
      joy.addEventListener("pointercancel", stop);
    }
    const visitHome = $("island-visit-home");
    if (visitHome) visitHome.addEventListener("click", pulang);
    document.addEventListener("visibilitychange", () => {
      if (!aktif) return;
      if (!document.hidden && mode === "own" && Date.now() - lastTick > 20000) tickSekarang();
    });
  }

  /* ================= AKSI UI ================= */
  function mulaiPenempatan(type) {
    if (mode !== "own") return;
    const info = infoObjek(type);
    if (!info) return;
    const kind = C.BUILDING_BY_ID[type] ? (type === "plot" ? "plot" : C.BUILDING_BY_ID[type].resep ? "factory" : "building") : "decor";
    const free = kind === "decor";
    placing = {
      type,
      rot: 0,
      pos: { x: player.x, y: player.y },
      valid: false,
      pratinjau: null,
    };
    if (!free) {
      placing.pos = { x: Math.round(player.x - (info.w || 1) / 2), y: Math.round(player.y - (info.h || 1) / 2) };
    }
    placing.pratinjau = window.IslandLocal.pratinjau(type, objects, placing.pos.x, placing.pos.y, "");
    placing.valid = placing.pratinjau.valid;
    moving = null;
    selectedId = "";
    tutupPanel();
    renderSelection();
    const hud = $("island-placement");
    if (hud) {
      hud.hidden = false;
      const nama = $("island-placement-name");
      if (nama) nama.textContent = `Menempatkan ${info.nama}`;
    }
    toast(`Tap area kosong untuk menempatkan ${info.nama}.`);
  }

  function batalPenempatan() {
    placing = null;
    const hud = $("island-placement");
    if (hud) hud.hidden = true;
  }

  function mulaiGeser() {
    const o = objekTerpilih();
    if (!o) return;
    if (o.kind === "natural") { toast("Pohon dan batu tidak bisa dipindah.", true); return; }
    moving = { id: o.id, pos: { x: o.x, y: o.y }, valid: true, pratinjau: null };
    const pusat = pusatObjek(o);
    moving.pos = { x: o.x, y: o.y };
    moving.pratinjau = window.IslandLocal.pratinjauGeser(o, objects, o.x, o.y);
    placing = null;
    tutupPanel();
    renderSelection();
    const hud = $("island-placement");
    if (hud) {
      hud.hidden = false;
      const nama = $("island-placement-name");
      if (nama) nama.textContent = `Memindahkan ${infoObjek(o.type).nama}`;
    }
    toast("Tap posisi baru untuk memindahkan.");
    void pusat;
  }

  function batalGeser() {
    moving = null;
    const hud = $("island-placement");
    if (hud) hud.hidden = true;
  }

  function pilihObjek(o) {
    selectedId = o ? o.id : "";
    renderSelection();
  }

  function fokusObjek(o) {
    const p = pusatObjek(o);
    const t = iso(p.x, p.y);
    cam.x = t.x;
    cam.y = t.y;
    batasKam();
    pilihObjek(o);
  }

  function pulang() {
    const dariKunjungan = mode === "visit";
    mode = "own";
    kunjungan = null;
    selectedId = "";
    placing = null;
    moving = null;
    batalPenempatan();
    batalGeser();
    const banner = $("island-visit-banner");
    if (banner) banner.hidden = true;
    const world = $("island-world");
    if (world) world.classList.remove("is-visit");
    pasangActionbar();
    perbaruiHud();
    renderSelection();
    resetPosisiPemain();
    toast("Kembali ke pulauku.");
    if (dariKunjungan) muatPulau();
  }

  function resetPosisiPemain() {
    driving = false;
    player = { x: 9.6, y: 10.4, dir: 1, jalan: 0 };
    if (!bisaLewat(player.x, player.y)) player = { x: 16, y: 10, dir: 1, jalan: 0 };
  }

  async function kunjungi(absen) {
    const target = Number(absen);
    const saya = pemilikNow();
    if (saya && target === Number(saya.absen)) { pulang(); return; }
    if (busy) return;
    busy = true;
    try {
      const r = await window.IslandLocal.call("visit", { absen: target });
      mode = "visit";
      kunjungan = { absen: r.absen, name: r.name, level: r.level, stats: r.stats };
      objects = r.objects;
      selectedId = "";
      placing = null;
      moving = null;
      batalPenempatan();
      batalGeser();
      tutupPanel();
      driving = false;
      const banner = $("island-visit-banner");
      const teks = $("island-visit-text");
      if (teks) teks.textContent = `Mengunjungi pulau ${r.name} · Lv ${r.level}`;
      if (banner) banner.hidden = false;
      perbaruiHud();
      pasangActionbar();
      renderSelection();
      toast(`Selamat datang di pulau ${r.name}.`);
    } catch (err) {
      toast(pesanGalat(err), true);
    } finally {
      busy = false;
    }
  }

  async function tickSekarang() {
    if (!aktif || mode !== "own" || busy) return;
    lastTick = Date.now();
    try {
      const r = await window.IslandLocal.call("tick", {});
      terapkanHasil(r);
    } catch (err) { /* diam, coba lagi nanti */ }
  }

  function mulaiTick() {
    if (ticker) clearInterval(ticker);
    lastTick = Date.now();
    ticker = setInterval(() => {
      if (!document.hidden) tickSekarang();
    }, 26000);
    if (uiTimer) clearInterval(uiTimer);
    uiTimer = setInterval(() => {
      if (!aktif) return;
      perbaruiHud();
      if (panel && panel.jenis === "market" && !marketMemuat) { /* data dimuat manual */ }
    }, 1000);
  }

  /* ================= PANEL ================= */
  function bukaPanel(jenis, opsi) {
    panel = { jenis, ...(opsi || {}) };
    const el = $("island-panel");
    const judul = $("island-panel-title");
    if (judul) judul.textContent = judulPanel(jenis);
    if (el) el.hidden = false;
    renderPanel();
    if (jenis === "market") muatMarket();
  }

  function judulPanel(jenis) {
    return {
      build: "Bangun Pulau",
      shop: "Toko NPC",
      inventory: "Tas & Gudang",
      workers: "Pekerja",
      factories: "Pabrik",
      vehicles: "Kendaraan",
      market: "Marketplace",
      players: "Daftar Pemain",
      camera: "Pengaturan Kamera",
    }[jenis] || "Pulau";
  }

  function tutupPanel() {
    panel = null;
    const el = $("island-panel");
    if (el) el.hidden = true;
  }

  function renderPanel() {
    if (!panel) return;
    const body = $("island-panel-body");
    if (!body) return;
    let html = "";
    if (panel.jenis === "build") html = panelBuild();
    else if (panel.jenis === "shop") html = panelShop();
    else if (panel.jenis === "inventory") html = panelInventory();
    else if (panel.jenis === "workers") html = panelWorkers();
    else if (panel.jenis === "factories") html = panelFactories();
    else if (panel.jenis === "vehicles") html = panelVehicles();
    else if (panel.jenis === "market") html = panelMarket();
    else if (panel.jenis === "players") html = panelPlayers();
    else if (panel.jenis === "camera") html = panelCamera();
    body.innerHTML = html;
  }

  function panelBuild() {
    if (!state) return "";
    const tab = panel.tab || "bangunan";
    const tabs = [
      ["bangunan", "Bangunan"],
      ["pabrik", "Pabrik"],
      ["lahan", "Lahan"],
      ["dekor", "Dekorasi"],
    ];
    let isi = "";
    if (tab === "dekor") {
      isi = `<div class="island-build-grid">${C.DECOR.map((d) => {
        const mampu = state.money >= d.harga;
        return `<button type="button" class="island-build-card ${mampu ? "" : "is-kurang"}" data-build="${d.id}">
          <span class="island-build-icon">${d.icon}</span>
          <span class="island-build-name">${esc(d.nama)}</span>
          <span class="island-build-meta">1×1 · ${fmt(d.harga)} 💰</span>
          <small>Bebas ditempatkan</small>
        </button>`;
      }).join("")}</div>`;
    } else {
      const jenis = tab === "pabrik" ? "resep" : tab === "lahan" ? "plot" : "bangunan";
      const list = C.BUILDINGS.filter((b) => {
        if (jenis === "plot") return b.id === "plot";
        if (jenis === "resep") return !!b.resep;
        return !b.resep && b.id !== "plot";
      });
      isi = `<div class="island-build-grid">${list.map((b) => {
        const starter = b.starter === true;
        const kunci = state.level < (b.levelReq || 1);
        const kurang = state.money < (b.harga || 0);
        const nonaktif = starter || kunci || kurang;
        const info = starter ? "Sudah ada di pulau" : kunci ? `🔒 Level ${b.levelReq}` : kurang ? "Uang belum cukup" : esc(b.deskripsi || "");
        return `<button type="button" class="island-build-card ${starter ? "is-ada" : ""} ${kunci ? "is-locked" : ""} ${kurang ? "is-kurang" : ""}" data-build="${b.id}" ${nonaktif ? "disabled" : ""}>
          <span class="island-build-icon">${b.icon}</span>
          <span class="island-build-name">${esc(b.nama)}</span>
          <span class="island-build-meta">${b.w}×${b.h} · ${starter ? "Gratis" : `${fmt(b.harga)} 💰`}</span>
          <small>${info}</small>
        </button>`;
      }).join("")}</div>`;
    }
    return `<div class="island-tabs">${tabs.map(([id, label]) => `<button type="button" class="${tab === id ? "is-active" : ""}" data-build-tab="${id}">${label}</button>`).join("")}</div>
      <p class="island-hint">Bangunan mengikuti grid. Dekorasi bebas ditempatkan. Tap objek untuk memilih lalu pindahkan atau putar.</p>
      ${isi}`;
  }

  function panelShop() {
    if (!state) return "";
    const tab = panel.tabBelanja || "beli";
    const daftar = C.RESOURCES.concat(C.BIBIT.map((b) => ({ ...b, nama: b.nama, icon: "🌱", kategori: "bibit", buy: b.buy, sell: b.sell })));
    const unik = [];
    const sudah = new Set();
    daftar.forEach((r) => { if (!sudah.has(r.id)) { sudah.add(r.id); unik.push(r); } });
    const rows = unik.map((r) => {
      const stok = invOf(r.id);
      const harga = tab === "beli" ? C.hargaBeli(r.id) : C.hargaJual(r.id);
      const bisa = tab === "beli" ? state.money >= harga : stok > 0;
      return `<div class="island-row ${bisa ? "" : "is-opacity"}">
        <span class="island-row-icon">${r.icon || "📦"}</span>
        <div class="island-row-main"><b>${esc(r.nama)}</b><small>${tab === "beli" ? "Stok " + stok : "Jual dari gudang · stok " + stok}</small></div>
        <span class="island-price">${fmt(harga)} 💰</span>
        <input class="island-qty" type="number" inputmode="numeric" min="1" max="999" value="1" data-qty="${r.id}">
        <button type="button" class="island-btn-small" data-shop-${tab}="${r.id}">${tab === "beli" ? "Beli" : "Jual"}</button>
      </div>`;
    }).join("");
    return `<div class="island-tabs">
        <button type="button" class="${tab === "beli" ? "is-active" : ""}" data-shop-tab="beli">Beli</button>
        <button type="button" class="${tab === "jual" ? "is-active" : ""}" data-shop-tab="jual">Jual</button>
      </div>
      <div class="island-money-line">Uang <b>${fmt(state.money)}</b> · Gudang <b>${fmt(totalBarang())}/${fmt(kapasitasGudang())}</b></div>
      ${rows}`;
  }

  function panelInventory() {
    if (!state) return "";
    const ids = Object.keys(state.inventory).filter((id) => invOf(id) > 0);
    const rows = ids.length ? ids.map((id) => {
      const r = C.RESOURCE_BY_ID[id];
      if (!r) return "";
      const qty = invOf(id);
      const konsumsi = r.hunger || r.thirst;
      return `<div class="island-row">
        <span class="island-row-icon">${r.icon || "📦"}</span>
        <div class="island-row-main"><b>${esc(r.nama)}</b><small>${qty} buah · nilai ${fmt(C.hargaJual(id))} / buah</small>
          ${konsumsi ? `<small>${r.hunger ? `🍖 +${r.hunger} kenyang ` : ""}${r.thirst ? `💧 +${r.thirst} segar` : ""}</small>` : ""}
        </div>
        ${konsumsi ? `<button type="button" class="island-btn-small" data-consume="${id}">Pakai</button>` : ""}
        <button type="button" class="island-btn-small" data-quick-sell="${id}">Jual 1</button>
      </div>`;
    }).join("") : `<p class="island-empty">Gudang masih kosong. Tebang pohon, tambang batu, atau panen tanaman.</p>`;
    const pct = clamp((totalBarang() / Math.max(1, kapasitasGudang())) * 100, 0, 100);
    return `<div class="island-money-line">Gudang <b>${fmt(totalBarang())}/${fmt(kapasitasGudang())}</b></div>
      <div class="island-progress"><i style="width:${pct}%"></i></div>
      <p class="island-hint">Makan/minum lewat tombol Pakai. Kapasitas naik dengan meng-upgrade gudang.</p>
      ${rows}`;
  }

  function panelWorkers() {
    if (!state) return "";
    const batas = batasPekerja();
    const daftar = state.workers.length ? state.workers.map((w) => {
      const up = w.level >= C.WORKER.maxLevel ? null : { money: C.WORKER.upgradeMoney * w.level, plank: C.WORKER.upgradePlank * w.level };
      return `<div class="island-card">
        <div class="island-card-head"><b>🧑‍🌾 ${esc(w.name)}</b><span class="island-badge">Lv ${w.level}</span></div>
        <small>Kayu terkumpul: ${fmt(w.totalWood)} · Upah dibayar: ${fmt(w.wagesPaid)}</small>
        ${w.unpaid ? `<p class="island-warn">Gaji tertunggak ${fmt(w.debt)}. Pekerja berhenti sampai dibayar.</p>` : `<p class="island-ok">Bekerja otomatis setiap ${Math.round(C.WORKER.cycleMs / 60000)} menit.</p>`}
        <div class="island-actions">
          ${w.unpaid ? `<button type="button" class="island-btn-small" data-worker-pay="${w.id}">Bayar ${fmt(w.debt)}</button>` : ""}
          ${up ? `<button type="button" class="island-btn-small" data-worker-upgrade="${w.id}">Latih · ${fmt(up.money)}💰 ${up.plank}🪚</button>` : `<span class="island-badge">Level maks</span>`}
          <button type="button" class="island-btn-small is-danger" data-worker-fire="${w.id}">Berhentikan</button>
        </div>
      </div>`;
    }).join("") : `<p class="island-empty">Belum ada pekerja. Rekrut Lumberjack agar kayu terkumpul otomatis.</p>`;
    const adaUtang = state.workers.some((w) => w.unpaid);
    return `<div class="island-money-line">Slot pekerja <b>${state.workers.length}/${batas}</b> · Uang <b>${fmt(state.money)}</b></div>
      <div class="island-inline-form">
        <input id="island-worker-name" maxlength="20" placeholder="Nama pekerja baru">
        <button type="button" class="island-btn" data-worker-hire>Rekrut · ${fmt(C.WORKER.harga)} 💰</button>
      </div>
      ${adaUtang ? `<button type="button" class="island-btn is-danger" data-worker-payall>Bayar semua gaji tertunggak</button>` : ""}
      <p class="island-hint">Pekerja menebang pohon dan menyimpan kayu ke gudang. Gaji dipotong per siklus; kalau uang habis, pekerja berhenti sementara.</p>
      ${daftar}`;
  }

  function panelFactories() {
    if (!state) return "";
    const list = objects.filter((o) => o.kind === "factory");
    if (!list.length) {
      return `<p class="island-empty">Belum ada pabrik. Bangun Pabrik Kayu di menu Bangun (level 2) untuk mengolah kayu menjadi papan.</p>`;
    }
    return list.map((o) => {
      const info = C.BUILDING_BY_ID[o.type];
      const dur = C.durasiPabrik(o.type, o.level);
      const sisa = o.batchStartAt > 0 ? Math.max(0, o.batchStartAt + dur - Date.now()) : 0;
      const bahan = Object.keys(info.resep.inputs).map((id) => `${C.RESOURCE_BY_ID[id].icon}${info.resep.inputs[id]}`).join(" + ") || "Tanpa bahan";
      const out = C.RESOURCE_BY_ID[info.resep.output.id];
      const up = C.biayaUpgrade(o.type, o.level);
      return `<div class="island-card">
        <div class="island-card-head"><b>${info.icon} ${esc(info.nama)}</b><span class="island-badge">Lv ${o.level}</span></div>
        <small>${bahan} → ${out.icon} ${C.hasilPabrik(o.type, o.level)} · ${durasi(dur)} · biaya ${fmt(C.biayaOperasional(o.type, o.level))}</small>
        <div class="island-progress"><i style="width:${o.batchStartAt > 0 ? clamp(100 - (sisa / dur) * 100, 0, 100) : 0}%"></i></div>
        <small>${o.batchStartAt > 0 ? `Berproduksi · sisa ${durasi(sisa)}` : o.batches > 0 ? `Siap diambil: ${o.batches} batch` : "Menganggur"} · Otomatis: ${o.auto ? "ya" : "tidak"}</small>
        <div class="island-actions">
          ${o.batchStartAt === 0 ? `<button type="button" class="island-btn-small" data-factory-start="${o.id}">Produksi</button>` : ""}
          ${o.batches > 0 ? `<button type="button" class="island-btn-small" data-factory-collect="${o.id}">Ambil ${o.batches * C.hasilPabrik(o.type, o.level)}</button>` : ""}
          <button type="button" class="island-btn-small" data-factory-auto="${o.id}" data-value="${o.auto ? "0" : "1"}">${o.auto ? "Matikan otomatis" : "Nyalakan otomatis"}</button>
          ${up ? `<button type="button" class="island-btn-small" data-upgrade="${o.id}">Upgrade · ${fmt(up.money)}💰</button>` : ""}
          <button type="button" class="island-btn-small" data-focus="${o.id}">Lihat</button>
        </div>
      </div>`;
    }).join("");
  }

  function panelVehicles() {
    if (!state) return "";
    const aktifKendaraan = kendaraanAktif();
    const katalog = C.VEHICLES.map((v) => {
      const punya = state.vehicles.some((x) => x.type === v.id);
      const kunci = state.level < v.levelReq;
      const aktif = aktifKendaraan && aktifKendaraan.type === v.id;
      return `<div class="island-card">
        <div class="island-card-head"><b>${v.icon} ${esc(v.nama)}</b><span class="island-badge">${v.speed.toFixed(1)}x</span></div>
        <small>Harga ${fmt(v.harga)} 💰 · kecepatan ${v.speed.toFixed(1)} · ${kunci ? `terbuka level ${v.levelReq}` : "siap dipakai"}</small>
        <div class="island-actions">
          ${punya
            ? `<button type="button" class="island-btn-small" data-vehicle-use="${v.id}">${aktif ? "Sedang dipakai" : "Pakai"}</button>`
            : `<button type="button" class="island-btn-small" data-vehicle-buy="${v.id}" ${kunci ? "disabled" : ""}>Beli</button>`}
        </div>
      </div>`;
    }).join("");
    return `<div class="island-money-line">Kendaraan <b>${state.vehicles.length}/${6}</b> · ${aktifKendaraan ? `Aktif: ${esc(C.VEHICLE_BY_ID[aktifKendaraan.type].nama)}` : "Belum memakai kendaraan"}</div>
      <p class="island-hint">Setelah memakai kendaraan, gunakan joystick / WASD untuk menyetir. Kamera mengikuti otomatis.</p>
      <div class="island-actions">
        ${aktifKendaraan ? `<button type="button" class="island-btn-small is-danger" data-vehicle-exit>Turun dari kendaraan</button>` : ""}
      </div>
      ${katalog}`;
  }

  function panelMarket() {
    if (!state) return "";
    const items = Object.keys(state.inventory).filter((id) => invOf(id) > 0);
    const opsi = items.length ? items.map((id) => {
      const r = C.RESOURCE_BY_ID[id];
      return `<option value="${id}">${r.icon} ${esc(r.nama)} (${invOf(id)})</option>`;
    }).join("") : `<option value="">Gudang kosong</option>`;
    const tawar = panel.offers;
    let daftar = `<p class="island-empty">Memuat tawaran…</p>`;
    if (Array.isArray(tawar)) {
      daftar = tawar.length ? tawar.map((o) => {
        const r = C.RESOURCE_BY_ID[o.itemId];
        const total = o.qty * o.price;
        const bisa = !o.mine && state.money >= total;
        return `<div class="island-offer">
          <div class="island-offer-main"><b>${r ? r.icon : "📦"} ${esc(r ? r.nama : o.itemId)} ×${o.qty}</b><small>dari ${esc(o.sellerName)} · ${fmt(o.price)} / buah</small></div>
          <div class="island-offer-side"><b>${fmt(total)} 💰</b>
            ${o.mine
              ? `<button type="button" class="island-btn-small" data-market-cancel="${o.id}">Tarik</button>`
              : `<button type="button" class="island-btn-small" data-market-buy="${o.id}" ${bisa ? "" : "disabled"}>Beli</button>`}
          </div>
        </div>`;
      }).join("") : `<p class="island-empty">Belum ada tawaran. Jadilah yang pertama berjualan.</p>`;
    }
    return `<div class="island-money-line">Uangmu <b>${fmt(state.money)}</b> · Maksimal ${C.ECONOMY.marketMaxOffer} tawaran aktif</div>
      <div class="island-card">
        <div class="island-card-head"><b>Pasang tawaran</b><span class="island-badge">${state.requests ? "" : ""}</span></div>
        <label class="island-field">Barang <select id="island-market-item">${opsi}</select></label>
        <div class="island-inline-form">
          <label class="island-field">Jumlah <input id="island-market-qty" type="number" min="1" max="${C.ECONOMY.marketMaxQty}" value="1"></label>
          <label class="island-field">Harga / buah <input id="island-market-price" type="number" min="1" max="${C.ECONOMY.marketMaxPrice}" value="20"></label>
          <button type="button" class="island-btn" data-market-create>Pasang</button>
        </div>
      </div>
      <div class="island-subhead">Tawaran pemain</div>
      <button type="button" class="island-btn-small" data-market-refresh>Segarkan</button>
      ${daftar}`;
  }

  function panelPlayers() {
    let daftar = [];
    try {
      daftar = (typeof dataSiswa !== "undefined" && Array.isArray(dataSiswa) && dataSiswa) || (Array.isArray(window.dataSiswa) && window.dataSiswa) || [];
    } catch (err) { daftar = []; }
    const saya = pemilikNow();
    const rows = daftar.map((s) => {
      const absen = Number(s.absen);
      const nama = s.namaPanggilan || s.nama || `Siswa ${absen}`;
      const sendiri = saya && Number(saya.absen) === absen;
      return `<div class="island-player-row" data-player-name="${esc(String(nama).toLowerCase())}" data-player-absen="${absen}">
        <span class="island-avatar">${esc(String(nama).charAt(0).toUpperCase())}</span>
        <div class="island-row-main"><b>${esc(nama)}</b><small>Absen ${absen}${sendiri ? " · pulauku" : ""}</small></div>
        <button type="button" class="island-btn-small" data-visit="${absen}">${sendiri ? "Pulang" : "Kunjungi"}</button>
      </div>`;
    }).join("");
    const tanpaData = !daftar.length;
    return `<label class="island-field">Cari pemain <input id="island-player-search" placeholder="Nama atau absen"></label>
      ${tanpaData ? `<div class="island-inline-form"><input id="island-visit-manual" type="number" min="1" max="64" placeholder="Nomor absen 1-64"><button type="button" class="island-btn" data-visit-manual>Kunjungi</button></div>` : ""}
      <p class="island-hint">Saat berkunjung kamu hanya bisa melihat. Pulau tetap milik pemiliknya.</p>
      <div id="island-player-list">${rows || ""}</div>`;
  }

  function panelCamera() {
    return `<div class="island-camera-grid">
        <button type="button" class="island-btn" data-cam="in">Zoom +</button>
        <button type="button" class="island-btn" data-cam="out">Zoom −</button>
        <button type="button" class="island-btn" data-cam="home">Ke rumah</button>
        <button type="button" class="island-btn" data-cam="reset">Reset kamera</button>
      </div>
      <p class="island-hint">Geser layar untuk memindah kamera. Cubit dua jari atau scroll untuk zoom. WASD / joystick untuk berjalan; panah untuk menggeser kamera.</p>`;
  }

  async function muatMarket() {
    if (marketMemuat) return;
    marketMemuat = true;
    try {
      const r = await window.IslandLocal.call("marketList", {});
      if (panel && panel.jenis === "market") {
        panel.offers = r.offers || [];
        renderPanel();
      }
    } catch (err) {
      if (panel && panel.jenis === "market") {
        panel.offers = [];
        renderPanel();
      }
      toast(pesanGalat(err), true);
    } finally {
      marketMemuat = false;
    }
  }

  /* ================= SELECTION ================= */
  function renderSelection() {
    const el = $("island-selection");
    if (!el) return;
    const o = objekTerpilih();
    if (!o) { el.hidden = true; el.innerHTML = ""; return; }
    const info = infoObjek(o.type);
    if (!info) { el.hidden = true; return; }
    el.hidden = false;
    const bagian = [];
    bagian.push(`<div class="island-sel-head">
      <span class="island-sel-icon">${info.icon}</span>
      <div class="island-sel-title"><b>${esc(info.nama)}</b><small>${labelJenis(o)}${o.level > 1 ? ` · Lv ${o.level}` : ""}</small></div>
      <button type="button" class="island-sel-close" data-sel="close">✕</button>
    </div>`);
    let isi = "";
    if (o.kind === "natural") {
      isi = infoNatural(o);
    } else if (o.kind === "plot") {
      isi = infoLahan(o);
    } else if (o.kind === "factory") {
      isi = infoPabrik(o);
    } else if (o.kind === "building") {
      isi = infoBangunan(o);
    } else {
      isi = infoDekor(o);
    }
    if (mode === "visit") {
      isi = `<p class="island-sel-desc">${esc(info.deskripsi || "Milik pemilik pulau. Pengunjung hanya bisa melihat.")}</p>`;
    }
    bagian.push(isi);
    el.innerHTML = bagian.join("");
    void o;
  }

  function labelJenis(o) {
    return { natural: "Sumber daya", decor: "Dekorasi", plot: "Lahan tanam", factory: "Pabrik", building: "Bangunan" }[o.kind] || "Objek";
  }

  function infoNatural(o) {
    const info = C.NATURAL_BY_ID[o.type];
    const hidup = o.respawnAt <= Date.now();
    if (!hidup) {
      return `<p class="island-sel-desc">Sedang tumbuh kembali · ${durasi(o.respawnAt - Date.now())} lagi.</p>`;
    }
    return `<p class="island-sel-desc">${o.type === "pohon" ? "Tebang untuk mendapatkan kayu. Pohon akan tumbuh lagi." : "Tambang untuk mendapatkan batu. Batu akan muncul lagi."}</p>
      <div class="island-sel-meta">Kekuatan ${o.hp} kali · hasil ${info.perHit} ${C.RESOURCE_BY_ID[info.yieldId].icon}</div>
      <button type="button" class="island-btn" data-sel="${o.type === "pohon" ? "chop" : "mine"}">${o.type === "pohon" ? "🪓 Tebang" : "⛏️ Tambang"}</button>`;
  }

  function infoLahan(o) {
    if (!o.crop) {
      const crops = C.CROPS.filter((c) => C.tanamanTersedia(c.id, state ? state.level : 1));
      const tombol = crops.map((c) => {
        const stok = invOf(c.seedId);
        return `<button type="button" class="island-btn-small" data-sel="plant" data-crop="${c.id}" ${stok > 0 ? "" : "disabled"}>${c.icon} ${esc(c.nama)} · bibit ${stok}</button>`;
      }).join("");
      return `<p class="island-sel-desc">Lahan kosong. Pilih bibit untuk ditanam (tetap tumbuh saat offline).</p>
        <div class="island-actions">${tombol || `<span class="island-badge">Belum ada bibit. Beli di Toko.</span>`}</div>`;
    }
    const crop = C.CROP_BY_ID[o.crop];
    const total = Math.max(1, o.readyAt - o.plantedAt);
    const sisa = Math.max(0, o.readyAt - Date.now());
    const pct = clamp(((Date.now() - o.plantedAt) / total) * 100, 0, 100);
    return `<p class="island-sel-desc">${esc(crop.nama)} · ${sisa > 0 ? `matang dalam ${durasi(sisa)}` : "siap dipanen"}</p>
      <div class="island-progress"><i style="width:${pct}%"></i></div>
      <div class="island-sel-meta">Hasil ${crop.yieldQty} ${C.RESOURCE_BY_ID[crop.yieldId].icon}</div>
      ${sisa <= 0 ? `<button type="button" class="island-btn" data-sel="harvest">🌾 Panen</button>` : ""}`;
  }

  function infoPabrik(o) {
    const info = C.BUILDING_BY_ID[o.type];
    const dur = C.durasiPabrik(o.type, o.level);
    const sisa = o.batchStartAt > 0 ? Math.max(0, o.batchStartAt + dur - Date.now()) : 0;
    const pct = o.batchStartAt > 0 ? clamp(100 - (sisa / dur) * 100, 0, 100) : 0;
    const up = C.biayaUpgrade(o.type, o.level);
    const bahan = Object.keys(info.resep.inputs).map((id) => `${C.RESOURCE_BY_ID[id].icon}${info.resep.inputs[id]}`).join(" + ") || "tanpa bahan";
    const hasilId = info.resep.output.id;
    return `<p class="island-sel-desc">${esc(info.deskripsi || "")}</p>
      <div class="island-sel-meta">${bahan} → ${C.RESOURCE_BY_ID[hasilId].icon} ${C.hasilPabrik(o.type, o.level)} · biaya ${fmt(C.biayaOperasional(o.type, o.level))}</div>
      <div class="island-progress"><i style="width:${pct}%"></i></div>
      <div class="island-sel-meta">${o.batchStartAt > 0 ? `Berproduksi, sisa ${durasi(sisa)}` : o.batches > 0 ? `${o.batches} batch siap diambil` : "Menganggur"} · otomatis ${o.auto ? "aktif" : "mati"}</div>
      <div class="island-actions">
        ${o.batchStartAt === 0 ? `<button type="button" class="island-btn-small" data-sel="factory-start">Produksi</button>` : ""}
        ${o.batches > 0 ? `<button type="button" class="island-btn" data-sel="factory-collect">Ambil hasil</button>` : ""}
        <button type="button" class="island-btn-small" data-sel="factory-auto" data-value="${o.auto ? "0" : "1"}">${o.auto ? "Matikan otomatis" : "Produksi otomatis"}</button>
        ${up ? `<button type="button" class="island-btn-small" data-sel="upgrade">Upgrade ${fmt(up.money)}💰</button>` : ""}
        <button type="button" class="island-btn-small" data-sel="move">Pindah</button>
        <button type="button" class="island-btn-small is-danger" data-sel="remove">Hapus</button>
      </div>`;
  }

  function infoBangunan(o) {
    const info = C.BUILDING_BY_ID[o.type];
    const up = C.biayaUpgrade(o.type, o.level);
    const bagian = [];
    bagian.push(`<p class="island-sel-desc">${esc(info.deskripsi || "")}</p>`);
    if (o.type === "gudang") {
      bagian.push(`<div class="island-sel-meta">Kapasitas gudang: ${fmt(kapasitasGudang())}</div>`);
    }
    if (o.type === "pondok") {
      bagian.push(`<div class="island-sel-meta">Slot pekerja: ${batasPekerja()}</div>`);
    }
    if (o.type === "rumah") {
      bagian.push(`<div class="island-sel-meta">Kebutuhan turun ${Math.round(C.kebutuhanTurun(o.level) * 100)}% dari normal.</div>`);
    }
    const tombol = [];
    if (up) tombol.push(`<button type="button" class="island-btn" data-sel="upgrade">Upgrade · ${fmt(up.money)}💰 ${up.plank}🪚 ${up.cement}🧱</button>`);
    else tombol.push(`<span class="island-badge">Level maksimal</span>`);
    tombol.push(`<button type="button" class="island-btn-small" data-sel="move">Pindah</button>`);
    if (o.type === "rumah" || o.type === "gudang") {
      tombol.push(`<span class="island-badge">Bangunan utama</span>`);
    } else {
      tombol.push(`<button type="button" class="island-btn-small is-danger" data-sel="remove">Hapus</button>`);
    }
    bagian.push(`<div class="island-actions">${tombol.join("")}</div>`);
    return bagian.join("");
  }

  function infoDekor(o) {
    const info = C.DECOR_BY_ID[o.type];
    return `<p class="island-sel-desc">${esc(info.nama)} untuk mempercantik pulau.</p>
      <div class="island-actions">
        <button type="button" class="island-btn-small" data-sel="rotate">Putar</button>
        <button type="button" class="island-btn-small" data-sel="move">Pindah</button>
        <button type="button" class="island-btn-small is-danger" data-sel="remove">Hapus</button>
      </div>`;
  }

  /* ================= ACTION BAR ================= */
  function pasangActionbar() {
    const bar = $("island-actionbar");
    if (!bar) return;
    if (mode === "visit") {
      bar.innerHTML = `<button type="button" class="island-tool" data-island-tool="home"><span>🏝️</span><small>Pulauku</small></button>`;
      return;
    }
    if (driving) {
      bar.innerHTML = `<button type="button" class="island-tool is-accent" data-island-tool="exit-vehicle"><span>🛑</span><small>Turun</small></button>
        <button type="button" class="island-tool" data-island-tool="vehicles"><span>🚗</span><small>Kendaraan</small></button>
        <button type="button" class="island-tool" data-island-tool="camera"><span>🎥</span><small>Kamera</small></button>`;
      return;
    }
    bar.innerHTML = TOOLS.map((t) => `<button type="button" class="island-tool" data-island-tool="${t.id}"><span>${t.icon}</span><small>${t.label}</small></button>`).join("");
  }

  function toolKlik(id) {
    if (id === "home") { pulang(); return; }
    if (id === "exit-vehicle") { pakaiKendaraan(""); return; }
    if (id === "retry") { muatPulau(); return; }
    bukaPanel(id);
  }

  async function pakaiKendaraan(vehicleId) {
    if (mode !== "own" || !state) return;
    if (!vehicleId) {
      const r = await jalankan("setVehicle", { vehicleId: "" }, { panel: false });
      if (r) {
        driving = false;
        pasangActionbar();
        toast("Kamu turun dari kendaraan.");
      }
      return;
    }
    const milik = state.vehicles.find((v) => v.id === vehicleId);
    if (!milik) {
      const info = C.VEHICLE_BY_ID[vehicleId];
      if (!info) return;
      const r = await jalankan("buyVehicle", { type: vehicleId }, { panel: false });
      if (r && r.vehicle) {
        driving = true;
        pasangActionbar();
        toast(`${info.nama} siap dikendarai. Gunakan joystick / WASD.`);
      }
      return;
    }
    const r = await jalankan("setVehicle", { vehicleId }, { panel: false });
    if (r) {
      driving = true;
      pasangActionbar();
      tutupPanel();
      toast("Mulai menyetir. Kamera mengikuti.")
    }
  }

  /* ================= KLIK GLOBAL ================= */
  function pasangKlik() {
    if (klikSiap) return;
    klikSiap = true;
    const root = $("island-app");
    if (!root) { klikSiap = false; return; }
    root.addEventListener("click", (e) => {
      const t = e.target.closest("[data-island-tool]");
      if (t) { toolKlik(t.dataset.islandTool); return; }
      const close = e.target.closest("[data-close-panel]");
      if (close) { tutupPanel(); return; }
      const buildTab = e.target.closest("[data-build-tab]");
      if (buildTab) { if (panel) { panel.tab = buildTab.dataset.buildTab; renderPanel(); } return; }
      const build = e.target.closest("[data-build]");
      if (build && !build.disabled) { mulaiPenempatan(build.dataset.build); return; }
      const shopTab = e.target.closest("[data-shop-tab]");
      if (shopTab) { if (panel) { panel.tabBelanja = shopTab.dataset.shopTab; renderPanel(); } return; }
      const shopBuy = e.target.closest("[data-shop-beli]");
      const shopSell = e.target.closest("[data-shop-jual]");
      if (shopBuy || shopSell) {
        const id = (shopBuy || shopSell).dataset[shopBuy ? "shopBeli" : "shopJual"];
        const input = root.querySelector(`[data-qty="${id}"]`);
        const qty = input ? Math.max(1, Math.floor(Number(input.value) || 1)) : 1;
        jalankan(shopBuy ? "buy" : "sell", { itemId: id, qty });
        return;
      }
      const qtyBtn = e.target.closest("[data-qty-step]");
      if (qtyBtn) {
        const input = qtyBtn.parentElement.querySelector("input");
        if (input) input.value = Math.max(1, (Number(input.value) || 1) + Number(qtyBtn.dataset.qtyStep));
        return;
      }
      const consume = e.target.closest("[data-consume]");
      if (consume) { jalankan("consume", { itemId: consume.dataset.consume }); return; }
      const quickSell = e.target.closest("[data-quick-sell]");
      if (quickSell) { jalankan("sell", { itemId: quickSell.dataset.quickSell, qty: 1 }); return; }
      const hire = e.target.closest("[data-worker-hire]");
      if (hire) {
        const input = $("island-worker-name");
        jalankan("hireWorker", { name: input ? input.value.trim() : "" });
        return;
      }
      const pay = e.target.closest("[data-worker-pay]");
      if (pay) { jalankan("payWorker", { workerId: pay.dataset.workerPay }); return; }
      const payall = e.target.closest("[data-worker-payall]");
      if (payall) { jalankan("payAllWages", {}); return; }
      const upgradeW = e.target.closest("[data-worker-upgrade]");
      if (upgradeW) { jalankan("upgradeWorker", { workerId: upgradeW.dataset.workerUpgrade }); return; }
      const fire = e.target.closest("[data-worker-fire]");
      if (fire) {
        if (window.confirm("Berhentikan pekerja ini?")) jalankan("fireWorker", { workerId: fire.dataset.workerFire });
        return;
      }
      const fStart = e.target.closest("[data-factory-start]");
      if (fStart) { jalankan("startFactory", { id: fStart.dataset.factoryStart }); return; }
      const fCollect = e.target.closest("[data-factory-collect]");
      if (fCollect) { jalankan("collectFactory", { id: fCollect.dataset.factoryCollect }); return; }
      const fAuto = e.target.closest("[data-factory-auto]");
      if (fAuto) { jalankan("factoryAuto", { id: fAuto.dataset.factoryAuto, auto: fAuto.dataset.value === "1" }); return; }
      const upgrade = e.target.closest("[data-upgrade]");
      if (upgrade) { jalankan("upgradeBuilding", { id: upgrade.dataset.upgrade }); return; }
      const focus = e.target.closest("[data-focus]");
      if (focus) {
        const o = objects.find((x) => x.id === focus.dataset.focus);
        if (o) { fokusObjek(o); tutupPanel(); }
        return;
      }
      const vBuy = e.target.closest("[data-vehicle-buy]");
      if (vBuy) { pakaiKendaraan(vBuy.dataset.vehicleBuy); return; }
      const vUse = e.target.closest("[data-vehicle-use]");
      if (vUse) {
        const kendaraan = state && state.vehicles.find((v) => v.type === vUse.dataset.vehicleUse);
        if (kendaraan) pakaiKendaraan(kendaraan.id);
        return;
      }
      const vExit = e.target.closest("[data-vehicle-exit]");
      if (vExit) { pakaiKendaraan(""); return; }
      const mCreate = e.target.closest("[data-market-create]");
      if (mCreate) {
        const item = $("island-market-item");
        const qty = $("island-market-qty");
        const price = $("island-market-price");
        if (!item || !item.value) { toast("Pilih barang dulu.", true); return; }
        jalankan("marketCreate", {
          itemId: item.value,
          qty: Math.max(1, Math.floor(Number(qty && qty.value) || 1)),
          price: Math.max(1, Math.floor(Number(price && price.value) || 1)),
        });
        return;
      }
      const mBuy = e.target.closest("[data-market-buy]");
      if (mBuy) { jalankan("marketBuy", { offerId: mBuy.dataset.marketBuy }); return; }
      const mCancel = e.target.closest("[data-market-cancel]");
      if (mCancel) { jalankan("marketCancel", { offerId: mCancel.dataset.marketCancel }); return; }
      const mRefresh = e.target.closest("[data-market-refresh]");
      if (mRefresh) { muatMarket(); return; }
      const visit = e.target.closest("[data-visit]");
      if (visit) { kunjungi(Number(visit.dataset.visit)); return; }
      const visitManual = e.target.closest("[data-visit-manual]");
      if (visitManual) {
        const input = $("island-visit-manual");
        const n = input ? Number(input.value) : 0;
        if (!Number.isInteger(n) || n < 1 || n > 64) { toast("Nomor absen 1 sampai 64.", true); return; }
        kunjungi(n);
        return;
      }
      const camBtn = e.target.closest("[data-cam]");
      if (camBtn) {
        const aksi = camBtn.dataset.cam;
        if (aksi === "in") zoomKe(1.2);
        else if (aksi === "out") zoomKe(0.84);
        else if (aksi === "reset") resetKamera();
        else if (aksi === "home") {
          const rumah = objects.find((o) => o.type === "rumah");
          if (rumah) fokusObjek(rumah);
        }
        return;
      }
      const sel = e.target.closest("[data-sel]");
      if (sel) { aksiSeleksi(sel.dataset.sel, sel.dataset); return; }
      const placeRot = e.target.closest("[data-place-rotate]");
      if (placeRot) { if (placing) placing.rot = (placing.rot + 1) % 4; return; }
      const placeCancel = e.target.closest("[data-place-cancel]");
      if (placeCancel) { batalPenempatan(); batalGeser(); return; }
    });
    root.addEventListener("input", (e) => {
      if (e.target && e.target.id === "island-player-search") {
        const q = String(e.target.value || "").toLowerCase();
        root.querySelectorAll("[data-player-name]").forEach((row) => {
          const teks = `${row.dataset.playerName} ${row.dataset.playerAbsen}`;
          row.style.display = teks.indexOf(q) >= 0 ? "" : "none";
        });
      }
    });
  }

  async function aksiSeleksi(aksi, data) {
    const o = objekTerpilih();
    if (!o) return;
    if (aksi === "close") { selectedId = ""; renderSelection(); return; }
    if (aksi === "chop") { await jalankan("chop", { id: o.id }, { panel: false }); return; }
    if (aksi === "mine") { await jalankan("mine", { id: o.id }, { panel: false }); return; }
    if (aksi === "harvest") { await jalankan("harvest", { id: o.id }, { panel: false }); return; }
    if (aksi === "plant") { await jalankan("plant", { id: o.id, crop: data.crop }, { panel: false }); return; }
    if (aksi === "factory-start") { await jalankan("startFactory", { id: o.id }, { panel: false }); return; }
    if (aksi === "factory-collect") { await jalankan("collectFactory", { id: o.id }, { panel: false }); return; }
    if (aksi === "factory-auto") { await jalankan("factoryAuto", { id: o.id, auto: data.value === "1" }, { panel: false }); return; }
    if (aksi === "upgrade") { await jalankan("upgradeBuilding", { id: o.id }, { panel: false }); return; }
    if (aksi === "rotate") { await jalankan("rotate", { id: o.id }, { panel: false }); return; }
    if (aksi === "move") { mulaiGeser(); return; }
    if (aksi === "remove") {
      if (!window.confirm("Hapus objek ini?")) return;
      await jalankan("remove", { id: o.id }, { panel: false });
      return;
    }
  }

  /* ================= LOAD ================= */
  function tampilkanLoading(pesan) {
    const load = $("island-loading");
    const world = $("island-world");
    if (load) { load.hidden = false; load.innerHTML = `<span class="island-spinner"></span><p>${esc(pesan)}</p>`; }
    if (world) world.hidden = true;
  }

  function tampilkanGalat(err) {
    const load = $("island-loading");
    if (!load) return;
    load.hidden = false;
    load.innerHTML = `<div class="island-error"><b>Pulau belum bisa dibuka</b><p>${esc(pesanGalat(err))}</p><button type="button" class="island-btn" data-island-tool="retry">Coba lagi</button></div>`;
  }

  async function muatPulau() {
    if (!C || !window.IslandLocal) {
      tampilkanGalat({ message: "File game belum termuat. Refresh halaman." });
      return;
    }
    const user = pemilikNow();
    if (!user || !user.absen) {
      tampilkanGalat({ code: "unauthenticated" });
      return;
    }
    tampilkanLoading("Menyiapkan pulau…");
    try {
      const r = await window.IslandLocal.call("ensure", { requestId: reqId() });
      state = r.state;
      objects = r.objects || [];
      mode = "own";
      kunjungan = null;
      if (!camSiap) resetKamera();
      resetPosisiPemain();
      simpanRingkas();
      const load = $("island-loading");
      const world = $("island-world");
      if (load) load.hidden = true;
      if (world) {
        world.hidden = false;
        world.classList.remove("is-visit");
      }
      const banner = $("island-visit-banner");
      if (banner) banner.hidden = true;
      siap = true;
      ukurCanvas();
      perbaruiHud();
      pasangActionbar();
      renderSelection();
      mulaiLoop();
      mulaiTick();
      bacaPalet();
    } catch (err) {
      siap = false;
      tampilkanGalat(err);
    }
  }

  /* ================= LIFECYCLE ================= */
  function buka() {
    if (aktif) return;
    aktif = true;
    busy = false;
    selectedId = "";
    placing = null;
    moving = null;
    panel = null;
    particles = [];
    canvas = $("island-canvas");
    if (canvas) ctx = canvas.getContext("2d");
    bacaPalet();
    ukurCanvas();
    pasangInput();
    pasangKlik();
    try {
      const obs = new MutationObserver(() => {
        if (!aktif) return;
        bacaPalet();
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    } catch (err) { /* browser lama */ }
    muatPulau();
  }

  function tutup() {
    if (!aktif) return;
    aktif = false;
    siap = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (ticker) clearInterval(ticker);
    ticker = null;
    if (uiTimer) clearInterval(uiTimer);
    uiTimer = null;
    clearTimeout(toastTimer);
    tutupPanel();
    batalPenempatan();
    batalGeser();
    keys.clear();
    pointerMap.clear();
    drag = null;
    pinch = null;
    stick = { x: 0, y: 0, aktif: false };
    const toastEl = $("island-toast");
    if (toastEl) { toastEl.hidden = true; toastEl.classList.remove("is-show"); }
  }

  function akunBerubah() {
    if (!aktif) return;
    state = null;
    objects = [];
    kunjungan = null;
    mode = "own";
    driving = false;
    selectedId = "";
    placing = null;
    moving = null;
    batalPenempatan();
    batalGeser();
    tutupPanel();
    camSiap = false;
    muatPulau();
  }

  function ringkas() {
    if (!state) {
      try {
        const raw = JSON.parse(localStorage.getItem(RINGKAS_KEY) || "null");
        const user = pemilikNow();
        if (raw && user && Number(raw.absen) === Number(user.absen)) return raw;
      } catch (err) { return null; }
      return null;
    }
    return { absen: state.absen, money: state.money, level: state.level, xp: state.xp, at: Date.now() };
  }

  window.islandBuka = buka;
  window.islandTutup = tutup;
  window.islandAkunBerubah = akunBerubah;
  window.islandRingkas = ringkas;

})();
