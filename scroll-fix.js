/* Arc76 scroll fix — injected by dev.mjs at serve time.
 *
 * Lives outside index.html on purpose. Every export from the design tool
 * replaces index.html wholesale, so anything patched into that file is
 * gone the next time you hit download. This is applied to the response,
 * not to the file, so it survives every export.
 *
 * Two problems it solves:
 *
 * 1. DEAD SCROLL. s1 is authored at 420vh but its descent animation
 *    finishes at DESCENT_VH screens. Everything after that is scrolling
 *    with nothing happening, because s2 only begins entering 100vh before
 *    s1 ends (it carries margin-top:-100vh). dev.mjs shortens s1 and the
 *    descent in the served HTML; this file handles the snap.
 *
 * 2. NO COMMIT. Stopping between the camp and the next scene leaves you
 *    stranded looking at two half-scenes. This snaps to whichever one you
 *    were heading for.
 *
 * CSS scroll-snap is the wrong tool here. `mandatory` fights the scrubbed
 * descent, yanking the camera while you are still driving it, and
 * `proximity` behaves inconsistently on a page built from sticky pins.
 */
(() => {
  'use strict';
  if (window.__arc76Snap) return;          // safe to load twice
  window.__arc76Snap = true;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const s1 = document.getElementById('s1');
  const wraps = [...document.querySelectorAll('.wrap')];
  if (!s1 || wraps.length < 2) return;

  // must match the value dev.mjs rewrites into the page
  const DESCENT_VH = +(document.documentElement.dataset.descentVh || 1.6);

  const IDLE = 130;        // ms of stillness before it commits
  const GRAB = 0.55;       // how close to a boundary, in screen heights
  let timer = null, raf = null, snapping = false, dir = 1, lastY = scrollY, landedAt = 0;

  const targets = () => {
    const vh = innerHeight;
    // the camp (end of the descent), then the top of every later scene
    // mobile/mobile.js adds the first and second page of the paged scenes on a phone
    const extra = typeof window.__arcSnapExtra === 'function' ? window.__arcSnapExtra() : [];
    return [s1.offsetTop + DESCENT_VH * vh].concat(wraps.slice(1).map((w) => w.offsetTop), extra);
  };

  const cancel = () => { if (raf) cancelAnimationFrame(raf); raf = null; snapping = false; };

  function glide(y) {
    const from = scrollY, dist = y - from;
    if (Math.abs(dist) < 2) return;
    const dur = Math.min(520, 180 + Math.abs(dist) * 0.45);
    const t0 = performance.now();
    snapping = true;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      scrollTo(0, from + dist * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
      else { raf = null; snapping = false; landedAt = performance.now(); }
    };
    raf = requestAnimationFrame(step);
  }

  function consider() {
    if (snapping) return;
    const vh = innerHeight, grab = vh * GRAB;
    const descentEnd = s1.offsetTop + DESCENT_VH * vh;
    if (scrollY < descentEnd - 4) return;   // still scrubbing the camera: leave them alone

    /* Snap the way they were already going. Nearest-target-wins drags you
       back onto the camp the moment you try to leave it, because the camp
       and the next scene are only a third of a screen apart. */
    const ahead = targets()
      .filter((t) => (dir >= 0 ? t > scrollY + 2 : t < scrollY - 2))
      .sort((a, b) => Math.abs(a - scrollY) - Math.abs(b - scrollY));
    if (ahead.length && Math.abs(ahead[0] - scrollY) < grab) { glide(ahead[0]); return; }

    // nothing ahead worth committing to: settle back, but only if very
    // close, so a deliberate scroll is never undone
    const behind = targets()
      .filter((t) => (dir >= 0 ? t <= scrollY : t >= scrollY))
      .sort((a, b) => Math.abs(a - scrollY) - Math.abs(b - scrollY));
    if (behind.length) {
      const d = Math.abs(behind[0] - scrollY);
      if (d > 2 && d < vh * 0.18) glide(behind[0]);
    }
  }

  addEventListener('scroll', () => {
    // our own scrolling, not theirs (the scroll event from a snap's last frame lands just after it ends,
    // and must not chain into a second snap when two targets are close, as on a phone)
    if (snapping || performance.now() - landedAt < 200) { lastY = scrollY; return; }
    if (scrollY !== lastY) { dir = scrollY > lastY ? 1 : -1; lastY = scrollY; }
    clearTimeout(timer);
    timer = setTimeout(consider, IDLE);
  }, { passive: true });

  // any deliberate input beats an in-flight snap
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((ev) =>
    addEventListener(ev, cancel, { passive: true }));
})();
