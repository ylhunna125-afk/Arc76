/* Arc76 scroll fix — injected by dev.mjs / bake.mjs at serve time.
 *
 * Lives outside index.html on purpose. Every export from the design tool
 * replaces index.html wholesale, so anything patched into that file is
 * gone the next time you hit download. This is applied to the response,
 * not to the file, so it survives every export.
 *
 * Three problems it solves:
 *
 * 1. DEAD SCROLL. s1 is authored long but its descent animation finishes
 *    at DESCENT_VH screens. Everything after that is scrolling with
 *    nothing happening. dev.mjs/bake.mjs shorten s1 and the descent in
 *    the served HTML; this file handles the snap.
 *
 * 2. NO COMMIT. Stopping between two scenes left you stranded looking at
 *    a half-played camera move. One scroll gesture now commits to the
 *    next scene and holds there until you ask for another.
 *
 * 3. CLICKS DEAD BETWEEN SCENES. See "THE INVISIBLE SCENE ON TOP" below.
 *    This was two bugs wearing one coat, and neither was the CSS.
 *
 * CSS scroll-snap is the wrong tool here. `mandatory` fights the scrubbed
 * descent, yanking the camera while you are still driving it, and
 * `proximity` behaves inconsistently on a page built from sticky pins.
 * It also cannot express the one rule that matters below: the snap point
 * for a scene is the END of its camera move, not the start.
 *
 *
 * WHERE A SCENE ACTUALLY RESTS  (this was the main bug)
 * ----------------------------------------------------
 * index.html lays each scene out as `.wrap#sN` with `data-t` = the number
 * of screen-heights of scroll that its camera move consumes. Its
 * `stateAt()` reads:
 *
 *     i = the last section whose offsetTop is above you
 *     e = (scrollY - sN.offsetTop) / (data-t * vh)      // 0..1
 *
 * and while `e < 1` it plays MOVES[i], which shows scene i-1 AND scene i
 * at once. So `sN.offsetTop` is not "scene N" — it is e=0, the first
 * frame of the move INTO scene N, where what you are actually looking at
 * is scene N-1. Scene N is at rest only from `offsetTop + data-t*vh`
 * onwards.
 *
 * This file used to snap to `offsetTop`. Measured: a small downward nudge
 * near s5 landed at exactly 7155 = s5.offsetTop = e=0.000, i.e. parked on
 * the first frame of the cache->route move, looking at scene 4 with the
 * route scene invisible on top of it. That is the "not fully on the page"
 * the brief describes, and it was this file putting you there.
 *
 * index.html's own chapter links already had it right —
 * `target()` returns `offsetTop + data-t*vh`. The two disagreed. They
 * agree now.
 *
 *
 * THE INVISIBLE SCENE ON TOP  (why clicks died)
 * ---------------------------------------------
 * Landing on a rest plateau fixes the common case, but the underlying
 * hazard is worth killing outright, because any mid-move pause hits it —
 * a scrollbar drag, a resize, momentum leaking out of the descent.
 *
 * While `e < 1`, renderMoves() gives BOTH pins `.on`. The CSS is
 * `.pin{pointer-events:auto}` and `.pin.on{visibility:visible}`, and the
 * two pins are `position:fixed` over the same rect. MOVES 4 and 5
 * cross-fade with `opacity`, and an element at `opacity:0` is still fully
 * hit-testable — opacity is not visibility. Sections carry rising
 * z-index (s1:10 ... s6:60), so the INCOMING, INVISIBLE scene sits on top
 * of the one you can see and eats every click.
 *
 * Measured at s5.offsetTop, on the visible scene-4 CTA "Earn your first
 * crate" (its own computed opacity 1, its pin's opacity 1):
 *     document.elementFromPoint(212,502)  ->  DIV.rt-ms  in s5
 *     a real dispatched click             ->  DIV.rt-ms  in s5
 * Scene 5's route panel, at opacity 0, three sections wide at scale(3.2),
 * swallowing the click. Six of scene 4's six on-screen controls were
 * unreachable; at rest, all six work.
 *
 * So `guardPins()` below keeps exactly the scene(s) you can actually SEE
 * interactive and makes the faded ones inert. It is driven by a
 * MutationObserver on the pins rather than a rAF, because the engine
 * writes inline transform/opacity to the pins on every frame of a move
 * and on no frame at rest — so the observer costs nothing while the page
 * is still, which is most of the time and the whole point of perf.js.
 *
 * `inert` as well as `pointer-events:none`: a couple of descendants set
 * `pointer-events:auto` explicitly (`#s4 .cache.open .reward`,
 * `#s5 .drawn .final`), and pointer-events is not a barrier — a
 * descendant that re-enables it is hit-testable through a `none`
 * ancestor. `inert` cannot be overridden from inside.
 *
 *
 * WHY THE WHEEL IS INTERCEPTED, AND HOW MOMENTUM IS HANDLED
 * ---------------------------------------------------------
 * The ask was commitment at the START of a gesture. That cannot be done
 * from a passive listener: a trackpad keeps firing for up to ~1.5s after
 * the finger lifts, and that tail will happily push you straight back off
 * whatever you just glided to. Animating scrollTop against live momentum
 * is a fight you lose every other frame.
 *
 * So the wheel listener is non-passive and the gesture is absorbed:
 *
 *   - A gesture is "fresh" only after >GESTURE_GAP ms of wheel silence.
 *     A momentum tail is a continuous stream with no such gap, so it can
 *     never open a new gesture, however long it runs. A second real
 *     flick always follows a pause, so it can — two flicks, two scenes.
 *   - A fresh gesture commits as soon as it has THRESH px of intent
 *     (one wheel notch, or two or three trackpad frames).
 *   - From commit until the glide has landed and the engine's smoothing
 *     has caught up, every wheel event is swallowed. The tail dies
 *     against the lock instead of against the animation.
 *   - A finger still physically dragging after the lock lifts is not a
 *     tail and should still move: a non-fresh stream advances once it has
 *     pushed SUSTAIN px, which a dying tail never reaches.
 *
 * The descent is exempt from all of it — no interception, no snapping,
 * scrollY is yours (see `inDescent`). It is the intro camera move and it
 * has to stay scrubbable frame by frame.
 *
 * `wheel` no longer cancels an in-flight snap — it is what asked for the
 * snap, and cancelling on it would hand the page straight back to the
 * momentum tail we are trying to absorb. `touchstart`/`pointerdown` no
 * longer cancel either, so a click on a CTA mid-glide cannot strand you
 * mid-move. The escape hatch is better than event sniffing: the glide
 * watches the scroll position it wrote last frame, and if anything else
 * has moved the page (scrollbar drag, find-in-page, an anchor jump, an
 * extension) it stands down immediately.
 */
(() => {
  'use strict';
  if (window.__arc76Snap) return;          // safe to load twice
  window.__arc76Snap = true;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const s1 = document.getElementById('s1');
  const wraps = [...document.querySelectorAll('.wrap')];
  if (!s1 || wraps.length < 2) return;
  const pins = wraps.map((w) => w.querySelector('.pin')).filter(Boolean);

  // must match the value dev.mjs / bake.mjs rewrites into the page
  const DESCENT_VH = +(document.documentElement.dataset.descentVh || 1.6);

  const GESTURE_GAP = 110;   // ms of wheel silence that starts a new gesture
  const FRESH_MIN = 2.5;     // px: a new gesture opens with a real shove, not a dying tail
  const FRESH_WINDOW = 240;  // ms a fresh gesture keeps its hair trigger
  const THRESH = 22;         // px of a fresh gesture before it commits
  const SUSTAIN = 240;       // px a still-dragging finger needs to advance again
  const SETTLE = 240;        // ms held after a glide, for the engine's lerp to catch up
  const IDLE = 140;          // ms of stillness before the backstop tidies a stranded pause

  /* mobile/static.js collapses the sections into normal flow on a phone:
     there are no section boundaries left to commit to, and every target
     computed below is stale by a screen or more. Read lazily rather than
     as an early return at load, so this file does not care whether it was
     injected before or after static.js — index.html on disk can already
     carry a scroll-fix tag from a previous `bake.mjs --in-place`, which
     pins the injection order. */
  const isStatic = () => !!window.__arc76Static;

  /* ---------- 1. keep only the scene you can see clickable ---------- */

  let applying = false;
  const inertOK = 'inert' in HTMLElement.prototype;

  function setLive(p, live) {
    if (live) {
      if (p.style.pointerEvents) p.style.pointerEvents = '';
      if (inertOK && p.inert) p.inert = false;
    } else {
      if (p.style.pointerEvents !== 'none') p.style.pointerEvents = 'none';
      if (inertOK && !p.inert) p.inert = true;
    }
  }

  function guardPins() {
    if (applying) return;
    applying = true;
    try {
      if (isStatic()) { pins.forEach((p) => setLive(p, true)); return; }
      /* The engine writes inline opacity on the pins only while a move is
         playing, and clears it at rest — so "" means 1. A pin without
         .on is visibility:hidden and cannot be hit anyway. */
      let max = -1;
      const op = pins.map((p) => {
        if (!p.classList.contains('on')) return -1;
        const v = p.style.opacity === '' ? 1 : parseFloat(p.style.opacity);
        const o = isNaN(v) ? 1 : v;
        if (o > max) max = o;
        return o;
      });
      /* Interactive iff this pin is (level with) the most visible one on
         screen. Both pins sit at opacity 1 through MOVES 1-3, which slide
         them apart rather than cross-fading, so both stay live there and
         nothing changes for those moves — measured: no blocked controls
         at any point in them. */
      pins.forEach((p, j) => setLive(p, op[j] > 0.02 && op[j] >= max - 0.02));
    } finally { applying = false; }
  }

  if (pins.length) {
    const mo = new MutationObserver(guardPins);
    pins.forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ['style', 'class'] }));
    guardPins();
    /* Crossing into or out of static.js's phone range changes the answer
       without necessarily touching a pin, so the observer would not fire.
       (static.js's freeze() does touch them, but relying on that couples
       this file to its internals.) */
    addEventListener('resize', guardPins, { passive: true });
  }

  if (reduced) return;   // no snapping, but the pointer guard above still runs

  /* ---------- 2. where the scenes rest ---------- */

  /* Same expression as index.html's own target(): the END of each camera
     move. `extra` is mobile/mobile.js handing us the pages of its paged
     scenes. Recomputed per call so a resize needs no invalidation. */
  const targets = () => {
    const vh = innerHeight;
    const extra = typeof window.__arcSnapExtra === 'function' ? window.__arcSnapExtra() : [];
    return [s1.offsetTop + DESCENT_VH * vh]                                   // the camp
      .concat(wraps.slice(1).map((w) => w.offsetTop + parseFloat(w.dataset.t || 0) * vh))
      .concat(extra)
      .sort((a, b) => a - b);
  };

  const descentEnd = () => s1.offsetTop + DESCENT_VH * innerHeight;
  // still driving the intro camera: hands off completely
  const inDescent = () => scrollY < descentEnd() - 4;

  const maxY = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);

  function nextTarget(dir) {
    const T = targets(), y = scrollY;
    if (dir > 0) { for (const t of T) if (t > y + 8) return t; return null; }
    for (let k = T.length - 1; k >= 0; k--) if (T[k] < y - 8) return T[k];
    return null;
  }

  /* are we parked partway through a camera move? */
  function stranded() {
    const vh = innerHeight;
    for (let i = wraps.length - 1; i >= 1; i--) {
      const top = wraps[i].offsetTop;
      if (scrollY >= top) {
        const span = parseFloat(wraps[i].dataset.t || 0) * vh;
        const e = span > 0 ? (scrollY - top) / span : 1;
        return e > 0.002 && e < 0.998;
      }
    }
    return false;
  }

  /* ---------- 3. the glide ---------- */

  let raf = null, gliding = false, wrote = -1, lockUntil = 0;

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function stopGlide() {
    if (raf) cancelAnimationFrame(raf);
    raf = null; gliding = false; wrote = -1;
  }

  function glide(y) {
    const from = scrollY, dist = y - from;
    if (Math.abs(dist) < 2) { lockUntil = performance.now() + SETTLE; return; }
    /* Long enough that the camera move it is scrubbing reads as a camera
       move rather than a jump cut, short enough not to feel like the page
       stopped answering. */
    const dur = Math.min(760, 220 + Math.abs(dist) * 0.36);
    const t0 = performance.now();
    stopGlide();
    gliding = true;
    wrote = from;
    lockUntil = t0 + dur + SETTLE;
    const step = (now) => {
      /* Something other than us moved the page — a scrollbar drag,
         find-in-page, an anchor jump. Stand down rather than fight it. */
      const drift = Math.abs(scrollY - wrote);
      if (drift > 12 && scrollY > 0 && scrollY < maxY() - 1) { stopGlide(); lockUntil = 0; return; }
      const t = Math.min(1, (now - t0) / dur);
      wrote = from + dist * easeInOut(t);
      scrollTo(0, wrote);
      if (t < 1) { raf = requestAnimationFrame(step); return; }
      raf = null; gliding = false; wrote = -1;
      lockUntil = performance.now() + SETTLE;
    };
    raf = requestAnimationFrame(step);
  }

  function commit(dir) {
    const t = nextTarget(dir);
    if (t == null) return false;
    glide(t);
    return true;
  }

  /* ---------- 4. the wheel: commit at the start of the gesture ---------- */

  let lastWheel = 0, acc = 0, fresh = false, freshAt = 0;

  /* deltaY is only in pixels when deltaMode is 0. Firefox has shipped
     DOM_DELTA_LINE (deltaY ~3) on desktop, where a pixel threshold of 22
     would never be reached and the page would stop snapping entirely. */
  const px = (ev) => (ev.deltaMode === 1 ? ev.deltaY * 16
    : ev.deltaMode === 2 ? ev.deltaY * innerHeight : ev.deltaY);

  addEventListener('wheel', (ev) => {
    if (isStatic()) return;
    if (ev.ctrlKey) return;                      // pinch-zoom, not a scroll

    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;
    const dy = px(ev);
    /* A real second flick always follows a pause; a momentum tail never
       contains one. This is what keeps the tail from double-skipping, and
       it holds however long the tail runs.
       Two qualifiers, both needed — measured against a 60-event 1.6s tail
       that outlives the lock and did double-skip without them:
         - a gesture opens on a real shove, not on the sub-pixel last
           breaths of a tail, so one throttled timer inside a tail cannot
           pass for a new flick;
         - and the hair trigger expires, because a fresh gesture commits
           within a frame or two. After that it takes SUSTAIN px, which a
           dying tail never delivers. */
    if (gap > GESTURE_GAP) {
      acc = 0;
      fresh = Math.abs(dy) >= FRESH_MIN;
      freshAt = now;
    }

    if (now < lockUntil || gliding) { acc = 0; ev.preventDefault(); return; }

    if (inDescent()) { acc = 0; return; }        // scrub it, hands off

    const dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    if (!dir) return;
    /* Nothing to commit to this way (top of the camp heading up, bottom
       of the page heading down): let the browser scroll normally, so a
       wrong target can never leave the page stuck. */
    if (nextTarget(dir) == null) { acc = 0; return; }

    ev.preventDefault();
    acc += dy;
    const armed = fresh && now - freshAt < FRESH_WINDOW;
    if (Math.abs(acc) >= (armed ? THRESH : SUSTAIN)) {
      acc = 0; fresh = false;
      commit(dir);
    }
  }, { passive: false });

  /* ---------- 5. keys ---------- */

  const STEP_KEYS = { PageDown: 1, PageUp: -1, ArrowDown: 1, ArrowUp: -1, ' ': 1, Spacebar: 1 };

  addEventListener('keydown', (ev) => {
    if (isStatic()) return;
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    if (ev.key === 'Home' || ev.key === 'End') { stopGlide(); lockUntil = 0; return; }  // let them run

    let dir = STEP_KEYS[ev.key];
    if (dir === undefined) return;
    if (ev.key === ' ' || ev.key === 'Spacebar') dir = ev.shiftKey ? -1 : 1;

    if (inDescent()) return;                     // arrow/page keys scrub the descent
    if (performance.now() < lockUntil || gliding) { ev.preventDefault(); return; }
    if (nextTarget(dir) == null) return;
    ev.preventDefault();
    commit(dir);
  });

  /* ---------- 6. backstop ---------- */

  /* Everything above only sees the wheel and the keys. A scrollbar drag,
     a resize, or momentum leaking out of the descent can still park you
     partway through a camera move. If that happens and input stops,
     finish the move the way you were going. Never inside the descent. */
  let timer = null, lastY = scrollY, dir = 1;

  function backstop() {
    if (isStatic() || gliding || performance.now() < lockUntil) return;
    if (inDescent()) return;
    if (!stranded()) return;
    const t = nextTarget(dir) ?? nextTarget(-dir);
    if (t != null) glide(t);
  }

  addEventListener('scroll', () => {
    if (gliding) { lastY = scrollY; return; }
    if (scrollY !== lastY) { dir = scrollY > lastY ? 1 : -1; lastY = scrollY; }
    clearTimeout(timer);
    timer = setTimeout(backstop, IDLE);
  }, { passive: true });

  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(backstop, IDLE * 3);
  }, { passive: true });
})();
