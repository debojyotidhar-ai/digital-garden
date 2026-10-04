/* background.js — "digital constellation" canvas background.
   Zero dependencies. Loaded with `defer` on every page, after main.js.

   WHAT IT DRAWS
   - ~25–90 tiny square "nodes" (count scales with viewport area) drifting very slowly.
   - Faint 1px lines between nodes that come within LINK_DIST of each other
     (closer = slightly more opaque).
   - Near the cursor, nodes form temporary accent-coloured links to it and are
     very gently nudged away.
   - Dots are near-solid (fill alpha 0.9); links sit at stroke alpha 0.4.

   PERFORMANCE DESIGN
   - One requestAnimationFrame loop. It runs only while the tab is visible and
     only when motion is allowed (prefers-reduced-motion draws a single static frame).
   - Time-based movement (dt), so speed is identical on 60 / 120 / 144 Hz displays.
   - Particles live in typed arrays (struct-of-arrays): no per-frame allocation, no GC churn.
   - Lines are batched into 4 opacity buckets -> 4 stroke() calls per frame, not hundreds.
   - Pair test rejects on |dx| / |dy| before computing a distance; sqrt only for real links.
   - The canvas is `position: fixed` at (0,0), so pointer clientX/Y ARE canvas coordinates:
     the mouse handler just stores two numbers (passive, zero layout reads).
   - Resize: the listener only sets a flag; the real work happens once, inside the next frame. */
(() => {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return; // no canvas support / element missing: page works fine without it

  /* ------------------------------------------------------------------------
     Tunables — everything visual lives here.
     ------------------------------------------------------------------------ */
  const CFG = {
    areaPerParticle: 17000, // px² of viewport per node (bigger = sparser)
    minParticles: 24,
    maxParticles: 90,
    linkDist: 180,          // px: max distance for a node-to-node line
    speedMin: 6,            // px/second base drift
    speedMax: 16,
    dotAlpha: 0.9,          // near-solid nodes in both themes
    lineAlpha: 0.4,         // connecting lines (both themes)
    mouseRadius: 150,       // px: cursor influence radius
    mouseLinkAlpha: 0.22,   // strongest cursor-to-node line
    repel: 55,              // px/s² gentle push away from cursor
    kickDecay: 2.5,         // how quickly the push fades (1/s)
    maxDpr: 2,              // cap backing-store scale: crisp but cheap on 3x phones
    margin: 12,             // px beyond the edge before a node wraps around
  };
  const BUCKETS = 4;

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */
  // Struct-of-arrays, preallocated at the maximum size.
  const px = new Float32Array(CFG.maxParticles);   // position x (CSS px)
  const py = new Float32Array(CFG.maxParticles);   // position y
  const vx = new Float32Array(CFG.maxParticles);   // base drift velocity (px/s)
  const vy = new Float32Array(CFG.maxParticles);
  const kx = new Float32Array(CFG.maxParticles);   // temporary mouse "kick" velocity
  const ky = new Float32Array(CFG.maxParticles);
  const pr = new Float32Array(CFG.maxParticles);   // radius: Math.random() * 3.0 + 1
  let count = 0;

  let w = 0;   // viewport width in CSS px (= canvas CSS size)
  let h = 0;
  let dpr = 1;

  // Pointer: raw target (written by the event) and smoothed value (advanced per frame).
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false };

  // Colors come from the site's own CSS variables so both themes "just work".
  let fg = '#888';
  let accent = '#888';

  let animate = true;       // false under prefers-reduced-motion
  let needsResize = true;
  let rafId = 0;
  let last = 0;             // previous frame timestamp (0 = "no previous frame")

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (min, max) => min + Math.random() * (max - min);

  // Apply an alpha channel to #rgb / #rrggbb so fill/stroke opacity is identical in both themes.
  const withAlpha = (hex, alpha) => {
    const h = (hex || '').trim().replace('#', '');
    if (h.length !== 3 && h.length !== 6) return hex;
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  };

  /* ------------------------------------------------------------------------
     Theme colors: read the live values of --fg / --accent.
     Re-read when the theme class on <html> changes, or the OS theme flips.
     ------------------------------------------------------------------------ */
  const readColors = () => {
    const styles = getComputedStyle(document.documentElement);
    fg = styles.getPropertyValue('--fg').trim() || '#888';
    accent = styles.getPropertyValue('--accent').trim() || fg;
    if (!animate) schedule(); // static mode: repaint once with the new colors
  };

  new MutationObserver(readColors).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);

  /* ------------------------------------------------------------------------
     Particles
     ------------------------------------------------------------------------ */
  const spawn = (i) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(CFG.speedMin, CFG.speedMax);
    px[i] = Math.random() * w;
    py[i] = Math.random() * h;
    vx[i] = Math.cos(angle) * speed;
    vy[i] = Math.sin(angle) * speed;
    kx[i] = ky[i] = 0;
    pr[i] = Math.random() * 3.0 + 1;
  };

  /* ------------------------------------------------------------------------
     Resize: keeps the backing store 1:1 with device pixels (no stretching) and
     re-fits the particle field without ever re-creating existing particles.
     CSS gives the canvas `height: 100lvh`, so mobile URL-bar show/hide does NOT
     change its size and therefore does not trigger a costly buffer reallocation.
     ------------------------------------------------------------------------ */
  const resize = () => {
    const nw = canvas.clientWidth;   // layout read: once per resize, never per frame
    const nh = canvas.clientHeight;
    const ndpr = Math.min(window.devicePixelRatio || 1, CFG.maxDpr);
    if (!nw || !nh) return;
    if (nw === w && nh === h && ndpr === dpr) return;

    // Remap existing nodes proportionally so the field doesn't "jump" on resize.
    const sx = w ? nw / w : 1;
    const sy = h ? nh / h : 1;
    for (let i = 0; i < count; i++) {
      px[i] *= sx;
      py[i] *= sy;
    }

    w = nw;
    h = nh;
    dpr = ndpr;

    // Assigning width/height clears the bitmap AND resets context state, so re-apply the transform.
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Grow or shrink the population to match the new area.
    const target = Math.max(
      CFG.minParticles,
      Math.min(CFG.maxParticles, Math.round((w * h) / CFG.areaPerParticle))
    );
    while (count < target) spawn(count++);
    count = target;
  };

  /* ------------------------------------------------------------------------
     Simulation step (dt in seconds)
     ------------------------------------------------------------------------ */
  const step = (dt) => {
    const decay = Math.exp(-CFG.kickDecay * dt);
    const r = CFG.mouseRadius;
    const r2 = r * r;
    const m = CFG.margin;

    // Ease the cursor toward its target: smooth motion even when events are sparse.
    if (pointer.active) {
      const k = 1 - Math.exp(-12 * dt);
      pointer.sx += (pointer.x - pointer.sx) * k;
      pointer.sy += (pointer.y - pointer.sy) * k;
    }

    for (let i = 0; i < count; i++) {
      // Gentle push away from the cursor (stronger the closer a node is).
      if (pointer.active) {
        const dx = px[i] - pointer.sx;
        const dy = py[i] - pointer.sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const force = (1 - d / r) * CFG.repel * dt;
          kx[i] += (dx / d) * force;
          ky[i] += (dy / d) * force;
        }
      }

      // Kick fades exponentially; nodes drift back to their own slow course.
      kx[i] *= decay;
      ky[i] *= decay;

      px[i] += (vx[i] + kx[i]) * dt;
      py[i] += (vy[i] + ky[i]) * dt;

      // Wrap around just outside the viewport so lines never pop at the edge.
      if (px[i] < -m) px[i] = w + m;
      else if (px[i] > w + m) px[i] = -m;
      if (py[i] < -m) py[i] = h + m;
      else if (py[i] > h + m) py[i] = -m;
    }
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  const draw = () => {
    ctx.clearRect(0, 0, w, h);

    const L = CFG.linkDist;
    const L2 = L * L;

    /* 1. Node-to-node lines, batched into opacity buckets (one stroke per bucket). */
    const paths = [];
    for (let b = 0; b < BUCKETS; b++) paths.push(new Path2D());

    for (let i = 0; i < count; i++) {
      const xi = px[i];
      const yi = py[i];
      for (let j = i + 1; j < count; j++) {
        const dx = xi - px[j];
        if (dx > L || dx < -L) continue;        // cheap reject
        const dy = yi - py[j];
        if (dy > L || dy < -L) continue;        // cheap reject
        const d2 = dx * dx + dy * dy;
        if (d2 >= L2) continue; // draw when distance < 180

        const closeness = 1 - Math.sqrt(d2) / L; // 0 (far) … 1 (touching)
        const bucket = Math.min(BUCKETS - 1, (closeness * BUCKETS) | 0);
        paths[bucket].moveTo(xi, yi);
        paths[bucket].lineTo(px[j], py[j]);
      }
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(fg, CFG.lineAlpha);
    ctx.globalAlpha = 1;
    for (let b = 0; b < BUCKETS; b++) ctx.stroke(paths[b]);

    /* 2. Cursor links: a few accent-coloured lines that form and fade with distance. */
    if (pointer.active) {
      const r = CFG.mouseRadius;
      const r2 = r * r;
      ctx.strokeStyle = withAlpha(accent, CFG.lineAlpha);
      for (let i = 0; i < count; i++) {
        const dx = px[i] - pointer.sx;
        const dy = py[i] - pointer.sy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        ctx.globalAlpha = CFG.mouseLinkAlpha * (1 - Math.sqrt(d2) / r);
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        ctx.lineTo(pointer.sx, pointer.sy);
        ctx.stroke();
      }
    }

    /* 3. Nodes: filled circles, radius Math.random() * 3.0 + 1, fill alpha 0.9. */
    ctx.globalAlpha = 1;
    ctx.fillStyle = withAlpha(fg, CFG.dotAlpha);
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(px[i], py[i], pr[i], 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* ------------------------------------------------------------------------
     Frame loop (requestAnimationFrame -> locked to display refresh rate)
     ------------------------------------------------------------------------ */
  const tick = (now) => {
    rafId = 0;

    if (needsResize) {
      needsResize = false;
      resize();
    }

    // Clamp dt: after a stall/tab switch we must not teleport nodes across the screen.
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;

    if (animate) step(dt);
    draw();

    if (animate && !document.hidden) rafId = requestAnimationFrame(tick);
  };

  // Ensure exactly one frame is queued (safe to call from anywhere, any number of times).
  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  const stop = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    last = 0; // next frame starts with dt = 0
  };

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */
  // Resize: just raise a flag. The rAF loop performs the actual work once per frame at most.
  addEventListener(
    'resize',
    () => {
      needsResize = true;
      schedule();
    },
    { passive: true }
  );

  // Pointer: store two numbers. No layout reads, no DOM writes, no drawing here.
  addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return; // finger "hover" isn't a cursor
      if (!pointer.active) {
        pointer.sx = event.clientX; // first sample: start the easing at the cursor
        pointer.sy = event.clientY;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    },
    { passive: true }
  );

  // Cursor left the page: let the cursor links dissolve.
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.active = false;
  });

  // Don't burn cycles in background tabs.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else schedule();
  });

  // Respect reduced motion live: animated <-> single static frame.
  const applyMotionPreference = () => {
    animate = !reduceMotion.matches;
    if (!animate) pointer.active = false;
    stop();
    schedule();
  };
  reduceMotion.addEventListener('change', applyMotionPreference);

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  readColors();
  applyMotionPreference();
})();
