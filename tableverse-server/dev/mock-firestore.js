"use strict";

// Firestore tiruan untuk uji lokal (tanpa Firebase, tanpa biaya).
// Hanya mengimplementasikan bagian yang dipakai backend TableVerse.

function clone(value) {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }
  return value;
}

function mergeTop(base, patch) {
  const out = { ...(base || {}) };
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) continue;
    out[key] = clone(patch[key]);
  }
  return out;
}

function autoId() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
}

class Snapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this._data = data;
  }
  data() {
    return clone(this._data);
  }
}

class DocRef {
  constructor(store, collection, id) {
    this.store = store;
    this.collectionName = collection;
    this.id = id;
  }
  _map() {
    let map = this.store.data.get(this.collectionName);
    if (!map) {
      map = new Map();
      this.store.data.set(this.collectionName, map);
    }
    return map;
  }
  async get() {
    await this.store.tick();
    return new Snapshot(this, this._map().get(this.id));
  }
  async set(data, opts) {
    const payload = clone(data) || {};
    const merge = !!(opts && opts.merge);
    const current = this._map().get(this.id);
    this._map().set(this.id, merge ? mergeTop(current, payload) : payload);
    await this.store.tick();
    return this;
  }
  async update(data) {
    const current = this._map().get(this.id) || {};
    this._map().set(this.id, mergeTop(current, clone(data) || {}));
    await this.store.tick();
    return this;
  }
  async delete() {
    this._map().delete(this.id);
    await this.store.tick();
    return this;
  }
}

class Query {
  constructor(store, collection, filters, max) {
    this.store = store;
    this.collectionName = collection;
    this.filters = filters || [];
    this.max = max || 0;
  }
  where(field, op, value) {
    return new Query(this.store, this.collectionName, this.filters.concat([{ field, op, value }]), this.max);
  }
  limit(n) {
    return new Query(this.store, this.collectionName, this.filters, n);
  }
  orderBy() {
    return this;
  }
  _cocok(data) {
    return this.filters.every(({ field, op, value }) => {
      const actual = data[field];
      if (op === "==") return actual === value;
      if (op === "array-contains") return Array.isArray(actual) && actual.includes(value);
      if (op === "in") return Array.isArray(value) && value.includes(actual);
      return false;
    });
  }
  async get() {
    await this.store.tick();
    const map = this.store.data.get(this.collectionName) || new Map();
    const docs = [];
    for (const [id, data] of map) {
      if (this._cocok(data)) docs.push(new Snapshot(new DocRef(this.store, this.collectionName, id), data));
    }
    const sliced = this.max > 0 ? docs.slice(0, this.max) : docs;
    return {
      docs: sliced,
      size: sliced.length,
      empty: sliced.length === 0,
      forEach: (fn) => sliced.forEach(fn),
    };
  }
}

class CollectionRef extends Query {
  constructor(store, name) {
    super(store, name, [], 0);
  }
  doc(id) {
    return new DocRef(this.store, this.collectionName, id || autoId());
  }
  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class WriteBatch {
  constructor(store) {
    this.store = store;
    this.ops = [];
  }
  set(ref, data, opts) { this.ops.push(() => ref.set(data, opts)); return this; }
  update(ref, data) { this.ops.push(() => ref.update(data)); return this; }
  delete(ref) { this.ops.push(() => ref.delete()); return this; }
  async commit() {
    for (const op of this.ops) await op();
    this.ops = [];
  }
}

class Transaction {
  constructor(store) {
    this.store = store;
    this.ops = [];
  }
  async get(ref) {
    return ref.get();
  }
  async getAll(...refs) {
    return Promise.all(refs.map((ref) => ref.get()));
  }
  set(ref, data, opts) { this.ops.push(() => ref.set(data, opts)); return this; }
  update(ref, data) { this.ops.push(() => ref.update(data)); return this; }
  delete(ref) { this.ops.push(() => ref.delete()); return this; }
  async commit() {
    for (const op of this.ops) await op();
    this.ops = [];
  }
}

class MockFirestore {
  constructor() {
    this.data = new Map();
    this.latency = 0;
  }
  async tick() {
    if (this.latency > 0) return new Promise((resolve) => setTimeout(resolve, this.latency));
    return new Promise((resolve) => setImmediate(resolve));
  }
  settings() {}
  collection(name) {
    return new CollectionRef(this, name);
  }
  batch() {
    return new WriteBatch(this);
  }
  async runTransaction(fn) {
    const tx = new Transaction(this);
    const result = await fn(tx);
    await tx.commit();
    return result;
  }
}

function boot() {
  const dbPath = require.resolve("../lib/firebase");
  const mock = new MockFirestore();
  const fakeModule = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      getDb: () => mock,
      timestamp: (ms) => new Date(ms || Date.now()),
      serverTimestamp: () => Date.now(),
    },
  };
  require.cache[dbPath] = fakeModule;
  return mock;
}

module.exports = { boot, MockFirestore, Snapshot };
