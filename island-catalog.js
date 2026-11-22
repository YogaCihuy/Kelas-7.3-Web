(function () {
  "use strict";

  // Katalog Island Tycoon (browser, tanpa Blaze).
  // Dipakai island-local.js (mesin) dan island.js (UI canvas).

  const CATALOG_VERSION = 1;

  // Dunia persegi 40x40 tile. Pinggir laut 2 tile di tiap sisi.
  const GRID = 40;
  const LAND_MIN = 2;
  const LAND_MAX = 37;
  const TILE = 48;

  // ── SUMBER DAYA ────────────────────────────────────────────────
  // buy  : harga jual NPC ke pemain
  // sell : harga beli NPC dari pemain
  const RESOURCES = [
    { id: "wood", nama: "Kayu", icon: "🪵", sell: 6, buy: 10, kategori: "material" },
    { id: "stone", nama: "Batu", icon: "🪨", sell: 8, buy: 14, kategori: "material" },
    { id: "grain", nama: "Gandum", icon: "🌾", sell: 9, buy: 14, kategori: "hasil" },
    { id: "corn", nama: "Jagung", icon: "🌽", sell: 12, buy: 18, kategori: "hasil" },
    { id: "carrot", nama: "Wortel", icon: "🥕", sell: 16, buy: 24, kategori: "hasil" },
    { id: "cotton", nama: "Kapas", icon: "☁️", sell: 20, buy: 30, kategori: "hasil" },
    { id: "plank", nama: "Papan Kayu", icon: "🪚", sell: 46, buy: 70, kategori: "olahan" },
    { id: "cement", nama: "Semen", icon: "🧱", sell: 58, buy: 88, kategori: "olahan" },
    { id: "flour", nama: "Tepung", icon: "🥣", sell: 44, buy: 66, kategori: "olahan" },
    { id: "bread", nama: "Roti", icon: "🍞", sell: 85, buy: 120, kategori: "konsumsi", hunger: 35 },
    { id: "juice", nama: "Jus", icon: "🧃", sell: 70, buy: 100, kategori: "konsumsi", thirst: 30 },
    { id: "water", nama: "Air Minum", icon: "💧", sell: 28, buy: 40, kategori: "konsumsi", thirst: 18 },
  ];

  const BIBIT = [
    { id: "bibit-gandum", nama: "Bibit Gandum", icon: "🌱", buy: 15, sell: 6, crop: "gandum" },
    { id: "bibit-jagung", nama: "Bibit Jagung", icon: "🌱", buy: 22, sell: 9, crop: "jagung" },
    { id: "bibit-wortel", nama: "Bibit Wortel", icon: "🌱", buy: 30, sell: 12, crop: "wortel" },
    { id: "bibit-kapas", nama: "Bibit Kapas", icon: "🌱", buy: 40, sell: 16, crop: "kapas" },
  ];

  // ── TANAMAN ────────────────────────────────────────────────────
  const CROPS = [
    { id: "gandum", nama: "Gandum", icon: "🌾", seedId: "bibit-gandum", growMs: 180000, yieldId: "grain", yieldQty: 4, xp: 4, levelReq: 1, warna: "#d9b23f" },
    { id: "jagung", nama: "Jagung", icon: "🌽", seedId: "bibit-jagung", growMs: 360000, yieldId: "corn", yieldQty: 4, xp: 5, levelReq: 2, warna: "#e0c04a" },
    { id: "wortel", nama: "Wortel", icon: "🥕", seedId: "bibit-wortel", growMs: 600000, yieldId: "carrot", yieldQty: 4, xp: 6, levelReq: 3, warna: "#dd7f38" },
    { id: "kapas", nama: "Kapas", icon: "☁️", seedId: "bibit-kapas", growMs: 900000, yieldId: "cotton", yieldQty: 4, xp: 8, levelReq: 4, warna: "#eef2ec" },
  ];

  // ── OBJEK ALAM ─────────────────────────────────────────────────
  // hp = jumlah kali interaksi sebelum habis, lalu respawn.
  const NATURAL = [
    { id: "pohon", nama: "Pohon", icon: "🌳", hp: 3, perHit: 2, yieldId: "wood", respawnMs: 180000, xp: 1, warna: "#3f7d4e" },
    { id: "batu", nama: "Batu", icon: "🪨", hp: 4, perHit: 2, yieldId: "stone", respawnMs: 300000, xp: 1, warna: "#8d968f" },
  ];

  // ── BANGUNAN (grid) ────────────────────────────────────────────
  // starter: sudah ada saat pulau dibuat (tidak bisa dibeli ulang).
  // pabrik  : punya resep, level, kapasitas, operasional.
  const BUILDINGS = [
    {
      id: "rumah", nama: "Rumah", icon: "🏠", w: 4, h: 4, harga: 0, levelReq: 1, starter: true,
      maxLevel: 5, deskripsi: "Rumah pemilik pulau. Level rumah menambah kenyamanan sehingga kebutuhan turun lebih lambat.",
      upgrade: { moneyPerLevel: 200, plankPerLevel: 3, cementPerLevel: 1 },
    },
    {
      id: "gudang", nama: "Gudang", icon: "🏚️", w: 4, h: 4, harga: 0, levelReq: 1, starter: true,
      maxLevel: 5, deskripsi: "Menyimpan semua sumber daya dan hasil produksi. Setiap level menambah kapasitas 160.",
      upgrade: { moneyPerLevel: 250, plankPerLevel: 4, cementPerLevel: 2 },
    },
    {
      id: "pondok", nama: "Pondok Pekerja", icon: "🏡", w: 3, h: 3, harga: 350, levelReq: 1,
      maxLevel: 3, deskripsi: "Rumah untuk pekerja. Setiap level menambah 1 slot pekerja.",
      upgrade: { moneyPerLevel: 220, plankPerLevel: 3, cementPerLevel: 0 },
    },
    {
      id: "plot", nama: "Lahan Tanam", icon: "🟫", w: 1, h: 1, harga: 60, levelReq: 1,
      maxLevel: 1, deskripsi: "Lahan 1x1 untuk menanam bibit. Panen tetap berjalan saat kamu offline.",
      upgrade: null,
    },
    {
      id: "pabrik-kayu", nama: "Pabrik Kayu", icon: "🪚", w: 4, h: 4, harga: 700, levelReq: 2,
      maxLevel: 5,
      deskripsi: "Mengolah kayu menjadi papan yang nilai jualnya jauh lebih tinggi.",
      resep: { inputs: { wood: 4 }, output: { id: "plank", qty: 2 }, timeMs: 120000, biaya: 12 },
      upgrade: { moneyPerLevel: 320, plankPerLevel: 4, cementPerLevel: 2 },
    },
    {
      id: "pabrik-air", nama: "Pabrik Air", icon: "💧", w: 3, h: 3, harga: 600, levelReq: 2,
      maxLevel: 5,
      deskripsi: "Memproduksi air minum untuk menjaga thirst karaktermu.",
      resep: { inputs: {}, output: { id: "water", qty: 3 }, timeMs: 60000, biaya: 10 },
      upgrade: { moneyPerLevel: 280, plankPerLevel: 3, cementPerLevel: 2 },
    },
    {
      id: "pabrik-pertanian", nama: "Pabrik Pertanian", icon: "🌾", w: 4, h: 4, harga: 850, levelReq: 3,
      maxLevel: 5,
      deskripsi: "Menggiling gandum menjadi tepung untuk pabrik makanan.",
      resep: { inputs: { grain: 3 }, output: { id: "flour", qty: 2 }, timeMs: 120000, biaya: 14 },
      upgrade: { moneyPerLevel: 340, plankPerLevel: 4, cementPerLevel: 3 },
    },
    {
      id: "pabrik-semen", nama: "Pabrik Semen", icon: "🧱", w: 4, h: 4, harga: 900, levelReq: 3,
      maxLevel: 5,
      deskripsi: "Mengolah batu menjadi semen untuk mengembangkan bangunan dan pabrik.",
      resep: { inputs: { stone: 4 }, output: { id: "cement", qty: 2 }, timeMs: 180000, biaya: 16 },
      upgrade: { moneyPerLevel: 360, plankPerLevel: 4, cementPerLevel: 3 },
    },
    {
      id: "pabrik-makanan", nama: "Pabrik Makanan", icon: "🍞", w: 4, h: 4, harga: 1100, levelReq: 4,
      maxLevel: 5,
      deskripsi: "Memanggang tepung dan air menjadi roti yang mengenyangkan.",
      resep: { inputs: { flour: 2, water: 1 }, output: { id: "bread", qty: 2 }, timeMs: 180000, biaya: 20 },
      upgrade: { moneyPerLevel: 400, plankPerLevel: 5, cementPerLevel: 4 },
    },
  ];

  // ── DEKORASI (bebas, tanpa grid) ───────────────────────────────
  const DECOR = [
    { id: "bunga", nama: "Bunga", icon: "🌼", harga: 25, warna: "#e8c85a" },
    { id: "batu-hias", nama: "Batu Hias", icon: "🪨", harga: 40, warna: "#9aa39b" },
    { id: "bangku", nama: "Bangku", icon: "🪑", harga: 80, warna: "#a97c4f" },
    { id: "pohon-hias", nama: "Pohon Hias", icon: "🌳", harga: 90, warna: "#4f8f5c" },
    { id: "lampu", nama: "Lampu Taman", icon: "🏮", harga: 120, warna: "#f2c14e" },
    { id: "patung", nama: "Patung", icon: "🗿", harga: 300, warna: "#a9b0ab" },
  ];

  // ── KENDARAAN ─────────────────────────────────────────────────
  const VEHICLES = [
    { id: "sepeda", nama: "Sepeda", icon: "🚲", harga: 350, speed: 3.2, levelReq: 1, warna: "#4f9d6b" },
    { id: "skuter", nama: "Skuter", icon: "🛵", harga: 800, speed: 4.6, levelReq: 2, warna: "#d98f3f" },
    { id: "mobil", nama: "Mobil", icon: "🚗", harga: 2000, speed: 6.0, levelReq: 4, warna: "#5d81c9" },
  ];

  // ── PEKERJA ────────────────────────────────────────────────────
  // Gaji dipotong otomatis tiap siklus selesai. Kalau uang tidak cukup,
  // pekerja berhenti sampai gajinya mampu dibayar lagi.
  const WORKER = {
    id: "lumberjack",
    nama: "Lumberjack",
    icon: "🪓",
    harga: 500,
    maxLevel: 5,
    slotBase: 3,
    slotMax: 8,
    slotPerPondok: 1,
    cycleMs: 120000,
    woodPerCycle: 2,
    wagePerCycle: 2,
    upgradeMoney: 400,
    upgradePlank: 2,
    deskripsi: "Menebang pohon di pulau secara otomatis dan menyimpan kayunya ke gudang.",
  };

  // ── KEBUTUHAN KARAKTER ─────────────────────────────────────────
  const NEEDS = {
    max: 100,
    hungerPerMenit: 0.30,
    thirstPerMenit: 0.45,
    rumahReductionPerLevel: 0.04,
    lemasBatas: 20,
    lemasSpeed: 0.6,
  };

  // ── EKONOMI & PROGRES ──────────────────────────────────────────
  const ECONOMY = {
    startMoney: 650,
    startInventory: { wood: 10, stone: 6, water: 2, bread: 1, "bibit-gandum": 3 },
    storageBase: 200,
    storagePerGudangLevel: 160,
    maxObject: 400,
    marketMaxQty: 999,
    marketMinPrice: 1,
    marketMaxPrice: 100000,
    marketMaxOffer: 5,
    maxLevel: 10,
    worldSize: GRID,
    landMin: LAND_MIN,
    landMax: LAND_MAX,
  };

  // XP minimal untuk tiap level (index 0 = level 1).
  const LEVELS = [0, 80, 200, 400, 700, 1100, 1600, 2200, 3000, 4000];

  const XP = {
    chop: 1,
    mine: 1,
    plant: 1,
    build: 5,
    factoryCollect: 5,
    sellMoneyPerXp: 100,
    visit: 0,
  };

  const RESOURCE_BY_ID = {};
  RESOURCES.forEach((r) => { RESOURCE_BY_ID[r.id] = r; });
  BIBIT.forEach((b) => { RESOURCE_BY_ID[b.id] = b; });

  const CROP_BY_ID = {};
  CROPS.forEach((c) => { CROP_BY_ID[c.id] = c; });

  const BUILDING_BY_ID = {};
  BUILDINGS.forEach((b) => { BUILDING_BY_ID[b.id] = b; });

  const NATURAL_BY_ID = {};
  NATURAL.forEach((n) => { NATURAL_BY_ID[n.id] = n; });

  const DECOR_BY_ID = {};
  DECOR.forEach((d) => { DECOR_BY_ID[d.id] = d; });

  const VEHICLE_BY_ID = {};
  VEHICLES.forEach((v) => { VEHICLE_BY_ID[v.id] = v; });

  function levelDariXp(xp) {
    const n = Math.max(0, Number(xp) || 0);
    let level = 1;
    for (let i = 0; i < LEVELS.length; i += 1) {
      if (n >= LEVELS[i]) level = i + 1;
    }
    return level;
  }

  function xpLevelAwal(level) {
    const l = Math.max(1, Math.min(LEVELS.length, Math.floor(Number(level) || 1)));
    return LEVELS[l - 1];
  }

  function xpLevelBerikut(level) {
    const l = Math.max(1, Math.min(LEVELS.length - 1, Math.floor(Number(level) || 1)));
    return LEVELS[l] || null;
  }

  function storageCapacity(gudangLevel, gudangCount) {
    const level = Math.max(1, Math.min(5, Math.floor(Number(gudangLevel) || 1)));
    const jumlah = Math.max(1, Math.floor(Number(gudangCount) || 1));
    return ECONOMY.storageBase + ECONOMY.storagePerGudangLevel * (level - 1) * jumlah;
  }

  function maxPekerja(pondokLevels) {
    let slot = WORKER.slotBase;
    (Array.isArray(pondokLevels) ? pondokLevels : []).forEach((lv) => {
      slot += WORKER.slotPerPondok * Math.max(1, Math.min(3, Math.floor(Number(lv) || 1)));
    });
    return Math.min(WORKER.slotMax, slot);
  }

  function kebutuhanTurun(rumahLevel) {
    const l = Math.max(1, Math.min(5, Math.floor(Number(rumahLevel) || 1)));
    return Math.max(0.5, 1 - NEEDS.rumahReductionPerLevel * (l - 1));
  }

  function bangunanTersedia(id, level) {
    const b = BUILDING_BY_ID[id];
    if (!b) return false;
    return Math.max(1, Number(level) || 1) >= (b.levelReq || 1);
  }

  function tanamanTersedia(id, level) {
    const c = CROP_BY_ID[id];
    if (!c) return false;
    return Math.max(1, Number(level) || 1) >= (c.levelReq || 1);
  }

  function kendaraanTersedia(id, level) {
    const v = VEHICLE_BY_ID[id];
    if (!v) return false;
    return Math.max(1, Number(level) || 1) >= (v.levelReq || 1);
  }

  function durasiPabrik(id, level) {
    const b = BUILDING_BY_ID[id];
    if (!b || !b.resep) return 0;
    const l = Math.max(1, Math.min(b.maxLevel || 5, Math.floor(Number(level) || 1)));
    return Math.max(10000, Math.round(b.resep.timeMs * Math.pow(0.92, l - 1)));
  }

  function hasilPabrik(id, level) {
    const b = BUILDING_BY_ID[id];
    if (!b || !b.resep) return 0;
    const l = Math.max(1, Math.min(b.maxLevel || 5, Math.floor(Number(level) || 1)));
    return b.resep.output.qty + Math.floor((l - 1) / 2);
  }

  function biayaOperasional(id, level) {
    const b = BUILDING_BY_ID[id];
    if (!b || !b.resep) return 0;
    const l = Math.max(1, Math.min(b.maxLevel || 5, Math.floor(Number(level) || 1)));
    return b.resep.biaya + 4 * (l - 1);
  }

  function kapasitasPabrik(level) {
    const l = Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
    return 2 + l;
  }

  function biayaUpgrade(id, levelSekarang) {
    const b = BUILDING_BY_ID[id];
    if (!b || !b.upgrade) return null;
    const l = Math.max(1, Math.floor(Number(levelSekarang) || 1));
    if (l >= (b.maxLevel || 1)) return null;
    return {
      money: (b.upgrade.moneyPerLevel || 0) * l,
      plank: (b.upgrade.plankPerLevel || 0) * l,
      cement: (b.upgrade.cementPerLevel || 0) * l,
    };
  }

  function hargaJual(id) {
    const r = RESOURCE_BY_ID[id];
    return r ? (Number(r.sell) || 0) : 0;
  }

  function hargaBeli(id) {
    const r = RESOURCE_BY_ID[id];
    return r ? (Number(r.buy) || 0) : 0;
  }

  window.IslandCatalog = {
    CATALOG_VERSION,
    GRID,
    LAND_MIN,
    LAND_MAX,
    TILE,
    RESOURCES,
    RESOURCE_BY_ID,
    BIBIT,
    CROPS,
    CROP_BY_ID,
    NATURAL,
    NATURAL_BY_ID,
    BUILDINGS,
    BUILDING_BY_ID,
    DECOR,
    DECOR_BY_ID,
    VEHICLES,
    VEHICLE_BY_ID,
    WORKER,
    NEEDS,
    ECONOMY,
    LEVELS,
    XP,
    levelDariXp,
    xpLevelAwal,
    xpLevelBerikut,
    storageCapacity,
    maxPekerja,
    kebutuhanTurun,
    bangunanTersedia,
    tanamanTersedia,
    kendaraanTersedia,
    durasiPabrik,
    hasilPabrik,
    biayaOperasional,
    kapasitasPabrik,
    biayaUpgrade,
    hargaJual,
    hargaBeli,
  };

})();
