/* Arc76 — static phone mode. Pairs with mobile/static.css.
 *
 * Injected alongside scroll-fix.js and perf.js (bake.mjs/dev.mjs). Kept
 * out of index.html because every design-tool export replaces that file
 * wholesale.
 *
 * WHAT IT IS FOR
 * The brief was "same content as the main but without any scroll
 * animations". Desktop is a scroll-driven camera: six pinned sections and
 * a permanent rAF loop that reads scrollY and redraws the scene every
 * frame. This turns that off on a portrait phone and leaves an ordinary
 * vertical scroll — art still there, copy still there, nothing moving.
 *
 * IT BUILDS ON mobile.js, IT DOES NOT REPLACE IT
 * Replacing it was the obvious route and it is the wrong one. mobile.js
 * does two separable jobs: it scales each 1440x900 scene to fill the
 * phone and slides it sideways onto the part that matters (both one-off
 * constants per scene, computed once in layout() — not animation), and it
 * tags elements so mobile.css can re-lay ~200 lines of phone copy.
 * Scaling to fit WIDTH instead would put the art in a 244px letterbox
 * band, so that work is not optional and not replaceable cheaply.
 * Throwing it away means rebuilding the whole phone layout to remove
 * animation it was not causing. So html.m stays, and the only parts of
 * mobile.js switched off here are its two per-frame rAF loops (see the
 * __arc76Static checks in mobile.js).
 *
 * HOW THE LOOP IS KILLED, AND WHY THIS WAY
 * tick() is `requestAnimationFrame(tick)` at the top of its own body and
 * nothing exports the handle, so it cannot be cancelled. What is reliable
 * is the shape of the export: the engine is a classic (non-module) inline
 * script whose top-level `function` declarations therefore become
 * writable properties of window, and tick()'s own
 * `requestAnimationFrame(tick)` re-resolves that global binding every
 * frame. So assigning window.tick kills the loop on the next frame, and
 * replacing the four functions it calls means the frame already in flight
 * cannot un-freeze anything on its way out. Both are done.
 *
 * Considered and rejected: brute-forcing cancelAnimationFrame over a
 * range of handle ids (kills the other modules' loops too, and tick()
 * re-arms anyway), and fighting the loop with !important only (works for
 * the CSS variables but not for the inline transform/filter/opacity the
 * camera moves write onto .pin, and leaves full per-frame work running
 * forever, which is half the point of the ask).
 *
 * This depends on five function NAMES and nothing about internal
 * variables, declaration order or tuning constants — so a retuned export
 * cannot quietly break it. Every step is typeof-guarded, so a rename
 * degrades to "the loop keeps running", and static.css repeats the frozen
 * descent values as !important declarations so the art still will not
 * move even then. The overrides are guarded rather than destructive so
 * that a window leaving phone range hands the engine back working.
 *
 * CONTENT THAT ONLY EXISTS AT SOME SCROLL PROGRESS
 * This was the real risk — a static page that silently drops half the
 * copy. Four places, all audited and all handled:
 *   1. #s1's hero fades out as the camera descends (--heroO), and the
 *      camp copy fades in (--campO). Both are content, and they are
 *      never both on screen on desktop. The camp is where the art rests,
 *      so the hero is lifted out into a flow block above the panel.
 *   2. mobile.js pages #s4/#s5/#s6 (--pg 0->1). Page two is lifted out
 *      into a flow block; static.css forces both pages opaque.
 *   3. base.js drove #s6's --bc-in from stateAt(sy) in its own rAF loop,
 *      so the whole base-camp block — copy, App Store button and footer —
 *      read opacity 0 until the route->base move was 72% done. Pinned to
 *      1 in base.js.
 *   4. route.js only added .drawn (which draws the route line) once
 *      stateAt(sy).i === 4 && e > .85. With the sections collapsed that
 *      is never true, so the map rendered blank. Drawn immediately in
 *      route.js.
 */
(() => {
  'use strict';
  if (window.__arc76StaticInit) return;
  window.__arc76StaticInit = true;

  /* Must match mobile.js's test exactly. If the two ever disagree you get
     mobile.css's phone layout driven by the desktop scroll engine, or the
     reverse — both look broken in ways that are hard to attribute. */
  const phone = () => innerWidth <= 820 && innerHeight > innerWidth * 1.15;

  const root = document.documentElement;
  let ON = false;

  /* The engine functions this file replaces. Captured once, before
     anything is overwritten, so exit() can put the real ones back. */
  const real = {};
  for (const k of ['tick', 'updateDescent', 'renderMoves', 'drawSnow', 'updateNav', 'target']) {
    if (typeof window[k] === 'function') real[k] = window[k];
  }

  /* ---- 1. re-emit the export's own prefers-reduced-motion rules ----
   * Blanket `animation: none` is not enough on its own: plenty of these
   * elements animate in FROM opacity 0 or a translated start with a
   * filled `both`, so killing the animation leaves them invisible or
   * displaced rather than still. The export already ships the correct
   * static state for every one of them — twelve
   * @media (prefers-reduced-motion: reduce) blocks in index.html plus
   * four more across crate/route/base. Rather than copy those values
   * here, where the next export would silently make them stale, they are
   * read back out of the CSSOM at runtime and re-emitted scoped to
   * html.m-static, which both raises their specificity by one class and
   * puts them last in the cascade.
   */
  function adoptReducedMotion() {
    if (document.getElementById('arc76-static-rm')) return;
    const out = [];
    const prefix = (sel) => 'html.m-static ' + sel.split(',').map((s) => s.trim()).join(', html.m-static ');
    const walk = (rules) => {
      for (const r of rules) {
        const media = r.media && r.media.mediaText;
        if (media && /prefers-reduced-motion/.test(media)) {
          for (const inner of r.cssRules || []) {
            if (inner.selectorText) out.push(prefix(inner.selectorText) + '{' + inner.style.cssText + '}');
          }
        } else if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin (the QR lib's CDN)
      if (rules) walk(rules);
    }
    if (!out.length) return;
    const st = document.createElement('style');
    st.id = 'arc76-static-rm';
    st.textContent = out.join('\n');
    document.head.appendChild(st);
    if (window.__arcPerfLog) console.log('[static] reduced-motion rules adopted', out.length);
  }

  /* ---- 2. lift the scroll-revealed copy out into normal flow ----
   * Each block moves into a plain div that stays a child of its own
   * .wrap. Staying inside the section is deliberate: mobile.css styles
   * these by `html.m #s4 .crx-pool` and friends, and moving them to the
   * body would drop all of it and mean restyling from scratch. None of
   * the three scene modules measures or repositions these nodes, so
   * moving them cannot desync the scenes — checked: crate.js only emits
   * .crx-pool as markup, route.js positions .rt-ms inside the map but
   * never .rt-copy, base.js never touches .bc-faq/.bc-foot after build().
   *
   * s5's planner goes ABOVE its map because the headline and the task
   * picker are what the map is a picture of; reading the map first is
   * backwards. Everything else reads art-then-copy.
   */
  const RELOC = [
    ['s1', 'before', ['.hero:not(.scrollcue)']],   // the opening headline + App Store button
    /* The camp copy has to come out too, not just be forced opaque.
       Desktop puts it at canvas x=84 and the phone fan at x=740 — side by
       side. The phone strip only shows ~560 canvas px, so mobile.css
       re-lays the copy across the full strip, which parks it directly
       under the fan; and the fan is later in the DOM, so it paints on
       top. Screenshotted: the headline "Your apps stay locked until it's
       done." was completely hidden behind the phone screenshots. */
    ['s1', 'after', ['.campcopy']],
    ['s4', 'after', ['.crx-pool']],                // "Inside every crate", the four tiers
    ['s5', 'before', ['.rt-copy']],                // the 60-day planner, above the map it plans
    ['s6', 'after', ['.bc-faq', '.bc-foot']],      // questions, then the footer
  ];
  const homes = new Map();   // node -> [parent, nextSibling], so exit() can undo it

  function relocate() {
    for (const [id, where, sels] of RELOC) {
      const wrap = document.getElementById(id);
      if (!wrap) continue;
      for (const sel of sels) {
        const el = wrap.querySelector(sel);
        if (!el || el.closest('.m-st-flow')) continue;
        let box = wrap.querySelector(':scope > .m-st-flow[data-where="' + where + '"]');
        if (!box) {
          box = document.createElement('div');
          box.className = 'm-st-flow';
          box.dataset.where = where;
          const pin = wrap.querySelector(':scope > .pin');
          if (where === 'before' && pin) wrap.insertBefore(box, pin);
          else wrap.appendChild(box);
        }
        homes.set(el, [el.parentNode, el.nextSibling]);
        box.appendChild(el);
      }
    }
  }

  function unrelocate() {
    for (const [el, [parent, next]] of homes) {
      if (parent) parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    }
    homes.clear();
    document.querySelectorAll('.m-st-flow').forEach((b) => b.remove());
  }

  /* ---- 3. freeze every scene at its rest state ---- */
  function freeze() {
    /* Clear the transition FX layer with the engine's own function while
       it is still the real one, so nothing is left mid-move. */
    if (typeof clearFx === 'function') { try { clearFx(); } catch (e) { /* ignore */ } }

    /* The descent, at the high camp. updateDescent clamps its own
       progress, so any y past the end lands on cam = 2700 exactly — no
       need to know DESCENT_VH or s1.offsetTop, both of which the export
       retunes (2.2 -> 1.6 -> 1.4 so far). */
    if (real.updateDescent) { try { real.updateDescent(1e9); } catch (e) { /* static.css covers it */ } }
    /* The two dataset flags that gate the camp art and the phone fan.
       updateDescent sets them, but a stylesheet cannot, so they are
       written explicitly for the case where the call above failed. */
    const st = document.querySelector('#s1 [data-stage]');
    if (st) { st.dataset.camp = '1'; st.dataset.s1 = 'off'; }
    const alt = document.querySelector('#s1 [data-alt]'), lbl = document.querySelector('#s1 [data-lbl]');
    if (alt && !alt.textContent.trim()) alt.textContent = (7420).toLocaleString('en-US');
    if (lbl && !/CAMP/.test(lbl.textContent)) lbl.textContent = 'HIGH CAMP';

    /* Every pin visible and un-paused. The engine only ever marked the
       current one .on, and .on is also what gates each scene's
       componentDidMount, so going through showPin rather than setting the
       class directly is what actually starts the interactive scenes. */
    const pins = [...document.querySelectorAll('.wrap > .pin')];
    pins.forEach((p, i) => {
      /* showPin() early-returns when the class already matches, so on the
         retry passes it would skip the mount for a scene that only just
         became buildable. Drop the class first so it always takes the
         branch; synchronous, so nothing paints in between. */
      p.classList.remove('on');
      if (typeof showPin === 'function') { try { showPin(i, true); } catch (e) { /* fall through */ } }
      p.classList.add('on');
      p.classList.remove('paused');
      p.style.transform = ''; p.style.filter = ''; p.style.opacity = '';
    });

    /* Two of the export's scene components (the ice-wall climber and the
       walker in the feed scene) run their own permanent rAF loop via
       kick(), independent of the scroll engine. They were 120 rAF/s and
       ~46ms of script per second still burning at rest after the main
       loop was dead — and they are exactly the "per-frame animation" the
       brief asks to remove.
       They are stopped at a FIXED pose rather than wherever the cancel
       happens to land: frame() takes an absolute time in seconds, so
       calling it once at POSE_T is deterministic and gives the same
       picture on every load, instead of a climber frozen mid-reach at
       whatever moment the tab finished booting. 6s was picked by
       screenshot — far enough in that the rig is in its settled stride.
       `mounted` is a top-level const in the export's classic script, so
       it is reachable as a free identifier but not as a window property;
       same reason the lastY assignment in exit() is a bare one. */
    const POSE_T = 6;
    try {
      /* eslint-disable-next-line no-undef */
      const insts = mounted;
      for (const sid in insts) {
        const inst = insts[sid];
        if (!inst) continue;
        if (inst.raf) { cancelAnimationFrame(inst.raf); inst.raf = 0; }
        if (typeof inst.kick === 'function') inst.kick = () => {};
        if (typeof inst.frame === 'function') { try { inst.frame(POSE_T); } catch (e) { /* leave the pose alone */ } }
      }
    } catch (e) { /* no `mounted` in this export: the loops keep running */ }

    const cue = document.getElementById('fxCue');
    if (cue) cue.classList.remove('show');
    const snow = document.getElementById('fxSnow');
    if (snow) { const g = snow.getContext && snow.getContext('2d'); if (g) g.clearRect(0, 0, snow.width, snow.height); }
  }

  /* ---- 4. the chapter links ----
   * target() computed offsets from the tall layout: the camp sat
   * DESCENT_VH * 0.86 screens into #s1, and each later scene at its own
   * offsetTop plus data-t screens of camera move. Both are meaningless
   * now. In flow the answer is just where the thing is on the page. The
   * click handler resolves target() as a global on every click, so
   * replacing it is enough — nothing needs re-binding.
   */
  function staticTarget(key) {
    /* The gnav is fixed over the page, so landing on a section's exact
       top puts its first line under the bar. scroll-margin-top does not
       help here — the site scrolls with scrollTo(), not an anchor. */
    const nav = document.querySelector('.gnav');
    const pad = nav ? Math.round(nav.getBoundingClientRect().height) + 12 : 76;
    const y = (el) => (el ? Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY) - pad) : 0);
    const s1 = document.getElementById('s1');
    if (key === 'summit') return 0;
    if (key === 'camp') return y(s1 && s1.querySelector('.pin'));   // the camp IS s1's art panel
    const w = [...document.querySelectorAll('.wrap')].find((x) => x.dataset.key === key);
    return w ? y(w) : 0;
  }

  /* ---- 5. install the overrides ----
   * Guarded, not destructive: each keeps calling the real function when
   * static mode is off, so a window leaving phone range hands the scroll
   * engine back working. window.tick is the one that actually stops the
   * loop; the other four stop the in-flight frame doing damage.
   */
  if (real.tick) window.tick = function (...a) { if (!ON) return real.tick.apply(this, a); };
  if (real.updateDescent) window.updateDescent = function (...a) { if (!ON) return real.updateDescent.apply(this, a); };
  if (real.renderMoves) window.renderMoves = function (...a) { if (!ON) return real.renderMoves.apply(this, a); };
  if (real.drawSnow) window.drawSnow = function (...a) { if (!ON) return real.drawSnow.apply(this, a); };
  if (real.updateNav) window.updateNav = function (...a) { if (!ON) return real.updateNav.apply(this, a); };
  if (real.target) window.target = function (key) { return ON ? staticTarget(key) : real.target.call(this, key); };

  function enter() {
    ON = true;
    window.__arc76Static = true;
    root.classList.add('m-static');
    adoptReducedMotion();
    relocate();
    freeze();
  }

  function exit() {
    ON = false;
    window.__arc76Static = false;
    root.classList.remove('m-static');
    unrelocate();
    /* Hand the engine a scroll position it has not seen, so its next
       frame recomputes everything from scratch rather than trusting the
       frozen state. lastY is a top-level `let` in the export's script:
       reachable as a free identifier from another classic script, but not
       as a window property, which is why this is a bare assignment in a
       try. mobile.js does the same thing for the same reason. */
    try { lastY = -1; } catch (e) { /* not present */ }
    if (typeof fit === 'function') fit();
    if (typeof sizeCanvas === 'function') sizeCanvas();
    /* window.tick is the real one again, but the loop it used to drive is
       gone — nothing re-armed it. Restart it once. */
    if (typeof window.tick === 'function') requestAnimationFrame(() => window.tick());
    if (typeof window.__arc76MobileRestart === 'function') window.__arc76MobileRestart();
  }

  function decide() {
    const want = phone();
    if (want === ON) { if (ON) freeze(); return; }   // re-freeze on resize: --fh changed
    if (want) enter(); else exit();
  }

  /* The scenes are built by the page's own script and by crate/route/base
     on a retry timer, so page-two blocks can appear after this file has
     run. mobile.js re-tags on the same cadence for the same reason.
     freeze() is re-run with them because showPin() is what mounts a scene
     that only just became buildable. */
  decide();
  let tries = 0;
  const again = setInterval(() => {
    if (ON) { relocate(); adoptReducedMotion(); freeze(); }
    if (++tries > 40) clearInterval(again);
  }, 120);

  addEventListener('resize', decide);
  addEventListener('orientationchange', () => setTimeout(decide, 200));
})();
