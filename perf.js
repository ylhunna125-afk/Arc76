/* Arc76 performance.
 *
 * Measured before any of this, on a desktop with a discrete GPU:
 * median 50ms/frame (20fps) during a scroll, p95 267ms, 823 CSS
 * animations all running at once. A phone is far worse.
 *
 * Three things were responsible, in order:
 *
 * 1. EVERY SCENE ANIMATES ALL THE TIME. CSS animations do not stop when
 *    their element scrolls out of view, so all six scenes were running
 *    constantly while exactly one was ever on screen.
 *
 * 2. THE BLIZZARD. The summit alone runs ~310 individually animated
 *    snow particles (.bz), out of 565 animations in that one scene.
 *    Snow reads as snow at half the particle count; past a certain
 *    density the eye cannot tell, but the compositor can.
 *
 * 3. HUGE SVG BLUR FILTERS. Several filtered elements in the summit
 *    cover over a million square pixels each. An SVG filter on an area
 *    that size is re-rasterised constantly and is brutal on a phone.
 *
 * Everything here is decorative-only. No layout, copy, interaction or
 * scroll behaviour is touched, and the desktop keeps the full blizzard
 * unless the device says it cannot cope.
 *
 * Separate file because the design tool overwrites index.html on export.
 */
(() => {
  'use strict';
  if (window.__arc76Perf) return;
  window.__arc76Perf = true;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Is this a device that will struggle? Phones and tablets, anything
     with few cores or little memory. deviceMemory and
     hardwareConcurrency are absent on Safari, so a coarse pointer is
     the fallback signal, and that is exactly the iPhone case. */
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = innerWidth < 900;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  const lowMem = (navigator.deviceMemory || 8) <= 4;
  const WEAK = coarse || small || fewCores || lowMem;

  /* Fraction of blizzard particles to keep. The full field is ~310 in
     the summit; a phone cannot composite that and hold 60fps. */
  const KEEP = reduced ? 0 : WEAK ? 0.14 : 0.55;

  /* Filtered areas above this get their filter dropped on weak devices.
     Relative to the screen, not absolute: an absolute pixel threshold
     tuned on a 1440x900 desktop catches almost nothing on a 390x844
     phone, which is exactly the device that needs it. 12% of the
     viewport still spares the small ones you actually look at, the
     lantern and the flag. */
  const FILTER_AREA_LIMIT = Math.max(40000, innerWidth * innerHeight * 0.12);

  // ── 1. pause off-screen scenes ────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .arc-idle, .arc-idle *, .arc-idle::before, .arc-idle::after,
    .arc-idle *::before, .arc-idle *::after,
    .arc-hidden, .arc-hidden *, .arc-hidden::before, .arc-hidden::after,
    .arc-hidden *::before, .arc-hidden *::after {
      animation-play-state: paused !important;
    }
  `;
  document.head.appendChild(style);

  function observeScenes() {
    const scenes = [...document.querySelectorAll('.wrap')];
    if (!scenes.length) return false;
    /* Scenes are sticky-pinned and tall, so they are visible well beyond
       their own box. Half a viewport of margin resumes them before any
       pixel shows, without keeping three scenes warm at once. */
    const io = new IntersectionObserver(
      (es) => { for (const e of es) e.target.classList.toggle('arc-idle', !e.isIntersecting); },
      { rootMargin: '50% 0px 50% 0px', threshold: 0 }
    );
    scenes.forEach((s) => io.observe(s));
    return true;
  }

  document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('arc-hidden', document.hidden);
  });

  // ── 2. thin the blizzard ──────────────────────────────────────────
  function thinSnow() {
    const flakes = [...document.querySelectorAll('.bz')];
    if (!flakes.length) return false;
    if (KEEP >= 1) return true;
    /* Drop evenly across the list rather than at random, so the field
       thins uniformly instead of leaving bald patches. */
    const step = KEEP > 0 ? 1 / (1 - KEEP) : 1;
    let acc = 0, removed = 0;
    for (const f of flakes) {
      acc += 1;
      if (KEEP === 0 || acc >= step) { acc -= step; f.remove(); removed++; }
    }
    if (window.__arcPerfLog) console.log('[perf] blizzard', flakes.length, '->', flakes.length - removed);
    return true;
  }

  // ── 3. drop oversized SVG filters on weak devices ─────────────────
  function trimFilters() {
    if (!WEAK) return true;
    const filtered = [...document.querySelectorAll('[filter]')];
    if (!filtered.length) return false;
    let dropped = 0;
    for (const el of filtered) {
      let box;
      try { box = el.getBoundingClientRect(); } catch { continue; }
      if (box.width * box.height > FILTER_AREA_LIMIT) {
        el.dataset.arcFilter = el.getAttribute('filter');   // reversible
        el.removeAttribute('filter');
        dropped++;
      }
    }
    if (window.__arcPerfLog) console.log('[perf] filters dropped', dropped, 'of', filtered.length);
    return true;
  }

  function run() {
    const a = observeScenes(), b = thinSnow(), c = trimFilters();
    return a && b && c;
  }

  if (!run()) {
    // the scenes are built by the page's own script; retry briefly
    let n = 0;
    const t = setInterval(() => { if (run() || ++n > 40) clearInterval(t); }, 100);
  }
})();
