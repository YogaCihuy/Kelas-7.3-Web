// native-notif.js
// Notifikasi eskul buat versi APK (Capacitor). Di browser biasa file ini gak ngapa-ngapain.
// Cara kerja: jadwal eskul 7 hari ke depan didaftarin sebagai notifikasi LOKAL di HP,
// jadi tetap bunyi walau app ditutup / HP lagi idle. Dijadwal ulang tiap app dibuka,
// tiap ganti akun / eskul / jadwal, dan tiap hari berganti.

(function () {
  const REMINDER_MENIT = 5;   // ingetin berapa menit sebelum eskul mulai (samain kayak versi web)
  const HARI_KE_DEPAN = 7;    // berapa hari ke depan yang dijadwalin

  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const LN = cap.Plugins && cap.Plugins.LocalNotifications;
  if (!LN) return;

  let sigTerakhir = "";
  let sedangJalan = false;
  let antriUlang = false;

  function eskulSaya() {
    if (!currentUser) return [];
    return [currentUser.eskulWajib, ...(currentUser.eskulPilihan || [])].filter(Boolean);
  }

  function hitungSignature() {
    const u = currentUser;
    return JSON.stringify([
      u ? u.absen : null,
      u ? !!u.notifEskul : false,
      eskulSaya(),
      jadwalEskul,
      dateKey(new Date()),
    ]);
  }

  async function batalkanSemua() {
    const p = await LN.getPending();
    if (p.notifications && p.notifications.length) {
      await LN.cancel({ notifications: p.notifications.map((n) => ({ id: n.id })) });
    }
  }

  async function isLibur(key, nama, cache) {
    if (!(key in cache)) {
      try {
        const doc = await db.collection("infoOverrides").doc(key).get();
        cache[key] = doc.exists ? doc.data().eskulLiburList || [] : [];
      } catch (e) {
        cache[key] = []; // offline: anggap gak libur
      }
    }
    return cache[key].includes(nama);
  }

  async function jadwalkan() {
    if (sedangJalan) { antriUlang = true; return; }
    sedangJalan = true;
    try {
      sigTerakhir = hitungSignature();
      await batalkanSemua();

      if (!currentUser || !currentUser.notifEskul) return;

      let izin = await LN.checkPermissions();
      if (izin.display !== "granted") izin = await LN.requestPermissions();
      if (izin.display !== "granted") return;

      await LN.createChannel({ id: "eskul", name: "Pengingat Eskul", importance: 4, vibration: true });

      const saya = eskulSaya();
      const sekarang = new Date();
      const cacheLibur = {};
      const notifikasi = [];

      for (let i = 0; i < HARI_KE_DEPAN; i++) {
        const tgl = new Date(sekarang);
        tgl.setDate(tgl.getDate() + i);
        tgl.setHours(0, 0, 0, 0);
        const key = dateKey(tgl);
        let urutan = 0;

        for (const entry of jadwalEskul[HARI[tgl.getDay()]] || []) {
          const nama = entry.split(" (")[0];
          if (!saya.includes(nama)) continue;
          const jam = /(\d{1,2})\.(\d{2})-/.exec(entry);
          if (!jam) continue;

          const mulai = new Date(tgl);
          mulai.setHours(Number(jam[1]), Number(jam[2]), 0, 0);
          const at = new Date(mulai.getTime() - REMINDER_MENIT * 60 * 1000);
          if (at <= sekarang) continue;
          if (await isLibur(key, nama, cacheLibur)) continue;

          notifikasi.push({
            id: Number(key.replace(/-/g, "").slice(2)) * 100 + urutan++,
            title: `Eskul ${REMINDER_MENIT} menit lagi!`,
            body: `${nama} mulai jam ${jam[1]}.${jam[2]}, siap-siap yuk!`,
            channelId: "eskul",
            schedule: { at, allowWhileIdle: true },
          });
        }
      }

      if (notifikasi.length) await LN.schedule({ notifications: notifikasi });
    } catch (err) {
      console.error("Gagal jadwalin notif eskul:", err);
    } finally {
      sedangJalan = false;
      if (antriUlang) { antriUlang = false; jadwalkan(); }
    }
  }

  // Cek perubahan akun/eskul/jadwal (murah, cuma bandingin string)
  setInterval(() => { if (hitungSignature() !== sigTerakhir) jadwalkan(); }, 3000);

  // Pas app dibuka lagi dari background
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") jadwalkan();
  });

  setTimeout(jadwalkan, 2000);
})();
