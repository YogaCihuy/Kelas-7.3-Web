/* ===================================================
   ANIMASI HALAMAN — 7 lapis:
   loading, entrance, hover/3D, microinteraction,
   background, mouse, plus guard reduced-motion.
=================================================== */
(() => {
  "use strict";

  const kurangiGerak = window.matchMedia("(prefers-reduced-motion: reduce)");
  const kursorPresisi = window.matchMedia("(hover: hover) and (pointer: fine)");
  const CARD_SEL = ".siswa-card, .game-card, .polling-card, .info-card, .medsos-card";
  const TILT_SEL = ".siswa-card, .info-card, .medsos-card, .picker-card, .polling-card";

  /* ---------- 1. Loading awal (sekali per sesi) ---------- */
  function tampilkanLoader() {
    if (kurangiGerak.matches) return false;
    if (document.documentElement.classList.contains("apk-loading")) return false;
    try {
      if (sessionStorage.getItem("animLoaderSeen") === "1") return false;
    } catch (e) { return false; }

    const box = document.createElement("div");
    box.className = "anim-loader";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML =
      '<div class="anim-loader-inner">' +
      '<span class="anim-loader-mark"></span>' +
      '<div class="anim-loader-bar"><i></i></div>' +
      '<p class="anim-loader-text">Kelas 7.3</p>' +
      "</div>";
    document.body.appendChild(box);

    const mulai = performance.now();
    let sudahTutup = false;
    const tutup = () => {
      if (sudahTutup) return;
      sudahTutup = true;
      const sisa = Math.max(0, 620 - (performance.now() - mulai));
      setTimeout(() => {
        box.classList.add("is-off");
        try { sessionStorage.setItem("animLoaderSeen", "1"); } catch (e) { /* ignore */ }
        setTimeout(() => box.remove(), 600);
      }, sisa);
    };

    if (document.readyState === "complete") tutup();
    else window.addEventListener("load", tutup, { once: true });
    setTimeout(tutup, 4000);
    return true;
  }

  /* ---------- 2. Entrance + stagger ---------- */
  let io = null;

  function siapkanObserver() {
    if (io) return io;
    io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        el.classList.add("anim-in");
        const i = Math.min(9, Number(el.style.getPropertyValue("--anim-i")) || 0);
        setTimeout(() => {
          el.classList.remove("anim-reveal", "anim-in");
          el.style.removeProperty("--anim-i");
        }, 560 + i * 45);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });
    return io;
  }

  function animasiKartu(grid) {
    if (!grid || grid.dataset.animDone) return;
    const anak = [...grid.children].filter((el) => el.nodeType === 1);
    if (!anak.length) return;
    grid.dataset.animDone = "1";
    anak.slice(0, 14).forEach((el, i) => {
      if (el.classList.contains("anim-reveal")) return;
      el.style.setProperty("--anim-i", String(Math.min(i, 9)));
      el.classList.add("anim-reveal");
      siapkanObserver().observe(el);
    });
  }

  function animasiBagian() {
    document.querySelectorAll(".page-panel > section").forEach((section) => {
      if (section.querySelector(CARD_SEL)) return;
      if (section.classList.contains("anim-reveal")) return;
      section.classList.add("anim-reveal");
      siapkanObserver().observe(section);
    });
  }

  function pasangPengamatGrid() {
    const akar = document.querySelector("main");
    if (!akar) return;
    const antre = new Set();
    let raf = 0;
    const proses = new MutationObserver((records) => {
      records.forEach((rec) => {
        rec.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const induk = node.parentElement;
          if (!induk || !node.matches(CARD_SEL)) return;
          if (induk.dataset.animDone) return;
          antre.add(induk);
        });
      });
      if (!antre.size || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        antre.forEach((grid) => animasiKartu(grid));
        antre.clear();
      });
    });
    proses.observe(akar, { childList: true, subtree: true });
  }

  /* ---------- 3. Hover + 3D tilt kartu ---------- */
  function pasangTilt() {
    if (kurangiGerak.matches || !kursorPresisi.matches) return;
    let aktif = null;

    const reset = () => {
      if (!aktif) return;
      aktif.classList.remove("is-tilting");
      aktif.style.removeProperty("--tilt-x");
      aktif.style.removeProperty("--tilt-y");
      aktif = null;
    };

    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const kartu = e.target.closest && e.target.closest(TILT_SEL);
      if (kartu !== aktif) {
        reset();
        if (kartu && !kartu.closest("canvas")) {
          kartu.classList.add("anim-tilt");
          aktif = kartu;
        }
      }
      if (!aktif) return;
      const r = aktif.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      aktif.style.setProperty("--tilt-x", (-py * 7).toFixed(2) + "deg");
      aktif.style.setProperty("--tilt-y", (px * 8).toFixed(2) + "deg");
      aktif.classList.add("is-tilting");
    }, { passive: true });

    document.addEventListener("pointerleave", reset, { passive: true });
    window.addEventListener("blur", reset);
    window.addEventListener("scroll", reset, { passive: true });
  }

  /* ---------- 4. Microinteraction: ripple tombol ---------- */
  function pasangRipple() {
    document.addEventListener("pointerdown", (e) => {
      if (kurangiGerak.matches || e.button !== 0) return;
      const btn = e.target.closest && e.target.closest(
        ".btn-primary, .btn-secondary, .page-tab-btn, .game-play, .tab-btn, .account-menu-item"
      );
      if (!btn || btn.disabled) return;
      btn.classList.add("anim-ripple-host");
      const r = btn.getBoundingClientRect();
      const ukuran = Math.max(r.width, r.height) * 1.15;
      const ripple = document.createElement("span");
      ripple.className = "anim-ripple";
      ripple.style.width = ukuran + "px";
      ripple.style.height = ukuran + "px";
      ripple.style.left = (e.clientX - r.left - ukuran / 2) + "px";
      ripple.style.top = (e.clientY - r.top - ukuran / 2) + "px";
      btn.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    }, { passive: true });
  }

  /* ---------- 5. Background hero + parallax kursor ---------- */
  function pasangLatarHero() {
    const hero = document.querySelector(".hero");
    if (!hero) return;

    if (!kurangiGerak.matches) {
      const aurora = document.createElement("div");
      aurora.className = "anim-aurora";
      aurora.setAttribute("aria-hidden", "true");
      aurora.innerHTML = "<i></i><i></i><i></i>";
      hero.prepend(aurora);

      let rafScroll = 0;
      const paralaksScroll = () => {
        if (rafScroll) return;
        rafScroll = requestAnimationFrame(() => {
          rafScroll = 0;
          const r = hero.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) return;
          const jarak = Math.min(Math.max(-r.top, 0), hero.offsetHeight);
          hero.style.setProperty("--paralaks", jarak.toFixed(1) + "px");
        });
      };
      window.addEventListener("scroll", paralaksScroll, { passive: true });
      paralaksScroll();
    }

    if (kurangiGerak.matches || !kursorPresisi.matches) return;
    let raf = 0;
    const geser = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = hero.getBoundingClientRect();
        if (!r.height) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        hero.style.setProperty("--hero-px", (px * 14).toFixed(1) + "px");
        hero.style.setProperty("--hero-py", (py * 10).toFixed(1) + "px");
      });
    };
    hero.addEventListener("pointermove", geser, { passive: true });
    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--hero-px", "0px");
      hero.style.setProperty("--hero-py", "0px");
    }, { passive: true });
  }

  /* ---------- 6. Mouse: kursor bulat ---------- */
  function pasangKursor() {
    if (kurangiGerak.matches || !kursorPresisi.matches) return;

    const ring = document.createElement("div");
    const dot = document.createElement("div");
    ring.className = "anim-cursor";
    dot.className = "anim-cursor-dot";
    ring.setAttribute("aria-hidden", "true");
    dot.setAttribute("aria-hidden", "true");
    document.body.append(ring, dot);

    let mx = -100;
    let my = -100;
    let rx = -100;
    let ry = -100;
    let raf = 0;
    let tampil = false;

    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      if (Math.abs(mx - rx) > 0.3 || Math.abs(my - ry) > 0.3) raf = requestAnimationFrame(loop);
      else raf = 0;
    };

    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
      if (!tampil) {
        tampil = true;
        document.body.classList.add("anim-cursor-on");
      }
      const sasar = e.target.closest && e.target.closest(
        "a, button, input, textarea, select, label, [role='button'], .siswa-card, .game-card, .medsos-card"
      );
      ring.classList.toggle("is-hover", !!sasar);
      document.body.classList.toggle("anim-cursor-hide", !!(e.target.closest && e.target.closest("canvas")));
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    document.addEventListener("pointerleave", () => {
      tampil = false;
      document.body.classList.remove("anim-cursor-on", "anim-cursor-hide");
    }, { passive: true });
  }

  /* ---------- Start ---------- */
  function mulai() {
    if (kurangiGerak.matches) return;
    animasiBagian();
    document.querySelectorAll(".grid-siswa, .info-grid, .medsos-grid, .games-list").forEach(animasiKartu);
    pasangPengamatGrid();
    pasangTilt();
    pasangRipple();
    pasangLatarHero();
    pasangKursor();
  }

  const loaderTampil = tampilkanLoader();
  if (loaderTampil) {
    setTimeout(mulai, 780);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mulai, { once: true });
  } else {
    mulai();
  }
})();
