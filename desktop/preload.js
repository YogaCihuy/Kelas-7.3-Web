// Nandain ke web kalau lagi dibuka dari aplikasi desktop (dipakai buat loading screen,
// tombol download, dan notifikasi). Jalan sebelum script web dimuat.
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("kelas73Desktop", { platform: process.platform });
