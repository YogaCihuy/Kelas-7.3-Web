/* test-fishing-local.js
   Tes alur Fishing tanpa server/Blaze memakai Firestore tiruan.
   Jalankan: node tableverse-server/dev/test-fishing-local.js */
"use strict";

const path = require("path");

global.window = globalThis;
global.dataSiswa = [
  { absen: 1, namaPanggilan: "Alya", namaLengkap: "Alya Putri" },
  { absen: 2, namaPanggilan: "Bima", namaLengkap: "Bima Saputra" },
];

const { createFakeFirestore } = require("./fake-firestore");
global.db = createFakeFirestore();

require(path.join(__dirname, "../../fishing-catalog.js"));
require(path.join(__dirname, "../../fishing-local.js"));

const FL = window.FishingLocal;
const RANDOM_ASLI = Math.random;
const NOW_ASLI = Date.now;

let lulus = 0;
const gagal = [];
let ridSeq = 0;

function rid() {
  ridSeq += 1;
  return `tes-fishing-${NOW_ASLI()}-${ridSeq.toString().padStart(4, "0")}`;
}

function pakaiUser(absen) {
  global.currentUser = absen ? { absen: Number(absen), namaPanggilan: absen === 1 ? "Alya" : "Bima" } : null;
}

async function panggil(absen, action, body) {
  pakaiUser(absen);
  return FL.call(action, Object.assign({ requestId: rid() }, body || {}));
}

function cek(syarat, label, detail) {
  if (syarat) lulus += 1;
  else {
    gagal.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function cekError(label, kode, fn) {
  try {
    await fn();
    cek(false, label, "tidak melempar error");
  } catch (err) {
    cek(err.code === kode, label, `kode ${err.code} != ${kode} (${err.message})`);
  }
}

async function tangkap(absen) {
  const cast = await panggil(absen, "cast");
  const asli = Date.now;
  const titik = Number(cast.cast.windowStart) + 40;
  Date.now = () => titik;
  try {
    return await panggil(absen, "strike", { castId: cast.cast.id });
  } finally {
    Date.now = asli;
  }
}

(async () => {
  const cat = await panggil(1, "catalog");
  cek(cat.catalog.fish.length === 204, "katalog berisi 204 ikan", String(cat.catalog.fish.length));
  cek(cat.catalog.rods.length === 17, "katalog berisi 17 joran");
  cek(cat.catalog.baits.length === 15, "katalog berisi 15 umpan");

  const Cat = global.FishingCatalog;
  const bobotTotal = (w) => Object.values(w).reduce((a, b) => a + b, 0);
  const bobotDasar = Cat.hitungBobotRarity(0);
  const bobotLama = Cat.hitungBobotRarity(72);
  const bobotBaru = Cat.hitungBobotRarity(100);
  const bobotPuncak = Cat.hitungBobotRarity(78 + 40);
  const bobotLamaPotion = Cat.hitungBobotRarity(72 * 3, 3);
  cek(cat.catalog.rarityBaseWeight.secret === 5, "Secret dasar 0,05%", String(cat.catalog.rarityBaseWeight.secret));
  cek(cat.catalog.rarityCaps.secret === 50, "batas Secret 0,5%", String(cat.catalog.rarityCaps.secret));
  cek(bobotDasar.secret === 5, "bobot Secret dasar 5 per 10.000", String(bobotDasar.secret));
  cek(bobotLama.secret === 10, "gear lama (luck 72) mentok di 0,1%", String(bobotLama.secret));
  cek(bobotBaru.secret === 50, "gear baru (luck 100) sampai 0,5%", String(bobotBaru.secret));
  cek(bobotPuncak.secret === 50, "joran + umpan terbaru tetap di batas 0,5%", String(bobotPuncak.secret));
  cek(bobotLamaPotion.secret === 10, "Potion tidak menembus batas Secret gear lama", String(bobotLamaPotion.secret));
  cek([bobotDasar, bobotLama, bobotBaru, bobotPuncak, bobotLamaPotion].every((w) => bobotTotal(w) === 10000), "total bobot tetap 10.000");
  cek(Cat.ROD_BY_ID.dewa.luck > Cat.ROD_BY_ID.legenda.luck, "joran baru lebih OP dari Joran Sang Legenda");
  cek(Cat.BAIT_BY_ID.supernova.luck > Cat.BAIT_BY_ID.bintang.luck, "umpan baru lebih OP dari Umpan Bintang");

  const awal = await panggil(1, "ensure");
  cek(awal.ok === true, "ensure sukses");
  cek(awal.state.coins === 500, "koin awal 500", String(awal.state.coins));
  cek(awal.state.rods.length === 1 && awal.state.rods[0].id === "bambu", "joran awal bambu");
  cek(awal.state.baits.cacing === 10, "umpan awal 10 cacing");
  cek(awal.state.name === "Alya", "nama dari akun", awal.state.name);

  pakaiUser(0);
  await cekError("ensure tanpa login ditolak", "unauthenticated", () => FL.call("ensure", {}));
  await cekError("ensure absen akun lain ditolak", "permission-denied", () =>
    panggil(1, "ensure", { absen: 2 })
  );

  const cast = await panggil(1, "cast");
  cek(cast.ok === true, "cast sukses");
  cek(cast.state.baits.cacing === 9, "umpan berkurang 1", String(cast.state.baits.cacing));
  cek(cast.state.stats.casts === 1, "stat cast bertambah");
  cek(cast.cast.windowEnd > cast.cast.windowStart, "window strike valid");
  cek(cast.state.activeCast && cast.state.activeCast.id === cast.cast.id, "activeCast tersimpan");

  const awalMs = Date.now();
  const asliEarly = Date.now;
  Date.now = () => awalMs;
  try {
    const terlaluCepat = await panggil(1, "strike", { castId: cast.cast.id });
    cek(terlaluCepat.ok === false && terlaluCepat.reason === "early", "tarik terlalu cepat = early");
    cek(terlaluCepat.state.stats.misses === 1, "miss bertambah");
  } finally {
    Date.now = asliEarly;
  }

  const hasil = await tangkap(1);
  cek(hasil.ok === true, "strike dalam window dapat ikan");
  cek(!!hasil.fish && !!hasil.fish.id, "ikan dikembalikan");
  cek(hasil.state.totalCaught === 1, "totalCaught 1", String(hasil.state.totalCaught));
  cek(hasil.state.fish[hasil.fish.id] === 1, "ikan masuk tas");
  cek(hasil.state.activeCast === null, "activeCast dibersihkan");
  cek(typeof hasil.durability === "number", "durability dilaporkan");

  const st1 = await panggil(1, "state");
  const fishId = Object.keys(st1.state.fish)[0];
  cek(!!fishId, "state mengembalikan isi tas");

  const jual = await panggil(1, "sell", { mode: "one", fishId, qty: 1 });
  cek(jual.ok === true && jual.total > 0, "jual 1 ikan dapat koin");
  cek(jual.state.fish[fishId] === undefined, "ikan terjual hilang dari tas");
  cek(jual.state.coins > 500, "koin bertambah setelah jual", String(jual.state.coins));

  const simpan = db.__get("fishing", "1");
  simpan.coins = 100000;
  db.__set("fishing", "1", simpan);

  const beliJoran = await panggil(1, "buyRod", { rodId: "fiber" });
  cek(beliJoran.ok === true, "beli joran fiber");
  cek(beliJoran.state.rods.length === 2, "joran bertambah jadi 2");
  cek(beliJoran.state.coins === 100000 - 650, "harga joran dipotong", String(beliJoran.state.coins));
  await cekError("beli joran yang sama ditolak", "failed-precondition", () =>
    panggil(1, "buyRod", { rodId: "fiber" })
  );

  const beliUmpan = await panggil(1, "buyBait", { baitId: "udang", qty: 5 });
  cek(beliUmpan.ok === true && beliUmpan.state.baits.udang === 5, "beli 5 udang");
  const stPenuh = db.__get("fishing", "1");
  stPenuh.baits.udang = 9500;
  db.__set("fishing", "1", stPenuh);
  await cekError("beli umpan stok kebanyakan ditolak", "failed-precondition", () =>
    panggil(1, "buyBait", { baitId: "udang", qty: 999 })
  );
  const stBalik = db.__get("fishing", "1");
  stBalik.baits.udang = 5;
  db.__set("fishing", "1", stBalik);

  const pakaiUmpan = await panggil(1, "equip", { slot: "bait", id: "udang" });
  cek(pakaiUmpan.state.equippedBait === "udang", "equip umpan udang");

  const pakaiJoran = await panggil(1, "equip", { slot: "rod", id: "bambu" });
  cek(pakaiJoran.state.equippedRod === "bambu", "equip joran bambu");

  const st2 = db.__get("fishing", "1");
  st2.rods.find((r) => r.id === "fiber").durability = 10;
  db.__set("fishing", "1", st2);
  const koinSebelum = st2.coins;
  const repair = await panggil(1, "repair", { rodId: "fiber" });
  cek(repair.ok === true, "repair joran");
  cek(repair.cost === (70 - 10) * 4, "biaya repair sesuai", String(repair.cost));
  cek(repair.state.coins === koinSebelum - repair.cost, "koin repair dipotong");

  const hasil2 = await tangkap(1);
  const fish2 = hasil2.fish.id;
  await tangkap(1);
  const kunci = await panggil(1, "lock", { fishId: fish2, locked: true });
  cek(kunci.state.locked[fish2] === true, "kunci ikan");
  const jualSemua = await panggil(1, "sell", { mode: "all" });
  cek(jualSemua.ok === true, "jual semua");
  cek(jualSemua.state.fish[fish2] === 1, "ikan terkunci tidak terjual");

  const buka = await panggil(1, "lock", { fishId: fish2, locked: false });
  cek(!buka.state.locked[fish2], "buka kunci ikan");

  const idTetap = rid();
  await panggil(1, "equip", { slot: "rod", id: "fiber", requestId: idTetap });
  await cekError("requestId ganda ditolak", "aborted", () =>
    panggil(1, "equip", { slot: "rod", id: "bambu", requestId: idTetap })
  );

  const ensure2 = await panggil(1, "ensure");
  cek(ensure2.state.totalCaught >= 2, "progres tersimpan setelah ensure ulang");
  cek(ensure2.state.rods.length === 2, "joran tersimpan");

  await panggil(2, "ensure");
  Math.random = () => 0.99999;
  const castLeg = await panggil(2, "cast");
  const asliLeg = Date.now;
  Date.now = () => Number(castLeg.cast.windowStart) + 30;
  let leg;
  try {
    leg = await panggil(2, "strike", { castId: castLeg.cast.id });
  } finally {
    Date.now = asliLeg;
    Math.random = RANDOM_ASLI;
  }
  cek(leg.ok === true && leg.rarity === "secret", "roll maksimum dapat Secret", leg.rarity);
  cek(leg.firstSlot === 1, "Secret pertama slot 1", String(leg.firstSlot));
  const meta = db.__get("fishingMeta", "firstCatches");
  cek(meta && Array.isArray(meta.secret) && meta.secret.length === 1, "firstCatches secret tersimpan");
  const ann = db.__all("fishingAnnouncements");
  cek(ann.length === 1 && ann[0].data.type === "secret", "pengumuman secret dibuat");

  // ── AUTO SELL ─────────────────────────────────────
  const totalTas = (s) => Object.values(s.fish || {}).reduce((a, b) => a + b, 0);
  cek(cat.catalog.worker && cat.catalog.worker.price === 3000, "katalog worker harga 3000");
  cek(cat.catalog.worker.max === 3, "katalog maksimal 3 worker");
  cek(cat.catalog.worker.baseSpeedMs === 3600000 && cat.catalog.worker.minSpeedMs === 900000 && cat.catalog.worker.stepMs === 300000, "worker 1 jam bisa upgrade sampai 15 menit");

  await cekError("ambang auto sell negatif ditolak", "invalid-argument", () =>
    panggil(1, "setAutoSell", { enabled: true, minPrice: -1 })
  );

  const autoOn = await panggil(1, "setAutoSell", { enabled: true, minPrice: 1000000 });
  cek(autoOn.state.autoSell.enabled === true, "auto sell bisa diaktifkan");
  cek(autoOn.state.autoSell.minPrice === 1000000, "ambang auto sell tersimpan", String(autoOn.state.autoSell.minPrice));
  const koinSebelumAuto = autoOn.state.coins;
  const autoStat = autoOn.state.stats.autoSold;
  const autoNilai = autoOn.state.stats.autoSoldValue;
  const tasSebelumAuto = totalTas(autoOn.state);
  const hasilAuto = await tangkap(1);
  cek(hasilAuto.autoSold > 0, "ikan baru langsung terjual otomatis");
  cek(hasilAuto.state.coins === koinSebelumAuto + hasilAuto.fish.value, "koin bertambah seharga ikan", `${hasilAuto.state.coins} vs ${koinSebelumAuto}+${hasilAuto.fish.value}`);
  cek(hasilAuto.state.stats.autoSold === autoStat + 1, "stat autoSold bertambah");
  cek(hasilAuto.state.stats.autoSoldValue === autoNilai + hasilAuto.fish.value, "stat nilai auto sell bertambah");
  cek(totalTas(hasilAuto.state) === tasSebelumAuto, "ikan auto sell tidak masuk tas", `${totalTas(hasilAuto.state)} vs ${tasSebelumAuto}`);

  const autoOff = await panggil(1, "setAutoSell", { enabled: false, minPrice: 0 });
  const hasilBiasa = await tangkap(1);
  cek(autoOff.state.autoSell.enabled === false, "auto sell bisa dimatikan");
  cek(hasilBiasa.autoSold === 0, "auto sell nonaktif tidak menjual ikan");
  cek(totalTas(hasilBiasa.state) === tasSebelumAuto + 1, "ikan non-auto-sell masuk tas");

  Math.random = () => 0;
  try {
    const biasa = await tangkap(1);
    cek(biasa.ok === true, "ikan uji terkunci berhasil ditangkap");
    const stKunci = db.__get("fishing", "1");
    stKunci.locked[biasa.fish.id] = true;
    db.__set("fishing", "1", stKunci);
    await panggil(1, "setAutoSell", { enabled: true, minPrice: 1000000 });
    const terkunci = await tangkap(1);
    cek(terkunci.fish.id === biasa.fish.id, "ikan uji terkunci sama jenis");
    cek(terkunci.autoSold === 0, "ikan terkunci tidak ikut auto sell");
  } finally {
    Math.random = RANDOM_ASLI;
  }

  // ── WORKER ────────────────────────────────────────
  const stU2 = db.__get("fishing", "2");
  stU2.coins = 200000;
  stU2.locked = {};
  db.__set("fishing", "2", stU2);

  const w1 = await panggil(2, "buyWorker", { name: "Sari", gender: "perempuan", look: "kapten" });
  cek(w1.ok === true, "beli worker pertama");
  cek(w1.state.coins === 197000, "harga worker 3000", String(w1.state.coins));
  cek(w1.worker.name === "Sari" && w1.worker.gender === "perempuan" && w1.worker.look === "kapten", "custom worker awal tersimpan");
  cek(w1.worker.rodId === "" && w1.worker.level === 0, "worker baru tanpa joran & level 0");
  const w1id = w1.worker.id;

  const w2 = await panggil(2, "buyWorker");
  cek(w2.worker.name === "Nelayan 2", "nama default worker", w2.worker.name);
  const w2id = w2.worker.id;
  const w3 = await panggil(2, "buyWorker", { name: "Budi", gender: "laki", look: "keren" });
  cek(w3.state.workers.length === 3, "tiga worker terdaftar");
  await cekError("worker keempat ditolak", "failed-precondition", () => panggil(2, "buyWorker", { name: "Dodi" }));

  const upd = await panggil(2, "updateWorker", { workerId: w1id, name: "Sari Laut", gender: "lainnya", look: "nenek" });
  cek(upd.worker.name === "Sari Laut" && upd.worker.gender === "lainnya" && upd.worker.look === "nenek", "custom worker bisa diubah");
  await cekError("nama worker kepanjangan ditolak", "invalid-argument", () =>
    panggil(2, "updateWorker", { workerId: w1id, name: "x".repeat(21) })
  );
  await cekError("gender worker ngawur ditolak", "invalid-argument", () =>
    panggil(2, "updateWorker", { workerId: w1id, gender: "alien" })
  );

  const koinUpgrade = upd.state.coins;
  let upg;
  for (let i = 0; i < 9; i += 1) upg = await panggil(2, "upgradeWorker", { workerId: w1id });
  cek(upg.level === 9 && upg.speedMs === 900000, "upgrade worker sampai 15 menit per ikan", `level ${upg.level} speed ${upg.speedMs}`);
  cek(upg.state.coins === koinUpgrade - (1500 + 2200 + 3000 + 4000 + 5200 + 7000 + 9200 + 12000 + 15500), "biaya upgrade sesuai", String(koinUpgrade - upg.state.coins));
  await cekError("upgrade di level maksimal ditolak", "failed-precondition", () =>
    panggil(2, "upgradeWorker", { workerId: w1id })
  );

  await panggil(2, "buyRod", { rodId: "karbon" });
  const pasangRod = await panggil(2, "assignWorkerRod", { workerId: w1id, rodId: "karbon" });
  cek(pasangRod.worker.rodId === "karbon", "joran karbon dipasang ke worker");
  cek(pasangRod.state.equippedRod === "bambu", "joran pemain tetap bambu", String(pasangRod.state.equippedRod));
  await cekError("joran worker tidak bisa dipakai pemain", "failed-precondition", () =>
    panggil(2, "equip", { slot: "rod", id: "karbon" })
  );

  const pasangSemua = await panggil(2, "assignWorkerRod", { workerId: w2id, rodId: "bambu" });
  cek(pasangSemua.state.equippedRod === "", "pemain tanpa joran bebas", String(pasangSemua.state.equippedRod));
  await cekError("pemain tanpa joran bebas tidak bisa cast", "failed-precondition", () => panggil(2, "cast"));
  await cekError("joran yang sudah dipakai worker lain ditolak", "failed-precondition", () =>
    panggil(2, "assignWorkerRod", { workerId: w3.worker.id, rodId: "karbon" })
  );

  const lepasRod = await panggil(2, "assignWorkerRod", { workerId: w2id, rodId: "" });
  cek(lepasRod.worker.rodId === "", "joran dilepas dari worker");
  cek(lepasRod.state.equippedRod === "bambu", "joran kembali ke pemain", String(lepasRod.state.equippedRod));
  const hasilPemain = await tangkap(2);
  cek(hasilPemain.ok === true, "pemain bisa mancing lagi setelah joran dilepas");

  const nowW = Date.now();
  const stTick = db.__get("fishing", "2");
  stTick.workers.find((w) => w.id === w1id).lastCatchAt = nowW - (3 * 900000 + 5000);
  db.__set("fishing", "2", stTick);
  const tick1 = await panggil(2, "workerTick");
  cek(tick1.catches.length === 3, "worker menangkap 3 ikan dalam 90 menit (AFK)", String(tick1.catches.length));
  cek(tick1.catches.every((c) => c.workerId === w1id), "tangkapan berasal dari worker berjoran");
  cek(tick1.state.stats.workerCatches >= 3, "stat workerCatches bertambah");

  const autoWorker = await panggil(2, "setAutoSell", { enabled: true, minPrice: 1000000 });
  const koinWorker = autoWorker.state.coins;
  const nowJual = Date.now();
  const stJual = db.__get("fishing", "2");
  stJual.workers.find((w) => w.id === w1id).lastCatchAt = nowJual - (3 * 900000 + 5000);
  db.__set("fishing", "2", stJual);
  const tickJual = await panggil(2, "workerTick");
  cek(tickJual.catches.length === 3 && tickJual.catches.every((c) => c.autoSold > 0), "tangkapan worker ikut auto sell");
  const nilaiJual = tickJual.catches.reduce((a, c) => a + c.value, 0);
  cek(tickJual.state.coins === koinWorker + nilaiJual, "koin worker auto sell sesuai", `${tickJual.state.coins} vs ${koinWorker}+${nilaiJual}`);

  const nowRusak = Date.now();
  const stRusak = db.__get("fishing", "2");
  stRusak.rods.find((r) => r.id === "karbon").durability = 1;
  stRusak.workers.find((w) => w.id === w1id).lastCatchAt = nowRusak - (2 * 900000);
  db.__set("fishing", "2", stRusak);
  const tickRusak = await panggil(2, "workerTick");
  cek(tickRusak.catches.length === 1, "worker berhenti saat joran habis", String(tickRusak.catches.length));
  cek(tickRusak.state.rods.find((r) => r.id === "karbon").durability === 0, "durability joran worker habis");
  const tickIstirahat = await panggil(2, "workerTick");
  cek(tickIstirahat.catches.length === 0, "worker istirahat saat joran rusak");

  const repairW = await panggil(2, "repair", { rodId: "karbon" });
  cek(repairW.ok === true, "joran worker bisa direpair");
  cek(repairW.state.rods.find((r) => r.id === "karbon").durability === 100, "joran worker kembali penuh");
  const nowLagi = Date.now();
  const stLagi = db.__get("fishing", "2");
  stLagi.workers.find((w) => w.id === w1id).lastCatchAt = nowLagi - (2 * 900000 + 5000);
  db.__set("fishing", "2", stLagi);
  const tickLagi = await panggil(2, "workerTick");
  cek(tickLagi.catches.length === 2, "worker kembali bekerja setelah repair", String(tickLagi.catches.length));

  await panggil(2, "assignWorkerRod", { workerId: w2id, rodId: "bambu" });
  // Kerusakan joran per ikan acak; kunci hasil roll supaya 30 tangkapan
  // tidak berhenti di tengah karena durability 100 habis.
  Math.random = () => 0;
  const nowCap = Date.now();
  const stCap = db.__get("fishing", "2");
  stCap.workers.find((w) => w.id === w1id).lastCatchAt = nowCap - 100 * 900000;
  stCap.rods.find((r) => r.id === "karbon").durability = 100;
  db.__set("fishing", "2", stCap);
  const tickCap = await panggil(2, "workerTick");
  cek(tickCap.catches.length === 30, "catch-up worker dibatasi 30 per sinkron", String(tickCap.catches.length));

  const nowSisa = Date.now();
  const stSisa = db.__get("fishing", "2");
  stSisa.rods.find((r) => r.id === "karbon").durability = 100;
  stSisa.workers.find((w) => w.id === w1id).lastCatchAt = nowSisa - (32 * 900000 + 10000);
  db.__set("fishing", "2", stSisa);
  const tickSisa1 = await panggil(2, "workerTick");
  const tickSisa2 = await panggil(2, "workerTick");
  Math.random = RANDOM_ASLI;
  cek(tickSisa1.catches.length === 30, "tick pertama memproses 30 hasil AFK", String(tickSisa1.catches.length));
  cek(tickSisa2.catches.length === 2, "sisa hasil AFK tidak hilang setelah batas per tick", String(tickSisa2.catches.length));

  // Worker juga ikut menjatuhkan potion seperti pemain.
  Math.random = () => 0;
  const nowPotionW = Date.now();
  const stPotionW = db.__get("fishing", "2");
  stPotionW.potions = {};
  stPotionW.rods.find((r) => r.id === "karbon").durability = 100;
  stPotionW.workers.find((w) => w.id === w1id).lastCatchAt = nowPotionW - (900000 + 5000);
  db.__set("fishing", "2", stPotionW);
  const tickPotionW = await panggil(2, "workerTick");
  Math.random = RANDOM_ASLI;
  const dariW1 = tickPotionW.catches.filter((c) => c.workerId === w1id);
  cek(dariW1.length === 1 && !!dariW1[0].potionId, "tangkapan worker bisa berisi potion", dariW1.map((c) => c.potionId).join(","));
  cek(Object.keys(tickPotionW.state.potions).length >= 1, "potion dari tangkapan worker masuk Tas");

  // ── POTION ────────────────────────────────────────
  const stP = db.__get("fishing", "1");
  stP.coins = 50000;
  stP.activeCast = null;
  stP.workers = [];
  stP.rods = stP.rods.map((r) => ({ ...r, durability: 100 }));
  stP.equippedRod = "bambu";
  stP.baits = { cacing: 400 };
  stP.equippedBait = "cacing";
  stP.fish = {};
  stP.locked = {};
  stP.potions = { "luck-2-5": 1 };
  stP.activePotions = {};
  db.__set("fishing", "1", stP);

  cek(cat.catalog.potions.length === 16, "katalog berisi 16 potion", String(cat.catalog.potions.length));
  cek(cat.catalog.potions.every((p) => p.bobot > 0 && p.price === undefined), "potion punya bobot drop dan tidak dijual");
  cek(cat.catalog.potionDrop && cat.catalog.potionDrop.chanceByRarity.secret === 30, "peluang drop potion dari Secret 30%");
  await cekError("pakai potion ngawur ditolak", "invalid-argument", () => panggil(1, "usePotion", { potionId: "luck-9-5" }));
  await cekError("pakai potion yang tidak dimiliki ditolak", "failed-precondition", () => panggil(1, "usePotion", { potionId: "coin-2-5" }));

  const pakaiP = await panggil(1, "usePotion", { potionId: "luck-2-5" });
  cek(pakaiP.ok === true && pakaiP.potion.id === "luck-2-5", "potion luck dipakai dari Tas");
  cek(pakaiP.endsAt >= Date.now() + 290000, "durasi potion 5 menit");
  cek(pakaiP.replaced === false, "potion pertama tidak menimpa apa pun");
  cek(!pakaiP.state.potions["luck-2-5"], "stok potion habis terpakai");
  cek(pakaiP.state.activePotions.luck && pakaiP.state.activePotions.luck.id === "luck-2-5", "potion luck aktif");

  const stHi = db.__get("fishing", "1");
  stHi.rods = stHi.rods.filter((r) => r.id !== "legenda");
  stHi.rods.push({ id: "legenda", durability: 900 });
  stHi.equippedRod = "legenda";
  stHi.baits = { bintang: 50 };
  stHi.equippedBait = "bintang";
  stHi.fish = {};
  db.__set("fishing", "1", stHi);
  const castP = await panggil(1, "cast");
  cek(castP.cast.luck === Math.round((50 + 22) * 2), "luck potion menggandakan luck lemparan", `${castP.cast.luck} vs ${(50 + 22) * 2}`);
  cek(castP.cast.secretMult === 2, "multiplier Secret tersimpan di lemparan", String(castP.cast.secretMult));
  cek(castP.cast.odds.secret === 0.1, "Potion tidak menembus Secret gear lama (tetap 0,1%)", String(castP.cast.odds.secret));
  const stBatal = db.__get("fishing", "1");
  stBatal.activeCast = null;
  db.__set("fishing", "1", stBatal);

  const stDewa = db.__get("fishing", "1");
  stDewa.rods = stDewa.rods.filter((r) => r.id !== "dewa");
  stDewa.rods.push({ id: "dewa", durability: 1900 });
  stDewa.equippedRod = "dewa";
  stDewa.baits = { supernova: 50 };
  stDewa.equippedBait = "supernova";
  db.__set("fishing", "1", stDewa);
  const castDewa = await panggil(1, "cast");
  cek(castDewa.cast.luck === (78 + 40) * 2, "luck gear baru ikut potion", String(castDewa.cast.luck));
  cek(castDewa.cast.odds.secret === 0.5, "gear baru tampil peluang Secret 0,5%", String(castDewa.cast.odds.secret));
  const stDewaBatal = db.__get("fishing", "1");
  stDewaBatal.activeCast = null;
  db.__set("fishing", "1", stDewaBatal);

  const stP2 = db.__get("fishing", "1");
  stP2.potions["luck-2-10"] = 1;
  db.__set("fishing", "1", stP2);
  const pakaiLagi = await panggil(1, "usePotion", { potionId: "luck-2-10" });
  cek(pakaiLagi.replaced === true, "pakai potion kategori sama menimpa yang lama");
  cek(pakaiLagi.state.activePotions.luck.id === "luck-2-10", "potion penimpa jadi aktif");
  cek(!pakaiLagi.state.potions["luck-2-10"], "stok potion penimpa habis");

  // Drop potion dari tangkapan pemain.
  const stDrop = db.__get("fishing", "1");
  stDrop.activeCast = null;
  stDrop.rods = stDrop.rods.map((r) => ({ ...r, durability: 100 }));
  stDrop.equippedRod = "bambu";
  stDrop.baits = { cacing: 400 };
  stDrop.equippedBait = "cacing";
  stDrop.potions = {};
  db.__set("fishing", "1", stDrop);

  Math.random = () => 0;
  try {
    const drop = await tangkap(1);
    cek(drop.potionDrop && drop.potionDrop.id === "luck-2-5", "tangkapan bisa membawa potion", String(drop.potionDrop && drop.potionDrop.id));
    cek(drop.state.potions["luck-2-5"] === 1, "potion drop langsung masuk Tas", String(drop.state.potions["luck-2-5"]));
  } finally {
    Math.random = RANDOM_ASLI;
  }

  Math.random = () => 0.5;
  try {
    const tanpaDrop = await tangkap(1);
    cek(tanpaDrop.potionDrop === null, "tangkapan biasa bisa tanpa potion");
  } finally {
    Math.random = RANDOM_ASLI;
  }

  const stFull = db.__get("fishing", "1");
  stFull.activeCast = null;
  stFull.potions = { "luck-2-5": 99 };
  db.__set("fishing", "1", stFull);
  Math.random = () => 0;
  try {
    const penuh = await tangkap(1);
    cek(penuh.potionDrop === null && penuh.state.potions["luck-2-5"] === 99, "stok potion penuh tidak menambah", String(penuh.state.potions["luck-2-5"]));
  } finally {
    Math.random = RANDOM_ASLI;
  }

  const stCoin = db.__get("fishing", "1");
  stCoin.activeCast = null;
  stCoin.potions = { "coin-2-5": 1 };
  db.__set("fishing", "1", stCoin);
  const pakaiC = await panggil(1, "usePotion", { potionId: "coin-2-5" });
  const stSell = db.__get("fishing", "1");
  stSell.activeCast = null;
  const fishUji = cat.catalog.fish[0];
  stSell.fish = { [fishUji.id]: 3 };
  stSell.locked = {};
  stSell.autoSell = { enabled: false, minPrice: 0 };
  db.__set("fishing", "1", stSell);
  const nilaiDasar = fishUji.value * 3;
  const jualPotion = await panggil(1, "sell", { mode: "qty", fishId: fishUji.id, qty: 3 });
  cek(jualPotion.state.coins === pakaiC.state.coins + nilaiDasar * 2, "potion koin menggandakan hasil jual", `${jualPotion.state.coins} vs ${pakaiC.state.coins}+${nilaiDasar * 2}`);
  cek(jualPotion.bonus === nilaiDasar, "bonus potion koin tercatat", String(jualPotion.bonus));

  const stWP = db.__get("fishing", "2");
  stWP.potions = { "worker-2-5": 1 };
  db.__set("fishing", "2", stWP);
  const pakaiW = await panggil(2, "usePotion", { potionId: "worker-2-5" });
  cek(pakaiW.state.activePotions.worker && pakaiW.state.activePotions.worker.id === "worker-2-5", "potion worker aktif");
  const stPW0 = db.__get("fishing", "2");
  stPW0.rods.find((r) => r.id === "karbon").durability = 100;
  stPW0.workers.find((w) => w.id === w1id).lastCatchAt = Date.now() - (450000 - 1000);
  db.__set("fishing", "2", stPW0);
  const tickPW0 = await panggil(2, "workerTick");
  cek(tickPW0.catches.length === 0, "worker potion belum menangkap sebelum 7,5 menit", String(tickPW0.catches.length));

  const stPW = db.__get("fishing", "2");
  stPW.rods.find((r) => r.id === "karbon").durability = 100;
  stPW.workers.find((w) => w.id === w1id).lastCatchAt = Date.now() - (450000 + 1000);
  db.__set("fishing", "2", stPW);
  const tickPW = await panggil(2, "workerTick");
  cek(tickPW.catches.length === 1, "potion worker mempercepat jadi 7,5 menit per ikan", String(tickPW.catches.length));

  const stExp = db.__get("fishing", "1");
  const kedaluwarsa = Date.now() - 1000;
  stExp.activePotions.coin.endsAt = kedaluwarsa;
  stExp.activePotions.worker = { id: "worker-2-5", endsAt: kedaluwarsa };
  db.__set("fishing", "1", stExp);
  const exp = await panggil(1, "ensure");
  cek(!exp.state.activePotions.coin && !exp.state.activePotions.worker, "potion kedaluwarsa dibersihkan");
  cek(exp.state.activePotions.luck && exp.state.activePotions.luck.id === "luck-2-10", "potion lain yang masih aktif tetap ada");

  const stLama = db.__get("fishing", "2");
  stLama.fieldVersiLama = "sisa";
  db.__set("fishing", "2", stLama);
  const akhir = await panggil(2, "ensure");
  cek(!("fieldVersiLama" in akhir.state), "field sisa versi lama dibuang saat ensure");
  cek(akhir.state.workers.length === 3, "worker tersimpan setelah ensure ulang");
  cek(akhir.state.autoSell.enabled === true, "auto sell tersimpan setelah ensure ulang");

  Date.now = NOW_ASLI;
  console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
  if (gagal.length) process.exitCode = 1;
})().catch((err) => {
  Date.now = NOW_ASLI;
  Math.random = RANDOM_ASLI;
  console.error("TES CRASH:", err);
  process.exitCode = 1;
});
