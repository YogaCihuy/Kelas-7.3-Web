/* fake-firestore.js
   Firestore tiruan untuk tes TableVerse tanpa koneksi/aturan produksi.
   Cukup untuk API yang dipakai tableverse-local.js + listener UI TableVerse:
   doc get/set/delete, query where/limit/get/onSnapshot, runTransaction, batch. */
(function () {
  "use strict";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function pastikanBersih(value, jalur) {
    const where = jalur || "data";
    if (value === undefined) throw new Error(`Firestore menolak undefined di ${where}`);
    if (typeof value === "function") throw new Error(`Firestore menolak function di ${where}`);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Firestore menolak angka tidak valid di ${where}`);
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          if (Array.isArray(v)) {
            throw new Error(
              `Nested arrays are not supported (Firestore menolak array di dalam array) di ${where}[${i}]`
            );
          }
          pastikanBersih(v, `${where}[${i}]`);
        });
      } else {
        Object.keys(value).forEach((k) => pastikanBersih(value[k], `${where}.${k}`));
      }
    }
  }

  function createFakeFirestore() {
    const store = new Map();
    const listeners = new Set();
    let seq = 0;

    const kunci = (col, id) => `${col}/${id}`;
    const idBaru = () => `auto_${Date.now().toString(36)}_${(seq += 1)}`;

    function cocok(data, filters) {
      return filters.every((f) => {
        if (f.op === "==") return data[f.field] === f.value;
        if (f.op === "array-contains") {
          return Array.isArray(data[f.field]) && data[f.field].indexOf(f.value) >= 0;
        }
        throw new Error(`operator ${f.op} tidak didukung fake firestore`);
      });
    }

    function docRef(col, id, work) {
      const target = work || store;
      return {
        id,
        col,
        get() {
          return Promise.resolve(snapDoc(col, id, target));
        },
        set(data, opsi) {
          pastikanBersih(data, `${col}/${id}`);
          const key = kunci(col, id);
          const lama = target.get(key);
          const baru = opsi && opsi.merge && lama
            ? Object.assign({}, clone(lama), clone(data))
            : clone(data);
          target.set(key, baru);
          if (!work) beriTahu(col, id);
          return Promise.resolve();
        },
        delete() {
          target.delete(kunci(col, id));
          if (!work) beriTahu(col, id);
          return Promise.resolve();
        },
        onSnapshot(cb, errCb) {
          const l = { kind: "doc", col, id, cb, errCb };
          listeners.add(l);
          jadwalkan(() => emitDoc(l));
          return () => listeners.delete(l);
        },
      };
    }

    function snapDoc(col, id, work) {
      const data = (work || store).get(kunci(col, id));
      return {
        id,
        exists: data !== undefined,
        data: () => clone(data),
        ref: docRef(col, id, work),
      };
    }

    function snapQuery(col, filters, batas, urut) {
      const docs = [];
      for (const entry of (store).entries()) {
        const k = entry[0];
        const slash = k.indexOf("/");
        if (k.slice(0, slash) !== col) continue;
        if (!cocok(entry[1], filters)) continue;
        docs.push(snapDoc(col, k.slice(slash + 1)));
      }
      if (urut) {
        const arah = urut.arah === "desc" ? -1 : 1;
        docs.sort((a, b) => {
          const av = a.data()[urut.field];
          const bv = b.data()[urut.field];
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * arah;
          return String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv)) * arah;
        });
      }
      const hasil = batas ? docs.slice(0, batas) : docs;
      return {
        docs: hasil,
        size: hasil.length,
        empty: hasil.length === 0,
        forEach(fn) { hasil.forEach((d) => fn(d)); },
      };
    }

    function jadwalkan(fn) {
      if (typeof setTimeout === "function") setTimeout(fn, 0);
      else Promise.resolve().then(fn);
    }

    function emitDoc(l) {
      const data = store.get(kunci(l.col, l.id));
      jadwalkan(() => {
        try {
          l.cb({
            id: l.id,
            exists: data !== undefined,
            data: () => clone(data),
            ref: docRef(l.col, l.id),
          });
        } catch (err) {
          if (l.errCb) l.errCb(err);
        }
      });
    }

    function emitQuery(l) {
      const snap = snapQuery(l.col, l.filters, l.batas, l.urut);
      jadwalkan(() => {
        try { l.cb(snap); } catch (err) { if (l.errCb) l.errCb(err); }
      });
    }

    function beriTahu(col, id) {
      Array.from(listeners).forEach((l) => {
        if (l.kind === "doc") {
          if (l.col === col && l.id === id) emitDoc(l);
        } else if (l.col === col) {
          emitQuery(l);
        }
      });
    }

    function buatQuery(col, filters, batas, urut) {
      return {
        where(field, op, value) {
          return buatQuery(col, filters.concat({ field, op, value }), batas, urut);
        },
        limit(n) {
          return buatQuery(col, filters, n, urut);
        },
        orderBy(field, arah) {
          return buatQuery(col, filters, batas, { field, arah: arah || "asc" });
        },
        get() {
          return Promise.resolve(snapQuery(col, filters, batas, urut));
        },
        onSnapshot(cb, errCb) {
          const l = { kind: "query", col, filters, batas, urut, cb, errCb };
          listeners.add(l);
          jadwalkan(() => emitQuery(l));
          return () => listeners.delete(l);
        },
      };
    }

    function buatKoleksi(col) {
      return {
        doc(id) {
          return docRef(col, id || idBaru());
        },
        where(field, op, value) {
          return buatQuery(col, [{ field, op, value }], null, null);
        },
        orderBy(field, arah) {
          return buatQuery(col, [], null, { field, arah: arah || "asc" });
        },
        limit(n) {
          return buatQuery(col, [], n, null);
        },
        get() {
          return Promise.resolve(snapQuery(col, [], null, null));
        },
        onSnapshot(cb, errCb) {
          return buatQuery(col, [], null, null).onSnapshot(cb, errCb);
        },
      };
    }

    function terapkanSet(target, ref, data, opsi) {
      pastikanBersih(data, `${ref.col}/${ref.id}`);
      const key = kunci(ref.col, ref.id);
      const lama = target.get(key);
      target.set(
        key,
        opsi && opsi.merge && lama ? Object.assign({}, clone(lama), clone(data)) : clone(data)
      );
    }

    function commitDari(work, keys) {
      const berubah = new Set();
      if (keys) {
        keys.forEach((k) => berubah.add(k));
        berubah.forEach((k) => {
          if (work.has(k)) store.set(k, clone(work.get(k)));
          else store.delete(k);
        });
      } else {
        const semua = new Set(Array.from(store.keys()).concat(Array.from(work.keys())));
        semua.forEach((k) => {
          if (JSON.stringify(store.get(k)) !== JSON.stringify(work.get(k))) berubah.add(k);
        });
        store.clear();
        work.forEach((v, k) => store.set(k, clone(v)));
      }
      berubah.forEach((k) => {
        const slash = k.indexOf("/");
        beriTahu(k.slice(0, slash), k.slice(slash + 1));
      });
    }

    const db = {
      collection: buatKoleksi,
      doc(jalur) {
        const teks = String(jalur || "");
        const slash = teks.indexOf("/");
        if (slash <= 0) throw new Error(`Jalur dokumen tidak valid: ${teks}`);
        return docRef(teks.slice(0, slash), teks.slice(slash + 1));
      },
      runTransaction(fn) {
        const work = new Map();
        store.forEach((v, k) => work.set(k, clone(v)));
        const tx = {
          get(ref) { return Promise.resolve(snapDoc(ref.col, ref.id, work)); },
          set(ref, data, opsi) { terapkanSet(work, ref, data, opsi); },
          delete(ref) { work.delete(kunci(ref.col, ref.id)); },
        };
        return Promise.resolve()
          .then(() => fn(tx))
          .then((hasil) => {
            commitDari(work);
            return hasil;
          });
      },
      batch() {
        const work = new Map();
        store.forEach((v, k) => work.set(k, clone(v)));
        const keys = [];
        return {
          set(ref, data, opsi) {
            terapkanSet(work, ref, data, opsi);
            keys.push(kunci(ref.col, ref.id));
          },
          delete(ref) {
            work.delete(kunci(ref.col, ref.id));
            keys.push(kunci(ref.col, ref.id));
          },
          commit() {
            commitDari(work, keys);
            return Promise.resolve();
          },
        };
      },
      __store: store,
      __set(col, id, data) {
        pastikanBersih(data, `${col}/${id}`);
        store.set(kunci(col, id), clone(data));
        beriTahu(col, id);
      },
      __get(col, id) {
        return clone(store.get(kunci(col, id)));
      },
      __all(col) {
        const out = [];
        store.forEach((v, k) => {
          const slash = k.indexOf("/");
          if (k.slice(0, slash) === col) out.push({ id: k.slice(slash + 1), data: clone(v) });
        });
        return out;
      },
      __collections() {
        const out = new Set();
        store.forEach((v, k) => out.add(k.slice(0, k.indexOf("/"))));
        return Array.from(out);
      },
    };

    return db;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createFakeFirestore };
  } else {
    window.createFakeFirestore = createFakeFirestore;
  }
})();
