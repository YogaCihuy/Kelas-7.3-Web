"use strict";

const admin = require("firebase-admin");
const { HttpError } = require("./util");

let db = null;

function init() {
  if (db) return db;
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new HttpError(500, "Server belum dikonfigurasi: FIREBASE_SERVICE_ACCOUNT kosong.", "server-unconfigured");
    }
    let cred;
    try {
      cred = admin.credential.cert(JSON.parse(raw));
    } catch (err) {
      throw new HttpError(500, "FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid.", "server-unconfigured");
    }
    admin.initializeApp({
      credential: cred,
      projectId: process.env.FIREBASE_PROJECT_ID || "kelas73-web",
    });
  }
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function getDb() {
  return init();
}

function timestamp(ms) {
  return admin.firestore.Timestamp.fromMillis(ms || Date.now());
}

module.exports = {
  admin,
  getDb,
  timestamp,
  serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
};
