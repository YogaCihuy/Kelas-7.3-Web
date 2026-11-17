/* chat.js — chat privat 1-on-1 gaya WA (Firestore tanpa server) */
(function () {
  "use strict";

  const CHAT_PESAN_MAKS = 500;
  const CHAT_RIWAYAT_MAKS = 200;
  const CHAT_THREAD_MAKS = 120;

  let chatUser = null;
  let chatThreads = [];
  let chatAktif = null;
  let chatUnsubThreads = null;
  let chatUnsubPesan = null;
  let chatTerpasang = false;
  let chatNoticeTimer = null;

  function el(id) {
    return document.getElementById(id);
  }

  function dbChat() {
    try {
      return typeof db !== "undefined" && db ? db : null;
    } catch (err) {
      return null;
    }
  }

  function esc(teks) {
    return String(teks == null ? "" : teks)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function bunyi(nama) {
    try {
      if (typeof SoundFX !== "undefined" && typeof SoundFX[nama] === "function") SoundFX[nama]();
    } catch (err) {}
  }

  function namaSiswa(absen) {
    const n = Number(absen);
    try {
      if (typeof window.gameProfilNama === "function") {
        const kustom = window.gameProfilNama(n);
        if (kustom) return kustom;
      }
    } catch (err) {}
    try {
      if (typeof getMergedAccount === "function") {
        const akun = getMergedAccount(n);
        if (akun) return akun.namaPanggilan || akun.namaLengkap || `Absen ${n}`;
      }
    } catch (err) {}
    return `Absen ${n}`;
  }

  function inisial(nama) {
    const bagian = String(nama || "?").trim().split(/\s+/).filter(Boolean);
    const hasil = bagian.slice(0, 2).map((b) => b.charAt(0)).join("");
    return (hasil || "?").toUpperCase();
  }

  function hue(absen) {
    return (Number(absen) * 47) % 360;
  }

  function avatarInner(absen, nama) {
    let emoji = "";
    try {
      emoji = typeof window.gameProfilAvatar === "function" ? window.gameProfilAvatar(Number(absen)) : "";
    } catch (err) {
      emoji = "";
    }
    return emoji ? esc(emoji) : esc(inisial(nama));
  }

  function avatarHtml(absen, nama, kelas) {
    return `<span class="chat-avatar ${kelas || ""}" style="--chat-hue:${hue(absen)}" aria-hidden="true">${avatarInner(absen, nama)}</span>`;
  }

  function idThread(a, b) {
    const min = Math.min(Number(a), Number(b));
    const max = Math.max(Number(a), Number(b));
    return `p${min}-${max}`;
  }

  function lawanDari(t) {
    const aku = chatUser ? Number(chatUser.absen) : 0;
    const peserta = Array.isArray(t && t.peserta) ? t.peserta.map(Number) : [];
    return peserta.find((x) => x !== aku) || 0;
  }

  function unreadDari(t) {
    if (!t || !t.unread || !chatUser) return 0;
    const n = Number(t.unread[String(chatUser.absen)]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function jamTeks(at) {
    const d = new Date(Number(at));
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  function waktuTeks(at) {
    const d = new Date(Number(at));
    if (!Number.isFinite(d.getTime())) return "";
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return jamTeks(at);
    const kemarin = new Date(now);
    kemarin.setDate(now.getDate() - 1);
    if (d.toDateString() === kemarin.toDateString()) return `Kemarin ${jamTeks(at)}`;
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  }

  function hariTeks(at) {
    const d = new Date(Number(at));
    if (!Number.isFinite(d.getTime())) return "";
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Hari ini";
    const kemarin = new Date(now);
    kemarin.setDate(now.getDate() - 1);
    if (d.toDateString() === kemarin.toDateString()) return "Kemarin";
    return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  }

  function tampilNotice(pesan, galat) {
    const n = el("chat-notice");
    if (!n) return;
    n.textContent = pesan;
    n.classList.toggle("is-error", !!galat);
    n.hidden = false;
    clearTimeout(chatNoticeTimer);
    chatNoticeTimer = setTimeout(() => {
      n.hidden = true;
    }, 5000);
  }

  function sembunyikanNotice() {
    const n = el("chat-notice");
    if (n) n.hidden = true;
  }

  function renderBadge() {
    const badge = el("chat-tab-badge");
    if (!badge) return;
    const total = chatThreads.reduce((n, t) => n + unreadDari(t), 0);
    if (total > 0) {
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.hidden = false;
    } else {
      badge.textContent = "";
      badge.hidden = true;
    }
  }

  function tampilkanChat() {
    const locked = el("chat-locked");
    const app = el("chat-app");
    if (!locked || !app) return;
    if (chatUser) {
      locked.hidden = true;
      app.hidden = false;
      return;
    }
    locked.hidden = false;
    app.hidden = true;
    locked.innerHTML = `
      <div class="streak-locked-card">
        <span class="streak-locked-icon" aria-hidden="true">💬</span>
        <h3>Login dulu buat chat</h3>
        <p>Chat privat cuma bisa dipakai akun siswa kelas. Setelah login, semua percakapanmu tersimpan dan bisa dibuka lagi kapan aja.</p>
        <button type="button" class="btn-primary" id="chat-btn-login">Login Sekarang</button>
      </div>`;
    const btn = el("chat-btn-login");
    if (btn) {
      btn.addEventListener("click", () => {
        const login = el("btn-show-login");
        if (login) login.click();
      });
    }
  }

  function renderThreads() {
    const wrap = el("chat-threads");
    if (!wrap) return;
    const cari = ((el("chat-search") && el("chat-search").value) || "").trim().toLowerCase();
    const daftar = chatThreads
      .filter((t) => {
        if (!cari) return true;
        return namaSiswa(lawanDari(t)).toLowerCase().includes(cari);
      })
      .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));

    if (!daftar.length) {
      wrap.innerHTML = `<p class="chat-empty">${
        cari ? "Nama itu belum ada di chat kamu." : "Belum ada chat. Pilih teman di bawah buat mulai ngobrol."
      }</p>`;
      return;
    }

    wrap.innerHTML = daftar
      .map((t) => {
        const lawan = lawanDari(t);
        const nama = namaSiswa(lawan);
        const unread = unreadDari(t);
        const aktif = chatAktif && Number(chatAktif.absen) === lawan;
        return `
          <button type="button" class="chat-thread ${aktif ? "is-aktif" : ""}" data-chat-thread="${lawan}">
            ${avatarHtml(lawan, nama)}
            <span class="chat-thread-main">
              <strong>${esc(nama)}</strong>
              <small>${esc(String(t.lastText || "Chat baru").slice(0, 90))}</small>
            </span>
            <span class="chat-thread-side">
              <time>${esc(waktuTeks(t.lastAt))}</time>
              ${unread ? `<span class="chat-unread">${unread > 99 ? "99+" : unread}</span>` : ""}
            </span>
          </button>`;
      })
      .join("");
  }

  function daftarSiswa() {
    try {
      return typeof dataSiswa !== "undefined" && Array.isArray(dataSiswa) ? dataSiswa : [];
    } catch (err) {
      return [];
    }
  }

  function renderOrang() {
    const wrap = el("chat-orang");
    if (!wrap) return;
    if (!chatUser) {
      wrap.innerHTML = "";
      return;
    }
    const cari = ((el("chat-search") && el("chat-search").value) || "").trim().toLowerCase();
    const aku = Number(chatUser.absen);
    const daftar = daftarSiswa()
      .filter((s) => Number(s.absen) !== aku)
      .filter((s) => !cari || namaSiswa(s.absen).toLowerCase().includes(cari))
      .sort((a, b) => Number(a.absen) - Number(b.absen));

    if (!daftar.length) {
      wrap.innerHTML = `<p class="chat-empty">Nama teman gak ketemu.</p>`;
      return;
    }

    wrap.innerHTML = daftar
      .map((s) => {
        const nama = namaSiswa(s.absen);
        const aktif = chatAktif && Number(chatAktif.absen) === Number(s.absen);
        return `
          <button type="button" class="chat-orang-card ${aktif ? "is-aktif" : ""}" data-chat-orang="${s.absen}">
            ${avatarHtml(s.absen, nama, "chat-avatar-sm")}
            <span class="chat-orang-nama">${esc(nama)}</span>
            <span class="chat-orang-absen">${String(s.absen).padStart(2, "0")}</span>
          </button>`;
      })
      .join("");
  }

  function hentikanThreads() {
    if (chatUnsubThreads) {
      try {
        chatUnsubThreads();
      } catch (err) {}
      chatUnsubThreads = null;
    }
  }

  function hentikanPesan() {
    if (chatUnsubPesan) {
      try {
        chatUnsubPesan();
      } catch (err) {}
      chatUnsubPesan = null;
    }
  }

  function mulaiThreads() {
    hentikanThreads();
    const fs = dbChat();
    if (!fs || !chatUser) {
      chatThreads = [];
      renderThreads();
      renderBadge();
      return;
    }
    const absen = Number(chatUser.absen);
    try {
      chatUnsubThreads = fs
        .collection("chatThreads")
        .where("peserta", "array-contains", absen)
        .limit(CHAT_THREAD_MAKS)
        .onSnapshot(
          (snap) => {
            chatThreads = [];
            snap.forEach((doc) => {
              chatThreads.push({ id: doc.id, ...(doc.data() || {}) });
            });
            renderThreads();
            renderBadge();
            if (chatAktif) renderRoomHead();
          },
          (err) => {
            console.warn("Chat pakai mode terbatas:", err.code || err.message);
            chatThreads = [];
            renderThreads();
            renderBadge();
            tampilNotice("Chat belum tersambung. Rules Firestore terbaru belum terpasang.", true);
          }
        );
    } catch (err) {
      console.warn("Chat gagal dimulai:", err);
      chatThreads = [];
      renderThreads();
      renderBadge();
    }
  }

  function renderRoomHead() {
    if (!chatAktif) return;
    const nama = namaSiswa(chatAktif.absen);
    const av = el("chat-room-avatar");
    if (av) {
      av.innerHTML = avatarInner(chatAktif.absen, nama);
      av.style.setProperty("--chat-hue", String(hue(chatAktif.absen)));
    }
    const judul = el("chat-room-nama");
    if (judul) judul.textContent = nama;
    const status = el("chat-room-status");
    if (status) status.textContent = `Percakapan privat · absen ${chatAktif.absen}`;
  }

  function resetUnread() {
    const fs = dbChat();
    if (!fs || !chatUser || !chatAktif) return;
    const id = idThread(chatUser.absen, chatAktif.absen);
    const t = chatThreads.find((x) => x.id === id);
    if (!t || unreadDari(t) <= 0) return;
    const aku = String(Number(chatUser.absen));
    const ref = fs.collection("chatThreads").doc(id);
    fs.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data() || {};
      const unread = { ...(data.unread || {}) };
      if (!Number(unread[aku])) return;
      unread[aku] = 0;
      tx.set(ref, { unread }, { merge: true });
    }).catch(() => {});
  }

  function bukaRuang(absenTeman) {
    if (!chatUser) {
      tampilkanChat();
      return;
    }
    const lawan = Number(absenTeman);
    if (!lawan || lawan === Number(chatUser.absen)) return;

    hentikanPesan();
    chatAktif = { absen: lawan };
    const list = el("chat-list-view");
    const room = el("chat-room-view");
    if (list) list.hidden = true;
    if (room) room.hidden = false;
    renderRoomHead();
    renderThreads();
    renderOrang();
    sembunyikanNotice();
    langgananPesan();
    resetUnread();

    const input = el("chat-input");
    if (input) {
      input.value = "";
      autoTinggi(input);
      try {
        input.focus({ preventScroll: true });
      } catch (err) {
        input.focus();
      }
    }
    bunyi("buttonClick");
  }

  function tutupRuang() {
    hentikanPesan();
    chatAktif = null;
    const list = el("chat-list-view");
    const room = el("chat-room-view");
    if (list) list.hidden = false;
    if (room) room.hidden = true;
    renderThreads();
    renderOrang();
    bunyi("buttonClick");
  }

  function langgananPesan() {
    hentikanPesan();
    const fs = dbChat();
    if (!fs || !chatUser || !chatAktif) return;
    const id = idThread(chatUser.absen, chatAktif.absen);
    try {
      chatUnsubPesan = fs
        .collection("chatMessages")
        .where("threadId", "==", id)
        .limit(CHAT_RIWAYAT_MAKS)
        .onSnapshot(
          (snap) => {
            const list = [];
            snap.forEach((doc) => list.push(doc.data() || {}));
            list.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
            renderPesan(list);
            if (chatAktif) resetUnread();
          },
          (err) => {
            console.warn("Pesan chat gagal dimuat:", err.code || err.message);
            const wrap = el("chat-pesan");
            if (wrap) wrap.innerHTML = `<p class="chat-room-empty">Gagal memuat pesan. Cek koneksi, lalu buka lagi.</p>`;
          }
        );
    } catch (err) {
      console.warn("Chat pesan gagal dimulai:", err);
    }
  }

  function renderPesan(list) {
    const wrap = el("chat-pesan");
    if (!wrap) return;
    const dekatBawah = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 110;
    const aku = Number(chatUser.absen);
    let html = "";
    let hariTerakhir = "";

    list.forEach((m) => {
      const waktu = Number(m.at) || 0;
      const hari = new Date(waktu).toDateString();
      if (hari !== hariTerakhir) {
        hariTerakhir = hari;
        html += `<div class="chat-day"><span>${esc(hariTeks(waktu))}</span></div>`;
      }
      const kirimSendiri = Number(m.from) === aku;
      html += `
        <div class="chat-bubble-row ${kirimSendiri ? "is-me" : "is-them"}">
          <div class="chat-bubble">
            <p>${esc(m.teks || "").replace(/\n/g, "<br>")}</p>
            <time>${esc(jamTeks(waktu))}</time>
          </div>
        </div>`;
    });

    if (!list.length) html = `<p class="chat-room-empty">Belum ada pesan. Sapa dulu yuk 👋</p>`;
    wrap.innerHTML = html;
    if (dekatBawah) {
      requestAnimationFrame(() => {
        wrap.scrollTop = wrap.scrollHeight;
      });
    }
  }

  async function kirimPesan(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!chatUser || !chatAktif) return;
    const input = el("chat-input");
    const teks = String((input && input.value) || "").trim().slice(0, CHAT_PESAN_MAKS);
    if (!teks) {
      tampilNotice("Tulis pesan dulu ya.", true);
      return;
    }
    const fs = dbChat();
    if (!fs) {
      tampilNotice("Chat butuh koneksi internet.", true);
      return;
    }

    const aku = Number(chatUser.absen);
    const lawan = Number(chatAktif.absen);
    const id = idThread(aku, lawan);
    const threadRef = fs.collection("chatThreads").doc(id);
    const now = Date.now();

    try {
      await fs.runTransaction(async (tx) => {
        const snap = await tx.get(threadRef);
        const lama = snap.exists ? snap.data() || {} : {};
        const unread = { ...(lama.unread || {}) };
        unread[String(aku)] = 0;
        unread[String(lawan)] = (Number(unread[String(lawan)]) || 0) + 1;
        tx.set(
          threadRef,
          {
            id,
            peserta: [Math.min(aku, lawan), Math.max(aku, lawan)],
            lastText: teks.slice(0, 90),
            lastAt: now,
            lastFrom: aku,
            unread,
            updatedAt: now,
          },
          { merge: true }
        );
        tx.set(fs.collection("chatMessages").doc(), {
          threadId: id,
          from: aku,
          to: lawan,
          nama: String(namaSiswa(aku)).slice(0, 60),
          teks,
          at: now,
        });
      });
      if (input) {
        input.value = "";
        autoTinggi(input);
      }
      sembunyikanNotice();
    } catch (err) {
      console.error("Gagal kirim chat:", err);
      tampilNotice("Pesan gagal terkirim. Cek koneksi atau rules Firestore terbaru.", true);
      bunyi("errorSound");
    }
  }

  function autoTinggi(area) {
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight || 44, 120)}px`;
  }

  function chatBuka() {
    if (!chatUser) {
      tampilkanChat();
      renderBadge();
      return;
    }
    tampilkanChat();
    if (!chatUnsubThreads) mulaiThreads();
    renderThreads();
    renderOrang();
    renderBadge();
  }

  function chatAkunBerubah(user) {
    const absenBaru = user && user.absen ? Number(user.absen) : null;
    const absenLama = chatUser ? Number(chatUser.absen) : null;
    chatUser = absenBaru ? { ...user, absen: absenBaru } : null;

    if (!chatUser) {
      hentikanThreads();
      hentikanPesan();
      chatThreads = [];
      chatAktif = null;
      const list = el("chat-list-view");
      const room = el("chat-room-view");
      if (list) list.hidden = false;
      if (room) room.hidden = true;
      tampilkanChat();
      renderThreads();
      renderOrang();
      renderBadge();
      return;
    }

    if (absenLama !== absenBaru) {
      hentikanPesan();
      chatAktif = null;
      const list = el("chat-list-view");
      const room = el("chat-room-view");
      if (list) list.hidden = false;
      if (room) room.hidden = true;
    }

    tampilkanChat();
    renderOrang();
    if (absenLama !== absenBaru || !chatUnsubThreads) mulaiThreads();
    else renderThreads();
    renderBadge();
  }

  function pasangEvent() {
    if (chatTerpasang) return;
    chatTerpasang = true;

    const search = el("chat-search");
    if (search) {
      search.addEventListener("input", () => {
        renderThreads();
        renderOrang();
      });
    }

    const app = el("chat-app");
    if (app) {
      app.addEventListener("click", (e) => {
        const target = e.target;
        const thread = target.closest("[data-chat-thread]");
        if (thread) {
          bukaRuang(thread.getAttribute("data-chat-thread"));
          return;
        }
        const orang = target.closest("[data-chat-orang]");
        if (orang) {
          bukaRuang(orang.getAttribute("data-chat-orang"));
          return;
        }
        if (target.closest("#btn-chat-back")) tutupRuang();
      });
    }

    const form = el("form-chat");
    if (form) form.addEventListener("submit", kirimPesan);

    const input = el("chat-input");
    if (input) {
      input.addEventListener("input", () => autoTinggi(input));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          kirimPesan();
        }
      });
    }

    const tab = document.querySelector('[data-page-tab="chat"]');
    if (tab) tab.addEventListener("click", chatBuka);
  }

  function initChat() {
    pasangEvent();
    if (typeof currentUser !== "undefined" && currentUser) chatAkunBerubah(currentUser);
    else chatAkunBerubah(null);
  }

  window.chatAkunBerubah = chatAkunBerubah;
  window.chatBuka = chatBuka;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initChat);
  else initChat();
})();
