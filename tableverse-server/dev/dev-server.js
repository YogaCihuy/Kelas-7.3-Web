"use strict";

// Server lokal untuk menguji TableVerse di browser tanpa Firebase/Vercel.
// Jalankan: node dev/dev-server.js   (default http://127.0.0.1:8100)
// Lalu set window.TABLEVERSE_API = "http://127.0.0.1:8100/api/tableverse"
// di Console browser (atau isi tableverse-config.js sementara).

process.env.TV_SESSION_SECRET = process.env.TV_SESSION_SECRET || "tableverse-dev-secret-please-change";

const http = require("http");
const { boot } = require("./mock-firestore");

const db = boot();
const handler = require("../api/tableverse");

const PORT = Number(process.env.PORT) || 8100;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    req.body = raw;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (payload) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
      return res;
    };
    handler(req, res).catch((err) => {
      console.error("[dev-server]", err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: { message: "dev server error", code: "internal" } }));
      }
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TableVerse dev API di http://127.0.0.1:${PORT}/api/tableverse`);
});

function reset() {
  db.data.clear();
  console.log("Data mock direset.");
}

module.exports = { server, reset };
