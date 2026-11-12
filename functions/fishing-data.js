// Katalog resmi Fishing Game. File ini HANYA dipakai server (Cloud Functions).
// Client menerima salinan lewat action "catalog" dan tidak boleh menentukan isi/harga.

const CATALOG_VERSION = 1;

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "mythic", "legend", "secret"];

const RARITY_INFO = {
  common: { label: "Common", labelId: "Umum", color: "#7f9c8c", soft: "#e8f1ec", chance: 55.29, order: 0 },
  uncommon: { label: "Uncommon", labelId: "Langka Muda", color: "#3f9e68", soft: "#e2f6e9", chance: 25, order: 1 },
  rare: { label: "Rare", labelId: "Langka", color: "#3d7fd6", soft: "#e3efff", chance: 12, order: 2 },
  epic: { label: "Epic", labelId: "Epik", color: "#8a5bd6", soft: "#efe6ff", chance: 5.5, order: 3 },
  mythic: { label: "Mythic", labelId: "Mitos", color: "#d94f9e", soft: "#ffe3f3", chance: 1.7, order: 4 },
  legend: { label: "Legend", labelId: "Legenda", color: "#d99a2b", soft: "#fff2cf", chance: 0.5, order: 5 },
  secret: { label: "Secret", labelId: "Rahasia", color: "#e0445c", soft: "#ffe1e6", chance: 0.01, order: 6 },
};

// Bobot dasar per 10.000 cast. Totalnya tepat 10.000 (100%).
const RARITY_BASE_WEIGHT = {
  common: 5529,
  uncommon: 2500,
  rare: 1200,
  epic: 550,
  mythic: 170,
  legend: 50,
  secret: 1,
};

// Batas maksimum bobot setelah luck (secret 0.03%, legend 2%).
const RARITY_CAPS = {
  common: 9999,
  uncommon: 3500,
  rare: 2600,
  epic: 1500,
  mythic: 600,
  legend: 200,
  secret: 3,
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
].map(([id, name, tier, price, luck, desc]) => ({ id, name, tier, price, luck, desc }));

const BAIT_BY_ID = Object.fromEntries(BAITS.map((b) => [b.id, b]));

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
  { id: "species-all", name: "Ensiklopedia Hidup", desc: "Temukan semua 102 spesies ikan.", icon: "🏛️", kind: "species", target: 102 },
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

function hitungBobotRarity(luck) {
  const l = Math.max(0, Math.min(100, Number(luck) || 0));
  const boost = {
    secret: Math.min(RARITY_CAPS.secret - RARITY_BASE_WEIGHT.secret, Math.floor(l * 0.16)),
    legend: Math.min(RARITY_CAPS.legend - RARITY_BASE_WEIGHT.legend, Math.round(l * 1.0)),
    mythic: Math.min(RARITY_CAPS.mythic - RARITY_BASE_WEIGHT.mythic, Math.round(l * 2.5)),
    epic: Math.min(RARITY_CAPS.epic - RARITY_BASE_WEIGHT.epic, Math.round(l * 5)),
    rare: Math.min(RARITY_CAPS.rare - RARITY_BASE_WEIGHT.rare, Math.round(l * 8)),
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

function peluangRarity(luck) {
  const w = hitungBobotRarity(luck);
  const out = {};
  RARITY_ORDER.forEach((r) => { out[r] = w[r] / 100; });
  return out;
}

module.exports = {
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
};
