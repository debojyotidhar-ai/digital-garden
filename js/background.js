/* background.js — layered aurora ribbons, rendered with the native Canvas API. */
(() => {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas && canvas.getContext('2d', { alpha: true });
  if (!canvas || !ctx) return;

  const bands = [
    { base: 0.30, amplitude: 0.12, thickness: 0.24, frequency: 0.0050, speed: 0.00013, phase: 0.4, hue: 0 },
    { base: 0.42, amplitude: 0.16, thickness: 0.27, frequency: 0.0038, speed: -0.00010, phase: 2.1, hue: 1 },
    { base: 0.54, amplitude: 0.14, thickness: 0.23, frequency: 0.0044, speed: 0.00009, phase: 4.2, hue: 2 },
    { base: 0.66, amplitude: 0.13, thickness: 0.22, frequency: 0.0034, speed: -0.00008, phase: 5.7, hue: 0 },
  ];
  const colors = [
    ['rgba(44, 48, 137, 0)', 'rgba(63, 87, 190, 0.14)', 'rgba(24, 156, 173, 0.18)', 'rgba(35, 44, 110, 0.06)', 'rgba(44, 48, 137, 0)'],
    ['rgba(30, 65, 133, 0)', 'rgba(54, 148, 166, 0.15)', 'rgba(73, 190, 168, 0.13)', 'rgba(57, 91, 173, 0.08)', 'rgba(30, 65, 133, 0)'],
    ['rgba(64, 38, 122, 0)', 'rgba(106, 75, 166, 0.12)', 'rgba(87, 112, 191, 0.14)', 'rgba(30, 147, 164, 0.08)', 'rgba(64, 38, 122, 0)'],
  ];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let visible = !document.hidden;

  const resize = () => {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  };

  const makeGradient = (band) => {
    const gradient = ctx.createLinearGradient(0, height * (band.base - band.thickness), 0,
      height * (band.base + band.thickness * 1.8));
    const palette = colors[band.hue];
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(0.28, palette[1]);
    gradient.addColorStop(0.55, palette[2]);
    gradient.addColorStop(0.78, palette[3]);
    gradient.addColorStop(1, palette[4]);
    return gradient;
  };

  const drawBand = (band, time, segmentCount) => {
    const drift = time * band.speed;
    const topY = (x) => height * band.base
      + Math.sin(x * band.frequency + drift + band.phase) * height * band.amplitude
      + Math.sin(x * band.frequency * 0.47 - drift * 0.72 + band.phase * 1.7) * height * 0.045;
    const lowerY = (x) => topY(x) + height * band.thickness
      + Math.sin(x * band.frequency * 0.72 + drift * 0.6 + band.phase) * height * 0.035;

    ctx.beginPath();
    for (let i = 0; i <= segmentCount; i++) {
      const x = width * i / segmentCount;
      const y = topY(x);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = segmentCount; i >= 0; i--) {
      const x = width * i / segmentCount;
      ctx.lineTo(x, lowerY(x));
    }
    ctx.closePath();
    ctx.fillStyle = makeGradient(band);
    ctx.fill();
  };

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    const segments = Math.max(48, Math.min(160, Math.ceil(width / 8)));
    for (const band of bands) drawBand(band, time, segments);
  }

  const stop = () => {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const animate = (time) => {
    rafId = 0;
    if (!visible) return;
    draw(time);
    if (!reduceMotion.matches) rafId = requestAnimationFrame(animate);
  };

  const start = () => {
    stop();
    resize();
    if (visible && !reduceMotion.matches) rafId = requestAnimationFrame(animate);
  };

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) start();
    else stop();
  });
  reduceMotion.addEventListener('change', start);
  window.addEventListener('resize', resize, { passive: true });

  start();
})();
