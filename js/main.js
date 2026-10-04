/* main.js — theme, spotlight, reveals, click feedback, scroll progress.
   Zero dependencies · loaded with `defer` on every page.

   Performance rules followed throughout:
   - Scroll listeners are { passive: true } and do no work themselves; they only queue ONE rAF.
   - Inside each frame: all layout READS first, then all WRITES (no layout thrashing).
   - Continuous motion writes only compositor-friendly props (transform, opacity) or CSS variables.
   - There is no global mousemove tracker. Pointer tracking is bound per element. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const fineHover = matchMedia('(hover: hover) and (pointer: fine)');

  /* ==========================================================================
     1. THEME — two-state control (system <-> pinned opposite).
        State lives purely on <html> as a class (.theme-light | .theme-dark).
        JS flips the class; the CSS engine re-resolves every var(--token) and
        repaints. Where supported, a View Transition cross-fades old/new
        snapshots on the compositor so the swap is fluid, not a hard flash.
     ========================================================================== */
  const KEY = 'theme';
  const PIN = { light: 'theme-light', dark: 'theme-dark' };

  const toggle = document.getElementById('theme-toggle');
  const label = document.getElementById('theme-toggle-label');
  const mq = matchMedia('(prefers-color-scheme: dark)');

  const system = () => (mq.matches ? 'dark' : 'light');
  const pinned = () =>
    root.classList.contains(PIN.dark) ? 'dark' : root.classList.contains(PIN.light) ? 'light' : null;
  const effective = () => pinned() || system();
  const opposite = (t) => (t === 'dark' ? 'light' : 'dark');

  const setPin = (value) => {
    root.classList.remove(PIN.light, PIN.dark);
    if (value) root.classList.add(PIN[value]);
  };

  const persist = (value) => {
    try {
      if (value) localStorage.setItem(KEY, value);
      else localStorage.removeItem(KEY);
    } catch { /* storage unavailable (private mode, blocked) — session-only */ }
  };

  const renderToggle = () => {
    const next = opposite(effective());
    label.textContent = next;
    toggle.setAttribute('aria-label', `Switch to ${next} theme`);
  };

  if (toggle && label) {
    toggle.addEventListener('click', () => {
      const next = opposite(effective());
      const commit = () => {
        // Landing back on the OS value = "system" state: drop the pin so OS changes apply later.
        const pin = next === system() ? null : next;
        setPin(pin);
        persist(pin);
        renderToggle();
      };

      if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(commit);
      else commit();
    });

    // OS theme changed at runtime: CSS adapts itself; only the label needs a refresh.
    mq.addEventListener('change', renderToggle);
    renderToggle();
  }

  /* ==========================================================================
     2. SPOTLIGHT — localized radial gradient on project cards + writing rows.
        Listeners live ONLY on those elements. The rect is read inside the
        handler (read), and the CSS variables are written once per frame in
        rAF (write), so pointer bursts coalesce into a single style update.
     ========================================================================== */
  if (fineHover.matches) {
    let frame = 0;
    let hot = null;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      hot.style.setProperty('--mx', `${x}px`);
      hot.style.setProperty('--my', `${y}px`);
    };

    const onMove = (event) => {
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      hot = el;
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.querySelectorAll('.card, .post').forEach((el) => {
      el.addEventListener('mousemove', onMove, { passive: true });
    });
  }

  /* ==========================================================================
     3. SCROLL REVEAL — IntersectionObserver (no scroll listener, no layout reads).
        Adds .is-visible once; CSS runs a keyframe (opacity + translate only).
        When the animation ends we strip the attributes so the element goes
        back to its normal styles and its own hover transitions are untouched.
     ========================================================================== */
  const revealTargets = document.querySelectorAll('[data-reveal]');

  if (revealTargets.length) {
    const finish = (event) => {
      const el = event.currentTarget;
      if (event.target !== el || event.animationName !== 'reveal') return;
      el.removeEventListener('animationend', finish);
      el.removeAttribute('data-reveal');
      el.classList.remove('is-visible');
      el.style.removeProperty('--reveal-delay');
    };

    if (!('IntersectionObserver' in window)) {
      revealTargets.forEach((el) => el.removeAttribute('data-reveal'));
    } else {
      const observer = new IntersectionObserver(
        (entries, obs) => {
          let order = 0; // stagger entries that arrive in the same batch
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target;
            el.style.setProperty('--reveal-delay', `${Math.min(order++ * 70, 350)}ms`);
            el.addEventListener('animationend', finish);
            el.classList.add('is-visible');
            obs.unobserve(el);
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.1 }
      );
      revealTargets.forEach((el) => observer.observe(el));
    }
  }

  /* ==========================================================================
     4. CLICK FEEDBACK — one delegated pointerdown listener (not a mouse tracker).
        Toggles .ping-a / .ping-b on the pressed element. Alternating the two
        keyframe names restarts the animation on rapid clicks WITHOUT forcing
        a reflow. The animation itself is pure CSS (`scale`, compositor-only).
     ========================================================================== */
  const PRESSABLE = 'a[href], button, .card';

  const ping = (el) => {
    const next = el.classList.contains('ping-a') ? 'ping-b' : 'ping-a';
    el.classList.remove('ping-a', 'ping-b');
    el.classList.add(next);
  };

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      const el = event.target.closest(PRESSABLE);
      if (el) ping(el);
    },
    { passive: true }
  );

  // Keyboard activation (Enter on a link / Space on a button) fires click with detail === 0.
  document.addEventListener(
    'click',
    (event) => {
      if (event.detail !== 0) return;
      const el = event.target.closest(PRESSABLE);
      if (el) ping(el);
    },
    { passive: true }
  );

  document.addEventListener('animationend', (event) => {
    if (event.animationName.startsWith('ping-')) event.target.classList.remove('ping-a', 'ping-b');
  });

  /* ==========================================================================
     5. SCROLL INDICATORS — reading-progress bar + scrollspy (for #anchor navs).
        One passive scroll listener -> one rAF per frame. Reads happen first,
        writes last. Document height is cached via ResizeObserver, which runs
        after layout, so reading scrollHeight there never forces a reflow.
     ========================================================================== */
  const bar = document.createElement('div');
  bar.className = 'progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);

  const spy = [...document.querySelectorAll('.site-nav a[href^="#"]')]
    .map((link) => ({ link, section: document.querySelector(link.hash) }))
    .filter((item) => item.section);

  let maxScroll = 1;
  let current = null;
  let queued = false;

  const measure = () => {
    maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
    schedule();
  };

  const frame = () => {
    queued = false;

    // --- reads ---
    const scrollY = window.scrollY;
    const progress = Math.min(1, scrollY / maxScroll);

    let active = null;
    if (spy.length) {
      const trigger = window.innerHeight * 0.35;
      active = spy[0];
      for (const item of spy) {
        if (item.section.getBoundingClientRect().top <= trigger) active = item;
      }
      // Short final section can never reach the trigger line — pin it at page bottom.
      if (window.innerHeight + scrollY >= root.scrollHeight - 2) active = spy[spy.length - 1];
    }

    // --- writes ---
    bar.style.transform = `scaleX(${progress})`;
    if (active && active !== current) {
      current = active;
      for (const item of spy) {
        if (item === active) item.link.setAttribute('aria-current', 'location');
        else item.link.removeAttribute('aria-current');
      }
    }
  };

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', measure, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(root);
  measure();
})();
