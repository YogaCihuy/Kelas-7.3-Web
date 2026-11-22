/* Tes mesin Island Tycoon dengan Firestore tiruan.
   Jalankan: node island-dev/test-island-local.js */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

/* ---------- jam tiruan ---------- */
let clock = 1700000000000;
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(clock);
  }
  static now() { return clock; }
}
global.Date = FakeDate;

/* ---------- firestore tiruan ---------- */
const docs = new Map();
function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function snapDoc(id, data) {
  return { id, exists: data !== undefined, data: () => clone(data) };
}
function snapQuery(items) {
  return {
    size: items.length,
    docs: items.map((it) => ({ id: it.id, data: () => clone(it.data) })),
    forEach(cb) { items.forEach((it) => cb({ id: it.id, data: () => clone(it.data) })); },
  };
}
function queryRef(segs, filters, orders, lim) {
  return {
    where(field, op, val) { return queryRef(segs, filters.concat([{ field, op, val }]), orders, lim); },
    orderBy(field, dir) { return queryRef(segs, filters, orders.concat([{ field, dir }]), lim); },
    limit(n) { return queryRef(segs, filters, orders, n); },
    async get() {
      const prefix = segs.join("/") + "/";
      let items = [];
      for (const [key, data] of docs) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest || rest.includes("/")) continue;
        let lolos = true;
        for (const f of filters) {
          const v = data[f.field];
          if (f.op === "==" && v !== f.val) lolos = false;
        }
        if (lolos) items.push({ id: rest, data });
      }
      for (const o of orders.slice().reverse()) {
        items.sort((a, b) => {
          const av = a.data[o.field];
          const bv = b.data[o.field];
          return (av < bv ? -1 : av > bv ? 1 : 0) * (o.dir === "desc" ? -1 : 1);
        });
      }
      if (lim != null) items = items.slice(0, lim);
      return snapQuery(items.map((i) => ({ id: i.id, data: i.data })));
    },
  };
}
function docRef(segs) {
  return {
    __segs: segs,
    id: segs[segs.length - 1],
    collection(name) { return collRef(segs.concat(name)); },
    async get() { return snapDoc(this.id, docs.get(segs.join("/"))); },
  };
}
function collRef(segs) {
  return {
    doc(id) { return docRef(segs.concat(String(id))); },
    where(field, op, val) { return queryRef(segs, [{ field, op, val }], [], null); },
    orderBy(field, dir) { return queryRef(segs, [], [{ field, dir }], null); },
    limit(n) { return queryRef(segs, [], [], n); },
    async get() { return queryRef(segs, [], [], null).get(); },
  };
}
const db = {
  collection(name) { return collRef([name]); },
  async runTransaction(fn) {
    const writes = [];
    const tx = {
      async get(ref) {
        const key = ref.__segs.join("/");
        return snapDoc(ref.id, docs.get(key));
      },
      set(ref, data, opts) {
        writes.push({ type: "set", key: ref.__segs.join("/"), data: clone(data), merge: !!(opts && opts.merge) });
        return tx;
      },
      delete(ref) {
        writes.push({ type: "delete", key: ref.__segs.join("/") });
        return tx;
      },
    };
    const hasil = await fn(tx);
    for (const w of writes) {
      if (w.type === "delete") docs.delete(w.key);
      else if (w.merge) docs.set(w.key, { ...(docs.get(w.key) || {}), ...w.data });
      else docs.set(w.key, w.data);
    }
    return hasil;
  },
};

global.window = global;
window.db = db;
window.currentUser = { absen: 1, namaPanggilan: "Penguji Satu" };
global.getMergedAccount = () => null;

const root = path.join(__dirname, "..");
vm.runInThisContext(fs.readFileSync(path.join(root, "island-catalog.js"), "utf8"), { filename: "island-catalog.js" });
vm.runInThisContext(fs.readFileSync(path.join(root, "island-local.js"), "utf8"), { filename: "island-local.js" });
const C = window.IslandCatalog;
assert(C, "katalog termuat");

let seq = 0;
function reqId() { seq += 1; return `req-uji-${String(seq).padStart(6, "0")}`; }
async function call(action, payload) {
  return window.IslandLocal.call(action, { ...(payload || {}), requestId: (payload && payload.requestId) || reqId() });
}
async function gagal(promise, label) {
  let tertangkap = false;
  try { await promise; } catch (err) { tertangkap = true; }
  assert(tertangkap, `harus gagal: ${label}`);
}
function patchIsland(absen, patch) {
  const key = `islands/${absen}`;
  const data = clone(docs.get(key));
  assert(data, `dokumen pulau ${absen} ada`);
  Object.assign(data, patch);
  docs.set(key, data);
}
function patchObject(absen, id, patch) {
  const key = `islands/${absen}/objects/${id}`;
  const data = clone(docs.get(key));
  assert(data, `dokumen objek ${id} ada`);
  Object.assign(data, patch);
  docs.set(key, data);
}
function islandDoc(absen) { return docs.get(`islands/${absen}`); }
function objekDari(hasil, type) { return hasil.objects.filter((o) => o.type === type); }

(async () => {
  /* ================= 1. ensure & pulau awal ================= */
  window.currentUser = { absen: 1, namaPanggilan: "Penguji Satu" };
  const awal = await call("ensure", {});
  assert.strictEqual(awal.state.absen, 1);
  assert.strictEqual(awal.state.money, C.ECONOMY.startMoney);
  assert.strictEqual(awal.state.level, 1);
  assert(awal.objects.length >= 30, "pulau awal punya banyak objek");
  assert.strictEqual(objekDari(awal, "rumah").length, 1);
  assert.strictEqual(objekDari(awal, "gudang").length, 1);
  assert.strictEqual(objekDari(awal, "plot").length, 2);
  assert(objekDari(awal, "pohon").length >= 10);
  assert(objekDari(awal, "batu").length >= 5);
  assert.strictEqual(awal.state.inventory["bibit-gandum"], 3);

  assert.deepStrictEqual(Object.keys(islandDoc(1)).sort(), [
    "absen", "activeVehicle", "createdAt", "inventory", "level", "money",
    "name", "needs", "requests", "stats", "updatedAt", "vehicles", "version",
    "workers", "xp",
  ].sort());

  assert.deepStrictEqual(Object.keys(docs.get("islands/1/objects/awal-1")).sort(), [
    "absen", "auto", "batchStartAt", "batches", "crop", "createdAt", "h", "hp",
    "kind", "level", "plantedAt", "readyAt", "respawnAt", "rot", "type",
    "updatedAt", "w", "x", "y",
  ].sort());
  console.log("ok 1 · ensure pulau awal");

  /* ================= 2. menebang & respawn ================= */
  const pohon = awal.objects.find((o) => o.type === "pohon" && o.x === 3 && o.y === 3);
  assert(pohon);
  let aksi = await call("chop", { id: pohon.id });
  assert.strictEqual(aksi.state.inventory.wood, C.ECONOMY.startInventory.wood + 2);
  assert.strictEqual(aksi.objects.find((o) => o.id === pohon.id).hp, 2);
  await call("chop", { id: pohon.id });
  aksi = await call("chop", { id: pohon.id });
  const pohonHabis = aksi.objects.find((o) => o.id === pohon.id);
  assert.strictEqual(pohonHabis.hp, 0);
  assert(pohonHabis.respawnAt > clock);
  await gagal(call("chop", { id: pohon.id }), "pohon habis");
  clock += C.NATURAL_BY_ID.pohon.respawnMs + 1000;
  aksi = await call("tick", {});
  const pohonSegar = aksi.objects.find((o) => o.id === pohon.id);
  assert.strictEqual(pohonSegar.hp, C.NATURAL_BY_ID.pohon.hp);
  assert.strictEqual(pohonSegar.respawnAt, 0);
  console.log("ok 2 · menebang & respawn");

  /* ================= 3. tanam & panen ================= */
  const plotBaru = await call("place", { type: "plot", x: 20, y: 5, rot: 0 });
  const plotId = plotBaru.object.id;
  assert.strictEqual(plotBaru.state.inventory["bibit-gandum"], 3);
  const tanam = await call("plant", { id: plotId, crop: "gandum" });
  assert.strictEqual(tanam.state.inventory["bibit-gandum"], 2);
  assert(tanam.objects.find((o) => o.id === plotId).readyAt > clock);
  await gagal(call("harvest", { id: plotId }), "panen sebelum matang");
  clock += C.CROP_BY_ID.gandum.growMs + 1000;
  const panen = await call("harvest", { id: plotId });
  assert.strictEqual(panen.state.inventory.grain, C.CROP_BY_ID.gandum.yieldQty);
  assert.strictEqual(panen.objects.find((o) => o.id === plotId).crop, "");
  console.log("ok 3 · tanam & panen");

  /* ================= 4. jual/beli & konsumsi ================= */
  const beli = await call("buy", { itemId: "wood", qty: 5 });
  assert.strictEqual(beli.state.inventory.wood, panen.state.inventory.wood + 5);
  const jual = await call("sell", { itemId: "wood", qty: 2 });
  assert.strictEqual(jual.state.money, beli.state.money + 2 * C.hargaJual("wood"));
  const sebelumMakan = jual.state.needs.hunger;
  const makan = await call("consume", { itemId: "bread" });
  assert(makan.state.needs.hunger >= Math.min(C.NEEDS.max, sebelumMakan + C.RESOURCE_BY_ID.bread.hunger - 1));
  console.log("ok 4 · jual/beli & konsumsi");

  /* ================= 5. pekerja & gaji offline ================= */
  const rekrut = await call("hireWorker", { name: "Budi" });
  assert.strictEqual(rekrut.state.workers.length, 1);
  const kayuSebelum = rekrut.state.inventory.wood;
  const uangSebelum = rekrut.state.money;
  clock += C.WORKER.cycleMs * 5;
  const kerja = await call("tick", {});
  const budi = kerja.state.workers[0];
  assert.strictEqual(budi.totalWood, C.WORKER.woodPerCycle * 5);
  assert.strictEqual(kerja.state.inventory.wood, kayuSebelum + C.WORKER.woodPerCycle * 5);
  assert.strictEqual(kerja.state.money, uangSebelum - C.WORKER.wagePerCycle * 5);
  console.log("ok 5 · pekerja menghasilkan kayu & gaji dipotong");

  patchIsland(1, { money: 0 });
  clock += C.WORKER.cycleMs * 2;
  const miskin = await call("tick", {});
  assert.strictEqual(miskin.state.workers[0].unpaid, true);
  assert.strictEqual(miskin.state.workers[0].debt, C.WORKER.wagePerCycle);
  await gagal(call("payWorker", { workerId: miskin.state.workers[0].id }), "bayar gaji tanpa uang");
  patchIsland(1, { money: 500 });
  const bayar = await call("payWorker", { workerId: miskin.state.workers[0].id });
  assert.strictEqual(bayar.state.workers[0].unpaid, false);
  assert.strictEqual(bayar.state.workers[0].debt, 0);
  console.log("ok 6 · gaji tertunggak & dibayar");

  /* ================= 6. pabrik ================= */
  patchIsland(1, {
    xp: 200,
    money: 20000,
    inventory: { wood: 100, plank: 20, cement: 20, grain: 20, stone: 20, "bibit-gandum": 2 },
    needs: { hunger: 100, thirst: 100, updatedAt: clock },
  });
  const pabrik = await call("place", { type: "pabrik-kayu", x: 31, y: 5, rot: 0 });
  assert.strictEqual(pabrik.state.money, 20000 - C.BUILDING_BY_ID["pabrik-kayu"].harga);
  const pabrikId = pabrik.object.id;
  const mulai = await call("startFactory", { id: pabrikId });
  assert(mulai.object.batchStartAt > 0);
  await gagal(call("startFactory", { id: pabrikId }), "pabrik masih produksi");
  clock += C.durasiPabrik("pabrik-kayu", 1) + 1000;
  const settlePabrik = await call("tick", {});
  assert.strictEqual(settlePabrik.objects.find((o) => o.id === pabrikId).batches, 1);
  const ambil = await call("collectFactory", { id: pabrikId });
  assert.strictEqual(ambil.state.inventory.plank, 20 + C.BUILDING_BY_ID["pabrik-kayu"].resep.output.qty);
  assert.strictEqual(ambil.objects.find((o) => o.id === pabrikId).batches, 0);

  const auto = await call("factoryAuto", { id: pabrikId, auto: true });
  assert.strictEqual(auto.objects.find((o) => o.id === pabrikId).auto, true);
  await call("startFactory", { id: pabrikId });
  clock += C.durasiPabrik("pabrik-kayu", 1) * 2 + 1000;
  const otomatis = await call("tick", {});
  const pabrikObj = otomatis.objects.find((o) => o.id === pabrikId);
  assert(pabrikObj.batches >= 2, "produksi otomatis berjalan offline");
  assert(pabrikObj.batchStartAt > 0, "batch berikutnya otomatis dimulai");
  console.log("ok 7 · pabrik, auto produksi & offline");

  const up = await call("upgradeBuilding", { id: pabrikId });
  assert.strictEqual(up.object.level, 2);
  assert.strictEqual(up.state.inventory.plank, ambil.state.inventory.plank - C.biayaUpgrade("pabrik-kayu", 1).plank);
  console.log("ok 8 · upgrade pabrik");

  // Matikan produksi supaya tes kebutuhan/gudang tidak terpengaruh.
  patchObject(1, pabrikId, { auto: false, batchStartAt: 0, batches: 0 });

  /* ================= 7. kebutuhan & kendaraan ================= */
  const sebelumLapar = (await call("tick", {})).state.needs;
  clock += 60 * 60 * 1000;
  const lapar = await call("tick", {});
  assert(lapar.state.needs.hunger < sebelumLapar.hunger - 10, "hunger turun saat offline");
  assert(lapar.state.needs.thirst < sebelumLapar.thirst - 15, "thirst turun saat offline");

  patchIsland(1, { xp: 700, money: 5000 });
  const mobil = await call("buyVehicle", { type: "mobil" });
  assert.strictEqual(mobil.state.vehicles.length, 1);
  assert.strictEqual(mobil.state.activeVehicle, mobil.vehicle.id);
  const keluar = await call("setVehicle", { vehicleId: "" });
  assert.strictEqual(keluar.state.activeVehicle, "");
  const masuk = await call("setVehicle", { vehicleId: mobil.vehicle.id });
  assert.strictEqual(masuk.state.activeVehicle, mobil.vehicle.id);
  console.log("ok 9 · kebutuhan & kendaraan");

  /* ================= 8. penempatan hybrid ================= */
  await gagal(call("place", { type: "plot", x: 5, y: 5, rot: 0 }), "grid menimpa rumah");
  await gagal(call("place", { type: "bunga", x: 6, y: 6, rot: 0 }), "dekor di dalam rumah");
  const dekor = await call("place", { type: "bunga", x: 20.5, y: 12.5, rot: 0 });
  assert.strictEqual(dekor.object.x, 20.5);
  const geser = await call("move", { id: dekor.object.id, x: 22.5, y: 12.5 });
  assert.strictEqual(geser.object.x, 22.5);
  await gagal(call("move", { id: dekor.object.id, x: 6, y: 6 }), "geser dekor ke rumah");
  const hapus = await call("remove", { id: dekor.object.id });
  assert(!hapus.objects.some((o) => o.id === dekor.object.id));
  await gagal(call("remove", { id: "awal-1" }), "hapus rumah utama");
  console.log("ok 10 · penempatan hybrid & geser/hapus");

  /* ================= 9. gudang penuh ================= */
  patchIsland(1, { inventory: { wood: C.ECONOMY.storageBase }, workers: [], vehicles: [], activeVehicle: "" });
  await gagal(call("buy", { itemId: "water", qty: 1 }), "beli saat gudang penuh");
  await gagal(call("chop", { id: pohon.id }), "tebang saat gudang penuh");
  console.log("ok 11 · batas gudang");

  /* ================= 10. level & pondok & pekerja ================= */
  window.currentUser = { absen: 3, namaPanggilan: "Penguji Tiga" };
  await call("ensure", {});
  await gagal(call("place", { type: "pabrik-air", x: 33, y: 28, rot: 0 }), "pabrik terkunci level");
  patchIsland(3, { money: 5000 });
  const pondok = await call("place", { type: "pondok", x: 22, y: 20, rot: 0 });
  assert.strictEqual(pondok.object.type, "pondok");
  for (let i = 0; i < 4; i += 1) await call("hireWorker", { name: `Kru ${i + 1}` });
  const tiga = (await call("tick", {})).state;
  assert.strictEqual(tiga.workers.length, 4);
  await gagal(call("hireWorker", { name: "Kru 5" }), "slot pekerja penuh");
  console.log("ok 12 · level & pondok menambah slot pekerja");

  /* ================= 11. marketplace ================= */
  window.currentUser = { absen: 1, namaPanggilan: "Penguji Satu" };
  patchIsland(1, { inventory: { wood: 30 }, money: 1000 });
  const tawar = await call("marketCreate", { itemId: "wood", qty: 10, price: 20 });
  assert.strictEqual(islandDoc(1).inventory.wood, 20, "barang masuk escrow");
  assert.strictEqual(docs.get(`islandOffers/${tawar.offer.id}`).qty, 10);

  window.currentUser = { absen: 2, namaPanggilan: "Penguji Dua" };
  await call("ensure", {});
  const daftar = await call("marketList", {});
  assert(daftar.offers.some((o) => o.id === tawar.offer.id && !o.mine));
  const beliTawar = await call("marketBuy", { offerId: tawar.offer.id, qty: 4 });
  assert.strictEqual(beliTawar.state.inventory.wood, C.ECONOMY.startInventory.wood + 4);
  assert.strictEqual(beliTawar.state.money, C.ECONOMY.startMoney - 80);
  assert.strictEqual(docs.get(`islandOffers/${tawar.offer.id}`).qty, 6);
  await call("marketBuy", { offerId: tawar.offer.id });
  assert(!docs.get(`islandOffers/${tawar.offer.id}`), "tawaran habis dihapus");
  assert.strictEqual(islandDoc(1).money, 1000 + 200, "penjual menerima uang");

  const tawar2 = await call("marketCreate", { itemId: "stone", qty: 5, price: 15 });
  const batal = await call("marketCancel", { offerId: tawar2.offer.id });
  assert.strictEqual(batal.state.inventory.stone, C.ECONOMY.startInventory.stone);
  assert(!docs.get(`islandOffers/${tawar2.offer.id}`));
  console.log("ok 13 · marketplace escrow, beli & batal");

  /* ================= 12. kunjungan ================= */
  const kunjungan = await call("visit", { absen: 1 });
  assert.strictEqual(kunjungan.absen, 1);
  assert(kunjungan.objects.length >= 30);
  assert.strictEqual(kunjungan.objects.filter((o) => o.type === "rumah").length, 1);
  await gagal(call("visit", { absen: 64 }), "kunjungi pulau yang belum ada");
  console.log("ok 14 · kunjungan pulau");

  /* ================= 13. dedupe transaksi ================= */
  window.currentUser = { absen: 1, namaPanggilan: "Penguji Satu" };
  patchIsland(1, { money: 1000, inventory: { bread: 2 } });
  const satu = await call("sell", { itemId: "bread", qty: 1, requestId: "req-dedupe-001" });
  await gagal(call("sell", { itemId: "bread", qty: 1, requestId: "req-dedupe-001" }), "requestId ganda");
  assert(satu.state.money > 1000);
  console.log("ok 15 · anti transaksi ganda");

  console.log("\nSEMUA TES LULUS");
})().catch((err) => {
  console.error("\nTES GAGAL:", err && err.message);
  console.error(err && err.stack);
  process.exit(1);
});
