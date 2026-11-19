/* tableverse-stick.js
   Papan + animasi StickEskrim.
   File ini hanya menggambar arena dan mengirim niat pemain (arah, power,
   posisi Move). Hasil aksi, eliminasi, out of bounds, dan pemenang tetap
   dihitung tableverse-local.js di dalam transaksi Firestore. */
(function () {
  "use strict";

  const ARENA = 100;
  const PANJANG = 16;
  const LEBAR = 4.4;
  const POWER_MIN = 20;
  const POWER_MAX = 100;
  const TEMPAT_MIN = 8;
  const TEMPAT_MAX = 92;

  const B = window.TVBoards || {};
  const esc = B.esc || ((v) => String(v == null ? "" : v));
  const inisial = B.inisial || ((n) => String(n || "?").trim().slice(0, 2).toUpperCase());

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function easeInOut(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function loadNum(key, fallback) {
    try {
      const n = Number(localStorage.getItem(key));
      return Number.isFinite(n) ? n : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function loadFlag(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw !== "off";
    } catch (err) {
      return fallback;
    }
  }

  const state = {
    wrap: null,
    canvas: null,
    ctx: null,
    room: null,
    roomId: "",
    mySlot: -1,
    hooks: null,
    mode: "idle",
    modeKey: "",
    angle: 0,
    power: POWER_MIN,
    powerDir: 1,
    powerLocked: false,
    preview: null,
    lastKey: "",
    lastTurn: null,
    anim: null,
    trail: [],
    particles: [],
    popup: null,
    joy: null,
    raf: 0,
    lastFrame: 0,
    lastAimSfx: -999,
    pestaAt: 0,
    confettiAt: 0,
    sfxOn: loadFlag("stickeskrim-sfx", true),
    sfxVolume: clamp(loadNum("stickeskrim-vol", 65) / 100, 0, 1),
  };

  /* ---------------- audio ---------------- */

  let actx = null;

  function tone(freq, dur, type, gain, glide, delay) {
    if (!state.sfxOn) return;
    try {
      if (window.SoundFX && typeof SoundFX.isEnabled === "function" && !SoundFX.isEnabled()) return;
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t0 = actx.currentTime + (delay || 0);
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
      const vol = Math.max(0.001, (gain || 0.1) * state.sfxVolume);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(actx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (err) {
      /* audio opsional */
    }
  }

  const SFX = {
    pick: () => tone(520, 0.08, "triangle", 0.12),
    aim: () => tone(700, 0.03, "square", 0.04),
    lock: () => { tone(600, 0.09, "sine", 0.11); tone(820, 0.1, "sine", 0.09, null, 0.06); },
    powerStop: () => { tone(880, 0.1, "sine", 0.14); tone(1180, 0.12, "sine", 0.1, null, 0.07); },
    slap: () => { tone(190, 0.12, "square", 0.16); tone(95, 0.2, "sine", 0.14); },
    whoosh: () => tone(360, 0.3, "sine", 0.09, 120),
    land: () => { tone(150, 0.1, "triangle", 0.14); tone(230, 0.07, "square", 0.07); },
    oob: () => tone(420, 0.24, "sine", 0.1, 130),
    reset: () => tone(300, 0.2, "sine", 0.1, 520),
    eliminate: () => { tone(480, 0.3, "sawtooth", 0.1, 90); tone(110, 0.32, "square", 0.09, null, 0.05); },
    turn: () => tone(520, 0.06, "triangle", 0.07),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "triangle", 0.13, null, i * 0.12)),
  };

  /* ---------------- util tampilan ---------------- */

  function nama(room, slot) {
    const p = room && Array.isArray(room.players) ? room.players.find((x) => Number(x.slot) === Number(slot)) : null;
    return p ? p.nama : `Pemain ${Number(slot) + 1}`;
  }

  function absenSlot(room, slot) {
    const p = room && Array.isArray(room.players) ? room.players.find((x) => Number(x.slot) === Number(slot)) : null;
    return p ? Number(p.absen) : Number(slot) + 1;
  }

  function warna(room, slot, terang) {
    const absen = absenSlot(room, slot);
    const h = (absen * 47) % 360;
    return `hsl(${h}, ${terang ? "68%, 80%" : "62%, 44%"})`;
  }

  /* ---------------- markup ---------------- */

  function papan(room, mySlot) {
    return `
      <div class="tv-stick-wrap" data-stick-wrap>
        <div class="tv-stick-stage">
          <div class="tv-stick-arena" data-stick-arena>
            <canvas class="tv-stick-canvas" data-stick-canvas aria-label="Arena StickEskrim"></canvas>
            <div class="tv-stick-power" data-stick-power hidden>
              <span class="tv-stick-power-label">POWER</span>
              <span class="tv-stick-power-track"><b class="tv-stick-power-fill" data-stick-power-fill></b></span>
              <strong class="tv-stick-power-val" data-stick-power-val>20</strong>
            </div>
            <div class="tv-stick-popup" data-stick-popup hidden></div>
          </div>
        </div>
        <div class="tv-stick-panel" data-stick-panel>${panelHtml(room, mySlot)}</div>
        <div class="tv-stick-legend" data-stick-legend>${legendHtml(room)}</div>
      </div>`;
  }

  function legendHtml(room) {
    const sticks = (room.state && room.state.sticks) || [];
    return (room.players || []).filter((p) => !p.left).map((p) => {
      const s = sticks[Number(p.slot)] || {};
      const mati = !s.alive;
      return `<span class="tv-stick-chip ${mati ? "is-out" : ""}" style="--sc:${warna(room, p.slot)}">
        <b>${esc(inisial(p.nama))}</b>${esc(p.nama)}
        <i>${mati ? "OUT" : `MOVE ${Number(s.movesLeft) || 0}/2`}</i>
      </span>`;
    }).join("");
  }

  function panelHtml(room, mySlot) {
    const stt = room.state || {};
    const sticks = Array.isArray(stt.sticks) ? stt.sticks : [];
    const aku = sticks[Number(mySlot)];
    const aktif = room.status === "playing" && Number(stt.turn) === Number(mySlot);
    const namaGiliran = nama(room, stt.turn);
    const sisa = aku ? Number(aku.movesLeft) || 0 : 0;
    const busy = state.hooks && typeof state.hooks.busy === "function" ? state.hooks.busy() : false;

    let isi = "";
    if (aku && !aku.alive) {
      isi = `
        <div class="tv-stick-spectate">
          <span aria-hidden="true">👀</span>
          <div>
            <strong>Mode penonton</strong>
            <p>Stick kamu sudah tereliminasi. Kamu tetap bisa lihat semua gerakan sampai ada pemenang.</p>
          </div>
        </div>`;
    } else if (!aktif) {
      isi = `
        <div class="tv-stick-wait">
          <span aria-hidden="true">⏳</span>
          <div>
            <strong>Menunggu ${esc(namaGiliran)}</strong>
            <p>Giliranmu berikutnya bakal muncul otomatis. Sisa Move kamu: ${sisa}/2.</p>
          </div>
        </div>`;
    } else if (state.mode === "aim") {
      isi = `
        <div class="tv-stick-mode is-aim">
          <div class="tv-stick-joy" data-stick-joy aria-label="Joystick arah tepokan">
            <span class="tv-stick-joy-ring"></span>
            <span class="tv-stick-joy-knob" data-stick-joy-knob></span>
          </div>
          <div class="tv-stick-aim-copy">
            <strong data-stick-angle>Arah ${Math.round(state.angle)}°</strong>
            <small>Geser joystick atau tap arena untuk menentukan arah 360°.</small>
            <div class="tv-stick-main-actions">
              <button type="button" class="tv-btn tv-btn-primary" data-stick-act="lock" ${busy ? "disabled" : ""}>Kunci Arah</button>
              <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-stick-act="cancel">Batal</button>
            </div>
          </div>
        </div>`;
    } else if (state.mode === "power") {
      isi = `
        <div class="tv-stick-mode is-power">
          <div class="tv-stick-live-power"><strong data-stick-live-power>${Math.round(state.power)}</strong><small>POWER</small></div>
          <div class="tv-stick-power-copy">
            <strong>Tekan TEPOK di angka yang pas</strong>
            <small>Makin besar power, makin jauh stick terbang. Indikator jalan terus dari 20 ke 100.</small>
            <div class="tv-stick-main-actions">
              <button type="button" class="tv-btn tv-btn-primary tv-stick-tepok" data-stick-act="tepok" ${busy ? "disabled" : ""}>TEPOK!</button>
              <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-stick-act="back">Ubah Arah</button>
            </div>
          </div>
        </div>`;
    } else if (state.mode === "place") {
      isi = `
        <div class="tv-stick-mode is-place">
          <div class="tv-stick-place-copy">
            <strong>Pilih posisi stick</strong>
            <small>Tap atau geser di arena untuk lihat preview. Sisa Move: ${sisa}/2.</small>
            <div class="tv-stick-main-actions">
              <button type="button" class="tv-btn tv-btn-primary" data-stick-act="place" ${busy || !state.preview ? "disabled" : ""}>Taruh di Sini</button>
              <button type="button" class="tv-btn tv-btn-ghost tv-btn-sm" data-stick-act="cancel">Batal</button>
            </div>
          </div>
        </div>`;
    } else {
      isi = `
        <div class="tv-stick-mode is-idle">
          <div class="tv-stick-main-actions">
            <button type="button" class="tv-btn tv-btn-primary tv-stick-slap" data-stick-act="slap" ${busy ? "disabled" : ""}>👋 Slap</button>
            <button type="button" class="tv-btn tv-btn-ghost" data-stick-act="move" ${busy || sisa <= 0 ? "disabled" : ""}>✥ Move</button>
          </div>
          <p class="tv-stick-hint">Giliranmu. Satu aksi per giliran: tepok stick lawan atau pindahkan stickmu.</p>
        </div>`;
    }

    return `
      <div class="tv-stick-topbar">
        <span class="tv-stick-move ${sisa > 0 ? "is-on" : "is-off"}">MOVE ${sisa}/2</span>
        <span class="tv-stick-turninfo">${room.status === "playing" ? `Giliran <b>${esc(namaGiliran)}</b>` : ""}</span>
        <span class="tv-stick-sfxbar">
          <button type="button" class="tv-stick-sfxbtn" data-stick-act="sfx" aria-pressed="${state.sfxOn ? "false" : "true"}" aria-label="${state.sfxOn ? "Matikan suara StickEskrim" : "Nyalakan suara StickEskrim"}">${state.sfxOn ? "🔊" : "🔇"}</button>
          <input type="range" min="0" max="100" step="5" value="${Math.round(state.sfxVolume * 100)}" data-stick-vol aria-label="Volume efek suara StickEskrim">
        </span>
      </div>
      ${isi}`;
  }

  function renderPanel() {
    const panel = state.wrap ? state.wrap.querySelector("[data-stick-panel]") : null;
    if (!panel || !state.room) return;
    panel.innerHTML = panelHtml(state.room, state.mySlot);
    syncPanelExtras();
    const legend = state.wrap.querySelector("[data-stick-legend]");
    if (legend) legend.innerHTML = legendHtml(state.room);
  }

  function syncPanelExtras() {
    const wrap = state.wrap;
    if (!wrap) return;
    const knob = wrap.querySelector("[data-stick-joy-knob]");
    if (knob) {
      const rad = (state.angle * Math.PI) / 180;
      knob.style.transform = `translate(-50%, -50%) translate(${Math.cos(rad) * 26}px, ${Math.sin(rad) * 26}px)`;
    }
    const label = wrap.querySelector("[data-stick-angle]");
    if (label) label.textContent = `Arah ${Math.round(state.angle)}°`;
    const powerShown = state.mode === "power";
    const meter = wrap.querySelector("[data-stick-power]");
    if (meter) meter.hidden = !powerShown;
    setPowerUi(state.power);
  }

  function setPowerUi(value) {
    const wrap = state.wrap;
    if (!wrap) return;
    const v = clamp(Number(value) || POWER_MIN, POWER_MIN, POWER_MAX);
    const pct = ((v - POWER_MIN) / (POWER_MAX - POWER_MIN)) * 100;
    const fill = wrap.querySelector("[data-stick-power-fill]");
    if (fill) fill.style.height = `${pct}%`;
    const val = wrap.querySelector("[data-stick-power-val]");
    if (val) val.textContent = String(Math.round(v));
    const live = wrap.querySelector("[data-stick-live-power]");
    if (live) live.textContent = String(Math.round(v));
  }

  /* ---------------- input ---------------- */

  function modeAktif() {
    if (!state.room || state.room.status !== "playing") return false;
    const stt = state.room.state || {};
    if (Number(stt.turn) !== Number(state.mySlot)) return false;
    const aku = (stt.sticks || [])[Number(state.mySlot)];
    return !!aku && !!aku.alive;
  }

  function mulaiMode(mode) {
    if (!modeAktif()) return;
    const busy = state.hooks && typeof state.hooks.busy === "function" ? state.hooks.busy() : false;
    if (busy) return;
    state.mode = mode;
    state.modeKey = `${state.room.id}:${state.room.seq}`;
    state.preview = null;
    if (mode === "power") {
      state.power = POWER_MIN;
      state.powerDir = 1;
      state.powerLocked = false;
    }
    if (mode === "aim" || mode === "power") {
      const stt = state.room.state || {};
      const aku = (stt.sticks || [])[state.mySlot];
      if (aku) {
        const sudut = (Math.atan2(50 - Number(aku.y), 50 - Number(aku.x)) * 180) / Math.PI;
        state.angle = ((Math.round(sudut) % 360) + 360) % 360;
      }
    }
    SFX.pick();
    renderPanel();
    ensureLoop();
  }

  function batalMode() {
    state.mode = "idle";
    state.preview = null;
    state.powerLocked = false;
    renderPanel();
  }

  function kirimAksi(payload) {
    if (!state.hooks || typeof state.hooks.kirim !== "function") return;
    const busy = state.hooks.busy && state.hooks.busy();
    if (busy) return;
    state.mode = "idle";
    state.preview = null;
    state.powerLocked = false;
    renderPanel();
    state.hooks.kirim(payload);
  }

  function kunciArah() {
    if (state.mode !== "aim") return;
    state.mode = "power";
    state.modeKey = `${state.room.id}:${state.room.seq}`;
    state.power = POWER_MIN;
    state.powerDir = 1;
    state.powerLocked = false;
    SFX.lock();
    renderPanel();
    ensureLoop();
  }

  function tepok() {
    if (state.mode !== "power" || state.powerLocked) return;
    state.powerLocked = true;
    const power = clamp(Math.round(state.power), POWER_MIN, POWER_MAX);
    SFX.powerStop();
    setPowerUi(power);
    const sudut = Math.round(state.angle);
    window.setTimeout(() => {
      kirimAksi({ type: "slap", angle: sudut, power });
    }, 190);
  }

  function taruhPosisi() {
    if (state.mode !== "place" || !state.preview) return;
    kirimAksi({ type: "move", x: Math.round(state.preview.x * 10) / 10, y: Math.round(state.preview.y * 10) / 10 });
  }

  function posisiStickSaya() {
    const sticks = (state.room && state.room.state && state.room.state.sticks) || [];
    return sticks[state.mySlot] || null;
  }

  function onPanelClick(e) {
    const btn = e.target.closest("[data-stick-act]");
    if (!btn || btn.disabled) return;
    const act = btn.getAttribute("data-stick-act");
    e.preventDefault();
    if (act === "slap") mulaiMode("aim");
    else if (act === "move") mulaiMode("place");
    else if (act === "lock") kunciArah();
    else if (act === "tepok") tepok();
    else if (act === "place") taruhPosisi();
    else if (act === "cancel") batalMode();
    else if (act === "back") { state.mode = "aim"; SFX.pick(); renderPanel(); }
    else if (act === "sfx") {
      state.sfxOn = !state.sfxOn;
      try { localStorage.setItem("stickeskrim-sfx", state.sfxOn ? "on" : "off"); } catch (err) { /* abaikan */ }
      renderPanel();
      if (state.sfxOn) SFX.pick();
    }
  }

  function onPanelInput(e) {
    if (!e.target || !e.target.matches("[data-stick-vol]")) return;
    state.sfxVolume = clamp(Number(e.target.value) / 100, 0, 1);
    try { localStorage.setItem("stickeskrim-vol", String(Math.round(state.sfxVolume * 100))); } catch (err) { /* abaikan */ }
  }

  function sudutDari(e, pos) {
    const arena = state.wrap ? state.wrap.querySelector("[data-stick-arena]") : null;
    if (!arena || !pos) return state.angle;
    const rect = arena.getBoundingClientRect();
    const box = kotakArena();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    const ax = (px - box.x0) / box.w * 100;
    const ay = (py - box.y0) / box.h * 100;
    return (Math.atan2(ay - pos.y, ax - pos.x) * 180) / Math.PI;
  }

  function setArah(angle) {
    state.angle = ((Math.round(angle) % 360) + 360) % 360;
    const label = state.wrap ? state.wrap.querySelector("[data-stick-angle]") : null;
    if (label) label.textContent = `Arah ${Math.round(state.angle)}°`;
    const knob = state.wrap ? state.wrap.querySelector("[data-stick-joy-knob]") : null;
    if (knob) {
      const rad = (state.angle * Math.PI) / 180;
      knob.style.transform = `translate(-50%, -50%) translate(${Math.cos(rad) * 26}px, ${Math.sin(rad) * 26}px)`;
    }
    const now = performance.now();
    if (now - state.lastAimSfx > 90) {
      state.lastAimSfx = now;
      SFX.aim();
    }
  }

  function updateJoy(e) {
    const joy = state.joy;
    if (!joy) return;
    const rect = joy.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < 3) return;
    setArah((Math.atan2(dy, dx) * 180) / Math.PI);
  }

  function onPanelDown(e) {
    const joy = e.target.closest("[data-stick-joy]");
    if (!joy || state.mode !== "aim") return;
    state.joy = joy;
    try { joy.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
    e.preventDefault();
    updateJoy(e);
  }

  function onPanelMove(e) {
    if (!state.joy) return;
    updateJoy(e);
  }

  function onPanelUp() {
    state.joy = null;
  }

  function onArenaDown(e) {
    if (state.mode === "aim") {
      const pos = posisiStickSaya();
      setArah(sudutDari(e, pos));
      e.preventDefault();
    } else if (state.mode === "place") {
      state.preview = posisiDariEvent(e);
      e.preventDefault();
      const tombol = state.wrap ? state.wrap.querySelector('[data-stick-act="place"]') : null;
      if (tombol) tombol.disabled = false;
    }
  }

  function onArenaMove(e) {
    if (state.mode === "aim" && e.buttons) {
      setArah(sudutDari(e, posisiStickSaya()));
    } else if (state.mode === "place" && e.buttons) {
      state.preview = posisiDariEvent(e);
    }
  }

  function onArenaUp() {
    /* dibiarkan: preview terakhir dipakai tombol Taruh */
  }

  function posisiDariEvent(e) {
    const arena = state.wrap ? state.wrap.querySelector("[data-stick-arena]") : null;
    if (!arena) return null;
    const rect = arena.getBoundingClientRect();
    const box = kotakArena();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    const x = ((px - box.x0) / box.w) * 100;
    const y = ((py - box.y0) / box.h) * 100;
    return { x: clamp(x, TEMPAT_MIN, TEMPAT_MAX), y: clamp(y, TEMPAT_MIN, TEMPAT_MAX) };
  }

  function bind(wrap) {
    const arena = wrap.querySelector("[data-stick-arena]");
    const panel = wrap.querySelector("[data-stick-panel]");
    if (arena) {
      arena.addEventListener("pointerdown", onArenaDown);
      arena.addEventListener("pointermove", onArenaMove);
      arena.addEventListener("pointerup", onArenaUp);
      arena.addEventListener("pointercancel", onArenaUp);
    }
    if (panel) {
      panel.addEventListener("click", onPanelClick);
      panel.addEventListener("pointerdown", onPanelDown);
      panel.addEventListener("pointermove", onPanelMove);
      panel.addEventListener("pointerup", onPanelUp);
      panel.addEventListener("pointercancel", onPanelUp);
      panel.addEventListener("input", onPanelInput);
    }
  }

  /* ---------------- mount ---------------- */

  function mount(app, room, mySlot, hooks) {
    const wrap = app.querySelector("[data-stick-wrap]");
    if (!wrap) {
      state.wrap = null;
      stopLoop();
      return;
    }
    if (state.roomId !== room.id) {
      state.roomId = room.id;
      state.anim = null;
      state.lastKey = "";
      state.lastTurn = null;
      state.mode = "idle";
      state.modeKey = "";
      state.preview = null;
      state.popup = null;
      state.trail.length = 0;
      state.particles.length = 0;
    }
    state.wrap = wrap;
    state.room = room;
    state.mySlot = Number(mySlot);
    state.hooks = hooks || {};
    state.canvas = wrap.querySelector("[data-stick-canvas]");
    state.ctx = state.canvas ? state.canvas.getContext("2d") : null;

    if (state.mode !== "idle" && state.modeKey !== `${room.id}:${room.seq}`) {
      state.mode = "idle";
      state.preview = null;
    }

    const key = `${room.id}:${room.seq}`;
    const act = room.state && room.state.lastAction;
    if (key !== state.lastKey) {
      const lanjut = state.lastKey !== "";
      state.lastKey = key;
      if (act && lanjut) beginAnim(act);
    }

    bind(wrap);
    syncPanelExtras();
    const pesta = !!(hooks && hooks.pesta) && room.status === "finished";
    if (pesta) {
      if (!state.pestaAt) {
        state.pestaAt = performance.now();
        state.confettiAt = 0;
        spawnConfetti();
      }
    } else if (state.pestaAt) {
      state.pestaAt = 0;
      state.confettiAt = 0;
    }
    ensureLoop();
  }

  function beginAnim(action) {
    const now = performance.now();
    const before = {};
    (action.before || []).forEach((b) => { before[b.slot] = b; });
    const anim = { action, start: now, before, done: {}, total: 1200 };
    if (action.type === "slap") {
      anim.total = 280 + (Number(action.durFly) || 900)
        + (Array.isArray(action.hits) && action.hits.length ? 760 : 260)
        + (action.oob ? (Number(action.durReturn) || 700) + 420 : 0);
    } else if (action.type === "move") {
      anim.total = (Number(action.dur) || 460) + 320;
    } else if (action.type === "forfeit") {
      anim.total = (Number(action.dur) || 650) + 620;
    }
    state.anim = anim;
    state.trail.length = 0;
    state.particles.length = 0;
    state.popup = null;
    if (action.type === "slap" || action.type === "move") SFX.whoosh();
  }

  /* ---------------- loop ---------------- */

  function ensureLoop() {
    if (state.raf) return;
    state.lastFrame = performance.now();
    state.raf = window.requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function tick(now) {
    state.raf = 0;
    if (!state.wrap || !state.wrap.isConnected) {
      stopLoop();
      return;
    }
    const dt = Math.min(64, now - (state.lastFrame || now));
    state.lastFrame = now;
    updatePower(dt);
    updateParticles(dt);
    if (state.pestaAt && now - state.pestaAt < 2800 && now - state.confettiAt > 330) {
      state.confettiAt = now;
      spawnConfetti();
    }
    draw(now);
    if (state.anim && now - state.anim.start > state.anim.total) {
      const anim = state.anim;
      state.anim = null;
      state.trail.length = 0;
      const masihMain = state.room && state.room.status === "playing";
      if (masihMain && anim.action && anim.action.type !== "move") SFX.turn();
    }
    clearPopupIfOld(now);
    state.raf = window.requestAnimationFrame(tick);
  }

  function updatePower(dt) {
    if (state.mode !== "power" || state.powerLocked) return;
    state.power += state.powerDir * 0.075 * dt;
    if (state.power >= POWER_MAX) {
      state.power = POWER_MAX;
      state.powerDir = -1;
    }
    if (state.power <= POWER_MIN) {
      state.power = POWER_MIN;
      state.powerDir = 1;
    }
    setPowerUi(state.power);
  }

  function updateParticles(dt) {
    if (!state.particles.length) return;
    const s = dt / 1000;
    state.particles = state.particles.filter((p) => {
      p.life -= s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += 30 * s;
      return p.life > 0;
    });
  }

  /* ---------------- gambar ---------------- */

  function kotakArena() {
    return { x0: 5.5, y0: 5.5, w: 89, h: 89 };
  }

  function draw(now) {
    const cv = state.canvas;
    const c = state.ctx;
    if (!cv || !c) return;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const box = kotakArena();
    const ax = (box.x0 / 100) * w;
    const ay = (box.y0 / 100) * h;
    const aw = (box.w / 100) * w;
    const ah = (box.h / 100) * h;
    const px = (x, y) => [ax + (x / 100) * aw, ay + (y / 100) * ah];
    const unit = (n) => (n / 100) * aw;

    /* meja */
    const meja = c.createLinearGradient(0, 0, w, h);
    meja.addColorStop(0, "#efe3c8");
    meja.addColorStop(1, "#e2d1ab");
    c.fillStyle = meja;
    bulat(c, 0, 0, w, h, Math.min(w, h) * 0.05);
    c.fill();

    /* arena */
    c.save();
    c.shadowColor = "rgba(80, 55, 20, 0.28)";
    c.shadowBlur = Math.min(w, h) * 0.03;
    c.shadowOffsetY = Math.min(w, h) * 0.008;
    c.fillStyle = "#fffdf6";
    bulat(c, ax, ay, aw, ah, Math.min(w, h) * 0.035);
    c.fill();
    c.restore();

    c.strokeStyle = "rgba(140, 100, 55, 0.55)";
    c.lineWidth = Math.max(1.5, w * 0.004);
    bulat(c, ax, ay, aw, ah, Math.min(w, h) * 0.035);
    c.stroke();

    /* garis grid halus */
    c.save();
    c.beginPath();
    c.rect(ax, ay, aw, ah);
    c.clip();
    c.strokeStyle = "rgba(120, 90, 50, 0.08)";
    c.lineWidth = 1;
    for (let i = 10; i < 100; i += 10) {
      const [gx] = px(i, 0);
      const [, gy] = px(0, i);
      c.beginPath();
      c.moveTo(gx, ay);
      c.lineTo(gx, ay + ah);
      c.stroke();
      c.beginPath();
      c.moveTo(ax, gy);
      c.lineTo(ax + aw, gy);
      c.stroke();
    }
    c.restore();

    const room = state.room;
    const sticks = (room.state && room.state.sticks) || [];
    const anim = state.anim;

    /* penanda area pemain */
    sticks.forEach((s) => {
      const [sx, sy] = px(s.startX, s.startY);
      c.save();
      c.globalAlpha = 0.18;
      c.fillStyle = warna(room, s.slot);
      c.beginPath();
      c.ellipse(sx, sy, unit(9), unit(4), ((s.startRot || 0) * Math.PI) / 180, 0, Math.PI * 2);
      c.fill();
      c.restore();
    });

    /* panduan arah */
    if (state.mode === "aim" || state.mode === "power") {
      const saya = posisiStickSaya();
      if (saya) {
        const [sx, sy] = px(saya.x, saya.y);
        const rad = (state.angle * Math.PI) / 180;
        const panjang = unit(state.mode === "power" ? 14 + state.power * 0.32 : 36);
        const ex = sx + Math.cos(rad) * panjang;
        const ey = sy + Math.sin(rad) * panjang;
        c.save();
        c.strokeStyle = state.mode === "power" ? "rgba(201, 75, 69, 0.75)" : "rgba(31, 109, 82, 0.7)";
        c.lineWidth = Math.max(2, w * 0.006);
        c.setLineDash([w * 0.02, w * 0.016]);
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(ex, ey);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.moveTo(ex + Math.cos(rad) * w * 0.024, ey + Math.sin(rad) * w * 0.024);
        c.lineTo(ex + Math.cos(rad + 2.5) * w * 0.022, ey + Math.sin(rad + 2.5) * w * 0.022);
        c.lineTo(ex + Math.cos(rad - 2.5) * w * 0.022, ey + Math.sin(rad - 2.5) * w * 0.022);
        c.closePath();
        c.fill();
        c.restore();
      }
    }

    /* trail penerbangan */
    if (anim && anim.action && anim.action.type === "slap" && state.trail.length) {
      state.trail.forEach((t, i) => {
        const alpha = ((i + 1) / state.trail.length) * 0.25;
        drawStickShape(c, px(t.x, t.y), unit(PANJANG), unit(LEBAR), (t.rot * Math.PI) / 180, {
          alpha,
          color: warna(room, anim.action.by),
          lift: 0,
          noShadow: true,
        });
      });
    }

    /* stick */
    const frame = computeFrame(now, px, unit);
    if (state.pestaAt && room.status === "finished") {
      const winners = room.result && Array.isArray(room.result.winners) ? room.result.winners : [];
      const juara = winners.length
        ? (room.players || []).find((p) => Number(p.absen) === Number(winners[0].absen))
        : null;
      const slotJuara = juara ? Number(juara.slot) : -1;
      const item = frame.items.find((i) => i.slot === slotJuara && i.alpha > 0.1);
      if (item && !state.anim) {
        const t = now - state.pestaAt;
        item.lift += Math.abs(Math.sin(t / 230)) * 3.6;
        item.scale += Math.abs(Math.sin(t / 230)) * 0.05;
      }
    }
    frame.items.forEach((item) => {
      if (item.alpha <= 0.01) return;
      const isTurn = !state.anim && room.status === "playing" && Number((room.state || {}).turn) === item.slot;
      drawStick(c, item, px, unit, room, isTurn, now);
    });

    /* preview Move */
    if (state.mode === "place") {
      const pos = state.preview || posisiStickSaya();
      if (pos) {
        drawStickShape(c, px(pos.x, pos.y), unit(PANJANG), unit(LEBAR), ((pos.rot || 0) * Math.PI) / 180, {
          alpha: 0.55,
          color: "#1f6d52",
          dashed: true,
          lift: 0,
        });
        const [cx2, cy2] = px(pos.x, pos.y);
        c.strokeStyle = "rgba(31, 109, 82, 0.8)";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cx2, cy2, unit(3), 0, Math.PI * 2);
        c.stroke();
      }
    }

    /* partikel */
    state.particles.forEach((p) => {
      const [p1, p2] = px(p.x, p.y);
      const life = clamp(p.life / p.max, 0, 1);
      c.globalAlpha = life;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p1, p2, Math.max(1, unit(p.size) * (0.4 + life)), 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;

    /* tangan & efek tepokan */
    if (frame.hand) drawHand(c, frame.hand, px, unit, w, h);
    frame.rings.forEach((ring) => {
      const [rx, ry] = px(ring.x, ring.y);
      const u = clamp(ring.p, 0, 1);
      c.save();
      c.globalAlpha = 1 - u;
      c.strokeStyle = ring.color;
      c.lineWidth = Math.max(2, w * 0.008) * (1 - u * 0.5);
      c.beginPath();
      c.arc(rx, ry, unit(3) + unit(12) * u, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    });
  }

  function computeFrame(now, px, unit) {
    const room = state.room;
    const sticks = (room.state && room.state.sticks) || [];
    const items = sticks.map((s) => ({
      slot: Number(s.slot),
      x: s.x,
      y: s.y,
      rot: s.rot,
      alpha: s.alive ? 1 : 0,
      scale: 1,
      lift: 0,
      shadow: 1,
      shake: 0,
    }));
    const anim = state.anim;
    const hasil = { items, hand: null, rings: [] };
    if (!anim || !anim.action) return hasil;

    const act = anim.action;
    const t = Math.max(0, now - anim.start);
    const by = Number(act.by);
    const striker = items.find((i) => i.slot === by);

    (act.before || []).forEach((b) => {
      const item = items.find((i) => i.slot === Number(b.slot));
      if (!item) return;
      item.x = b.x;
      item.y = b.y;
      item.rot = b.rot;
      item.alpha = b.alive ? 1 : 0;
    });

    if (!striker) return hasil;

    if (act.type === "slap") {
      const FLAP = 280;
      const dur = Number(act.durFly) || 900;
      const landT = FLAP + dur;
      const from = act.from || { x: striker.x, y: striker.y, rot: striker.rot };
      striker.alpha = 1;

      if (t >= 235 && !anim.done.slap) {
        anim.done.slap = true;
        SFX.slap();
      }
      if (t < FLAP) {
        striker.x = from.x;
        striker.y = from.y;
        striker.rot = from.rot;
        const u = t / FLAP;
        striker.scale = 1 + Math.sin(u * Math.PI) * 0.06;
        hasil.hand = { x: from.x, y: from.y, angle: Number(act.angle) || 0, p: u };
      } else if (t < landT) {
        const u = (t - FLAP) / dur;
        striker.x = lerp(from.x, act.land.x, u);
        striker.y = lerp(from.y, act.land.y, u);
        striker.rot = from.rot + (Number(act.spin) || 1) * 360 * u + (act.land.rot - from.rot) * u;
        striker.lift = Math.sin(Math.PI * u) * (7 + Number(act.power) * 0.09);
        striker.shadow = 1 - Math.sin(Math.PI * u) * 0.5;
        state.trail.push({ x: striker.x, y: striker.y, rot: striker.rot });
        if (state.trail.length > 18) state.trail.shift();
        if (!anim.done.whoosh) {
          anim.done.whoosh = true;
          SFX.whoosh();
        }
      } else {
        striker.x = act.land.x;
        striker.y = act.land.y;
        striker.rot = act.land.rot;
        striker.lift = 0;
        striker.shadow = 1;
        const bounce = (t - landT) / 200;
        if (bounce < 1) striker.scale = 1 + Math.sin(bounce * Math.PI) * 0.14;
        hasil.rings.push({ x: act.land.x, y: act.land.y, p: (t - landT) / 420, color: "rgba(201, 75, 69, 0.55)" });
        if (!anim.done.land) {
          anim.done.land = true;
          SFX.land();
          spawnDust(act.land.x, act.land.y);
        }
      }

      if (t >= landT && act.oob) {
        const mulaiBalik = landT + 260;
        if (t < mulaiBalik) {
          striker.x = act.land.x;
          striker.y = act.land.y;
          striker.rot = act.land.rot;
        } else {
          const u = clamp((t - mulaiBalik) / (Number(act.durReturn) || 700), 0, 1);
          striker.x = lerp(act.land.x, act.to.x, easeInOut(u));
          striker.y = lerp(act.land.y, act.to.y, easeInOut(u));
          striker.rot = lerp(act.land.rot, act.to.rot, easeInOut(u));
          striker.lift = Math.sin(Math.PI * u) * 5;
        }
        if (!anim.done.oob) {
          anim.done.oob = true;
          SFX.oob();
          popup("Keluar arena — balik ke posisi awal", act.land.x, act.land.y, "warn");
        }
        if (!anim.done.reset && t >= mulaiBalik + (Number(act.durReturn) || 700) * 0.7) {
          anim.done.reset = true;
          SFX.reset();
        }
      }

      if (Array.isArray(act.hits) && act.hits.length && t >= landT + 120) {
        const u = clamp((t - landT - 120) / 520, 0, 1);
        act.hits.forEach((slot) => {
          const korban = items.find((i) => i.slot === Number(slot));
          if (!korban) return;
          korban.alpha = 1 - u;
          korban.scale = 1 - 0.25 * u;
          korban.shake = (1 - u) * 0.5;
          korban.lift = Math.sin(u * Math.PI) * 4;
        });
        if (!anim.done.hit) {
          anim.done.hit = true;
          SFX.eliminate();
          const korbanPertama = items.find((i) => i.slot === Number(act.hits[0]));
          if (korbanPertama) {
            popup(`${nama(state.room, korbanPertama.slot)} TERELIMINASI`, korbanPertama.x, korbanPertama.y, "bad");
            spawnBurst(korbanPertama.x, korbanPertama.y, warna(state.room, korbanPertama.slot, true));
          }
          act.hits.forEach((slot, idx) => {
            const korban = items.find((i) => i.slot === Number(slot));
            if (!korban) return;
            hasil.rings.push({ x: korban.x, y: korban.y, p: 0.35 + idx * 0.05, color: "rgba(255, 120, 90, 0.75)" });
            spawnBurst(korban.x, korban.y, warna(state.room, korban.slot));
          });
        }
      }
    } else if (act.type === "move") {
      const dur = Number(act.dur) || 460;
      const u = clamp(t / dur, 0, 1);
      const e = easeInOut(u);
      striker.x = lerp(act.from.x, act.to.x, e);
      striker.y = lerp(act.from.y, act.to.y, e);
      striker.rot = act.from.rot;
      striker.lift = Math.sin(u * Math.PI) * 3.5;
      striker.shadow = 1 - Math.sin(u * Math.PI) * 0.25;
      if (u >= 1) {
        const bounce = (t - dur) / 220;
        if (bounce < 1) striker.scale = 1 + Math.sin(bounce * Math.PI) * 0.1;
        if (!anim.done.land) {
          anim.done.land = true;
          SFX.land();
          spawnDust(act.to.x, act.to.y);
        }
      }
    } else if (act.type === "forfeit") {
      const dur = Number(act.dur) || 650;
      const u = clamp(t / dur, 0, 1);
      striker.alpha = 1 - u;
      striker.scale = 1 - 0.4 * u;
      striker.shake = (1 - u) * 0.6;
      striker.lift = Math.sin(u * Math.PI) * 5;
      if (!anim.done.hit) {
        anim.done.hit = true;
        SFX.eliminate();
        popup(`${nama(state.room, by)} MENYERAH`, striker.x, striker.y, "bad");
        spawnBurst(striker.x, striker.y, warna(state.room, by));
      }
      if (t > 260 && t < 620) {
        if (!anim.done.hit2) {
          anim.done.hit2 = true;
          spawnBurst(striker.x, striker.y, "#f0b94a");
        }
      }
    }

    return hasil;
  }

  function drawStick(c, item, px, unit, room, isTurn, now) {
    const [x, y] = px(item.x, item.y);
    const rad = (item.rot * Math.PI) / 180;
    const panjang = unit(PANJANG) * item.scale;
    const lebar = unit(LEBAR) * item.scale;
    const color = warna(room, item.slot);

    if (item.lift > 0.3) {
      c.save();
      c.globalAlpha = 0.22 * item.shadow;
      c.fillStyle = "#2b1c0d";
      const [sx2, sy2] = px(item.x, item.y);
      c.beginPath();
      c.ellipse(sx2, sy2 + unit(LEBAR) * 1.4, panjang * 0.48, lebar * 0.42, rad, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else {
      c.save();
      c.globalAlpha = 0.18 * item.alpha;
      c.fillStyle = "#2b1c0d";
      c.beginPath();
      c.ellipse(x + unit(0.7), y + unit(1.1), panjang * 0.48, lebar * 0.42, rad, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    if (isTurn) {
      const pulse = 0.55 + Math.sin(now / 420) * 0.25;
      c.save();
      c.globalAlpha = pulse;
      c.strokeStyle = "#25a56a";
      c.lineWidth = Math.max(2, unit(0.9));
      c.beginPath();
      c.ellipse(x, y, panjang * 0.62, lebar * 1.5, rad, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    const shakeX = item.shake ? Math.sin(now / 26) * unit(0.7) * item.shake : 0;
    const shakeY = item.shake ? Math.cos(now / 31) * unit(0.7) * item.shake : 0;
    drawStickShape(c, [x + shakeX, y + shakeY - unit(item.lift)], panjang, lebar, rad, {
      alpha: item.alpha,
      color,
      lift: item.lift,
      noShadow: true,
    });

    c.save();
    c.globalAlpha = item.alpha;
    c.translate(x + shakeX, y + shakeY - unit(item.lift));
    c.fillStyle = "rgba(255, 253, 246, 0.92)";
    c.beginPath();
    c.arc(0, 0, lebar * 0.78, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.font = `700 ${Math.max(8, lebar * 0.62)}px "Segoe UI", system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(String(inisial(nama(room, item.slot))).slice(0, 2), 0, 0.5);
    c.restore();
  }

  // Stick digambar dalam koordinat lokal: pusat (0,0), panjang horizontal.
  function drawStickShape(c, titik, panjang, lebar, rad, o) {
    const opts = o || {};
    c.save();
    c.translate(titik[0], titik[1]);
    c.rotate(rad);
    c.globalAlpha = opts.alpha == null ? 1 : opts.alpha;

    const g = c.createLinearGradient(0, -lebar / 2, 0, lebar / 2);
    g.addColorStop(0, "#fff3d4");
    g.addColorStop(0.32, "#f2d49a");
    g.addColorStop(0.68, "#dfae62");
    g.addColorStop(1, "#b87c3a");
    c.fillStyle = g;
    kapsul(c, panjang, lebar);
    c.fill();

    c.strokeStyle = opts.dashed ? "rgba(31, 109, 82, 0.9)" : "rgba(96, 58, 20, 0.5)";
    c.lineWidth = Math.max(1, panjang * 0.02);
    if (opts.dashed) c.setLineDash([panjang * 0.12, panjang * 0.08]);
    kapsul(c, panjang, lebar);
    c.stroke();
    c.setLineDash([]);

    // serat kayu
    if (!opts.dashed) {
      c.save();
      c.globalAlpha *= 0.25;
      c.strokeStyle = "#8a5a24";
      c.lineWidth = Math.max(0.6, lebar * 0.04);
      for (let i = -1; i <= 1; i += 1) {
        c.beginPath();
        c.moveTo(-panjang * 0.32, i * lebar * 0.16);
        c.quadraticCurveTo(0, i * lebar * 0.16 + lebar * 0.05, panjang * 0.32, i * lebar * 0.16);
        c.stroke();
      }
      c.restore();
      c.save();
      c.globalAlpha *= 0.45;
      c.fillStyle = "#fff8e6";
      c.beginPath();
      c.ellipse(-panjang * 0.14, -lebar * 0.2, panjang * 0.26, lebar * 0.12, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    // pita warna pemain di kedua ujung
    if (opts.color) {
      c.fillStyle = opts.color;
      [-1, 1].forEach((sisi) => {
        c.beginPath();
        c.ellipse(sisi * panjang * 0.36, 0, panjang * 0.1, lebar * 0.46, 0, 0, Math.PI * 2);
        c.fill();
      });
    }

    c.restore();
  }

  function kapsul(c, panjang, lebar) {
    const r = lebar / 2;
    const x0 = -panjang / 2;
    const x1 = panjang / 2;
    c.beginPath();
    c.moveTo(x0 + r, -r);
    c.lineTo(x1 - r, -r);
    c.arc(x1 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    c.lineTo(x0 + r, r);
    c.arc(x0 + r, 0, r, Math.PI / 2, -Math.PI / 2);
    c.closePath();
  }

  function bulat(c, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }

  function drawHand(c, hand, px, unit, w, h) {
    const [hx, hy] = px(hand.x, hand.y);
    const rad = (hand.angle * Math.PI) / 180;
    const jab = Math.sin(clamp(hand.p, 0, 1) * Math.PI);
    const dist = unit(11) * (1 - jab * 0.55);
    const hx2 = hx - Math.cos(rad) * dist;
    const hy2 = hy - Math.sin(rad) * dist;
    c.save();
    c.translate(hx2, hy2);
    c.rotate(rad + Math.PI / 2);
    c.globalAlpha = 0.2;
    c.fillStyle = "#2b1c0d";
    c.beginPath();
    c.arc(unit(1), unit(1.2), unit(5.6), 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    c.font = `${unit(12)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("🖐️", 0, 0);
    c.restore();
  }

  function spawnDust(x, y) {
    for (let i = 0; i < 8; i += 1) {
      const a = Math.random() * Math.PI * 2;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * (8 + Math.random() * 10),
        vy: Math.sin(a) * (8 + Math.random() * 10) - 4,
        life: 0.5 + Math.random() * 0.3,
        max: 0.8,
        color: "rgba(190, 150, 95, 0.75)",
        size: 1.4 + Math.random(),
      });
    }
  }

  function spawnBurst(x, y, color) {
    for (let i = 0; i < 18; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = 18 + Math.random() * 26;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 6,
        life: 0.5 + Math.random() * 0.45,
        max: 0.95,
        color: Math.random() > 0.45 ? color : "#f0b94a",
        size: 1.6 + Math.random() * 1.4,
      });
    }
  }

  function spawnConfetti() {
    const colors = ["#f0b94a", "#e25b52", "#3d86c6", "#3fae7a", "#e58ac1", "#8a6ad1", "#f4d35e"];
    for (let i = 0; i < 22; i += 1) {
      state.particles.push({
        x: 8 + Math.random() * 84,
        y: 2 + Math.random() * 26,
        vx: (Math.random() - 0.5) * 16,
        vy: 5 + Math.random() * 13,
        life: 1.2 + Math.random() * 0.9,
        max: 2.1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.1 + Math.random() * 1.1,
      });
    }
  }

  function popup(text, x, y, kind) {
    if (!state.wrap) return;
    const el = state.wrap.querySelector("[data-stick-popup]");
    if (!el) return;
    el.hidden = false;
    el.className = `tv-stick-popup is-${kind || "info"}`;
    el.textContent = text;
    el.style.left = `${clamp(5.5 + clamp(x, 0, 100) * 0.89, 8, 92)}%`;
    el.style.top = `${clamp(5.5 + clamp(y - 4, 0, 100) * 0.89, 8, 92)}%`;
    state.popup = { until: performance.now() + 1900 };
  }

  function clearPopupIfOld(now) {
    if (!state.popup || now < state.popup.until) return;
    state.popup = null;
    const el = state.wrap ? state.wrap.querySelector("[data-stick-popup]") : null;
    if (el) el.hidden = true;
  }

  /* ---------------- ekspor ---------------- */

  window.TVStick = {
    papan,
    mount,
    stop: stopLoop,
  };
})();
