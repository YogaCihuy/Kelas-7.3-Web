// Cloud Functions Fishing Game — satu endpoint callable, semua mutasi & RNG di server.
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const {
  CATALOG_VERSION,
  RARITY_ORDER,
  RARITY_INFO,
  RARITY_BASE_WEIGHT,
  RARITY_CAPS,
  FISH,
  FISH_BY_ID,
  FISH_BY_RARITY,
  RODS,
  ROD_BY_ID,
  BAITS,
  BAIT_BY_ID,
  ECONOMY,
  ACHIEVEMENTS,
  hitungBobotRarity,
  peluangRarity,
} = require("./fishing-data");
const { STUDENTS, isValidAbsen } = require("./students");

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: "us-central1", maxInstances: 20 });

const COL = {
  state: "fishing",
  secrets: "fishingSecrets",
  casts: "fishingCasts",
  meta: "fishingMeta",
  announce: "fishingAnnouncements",
};

function katalogClient() {
  return {
    version: CATALOG_VERSION,
    rarities: RARITY_INFO,
    rarityOrder: RARITY_ORDER,
    rarityBaseWeight: RARITY_BASE_WEIGHT,
    rarityCaps: RARITY_CAPS,
    fish: FISH,
    rods: RODS,
    baits: BAITS,
    economy: ECONOMY,
    achievements: ACHIEVEMENTS,
  };
}

function nomorAbsen(nilai) {
  const n = Number(nilai);
  if (!isValidAbsen(n)) throw new HttpsError("invalid-argument", "Akun kelas tidak valid.");
  return n;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function ms(nilai) {
  if (!nilai) return 0;
  if (typeof nilai === "number") return nilai;
  if (typeof nilai.toMillis === "function") return nilai.toMillis();
  return 0;
}

function statsAwal() {
  return {
    casts: 0,
    catches: 0,
    misses: 0,
    totalEarned: 0,
    totalSpent: 0,
    byRarity: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])),
    biggest: null,
  };
}

function stateAwal(absen, name) {
  const rod = ROD_BY_ID[ECONOMY.startRod];
  const now = Timestamp.now();
  return {
    absen,
    name: name || STUDENTS[absen] || "Pemancing",
    coins: ECONOMY.startCoins,
    rods: [{ id: rod.id, durability: rod.durability }],
    equippedRod: rod.id,
    baits: { [ECONOMY.startBait]: ECONOMY.startBaitQty },
    equippedBait: ECONOMY.startBait,
    fish: {},
    locked: {},
    collection: {},
    totalValue: 0,
    totalCaught: 0,
    stats: statsAwal(),
    achievements: {},
    activeCast: null,
    requests: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

// Idempotensi: requestId yang sama tidak boleh memicu transaksi dua kali.
function tandaiPermintaan(state, requestId) {
  const id = typeof requestId === "string" ? requestId.trim() : "";
  if (!id || id.length < 8 || id.length > 80) {
    throw new HttpsError("invalid-argument", "Permintaan transaksi tidak valid.");
  }
  const list = Array.isArray(state.requests) ? state.requests : [];
  if (list.some((r) => r && r.id === id)) {
    throw new HttpsError("aborted", "Transaksi ini sudah diproses. Data akan tersinkron otomatis.");
  }
  state.requests = [{ id, at: Date.now() }, ...list].slice(0, 12);
}

function hitungTotalValue(state) {
  let total = 0;
  for (const [id, count] of Object.entries(state.fish || {})) {
    const fish = FISH_BY_ID[id];
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (fish && n > 0) total += fish.value * n;
  }
  return total;
}

function lengkapiState(raw) {
  const absen = Number(raw.absen);
  const dasar = stateAwal(absen, raw.name);
  const s = { ...dasar, ...raw };
  s.absen = absen;
  s.name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : dasar.name;
  s.coins = Math.max(0, Math.floor(Number(raw.coins) || 0));

  const rods = Array.isArray(raw.rods) ? raw.rods : [];
  s.rods = rods
    .map((r) => {
      const info = ROD_BY_ID[r && r.id];
      if (!info) return null;
      const d = Number(r.durability);
      return { id: info.id, durability: Math.max(0, Math.min(info.durability, Math.floor(Number.isFinite(d) ? d : info.durability))) };
    })
    .filter(Boolean);
  if (!s.rods.length) s.rods = dasar.rods;
  if (!s.rods.some((r) => r.id === s.equippedRod)) s.equippedRod = s.rods[0].id;

  const baits = {};
  for (const [id, count] of Object.entries(raw.baits || {})) {
    if (!BAIT_BY_ID[id]) continue;
    const n = Math.max(0, Math.min(ECONOMY.maxBaitStack, Math.floor(Number(count) || 0)));
    if (n > 0) baits[id] = n;
  }
  s.baits = baits;
  if (!BAIT_BY_ID[s.equippedBait] || !baits[s.equippedBait]) {
    const stok = Object.keys(baits).sort((a, b) => BAIT_BY_ID[a].tier - BAIT_BY_ID[b].tier);
    s.equippedBait = stok[0] || ECONOMY.startBait;
  }

  const fish = {};
  for (const [id, count] of Object.entries(raw.fish || {})) {
    if (!FISH_BY_ID[id]) continue;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n > 0) fish[id] = n;
  }
  s.fish = fish;

  const locked = {};
  for (const [id, val] of Object.entries(raw.locked || {})) {
    if (val === true && fish[id]) locked[id] = true;
  }
  s.locked = locked;

  const collection = {};
  for (const [id, rec] of Object.entries(raw.collection || {})) {
    if (!FISH_BY_ID[id]) continue;
    const caught = Math.max(0, Math.floor(Number(rec && rec.caught) || 0));
    collection[id] = { caught, firstAt: (rec && rec.firstAt) || Timestamp.now() };
  }
  s.collection = collection;

  s.stats = { ...statsAwal(), ...(raw.stats || {}) };
  s.stats.byRarity = { ...statsAwal().byRarity, ...((raw.stats && raw.stats.byRarity) || {}) };
  ["casts", "catches", "misses", "totalEarned", "totalSpent"].forEach((k) => {
    s.stats[k] = Math.max(0, Math.floor(Number(s.stats[k]) || 0));
  });
  if (s.stats.biggest && (!FISH_BY_ID[s.stats.biggest.fishId] || !Number.isFinite(Number(s.stats.biggest.weight)))) {
    s.stats.biggest = null;
  }

  s.achievements = raw.achievements && typeof raw.achievements === "object" ? { ...raw.achievements } : {};
  s.requests = Array.isArray(raw.requests)
    ? raw.requests.filter((r) => r && typeof r.id === "string" && Number.isFinite(Number(r.at))).slice(0, 12)
    : [];
  s.totalCaught = Math.max(0, Math.floor(Number(raw.totalCaught) || 0));
  s.totalValue = hitungTotalValue(s);
  s.activeCast = raw.activeCast && typeof raw.activeCast === "object" ? raw.activeCast : null;
  return s;
}

function stateClient(state) {
  const out = { ...state };
  out.createdAt = ms(state.createdAt);
  out.updatedAt = ms(state.updatedAt);
  out.collection = Object.fromEntries(
    Object.entries(state.collection || {}).map(([id, rec]) => [id, { caught: rec.caught || 0, firstAt: ms(rec.firstAt) }])
  );
  if (state.activeCast) {
    out.activeCast = { ...state.activeCast };
  }
  return out;
}

function acakInt(max) {
  if (!Number.isInteger(max) || max <= 0) return 0;
  return crypto.randomInt(0, max);
}

function pilihRarity(luck) {
  const w = hitungBobotRarity(luck);
  let roll = acakInt(10000);
  for (const rarity of RARITY_ORDER) {
    if (roll < w[rarity]) return rarity;
    roll -= w[rarity];
  }
  return "common";
}

function pilihIkan(rarity) {
  const list = FISH_BY_RARITY[rarity] || FISH_BY_RARITY.common;
  return list[acakInt(list.length)];
}

function beratAcak(fish) {
  const faktor = 0.9 + acakInt(201) / 1000;
  return Math.max(0.02, Math.round(fish.weight * faktor * 100) / 100);
}

function kerusakanJoran(fish) {
  const idx = Math.max(0, RARITY_ORDER.indexOf(fish.rarity));
  const kasar = fish.weight * 0.22 + idx * 0.8 + 0.6;
  return Math.max(1, Math.min(30, Math.round(kasar)));
}

function hitungPencapaianBaru(state) {
  const baru = [];
  const species = Object.keys(state.collection || {}).length;
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let nilai = 0;
    if (a.kind === "catches") nilai = state.totalCaught;
    else if (a.kind === "casts") nilai = state.stats.casts;
    else if (a.kind === "species") nilai = species;
    else if (a.kind === "earned") nilai = state.stats.totalEarned;
    else if (a.kind === "value") nilai = state.totalValue;
    else if (a.kind === "rods") nilai = state.rods.length;
    else if (a.kind === "rarity") nilai = state.stats.byRarity[a.rarity] || 0;
    if (nilai >= a.target) {
      state.achievements[a.id] = Date.now();
      baru.push(a);
    }
  }
  return baru;
}

async function verifikasiToken(absen, token) {
  if (typeof token !== "string" || token.length < 32) {
    throw new HttpsError("unauthenticated", "Sesi mancing tidak valid. Buka ulang game.");
  }
  const snap = await db.doc(`${COL.secrets}/${absen}`).get();
  const tokens = snap.exists && Array.isArray(snap.get("tokens")) ? snap.get("tokens") : [];
  const hash = hashToken(token);
  if (!tokens.includes(hash)) {
    throw new HttpsError("unauthenticated", "Sesi mancing sudah kedaluwarsa. Login ulang lalu buka game.");
  }
}

async function siapkanAksi(data) {
  const absen = nomorAbsen(data.absen);
  await verifikasiToken(absen, data.token);
  return { absen, ref: db.doc(`${COL.state}/${absen}`) };
}

async function aksiEnsure(data) {
  const absen = nomorAbsen(data.absen);
  const password = typeof data.password === "string" ? data.password : "";
  if (!password) throw new HttpsError("unauthenticated", "Password akun diperlukan untuk membuka game.");

  const accSnap = await db.doc(`accounts/${absen}`).get();
  const acc = accSnap.exists ? accSnap.data() : {};
  const passwordServer = typeof acc.password === "string" && acc.password ? acc.password : `73${absen}`;
  if (password !== passwordServer) {
    throw new HttpsError("unauthenticated", "Password akun tidak cocok. Login ulang dulu.");
  }
  const nama = (typeof acc.namaPanggilan === "string" && acc.namaPanggilan.trim()) || STUDENTS[absen] || "Pemancing";

  const stateRef = db.doc(`${COL.state}/${absen}`);
  const secretRef = db.doc(`${COL.secrets}/${absen}`);

  const hasil = await db.runTransaction(async (tx) => {
    const [secretSnap, stateSnap] = await Promise.all([tx.get(secretRef), tx.get(stateRef)]);
    let tokens = secretSnap.exists && Array.isArray(secretSnap.get("tokens")) ? secretSnap.get("tokens") : [];
    let tokenBaru = null;
    const tokenLama = typeof data.token === "string" ? data.token : "";
    if (!tokenLama || !tokens.includes(hashToken(tokenLama))) {
      tokenBaru = crypto.randomBytes(32).toString("hex");
      tokens = [...tokens, hashToken(tokenBaru)].slice(-3);
      tx.set(secretRef, { tokens, updatedAt: Timestamp.now() }, { merge: true });
    }

    let state;
    if (stateSnap.exists) {
      state = lengkapiState(stateSnap.data());
      if (state.name !== nama) state.name = nama;
      state.updatedAt = Timestamp.now();
    } else {
      state = stateAwal(absen, nama);
    }
    tx.set(stateRef, state);
    return { state, tokenBaru };
  });

  return {
    ok: true,
    token: hasil.tokenBaru,
    state: stateClient(hasil.state),
    catalogVersion: CATALOG_VERSION,
    serverNow: Date.now(),
  };
}

async function aksiCast(data) {
  const { absen, ref } = await siapkanAksi(data);
  const castRef = db.collection(COL.casts).doc();
  const sekarang = Date.now();
  const biteAt = sekarang + ECONOMY.castMinMs + acakInt(ECONOMY.castMaxMs - ECONOMY.castMinMs + 1);

  const hasil = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap. Buka ulang game.");
    const state = lengkapiState(snap.data());
    const now = Date.now();
    tandaiPermintaan(state, data.requestId);

    if (state.activeCast) {
      if (Number(state.activeCast.expiresAt) > now) {
        throw new HttpsError("failed-precondition", "Masih ada lemparan yang belum selesai. Tunggu sebentar.");
      }
      const lamaRef = db.collection(COL.casts).doc(String(state.activeCast.id || ""));
      const lamaSnap = await tx.get(lamaRef);
      if (lamaSnap.exists && lamaSnap.get("status") === "pending") {
        tx.update(lamaRef, { status: "expired", reason: "expired", resolvedAt: Timestamp.now() });
      }
      state.activeCast = null;
      state.stats.misses += 1;
    }

    const rod = state.rods.find((r) => r.id === state.equippedRod);
    if (!rod) throw new HttpsError("failed-precondition", "Joran tidak ditemukan.");
    if (rod.durability <= 0) throw new HttpsError("failed-precondition", "Joran rusak. Repair dulu di Toko.");
    const bait = BAIT_BY_ID[state.equippedBait];
    if (!bait) throw new HttpsError("failed-precondition", "Pilih umpan dulu di Tas.");
    const stokUmpan = state.baits[bait.id] || 0;
    if (stokUmpan <= 0) throw new HttpsError("failed-precondition", "Umpan habis. Beli lagi di Toko.");

    state.baits[bait.id] = stokUmpan - 1;
    if (state.baits[bait.id] <= 0) delete state.baits[bait.id];
    state.stats.casts += 1;

    const windowMs = ECONOMY.strikeWindowBaseMs + (rod.tier || 1) * ECONOMY.strikeWindowPerTierMs;
    const expiresAt = biteAt + windowMs + 1500;
    const luck = (rod.luck || 0) + (bait.luck || 0);
    const castId = castRef.id;

    state.activeCast = { id: castId, biteAt, windowMs, expiresAt, rodId: rod.id, baitId: bait.id, luck };
    state.updatedAt = Timestamp.now();

    tx.set(ref, state);
    tx.create(castRef, {
      absen,
      castId,
      biteAt,
      windowStart: biteAt + ECONOMY.strikeEarlyMs,
      windowEnd: biteAt + windowMs,
      expiresAt,
      rodId: rod.id,
      baitId: bait.id,
      luck,
      status: "pending",
      createdAt: Timestamp.now(),
    });
    return { state, castId, luck, windowMs, rodName: rod.name, baitName: bait.name };
  });

  return {
    ok: true,
    cast: {
      id: hasil.castId,
      biteAt,
      windowStart: biteAt + ECONOMY.strikeEarlyMs,
      windowEnd: biteAt + hasil.windowMs,
      windowMs: hasil.windowMs,
      serverNow: Date.now(),
      luck: hasil.luck,
      rodName: hasil.rodName,
      baitName: hasil.baitName,
      odds: peluangRarity(hasil.luck),
    },
    state: stateClient(hasil.state),
  };
}

async function aksiStrike(data) {
  const { absen, ref } = await siapkanAksi(data);
  const castId = typeof data.castId === "string" ? data.castId : "";
  if (!castId || castId.length > 128) throw new HttpsError("invalid-argument", "Lemparan tidak valid.");
  const castRef = db.collection(COL.casts).doc(castId);
  const metaRef = db.doc(`${COL.meta}/firstCatches`);
  const annRef = db.collection(COL.announce).doc();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
    const state = lengkapiState(snap.data());
    const castSnap = await tx.get(castRef);
    if (!castSnap.exists) throw new HttpsError("not-found", "Lemparan tidak ditemukan.");
    const cast = castSnap.data();
    if (Number(cast.absen) !== absen) throw new HttpsError("permission-denied", "Lemparan ini bukan milikmu.");
    if (cast.status !== "pending") throw new HttpsError("failed-precondition", "Hasil lemparan ini sudah diproses.");
    if (!state.activeCast || state.activeCast.id !== castId) {
      throw new HttpsError("failed-precondition", "Lemparan sudah tidak aktif.");
    }
    tandaiPermintaan(state, data.requestId);

    const now = Date.now();
    let gagal = "";
    if (now < Number(cast.windowStart)) gagal = "early";
    else if (now > Number(cast.windowEnd)) gagal = "late";
    else if (now > Number(cast.expiresAt)) gagal = "expired";

    const rod = state.rods.find((r) => r.id === cast.rodId);
    if (!gagal && !rod) gagal = "norod";

    if (gagal) {
      state.stats.misses += 1;
      state.activeCast = null;
      state.updatedAt = Timestamp.now();
      tx.set(ref, state);
      tx.update(castRef, { status: "miss", reason: gagal, resolvedAt: Timestamp.now() });
      const pesan =
        gagal === "early" ? "Kamu menarik pancing terlalu cepat!" :
        gagal === "late" ? "Ikan sudah kabur karena terlambat menarik!" :
        gagal === "expired" ? "Lemparan kedaluwarsa. Umpan hilang." :
        "Joran tidak ditemukan.";
      return {
        ok: false,
        reason: gagal,
        message: pesan,
        state: stateClient(state),
      };
    }

    const rarity = pilihRarity(cast.luck);
    const fish = pilihIkan(rarity);
    const weight = beratAcak(fish);
    const sudahPunya = !!(state.collection[fish.id]);
    const loss = kerusakanJoran(fish);

    state.fish[fish.id] = (state.fish[fish.id] || 0) + 1;
    const collLama = state.collection[fish.id];
    state.collection[fish.id] = {
      caught: (collLama ? collLama.caught : 0) + 1,
      firstAt: (collLama && collLama.firstAt) || Timestamp.now(),
    };
    state.totalCaught += 1;
    state.stats.catches += 1;
    state.stats.byRarity[rarity] = (state.stats.byRarity[rarity] || 0) + 1;
    if (!state.stats.biggest || weight > Number(state.stats.biggest.weight)) {
      state.stats.biggest = { fishId: fish.id, weight };
    }
    rod.durability = Math.max(0, rod.durability - loss);
    state.totalValue = hitungTotalValue(state);
    state.activeCast = null;
    state.updatedAt = Timestamp.now();

    let firstSlot = 0;
    if (rarity === "legend" || rarity === "secret") {
      const metaSnap = await tx.get(metaRef);
      const meta = metaSnap.exists ? metaSnap.data() : {};
      const daftar = Array.isArray(meta[rarity]) ? meta[rarity].slice() : [];
      if (daftar.length < 3 && !daftar.some((e) => Number(e.absen) === absen)) {
        firstSlot = daftar.length + 1;
        daftar.push({
          absen,
          name: state.name,
          fishId: fish.id,
          fishName: fish.name,
          at: Timestamp.now(),
          slot: firstSlot,
        });
        tx.set(metaRef, { [rarity]: daftar }, { merge: true });
      }
      tx.set(annRef, {
        type: rarity,
        absen,
        name: state.name,
        fishId: fish.id,
        fishName: fish.name,
        firstSlot,
        at: Timestamp.now(),
      }, { merge: false });
    }

    const pencapaian = hitungPencapaianBaru(state);
    tx.set(ref, state);
    tx.update(castRef, {
      status: "caught",
      fishId: fish.id,
      rarity,
      weight,
      firstSlot,
      resolvedAt: Timestamp.now(),
    });

    return {
      ok: true,
      fish,
      weight,
      rarity,
      durabilityLoss: loss,
      durability: rod.durability,
      isNew: !sudahPunya,
      firstSlot,
      achievements: pencapaian,
      state: stateClient(state),
    };
  });
}

async function aksiSell(data) {
  const { absen, ref } = await siapkanAksi(data);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
    const state = lengkapiState(snap.data());
    const mode = data.mode === "all" ? "all" : data.mode === "qty" ? "qty" : "one";
    tandaiPermintaan(state, data.requestId);
    const sold = [];
    let total = 0;

    if (mode === "all") {
      for (const [id, count] of Object.entries(state.fish)) {
        if (state.locked[id]) continue;
        const fish = FISH_BY_ID[id];
        if (!fish || count <= 0) continue;
        const nilai = fish.value * count;
        total += nilai;
        sold.push({ fishId: id, name: fish.name, qty: count, value: nilai });
        delete state.fish[id];
      }
      if (!sold.length) throw new HttpsError("failed-precondition", "Tidak ada ikan yang bisa dijual.");
    } else {
      const id = typeof data.fishId === "string" ? data.fishId : "";
      const fish = FISH_BY_ID[id];
      if (!fish) throw new HttpsError("invalid-argument", "Ikan tidak ditemukan.");
      if (state.locked[id]) throw new HttpsError("failed-precondition", "Ikan ini sedang dikunci.");
      const stok = state.fish[id] || 0;
      const qty = mode === "qty" ? Math.floor(Number(data.qty)) : 1;
      if (!Number.isInteger(qty) || qty < 1) throw new HttpsError("invalid-argument", "Jumlah jual tidak valid.");
      if (qty > ECONOMY.maxSellQty) throw new HttpsError("invalid-argument", "Jumlah jual terlalu banyak.");
      if (qty > stok) throw new HttpsError("failed-precondition", "Jumlah ikan tidak cukup.");
      total = fish.value * qty;
      const sisa = stok - qty;
      if (sisa > 0) state.fish[id] = sisa;
      else delete state.fish[id];
      sold.push({ fishId: id, name: fish.name, qty, value: total });
    }

    state.coins += total;
    state.stats.totalEarned += total;
    state.totalValue = hitungTotalValue(state);
    state.updatedAt = Timestamp.now();
    const pencapaian = hitungPencapaianBaru(state);
    tx.set(ref, state);
    return { ok: true, sold, total, achievements: pencapaian, state: stateClient(state) };
  });
}

async function aksiBuyRod(data) {
  const { ref } = await siapkanAksi(data);
  const rod = ROD_BY_ID[typeof data.rodId === "string" ? data.rodId : ""];
  if (!rod) throw new HttpsError("invalid-argument", "Joran tidak ditemukan.");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
    const state = lengkapiState(snap.data());
    if (state.rods.some((r) => r.id === rod.id)) throw new HttpsError("failed-precondition", "Joran ini sudah kamu miliki.");
    tandaiPermintaan(state, data.requestId);
    if (state.coins < rod.price) throw new HttpsError("failed-precondition", "Koin tidak cukup.");
    state.coins -= rod.price;
    state.stats.totalSpent += rod.price;
    state.rods.push({ id: rod.id, durability: rod.durability });
    state.equippedRod = rod.id;
    state.updatedAt = Timestamp.now();
    const pencapaian = hitungPencapaianBaru(state);
    tx.set(ref, state);
    return { ok: true, rod, achievements: pencapaian, state: stateClient(state) };
  });
}

async function aksiBuyBait(data) {
  const { ref } = await siapkanAksi(data);
  const bait = BAIT_BY_ID[typeof data.baitId === "string" ? data.baitId : ""];
  if (!bait) throw new HttpsError("invalid-argument", "Umpan tidak ditemukan.");
  const qty = Math.floor(Number(data.qty) || 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new HttpsError("invalid-argument", "Jumlah umpan tidak valid.");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
    const state = lengkapiState(snap.data());
    const total = bait.price * qty;
    tandaiPermintaan(state, data.requestId);
    if (state.coins < total) throw new HttpsError("failed-precondition", "Koin tidak cukup.");
    const stok = (state.baits[bait.id] || 0) + qty;
    if (stok > ECONOMY.maxBaitStack) throw new HttpsError("failed-precondition", "Stok umpan sudah penuh.");
    state.coins -= total;
    state.stats.totalSpent += total;
    state.baits[bait.id] = stok;
    if (!state.equippedBait || !(state.baits[state.equippedBait] > 0)) state.equippedBait = bait.id;
    state.updatedAt = Timestamp.now();
    tx.set(ref, state);
    return { ok: true, bait, qty, total, state: stateClient(state) };
  });
}

async function aksiRepair(data) {
  const { ref } = await siapkanAksi(data);
  const rodId = typeof data.rodId === "string" ? data.rodId : "";
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
    const state = lengkapiState(snap.data());
    const rod = state.rods.find((r) => r.id === rodId);
    const info = ROD_BY_ID[rodId];
    if (!rod || !info) throw new HttpsError("not-found", "Joran tidak ditemukan.");
    tandaiPermintaan(state, data.requestId);
    const hilang = info.durability - rod.durability;
    if (hilang <= 0) throw new HttpsError("failed-precondition", "Joran masih dalam kondisi penuh.");
    const biaya = hilang * info.repair;
    if (state.coins < biaya) throw new HttpsError("failed-precondition", "Koin tidak cukup untuk repair.");
    state.coins -= biaya;
    state.stats.totalSpent += biaya;
    rod.durability = info.durability;
    state.updatedAt = Timestamp.now();
    tx.set(ref, state);
    return { ok: true, cost: biaya, rodId, state: stateClient(state) };
  });
}

async function aksiEquip(data) {
  const { ref } = await siapkanAksi(data);
  const slot = data.slot === "bait" ? "bait" : "rod";
  const id = typeof data.id === "string" ? data.id : "";
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
    const state = lengkapiState(snap.data());
    tandaiPermintaan(state, data.requestId);
    if (slot === "rod") {
      if (!state.rods.some((r) => r.id === id)) throw new HttpsError("failed-precondition", "Joran belum kamu miliki.");
      state.equippedRod = id;
    } else {
      if (!BAIT_BY_ID[id]) throw new HttpsError("invalid-argument", "Umpan tidak ditemukan.");
      if (!(state.baits[id] > 0)) throw new HttpsError("failed-precondition", "Stok umpan ini habis.");
      state.equippedBait = id;
    }
    state.updatedAt = Timestamp.now();
    tx.set(ref, state);
    return { ok: true, state: stateClient(state) };
  });
}

async function aksiLock(data) {
  const { ref } = await siapkanAksi(data);
  const fishId = typeof data.fishId === "string" ? data.fishId : "";
  if (!FISH_BY_ID[fishId]) throw new HttpsError("invalid-argument", "Ikan tidak ditemukan.");
  const lock = data.locked === true;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
    const state = lengkapiState(snap.data());
    if (!state.fish[fishId]) throw new HttpsError("failed-precondition", "Ikan ini tidak ada di tas.");
    tandaiPermintaan(state, data.requestId);
    if (lock) state.locked[fishId] = true;
    else delete state.locked[fishId];
    state.updatedAt = Timestamp.now();
    tx.set(ref, state);
    return { ok: true, state: stateClient(state) };
  });
}

async function aksiState(data) {
  const { ref } = await siapkanAksi(data);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Data pemain belum siap.");
  return { ok: true, state: stateClient(lengkapiState(snap.data())), serverNow: Date.now() };
}

exports.fishingApi = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    const data = request.data && typeof request.data === "object" ? request.data : {};
    const action = typeof data.action === "string" ? data.action : "";
    try {
      if (action === "catalog" || action === "ping") {
        return { ok: true, catalog: katalogClient(), serverNow: Date.now() };
      }
      if (action === "ensure") return await aksiEnsure(data);
      if (action === "cast") return await aksiCast(data);
      if (action === "strike") return await aksiStrike(data);
      if (action === "sell") return await aksiSell(data);
      if (action === "buyRod") return await aksiBuyRod(data);
      if (action === "buyBait") return await aksiBuyBait(data);
      if (action === "repair") return await aksiRepair(data);
      if (action === "equip") return await aksiEquip(data);
      if (action === "lock") return await aksiLock(data);
      if (action === "state") return await aksiState(data);
      throw new HttpsError("invalid-argument", "Aksi game tidak dikenal.");
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("fishingApi error:", action, err);
      throw new HttpsError("internal", "Server mancing sedang sibuk. Coba lagi sebentar.");
    }
  }
);
