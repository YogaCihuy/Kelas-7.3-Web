/* Firestore tiruan untuk uji UI Island Tycoon di browser.
   Semua data hanya ada di memori halaman; tidak menyentuh Firestore asli. */
(function () {
  "use strict";

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
            if (f.op === "==" && data[f.field] !== f.val) lolos = false;
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
        return snapQuery(items);
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
        async get(ref) { return snapDoc(ref.id, docs.get(ref.__segs.join("/"))); },
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

  window.__islandMock = { docs, db, clone };
  window.db = db;
})();
