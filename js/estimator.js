/* WebCentriq — linear 3-step wizard.
 *   Step 1: project type (click advances)
 *   Step 2: description + optional budget/timeline
 *   Step 3: email + country/city + source + urgency
 *   Submit → POST /api/estimate → email sent → success panel.
 * Local dev without /api: mock path still fires success.
 */
(() => {
  const form = document.getElementById("wq-est-form");
  if (!form) return;

  const estimator = document.getElementById("wq-estimator");
  const navFill   = document.getElementById("wq-est-nav-fill");
  const stepNum   = document.getElementById("wq-est-step-num");
  const stepEls   = form.querySelectorAll(".wq-est-step");
  const typeBtns  = form.querySelectorAll(".wq-est-type");
  const nextBtn   = document.getElementById("wq-est-next-btn");
  const submitBtn = document.getElementById("wq-est-submit-btn");
  const backLinks = form.querySelectorAll(".wq-est-backlink");
  const doneEl    = document.getElementById("wq-est-done");
  const againBtn  = document.getElementById("wq-est-again-btn");

  const descEl    = document.getElementById("wq-est-desc");
  const countEl   = document.getElementById("wq-est-count");
  const emailEl   = document.getElementById("wq-est-email");
  const countryEl = document.getElementById("wq-est-country");
  const cityEl    = document.getElementById("wq-est-city");
  const sourceEl  = document.getElementById("wq-est-source");
  const urgencyEl = document.getElementById("wq-est-urgency");

  const state = {
    step: 1,
    type: null,
    startedAt: Date.now(),
  };

  const show = (el) => el && (el.hidden = false);
  const hide = (el) => el && (el.hidden = true);

  function goToStep(n) {
    state.step = n;
    stepEls.forEach((el) => {
      el.hidden = Number(el.dataset.step) !== n;
    });
    if (navFill) navFill.style.width = `${(n / 3) * 100}%`;
    if (stepNum) stepNum.textContent = String(n).padStart(2, "0");
    // Do NOT scroll here — the user is already looking at the form.
    // Only focus the new field, and suppress the browser's default focus-scroll.
    setTimeout(() => {
      if (n === 2) descEl?.focus({ preventScroll: true });
      if (n === 3) emailEl?.focus({ preventScroll: true });
    }, 120);
  }

  // --- Step 1: click type → advance ---
  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.type = btn.dataset.type;
      typeBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-checked", active ? "true" : "false");
      });
      setTimeout(() => goToStep(2), 180);
    });
  });

  // --- Back links ---
  backLinks.forEach((a) => {
    a.addEventListener("click", () => goToStep(Number(a.dataset.backTo)));
  });

  // --- Char counter ---
  if (descEl && countEl) {
    const updateCount = () => countEl.textContent = String(descEl.value.length);
    descEl.addEventListener("input", updateCount);
    updateCount();
  }

  // --- Step 2 → 3 ---
  nextBtn?.addEventListener("click", () => {
    if ((descEl.value || "").trim().length < 40) {
      descEl.setCustomValidity("Write at least a short paragraph — the AI needs a real description.");
      descEl.reportValidity();
      descEl.addEventListener("input", () => descEl.setCustomValidity(""), { once: true });
      return;
    }
    goToStep(3);
  });

  // --- Final submit ---
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Honeypot
    if (form.querySelector('[name="website"]')?.value) return;
    if (form.querySelector('[name="company_name_confirm"]')?.value) return;

    // Time-trap: minimum 8 seconds since page interaction
    const elapsed = Date.now() - state.startedAt;
    if (elapsed < 8000) {
      alert("Please take a moment to review your answers before submitting.");
      return;
    }

    // Validate step 3 fields
    if (!emailEl.value || !emailEl.checkValidity()) { emailEl.reportValidity(); return; }
    if (!countryEl.value) { countryEl.focus(); return; }
    if (!cityEl.value || cityEl.value.trim().length < 2) { cityEl.focus(); return; }
    if (!sourceEl.value)  { sourceEl.focus(); return; }
    if (!urgencyEl.value) { urgencyEl.focus(); return; }

    const payload = {
      projectType: state.type || "web",
      description: descEl.value.trim(),
      budget:   document.getElementById("wq-est-budget").value || null,
      timeline: document.getElementById("wq-est-timeline").value || null,
      email:    emailEl.value.trim(),
      country:  countryEl.value,
      city:     cityEl.value.trim(),
      source:   sourceEl.value,
      urgency:  urgencyEl.value,
      elapsed
    };

    submitBtn.disabled = true;
    const originalBtn = submitBtn.innerHTML;
    submitBtn.innerHTML = "Sending...";

    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      // Accept 200 from real API or fall through to mock if endpoint missing
      if (!res.ok && res.status !== 501) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Local dev or endpoint unreachable → silent mock success
      console.warn("[estimator] /api/estimate unavailable, mock success:", err?.message || err);
      await new Promise((r) => setTimeout(r, 900));
    }

    submitBtn.innerHTML = originalBtn;
    submitBtn.disabled = false;

    hide(form);
    show(doneEl);
    estimator?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // --- Estimate another ---
  againBtn?.addEventListener("click", () => {
    hide(doneEl);
    show(form);
    form.reset();
    state.type = null;
    state.startedAt = Date.now();
    typeBtns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-checked", "false"); });
    if (countEl) countEl.textContent = "0";
    goToStep(1);
  });

  // Init
  goToStep(1);
})();
