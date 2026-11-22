/* ===================================================
   ISLAND TYCOON — mesin lokal (tanpa Cloud Functions/Blaze)
   Semua simulasi (kebun, pekerja, pabrik, kebutuhan, offline)
   dihitung dari timestamp lalu disimpan lewat transaksi
   Firestore. Setiap dokumen tetap divalidasi Security Rules.
=================================================== */
(function () {
  "use strict";

  const C = window.IslandCatalog;
  const COL = { pulau: "islands", tawaran: "islandOffers" };

  const MAX_UANG = 1000000000;
  const MAX_BARANG = 999999;
  const MAX_TAWARAN = 5;
  const MAX_KENDARAAN = 6;
  const SIKLUS_OFFLINE_MAKS = 360;
  const BATAS_SIM_PABRIK = 200;
  const KAPASITAS_TAWARAN = 100;

  /* ================= UTIL ================= */
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
    if (!user || !user.absen) throw galat("Login dulu untuk membuka pulau.", "unauthenticated");
    const absen = Number(user.absen);
    if (!Number.isInteger(absen) || absen < 1 || absen > 64) {
      throw galat("Akun kelas tidak valid.", "invalid-argument");
    }
    if (data && data.absen != null && Number(data.absen) !== absen) {
      throw galat("Pulau ini bukan milik akunmu.", "permission-denied");
    }
    return absen;
  }

  function namaSesi(absen) {
    const user = pengguna();
    if (user && Number(user.absen) === absen && user.namaPanggilan) {
      return String(user.namaPanggilan).trim().slice(0, 30);
    }
    try {
      const akun = typeof getMergedAccount === "function" ? getMergedAccount(absen) : null;
      if (akun && akun.namaPanggilan) return String(akun.namaPanggilan).trim().slice(0, 30);
    } catch (err) { /* pakai fallback */ }
    try {
      const daftar = (typeof dataSiswa !== "undefined" && dataSiswa) || window.dataSiswa || [];
      const siswa = daftar.find((s) => Number(s.absen) === absen);
      if (siswa && siswa.namaPanggilan) return String(siswa.namaPanggilan).trim().slice(0, 30);
    } catch (err) { /* pakai fallback */ }
    return "Pemilik Pulau";
  }

  function clamp(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function bulat(n, min, max) {
    return Math.floor(clamp(n, min, max));
  }

  function bulat2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function idObjek(absen) {
    return `obj-${absen}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function idKendaraan(absen) {
    return `veh-${absen}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function idTawaran(absen) {
    return `off-${absen}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function salin(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function refPulau(absen) {
    return fs().collection(COL.pulau).doc(String(absen));
  }

  function refObjek(absen, id) {
    return fs().collection(COL.pulau).doc(String(absen)).collection("objects").doc(String(id));
  }

  function refTawaran(id) {
    return fs().collection(COL.tawaran).doc(String(id));
  }

  function kumpulanObjek(absen) {
    return fs().collection(COL.pulau).doc(String(absen)).collection("objects");
  }

  async function muatObjek(absen) {
    const snap = await kumpulanObjek(absen).get();
    const list = [];
    snap.forEach((doc) => {
      const o = normObjek(doc.id, doc.data());
      if (o) {
        o.absen = Number(absen);
        list.push(o);
      }
    });
    list.sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id));
    return list;
  }

  /* ================= STATE PULAU ================= */
  function statsAwal() {
    return {
      chopped: 0,
      mined: 0,
      harvested: 0,
      built: 0,
      collected: 0,
      earned: 0,
      spent: 0,
      wagesPaid: 0,
      wood: 0,
      stone: 0,
      woodWorker: 0,
      marketSold: 0,
      marketBought: 0,
      offersMade: 0,
      visits: 0,
    };
  }

  function stateAwal(absen, nama) {
    const now = Date.now();
    return {
      absen,
      name: nama || namaSesi(absen),
      money: C.ECONOMY.startMoney,
      xp: 0,
      level: 1,
      inventory: { ...C.ECONOMY.startInventory },
      needs: { hunger: 85, thirst: 80, updatedAt: now },
      workers: [],
      vehicles: [],
      activeVehicle: "",
      stats: statsAwal(),
      requests: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
  }

  function normInventory(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach((id) => {
      if (!C.RESOURCE_BY_ID[id]) return;
      const qty = Math.floor(Number(raw[id]) || 0);
      if (qty > 0) out[id] = Math.min(MAX_BARANG, qty);
    });
    return out;
  }

  function normWorkers(raw) {
    const list = Array.isArray(raw) ? raw.slice(0, C.WORKER.slotMax) : [];
    const dipakai = new Set();
    return list.map((rec, i) => {
      if (!rec || typeof rec !== "object") return null;
      let id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 40) : "";
      if (!id || dipakai.has(id)) {
        let n = i + 1;
        do { id = `w-${n}-${Math.random().toString(36).slice(2, 6)}`; n += 1; } while (dipakai.has(id));
      }
      dipakai.add(id);
      const name = typeof rec.name === "string" && rec.name.trim()
        ? rec.name.trim().replace(/\s+/g, " ").slice(0, 20)
        : `Pekerja ${i + 1}`;
      return {
        id,
        name,
        level: bulat(rec.level, 1, C.WORKER.maxLevel),
        lastWorkAt: Math.max(1, Math.floor(Number(rec.lastWorkAt) || Date.now())),
        unpaid: rec.unpaid === true,
        debt: bulat(rec.debt, 0, 100000),
        totalWood: bulat(rec.totalWood, 0, MAX_BARANG),
        wagesPaid: bulat(rec.wagesPaid, 0, MAX_UANG),
        hiredAt: Math.max(1, Math.floor(Number(rec.hiredAt) || Date.now())),
      };
    }).filter(Boolean);
  }

  function normVehicles(raw) {
    const list = Array.isArray(raw) ? raw.slice(0, MAX_KENDARAAN) : [];
    const dipakai = new Set();
    return list.map((rec, i) => {
      if (!rec || typeof rec !== "object") return null;
      const info = C.VEHICLE_BY_ID[rec.type];
      if (!info) return null;
      let id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 40) : "";
      if (!id || dipakai.has(id)) {
        let n = i + 1;
        do { id = `v-${n}-${Math.random().toString(36).slice(2, 6)}`; n += 1; } while (dipakai.has(id));
      }
      dipakai.add(id);
      return {
        id,
        type: info.id,
        boughtAt: Math.max(1, Math.floor(Number(rec.boughtAt) || Date.now())),
      };
    }).filter(Boolean);
  }

  function normRequests(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => r && typeof r.id === "string" && r.id.length >= 8 && r.id.length <= 80)
      .slice(0, 12)
      .map((r) => ({ id: r.id, at: Math.max(1, Math.floor(Number(r.at) || Date.now())) }));
  }

  function normStats(raw) {
    const dasar = statsAwal();
    if (raw && typeof raw === "object") {
      Object.keys(dasar).forEach((k) => {
        dasar[k] = bulat(raw[k], 0, MAX_UANG);
      });
    }
    return dasar;
  }

  function normState(raw, absen) {
    const sumber = raw && typeof raw === "object" ? raw : {};
    const dasar = stateAwal(Number(absen));
    const s = {
      absen: Number(absen),
      name: typeof sumber.name === "string" && sumber.name.trim()
        ? sumber.name.trim().slice(0, 30)
        : dasar.name,
      money: bulat(sumber.money, 0, MAX_UANG),
      xp: bulat(sumber.xp, 0, 10000000),
      level: 1,
      inventory: normInventory(sumber.inventory),
      needs: {
        hunger: clamp(sumber.needs && sumber.needs.hunger, 0, C.NEEDS.max),
        thirst: clamp(sumber.needs && sumber.needs.thirst, 0, C.NEEDS.max),
        updatedAt: Math.max(1, Math.floor(Number(sumber.needs && sumber.needs.updatedAt) || Date.now())),
      },
      workers: normWorkers(sumber.workers),
      vehicles: normVehicles(sumber.vehicles),
      activeVehicle: "",
      stats: normStats(sumber.stats),
      requests: normRequests(sumber.requests),
      createdAt: Math.max(1, Math.floor(Number(sumber.createdAt) || Date.now())),
      updatedAt: Math.max(1, Math.floor(Number(sumber.updatedAt) || Date.now())),
      version: 1,
    };
    s.level = C.levelDariXp(s.xp);
    const kendaraan = s.vehicles.find((v) => v.id === sumber.activeVehicle);
    if (kendaraan) s.activeVehicle = kendaraan.id;
    return s;
  }

  function dataPulau(state) {
    return {
      absen: Math.floor(state.absen),
      name: String(state.name || "Pemilik Pulau").slice(0, 30),
      money: bulat(state.money, 0, MAX_UANG),
      xp: bulat(state.xp, 0, 10000000),
      level: bulat(state.level, 1, C.ECONOMY.maxLevel),
      inventory: normInventory(state.inventory),
      needs: {
        hunger: Math.round(clamp(state.needs.hunger, 0, C.NEEDS.max) * 100) / 100,
        thirst: Math.round(clamp(state.needs.thirst, 0, C.NEEDS.max) * 100) / 100,
        updatedAt: Math.max(1, Math.floor(Number(state.needs.updatedAt) || Date.now())),
      },
      workers: state.workers.map((w) => ({
        id: w.id,
        name: w.name,
        level: w.level,
        lastWorkAt: w.lastWorkAt,
        unpaid: w.unpaid === true,
        debt: w.debt,
        totalWood: w.totalWood,
        wagesPaid: w.wagesPaid,
        hiredAt: w.hiredAt,
      })),
      vehicles: state.vehicles.map((v) => ({ id: v.id, type: v.type, boughtAt: v.boughtAt })),
      activeVehicle: state.activeVehicle || "",
      stats: { ...statsAwal(), ...state.stats },
      requests: normRequests(state.requests),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      version: 1,
    };
  }

  function tandaiPermintaan(state, requestId) {
    const id = typeof requestId === "string" ? requestId.trim() : "";
    if (!id || id.length < 8 || id.length > 80) {
      throw galat("Permintaan transaksi tidak valid.", "invalid-argument");
    }
    if (state.requests.some((r) => r.id === id)) {
      throw galat("Transaksi ini sudah diproses.", "aborted");
    }
    state.requests = [{ id, at: Date.now() }, ...state.requests].slice(0, 12);
  }

  /* ================= OBJEK ================= */
  const FREE_KIND = { decor: true, natural: true };

  function infoObjek(type) {
    return C.BUILDING_BY_ID[type] || C.DECOR_BY_ID[type] || C.NATURAL_BY_ID[type] || null;
  }

  function kindDariType(type) {
    if (C.NATURAL_BY_ID[type]) return "natural";
    if (C.DECOR_BY_ID[type]) return "decor";
    const b = C.BUILDING_BY_ID[type];
    if (!b) return null;
    if (type === "plot") return "plot";
    if (b.resep) return "factory";
    return "building";
  }

  function normObjek(id, raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = String(raw.type || "");
    const kind = kindDariType(type);
    if (!kind) return null;
    const info = infoObjek(type);
    const free = !!FREE_KIND[kind];
    const o = {
      id: String(id),
      absen: Math.floor(Number(raw.absen) || 0),
      kind,
      type,
      x: free ? bulat2(raw.x) : Math.round(Number(raw.x) || 0),
      y: free ? bulat2(raw.y) : Math.round(Number(raw.y) || 0),
      rot: bulat(raw.rot, 0, 3),
      w: free ? 1 : Math.max(1, Math.floor(Number(info.w) || 1)),
      h: free ? 1 : Math.max(1, Math.floor(Number(info.h) || 1)),
      level: bulat(raw.level, 1, info.maxLevel || 5),
      hp: bulat(raw.hp, 0, 10),
      respawnAt: Math.max(0, Math.floor(Number(raw.respawnAt) || 0)),
      crop: C.CROP_BY_ID[raw.crop] ? raw.crop : "",
      plantedAt: Math.max(0, Math.floor(Number(raw.plantedAt) || 0)),
      readyAt: Math.max(0, Math.floor(Number(raw.readyAt) || 0)),
      batches: bulat(raw.batches, 0, 8),
      batchStartAt: Math.max(0, Math.floor(Number(raw.batchStartAt) || 0)),
      auto: raw.auto === true,
      createdAt: Math.max(1, Math.floor(Number(raw.createdAt) || Date.now())),
      updatedAt: Math.max(1, Math.floor(Number(raw.updatedAt) || Date.now())),
    };
    if (kind === "natural" && o.hp <= 0 && o.respawnAt === 0) o.hp = info.hp || 1;
    return o;
  }

  function dataObjek(o) {
    return {
      absen: Math.floor(o.absen),
      kind: o.kind,
      type: o.type,
      x: o.x,
      y: o.y,
      rot: o.rot,
      w: o.w,
      h: o.h,
      level: o.level,
      hp: o.hp,
      respawnAt: Math.floor(o.respawnAt) || 0,
      crop: o.crop || "",
      plantedAt: Math.floor(o.plantedAt) || 0,
      readyAt: Math.floor(o.readyAt) || 0,
      batches: o.batches | 0,
      batchStartAt: Math.floor(o.batchStartAt) || 0,
      auto: o.auto === true,
      createdAt: Math.floor(o.createdAt) || 0,
      updatedAt: Math.floor(o.updatedAt) || 0,
    };
  }

  function buatObjek(absen, kind, type, x, y, rot, now, opsi) {
    const info = infoObjek(type);
    if (!info) throw galat("Jenis objek tidak dikenal.", "invalid-argument");
    const free = !!FREE_KIND[kind];
    const ops = opsi || {};
    return {
      id: ops.id ? String(ops.id) : idObjek(absen),
      absen,
      kind,
      type,
      x: free ? bulat2(x) : Math.round(Number(x) || 0),
      y: free ? bulat2(y) : Math.round(Number(y) || 0),
      rot: bulat(rot, 0, 3),
      w: free ? 1 : Math.max(1, Math.floor(Number(info.w) || 1)),
      h: free ? 1 : Math.max(1, Math.floor(Number(info.h) || 1)),
      level: bulat(ops.level || 1, 1, info.maxLevel || 5),
      hp: kind === "natural" ? (info.hp || 1) : 0,
      respawnAt: 0,
      crop: "",
      plantedAt: 0,
      readyAt: 0,
      batches: 0,
      batchStartAt: 0,
      auto: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  function objekAwal(absen) {
    const now = Date.now();
    const list = [];
    const tambah = (kind, type, x, y, rot, opsi) => {
      list.push(buatObjek(absen, kind, type, x, y, rot, now, { ...(opsi || {}), id: `awal-${list.length + 1}` }));
    };
    tambah("building", "rumah", 5, 5, 0);
    tambah("building", "gudang", 11, 5, 0);
    tambah("plot", "plot", 17, 5, 0);
    tambah("plot", "plot", 18, 5, 0);
    const pohon = [
      [3, 3], [8, 3], [14, 3], [21, 4], [25, 9], [3, 11],
      [7, 15], [19, 11], [27, 15], [31, 21], [4, 25], [10, 29],
      [15, 33], [22, 28], [29, 31], [34, 12],
    ];
    pohon.forEach(([x, y]) => tambah("natural", "pohon", x, y, 0));
    [[7, 9], [20, 16], [27, 22], [5, 21], [32, 27], [12, 23]].forEach(([x, y]) => {
      tambah("natural", "batu", x, y, 0);
    });
    [[4, 4], [9, 4], [16, 4], [22, 5], [26, 11], [3, 14], [8, 19], [18, 21], [24, 26], [31, 34]].forEach(([x, y]) => {
      tambah("decor", "bunga", x, y, 0);
    });
    return list;
  }

  function gridRect(o) {
    return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
  }

  function tumpuk(a, b) {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  }

  function titikDalamRect(x, y, r, margin) {
    const m = margin || 0;
    return x > r.x0 - m && x < r.x1 + m && y > r.y0 - m && y < r.y1 + m;
  }

  function posisiGridValid(cand, objects, abaikanId) {
    if (cand.x < C.LAND_MIN || cand.y < C.LAND_MIN) return false;
    if (cand.x + cand.w - 1 > C.LAND_MAX || cand.y + cand.h - 1 > C.LAND_MAX) return false;
    const rect = gridRect(cand);
    for (const o of objects) {
      if (o.id === abaikanId) continue;
      if (!FREE_KIND[o.kind]) {
        if (tumpuk(rect, gridRect(o))) return false;
      } else if (titikDalamRect(o.x, o.y, rect, 0.15)) {
        return false;
      }
    }
    return true;
  }

  function posisiBebasValid(cand, objects, abaikanId) {
    if (cand.x < C.LAND_MIN + 0.4 || cand.x > C.LAND_MAX + 0.6) return false;
    if (cand.y < C.LAND_MIN + 0.4 || cand.y > C.LAND_MAX + 0.6) return false;
    for (const o of objects) {
      if (o.id === abaikanId) continue;
      if (!FREE_KIND[o.kind]) {
        if (titikDalamRect(cand.x, cand.y, gridRect(o), 0.15)) return false;
      } else if (Math.hypot(o.x - cand.x, o.y - cand.y) < 0.72) {
        return false;
      }
    }
    return true;
  }

  /* ================= INVENTARIS ================= */
  function inv(state, id) {
    return Math.max(0, Math.floor(Number(state.inventory[id]) || 0));
  }

  function tambahInv(state, id, qty) {
    if (!C.RESOURCE_BY_ID[id] || qty <= 0) return;
    state.inventory[id] = Math.min(MAX_BARANG, inv(state, id) + Math.floor(qty));
  }

  function kurangiInv(state, id, qty) {
    const ada = inv(state, id);
    if (ada < qty) throw galat("Stok tidak cukup.", "failed-precondition");
    const sisa = ada - qty;
    if (sisa > 0) state.inventory[id] = sisa;
    else delete state.inventory[id];
  }

  function totalBarang(state) {
    let total = 0;
    Object.keys(state.inventory).forEach((id) => { total += inv(state, id); });
    return total;
  }

  function kapasitasGudang(objects) {
    const gudang = objects.filter((o) => o.type === "gudang");
    if (!gudang.length) return C.ECONOMY.storageBase;
    const level = gudang.reduce((maks, o) => Math.max(maks, o.level), 1);
    return C.storageCapacity(level, gudang.length);
  }

  function muatBarang(state, kapasitas, qty) {
    return totalBarang(state) + qty <= kapasitas;
  }

  function punyaBahan(state, inputs) {
    return Object.keys(inputs).every((id) => inv(state, id) >= inputs[id]);
  }

  function pakaiBahan(state, inputs) {
    Object.keys(inputs).forEach((id) => kurangiInv(state, id, inputs[id]));
  }

  function tambahUang(state, n) {
    state.money = bulat(state.money + Math.floor(n), 0, MAX_UANG);
  }

  function tambahXp(state, n) {
    state.xp = bulat(state.xp + Math.floor(n), 0, 10000000);
  }

  /* ================= SIMULASI OFFLINE ================= */
  function settle(state, objects, now, tandai) {
    const rumah = objects.find((o) => o.type === "rumah");
    const red = C.kebutuhanTurun(rumah ? rumah.level : 1);
    const akhir = Math.max(0, Math.floor(Number(state.needs.updatedAt) || 0));
    if (akhir > 0 && now > akhir) {
      const menit = Math.min(7 * 24 * 60, (now - akhir) / 60000);
      state.needs.hunger = clamp(state.needs.hunger - menit * C.NEEDS.hungerPerMenit * red, 0, C.NEEDS.max);
      state.needs.thirst = clamp(state.needs.thirst - menit * C.NEEDS.thirstPerMenit * red, 0, C.NEEDS.max);
    }
    state.needs.updatedAt = now;

    const kapasitas = kapasitasGudang(objects);
    const cycle = C.WORKER.cycleMs;
    state.workers.forEach((w) => {
      if (w.unpaid) return;
      const last = Math.max(0, Number(w.lastWorkAt) || 0);
      const cycles = Math.floor((now - last) / cycle);
      if (cycles <= 0) return;
      const batas = Math.min(cycles, SIKLUS_OFFLINE_MAKS);
      let kerja = 0;
      while (kerja < batas) {
        const hasil = C.WORKER.woodPerCycle + (w.level - 1);
        const upah = C.WORKER.wagePerCycle + 2 * (w.level - 1);
        if (!muatBarang(state, kapasitas, hasil)) break;
        if (state.money < upah) {
          w.unpaid = true;
          w.debt = upah;
          w.lastWorkAt = now;
          break;
        }
        state.money -= upah;
        state.stats.spent += upah;
        state.stats.wagesPaid += upah;
        state.stats.wood += hasil;
        state.stats.woodWorker += hasil;
        tambahInv(state, "wood", hasil);
        w.totalWood += hasil;
        w.wagesPaid += upah;
        kerja += 1;
      }
      if (!w.unpaid && kerja > 0) {
        w.lastWorkAt = cycles > SIKLUS_OFFLINE_MAKS ? now : last + kerja * cycle;
      }
    });

    objects.forEach((o) => {
      if (o.kind === "natural") {
        const info = C.NATURAL_BY_ID[o.type];
        if (info && o.respawnAt > 0 && o.respawnAt <= now) {
          o.respawnAt = 0;
          o.hp = info.hp;
          o.updatedAt = now;
          tandai(o);
        }
        return;
      }
      if (o.kind !== "factory") return;
      const info = C.BUILDING_BY_ID[o.type];
      if (!info || !info.resep) return;
      let berubah = false;
      let guard = 0;
      while (o.batchStartAt > 0 && guard < BATAS_SIM_PABRIK) {
        guard += 1;
        const durasi = C.durasiPabrik(o.type, o.level);
        const selesai = o.batchStartAt + durasi;
        if (selesai > now) break;
        o.batches = Math.min(C.kapasitasPabrik(o.level), o.batches + 1);
        o.batchStartAt = 0;
        berubah = true;
        if (!o.auto || o.batches >= C.kapasitasPabrik(o.level)) break;
        const biaya = C.biayaOperasional(o.type, o.level);
        if (state.money < biaya || !punyaBahan(state, info.resep.inputs)) break;
        pakaiBahan(state, info.resep.inputs);
        state.money -= biaya;
        state.stats.spent += biaya;
        o.batchStartAt = selesai;
      }
      if (berubah) {
        o.updatedAt = now;
        tandai(o);
      }
    });
  }

  /* ================= TRANSAKSI ================= */
  async function transaksiPulau(data, kerja, opsi) {
    const absen = sesi(data);
    const ops = opsi || {};
    const ref = refPulau(absen);
    const objects = await muatObjek(absen);
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw galat("Pulau belum siap. Buka ulang Island Tycoon.", "failed-precondition");
      const state = normState(snap.data(), absen);
      const now = Date.now();
      const berubah = new Map();
      const dihapus = new Set();
      const ubah = (o) => {
        o.updatedAt = now;
        berubah.set(o.id, o);
      };
      settle(state, objects, now, ubah);
      if (ops.dedupe !== false && data.requestId) tandaiPermintaan(state, data.requestId);
      const levelLama = state.level;
      const ctx = {
        absen,
        ref,
        tx,
        state,
        objects,
        now,
        berubah,
        dihapus,
        ubah,
        tambah(o) {
          objects.push(o);
          ubah(o);
        },
        hapus(o) {
          const i = objects.indexOf(o);
          if (i >= 0) objects.splice(i, 1);
          berubah.delete(o.id);
          dihapus.add(o.id);
        },
        cari(id) {
          const o = objects.find((x) => x.id === id);
          if (!o) throw galat("Objek sudah tidak ada. Muat ulang pulau.");
          return o;
        },
      };
      const extra = (await kerja(ctx)) || {};
      state.level = C.levelDariXp(state.xp);
      state.updatedAt = now;
      tx.set(ref, dataPulau(state));
      berubah.forEach((o) => tx.set(refObjek(absen, o.id), dataObjek(o)));
      dihapus.forEach((id) => tx.delete(refObjek(absen, id)));
      return {
        ok: true,
        state: dataPulau(state),
        objects: salin(objects.map((o) => ({ ...o }))),
        levelUp: state.level > levelLama ? state.level : 0,
        serverNow: now,
        ...extra,
      };
    });
  }

  function ambilQty(nilai, maks) {
    const qty = Math.floor(Number(nilai));
    if (!Number.isFinite(qty) || qty < 1 || qty > maks) {
      throw galat(`Jumlah harus 1 sampai ${maks}.`, "invalid-argument");
    }
    return qty;
  }

  function ambilId(nilai, label) {
    const id = typeof nilai === "string" ? nilai.trim() : "";
    if (!id || id.length > 80) throw galat(`${label} tidak valid.`, "invalid-argument");
    return id;
  }

  /* ================= AKSI PULAU ================= */
  async function aksiEnsure(data) {
    const absen = sesi(data);
    const nama = namaSesi(absen);
    const ref = refPulau(absen);
    const objectsLama = await muatObjek(absen);
    const hasil = await fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let state;
      let objects;
      let dibuat = false;
      if (!snap.exists) {
        state = stateAwal(absen, nama);
        objects = objekAwal(absen);
        dibuat = true;
      } else {
        state = normState(snap.data(), absen);
        if (nama && state.name !== nama) state.name = nama;
        objects = objectsLama;
      }
      const now = Date.now();
      const berubah = new Map();
      settle(state, objects, now, (o) => {
        o.updatedAt = now;
        berubah.set(o.id, o);
      });
      state.level = C.levelDariXp(state.xp);
      state.updatedAt = now;
      tx.set(ref, dataPulau(state));
      if (dibuat) objects.forEach((o) => tx.set(refObjek(absen, o.id), dataObjek(o)));
      else berubah.forEach((o) => tx.set(refObjek(absen, o.id), dataObjek(o)));
      return {
        ok: true,
        state: dataPulau(state),
        objects: salin(objects.map((o) => ({ ...o }))),
        dibuat,
        levelUp: 0,
        serverNow: now,
      };
    });
    return {
      ...hasil,
      catalogVersion: C.CATALOG_VERSION,
      workerLimit: C.maxPekerja(hasil.objects.filter((o) => o.type === "pondok").map((o) => o.level)),
      serverNow: Date.now(),
    };
  }

  async function aksiPlace(data) {
    const type = typeof data.type === "string" ? data.type.trim() : "";
    const kind = kindDariType(type);
    if (!kind || kind === "natural") throw galat("Objek ini tidak bisa dibangun.", "invalid-argument");
    const info = infoObjek(type);
    if (!info) throw galat("Jenis bangunan tidak dikenal.", "invalid-argument");
    return transaksiPulau(data, (ctx) => {
      const { state, objects } = ctx;
      const bangunan = C.BUILDING_BY_ID[type];
      if (bangunan && bangunan.starter) {
        throw galat("Bangunan ini sudah tersedia sejak awal.", "failed-precondition");
      }
      if (bangunan && !C.bangunanTersedia(type, state.level)) {
        throw galat(`${info.nama} terbuka di level ${bangunan.levelReq}.`, "failed-precondition");
      }
      const harga = Math.max(0, Math.floor(Number(info.harga) || 0));
      if (state.money < harga) throw galat(`Uang belum cukup untuk ${info.nama}.`, "failed-precondition");
      if (objects.length >= C.ECONOMY.maxObject) throw galat("Pulau sudah terlalu penuh.", "resource-exhausted");
      const free = kind === "decor";
      const posisi = {
        x: free ? bulat2(data.x) : Math.round(Number(data.x) || 0),
        y: free ? bulat2(data.y) : Math.round(Number(data.y) || 0),
      };
      if (!Number.isFinite(posisi.x) || !Number.isFinite(posisi.y)) {
        throw galat("Posisi objek tidak valid.", "invalid-argument");
      }
      const cand = { ...posisi, w: free ? 1 : Math.max(1, Number(info.w) || 1), h: free ? 1 : Math.max(1, Number(info.h) || 1) };
      const valid = free ? posisiBebasValid(posisi, objects, "") : posisiGridValid(cand, objects, "");
      if (!valid) throw galat("Tempat itu tidak bisa dipakai. Geser ke area kosong.", "failed-precondition");
      state.money -= harga;
      state.stats.spent += harga;
      state.stats.built += 1;
      tambahXp(state, kind === "decor" ? 2 : C.XP.build);
      const o = buatObjek(ctx.absen, kind, type, posisi.x, posisi.y, data.rot, ctx.now);
      ctx.tambah(o);
      return { object: salin(o), pesan: `${info.nama} berhasil dibangun.` };
    });
  }

  async function aksiMove(data) {
    const id = ambilId(data.id, "Objek");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind === "natural") throw galat("Pohon dan batu tidak bisa dipindahkan.", "failed-precondition");
      const free = !!FREE_KIND[o.kind];
      const posisi = {
        x: free ? bulat2(data.x) : Math.round(Number(data.x) || 0),
        y: free ? bulat2(data.y) : Math.round(Number(data.y) || 0),
      };
      if (!Number.isFinite(posisi.x) || !Number.isFinite(posisi.y)) {
        throw galat("Posisi objek tidak valid.", "invalid-argument");
      }
      const cand = { ...posisi, w: o.w, h: o.h };
      const valid = free ? posisiBebasValid(posisi, ctx.objects, o.id) : posisiGridValid(cand, ctx.objects, o.id);
      if (!valid) throw galat("Posisi baru bertabrakan atau di luar pulau.", "failed-precondition");
      o.x = posisi.x;
      o.y = posisi.y;
      ctx.ubah(o);
      return { object: salin(o), pesan: "Objek dipindahkan." };
    });
  }

  async function aksiRotate(data) {
    const id = ambilId(data.id, "Objek");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind === "natural") throw galat("Objek alam tidak bisa diputar.", "failed-precondition");
      o.rot = (o.rot + 1) % 4;
      ctx.ubah(o);
      return { object: salin(o) };
    });
  }

  async function aksiRemove(data) {
    const id = ambilId(data.id, "Objek");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.type === "rumah" || o.type === "gudang") {
        throw galat("Rumah dan gudang utama tidak bisa dihapus.", "failed-precondition");
      }
      if (o.kind === "plot" && o.crop) throw galat("Panen dulu tanaman di lahan ini.", "failed-precondition");
      if (o.kind === "factory" && (o.batchStartAt > 0 || o.batches > 0)) {
        throw galat("Pabrik masih berproduksi. Angkat hasilnya dulu.", "failed-precondition");
      }
      const info = infoObjek(o.type);
      const refund = o.kind === "natural" ? 0 : Math.floor((Number(info && info.harga) || 0) * 0.5);
      if (refund > 0) {
        tambahUang(ctx.state, refund);
        ctx.state.stats.earned += refund;
      }
      ctx.hapus(o);
      return { pesan: refund > 0 ? `Objek dihapus. Kembali ${refund} uang.` : "Objek dihapus." };
    });
  }

  async function aksiChop(data) {
    const id = ambilId(data.id, "Pohon");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind !== "natural" || o.type !== "pohon") throw galat("Itu bukan pohon.", "invalid-argument");
      if (o.respawnAt > ctx.now) throw galat("Pohon ini sedang tumbuh kembali.", "failed-precondition");
      const info = C.NATURAL_BY_ID.pohon;
      if (!muatBarang(ctx.state, kapasitasGudang(ctx.objects), info.perHit)) {
        throw galat("Gudang penuh. Jual atau olah stok dulu.", "resource-exhausted");
      }
      o.hp -= 1;
      tambahInv(ctx.state, info.yieldId, info.perHit);
      ctx.state.stats.chopped += 1;
      ctx.state.stats.wood += info.perHit;
      tambahXp(ctx.state, info.xp || C.XP.chop);
      if (o.hp <= 0) {
        o.hp = 0;
        o.respawnAt = ctx.now + info.respawnMs;
      }
      ctx.ubah(o);
      return {
        got: { id: info.yieldId, qty: info.perHit },
        respawnAt: o.respawnAt,
        pesan: `+${info.perHit} kayu`,
      };
    });
  }

  async function aksiMine(data) {
    const id = ambilId(data.id, "Batu");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind !== "natural" || o.type !== "batu") throw galat("Itu bukan batu.", "invalid-argument");
      if (o.respawnAt > ctx.now) throw galat("Batu ini belum muncul lagi.", "failed-precondition");
      const info = C.NATURAL_BY_ID.batu;
      if (!muatBarang(ctx.state, kapasitasGudang(ctx.objects), info.perHit)) {
        throw galat("Gudang penuh. Jual atau olah stok dulu.", "resource-exhausted");
      }
      o.hp -= 1;
      tambahInv(ctx.state, info.yieldId, info.perHit);
      ctx.state.stats.mined += 1;
      ctx.state.stats.stone += info.perHit;
      tambahXp(ctx.state, info.xp || C.XP.mine);
      if (o.hp <= 0) {
        o.hp = 0;
        o.respawnAt = ctx.now + info.respawnMs;
      }
      ctx.ubah(o);
      return {
        got: { id: info.yieldId, qty: info.perHit },
        respawnAt: o.respawnAt,
        pesan: `+${info.perHit} batu`,
      };
    });
  }

  async function aksiPlant(data) {
    const id = ambilId(data.id, "Lahan");
    const cropId = typeof data.crop === "string" ? data.crop.trim() : "";
    const crop = C.CROP_BY_ID[cropId];
    if (!crop) throw galat("Bibit tanaman tidak dikenal.", "invalid-argument");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind !== "plot") throw galat("Tanaman hanya bisa ditanam di lahan.", "invalid-argument");
      if (o.crop) throw galat("Lahan ini sudah ditanami.", "failed-precondition");
      if (!C.tanamanTersedia(crop.id, ctx.state.level)) {
        throw galat(`${crop.nama} terbuka di level ${crop.levelReq}.`, "failed-precondition");
      }
      if (inv(ctx.state, crop.seedId) < 1) throw galat("Bibit habis. Beli dulu di Toko NPC.", "failed-precondition");
      kurangiInv(ctx.state, crop.seedId, 1);
      o.crop = crop.id;
      o.plantedAt = ctx.now;
      o.readyAt = ctx.now + crop.growMs;
      tambahXp(ctx.state, C.XP.plant);
      ctx.ubah(o);
      return { object: salin(o), pesan: `${crop.nama} ditanam.` };
    });
  }

  async function aksiHarvest(data) {
    const id = ambilId(data.id, "Lahan");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind !== "plot" || !o.crop) throw galat("Tidak ada tanaman di lahan ini.", "failed-precondition");
      const crop = C.CROP_BY_ID[o.crop];
      if (!crop) throw galat("Data tanaman rusak.", "failed-precondition");
      if (o.readyAt > ctx.now) throw galat("Tanaman belum siap dipanen.", "failed-precondition");
      if (!muatBarang(ctx.state, kapasitasGudang(ctx.objects), crop.yieldQty)) {
        throw galat("Gudang penuh. Jual atau olah stok dulu.", "resource-exhausted");
      }
      tambahInv(ctx.state, crop.yieldId, crop.yieldQty);
      ctx.state.stats.harvested += crop.yieldQty;
      tambahXp(ctx.state, crop.xp);
      o.crop = "";
      o.plantedAt = 0;
      o.readyAt = 0;
      ctx.ubah(o);
      return {
        got: { id: crop.yieldId, qty: crop.yieldQty },
        pesan: `Panen ${crop.yieldQty} ${C.RESOURCE_BY_ID[crop.yieldId].nama}.`,
      };
    });
  }

  async function aksiBuy(data) {
    const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
    const info = C.RESOURCE_BY_ID[itemId];
    if (!info) throw galat("Barang tidak dijual di toko.", "invalid-argument");
    const qty = ambilQty(data.qty, 999);
    const harga = C.hargaBeli(itemId);
    if (harga <= 0) throw galat("Barang ini tidak bisa dibeli.", "invalid-argument");
    return transaksiPulau(data, (ctx) => {
      const total = harga * qty;
      if (ctx.state.money < total) throw galat("Uang belum cukup.", "failed-precondition");
      if (!muatBarang(ctx.state, kapasitasGudang(ctx.objects), qty)) {
        throw galat("Gudang penuh.", "resource-exhausted");
      }
      ctx.state.money -= total;
      ctx.state.stats.spent += total;
      tambahInv(ctx.state, itemId, qty);
      return { itemId, qty, total, pesan: `Beli ${qty} ${info.nama}.` };
    });
  }

  async function aksiSell(data) {
    const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
    const info = C.RESOURCE_BY_ID[itemId];
    if (!info) throw galat("Barang tidak dikenal.", "invalid-argument");
    const qty = ambilQty(data.qty, 9999);
    const harga = C.hargaJual(itemId);
    if (harga <= 0) throw galat("Barang ini tidak bisa dijual.", "invalid-argument");
    return transaksiPulau(data, (ctx) => {
      if (inv(ctx.state, itemId) < qty) throw galat("Stok tidak cukup.", "failed-precondition");
      const total = harga * qty;
      kurangiInv(ctx.state, itemId, qty);
      tambahUang(ctx.state, total);
      ctx.state.stats.earned += total;
      tambahXp(ctx.state, Math.floor(total / C.XP.sellMoneyPerXp));
      return { itemId, qty, total, pesan: `Terjual ${qty} ${info.nama} (+${total}).` };
    });
  }

  async function aksiConsume(data) {
    const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
    const info = C.RESOURCE_BY_ID[itemId];
    if (!info || (!info.hunger && !info.thirst)) throw galat("Barang ini bukan makanan atau minuman.", "invalid-argument");
    return transaksiPulau(data, (ctx) => {
      if (inv(ctx.state, itemId) < 1) throw galat("Stok habis.", "failed-precondition");
      const perlu = (info.hunger ? ctx.state.needs.hunger : ctx.state.needs.thirst) < C.NEEDS.max;
      if (!perlu) throw galat("Kebutuhanmu masih penuh.", "failed-precondition");
      kurangiInv(ctx.state, itemId, 1);
      if (info.hunger) ctx.state.needs.hunger = clamp(ctx.state.needs.hunger + info.hunger, 0, C.NEEDS.max);
      if (info.thirst) ctx.state.needs.thirst = clamp(ctx.state.needs.thirst + info.thirst, 0, C.NEEDS.max);
      return { pesan: `${info.nama} dikonsumsi.` };
    });
  }

  async function aksiHireWorker(data) {
    let nama = typeof data.name === "string" ? data.name.trim().replace(/\s+/g, " ") : "";
    if (nama.length > 20) throw galat("Nama pekerja maksimal 20 karakter.", "invalid-argument");
    return transaksiPulau(data, (ctx) => {
      const batas = C.maxPekerja(ctx.objects.filter((o) => o.type === "pondok").map((o) => o.level));
      if (ctx.state.workers.length >= batas) {
        throw galat(`Slot pekerja penuh (${batas}). Bangun pondok untuk menambah slot.`, "failed-precondition");
      }
      if (ctx.state.money < C.WORKER.harga) throw galat("Uang belum cukup untuk merekrut pekerja.", "failed-precondition");
      if (!nama) nama = `Pekerja ${ctx.state.workers.length + 1}`;
      ctx.state.money -= C.WORKER.harga;
      ctx.state.stats.spent += C.WORKER.harga;
      const worker = {
        id: `w-${ctx.now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: nama,
        level: 1,
        lastWorkAt: ctx.now,
        unpaid: false,
        debt: 0,
        totalWood: 0,
        wagesPaid: 0,
        hiredAt: ctx.now,
      };
      ctx.state.workers.push(worker);
      return { worker: salin(worker), pesan: `${nama} mulai bekerja.` };
    });
  }

  async function aksiFireWorker(data) {
    const id = ambilId(data.workerId, "Pekerja");
    return transaksiPulau(data, (ctx) => {
      const w = ctx.state.workers.find((x) => x.id === id);
      if (!w) throw galat("Pekerja tidak ditemukan.", "not-found");
      ctx.state.workers = ctx.state.workers.filter((x) => x.id !== id);
      return { pesan: `${w.name} berhenti bekerja.` };
    });
  }

  async function aksiPayWorker(data) {
    const id = ambilId(data.workerId, "Pekerja");
    return transaksiPulau(data, (ctx) => {
      const w = ctx.state.workers.find((x) => x.id === id);
      if (!w) throw galat("Pekerja tidak ditemukan.", "not-found");
      if (!w.unpaid) throw galat("Gaji pekerja ini sudah dibayar.", "failed-precondition");
      const utang = Math.max(1, Math.floor(w.debt || 0));
      if (ctx.state.money < utang) throw galat("Uang belum cukup membayar gaji.", "failed-precondition");
      ctx.state.money -= utang;
      ctx.state.stats.spent += utang;
      w.wagesPaid += utang;
      w.unpaid = false;
      w.debt = 0;
      w.lastWorkAt = ctx.now;
      return { worker: salin(w), pesan: `Gaji ${w.name} dibayar (${utang}).` };
    });
  }

  async function aksiPayAllWages(data) {
    return transaksiPulau(data, (ctx) => {
      const tertunggak = ctx.state.workers.filter((w) => w.unpaid);
      if (!tertunggak.length) throw galat("Tidak ada gaji tertunggak.", "failed-precondition");
      const total = tertunggak.reduce((n, w) => n + Math.max(1, Math.floor(w.debt || 0)), 0);
      if (ctx.state.money < total) throw galat("Uang belum cukup membayar semua gaji.", "failed-precondition");
      ctx.state.money -= total;
      ctx.state.stats.spent += total;
      tertunggak.forEach((w) => {
        const utang = Math.max(1, Math.floor(w.debt || 0));
        w.wagesPaid += utang;
        w.unpaid = false;
        w.debt = 0;
        w.lastWorkAt = ctx.now;
      });
      return { pesan: `Semua gaji dibayar (${total}).` };
    });
  }

  async function aksiUpgradeWorker(data) {
    const id = ambilId(data.workerId, "Pekerja");
    return transaksiPulau(data, (ctx) => {
      const w = ctx.state.workers.find((x) => x.id === id);
      if (!w) throw galat("Pekerja tidak ditemukan.", "not-found");
      if (w.level >= C.WORKER.maxLevel) throw galat("Level pekerja sudah maksimal.", "failed-precondition");
      const uang = C.WORKER.upgradeMoney * w.level;
      const plank = C.WORKER.upgradePlank * w.level;
      if (ctx.state.money < uang) throw galat("Uang belum cukup untuk melatih pekerja.", "failed-precondition");
      if (inv(ctx.state, "plank") < plank) throw galat(`Butuh ${plank} papan kayu.`, "failed-precondition");
      ctx.state.money -= uang;
      ctx.state.stats.spent += uang;
      kurangiInv(ctx.state, "plank", plank);
      w.level += 1;
      return { worker: salin(w), pesan: `${w.name} naik ke level ${w.level}.` };
    });
  }

  async function aksiStartFactory(data) {
    const id = ambilId(data.id, "Pabrik");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind !== "factory") throw galat("Itu bukan pabrik.", "invalid-argument");
      const info = C.BUILDING_BY_ID[o.type];
      if (!info || !info.resep) throw galat("Pabrik ini tidak punya resep.", "failed-precondition");
      if (o.batchStartAt > 0) throw galat("Pabrik sedang berproduksi.", "failed-precondition");
      if (o.batches >= C.kapasitasPabrik(o.level)) throw galat("Angkat hasil pabrik dulu.", "failed-precondition");
      const biaya = C.biayaOperasional(o.type, o.level);
      if (ctx.state.money < biaya) throw galat("Uang operasional belum cukup.", "failed-precondition");
      if (!punyaBahan(ctx.state, info.resep.inputs)) throw galat("Bahan baku kurang.", "failed-precondition");
      pakaiBahan(ctx.state, info.resep.inputs);
      ctx.state.money -= biaya;
      ctx.state.stats.spent += biaya;
      o.batchStartAt = ctx.now;
      ctx.ubah(o);
      return {
        object: salin(o),
        durasi: C.durasiPabrik(o.type, o.level),
        pesan: `${info.nama} mulai berproduksi.`,
      };
    });
  }

  async function aksiCollectFactory(data) {
    const id = ambilId(data.id, "Pabrik");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind !== "factory") throw galat("Itu bukan pabrik.", "invalid-argument");
      const info = C.BUILDING_BY_ID[o.type];
      if (!info || !info.resep) throw galat("Pabrik ini tidak berproduksi.", "failed-precondition");
      if (o.batches <= 0) throw galat("Belum ada hasil untuk diambil.", "failed-precondition");
      const hasil = C.hasilPabrik(o.type, o.level) * o.batches;
      const outId = info.resep.output.id;
      if (!muatBarang(ctx.state, kapasitasGudang(ctx.objects), hasil)) {
        throw galat("Gudang penuh. Jual atau olah stok dulu.", "resource-exhausted");
      }
      const batch = o.batches;
      tambahInv(ctx.state, outId, hasil);
      ctx.state.stats.collected += hasil;
      tambahXp(ctx.state, C.XP.factoryCollect * batch);
      o.batches = 0;
      ctx.ubah(o);
      return {
        got: { id: outId, qty: hasil },
        pesan: `+${hasil} ${C.RESOURCE_BY_ID[outId].nama}`,
      };
    });
  }

  async function aksiFactoryAuto(data) {
    const id = ambilId(data.id, "Pabrik");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      if (o.kind !== "factory") throw galat("Itu bukan pabrik.", "invalid-argument");
      o.auto = data.auto === true;
      ctx.ubah(o);
      return { object: salin(o), pesan: o.auto ? "Produksi otomatis dinyalakan." : "Produksi otomatis dimatikan." };
    });
  }

  async function aksiUpgradeBuilding(data) {
    const id = ambilId(data.id, "Bangunan");
    return transaksiPulau(data, (ctx) => {
      const o = ctx.cari(id);
      const info = infoObjek(o.type);
      if (!info || !C.BUILDING_BY_ID[o.type]) throw galat("Bangunan ini tidak bisa di-upgrade.", "invalid-argument");
      const biaya = C.biayaUpgrade(o.type, o.level);
      if (!biaya) throw galat("Level bangunan sudah maksimal.", "failed-precondition");
      if (ctx.state.money < biaya.money) throw galat("Uang belum cukup untuk upgrade.", "failed-precondition");
      if (inv(ctx.state, "plank") < biaya.plank) throw galat(`Butuh ${biaya.plank} papan kayu.`, "failed-precondition");
      if (inv(ctx.state, "cement") < biaya.cement) throw galat(`Butuh ${biaya.cement} semen.`, "failed-precondition");
      ctx.state.money -= biaya.money;
      ctx.state.stats.spent += biaya.money;
      if (biaya.plank) kurangiInv(ctx.state, "plank", biaya.plank);
      if (biaya.cement) kurangiInv(ctx.state, "cement", biaya.cement);
      o.level += 1;
      ctx.ubah(o);
      return { object: salin(o), pesan: `${info.nama} naik ke level ${o.level}.` };
    });
  }

  async function aksiBuyVehicle(data) {
    const type = typeof data.type === "string" ? data.type.trim() : "";
    const info = C.VEHICLE_BY_ID[type];
    if (!info) throw galat("Kendaraan tidak dikenal.", "invalid-argument");
    return transaksiPulau(data, (ctx) => {
      if (!C.kendaraanTersedia(type, ctx.state.level)) {
        throw galat(`${info.nama} terbuka di level ${info.levelReq}.`, "failed-precondition");
      }
      if (ctx.state.vehicles.length >= MAX_KENDARAAN) throw galat("Garasi penuh.", "failed-precondition");
      if (ctx.state.money < info.harga) throw galat("Uang belum cukup untuk membeli kendaraan.", "failed-precondition");
      ctx.state.money -= info.harga;
      ctx.state.stats.spent += info.harga;
      const kendaraan = { id: idKendaraan(ctx.absen), type, boughtAt: ctx.now };
      ctx.state.vehicles.push(kendaraan);
      if (!ctx.state.activeVehicle) ctx.state.activeVehicle = kendaraan.id;
      return { vehicle: salin(kendaraan), pesan: `${info.nama} dibeli.` };
    });
  }

  async function aksiSetVehicle(data) {
    const id = data.vehicleId == null ? "" : String(data.vehicleId);
    return transaksiPulau(data, (ctx) => {
      if (!id) {
        ctx.state.activeVehicle = "";
        return { pesan: "Keluar dari kendaraan." };
      }
      const kendaraan = ctx.state.vehicles.find((v) => v.id === id);
      if (!kendaraan) throw galat("Kendaraan tidak ditemukan.", "not-found");
      ctx.state.activeVehicle = id;
      return { vehicle: salin(kendaraan) };
    });
  }

  /* ================= MARKETPLACE ================= */
  function normTawaran(id, raw) {
    if (!raw || typeof raw !== "object") return null;
    const itemId = String(raw.itemId || "");
    if (!C.RESOURCE_BY_ID[itemId]) return null;
    const sellerAbsen = Math.floor(Number(raw.sellerAbsen) || 0);
    if (sellerAbsen < 1 || sellerAbsen > 64) return null;
    return {
      id: String(id),
      sellerAbsen,
      sellerName: String(raw.sellerName || "Siswa").slice(0, 30),
      itemId,
      qty: bulat(raw.qty, 1, C.ECONOMY.marketMaxQty),
      price: bulat(raw.price, C.ECONOMY.marketMinPrice, C.ECONOMY.marketMaxPrice),
      createdAt: Math.max(1, Math.floor(Number(raw.createdAt) || Date.now())),
      updatedAt: Math.max(1, Math.floor(Number(raw.updatedAt) || Date.now())),
    };
  }

  function dataTawaran(t) {
    return {
      sellerAbsen: t.sellerAbsen,
      sellerName: t.sellerName,
      itemId: t.itemId,
      qty: t.qty,
      price: t.price,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async function aksiMarketCreate(data) {
    const absen = sesi(data);
    const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
    const info = C.RESOURCE_BY_ID[itemId];
    if (!info) throw galat("Barang tidak bisa dijual di marketplace.", "invalid-argument");
    const qty = ambilQty(data.qty, C.ECONOMY.marketMaxQty);
    const price = Math.floor(Number(data.price));
    if (!Number.isFinite(price) || price < C.ECONOMY.marketMinPrice || price > C.ECONOMY.marketMaxPrice) {
      throw galat(`Harga harus ${C.ECONOMY.marketMinPrice} sampai ${C.ECONOMY.marketMaxPrice}.`, "invalid-argument");
    }
    const ref = refPulau(absen);
    const lama = await fs().collection(COL.tawaran).where("sellerAbsen", "==", absen).limit(MAX_TAWARAN).get();
    if (lama.size >= MAX_TAWARAN) throw galat(`Maksimal ${MAX_TAWARAN} tawaran aktif.`, "resource-exhausted");
    const nama = namaSesi(absen);
    const offerId = idTawaran(absen);
    const refOffer = refTawaran(offerId);
    const objects = await muatObjek(absen);
    return fs().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw galat("Pulau belum siap.", "failed-precondition");
      const state = normState(snap.data(), absen);
      const now = Date.now();
      const berubah = new Map();
      settle(state, objects, now, (o) => {
        o.updatedAt = now;
        berubah.set(o.id, o);
      });
      if (data.requestId) tandaiPermintaan(state, data.requestId);
      if (inv(state, itemId) < qty) throw galat("Stok tidak cukup.", "failed-precondition");
      kurangiInv(state, itemId, qty);
      state.stats.offersMade += 1;
      state.updatedAt = now;
      const offer = {
        id: offerId,
        sellerAbsen: absen,
        sellerName: nama,
        itemId,
        qty,
        price,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(ref, dataPulau(state));
      berubah.forEach((o) => tx.set(refObjek(absen, o.id), dataObjek(o)));
      tx.set(refOffer, dataTawaran(offer));
      return {
        ok: true,
        offer: salin(offer),
        state: dataPulau(state),
        objects: salin(objects.map((o) => ({ ...o }))),
        serverNow: now,
        pesan: `Tawaran ${qty} ${info.nama} dipasang.`,
      };
    });
  }

  async function aksiMarketCancel(data) {
    const absen = sesi(data);
    const offerId = ambilId(data.offerId, "Tawaran");
    const refOffer = refTawaran(offerId);
    const ref = refPulau(absen);
    const objects = await muatObjek(absen);
    return fs().runTransaction(async (tx) => {
      const snapOffer = await tx.get(refOffer);
      if (!snapOffer.exists) throw galat("Tawaran sudah tidak ada.", "not-found");
      const offer = normTawaran(offerId, snapOffer.data());
      if (!offer) throw galat("Data tawaran rusak.", "failed-precondition");
      if (offer.sellerAbsen !== absen) throw galat("Ini bukan tawaranmu.", "permission-denied");
      const snap = await tx.get(ref);
      if (!snap.exists) throw galat("Pulau belum siap.", "failed-precondition");
      const state = normState(snap.data(), absen);
      const now = Date.now();
      const berubah = new Map();
      settle(state, objects, now, (o) => {
        o.updatedAt = now;
        berubah.set(o.id, o);
      });
      if (data.requestId) tandaiPermintaan(state, data.requestId);
      if (!muatBarang(state, kapasitasGudang(objects), offer.qty)) {
        throw galat("Gudang penuh. Kosongkan dulu sebelum menarik tawaran.", "resource-exhausted");
      }
      tambahInv(state, offer.itemId, offer.qty);
      state.updatedAt = now;
      tx.set(ref, dataPulau(state));
      berubah.forEach((o) => tx.set(refObjek(absen, o.id), dataObjek(o)));
      tx.delete(refOffer);
      return {
        ok: true,
        state: dataPulau(state),
        objects: salin(objects.map((o) => ({ ...o }))),
        serverNow: now,
        pesan: "Tawaran dibatalkan dan barang kembali.",
      };
    });
  }

  async function aksiMarketBuy(data) {
    const absen = sesi(data);
    const offerId = ambilId(data.offerId, "Tawaran");
    const refOffer = refTawaran(offerId);
    const qty = data.qty == null ? null : ambilQty(data.qty, C.ECONOMY.marketMaxQty);
    const refPembeli = refPulau(absen);
    return fs().runTransaction(async (tx) => {
      const snapOffer = await tx.get(refOffer);
      if (!snapOffer.exists) throw galat("Tawaran sudah dibeli orang lain.", "not-found");
      const offer = normTawaran(offerId, snapOffer.data());
      if (!offer) throw galat("Data tawaran rusak.", "failed-precondition");
      if (offer.sellerAbsen === absen) throw galat("Tidak bisa membeli tawaran sendiri.", "invalid-argument");
      const ambil = qty == null ? offer.qty : Math.min(qty, offer.qty);
      const total = offer.price * ambil;
      const snapPembeli = await tx.get(refPembeli);
      if (!snapPembeli.exists) throw galat("Pulau belum siap.", "failed-precondition");
      const pembeli = normState(snapPembeli.data(), absen);
      const refPenjual = refPulau(offer.sellerAbsen);
      const snapPenjual = await tx.get(refPenjual);
      if (!snapPenjual.exists) throw galat("Pulau penjual tidak ditemukan.", "failed-precondition");
      const penjual = normState(snapPenjual.data(), offer.sellerAbsen);
      const now = Date.now();
      const objectsPembeli = await muatObjek(absen);
      const objectsPenjual = await muatObjek(offer.sellerAbsen);
      const berubahPembeli = new Map();
      const berubahPenjual = new Map();
      settle(pembeli, objectsPembeli, now, (o) => {
        o.updatedAt = now;
        berubahPembeli.set(o.id, o);
      });
      settle(penjual, objectsPenjual, now, (o) => {
        o.updatedAt = now;
        berubahPenjual.set(o.id, o);
      });
      if (data.requestId) tandaiPermintaan(pembeli, data.requestId);
      if (pembeli.money < total) throw galat("Uang belum cukup.", "failed-precondition");
      if (!muatBarang(pembeli, kapasitasGudang(objectsPembeli), ambil)) {
        throw galat("Gudangmu penuh.", "resource-exhausted");
      }
      pembeli.money -= total;
      pembeli.stats.spent += total;
      pembeli.stats.marketBought += ambil;
      tambahInv(pembeli, offer.itemId, ambil);
      if (penjual.money + total <= MAX_UANG) penjual.money += total;
      else penjual.money = MAX_UANG;
      penjual.stats.earned += total;
      penjual.stats.marketSold += ambil;
      pembeli.updatedAt = now;
      penjual.updatedAt = now;
      tx.set(refPembeli, dataPulau(pembeli));
      tx.set(refPenjual, dataPulau(penjual));
      berubahPembeli.forEach((o) => tx.set(refObjek(absen, o.id), dataObjek(o)));
      berubahPenjual.forEach((o) => tx.set(refObjek(offer.sellerAbsen, o.id), dataObjek(o)));
      if (ambil >= offer.qty) tx.delete(refOffer);
      else {
        offer.qty -= ambil;
        offer.updatedAt = now;
        tx.set(refOffer, dataTawaran(offer));
      }
      return {
        ok: true,
        state: dataPulau(pembeli),
        objects: salin(objectsPembeli.map((o) => ({ ...o }))),
        serverNow: now,
        pesan: `Membeli ${ambil} ${C.RESOURCE_BY_ID[offer.itemId].nama} seharga ${total}.`,
      };
    });
  }

  async function aksiMarketList(data) {
    const absen = sesi(data);
    const snap = await fs().collection(COL.tawaran).orderBy("createdAt", "desc").limit(KAPASITAS_TAWARAN).get();
    const offers = [];
    snap.forEach((doc) => {
      const o = normTawaran(doc.id, doc.data());
      if (o) offers.push({ ...o, mine: o.sellerAbsen === absen });
    });
    return { ok: true, offers, serverNow: Date.now() };
  }

  async function aksiVisit(data) {
    sesi({});
    const target = Math.floor(Number(data.absen));
    if (!Number.isInteger(target) || target < 1 || target > 64) {
      throw galat("Nomor absen kunjungan tidak valid.", "invalid-argument");
    }
    const snap = await fs().collection(COL.pulau).doc(String(target)).get();
    if (!snap.exists) throw galat("Teman ini belum membuka pulaunya.", "not-found");
    const state = normState(snap.data(), target);
    const objects = await muatObjek(target);
    return {
      ok: true,
      absen: target,
      name: state.name,
      level: state.level,
      totalXp: state.xp,
      stats: { ...state.stats },
      objects: salin(objects.map((o) => ({ ...o }))),
      serverNow: Date.now(),
    };
  }

  /* ================= PRATINJAU UI ================= */
  function pratinjau(type, objects, x, y, abaikanId) {
    const kind = kindDariType(type);
    const info = infoObjek(type);
    if (!kind || !info || kind === "natural") {
      return { valid: false, kind: "", free: false, x: 0, y: 0, w: 1, h: 1 };
    }
    const free = kind === "decor";
    const px = free ? bulat2(x) : Math.round(Number(x) || 0);
    const py = free ? bulat2(y) : Math.round(Number(y) || 0);
    const w = free ? 1 : Math.max(1, Number(info.w) || 1);
    const h = free ? 1 : Math.max(1, Number(info.h) || 1);
    const valid = free
      ? posisiBebasValid({ x: px, y: py }, objects || [], abaikanId || "")
      : posisiGridValid({ x: px, y: py, w, h }, objects || [], abaikanId || "");
    return { valid, kind, free, x: px, y: py, w, h };
  }

  function pratinjauGeser(o, objects, x, y) {
    if (!o) return { valid: false, kind: "", free: false, x: 0, y: 0, w: 1, h: 1 };
    const free = !!FREE_KIND[o.kind];
    const px = free ? bulat2(x) : Math.round(Number(x) || 0);
    const py = free ? bulat2(y) : Math.round(Number(y) || 0);
    const valid = free
      ? posisiBebasValid({ x: px, y: py }, objects || [], o.id)
      : posisiGridValid({ x: px, y: py, w: o.w, h: o.h }, objects || [], o.id);
    return { valid, kind: o.kind, free, x: px, y: py, w: o.w, h: o.h };
  }

  /* ================= ENTRY ================= */
  async function call(action, payload) {
    if (!C) throw galat("Katalog Island Tycoon belum termuat. Refresh halaman.", "unavailable");
    const data = payload && typeof payload === "object" ? payload : {};
    switch (action) {
      case "ensure":
      case "tick":
        return aksiEnsure(data);
      case "place":
        return aksiPlace(data);
      case "move":
        return aksiMove(data);
      case "rotate":
        return aksiRotate(data);
      case "remove":
        return aksiRemove(data);
      case "chop":
        return aksiChop(data);
      case "mine":
        return aksiMine(data);
      case "plant":
        return aksiPlant(data);
      case "harvest":
        return aksiHarvest(data);
      case "buy":
        return aksiBuy(data);
      case "sell":
        return aksiSell(data);
      case "consume":
        return aksiConsume(data);
      case "hireWorker":
        return aksiHireWorker(data);
      case "fireWorker":
        return aksiFireWorker(data);
      case "payWorker":
        return aksiPayWorker(data);
      case "payAllWages":
        return aksiPayAllWages(data);
      case "upgradeWorker":
        return aksiUpgradeWorker(data);
      case "startFactory":
        return aksiStartFactory(data);
      case "collectFactory":
        return aksiCollectFactory(data);
      case "factoryAuto":
        return aksiFactoryAuto(data);
      case "upgradeBuilding":
        return aksiUpgradeBuilding(data);
      case "buyVehicle":
        return aksiBuyVehicle(data);
      case "setVehicle":
        return aksiSetVehicle(data);
      case "marketCreate":
        return aksiMarketCreate(data);
      case "marketCancel":
        return aksiMarketCancel(data);
      case "marketBuy":
        return aksiMarketBuy(data);
      case "marketList":
        return aksiMarketList(data);
      case "visit":
        return aksiVisit(data);
      default:
        throw galat("Aksi Island Tycoon tidak dikenal.", "invalid-argument");
    }
  }

  window.IslandLocal = {
    call,
    pratinjau,
    pratinjauGeser,
    mode: "local",
    catalogVersion: C ? C.CATALOG_VERSION : 0,
  };

})();
