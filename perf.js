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
 * ...and then a fourth, which is what section 4 is for:
 *
 * 4. NOTHING IN 1-3 FIRES ON A DESKTOP MAC. The site was reported smooth
 *    on the owner's 1440x900 Windows/Brave window and laggy on a Mac.
 *    WEAK below asks four questions — coarse pointer? small window? few
 *    cores? little memory? — and a Retina MacBook answers no to all four,
 *    so it got the full-fat page and none of the relief. Same for
 *    mobile-lite.css, gated on (max-width:900px),(pointer:coarse). That
 *    part of the diagnosis is certainly right, and section 4 fixes it.
 *
 *    THE "IT IS RETINA" EXPLANATION, HOWEVER, DID NOT SURVIVE
 *    MEASUREMENT, and it is worth writing down so nobody re-derives it.
 *    The theory was that a 1680x1050 window at devicePixelRatio 2 is
 *    3360x2100 = 7.1M device pixels per frame against 1.3M for the
 *    owner's 1440x900 at DPR 1, so every filtered buffer costs 5.4x.
 *    Measured on a real GPU with an identical scripted scroll, the cost
 *    does not move with pixels at all:
 *
 *      profile                        RecalcStyle  Layout  GPUTask  late
 *      DPR2 1680x1050  (7.1M px)          266        100      549    49%
 *      DPR1 1440x900   (1.3M px)          265        100      539    47%
 *      phone DPR3 390x844 (3.0M px)        29          5      226     2%
 *
 *    Five times the pixels for the same cost. And the phone pushes more
 *    device pixels than the DPR1 desktop while dropping 2% of frames
 *    instead of 47%, because mobile/static.js switches off the per-frame
 *    engine. Pixel count does not predict this page's cost; running the
 *    frame loop does.
 *
 *    WHERE THE TIME ACTUALLY GOES, since it is not here. index.html's
 *    tick() gates updateDescent() and renderMoves() on the scroll having
 *    moved, but calls updateNav() unconditionally every frame, and
 *    updateNav() reads document.documentElement.scrollHeight — a
 *    layout-forcing read — straight after renderMoves() has written inline
 *    styles to the .pin elements. That is a forced synchronous layout on
 *    every frame, at any resolution, even standing still, which is exactly
 *    the shape of the numbers above. Fixing it is a few lines in
 *    index.html (cache scrollHeight in fit(), gate updateNav() on
 *    movement) and is not something this file can reach.
 *
 *    Section 4 still earns its place: driven to the bottom of its ladder
 *    it is worth -17% of frame time and a third fewer dropped frames at
 *    DPR2, and being gated on measurement rather than on device class it
 *    helps whichever machine is actually struggling instead of guessing.
 *
 * Everything here is decorative-only. No layout, copy, interaction or
 * scroll behaviour is touched, and the desktop keeps the full blizzard
 * unless the device says — or now, demonstrates — that it cannot cope.
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

  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[s.length >> 1] : 0;
  };

  // ── 1. pause off-screen scenes ────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .arc-idle, .arc-idle *, .arc-idle::before, .arc-idle::after,
    .arc-idle *::before, .arc-idle *::after,
    .arc-hidden, .arc-hidden *, .arc-hidden::before, .arc-hidden::after,
    .arc-hidden *::before, .arc-hidden *::after {
      animation-play-state: paused !important;
    }
    /* Section 4's tier classes. One class, one rule each, nothing stored
       per element — so removing the class restores every one of them. */
    html.arc-nobd *, html.arc-nobd *::before, html.arc-nobd *::after {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    html.arc-nosnow .bz { display: none !important; }
    .bz.arc-bz-off { display: none !important; }
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

  /* ── 4. tier quality on the measured frame clock ───────────────────
   *
   * WHY MEASURED RATHER THAN ONE MORE DEVICE GUESS. Sections 1-3 all hang
   * off WEAK, and WEAK cannot see a Retina MacBook (see the header).
   * Adding a fifth static question — "is DPR >= 2?" — would degrade every
   * Mac, every 4K Windows desktop, and the owner's own machine the day he
   * buys a better monitor, pre-emptively and permanently. And per the
   * header it would have been gating on the wrong quantity anyway. So the
   * gate here is the frame clock: how many of the last 20 frames missed a
   * vsync. A machine that renders this page fast never trips it and is
   * left alone bit for bit, whatever its pixel ratio. A machine that is
   * genuinely dropping frames steps down as far as it needs to, whatever
   * its spec sheet claims.
   *
   * Tested both ways round, same 1440x900 DPR1 window, the only difference
   * being whether the page was actually animating:
   *   fast (prefers-reduced-motion, median 17.9ms): 13 windows sampled,
   *        tier 0, no drops at all — left at full quality.
   *   slow (full motion, 43% of frames late):       tier 2, drops logged
   *        with the frame median that triggered each one.
   * Identical device signals, opposite outcomes, decided by measurement.
   *
   * HOW THE LADDER WAS ORDERED — and one correction from measurement.
   * The obvious first move was feTurbulence: procedural noise evaluated
   * per pixel instead of sampled from a buffer, so the most expensive
   * thing here per unit area. Measured, it is worth nothing on this page:
   * of 72 filter references exactly ONE resolves to a filter containing
   * feTurbulence (#s1-fWave, on .flag, a ~360x250 element). The other two
   * turbulence filters in <defs> — #s1-sk_fWave, #s1-fc_fWave — are never
   * referenced, and an unreferenced filter costs nothing. So turbulence
   * does not get a tier of its own; it is folded into tier 1, where it is
   * one extra element to strip and therefore free. It stays in because
   * WebKit is markedly worse at feTurbulence than Blink, and WebKit is the
   * engine that generated the complaint — that cost is real but is not
   * something this harness can see.
   *
   * What does pay, measured at DPR2 1680x1050 on the real GPU with an
   * identical scripted scroll, is the oversized Gaussian blurs: stripping
   * them took the median cost of producing a frame from ~27ms to ~16ms and
   * raised frame throughput by about two thirds. Hence tiers 1 and 2 are
   * both blur-area steps — a gentle one, then an aggressive one — with
   * backdrop-filter and then the particles behind them.
   */
  const DPR = Math.max(1, devicePixelRatio || 1);

  /* Measurement + debug hook, same spirit as window.__arcPerfLog.
     ?arcperf=off  pins full quality — the control arm of the A/B
     ?arcperf=N    forces tier N at once — the treatment arm
     Neither is reachable without typing it into the URL. */
  const OVERRIDE = (/[?&]arcperf=(off|[0-9])/.exec(location.search) || [])[1] || null;

  let tier = 0, immediate = false;
  const state = window.__arcPerfState = {
    dpr: DPR, weak: WEAK, keep: KEEP, override: OVERRIDE,
    fillMpx: +((innerWidth * innerHeight * DPR * DPR) / 1e6).toFixed(2),
    tier: 0, windows: 0, strikes: 0, lastMedian: 0, lateFrac: 0, pending: 0, drops: [],
  };

  /* Applying a tier is a visible change. Doing it to something the user is
     looking at is a "pop"; doing it to something off screen is free. So
     each step strips only the elements outside the viewport and queues the
     rest, retried on a cheap timer until they scroll away. Because the
     sampler almost always trips during the s1 descent — s1 owns 34 of the
     72 filter references — the summit is usually trimmed before it is ever
     on screen, which is the case that matters.
     POP_DEADLINE is the honest caveat: anything still on screen after that
     long is changed in place, and that one is visible. It has to be,
     because an element that never leaves the viewport is usually a
     full-bleed background wash, and those are exactly the expensive ones. */
  const POP_DEADLINE = 6000;
  let pending = [];
  let drain = null;

  function onScreen(el) {
    let b;
    try { b = el.getBoundingClientRect(); } catch { return false; }
    if (!b.width && !b.height) return false;      // not rendered: safe to strip
    return b.bottom > -40 && b.top < innerHeight + 40;
  }

  function stripFilter(el) {
    if (!el.hasAttribute('filter')) return false;
    el.dataset.arcFilter = el.getAttribute('filter');   // reversible, as in 3
    el.removeAttribute('filter');
    return true;
  }

  /* READ EVERYTHING, THEN WRITE EVERYTHING. This was a real bug, and a
     self-inflicted one: doing getBoundingClientRect() and removeAttribute()
     alternately inside a single loop makes the browser flush layout once
     per element, so the code meant to relieve a struggling scroll was
     itself thrashing layout 2.5 times a second during that scroll. At DPR2
     that turned a measured win into a wash, and in one rep a 33% loss.
     Batched, the whole pass costs a single layout flush. */
  function drainSoon() {
    if (drain) return;
    drain = setInterval(() => {
      const now = performance.now();
      const keep = [], go = [];
      for (const q of pending) {
        (onScreen(q.el) && now - q.at < POP_DEADLINE ? keep : go).push(q);
      }
      for (const q of go) stripFilter(q.el);
      pending = keep;
      state.pending = pending.length;
      if (!pending.length) { clearInterval(drain); drain = null; }
    }, 400);
  }

  /* A deferred element still carries its filter attribute, so the next
     tier's query finds it again and would queue it twice. */
  const queued = new WeakSet();

  function strip(els) {
    const now = performance.now();
    // read phase: every rect first, no writes in between (see drainSoon)
    const go = [], defer = [];
    for (const el of els) {
      if (!immediate && onScreen(el)) { if (!queued.has(el)) defer.push(el); }
      else go.push(el);
    }
    // write phase
    let n = 0;
    for (const el of go) if (stripFilter(el)) n++;
    for (const el of defer) { queued.add(el); pending.push({ el, at: now }); }
    state.pending = pending.length;
    if (pending.length) drainSoon();
    return n;
  }

  const refId = (el) => (/url\(#([^)]+)\)/.exec(el.getAttribute('filter') || '') || [])[1];

  /* Same mechanism as trimFilters(), but with the threshold expressed in
     the unit that actually costs money. FILTER_AREA_LIMIT above is CSS px;
     the GPU pays in DEVICE px, of which there are DPR^2 more. Dividing by
     DPR^2 means a DPR1 window gets the identical number it always got, and
     a Retina window gets a proportionally tighter one — the threshold
     moves only because the measured cost moved. */
  function blurStep(frac) {
    const lim = Math.max(20000, (innerWidth * innerHeight * frac) / (DPR * DPR));
    return strip([...document.querySelectorAll('[filter]')].filter((el) => {
      let b;
      try { b = el.getBoundingClientRect(); } catch { return false; }
      return b.width * b.height > lim;
    }));
  }

  /* Tier 1: the biggest fill for the smallest loss — but not, checked
     against screenshots, a loss of nothing. What actually goes at DPR2 is
     the soft glow on the large background washes: the ice wall's light
     columns gain visible elliptical edges where they used to melt into
     each other, and the cliff silhouette goes from softly blended to a
     crisp outline. The scene still reads correctly, it just sits flatter.
     The canvas half of this step really is close to free — a 1x backing
     store instead of a Retina one reads as very slightly softer snow. */
  function stepQuietFill() {
    const ids = new Set();
    for (const f of document.querySelectorAll('filter'))
      if (f.querySelector('feTurbulence')) ids.add(f.id);
    const turb = ids.size
      ? strip([...document.querySelectorAll('[filter]')].filter((el) => ids.has(refId(el))))
      : 0;
    shrinkCanvas();
    addEventListener('resize', shrinkCanvas, { passive: true });
    return turb + blurStep(0.12);
  }

  const stepBlurHarder = () => blurStep(0.035) + stepBackdrop();

  /* Each backdrop-filter makes the compositor read back what is behind it,
     at DPR^2 pixels. 19 of them, all on chrome rather than art: the ghost
     buttons, the small App Store badges, the s2 cards, the s6 FAQ rows and
     the moving HUD. They lose their frosting and keep their translucency. */
  function stepBackdrop() {
    document.documentElement.classList.add('arc-nobd');
    return document.querySelectorAll('.btn-ghost, .appstore-sm, .card, .faq, .gstore, .fx-hud').length;
  }

  /* The blizzard, in two steps rather than one. Going straight from the
     desktop's 0.55 of the field to none at all is a big, obvious change;
     landing first on the 0.14 a phone already gets is a much softer one,
     and measured about as much of the win. Thinned evenly across the list
     so the field stays uniform instead of leaving bald patches — same
     reasoning as thinSnow() above. A class, not remove(), so it reverses. */
  function stepThinSnow() {
    const flakes = [...document.querySelectorAll('.bz:not(.arc-bz-off)')];
    if (!flakes.length) return 0;
    /* Fraction of what is STILL STANDING that survives, so the field ends
        at the same 0.14 of the original that a weak device already gets.
        Bailing out at >= 1 matters: a device that is already at 0.14 has
        nothing left to thin, and the naive arithmetic there gives a step of
        1, which hides every remaining flake — turning this graceful step
        into the drastic one two rungs early. */
    const keepFrac = 0.14 / (KEEP || 1);
    if (!(keepFrac > 0) || keepFrac >= 1) return 0;
    const step = 1 / (1 - keepFrac);
    let acc = 0, n = 0;
    for (const f of flakes) {
      acc += 1;
      if (acc >= step) { acc -= step; f.classList.add('arc-bz-off'); n++; }
    }
    return n;
  }

  /* Last resort, because it is the most visible loss on the page.
     display:none rather than remove() so it stays reversible like
     everything else — and a display:none element runs no animations, so
     the compositor saves exactly what deleting it would have saved. */
  function stepNoSnow() {
    document.documentElement.classList.add('arc-nosnow');
    return document.querySelectorAll('.bz').length;
  }

  /* The factor sizeCanvas() actually used, which is min(2, DPR) and NOT
     DPR — it caps at 2. Dividing by DPR instead would, at the DPR3 of a
     modern phone, leave a store two thirds the size of the CSS box while
     the context draws in CSS pixels, and clip every particle. */
  const CANVAS_K = Math.min(2, DPR);

  let canvasWas = null;
  function shrinkCanvas() {
    const cv = document.getElementById('fxSnow');
    if (!cv || !cv.width || CANVAS_K <= 1) return;
    let g;
    try { g = cv.getContext('2d'); } catch { return; }
    if (!g) return;
    if (!canvasWas) canvasWas = { w: cv.width, h: cv.height };   // reversible
    const w = Math.max(1, Math.round(cv.width / CANVAS_K));
    if (w === cv.width) return;
    cv.width = w;
    cv.height = Math.max(1, Math.round(cv.height / CANVAS_K));
    /* sizeCanvas() left a scale(CANVAS_K) transform on the context to match
       the bigger store. The store is now 1:1 with CSS px, so the transform
       has to go back to identity or every particle lands off-buffer. */
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* Reversibility, demonstrable rather than asserted. Paste
     __arcPerfRestore() into the console and the page is back to full
     quality: filters come back out of data-arc-filter — the same stash
     section 3 has always written — the two tier classes come off, and the
     canvas gets its Retina backing store back. Returns the filter count. */
  window.__arcPerfRestore = () => {
    let n = 0;
    for (const el of document.querySelectorAll('[data-arc-filter]')) {
      el.setAttribute('filter', el.dataset.arcFilter);
      delete el.dataset.arcFilter;
      n++;
    }
    document.documentElement.classList.remove('arc-nobd', 'arc-nosnow');
    for (const f of document.querySelectorAll('.bz.arc-bz-off')) f.classList.remove('arc-bz-off');
    const cv = document.getElementById('fxSnow');
    if (cv && canvasWas) {
      try {
        cv.width = canvasWas.w;
        cv.height = canvasWas.h;
        cv.getContext('2d').setTransform(CANVAS_K, 0, 0, CANVAS_K, 0, 0);
      } catch { /* nothing to put back */ }
      canvasWas = null;
    }
    removeEventListener('resize', shrinkCanvas);
    pending = [];
    tier = 0;
    state.tier = 0;
    state.pending = 0;
    state.drops.length = 0;
    return n;
  };

  /* Ordered by measured payoff per unit of visible loss, cheapest-looking
     first, so a machine that only needs one step gives up almost nothing. */
  const LADDER = [
    ['quiet-fill', stepQuietFill],     // big blurs + turbulence + 1x canvas
    ['blur-harder', stepBlurHarder],   // smaller blurs + backdrop-filter
    ['thin-snow', stepThinSnow],       // blizzard down to phone density
    ['no-snow', stepNoSnow],           // blizzard off
  ];

  function stepDown(why) {
    if (tier >= LADDER.length) return false;
    const entry = LADDER[tier];
    tier++;
    let n = 0;
    try { n = entry[1](); } catch (e) { n = -1; }   // a broken step must not
    state.tier = tier;                             // stall the whole ladder
    state.drops.push({ tier, name: entry[0], hit: n, medianMs: +why.toFixed(1) });
    if (window.__arcPerfLog)
      console.log('[perf] tier', tier, entry[0], 'hit', n, 'at', why.toFixed(1) + 'ms/frame');
    return true;
  }

  const WIN = 20;        // frames per verdict, about a third of a second

  /* WHY THE TEST IS "HOW MANY FRAMES WERE LATE", NOT "WHAT WAS THE MEDIAN".
     The first version of this gated on the window median being over 28ms
     and it under-fired badly. Measured on this page, the frame
     distribution is bimodal rather than centred: with vsync on, roughly
     half the frames come in on one 16.7ms vsync and half take two or more.
     A 1440x900 DPR1 window with 42.9% of its frames late still had a
     median of 17.9ms, sitting comfortably under the threshold, so the
     ladder stalled two rungs short of the step that actually pays.
     Counting late frames measures the thing a person actually perceives —
     stutter — and it keeps the fast-machine guarantee exactly: a machine
     holding 60fps has NO frames over one vsync, so this can never fire on
     it, whatever its pixel ratio. */
  const OVER_MS = 20;    // one 60Hz vsync, plus a little jitter
  const JANK = 0.35;     // fraction of a window late before it counts at all
  const SLOW_MS = 28;    // kept as the severity reading that gets logged
  const STRIKES = 2;     // consecutive slow windows before acting, so one
                         // hiccup, one GC pause or one alt-tab can never
                         // degrade a machine that is actually fine
  /* PROPORTIONAL RESPONSE, and why it is not just "two strikes" everywhere.
     Two strikes per rung means reaching the bottom of the ladder costs
     eight slow windows, which is longer than one scroll through the page.
     Measured consequence: the auto path stalled at tier 2 and gained
     nothing (+1.7% at DPR2), while the very same page forced to tier 4 was
     17% faster with a third fewer dropped frames. So a merely mediocre
     window still earns one rung on the second strike, but a single
     catastrophic window earns one immediately and a really catastrophic
     one earns two. A machine holding 60fps is unaffected by any of this:
     with vsync its frame intervals are 16.7ms, so a 20-frame median is
     16.7 and never crosses SLOW_MS at all. */
  const SEVERE_MS = 45;  // worse than ~22fps: act on the first window
  const GRACE = 1400;    // ignore load jank
  const OUTLIER = 400;   // a gap that long is not a slow frame: tab switch,
                         // devtools breakpoint, laptop lid. Not the page's.

  function watch() {
    if (OVERRIDE === 'off') return;
    const t0 = performance.now();
    let ring = [], strikes = 0, last = -1;

    const tick = (now) => {
      const prev = last;
      last = now;
      if (tier >= LADDER.length) return;     // nothing left to drop: stop
      /* Stays armed while a tier remains, rather than timing out, because
         the expensive scenes are several screens down and a visitor may
         take a minute to reach them. The page already runs a per-frame
         camera rAF, so this adds no wakeups — only a subtraction and a
         push onto a 20-slot ring. */
      requestAnimationFrame(tick);
      /* mobile/static.js freezes the phone into an ordinary scroll with
         nothing animating: no frame cost to read and nothing useful to do.
         Checked per frame rather than at load because the injection order
         of the two files is deliberately not relied on. */
      if (window.__arc76Static) { ring = []; return; }
      if (prev < 0 || now - t0 < GRACE) return;
      const d = now - prev;
      if (d > OUTLIER) { ring = []; return; }
      ring.push(d);
      if (ring.length < WIN) return;
      const m = median(ring);
      let late = 0;
      for (const d of ring) if (d > OVER_MS) late++;
      const frac = late / ring.length;
      ring = [];
      state.windows++;
      state.lastMedian = +m.toFixed(1);
      state.lateFrac = +frac.toFixed(2);
      if (frac > JANK) {
        strikes++;
        /* One rung on the second consecutive janky window; one immediately
           if this single window was severe; two if almost every frame in it
           was late, because that is a machine in real trouble and stepping
           one rung at a time wastes the scroll it is trying to save. */
        let steps = strikes >= STRIKES ? 1 : 0;
        if (m > SEVERE_MS || frac > 0.7) steps = Math.max(steps, 1);
        if (frac > 0.9) steps = 2;
        if (steps) {
          strikes = 0;
          while (steps-- > 0 && stepDown(m)) { /* down the ladder */ }
        }
      } else {
        strikes = 0;
      }
      state.strikes = strikes;
    };
    requestAnimationFrame(tick);
  }

  let started = false;
  function run() {
    const a = observeScenes(), b = thinSnow(), c = trimFilters();
    const ready = a && b && c;
    if (ready && !started) {
      started = true;
      if (OVERRIDE && OVERRIDE !== 'off') {
        /* Measurement arm: apply the tier with no deferral and leave the
           sampler off, so the arm reports that tier and only that tier
           instead of quietly escalating part-way through a run. */
        immediate = true;
        while (tier < +OVERRIDE && stepDown(0)) { /* forced */ }
        immediate = false;
      } else {
        watch();                             // no-ops on ?arcperf=off
      }
    }
    return ready;
  }

  if (!run()) {
    // the scenes are built by the page's own script; retry briefly
    let n = 0;
    const t = setInterval(() => { if (run() || ++n > 40) clearInterval(t); }, 100);
  }
})();
