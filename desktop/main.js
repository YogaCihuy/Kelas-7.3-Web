// Aplikasi desktop Kelas 7.3 (Windows & Mac).
// Sama kayak APK: app ini cuma "bungkus" web Kelas 7.3, jadi update web langsung kebaca.
// Loading screen & notifikasi eskul datang dari web-nya (script.js), app ini ngurus:
//  - jendela + ikon, - tetap hidup di tray / menu bar biar notifikasi eskul tetap muncul
//  - izin notifikasi, - link luar dibuka di browser, - halaman "gak ada internet".

const { app, BrowserWindow, Tray, Menu, shell, session, nativeImage } = require("electron");
const path = require("path");

const URL_APP = "https://yogacihuy.github.io/Kelas-7.3-Web/";
const ICON = path.join(__dirname, "icon.png");

app.setAppUserModelId("id.kelas73.app"); // wajib di Windows biar notifikasi muncul

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let sedangKeluar = false;

function bukaJendela() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buatJendela() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 380,
    minHeight: 560,
    title: "Kelas 7.3",
    icon: ICON,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // timer notifikasi eskul tetap jalan pas jendela disembunyiin
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadURL(URL_APP);

  // Gak ada internet -> halaman offline (bisa coba lagi otomatis)
  win.webContents.on("did-fail-load", (_e, kode, _desc, _url, utama) => {
    if (utama && kode !== -3) win.loadFile(path.join(__dirname, "offline.html"), { query: { u: URL_APP } });
  });

  // Link ke luar (WhatsApp, TikTok, Instagram, dll) dibuka di browser biasa
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(URL_APP) && !url.startsWith("file:")) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Tombol X cuma nyembunyiin jendela (app tetap jalan di tray / menu bar buat notifikasi)
  win.on("close", (e) => {
    if (!sedangKeluar) {
      e.preventDefault();
      win.hide();
    }
  });
}

function buatTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip("Kelas 7.3");
  const susunMenu = () =>
    Menu.buildFromTemplate([
      { label: "Buka Kelas 7.3", click: bukaJendela },
      {
        label: "Buka otomatis saat komputer nyala",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }),
      },
      { type: "separator" },
      { label: "Keluar", click: () => { sedangKeluar = true; app.quit(); } },
    ]);
  tray.setContextMenu(susunMenu());
  tray.on("click", bukaJendela);
}

app.whenReady().then(() => {
  // Cuma izinkan notifikasi (kamera, mic, lokasi, dll ditolak)
  session.defaultSession.setPermissionRequestHandler((_wc, izin, cb) => cb(izin === "notifications"));
  session.defaultSession.setPermissionCheckHandler((_wc, izin) => izin === "notifications");

  if (process.platform !== "darwin") Menu.setApplicationMenu(null);

  buatJendela();
  buatTray();

  // Kalau dibuka otomatis pas komputer nyala, mulai tersembunyi di tray
  if (process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAsHidden) win.hide();

  app.on("activate", bukaJendela); // klik ikon di Dock (Mac)
});

app.on("second-instance", bukaJendela);
app.on("before-quit", () => { sedangKeluar = true; });
app.on("window-all-closed", () => { /* tetap hidup di tray */ });
