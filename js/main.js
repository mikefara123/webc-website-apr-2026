(() => {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Nav blur on scroll ---------- */
  const nav = document.getElementById("wq-nav");
  const progress = document.getElementById("wq-scroll-progress");
  const onScroll = () => {
    if (nav) nav.classList.toggle("wq-nav--scrolled", window.scrollY > 40);
    if (progress) {
      const doc = document.documentElement;
      const max = (doc.scrollHeight - doc.clientHeight) || 1;
      const pct = Math.max(0, Math.min(100, (window.scrollY / max) * 100));
      progress.style.setProperty("--wq-scroll", pct + "%");
      progress.style.width = pct + "%";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Scroll reveals ---------- */
  const revealables = document.querySelectorAll(".wq-reveal");
  if (revealables.length && "IntersectionObserver" in window && !prefersReducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add("is-revealed"));
  }

  /* ---------- Number count-up on enter ---------- */
  const numerics = document.querySelectorAll("[data-count-to]");
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const countUp = (el) => {
    const target = parseFloat(el.dataset.countTo);
    const suffix = el.dataset.suffix || "";
    const isDecimal = String(el.dataset.countTo).includes(".");
    const dur = 1600;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const v = easeOut(t) * target;
      el.textContent = (isDecimal ? v.toFixed(1) : Math.round(v)) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = (isDecimal ? target.toFixed(1) : target) + suffix;
    };
    requestAnimationFrame(step);
  };
  if (numerics.length && "IntersectionObserver" in window && !prefersReducedMotion) {
    numerics.forEach((el) => { el.textContent = (String(el.dataset.countTo).includes(".") ? "0.0" : "0") + (el.dataset.suffix || ""); });
    const io2 = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          countUp(e.target);
          io2.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    numerics.forEach((el) => io2.observe(el));
  }

  /* ---------- Active section indicator in nav ---------- */
  const navLinks = document.querySelectorAll(".wq-nav__links a");
  const sectionMap = new Map();
  navLinks.forEach((a) => {
    const id = a.getAttribute("href")?.replace("#", "");
    const section = id ? document.getElementById(id) : null;
    if (section) sectionMap.set(section, a);
  });
  if (sectionMap.size && "IntersectionObserver" in window) {
    const io3 = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const link = sectionMap.get(e.target);
        if (!link) return;
        if (e.isIntersecting) {
          navLinks.forEach((l) => l.classList.remove("is-active"));
          link.classList.add("is-active");
        }
      });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    sectionMap.forEach((_link, section) => io3.observe(section));
  }

  /* ---------- FAQ accordion ---------- */
  const faq = document.getElementById("wq-faq");
  if (faq) {
    faq.addEventListener("click", (e) => {
      const btn = e.target.closest(".wq-faq__q");
      if (!btn) return;
      const row = btn.closest("[data-faq-row]");
      const willOpen = !row.classList.contains("is-open");
      faq.querySelectorAll("[data-faq-row]").forEach((r) => {
        r.classList.remove("is-open");
        const b = r.querySelector(".wq-faq__q");
        const p = r.querySelector(".wq-faq__plus");
        if (b) b.setAttribute("aria-expanded", "false");
        if (p) p.textContent = "+";
      });
      if (willOpen) {
        row.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        const p = row.querySelector(".wq-faq__plus");
        if (p) p.textContent = "−";
      }
    });
  }

  /* CTA form handling moved to js/estimator.js — new AI-powered estimator flow */

  /* ---------- Cookie / privacy consent banner ---------- */
  const CONSENT_KEY = "wq_consent_v1";
  const consentEl = document.getElementById("wq-consent");
  if (consentEl) {
    let stored = null;
    try { stored = localStorage.getItem(CONSENT_KEY); } catch (_) { /* blocked */ }

    if (!stored) {
      // Delay so banner doesn't flash-on during initial paint
      setTimeout(() => {
        consentEl.hidden = false;
        consentEl.classList.add("is-visible");
      }, 600);
    }

    consentEl.querySelectorAll("button[data-consent]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.consent;
        try {
          localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, ts: Date.now() }));
        } catch (_) { /* ignore */ }
        consentEl.classList.remove("is-visible");
        setTimeout(() => { consentEl.hidden = true; }, 240);

        // If we add analytics later, gate them here:
        //   if (choice === "accept") loadAnalytics();
      });
    });
  }
})();
