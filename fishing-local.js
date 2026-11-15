/* ===================================================
   FISHING GAME — mesin lokal (tanpa Cloud Functions/Blaze)
   Semua aksi & RNG jalan di browser lalu ditulis ke Firestore
   lewat transaksi. Bentuk data sama dengan versi server supaya
   fishing.js tidak perlu diubah banyak.
=================================================== */
(function () {
  "use strict";

  const DATA = window.FishingCatalog;
  const COL = {
    state: "fishing",
    meta: "fishingMeta",
    announce: "fishingAnnouncements",
  };

  const WORKER = {
    max: 3,
    price: 3000,
    baseSpeedMs: 3600000,
    minSpeedMs: 1800000,
    stepMs: 300000,
    maxLevel: 6,
    upgradeCosts: [1500, 2200, 3000, 4000, 5200, 7000],
    maxCatchPerTick: 30,
    genders: [
      { id: "laki", label: "Laki-laki" },
      { id: "perempuan", label: "Perempuan" },
      { id: "lainnya", label: "Lainnya" },
    ],
    looks: [
      { id: "topi", emoji: "🧑‍🌾", label: "Nelayan Topi" },
      { id: "kapten", emoji: "🧑‍✈️", label: "Kapten" },
      { id: "anak", emoji: "🧒", label: "Anak Magang" },
      { id: "nenek", emoji: "👵", label: "Nenek Nelayan" },
      { id: "kakek", emoji: "👴", label: "Kakek Nelayan" },
      { id: "keren", emoji: "😎", label: "Nelayan Keren" },
    ],
  };

  function kecepatanWorker(level) {
    const lv = Math.max(0, Math.min(WORKER.maxLevel, Math.floor(Number(level) || 0)));
    return Math.max(WORKER.minSpeedMs, WORKER.baseSpeedMs - lv * WORKER.stepMs);
  }

  function biayaUpgradeWorker(level) {
    const lv = Math.max(0, Math.min(WORKER.maxLevel, Math.floor(Number(level) || 0)));
    return WORKER.upgradeCosts[lv] || 0;
  }

  function fs() {
    if (window.db) return window.db;
    if (window.firebase && typeof firebase.firestore === "function") return firebase.firestore();
    throw galat("Firestore belum siap. Refresh halaman.", "unavailable");
  }

  function galat(pesan, code) {
    const err = new Error(pesan);
    err.code = code || "failed-precondition";
    return err;
  }

  function ms(nilai) {
    if (!nilai) return 0;
    if (typeof nilai === "number") return nilai;
    if (typeof nilai.toMillis === "function") return nilai.toMillis();
    if (typeof nilai.seconds === "number") return nilai.seconds * 1000;
    return 0;
  }

  function acakInt(max) {
    if (!Number.isInteger(max) || max <= 0) return 0;
    return Math.floor(Math.random() * max);
  }

  function katalogClient() {
    return {
      version: DATA.CATALOG_VERSION,
      rarities: DATA.RARITY_INFO,
      rarityOrder: DATA.RARITY_ORDER,
      rarityBaseWeight: DATA.RARITY_BASE_WEIGHT,
      rarityCaps: DATA.RARITY_CAPS,
      fish: DATA.FISH,
      rods: DATA.RODS,
      baits: DATA.BAITS,
      economy: DATA.ECONOMY,
      achievements: DATA.ACHIEVEMENTS,
      worker: {
        max: WORKER.max,
        price: WORKER.price,
        baseSpeedMs: WORKER.baseSpeedMs,
        minSpeedMs: WORKER.minSpeedMs,
        stepMs: WORKER.stepMs,
        maxLevel: WORKER.maxLevel,
        upgradeCosts: WORKER.upgradeCosts,
        genders: WORKER.genders,
        looks: WORKER.looks,
      },
    };
  }

  function pengguna() {
    if (window.currentUser) return window.currentUser;
    try {
      return typeof currentUser !== "undefined" ? currentUser : null;
    } catch (err) {
      return null;
    }
  }

  function sesi(data) {
    const user = pengguna();
    if (!user || !user.absen) throw galat("Login dulu buat memancing.", "unauthenticated");
    const absen = Number(user.absen);
    if (!Number.isInteger(absen) || absen < 1 || absen > 64) {
      throw galat("Akun kelas tidak valid.", "invalid-argument");
    }
    if (data && data.absen != null && Number(data.absen) !== absen) {
      throw galat("Sesi mancing bukan milik akun ini.", "permission-denied");
    }
    return absen;
  }

  function namaSesi(absen) {
    const user = pengguna();
    if (user && Number(user.absen) === absen && user.namaPanggilan) return String(user.namaPanggilan).trim();
    try {
      const akun = typeof getMergedAccount === "function" ? getMergedAccount(absen) : null;
      if (akun && akun.namaPanggilan) return String(akun.namaPanggilan).trim();
    } catch (err) { /* pakai fallback */ }
    try {
      const daftar = (typeof dataSiswa !== "undefined" && dataSiswa) || window.dataSiswa || [];
      const siswa = daftar.find((s) => Number(s.absen) === absen);
      if (siswa && siswa.namaPanggilan) return String(siswa.namaPanggilan).trim();
    } catch (err) { /* pakai fallback */ }
    return "Pemancing";
  }

  function statsAwal() {
    return {
      casts: 0,
      catches: 0,
      misses: 0,
      totalEarned: 0,
      totalSpent: 0,
      byRarity: Object.fromEntries(DATA.RARITY_ORDER.map((r) => [r, 0])),
      biggest: null,
      autoSold: 0,
      autoSoldValue: 0,
      workerCatches: 0,
    };
  }

  function stateAwal(absen, nama) {
    const rod = DATA.ROD_BY_ID[DATA.ECONOMY.startRod];
    const now = Date.now();
    return {
      absen,
      name: nama || namaSesi(absen),
      coins: DATA.ECONOMY.startCoins,
      rods: [{ id: rod.id, durability: rod.durability }],
      equippedRod: rod.id,
      baits: { [DATA.ECONOMY.startBait]: DATA.ECONOMY.startBaitQty },
      equippedBait: DATA.ECONOMY.startBait,
      fish: {},
      locked: {},
      collection: {},
      totalValue: 0,
      totalCaught: 0,
      stats: statsAwal(),
      achievements: {},
      activeCast: null,
      autoSell: { enabled: false, minPrice: 0 },
      workers: [],
      requests: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
  }

  function tandaiPermintaan(state, requestId) {
    const id = typeof requestId === "string" ? requestId.trim() : "";
    if (!id || id.length < 8 || id.length > 80) {
      throw galat("Permintaan transaksi tidak valid.", "invalid-argument");
    }
    const list = Array.isArray(state.requests) ? state.requests : [];
    if (list.some((r) => r && r.id === id)) {
      throw galat("Transaksi ini sudah diproses.", "aborted");
    }
    state.requests = [{ id, at: Date.now() }, ...list].slice(0, 12);
  }

  function hitungTotalValue(state) {
    let total = 0;
    for (const [id, count] of Object.entries(state.fish || {})) {
      const fish = DATA.FISH_BY_ID[id];
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
        const info = DATA.ROD_BY_ID[r && r.id];
        if (!info) return null;
        const d = Number(r.durability);
        return {
          id: info.id,
          durability: Math.max(0, Math.min(info.durability, Math.floor(Number.isFinite(d) ? d : info.durability))),
        };
      })
      .filter(Boolean);
    if (!s.rods.length) s.rods = dasar.rods;

    const rodDipakaiWorker = new Set();
    const idWorkerDipakai = new Set();
    s.workers = (Array.isArray(raw.workers) ? raw.workers : [])
      .slice(0, WORKER.max)
      .map((rec, i) => {
        if (!rec || typeof rec !== "object") return null;
        let id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 40) : `w-${absen}-${i + 1}`;
        if (idWorkerDipakai.has(id)) {
          let n = i + 1;
          do { id = `w-${absen}-${n}`; n += 1; } while (idWorkerDipakai.has(id));
        }
        idWorkerDipakai.add(id);
        const gender = WORKER.genders.some((g) => g.id === rec.gender) ? rec.gender : WORKER.genders[0].id;
        const look = WORKER.looks.some((l) => l.id === rec.look) ? rec.look : WORKER.looks[0].id;
        let rodId = typeof rec.rodId === "string" ? rec.rodId : "";
        if (!s.rods.some((r) => r.id === rodId) || rodDipakaiWorker.has(rodId)) rodId = "";
        if (rodId) rodDipakaiWorker.add(rodId);
        return {
          id,
          name: typeof rec.name === "string" && rec.name.trim() ? rec.name.trim().slice(0, 20) : `Nelayan ${i + 1}`,
          gender,
          look,
          level: Math.max(0, Math.min(WORKER.maxLevel, Math.floor(Number(rec.level) || 0))),
          rodId,
          lastCatchAt: ms(rec.lastCatchAt) || Date.now(),
          catches: Math.max(0, Math.floor(Number(rec.catches) || 0)),
          earned: Math.max(0, Math.floor(Number(rec.earned) || 0)),
          hiredAt: ms(rec.hiredAt) || Date.now(),
        };
      })
      .filter(Boolean);

    const adaJoranBebas = s.rods.some((r) => !rodDipakaiWorker.has(r.id));
    if (!adaJoranBebas) s.equippedRod = "";
    else if (!s.equippedRod || rodDipakaiWorker.has(s.equippedRod) || !s.rods.some((r) => r.id === s.equippedRod)) {
      const bebas = s.rods.find((r) => !rodDipakaiWorker.has(r.id));
      s.equippedRod = bebas ? bebas.id : "";
    }

    const baits = {};
    for (const [id, count] of Object.entries(raw.baits || {})) {
      if (!DATA.BAIT_BY_ID[id]) continue;
      const n = Math.max(0, Math.min(DATA.ECONOMY.maxBaitStack, Math.floor(Number(count) || 0)));
      if (n > 0) baits[id] = n;
    }
    s.baits = baits;
    if (!DATA.BAIT_BY_ID[s.equippedBait] || !baits[s.equippedBait]) {
      const stok = Object.keys(baits).sort((a, b) => DATA.BAIT_BY_ID[a].tier - DATA.BAIT_BY_ID[b].tier);
      s.equippedBait = stok[0] || DATA.ECONOMY.startBait;
    }

    const fish = {};
    for (const [id, count] of Object.entries(raw.fish || {})) {
      if (!DATA.FISH_BY_ID[id]) continue;
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
      if (!DATA.FISH_BY_ID[id]) continue;
      const caught = Math.max(0, Math.floor(Number(rec && rec.caught) || 0));
      collection[id] = { caught, firstAt: ms(rec && rec.firstAt) || Date.now() };
    }
    s.collection = collection;

    s.stats = { ...statsAwal(), ...(raw.stats || {}) };
    s.stats.byRarity = { ...statsAwal().byRarity, ...((raw.stats && raw.stats.byRarity) || {}) };
    ["casts", "catches", "misses", "totalEarned", "totalSpent", "autoSold", "autoSoldValue", "workerCatches"].forEach((k) => {
      s.stats[k] = Math.max(0, Math.floor(Number(s.stats[k]) || 0));
    });
    if (s.stats.biggest && (!DATA.FISH_BY_ID[s.stats.biggest.fishId] || !Number.isFinite(Number(s.stats.biggest.weight)))) {
      s.stats.biggest = null;
    }

    s.achievements = raw.achievements && typeof raw.achievements === "object" ? { ...raw.achievements } : {};
    s.requests = Array.isArray(raw.requests)
      ? raw.requests.filter((r) => r && typeof r.id === "string" && Number.isFinite(Number(r.at))).slice(0, 12)
      : [];
    s.totalCaught = Math.max(0, Math.floor(Number(raw.totalCaught) || 0));
    s.totalValue = hitungTotalValue(s);
    s.activeCast = raw.activeCast && typeof raw.activeCast === "object" ? raw.activeCast : null;
    s.autoSell = {
      enabled: !!(raw.autoSell && raw.autoSell.enabled === true),
      minPrice: Math.max(0, Math.min(1000000, Math.floor(Number(raw.autoSell && raw.autoSell.minPrice) || 0))),
    };
    s.createdAt = ms(raw.createdAt) || Date.now();
    s.updatedAt = ms(raw.updatedAt) || Date.now();
    s.version = Number(raw.version) || 1;
    return s;
  }

  function stateClient(state) {
    const out = { ...state };
    out.createdAt = ms(state.createdAt);
    out.updatedAt = ms(state.updatedAt);
    out.collection = Object.fromEntries(
      Object.entries(state.collection || {}).map(([id, rec]) => [id, { caught: rec.caught || 0, firstAt: ms(rec.firstAt) }])
    );
    if (state.activeCast) out.activeCast = { ...state.activeCast };
    return out;
  }

  function pilihRarity(luck) {
    const w = DATA.hitungBobotRarity(luck);
    let roll = acakInt(10000);
    for (const rarity of DATA.RARITY_ORDER) {
      if (roll < w[rarity]) return rarity;
      roll -= w[rarity];
    }
    return "common";
  }

  function pilihIkan(rarity) {
    const list = DATA.FISH_BY_RARITY[rarity] || DATA.FISH_BY_RARITY.common;
    return list[acakInt(list.length)];
  }

  function beratAcak(fish) {
    const faktor = 0.9 + acakInt(201) / 1000;
    return Math.max(0.02, Math.round(fish.weight * faktor * 100) / 100);
  }

  function kerusakanJoran(fish) {
    const idx = Math.max(0, DATA.RARITY_ORDER.indexOf(fish.rarity));
    const kasar = fish.weight * 0.22 + idx * 0.8 + 0.6;
    return Math.max(1, Math.min(30, Math.round(kasar)));
  }

  function hitungPencapaianBaru(state) {
    const baru = [];
    const species = Object.keys(state.collection || {}).length;
    for (const a of DATA.ACHIEVEMENTS) {
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

  function autoSellAktif(state) {
    return !!(state.autoSell && state.autoSell.enabled === true && Number(state.autoSell.minPrice) > 0);
  }

  function kenaAutoSell(state, fish) {
    return autoSellAktif(state) && !state.locked[fish.id] && fish.value < Number(state.autoSell.minPrice);
  }

  function tangkapIkan(state, rod, luck, now) {
    const rarity = pilihRarity(luck);
    const fish = pilihIkan(rarity);
    const weight = beratAcak(fish);
    const sudahPunya = !!(state.collection[fish.id]);
    const loss = kerusakanJoran(fish);

    state.fish[fish.id] = (state.fish[fish.id] || 0) + 1;
    const collLama = state.collection[fish.id];
    state.collection[fish.id] = {
      caught: (collLama ? collLama.caught : 0) + 1,
      firstAt: (collLama && collLama.firstAt) || now,
    };
    state.totalCaught += 1;
    state.stats.catches += 1;
    state.stats.byRarity[rarity] = (state.stats.byRarity[rarity] || 0) + 1;
    if (!state.stats.biggest || weight > Number(state.stats.biggest.weight)) {
      state.stats.biggest = { fishId: fish.id, weight };
    }
    rod.durability = Math.max(0, rod.durability - loss);

    let autoSold = 0;
    if (kenaAutoSell(state, fish)) {
      state.fish[fish.id] = (state.fish[fish.id] || 0) - 1;
      if (state.fish[fish.id] <= 0) delete state.fish[fish.id];
      state.coins += fish.value;
      state.stats.totalEarned += fish.value;
      state.stats.autoSold += 1;
      state.stats.autoSoldValue += fish.value;
      autoSold = fish.value;
    }

    return { fish, rarity, weight, loss, isNew: !sudahPunya, autoSold };
  }

  async function bacaMeta(tx) {
    const ref = fs().doc(`${COL.meta}/firstCatches`);
    const snap = await tx.get(ref);
    const raw = snap.exists ? snap.data() || {} : {};
    return {
      ref,
      data: {
        legend: Array.isArray(raw.legend) ? raw.legend.slice(0, 3) : [],
        secret: Array.isArray(raw.secret) ? raw.secret.slice(0, 3) : [],
      },
      berubah: false,
    };
  }

  async function siapkanMeta(tx, state, paksa) {
    if (!paksa && !adaWorkerAktif(state)) return null;
    return bacaMeta(tx);
  }

  function catatFirstCatch(tx, state, absen, metaPack, rarity, fish) {
    if (!metaPack || (rarity !== "legend" && rarity !== "secret")) return 0;
    const daftar = metaPack.data[rarity];
    if (daftar.length >= 3 || daftar.some((e) => Number(e.absen) === absen)) return 0;
    const slot = daftar.length + 1;
    daftar.push({
      absen,
      name: state.name,
      fishId: fish.id,
      fishName: fish.name,
      at: Date.now(),
      slot,
    });
    metaPack.berubah = true;
    const annRef = fs().collection(COL.announce).doc();
    tx.set(annRef, {
      type: rarity,
      absen,
      name: state.name,
      fishId: fish.id,
      fishName: fish.name,
      firstSlot: slot,
      at: Date.now(),
    });
    return slot;
  }

  function adaWorkerAktif(state) {
    return (state.workers || []).some((w) => {
      const rod = state.rods.find((r) => r.id === w.rodId);
      return !!rod && rod.durability > 0;
    });
  }

  function prosesPekerja(tx, state, now, metaPack) {
    const hasil = [];
    if (!Array.isArray(state.workers) || !state.workers.length) return hasil;

    for (const w of state.workers) {
      const rod = state.rods.find((r) => r.id === w.rodId);
      if (!rod || rod.durability <= 0) continue;
      if (state.activeCast && String(state.activeCast.rodId) === rod.id) continue;
      const speed = kecepatanWorker(w.level);
      if (!Number.isFinite(w.lastCatchAt) || w.lastCatchAt <= 0) w.lastCatchAt = now - speed;
      let jumlah = 0;

      // Sisa waktu di atas batas per tick sengaja tidak direset supaya
      // hasil AFK tetap diproses bertahap di tick berikutnya.
      while (now - w.lastCatchAt >= speed && rod.durability > 0 && jumlah < WORKER.maxCatchPerTick) {
        w.lastCatchAt += speed;
        const infoRod = DATA.ROD_BY_ID[rod.id];
        const tangkap = tangkapIkan(state, rod, (infoRod && infoRod.luck) || 0, now);
        w.catches += 1;
        w.earned += tangkap.fish.value;
        state.stats.workerCatches += 1;
        const slot = catatFirstCatch(tx, state, state.absen, metaPack, tangkap.rarity, tangkap.fish);
        hasil.push({
          workerId: w.id,
          workerName: w.name,
          fishId: tangkap.fish.id,
          fishName: tangkap.fish.name,
          rarity: tangkap.rarity,
          weight: tangkap.weight,
          value: tangkap.fish.value,
          autoSold: tangkap.autoSold,
          firstSlot: slot,
        });
        jumlah += 1;
      }

      if (rod.durability <= 0) w.lastCatchAt = now;
    }

    if (hasil.length) {
      state.totalValue = hitungTotalValue(state);
      state.updatedAt = now;
    }
    return hasil;
  }

  function refState(absen) {
    return fs().collection(COL.state).doc(String(absen));
  }

  function bacaState(snap) {
    if (!snap || !snap.exists) throw galat("Data pemain belum siap. Buka ulang game.");
    return lengkapiState(snap.data());
  }

  /* ================= AKSI ================= */
  async function aksiEnsure(data) {
    const absen = sesi(data);
    const nama = namaSesi(absen);
    const ref = refState(absen);
    const hasil = await fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let s;
      if (snap.exists) {
        s = lengkapiState(snap.data());
        if (nama && s.name !== nama) s.name = nama;
      } else {
        s = stateAwal(absen, nama);
      }
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, s, false);
      const ambil = prosesPekerja(tx, s, now, metaPack);
      let pencapaian = [];
      if (ambil.length) pencapaian = hitungPencapaianBaru(s);
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      s.updatedAt = now;
      tx.set(ref, s);
      return { state: s, achievements: pencapaian, workerCatches: ambil };
    });
    return {
      ok: true,
      token: "",
      state: stateClient(hasil.state),
      achievements: hasil.achievements,
      workerCatches: hasil.workerCatches,
      catalogVersion: DATA.CATALOG_VERSION,
      serverNow: Date.now(),
    };
  }

  async function aksiCast(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const sekarang = Date.now();
    const biteAt = sekarang + DATA.ECONOMY.castMinMs + acakInt(DATA.ECONOMY.castMaxMs - DATA.ECONOMY.castMinMs + 1);
    const castId = `cast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    const hasil = await fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const now = Date.now();
      tandaiPermintaan(state, data.requestId);

      if (state.activeCast) {
        if (Number(state.activeCast.expiresAt) > now) {
          throw galat("Masih ada lemparan yang belum selesai. Tunggu sebentar.");
        }
        state.activeCast = null;
        state.stats.misses += 1;
      }

      const dipakaiWorker = new Set((state.workers || []).map((w) => w.rodId).filter(Boolean));
      const rod = state.rods.find((r) => r.id === state.equippedRod && !dipakaiWorker.has(r.id));
      if (!rod) throw galat("Tidak ada joran bebas. Lepas joran dari Worker atau beli joran baru.");
      if (rod.durability <= 0) throw galat("Joran rusak. Repair dulu di Toko.");
      const infoRod = DATA.ROD_BY_ID[rod.id];
      const bait = DATA.BAIT_BY_ID[state.equippedBait];
      if (!bait) throw galat("Pilih umpan dulu di Tas.");
      const stokUmpan = state.baits[bait.id] || 0;
      if (stokUmpan <= 0) throw galat("Umpan habis. Beli lagi di Toko.");

      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);

      state.baits[bait.id] = stokUmpan - 1;
      if (state.baits[bait.id] <= 0) delete state.baits[bait.id];
      state.stats.casts += 1;
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];

      const windowMs = DATA.ECONOMY.strikeWindowBaseMs + ((infoRod && infoRod.tier) || 1) * DATA.ECONOMY.strikeWindowPerTierMs;
      const expiresAt = biteAt + windowMs + 1500;
      const luck = ((infoRod && infoRod.luck) || 0) + (bait.luck || 0);

      state.activeCast = { id: castId, biteAt, windowMs, expiresAt, rodId: rod.id, baitId: bait.id, luck };
      state.updatedAt = Date.now();
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);

      return {
        state,
        castId,
        luck,
        windowMs,
        rodName: infoRod ? infoRod.name : "",
        baitName: bait.name,
        workerCatches: ambil,
        achievements: pencapaian,
      };
    });

    return {
      ok: true,
      cast: {
        id: hasil.castId,
        biteAt,
        windowStart: biteAt + DATA.ECONOMY.strikeEarlyMs,
        windowEnd: biteAt + hasil.windowMs,
        windowMs: hasil.windowMs,
        serverNow: Date.now(),
        luck: hasil.luck,
        rodName: hasil.rodName,
        baitName: hasil.baitName,
        odds: DATA.peluangRarity(hasil.luck),
      },
      achievements: hasil.achievements,
      workerCatches: hasil.workerCatches,
      state: stateClient(hasil.state),
    };
  }

  async function aksiStrike(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const castId = typeof data.castId === "string" ? data.castId : "";
    if (!castId || castId.length > 128) throw galat("Lemparan tidak valid.", "invalid-argument");

    const hasil = await fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      if (!state.activeCast || String(state.activeCast.id) !== castId) {
        throw galat("Lemparan sudah tidak aktif.");
      }
      tandaiPermintaan(state, data.requestId);

      const cast = state.activeCast;
      const biteAt = Number(cast.biteAt) || 0;
      const windowStart = biteAt + DATA.ECONOMY.strikeEarlyMs;
      const windowEnd = biteAt + (Number(cast.windowMs) || 0);
      const expiresAt = Number(cast.expiresAt) || 0;
      const now = Date.now();

      let gagal = "";
      if (now < windowStart) gagal = "early";
      else if (now > windowEnd) gagal = "late";
      else if (expiresAt && now > expiresAt) gagal = "expired";

      const dipakaiWorker = new Set((state.workers || []).map((w) => w.rodId).filter(Boolean));
      const rod = state.rods.find((r) => r.id === cast.rodId && !dipakaiWorker.has(r.id));
      if (!gagal && !rod) gagal = "norod";

      const metaPack = await siapkanMeta(tx, state, true);
      const ambil = prosesPekerja(tx, state, now, metaPack);

      if (gagal) {
        state.stats.misses += 1;
        state.activeCast = null;
        state.updatedAt = Date.now();
        const pencapaian = hitungPencapaianBaru(state);
        if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
        tx.set(ref, state);
        const pesan =
          gagal === "early" ? "Kamu menarik pancing terlalu cepat!" :
          gagal === "late" ? "Ikan sudah kabur karena terlambat menarik!" :
          gagal === "expired" ? "Lemparan kedaluwarsa. Umpan hilang." :
          "Joran sedang dipakai Worker.";
        return {
          ok: false,
          reason: gagal,
          message: pesan,
          achievements: pencapaian,
          workerCatches: ambil,
          state: stateClient(state),
        };
      }

      const tangkap = tangkapIkan(state, rod, cast.luck, now);
      const firstSlot = catatFirstCatch(tx, state, absen, metaPack, tangkap.rarity, tangkap.fish);
      state.totalValue = hitungTotalValue(state);
      state.activeCast = null;
      state.updatedAt = Date.now();

      const pencapaian = hitungPencapaianBaru(state);
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);

      return {
        ok: true,
        fish: tangkap.fish,
        weight: tangkap.weight,
        rarity: tangkap.rarity,
        durabilityLoss: tangkap.loss,
        durability: rod.durability,
        isNew: tangkap.isNew,
        autoSold: tangkap.autoSold,
        firstSlot,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });

    return hasil;
  }

  async function aksiSell(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const mode = data.mode === "all" ? "all" : data.mode === "qty" ? "qty" : "one";
      tandaiPermintaan(state, data.requestId);
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);
      const sold = [];
      let total = 0;

      if (mode === "all") {
        for (const [id, count] of Object.entries(state.fish)) {
          if (state.locked[id]) continue;
          const fish = DATA.FISH_BY_ID[id];
          if (!fish || count <= 0) continue;
          const nilai = fish.value * count;
          total += nilai;
          sold.push({ fishId: id, name: fish.name, qty: count, value: nilai });
          delete state.fish[id];
        }
        if (!sold.length) throw galat("Tidak ada ikan yang bisa dijual.");
      } else {
        const id = typeof data.fishId === "string" ? data.fishId : "";
        const fish = DATA.FISH_BY_ID[id];
        if (!fish) throw galat("Ikan tidak ditemukan.", "invalid-argument");
        if (state.locked[id]) throw galat("Ikan ini sedang dikunci.");
        const stok = state.fish[id] || 0;
        const qty = mode === "qty" ? Math.floor(Number(data.qty)) : 1;
        if (!Number.isInteger(qty) || qty < 1) throw galat("Jumlah jual tidak valid.", "invalid-argument");
        if (qty > DATA.ECONOMY.maxSellQty) throw galat("Jumlah jual terlalu banyak.", "invalid-argument");
        if (qty > stok) throw galat("Jumlah ikan tidak cukup.");
        total = fish.value * qty;
        const sisa = stok - qty;
        if (sisa > 0) state.fish[id] = sisa;
        else delete state.fish[id];
        sold.push({ fishId: id, name: fish.name, qty, value: total });
      }

      state.coins += total;
      state.stats.totalEarned += total;
      state.totalValue = hitungTotalValue(state);
      state.updatedAt = Date.now();
      const pencapaian = hitungPencapaianBaru(state);
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        sold,
        total,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiBuyRod(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const rod = DATA.ROD_BY_ID[typeof data.rodId === "string" ? data.rodId : ""];
    if (!rod) throw galat("Joran tidak ditemukan.", "invalid-argument");
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      if (state.rods.some((r) => r.id === rod.id)) throw galat("Joran ini sudah kamu miliki.");
      tandaiPermintaan(state, data.requestId);
      if (state.coins < rod.price) throw galat("Koin tidak cukup.");
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);
      state.coins -= rod.price;
      state.stats.totalSpent += rod.price;
      state.rods.push({ id: rod.id, durability: rod.durability });
      state.equippedRod = rod.id;
      state.updatedAt = Date.now();
      const pencapaian = hitungPencapaianBaru(state);
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        rod,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiBuyBait(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const bait = DATA.BAIT_BY_ID[typeof data.baitId === "string" ? data.baitId : ""];
    if (!bait) throw galat("Umpan tidak ditemukan.", "invalid-argument");
    const qty = Math.floor(Number(data.qty) || 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw galat("Jumlah umpan tidak valid.", "invalid-argument");
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const total = bait.price * qty;
      tandaiPermintaan(state, data.requestId);
      if (state.coins < total) throw galat("Koin tidak cukup.");
      const stok = (state.baits[bait.id] || 0) + qty;
      if (stok > DATA.ECONOMY.maxBaitStack) throw galat("Stok umpan sudah penuh.");
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, Date.now(), metaPack);
      state.coins -= total;
      state.stats.totalSpent += total;
      state.baits[bait.id] = stok;
      if (!state.equippedBait || !(state.baits[state.equippedBait] > 0)) state.equippedBait = bait.id;
      state.updatedAt = Date.now();
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        bait,
        qty,
        total,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiRepair(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const rodId = typeof data.rodId === "string" ? data.rodId : "";
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const rod = state.rods.find((r) => r.id === rodId);
      const info = DATA.ROD_BY_ID[rodId];
      if (!rod || !info) throw galat("Joran tidak ditemukan.", "not-found");
      tandaiPermintaan(state, data.requestId);
      const hilang = info.durability - rod.durability;
      if (hilang <= 0) throw galat("Joran masih dalam kondisi penuh.");
      const biaya = hilang * info.repair;
      if (state.coins < biaya) throw galat("Koin tidak cukup untuk repair.");
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);
      state.coins -= biaya;
      state.stats.totalSpent += biaya;
      rod.durability = info.durability;
      (state.workers || []).forEach((w) => {
        if (w.rodId === rodId) w.lastCatchAt = now;
      });
      state.updatedAt = Date.now();
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        cost: biaya,
        rodId,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiEquip(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const slot = data.slot === "bait" ? "bait" : "rod";
    const id = typeof data.id === "string" ? data.id : "";
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      tandaiPermintaan(state, data.requestId);
      if (slot === "rod") {
        if (!state.rods.some((r) => r.id === id)) throw galat("Joran belum kamu miliki.");
        const pemakai = (state.workers || []).find((w) => w.rodId === id);
        if (pemakai) throw galat(`Joran ini sedang dipakai Worker ${pemakai.name}. Lepas dulu dari Worker.`);
        state.equippedRod = id;
      } else {
        if (!DATA.BAIT_BY_ID[id]) throw galat("Umpan tidak ditemukan.", "invalid-argument");
        if (!(state.baits[id] > 0)) throw galat("Stok umpan ini habis.");
        state.equippedBait = id;
      }
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, Date.now(), metaPack);
      state.updatedAt = Date.now();
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiLock(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const fishId = typeof data.fishId === "string" ? data.fishId : "";
    if (!DATA.FISH_BY_ID[fishId]) throw galat("Ikan tidak ditemukan.", "invalid-argument");
    const lock = data.locked === true;
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      if (!state.fish[fishId]) throw galat("Ikan ini tidak ada di tas.");
      tandaiPermintaan(state, data.requestId);
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, Date.now(), metaPack);
      if (lock) state.locked[fishId] = true;
      else delete state.locked[fishId];
      state.updatedAt = Date.now();
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiState(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const hasil = await fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);
      let pencapaian = [];
      if (ambil.length) {
        pencapaian = hitungPencapaianBaru(state);
        tx.set(ref, state);
      }
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      return { state, achievements: pencapaian, workerCatches: ambil };
    });
    return {
      ok: true,
      state: stateClient(hasil.state),
      achievements: hasil.achievements,
      workerCatches: hasil.workerCatches,
      serverNow: Date.now(),
    };
  }

  function cariWorker(state, id) {
    const worker = (state.workers || []).find((w) => w.id === id);
    if (!worker) throw galat("Worker tidak ditemukan.", "not-found");
    return worker;
  }

  function idWorkerBaru(state) {
    let id = "";
    do {
      id = `w-${state.absen}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    } while ((state.workers || []).some((w) => w.id === id));
    return id.slice(0, 40);
  }

  function namaWorkerBaru(nama, fallback) {
    const teks = typeof nama === "string" ? nama.trim().replace(/\s+/g, " ") : "";
    if (!teks) {
      if (fallback) return fallback;
      throw galat("Nama Worker wajib diisi.", "invalid-argument");
    }
    if (teks.length > 20) throw galat("Nama Worker maksimal 20 karakter.", "invalid-argument");
    return teks;
  }

  function genderWorkerBaru(gender, fallback) {
    if (!gender) return fallback || WORKER.genders[0].id;
    if (!WORKER.genders.some((g) => g.id === gender)) {
      throw galat("Gender Worker tidak valid.", "invalid-argument");
    }
    return gender;
  }

  function lookWorkerBaru(look, fallback) {
    if (!look) return fallback || WORKER.looks[0].id;
    if (!WORKER.looks.some((l) => l.id === look)) {
      throw galat("Penampilan Worker tidak valid.", "invalid-argument");
    }
    return look;
  }

  async function aksiSetAutoSell(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const minPrice = Math.floor(Number(data.minPrice));
    if (!Number.isInteger(minPrice) || minPrice < 0 || minPrice > 1000000) {
      throw galat("Ambang harga Auto Sell tidak valid.", "invalid-argument");
    }
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      tandaiPermintaan(state, data.requestId);
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, Date.now(), metaPack);
      state.autoSell = { enabled: data.enabled === true, minPrice };
      state.updatedAt = Date.now();
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        autoSell: state.autoSell,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiBuyWorker(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      if (state.workers.length >= WORKER.max) throw galat(`Maksimal ${WORKER.max} Worker.`);
      tandaiPermintaan(state, data.requestId);
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);
      if (state.coins < WORKER.price) throw galat("Koin tidak cukup untuk merekrut Worker.");

      const worker = {
        id: idWorkerBaru(state),
        name: namaWorkerBaru(data.name, `Nelayan ${state.workers.length + 1}`),
        gender: genderWorkerBaru(data.gender),
        look: lookWorkerBaru(data.look),
        level: 0,
        rodId: "",
        lastCatchAt: now,
        catches: 0,
        earned: 0,
        hiredAt: now,
      };
      state.coins -= WORKER.price;
      state.stats.totalSpent += WORKER.price;
      state.workers.push(worker);
      state.updatedAt = Date.now();
      const pencapaian = hitungPencapaianBaru(state);
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        worker,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiUpdateWorker(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const workerId = typeof data.workerId === "string" ? data.workerId : "";
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const worker = cariWorker(state, workerId);
      tandaiPermintaan(state, data.requestId);
      worker.name = namaWorkerBaru(data.name, worker.name);
      worker.gender = genderWorkerBaru(data.gender, worker.gender);
      worker.look = lookWorkerBaru(data.look, worker.look);
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, Date.now(), metaPack);
      state.updatedAt = Date.now();
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        worker,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiUpgradeWorker(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const workerId = typeof data.workerId === "string" ? data.workerId : "";
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const worker = cariWorker(state, workerId);
      if (worker.level >= WORKER.maxLevel) throw galat("Kecepatan Worker sudah maksimal.");
      tandaiPermintaan(state, data.requestId);
      const cost = biayaUpgradeWorker(worker.level);
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, Date.now(), metaPack);
      if (state.coins < cost) throw galat("Koin tidak cukup untuk upgrade Worker.");
      state.coins -= cost;
      state.stats.totalSpent += cost;
      worker.level += 1;
      state.updatedAt = Date.now();
      const pencapaian = hitungPencapaianBaru(state);
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        cost,
        level: worker.level,
        speedMs: kecepatanWorker(worker.level),
        worker,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiAssignWorkerRod(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const workerId = typeof data.workerId === "string" ? data.workerId : "";
    const rodId = typeof data.rodId === "string" ? data.rodId : "";
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const worker = cariWorker(state, workerId);

      if (!rodId) {
        tandaiPermintaan(state, data.requestId);
        const metaPack = await siapkanMeta(tx, state, false);
        const ambil = prosesPekerja(tx, state, Date.now(), metaPack);
        worker.rodId = "";
        worker.lastCatchAt = Date.now();
        const dipakai = new Set(state.workers.map((w) => w.rodId).filter(Boolean));
        if (state.equippedRod && (dipakai.has(state.equippedRod) || !state.rods.some((r) => r.id === state.equippedRod))) {
          const bebas = state.rods.find((r) => !dipakai.has(r.id));
          state.equippedRod = bebas ? bebas.id : "";
        }
        if (!state.equippedRod) {
          const bebas = state.rods.find((r) => !dipakai.has(r.id));
          state.equippedRod = bebas ? bebas.id : "";
        }
        state.updatedAt = Date.now();
        const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
        if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
        tx.set(ref, state);
        return {
          ok: true,
          worker,
          achievements: pencapaian,
          workerCatches: ambil,
          state: stateClient(state),
        };
      }

      if (!state.rods.some((r) => r.id === rodId)) throw galat("Joran belum kamu miliki.", "not-found");
      if (worker.rodId === rodId) throw galat("Joran ini sudah dipakai Worker ini.");
      const pemakai = state.workers.find((w) => w.id !== worker.id && w.rodId === rodId);
      if (pemakai) throw galat(`Joran ini sudah dipakai Worker ${pemakai.name}.`);
      if (state.activeCast && String(state.activeCast.rodId) === rodId) {
        throw galat("Joran ini sedang dipakai untuk lemparanmu. Selesaikan dulu.");
      }

      tandaiPermintaan(state, data.requestId);
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);
      worker.rodId = rodId;
      worker.lastCatchAt = now;

      const dipakai = new Set(state.workers.map((w) => w.rodId).filter(Boolean));
      if (state.equippedRod === rodId || dipakai.has(state.equippedRod) || !state.rods.some((r) => r.id === state.equippedRod)) {
        const bebas = state.rods.find((r) => !dipakai.has(r.id));
        state.equippedRod = bebas ? bebas.id : "";
      }

      state.updatedAt = Date.now();
      const pencapaian = ambil.length ? hitungPencapaianBaru(state) : [];
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      tx.set(ref, state);
      return {
        ok: true,
        worker,
        achievements: pencapaian,
        workerCatches: ambil,
        state: stateClient(state),
      };
    });
  }

  async function aksiWorkerTick(data) {
    const absen = sesi(data);
    const ref = refState(absen);
    const hasil = await fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = bacaState(snap);
      const now = Date.now();
      const metaPack = await siapkanMeta(tx, state, false);
      const ambil = prosesPekerja(tx, state, now, metaPack);
      let pencapaian = [];
      if (ambil.length) {
        pencapaian = hitungPencapaianBaru(state);
        tx.set(ref, state);
      }
      if (metaPack && metaPack.berubah) tx.set(metaPack.ref, metaPack.data, { merge: true });
      return { state, catches: ambil, achievements: pencapaian };
    });
    return {
      ok: true,
      catches: hasil.catches,
      achievements: hasil.achievements,
      state: stateClient(hasil.state),
      serverNow: Date.now(),
    };
  }

  async function call(action, payload) {
    if (!DATA) throw galat("Katalog Fishing belum termuat. Refresh halaman.", "unavailable");
    const data = payload && typeof payload === "object" ? payload : {};
    if (action === "catalog" || action === "ping") {
      return { ok: true, catalog: katalogClient(), serverNow: Date.now() };
    }
    if (action === "ensure") return aksiEnsure(data);
    if (action === "cast") return aksiCast(data);
    if (action === "strike") return aksiStrike(data);
    if (action === "sell") return aksiSell(data);
    if (action === "buyRod") return aksiBuyRod(data);
    if (action === "buyBait") return aksiBuyBait(data);
    if (action === "repair") return aksiRepair(data);
    if (action === "equip") return aksiEquip(data);
    if (action === "lock") return aksiLock(data);
    if (action === "state") return aksiState(data);
    if (action === "setAutoSell") return aksiSetAutoSell(data);
    if (action === "buyWorker") return aksiBuyWorker(data);
    if (action === "updateWorker") return aksiUpdateWorker(data);
    if (action === "upgradeWorker") return aksiUpgradeWorker(data);
    if (action === "assignWorkerRod") return aksiAssignWorkerRod(data);
    if (action === "workerTick") return aksiWorkerTick(data);
    throw galat("Aksi game tidak dikenal.", "invalid-argument");
  }

  window.FishingLocal = { call, katalog: katalogClient, mode: "local" };
})();
