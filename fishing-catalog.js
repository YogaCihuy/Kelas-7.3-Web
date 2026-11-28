(function () {
  "use strict";

  // Katalog Fishing versi browser (tanpa Blaze). Dipakai fishing-local.js.

  const CATALOG_VERSION = 8;

  const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "mythic", "legend", "secret"];

  const RARITY_INFO = {
    common: { label: "Common", labelId: "Umum", color: "#7f9c8c", soft: "#e8f1ec", chance: 55.29, order: 0 },
    uncommon: { label: "Uncommon", labelId: "Langka Muda", color: "#3f9e68", soft: "#e2f6e9", chance: 25, order: 1 },
    rare: { label: "Rare", labelId: "Langka", color: "#3d7fd6", soft: "#e3efff", chance: 12, order: 2 },
    epic: { label: "Epic", labelId: "Epik", color: "#8a5bd6", soft: "#efe6ff", chance: 5.5, order: 3 },
    mythic: { label: "Mythic", labelId: "Mitos", color: "#d94f9e", soft: "#ffe3f3", chance: 1.7, order: 4 },
    legend: { label: "Legend", labelId: "Legenda", color: "#d99a2b", soft: "#fff2cf", chance: 0.5, order: 5 },
    secret: { label: "Secret", labelId: "Rahasia", color: "#e0445c", soft: "#ffe1e6", chance: 0.05, order: 6 },
  };

  // Bobot dasar per 10.000 cast. Totalnya tepat 10.000 (100%).
  const RARITY_BASE_WEIGHT = {
    common: 5525,
    uncommon: 2500,
    rare: 1200,
    epic: 550,
    mythic: 170,
    legend: 50,
    secret: 5,
  };

  // Batas maksimum bobot per rarity setelah luck (legend 2%, secret 0,5%).
  const RARITY_CAPS = {
    common: 9999,
    uncommon: 3500,
    rare: 2600,
    epic: 1500,
    mythic: 600,
    legend: 200,
    secret: 50,
  };

  // [id, nama, rarity, nilai jual, berat(kg), bentuk, warna badan, warna perut, warna sirip, corak, deskripsi]
  const FISH_RAW = [
    // ── COMMON (30) ─────────────────────────────────────────────
    ["teri-perak", "Teri Perak", "common", 8, 0.12, "slim", "#b9d9e6", "#f4fbfd", "#7fb3c8", "scales", "Ikan mungil berkilau yang suka bergerombol di permukaan."],
    ["mujair-hijau", "Mujair Hijau", "common", 14, 1.1, "round", "#7fa86b", "#edf6e3", "#527d45", "scales", "Mujair tangguh yang mudah ditemukan di air tawar."],
    ["nila-merah", "Nila Merah", "common", 16, 1.0, "round", "#d97b6c", "#ffe9df", "#a94f43", "plain", "Nila dengan sisik kemerahan dan tubuh yang padat."],
    ["mas-kecil", "Mas Kecil", "common", 18, 0.8, "carp", "#e3b45a", "#fff1c9", "#b8862f", "scales", "Ikan mas muda yang lincah dan sering melompat."],
    ["lele-kumis", "Lele Kumis", "common", 15, 1.4, "catfish", "#6f6a58", "#d9d4bf", "#4a4638", "plain", "Lele berkumis panjang yang pintar bersembunyi di lumpur."],
    ["tawes-perak", "Tawes Perak", "common", 12, 0.6, "slim", "#a8c3cf", "#f2f9fc", "#7494a3", "scales", "Tawes gesit dengan tubuh berkilau keperakan."],
    ["sepat-sirip-merah", "Sepat Sirip Merah", "common", 10, 0.3, "fancy", "#b9a7d1", "#f6efff", "#d95f5f", "spots", "Sirip merahnya kecil, tapi gerakannya sangat anggun."],
    ["gabus-belang", "Gabus Belang", "common", 20, 1.3, "long", "#5f7152", "#dbe5cf", "#3f5036", "stripes", "Gabus buas dengan corak belang di sepanjang tubuh."],
    ["betok-cerewet", "Betok Cerewet", "common", 11, 0.2, "round", "#8a7d5f", "#efe8d3", "#5f573e", "spots", "Ikan kecil yang selalu muncul saat air mulai tenang."],
    ["capung-air", "Capung Air", "common", 9, 0.15, "slim", "#7fbcc4", "#e9fbfd", "#4e8f99", "gradient", "Badan birunya berkilau seperti tetesan air."],
    ["uceng-kecil", "Uceng Kecil", "common", 7, 0.1, "slim", "#c9b98a", "#fbf4dd", "#9b8a57", "plain", "Uceng mungil yang jadi makanan favorit ikan besar."],
    ["wader-kembang", "Wader Kembang", "common", 10, 0.25, "slim", "#d28d72", "#ffe8df", "#a05f49", "spots", "Wader ceria dengan bintik mirip kembang kecil."],
    ["koi-corak", "Koi Corak", "common", 24, 1.1, "carp", "#f0a04b", "#fff4df", "#d95f5f", "patches", "Koi muda dengan corak cerah yang tidak pernah sama."],
    ["sapu-sapu", "Sapu-Sapu", "common", 13, 0.9, "catfish", "#6d756f", "#d9dfda", "#444c46", "spots", "Pembersih dasar air yang menempel di bebatuan."],
    ["bawal-kecil", "Bawal Kecil", "common", 22, 1.4, "round", "#93a9b7", "#eef5f9", "#627d8f", "plain", "Bawal muda bertubuh pipih dengan sirip runcing."],
    ["kembung-perak", "Kembung Perak", "common", 14, 0.5, "slim", "#a9c8d6", "#f6fbfd", "#6b9aaf", "stripes", "Kembung dengan garis-garis samar di punggung."],
    ["tongkol-muda", "Tongkol Muda", "common", 26, 2.5, "tuna", "#5d7f96", "#dfeef5", "#3e5f75", "stripes", "Tongkol kecil yang sudah punya tenaga luar biasa."],
    ["kakap-muda", "Kakap Muda", "common", 24, 1.8, "round", "#d98f7f", "#ffebe3", "#a55e51", "scales", "Kakap muda dengan mata besar dan sisik kemerahan."],
    ["kerapu-kecil", "Kerapu Kecil", "common", 25, 2.0, "grouper", "#8e7d63", "#f0e8d8", "#62533e", "spots", "Kerapu muda yang lebih suka bersembunyi di karang."],
    ["baronang-bintik", "Baronang Bintik", "common", 21, 1.6, "round", "#9aa46f", "#f0f4dc", "#6b7544", "spots", "Baronang dengan bintik hijau seperti lumut laut."],
    ["layur-pita", "Layur Pita", "common", 12, 0.7, "long", "#c7d3da", "#f8fbfc", "#93a8b3", "gradient", "Tubuhnya panjang berkilau seperti pita perak."],
    ["julung-julung", "Julung-Julung", "common", 13, 0.4, "slim", "#8fbfc9", "#f0fbff", "#5f929e", "gradient", "Ikan ramping dengan moncong panjang seperti jarum."],
    ["terbang-kecil", "Terbang Kecil", "common", 13, 0.3, "fancy", "#7aa9d6", "#eaf4ff", "#4d78a8", "plain", "Siripnya lebar dan sering melompat di atas air."],
    ["selar-kuning", "Selar Kuning", "common", 15, 0.6, "slim", "#d8c25d", "#fff7d6", "#a8932e", "stripes", "Selar dengan garis kuning cerah di sisi tubuh."],
    ["tembang-sarden", "Tembang Sarden", "common", 14, 0.5, "slim", "#9db5c4", "#f4f9fc", "#6b8b9f", "scales", "Sarden kecil yang setia berenang dalam kawanan."],
    ["ikan-kaca", "Ikan Kaca", "common", 9, 0.1, "slim", "#bfe8e2", "#ffffff", "#8bc9c1", "gradient", "Tubuhnya bening hingga tulangnya hampir terlihat."],
    ["patin-kumis", "Patin Kumis", "common", 28, 2.2, "catfish", "#7b7f8a", "#e3e6ee", "#50545f", "plain", "Patin dengan kumis panjang dan gerakan yang tenang."],
    ["gurame-kecil", "Gurame Kecil", "common", 27, 1.7, "round", "#6f7d5d", "#e8efdd", "#4b573d", "scales", "Gurame muda yang doyan daun dan tumbuh cepat."],
    ["sepat-mutiara", "Sepat Mutiara", "common", 12, 0.35, "fancy", "#b7b3d6", "#f2f0ff", "#8a85b3", "spots", "Bintik kecil di tubuhnya berkilau seperti mutiara."],
    ["belut-licin", "Belut Licin", "common", 16, 0.5, "eel", "#5f5a4d", "#cfc9b8", "#3d392f", "plain", "Licin, lentur, dan hampir mustahil ditangkap tangan."],

    // ── UNCOMMON (25) ───────────────────────────────────────────
    ["baronang-perak", "Baronang Perak", "uncommon", 52, 2.8, "round", "#b9c4c9", "#f5f8fa", "#84949c", "spots", "Baronang dewasa dengan sisik perak yang tebal."],
    ["kakap-bintang", "Kakap Bintang", "uncommon", 58, 3.0, "round", "#c96f73", "#ffe2e4", "#964a4e", "stars", "Bintik putihnya tersusun seperti bintang di malam hari."],
    ["kerapu-batik", "Kerapu Batik", "uncommon", 55, 2.4, "grouper", "#7f6a9a", "#e9dff5", "#5a4770", "patches", "Corak tubuhnya mirip kain batik yang rumit."],
    ["mujair-emas", "Mujair Emas", "uncommon", 60, 2.6, "round", "#d6b04a", "#fff0bf", "#a37f23", "scales", "Mujair langka yang seluruh tubuhnya keemasan."],
    ["lele-dumbo", "Lele Dumbo", "uncommon", 65, 5.5, "catfish", "#58544b", "#c9c4b8", "#36332d", "spots", "Lele besar dengan kumis tebal dan badan kekar."],
    ["patin-emas", "Patin Emas", "uncommon", 68, 6.0, "catfish", "#c9a24a", "#ffe9a8", "#97742a", "gradient", "Patin istimewa dengan kilau emas di punggungnya."],
    ["gabus-coklat", "Gabus Coklat", "uncommon", 62, 3.2, "long", "#7a5a3f", "#e4d0bd", "#513a27", "stripes", "Gabus dengan corak coklat tua dan gigi tajam."],
    ["toman-bunga", "Toman Bunga", "uncommon", 70, 4.5, "long", "#5f7c62", "#dfecdf", "#3c543e", "patches", "Toman buas dengan corak bunga di sisi tubuh."],
    ["betutu", "Betutu", "uncommon", 66, 3.8, "grouper", "#6b5a4a", "#dbcbbb", "#46382c", "spots", "Suka diam di dasar sungai menunggu mangsa lewat."],
    ["bawal-bintang", "Bawal Bintang", "uncommon", 72, 4.2, "round", "#8e9aa7", "#e7ecf1", "#5f6b77", "stars", "Bawal dengan bintik putih berkilau di tubuh gelap."],
    ["tongkol-hitam", "Tongkol Hitam", "uncommon", 74, 5.0, "tuna", "#4f5f70", "#c8d5e1", "#33414f", "stripes", "Tongkol kuat dengan punggung gelap kebiruan."],
    ["cakalang", "Cakalang", "uncommon", 70, 4.0, "tuna", "#557a92", "#dcebf5", "#36576c", "stripes", "Perenang cepat yang sering mengejar kawanan kecil."],
    ["kembung-laki", "Kembung Laki", "uncommon", 48, 1.0, "slim", "#7fa0b8", "#eaf4fb", "#50718a", "scales", "Kembung dewasa dengan tubuh lebih tebal dan kuat."],
    ["layang", "Layang", "uncommon", 50, 0.8, "slim", "#86a9c9", "#edf5ff", "#54789b", "stripes", "Ikan ramping dengan garis biru yang menawan."],
    ["tuna-kecil", "Tuna Kecil", "uncommon", 80, 6.0, "tuna", "#416a86", "#cfe7f5", "#264d67", "gradient", "Tuna muda yang sudah berotot dan sangat cepat."],
    ["cucut-kecil", "Cucut Kecil", "uncommon", 76, 3.5, "shark", "#7f8b98", "#e3e9ef", "#56616d", "plain", "Hiu kecil yang penasaran tapi belum berbahaya."],
    ["pari-muda", "Pari Muda", "uncommon", 78, 4.0, "ray", "#9c8f7a", "#eee5d7", "#6b5f4e", "spots", "Pari muda yang melayang pelan di atas pasir."],
    ["kakatua", "Kakatua", "uncommon", 54, 2.3, "fancy", "#57b9b0", "#dcfbf7", "#2f8a83", "gradient", "Ikan kakatua dengan warna toska yang cerah."],
    ["angel-kecil", "Angel Kecil", "uncommon", 62, 0.7, "fancy", "#e6c95c", "#fff7cf", "#b69a2e", "stripes", "Angel muda dengan garis kuning dan hitam."],
    ["badut", "Badut", "uncommon", 56, 3.0, "round", "#e88a3f", "#ffe3c9", "#b55f1f", "stripes", "Ikan badut pemberani yang suka dekat karang."],
    ["buntal", "Buntal", "uncommon", 58, 2.2, "round", "#b3a65f", "#f4eec5", "#82762f", "spots", "Kalau terancam, tubuhnya membesar seperti bola."],
    ["ekor-kuning", "Ekor Kuning", "uncommon", 64, 0.9, "slim", "#e3c45b", "#fff6cc", "#b3932e", "gradient", "Ekor kuningnya berkilau saat terkena cahaya."],
    ["botana", "Botana", "uncommon", 60, 1.4, "fancy", "#6f8fd8", "#e6edff", "#4563a8", "patches", "Ikan karang dengan sirip biru yang lebar."],
    ["tembakul", "Tembakul", "uncommon", 46, 0.6, "round", "#8c8a6a", "#e9e7cf", "#5d5b3e", "spots", "Bisa bertahan di lumpur saat air surut."],
    ["senangin", "Senangin", "uncommon", 68, 1.8, "slim", "#c0a56a", "#f7eac9", "#8e743c", "scales", "Senangin dengan sirip panjang dan daging favorit."],

    // ── RARE (20) ───────────────────────────────────────────────
    ["koi-kohaku", "Koi Kohaku", "rare", 160, 3.5, "carp", "#f4f1e8", "#ffffff", "#d9534f", "patches", "Putih bersih dengan corak merah yang berani."],
    ["arwana-muda", "Arwana Muda", "rare", 210, 2.8, "arowana", "#b7c7cf", "#f2f8fb", "#8fa2ac", "scales", "Arwana muda dengan sisik besar berkilau perak."],
    ["kakap-merah", "Kakap Merah", "rare", 190, 7.0, "round", "#c94f4f", "#ffd9d9", "#8f2f2f", "scales", "Kakap merah dengan tubuh kekar dan sirip tajam."],
    ["kerapu-macan", "Kerapu Macan", "rare", 230, 9.0, "grouper", "#8a6f4f", "#e8d6ba", "#5d472d", "spots", "Coraknya seperti macan, tatapannya pun tajam."],
    ["tuna-sirip-biru", "Tuna Sirip Biru", "rare", 250, 15, "tuna", "#2f5d7c", "#c9e4f5", "#173f5c", "gradient", "Perenang samudra dengan sirip biru yang kuat."],
    ["marlin-muda", "Marlin Muda", "rare", 260, 12, "marlin", "#3f6f9a", "#d6ecff", "#224d73", "stripes", "Marlin muda dengan moncong panjang seperti tombak."],
    ["swordfish-muda", "Swordfish Muda", "rare", 240, 10, "marlin", "#4f6b80", "#dbe7ef", "#2f4b60", "plain", "Pedang di moncongnya sudah mulai tumbuh panjang."],
    ["mahi-mahi", "Mahi-Mahi", "rare", 245, 11, "mahi", "#4fae8f", "#e2fff2", "#2f8a6d", "spots", "Warna hijaunya berkilau saat melompat dari air."],
    ["pari-bintang", "Pari Bintang", "rare", 255, 14, "ray", "#4e5b73", "#c6d0e0", "#2e3a4f", "stars", "Punggungnya bertabur bintik seperti langit malam."],
    ["hiu-reef", "Hiu Reef", "rare", 235, 13, "shark", "#72808c", "#d8e1e8", "#4a5761", "plain", "Hiu karang yang berpatroli tenang di sekitar terumbu."],
    ["moorish-idol", "Moorish Idol", "rare", 150, 0.8, "fancy", "#f2d15c", "#fff7cc", "#3a3a3a", "stripes", "Siripnya panjang seperti bendera yang berkibar."],
    ["lionfish", "Lionfish", "rare", 170, 1.2, "fancy", "#c95f4f", "#ffe1db", "#8e362c", "stripes", "Duri siripnya indah, tapi harus ditangani hati-hati."],
    ["mandarin", "Mandarin", "rare", 200, 0.4, "fancy", "#3fa7a2", "#d9fffb", "#e58b3f", "patches", "Warnanya seperti lukisan cat air di tubuh mungil."],
    ["angel-kaiser", "Angel Kaiser", "rare", 220, 1.0, "fancy", "#6f7fc9", "#e4e8ff", "#4a5a9e", "stripes", "Angel kaisar dengan garis biru dan kuning."],
    ["tang-kuning", "Tang Kuning", "rare", 140, 2.0, "fancy", "#e9c23f", "#fff6c4", "#b5941f", "plain", "Ikan tang berwarna kuning cerah seperti matahari."],
    ["napoleon-muda", "Napoleon Muda", "rare", 260, 6.0, "grouper", "#4c8f7a", "#dcf5ea", "#2f6656", "spots", "Kerapu napoleon muda dengan bibir tebal khas."],
    ["barakuda", "Barakuda", "rare", 230, 8.0, "long", "#80929e", "#e2eaf0", "#556873", "stripes", "Tubuh panjang dengan gigi tajam dan tatapan tajam."],
    ["giant-trevally", "Giant Trevally", "rare", 250, 9.0, "round", "#7f8c99", "#e2e9ef", "#55626d", "plain", "Trevally raksasa yang dikenal kuat dan cerdik."],
    ["cobia", "Cobia", "rare", 240, 12, "long", "#6b5b4f", "#d9c9bb", "#45372d", "stripes", "Cobia berbadan panjang yang suka mengikuti bayangan."],
    ["bream-emas", "Bream Emas", "rare", 155, 4.0, "round", "#d6b14f", "#fff0b8", "#a37f24", "scales", "Bream dengan sisik keemasan dan dahi tinggi."],

    // ── EPIC (12) ───────────────────────────────────────────────
    ["betta-halfmoon", "Betta Halfmoon", "epic", 700, 0.3, "betta", "#8a5fd9", "#e8dcff", "#e05fa8", "gradient", "Siripnya membuka seperti bulan separuh saat berpose."],
    ["arwana-super-red", "Arwana Super Red", "epic", 900, 4.5, "arowana", "#c43f3f", "#ffe0d9", "#8c2424", "scales", "Sisik merah menyala yang memancarkan wibawa."],
    ["koi-ogon", "Koi Ogon", "epic", 850, 6.0, "carp", "#e9d9a8", "#fff8dd", "#d4b85f", "gradient", "Seluruh tubuhnya berkilau seperti emas cair."],
    ["kerapu-raksasa", "Kerapu Raksasa", "epic", 800, 25, "grouper", "#5f5a4a", "#d9d3c0", "#3a362a", "spots", "Kerapu besar yang bersembunyi di balik karang."],
    ["tuna-mata-besar", "Tuna Mata Besar", "epic", 880, 40, "tuna", "#2f4f6f", "#c9def0", "#18364f", "gradient", "Matanya besar, tenaganya jauh lebih besar."],
    ["hiu-hammer", "Hiu Hammer", "epic", 820, 35, "shark", "#6f7a85", "#d9e0e7", "#47525c", "plain", "Kepala uniknya membantu mendeteksi mangsa."],
    ["pari-manta-kecil", "Pari Manta Kecil", "epic", 900, 50, "ray", "#3f4a5f", "#b8c3d6", "#252f42", "spots", "Sayapnya lebar dan gerakannya seperti melayang."],
    ["napoleon", "Napoleon", "epic", 780, 18, "grouper", "#3f8f7a", "#d9f5ea", "#256756", "spots", "Kerapu napoleon dewasa dengan dahi menonjol."],
    ["wahoo", "Wahoo", "epic", 760, 22, "long", "#4f7f9f", "#d9efff", "#2f5f7f", "stripes", "Salah satu perenang tercepat di laut terbuka."],
    ["giant-grouper", "Giant Grouper", "epic", 890, 45, "grouper", "#4a463c", "#c9c4b8", "#2d2a22", "patches", "Raksasa dasar laut dengan mulut sangat besar."],
    ["sailfish", "Sailfish", "epic", 870, 30, "marlin", "#3f5f9f", "#d9e8ff", "#223f73", "stripes", "Sirip punggungnya terbuka seperti layar kapal."],
    ["golden-dorado", "Golden Dorado", "epic", 740, 15, "mahi", "#d6a03f", "#fff0c9", "#a3761f", "scales", "Ikan emas air tawar dengan gigi yang tajam."],

    // ── MYTHIC (7) ──────────────────────────────────────────────
    ["lele-predator", "Lele Predator", "mythic", 2200, 60, "catfish", "#2f2a33", "#8f88a3", "#17131c", "glow", "Lele raksasa bermata ungu yang muncul di malam gelap."],
    ["arwana-emas", "Arwana Emas", "mythic", 2800, 8.0, "arowana", "#e0b84f", "#fff6d1", "#b08a24", "scales", "Arwana emas yang dipercaya membawa keberuntungan."],
    ["koi-dragon", "Koi Dragon", "mythic", 2500, 9.0, "carp", "#c95f3f", "#ffe0d1", "#8f3624", "patches", "Coraknya menyerupai naga yang sedang menggeliat."],
    ["hiu-putih-muda", "Hiu Putih Muda", "mythic", 3000, 90, "shark", "#8f9aa5", "#e8eef3", "#5f6b75", "plain", "Hiu putih muda yang sudah berani berburu sendirian."],
    ["marlin-biru", "Marlin Biru", "mythic", 3200, 120, "marlin", "#2f4f9f", "#c9d9ff", "#1c3373", "stripes", "Marlin biru legendaris dengan lompatan tinggi."],
    ["tuna-bluefin", "Tuna Bluefin", "mythic", 3500, 150, "tuna", "#1f3f5f", "#b8d4ea", "#0f2840", "gradient", "Tuna raksasa dengan sirip biru baja."],
    ["oarfish", "Oarfish", "mythic", 2600, 110, "oarfish", "#c9c9d6", "#f2f2fa", "#e05f5f", "stripes", "Ikan pita raksasa yang jarang terlihat di permukaan."],

    // ── LEGEND (5) ──────────────────────────────────────────────
    ["raja-kakap", "Raja Kakap", "legend", 9000, 200, "round", "#b03f3f", "#ffd1d1", "#7a2020", "scales", "Kakap merah raksasa yang menguasai terumbu dalam."],
    ["naga-laut", "Naga Laut", "legend", 12000, 260, "dragon", "#2f8f7a", "#c9fff0", "#d9b84f", "glow", "Tubuhnya bersisik hijau dan bersinar seperti naga."],
    ["hiu-purba", "Hiu Purba", "legend", 15000, 320, "shark", "#4a4f5f", "#b8c0d1", "#2a2f3c", "stars", "Hiu dari zaman purba dengan kulit sekeras batu."],
    ["whale-shark-muda", "Whale Shark Muda", "legend", 18000, 450, "whale", "#3f5f7f", "#c9e0f0", "#e8f2f8", "stars", "Raksasa lembut dengan pola bintang di punggung."],
    ["ikan-purba", "Ikan Purba", "legend", 14000, 380, "oarfish", "#6f5f3f", "#d9c9a8", "#b08a3f", "patches", "Fosil hidup yang seharusnya sudah punah ribuan tahun lalu."],

    // ── SECRET (3) ──────────────────────────────────────────────
    ["raja-laut", "Raja Laut", "secret", 45000, 700, "dragon", "#d9b84f", "#fff6c9", "#4fa3d9", "glow", "Penguasa samudra yang hanya muncul sekali dalam seumur hidup."],
    ["fajar-laut", "Fajar Laut", "secret", 70000, 900, "whale", "#e05f8f", "#ffd9e8", "#f2c94f", "stars", "Ikan cahaya fajar yang dipercaya membawa harapan."],
    ["kosmos", "Kosmos", "secret", 120000, 1200, "dragon", "#5f3f9f", "#d9c9ff", "#4ff2d9", "stars", "Benda hidup dari luar dunia yang berdenyut seperti galaksi."],

    // ── GELOMBANG BARU · COMMON (30) ────────────────────────────
    ["teri-jengki", "Teri Jengki", "common", 9, 0.1, "slim", "#a9c9d8", "#f2fafd", "#6f9db2", "scales", "Teri kecil berkilau yang selalu datang berombongan."],
    ["seluang", "Seluang", "common", 8, 0.12, "slim", "#c2d3b9", "#f3f9ee", "#8aa37c", "plain", "Seluang mungil yang gesit menyusuri tepi sungai."],
    ["hampal", "Hampal", "common", 13, 0.4, "round", "#9aa878", "#eef3dd", "#6b7850", "spots", "Hampal bertubuh padat dengan bintik hijau samar."],
    ["wader-batu", "Wader Batu", "common", 10, 0.22, "slim", "#b8a99a", "#f6efe8", "#8a7a69", "plain", "Suka bersembunyi di sela batu sungai yang jernih."],
    ["sepat-hias", "Sepat Hias", "common", 14, 0.35, "fancy", "#c39ad1", "#f7edff", "#9a5fb2", "patches", "Sepat ungu muda dengan sirip yang berkibar lembut."],
    ["gurame-putih", "Gurame Putih", "common", 26, 1.6, "round", "#a9b0a2", "#f2f4ee", "#75806c", "scales", "Gurame bertubuh putih pucat yang doyan daun muda."],
    ["lele-lokal", "Lele Lokal", "common", 17, 1.2, "catfish", "#6d6754", "#d8d2bc", "#474232", "plain", "Lele kampung dengan kumis lentur dan kulit licin."],
    ["baung", "Baung", "common", 19, 1.5, "catfish", "#6f6a5f", "#d9d4c6", "#494436", "spots", "Baung sungai yang aktif mencari makan saat senja."],
    ["lais", "Lais", "common", 15, 0.8, "catfish", "#8c8f96", "#e8eaef", "#5c5f66", "plain", "Lais berbadan panjang dengan sirip punggung runcing."],
    ["tapah-kecil", "Tapah Kecil", "common", 24, 2.0, "catfish", "#5f584c", "#cdc5b3", "#3a352b", "spots", "Tapah muda yang sudah punya kumis panjang."],
    ["gabus-kecil", "Gabus Kecil", "common", 18, 0.8, "long", "#66745a", "#dfe7d5", "#44503a", "stripes", "Gabus kecil dengan corak belang yang mulai jelas."],
    ["belanak", "Belanak", "common", 13, 0.5, "slim", "#a6bfc9", "#f0f8fb", "#708e9b", "stripes", "Belanak suka melompat di air payau yang tenang."],
    ["bandeng-kecil", "Bandeng Kecil", "common", 22, 0.9, "slim", "#b3c6cf", "#f4f9fb", "#7e97a2", "plain", "Bandeng muda bertubuh perak dengan tulang halus."],
    ["kerong-kerong", "Kerong-Kerong", "common", 20, 0.7, "round", "#c98f6f", "#ffe8dc", "#98603f", "stripes", "Kerong-Kerong dengan garis jingga dan mata besar."],
    ["buntal-kecil", "Buntal Kecil", "common", 15, 0.6, "round", "#b8ad72", "#f5efcf", "#867c44", "spots", "Buntal mungil yang mengembang saat merasa terancam."],
    ["lemuru", "Lemuru", "common", 12, 0.3, "slim", "#9fc0cf", "#f2fafd", "#6b90a2", "scales", "Lemuru bergerombol rapat membentuk awan perak."],
    ["selar-kecil", "Selar Kecil", "common", 13, 0.35, "slim", "#d4bf63", "#fff6d0", "#a08c34", "stripes", "Selar mungil dengan garis kuning yang ceria."],
    ["tongkol-kecil", "Tongkol Kecil", "common", 24, 1.8, "tuna", "#637f92", "#e0eef5", "#425f72", "stripes", "Tongkol muda dengan tenaga yang sudah kuat."],
    ["tenggiri-muda", "Tenggiri Muda", "common", 28, 1.5, "long", "#7c8f9c", "#e4ebf0", "#516370", "stripes", "Tenggiri muda bertubuh panjang dan giginya tajam."],
    ["kakap-putih", "Kakap Putih", "common", 29, 2.0, "round", "#b9c3c9", "#f5f8fa", "#7f8b93", "scales", "Kakap putih dengan sisik besar berkilau perak."],
    ["kerapu-lumpur", "Kerapu Lumpur", "common", 26, 1.9, "grouper", "#82765f", "#eee6d5", "#5a4f3c", "spots", "Kerapu yang betah diam di dasar berlumpur."],
    ["baronang-kecil", "Baronang Kecil", "common", 19, 1.0, "round", "#93a17a", "#eff4e2", "#64724c", "spots", "Baronang muda dengan bintik hijau seperti lumut."],
    ["sembilang", "Sembilang", "common", 21, 1.3, "catfish", "#7a7568", "#dfdacc", "#514d41", "plain", "Sembilang berkumis panjang yang aktif di malam hari."],
    ["pari-kecil", "Pari Kecil", "common", 25, 1.2, "ray", "#9a8e7c", "#eee6d8", "#6a5f4e", "spots", "Pari mungil yang melayang pelan di atas pasir."],
    ["cucut-totol", "Cucut Totol", "common", 27, 2.2, "shark", "#89959f", "#e6ecf1", "#5b6771", "spots", "Cucut kecil bertotol yang masih penasaran."],
    ["teri-nasi", "Teri Nasi", "common", 7, 0.08, "slim", "#c6dbe3", "#f6fbfd", "#94b4c0", "plain", "Teri sekecil butir nasi yang selalu datang berbondong."],
    ["terbang-sirip", "Terbang Sirip", "common", 14, 0.35, "fancy", "#7fa9cf", "#ecf5ff", "#517aa3", "plain", "Sirip lebarnya membantunya meluncur di atas ombak."],
    ["cucut-pasir", "Cucut Pasir", "common", 30, 3.0, "shark", "#a3a894", "#f0f2e9", "#747965", "plain", "Cucut pasir yang berpatroli malas di dasar pantai."],
    ["kerapu-muda", "Kerapu Muda", "common", 23, 1.7, "grouper", "#8f8468", "#f0ead9", "#645a41", "spots", "Kerapu muda yang belum berani keluar dari karang."],
    ["kakap-kuning", "Kakap Kuning", "common", 27, 1.9, "round", "#d9bc66", "#fff4cb", "#a68935", "scales", "Kakap kekuningan dengan sirip yang kemerahan."],

    // ── GELOMBANG BARU · UNCOMMON (25) ──────────────────────────
    ["tapah", "Tapah", "uncommon", 72, 5.0, "catfish", "#59544b", "#c7c1b5", "#34302a", "spots", "Tapah besar bermulut lebar yang menunggu di lubuk."],
    ["toman-kecil", "Toman Kecil", "uncommon", 66, 3.5, "long", "#5c7a5d", "#dceae0", "#3b563d", "patches", "Toman muda yang sudah berani menyambar umpan."],
    ["jelawat", "Jelawat", "uncommon", 74, 4.5, "round", "#9aa4a9", "#eef2f5", "#697379", "plain", "Jelawat perak dengan tenaga tarikan yang kuat."],
    ["semah", "Semah", "uncommon", 68, 3.8, "carp", "#c9a15c", "#ffeac2", "#9a752f", "scales", "Semah bersisik keemasan dari sungai berarus deras."],
    ["kancra", "Kancra", "uncommon", 70, 4.2, "carp", "#7d8f73", "#e9f1e2", "#55664d", "scales", "Kancra hijau zaitun yang disakralkan di beberapa daerah."],
    ["baung-kuning", "Baung Kuning", "uncommon", 58, 2.0, "catfish", "#bfa95f", "#f7eecb", "#8e7b33", "plain", "Baung kekuningan dengan kumis yang sangat sensitif."],
    ["juaro", "Juaro", "uncommon", 62, 2.6, "catfish", "#7b828a", "#e6e9ee", "#4f565e", "spots", "Juaro berbadan licin dengan totol samar di sisi."],
    ["riu", "Riu", "uncommon", 64, 2.4, "long", "#9aa7ad", "#edf2f5", "#6a777d", "stripes", "Riu memanjang dengan garis tipis di sepanjang tubuh."],
    ["kelabau", "Kelabau", "uncommon", 60, 2.2, "carp", "#b6b9a4", "#f3f4ea", "#848771", "scales", "Kelabau bersisik besar yang suka makan buah sungai."],
    ["tambakan", "Tambakan", "uncommon", 48, 1.2, "round", "#a7a7a0", "#f2f2ee", "#77776f", "plain", "Tambakan bertubuh pipih dengan dahi menonjol."],
    ["sepat-siam", "Sepat Siam", "uncommon", 46, 1.1, "fancy", "#8f9fa9", "#eef4f7", "#5f7079", "spots", "Sepat pendatang yang kini akrab di kolam warga."],
    ["nila-gift", "Nila Gift", "uncommon", 56, 1.8, "round", "#8fa99c", "#eef7f2", "#5e7a6c", "scales", "Nila cepat tumbuh dengan sisik kehijauan."],
    ["mujair-batu", "Mujair Batu", "uncommon", 61, 2.3, "round", "#84866d", "#eef0e0", "#5b5d45", "spots", "Mujair yang betah di air berbatu dan dingin."],
    ["betok-hias", "Betok Hias", "uncommon", 50, 0.5, "round", "#8f7f9f", "#f0ebf7", "#665476", "spots", "Betok ungu dengan bintik yang berkilau di cahaya."],
    ["belida", "Belida", "uncommon", 78, 2.8, "long", "#b9c3c0", "#f4f8f7", "#84908c", "plain", "Belida berbadan pita yang bahan kerupuknya terkenal."],
    ["jalai", "Jalai", "uncommon", 52, 0.9, "slim", "#9fae8c", "#f0f6e8", "#6f7f5c", "stripes", "Jalai ramping yang lincah di arus sungai jernih."],
    ["baung-putih", "Baung Putih", "uncommon", 63, 2.7, "catfish", "#a7a49a", "#f0efe9", "#777469", "plain", "Baung putih dengan kulit pucat dan kumis lentur."],
    ["layaran", "Layaran", "uncommon", 82, 6.5, "marlin", "#6f93b3", "#e6f2fb", "#456a8a", "stripes", "Layaran biru dengan layar punggung yang megah."],
    ["tongkol-abu", "Tongkol Abu", "uncommon", 69, 3.0, "tuna", "#7b8791", "#e5eaee", "#4f5c66", "stripes", "Tongkol abu-abu dengan otot tebal dan lincah."],
    ["cucut-martil", "Cucut Martil", "uncommon", 86, 5.0, "shark", "#8b939b", "#e8ecf0", "#5c646c", "plain", "Kepala berbentuk martil membantunya mendeteksi mangsa."],
    ["pari-totol", "Pari Totol", "uncommon", 76, 4.6, "ray", "#8f8374", "#ece4d7", "#5f5445", "spots", "Pari bertotol rapat yang bersembunyi di dasar laut."],
    ["kakap-timah", "Kakap Timah", "uncommon", 71, 3.2, "round", "#a9b2b8", "#f1f4f6", "#758087", "scales", "Kakap kelabu seperti timah dengan mata bening."],
    ["kerapu-merah", "Kerapu Merah", "uncommon", 80, 3.6, "grouper", "#b3584f", "#f7d9d5", "#7d3129", "spots", "Kerapu merah dengan mulut besar dan sisik tebal."],
    ["buntal-duri", "Buntal Duri", "uncommon", 57, 1.5, "round", "#a89a5f", "#f4edd2", "#786c34", "spots", "Buntal berduri tajam yang mengembang saat kaget."],
    ["swordfish-kecil", "Swordfish Kecil", "uncommon", 84, 4.0, "marlin", "#58758a", "#dfeef7", "#35566b", "plain", "Pedangnya belum panjang, tapi sudah cukup berani."],

    // ── GELOMBANG BARU · RARE (20) ──────────────────────────────
    ["arwana-pirus", "Arwana Pirus", "rare", 300, 4.5, "arowana", "#4fa39a", "#ddfaf6", "#2f7a72", "scales", "Arwana hijaunya berkilau seperti air pirus."],
    ["arwana-banjar", "Arwana Banjar", "rare", 270, 3.6, "arowana", "#c96f5f", "#ffe3db", "#94422f", "scales", "Arwana kemerahan dengan sirip yang anggun."],
    ["arwana-merah", "Arwana Merah", "rare", 290, 4.0, "arowana", "#b8443c", "#ffd9d4", "#822521", "scales", "Sisik merahnya memantulkan cahaya seperti bara."],
    ["koi-showa", "Koi Showa", "rare", 180, 4.0, "carp", "#2f3138", "#e8e9ee", "#d9534f", "patches", "Koi hitam dengan corak merah dan putih yang berani."],
    ["koi-sanke", "Koi Sanke", "rare", 175, 3.8, "carp", "#f2efe4", "#ffffff", "#d9534f", "patches", "Koi putih dengan bintik merah dan garis hitam."],
    ["koi-bekko", "Koi Bekko", "rare", 160, 3.4, "carp", "#efe8d2", "#ffffff", "#2f3138", "patches", "Koi berbadan putih dengan totol hitam yang rapi."],
    ["koi-tancho", "Koi Tancho", "rare", 210, 3.2, "carp", "#f6f3ea", "#ffffff", "#d93f3f", "spots", "Bintik merah di kepalanya menyerupai matahari."],
    ["kerapu-sunuk", "Kerapu Sunuk", "rare", 265, 8.0, "grouper", "#b03f3f", "#f7d4d4", "#7a2020", "spots", "Kerapu merah berbintik biru yang terkenal mahal."],
    ["kerapu-tikus", "Kerapu Tikus", "rare", 240, 7.0, "grouper", "#8a7a5f", "#ece0c9", "#5c4e36", "spots", "Coraknya seperti tikus tanah dengan bintik gelap."],
    ["kakap-bambu", "Kakap Bambu", "rare", 205, 5.0, "round", "#c9b18f", "#f7ecd9", "#98805c", "scales", "Kakap kekuningan dengan garis seperti ruas bambu."],
    ["kakap-hitam", "Kakap Hitam", "rare", 250, 7.5, "round", "#4f585f", "#c9d0d6", "#2f373d", "scales", "Kakap gelap dengan sisik besar dan gigi tajam."],
    ["tenggiri", "Tenggiri", "rare", 300, 9.0, "long", "#6b7f8c", "#e0e9ef", "#41545f", "stripes", "Tenggiri dewasa yang jadi incaran pemancing laut."],
    ["tuna-kuning", "Tuna Kuning", "rare", 285, 14, "tuna", "#3f6f8f", "#d4ecf9", "#234f6a", "gradient", "Tuna bersirip kuning dengan tenaga luar biasa."],
    ["marlin-hitam", "Marlin Hitam", "rare", 315, 16, "marlin", "#2f3f4f", "#c9d6e0", "#17242f", "plain", "Marlin gelap yang melompat tinggi di laut terbuka."],
    ["hiu-tokek", "Hiu Tokek", "rare", 260, 12, "shark", "#7f8a93", "#e2e9ee", "#525d66", "spots", "Hiu bertotol yang sering menempel di batu karang."],
    ["pari-elang", "Pari Elang", "rare", 295, 18, "ray", "#4f5b6b", "#c9d2de", "#2f3a47", "spots", "Sayap lebarnya membuatnya melayang seperti elang."],
    ["kerapu-karang", "Kerapu Karang", "rare", 235, 6.5, "grouper", "#5f8f7f", "#ddf3ea", "#3b6656", "patches", "Kerapu hijau yang bersembunyi di celah karang."],
    ["barakuda-kuning", "Barakuda Kuning", "rare", 280, 7.0, "long", "#b0a45f", "#f4eecb", "#807534", "stripes", "Barakuda kekuningan dengan gigi yang berkilau."],
    ["tenggiri-hitam", "Tenggiri Hitam", "rare", 275, 10, "long", "#3f4a53", "#c9d3da", "#1f272d", "stripes", "Tenggiri gelap yang menyambar umpan di pagi buta."],
    ["kakap-ekor-kuning", "Kakap Ekor Kuning", "rare", 245, 6.0, "round", "#8fa2ad", "#f2f7fa", "#d9b84f", "scales", "Kakap perak dengan ekor kuning yang mencolok."],

    // ── GELOMBANG BARU · EPIC (12) ──────────────────────────────
    ["arwana-papua", "Arwana Papua", "epic", 950, 6.0, "arowana", "#4f6f9f", "#d9e6f7", "#2f4c7a", "scales", "Arwana biru Papua dengan sisik sebesar koin."],
    ["koi-platinum", "Koi Platinum", "epic", 920, 7.0, "carp", "#dfe6e9", "#ffffff", "#a9b8bf", "gradient", "Seluruh tubuhnya berkilau seperti logam mulia."],
    ["betta-giant", "Betta Giant", "epic", 780, 0.8, "betta", "#3f6fd9", "#dde9ff", "#e05fa8", "gradient", "Betta raksasa dengan sirip biru yang membentang."],
    ["kerapu-kentang", "Kerapu Kentang", "epic", 980, 60, "grouper", "#6b5a3f", "#d9c9a8", "#453722", "patches", "Kerapu besar bercorak kentang yang hidup di palung."],
    ["tuna-sirip-kuning", "Tuna Sirip Kuning", "epic", 900, 55, "tuna", "#2f5f7f", "#d4ecf9", "#d9b84f", "gradient", "Sirip kuningnya menandai perenang samudra sejati."],
    ["hiu-maut", "Hiu Maut", "epic", 870, 70, "shark", "#5f6b75", "#d4dce3", "#37424b", "plain", "Hiu buas dengan tatapan yang membuat air terasa dingin."],
    ["pari-manta", "Pari Manta", "epic", 940, 80, "ray", "#3f4859", "#b8c3d6", "#232d3d", "spots", "Sayapnya lebar dan gerakannya seperti melayang."],
    ["hiu-tikus", "Hiu Tikus", "epic", 760, 40, "shark", "#7f7b6f", "#e8e4d9", "#514d41", "spots", "Hiu dasar laut dengan pola seperti bulu tikus."],
    ["mahi-biru", "Mahi Biru", "epic", 820, 28, "mahi", "#3f7fbf", "#d9ecff", "#23598f", "spots", "Mahi-mahi biru yang berkilau saat melompat."],
    ["kakap-raksasa", "Kakap Raksasa", "epic", 990, 65, "round", "#b03f3f", "#ffd4d4", "#7a2020", "scales", "Kakap merah berukuran raksasa yang menguasai karang."],
    ["hiu-mako", "Hiu Mako", "epic", 930, 50, "shark", "#3f6f9f", "#d4e8f5", "#244a6b", "plain", "Hiu tercepat di laut dengan lompatan setinggi perahu."],
    ["marlin-pasifik", "Marlin Pasifik", "epic", 960, 45, "marlin", "#2f4f6f", "#c9dcec", "#d9b84f", "stripes", "Marlin biru Pasifik dengan pedang panjang berkilau."],

    // ── GELOMBANG BARU · MYTHIC (7) ─────────────────────────────
    ["arwana-super-gold", "Arwana Super Gold", "mythic", 3600, 12, "arowana", "#e6c05a", "#fff7d6", "#b3902f", "scales", "Arwana emas penuh yang dipercaya membawa hoki besar."],
    ["koi-sakura", "Koi Sakura", "mythic", 3400, 10, "carp", "#f2c9d9", "#fff2f7", "#d97a9f", "patches", "Corak merah mudanya seperti kelopak sakura."],
    ["hiu-goblin", "Hiu Goblin", "mythic", 3100, 120, "shark", "#a68f8a", "#efe4e0", "#6f5651", "plain", "Hiu purba bermoncong panjang dari laut dalam."],
    ["tuna-atlantik", "Tuna Atlantik", "mythic", 3800, 180, "tuna", "#1f4f6f", "#b8d9ec", "#0f3047", "gradient", "Tuna raksasa samudra dengan otot sekuat baja."],
    ["oarfish-raksasa", "Oarfish Raksasa", "mythic", 2900, 160, "oarfish", "#c9d4dc", "#f4f8fb", "#e05f5f", "stripes", "Ikan pita sepanjang perahu yang jarang terlihat."],
    ["hiu-putih-raksasa", "Hiu Putih Raksasa", "mythic", 3650, 150, "shark", "#8f99a1", "#eef2f5", "#4f5860", "plain", "Hiu putih sebesar kapal yang menguasai laut dalam."],
    ["pari-raksasa", "Pari Raksasa", "mythic", 3300, 200, "ray", "#3f4859", "#b8c3d6", "#232d3d", "spots", "Pari selebar perahu yang melayang tanpa suara."],

    // ── GELOMBANG BARU · LEGEND (5) ─────────────────────────────
    ["naga-biru", "Naga Biru", "legend", 13500, 280, "dragon", "#2f6f9f", "#c9ecff", "#d9b84f", "glow", "Naga laut bersisik biru yang menjaga palung dalam."],
    ["koi-dewa", "Koi Dewa", "legend", 16000, 240, "carp", "#e0b84f", "#fff6d1", "#d94f8f", "glow", "Koi emas berkilau yang hanya muncul saat air tenang."],
    ["hiu-megalodon", "Hiu Megalodon", "legend", 19500, 480, "shark", "#4f565f", "#b8c0c9", "#2a3037", "stars", "Hiu raksasa purba dengan gigi sebesar telapak tangan."],
    ["naga-langit", "Naga Langit", "legend", 17500, 360, "dragon", "#4f8fbf", "#d4ecff", "#e0c05f", "glow", "Naga yang turun dari awan saat badai menyapu laut."],
    ["hiu-biru-raksasa", "Hiu Biru Raksasa", "legend", 18500, 420, "shark", "#2f5f8f", "#c9e0f0", "#1a3a5c", "gradient", "Hiu biru sepanjang belasan meter yang berenang tenang."],

    // ── GELOMBANG BARU · SECRET (3) ─────────────────────────────
    ["dewa-samudra", "Dewa Samudra", "secret", 150000, 1500, "dragon", "#4fd9c9", "#e0fff9", "#d9b84f", "glow", "Penjaga terakhir lautan yang hanya muncul sekali seumur hidup."],
    ["raja-galaksi", "Raja Galaksi", "secret", 95000, 1100, "whale", "#4f3f9f", "#d9c9ff", "#f2c94f", "stars", "Ikan raksasa yang tubuhnya bertabur gugusan bintang."],
    ["matahari-hitam", "Matahari Hitam", "secret", 110000, 1300, "dragon", "#1f1f2f", "#a9a9c9", "#e05f5f", "glow", "Bola hitam bercahaya yang menelan semua umpan di sekitarnya."],
  ];

  const FISH = FISH_RAW.map(([id, name, rarity, value, weight, shape, color, belly, fin, pattern, desc]) => ({
    id, name, rarity, value, weight, shape, desc,
    art: { body: color, belly, fin, pattern, eye: "#22313a", accent: rarity === "secret" ? "#ffffff" : fin },
  }));

  const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
  const FISH_BY_RARITY = Object.fromEntries(RARITY_ORDER.map((r) => [r, FISH.filter((f) => f.rarity === r)]));

  // id, nama, tier, harga, luck, durability, biaya repair per poin, warna, aksen, deskripsi
  const RODS = [
    ["bambu", "Pancing Bambu", 1, 0, 0, 40, 2, "#b07f58", "#6f452b", "Pancing pertama semua pemain. Sederhana tapi jujur."],
    ["fiber", "Joran Fiber", 2, 650, 2, 70, 4, "#7fa39b", "#4f746c", "Ringan dan lentur, cocok untuk pemula yang rajin mancing."],
    ["karbon", "Joran Karbon", 3, 1500, 4, 100, 6, "#5f6b73", "#343d44", "Batang karbon kuat yang meredam tarikan ikan besar."],
    ["carbon-pro", "Karbon Pro", 4, 3200, 7, 140, 9, "#3f4f8f", "#222f5f", "Versi pro dengan sensitivitas dan daya tahan lebih tinggi."],
    ["perak", "Joran Perak", 5, 6500, 10, 190, 13, "#c9d4dc", "#8f9ca6", "Kilau peraknya jadi tanda pemancing yang sudah berpengalaman."],
    ["emas", "Joran Emas", 6, 12000, 14, 240, 18, "#d9b84f", "#a37f1f", "Joran mewah yang sedikit banyak membawa keberuntungan."],
    ["kristal", "Joran Kristal", 7, 22000, 18, 300, 24, "#8fd9e8", "#4f9fb8", "Bening seperti kristal dan memantulkan cahaya air."],
    ["naga", "Joran Naga", 8, 40000, 23, 380, 31, "#3f8f5f", "#1f5f3f", "Dibuat dari sisik naga laut, katanya begitu."],
    ["bulan", "Joran Bulan", 9, 70000, 28, 470, 39, "#9fa8d9", "#5f6bb8", "Bersinar lembut seperti bulan purnama di atas laut."],
    ["meteor", "Joran Meteor", 10, 120000, 34, 580, 48, "#d96f3f", "#8f3f1f", "Tempaan batu meteor yang jatuh ke dasar samudra."],
    ["abyss", "Joran Abyss", 11, 200000, 40, 720, 60, "#2f2f4f", "#d94f8f", "Mengambil kekuatan dari palung yang tidak pernah tersentuh cahaya."],
    ["legenda", "Joran Sang Legenda", 12, 350000, 50, 900, 75, "#e0b84f", "#9f4fd9", "Joran mitos yang ditenun dari cahaya bintang dan air laut."],
    ["aurora", "Joran Aurora", 13, 500000, 56, 1050, 85, "#5fd9c0", "#e060a8", "Cahaya aurora terperangkap di batangnya dan memikat ikan dari jauh."],
    ["nebula", "Joran Nebula", 14, 800000, 62, 1200, 95, "#7f6fe0", "#3a2f9f", "Debu nebula membuat joran ini peka pada tarikan sekecil apa pun."],
    ["void", "Joran Void", 15, 1250000, 68, 1400, 110, "#2a2f45", "#4ff2d9", "Batang dari ruang hampa; ringan, senyap, dan hampir mustahil patah."],
    ["singularitas", "Joran Singularitas", 16, 1900000, 73, 1650, 130, "#4f2f8f", "#ffd84f", "Menarik keberuntungan seperti gravitasi menarik cahaya."],
    ["dewa", "Joran Dewa Samudra", 17, 2800000, 78, 1900, 150, "#e0b84f", "#4fd9c9", "Ditenun dari karang terdalam, joran terkuat yang pernah ada."],
  ].map(([id, name, tier, price, luck, durability, repair, color, accent, desc]) => ({
    id, name, tier, price, luck, durability, repair, color, accent, desc,
  }));

  const ROD_BY_ID = Object.fromEntries(RODS.map((r) => [r.id, r]));

  // id, nama, tier, harga, luck, deskripsi
  const BAITS = [
    ["cacing", "Cacing Tanah", 1, 5, 0, "Umpan murah yang selalu jadi andalan."],
    ["udang", "Udang Segar", 2, 12, 1, "Wangi lautnya mengundang ikan-ikan kecil."],
    ["jangkrik", "Jangkrik", 3, 20, 2, "Bunyi nyaringnya bikin ikan penasaran."],
    ["pelet", "Pelet Ikan", 4, 30, 3, "Butiran padat yang disukai ikan air tawar."],
    ["ikan-kecil", "Ikan Kecil", 5, 55, 5, "Umpan hidup untuk pemancing yang lebih serius."],
    ["cumi", "Cumi Potong", 6, 85, 7, "Aroma cumi menarik ikan dari jarak jauh."],
    ["udang-mutiara", "Udang Mutiara", 7, 130, 10, "Udang pilihan dengan kilau mutiara."],
    ["kunang", "Kunang-Kunang", 8, 200, 13, "Cahaya kecilnya terlihat jelas di air gelap."],
    ["permata", "Umpan Permata", 9, 320, 17, "Kristal umpan yang memantulkan warna pelangi."],
    ["bintang", "Umpan Bintang", 10, 500, 22, "Konon dibuat dari serpihan bintang yang jatuh ke laut."],
    ["serpihan-aurora", "Umpan Aurora", 11, 650, 24, "Serpihan cahaya utara yang berkilau di dalam air."],
    ["debu-nebula", "Umpan Nebula", 12, 900, 27, "Debu bintang ungu yang membuat ikan penasaran."],
    ["meteorit", "Umpan Meteorit", 13, 1250, 30, "Pecahan batu langit yang hangat dan berbau asing."],
    ["inti-hitam", "Umpan Lubang Hitam", 14, 1700, 34, "Sekecil kelereng, tapi menarik semua ikan di sekitarnya."],
    ["supernova", "Umpan Supernova", 15, 2400, 40, "Ledakan bintang dalam genggaman; umpan paling menggila."],
  ].map(([id, name, tier, price, luck, desc]) => ({ id, name, tier, price, luck, desc }));

  const BAIT_BY_ID = Object.fromEntries(BAITS.map((b) => [b.id, b]));

  // Potion: 4 efek × 4 durasi. Didapat dari tangkapan, disimpan di Tas.
  // Satu potion aktif per kategori (luck/worker/coin).
  const POTION_BASE = [
    {
      cat: "luck", mult: 2, icon: "🍀", name: "Potion Luck x2",
      color: "#3f9e68", soft: "#e2f6e9",
      desc: "Luck mancing jadi 2x selama potion aktif; peluang Rare ke atas ikut naik.",
    },
    {
      cat: "luck", mult: 3, icon: "🌟", name: "Potion Luck x3",
      color: "#d99a2b", soft: "#fff2cf",
      desc: "Luck mancing jadi 3x selama potion aktif; peluang Rare ke atas ikut naik.",
    },
    {
      cat: "worker", mult: 2, icon: "⏩", name: "Potion Worker x2",
      color: "#3d7fd6", soft: "#e3efff",
      desc: "Worker menangkap 2x lebih cepat; worker level maksimal jadi 7,5 menit per ikan.",
    },
    {
      cat: "coin", mult: 2, icon: "💰", name: "Potion Koin x2",
      color: "#8a5bd6", soft: "#efe6ff",
      desc: "Semua koin hasil jual ikan jadi 2x selama potion aktif, termasuk Auto Sell.",
    },
  ];

  // bobot = peluang durasi ini keluar saat potion drop (total 100).
  const POTION_DURASI = [
    { menit: 5, bobot: 55 },
    { menit: 10, bobot: 28 },
    { menit: 15, bobot: 12 },
    { menit: 30, bobot: 5 },
  ];

  const POTIONS = POTION_BASE.flatMap((base) => POTION_DURASI.map((d) => ({
    id: `${base.cat}-${base.mult}-${d.menit}`,
    name: `${base.name} · ${d.menit} menit`,
    cat: base.cat,
    mult: base.mult,
    icon: base.icon,
    color: base.color,
    soft: base.soft,
    minutes: d.menit,
    ms: d.menit * 60000,
    bobot: d.bobot,
    desc: base.desc,
  })));

  // Peluang potion ikut terbawa tiap tangkapan pemain, makin langka ikannya makin besar.
  const POTION_DROP = {
    chanceByRarity: {
      common: 2,
      uncommon: 3,
      rare: 5,
      epic: 8,
      mythic: 12,
      legend: 18,
      secret: 30,
    },
  };

  // Kategori bisa langsung dipakai sebagai label.
  const POTION_CATEGORIES = {
    luck: "Luck",
    worker: "Kecepatan Worker",
    coin: "Koin",
  };

  const POTION_BY_ID = Object.fromEntries(POTIONS.map((p) => [p.id, p]));

  const ECONOMY = {
    startCoins: 500,
    startRod: "bambu",
    startBait: "cacing",
    startBaitQty: 10,
    castMinMs: 1600,
    castMaxMs: 4200,
    strikeEarlyMs: 60,
    strikeWindowBaseMs: 1100,
    strikeWindowPerTierMs: 70,
    castTtlMs: 12000,
    maxBaitStack: 9999,
    maxPotionStack: 99,
    maxSellQty: 9999,
    leaderboardSize: 50,
  };

  // kind: catches | casts | species | earned | rarity | value | rods
  const ACHIEVEMENTS = [
    { id: "first-catch", name: "Tangkapan Pertama", desc: "Tangkap ikan pertamamu.", icon: "🎣", kind: "catches", target: 1 },
    { id: "catch-10", name: "Pemancing Muda", desc: "Tangkap 10 ikan.", icon: "🐟", kind: "catches", target: 10 },
    { id: "catch-50", name: "Rajin Mancing", desc: "Tangkap 50 ikan.", icon: "🎏", kind: "catches", target: 50 },
    { id: "catch-100", name: "Nelayan Sejati", desc: "Tangkap 100 ikan.", icon: "⛵", kind: "catches", target: 100 },
    { id: "catch-250", name: "Kapten Laut", desc: "Tangkap 250 ikan.", icon: "🧭", kind: "catches", target: 250 },
    { id: "catch-500", name: "Legenda Samudra", desc: "Tangkap 500 ikan.", icon: "🌊", kind: "catches", target: 500 },
    { id: "cast-100", name: "Tangan Terlatih", desc: "Lakukan 100 kali lempar pancing.", icon: "🎯", kind: "casts", target: 100 },
    { id: "species-10", name: "Kolektor Pemula", desc: "Temukan 10 spesies ikan.", icon: "📖", kind: "species", target: 10 },
    { id: "species-30", name: "Penjelajah Air", desc: "Temukan 30 spesies ikan.", icon: "🗺️", kind: "species", target: 30 },
    { id: "species-60", name: "Ahli Biologi Laut", desc: "Temukan 60 spesies ikan.", icon: "🔬", kind: "species", target: 60 },
    { id: "species-all", name: "Ensiklopedia Hidup", desc: "Temukan semua 204 spesies ikan.", icon: "🏛️", kind: "species", target: 204 },
    { id: "rare-1", name: "Sinar Langka", desc: "Tangkap ikan Rare pertamamu.", icon: "💎", kind: "rarity", target: 1, rarity: "rare" },
    { id: "epic-1", name: "Momen Epik", desc: "Tangkap ikan Epic pertamamu.", icon: "🔮", kind: "rarity", target: 1, rarity: "epic" },
    { id: "mythic-1", name: "Mitos Hidup", desc: "Tangkap ikan Mythic pertamamu.", icon: "🌌", kind: "rarity", target: 1, rarity: "mythic" },
    { id: "legend-1", name: "Saksi Legenda", desc: "Tangkap ikan Legend pertamamu.", icon: "👑", kind: "rarity", target: 1, rarity: "legend" },
    { id: "secret-1", name: "Rahasia Samudra", desc: "Tangkap ikan Secret pertamamu.", icon: "🌟", kind: "rarity", target: 1, rarity: "secret" },
    { id: "earn-1000", name: "Modal Kembali", desc: "Dapatkan total 1.000 koin dari penjualan.", icon: "💰", kind: "earned", target: 1000 },
    { id: "earn-10000", name: "Pedagang Ikan", desc: "Dapatkan total 10.000 koin dari penjualan.", icon: "💹", kind: "earned", target: 10000 },
    { id: "earn-100000", name: "Taipan Laut", desc: "Dapatkan total 100.000 koin dari penjualan.", icon: "🏦", kind: "earned", target: 100000 },
    { id: "value-50000", name: "Koleksi Bernilai", desc: "Punya persediaan ikan senilai 50.000 koin.", icon: "📈", kind: "value", target: 50000 },
    { id: "rods-5", name: "Kolektor Joran", desc: "Miliki 5 joran berbeda.", icon: "🎣", kind: "rods", target: 5 },
  ];

  // Bobot Secret hanya ditentukan luck joran + umpan (potion tidak menembusnya).
  // Gear lama (luck maksimal 72) berhenti di 0,1%; gear baru membuka sampai 0,5%.
  function bobotSecret(luckGear) {
    if (luckGear <= 72) return RARITY_BASE_WEIGHT.secret + Math.floor((luckGear / 72) * 5);
    return Math.min(RARITY_CAPS.secret, 10 + Math.floor(((luckGear - 72) / 28) * 40));
  }

  function hitungBobotRarity(luck, secretMult) {
    const mult = Math.max(1, Math.min(3, Math.floor(Number(secretMult) || 1)));
    const hasil = Math.max(0, Number(luck) || 0);
    const gearLuck = Math.min(160, hasil / mult);
    const efektif = Math.min(160, hasil);
    const boost = {
      secret: bobotSecret(gearLuck) - RARITY_BASE_WEIGHT.secret,
      legend: Math.min(RARITY_CAPS.legend - RARITY_BASE_WEIGHT.legend, Math.round(efektif * 1.0)),
      mythic: Math.min(RARITY_CAPS.mythic - RARITY_BASE_WEIGHT.mythic, Math.round(efektif * 2.5)),
      epic: Math.min(RARITY_CAPS.epic - RARITY_BASE_WEIGHT.epic, Math.round(efektif * 5)),
      rare: Math.min(RARITY_CAPS.rare - RARITY_BASE_WEIGHT.rare, Math.round(efektif * 8)),
    };
    const naik = boost.secret + boost.legend + boost.mythic + boost.epic + boost.rare;
    const w = { ...RARITY_BASE_WEIGHT };
    RARITY_ORDER.forEach((r) => { if (boost[r]) w[r] += boost[r]; });
    let sisa = naik;
    const ambilCommon = Math.min(sisa, w.common - 1200);
    w.common -= ambilCommon;
    sisa -= ambilCommon;
    if (sisa > 0) {
      const ambilUncommon = Math.min(sisa, w.uncommon - 800);
      w.uncommon -= ambilUncommon;
      sisa -= ambilUncommon;
    }
    if (sisa > 0) w.common += sisa; // pengaman, seharusnya tidak pernah terjadi
    return w;
  }

  function peluangRarity(luck, secretMult) {
    const w = hitungBobotRarity(luck, secretMult);
    const out = {};
    RARITY_ORDER.forEach((r) => { out[r] = w[r] / 100; });
    return out;
  }

  window.FishingCatalog = {
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
    POTIONS,
    POTION_BY_ID,
    POTION_CATEGORIES,
    POTION_DROP,
    ECONOMY,
    ACHIEVEMENTS,
    hitungBobotRarity,
    peluangRarity,
  };

})();
