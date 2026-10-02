/* Arc76 — portrait-native phone layout. Pairs with mobile/native.css.
 *
 * Injected alongside scroll-fix.js, perf.js and mobile/static.js
 * (bake.mjs/dev.mjs). Kept out of index.html because every design-tool
 * export replaces that file wholesale.
 *
 * WHAT IT IS FOR
 * The phone was getting the desktop's 1440x900 landscape scenes scaled
 * so their full HEIGHT fits and then slid sideways onto one focus
 * point. At 390x844 that shows 416 of 1440 canvas px — 29% of the
 * authored width — and whatever the focus point misses is simply not on
 * the page. Measured at 390x844 DPR3 before this file existed: s1 spent
 * ~45% of the first viewport on empty gradient with the hero headline
 * BELOW the fold, s3's figure sat at canvas x 366-674 while the phone
 * looked at 792-1208 (so the subject of the scene was off-screen), s4's
 * crate ran off the bottom, and s6 carried a ~500px empty band.
 *
 * THE IDEA: FRAME A RECTANGLE, DO NOT FIT THE HEIGHT
 * FRAME below carries one focal rect per scene in 1440x900 canvas px —
 * the smallest rectangle that holds that scene's subject. The stage is
 * scaled by stageWidth / rect.w and is only as tall as the rect needs.
 * Empty bands become structurally impossible, because no stage is
 * forced to be a screen tall any more, and a subject cannot fall
 * outside the frame because the frame is derived from the subject.
 *
 * WHERE THE RECTS CAME FROM
 * Measured in the browser, not guessed, with the per-element phone
 * transforms neutralised so everything reports its authored position
 * (getBBox() on SVG is already in canvas px):
 *
 *   #s1 .sfan          [740, 104, 640, 760]   the five app screenshots
 *   #s2 svg.rig        [878, 404, 127, 316]   the climber and his axes
 *   #s3 walker + flag  [366, 450, 308, 335]
 *   #s3 g.icons        [ 39, 674, 319, 181]   the locked-app cluster
 *   #s4 g.crx-rig      [552, 524, 368, 222]   the crate
 *   #s6 peak polygons  [330, 150, 1030, 770], tents y 750-840
 *
 * IT BUILDS ON mobile.js AND static.js, IT DOES NOT REPLACE THEM
 * mobile.js still has to run: it tells the export's own engine that the
 * frame is the screen (FW/FH/K, --fw/--fh/--k) and without it fit()
 * letterboxes a 1440x900 card into the viewport. static.js still has to
 * run: it is what kills the rAF loop and freezes the scenes, and the
 * measured 0 rAF/sec and 0ms script-at-rest baseline belongs to it.
 * This file is layout only — no loop, no observer, no transition on a
 * scroll-driven property — so that baseline is untouched.
 *
 * ORDER AND RETRIES
 * crate.js, route.js and base.js build their scenes on a retry timer,
 * and static.js re-runs relocate()/freeze() on its own 120ms cadence
 * for 4.8s. So everything here is idempotent and runs on the same
 * cadence: a node that has already been lifted is skipped, and a scene
 * that has only just been built is picked up on a later pass.
 */
(() => {
  'use strict';
  if (window.__arc76NativeInit) return;
  window.__arc76NativeInit = true;

  /* Must match mobile.js and static.js exactly. If the three ever
     disagree you get one layer's geometry driven by another's
     assumptions, which looks broken in ways that are hard to attribute. */
  const phone = () => innerWidth <= 820 && innerHeight > innerWidth * 1.15;

  const root = document.documentElement;
  let ON = false;

  /* No App Store link is constructed here any more. The page's only two
     in-page CTAs are the export's own hero badge and base-camp badge,
     plus the sticky nav pill — all three already carry the real id,
     which bake.mjs guarantees. */

  /* ---- 1. the focal rects ----------------------------------------
   * rect: [x, y, w, h] in 1440x900 canvas px, chosen around the subject.
   * cap:  the most of the viewport this stage may take. A stage taller
   *       than its cap is cropped vertically about the rect's centre
   *       rather than scaled down, so the subject keeps its size on a
   *       short phone instead of shrinking back towards the old problem.
   * s5 is deliberately absent: the route map is vertical by nature, so
   * fit-the-height already frames it correctly. It is the one scene that
   * worked in portrait and it is left exactly as mobile.js had it.
   */
  const FRAME = {
    /* the phone fan, padded. The product is the strongest asset on a
       conversion page, so s1's stage is framed on the screenshots rather
       than on scenery — which is also what removes the empty gradient
       that used to open the page. */
    s1: { rect: [705, 70, 715, 815], cap: .55 },
    /* The wall, zoomed out far enough that all five placements AND
       their labels fit side by side — the owner's ask: "the task at each
       pickaxe". Derivation, so the numbers are not magic:
         the figure is 122 canvas px wide, centred on x 944;
         the authored cards sat with their inner edges at x 848 (left
         column) and x 1016 (right column), and the orange ropes are
         drawn from each axe out to those edges;
         so the frame is centred on 932 (the midpoint of 848/1016, not
         944) and 488 canvas px wide, which at 390 screen px works out to
         k = 0.80: a ~122px label column each side, meeting the end of
         its own rope, with the 98px figure between them.
       The figure is smaller than the previous tight crop (98px vs 146px)
       and that trade is deliberate — five legible placements beat one
       big silhouette plus a detached list below it. */
    s2: { rect: [688, 215, 488, 524], cap: .62 },
    /* the summit figure with the flag AND the locked-app cluster: the
       two halves of "the feed is always pulling". Both live in the left
       half of a canvas the old focus point read from the right half of.
       y starts at 420 and not 390: the first pass left ~150px of empty
       sky above the ridge, which is the exact failure being replaced. */
    s3: { rect: [15, 420, 670, 450], cap: .42 },
    /* the crate, its light pool and the snow it stands on. Same note on
       y: 330 put 180px of star field above the lid. */
    s4: { rect: [530, 420, 420, 380], cap: .56 },
    /* the peak, the lamp route up its face, the bunting and the tents —
       top to bottom, which is the one composition on the page that is
       already portrait-shaped. */
    /* h is 780 and not 815 on purpose: 120 + 780 = 900, the exact
       bottom of the canvas. Overshooting it by 35px exposed the scene
       container below the artwork as a bright blue bar across the foot
       of the stage. Screenshotted. No rect may end past y 900. */
    s6: { rect: [430, 120, 760, 780], cap: .53 },
  };

  /* s1 is absent on purpose: its hero already opens with the export's
     own "SYS://SUMMIT_REACHED" eyebrow, and a kicker above it would be
     two labels in a row — plus, at the very top of the page, it would
     sit under the fixed 64px nav. */
  const STATION = {
    s2: 'The wall',
    s3: 'The pull',
    s4: 'The cache',
    s5: 'The route',
  };

  /* ---- 2. geometry ------------------------------------------------ */

  function geometry() {
    const W = innerWidth;
    const H = Math.max(innerHeight, 1);
    for (const id of Object.keys(FRAME)) {
      const wrap = document.getElementById(id);
      const pin = wrap && wrap.querySelector(':scope > .pin');
      const fit = pin && pin.querySelector('.fit');
      if (!pin || !fit) continue;
      const f = FRAME[id];
      const [rx, ry, rw, rh] = f.rect;
      const k = W / rw;
      const want = rh * k;
      const max = Math.round(H * f.cap);
      const h = Math.min(Math.round(want), max);
      /* when the cap bites, keep the rect's centre in the middle of the
         frame rather than its top edge — otherwise a short phone crops
         the subject's feet off, which is the bug this file replaces */
      const y = ry + (rh - h / k) / 2;
      pin.classList.add('mn-stage');
      pin.style.setProperty('--st-h', h + 'px');
      fit.style.setProperty('--st-k', k.toFixed(5));
      fit.style.setProperty('--st-x', (-rx) + 'px');
      fit.style.setProperty('--st-y', (-y).toFixed(1) + 'px');
      /* mobile.css positions anything still inside the canvas from the
         left edge of the visible strip. Keep those two vars honest for
         the new frame so nothing anchored that way drifts. */
      fit.style.setProperty('--vl', rx + 'px');
      fit.style.setProperty('--mx', '0px');
      /* the wall's five labels live in screen space over this stage, so
         they have to be re-projected whenever the frame changes */
      if (id === 's2') placeAnchors(rx, y, k, W);
    }
    const p5 = document.querySelector('#s5 > .pin');
    if (p5) p5.classList.add('mn-keep');
  }

  function ungeometry() {
    for (const id of Object.keys(FRAME)) {
      const wrap = document.getElementById(id);
      const pin = wrap && wrap.querySelector(':scope > .pin');
      const fit = pin && pin.querySelector('.fit');
      if (pin) { pin.classList.remove('mn-stage'); pin.style.removeProperty('--st-h'); }
      if (fit) ['--st-k', '--st-x', '--st-y'].forEach((p) => fit.style.removeProperty(p));
    }
    const p5 = document.querySelector('#s5 > .pin');
    if (p5) p5.classList.remove('mn-keep');
  }

  /* ---- 3. flow boxes ----------------------------------------------
   * These carry static.css's .m-st-flow class as well as .mn-flow, so
   * they inherit its "undo everything that made this a layer floating
   * over a 1440x900 canvas" reset (inline position/left/top/width, the
   * zoom that cancels --k, the oversized ::before scrim) instead of
   * restating ~20 declarations. Distinct data-where values keep
   * static.js's own relocate() from appending into one of these: it
   * reuses a box by [data-where], and sharing one would make the
   * ordering depend on which file's retry timer fired first.
   */
  const homes = new Map();   // node -> [parent, nextSibling] for exit()

  /* mn-a = before the art, mn-b = straight after it, mn-z = last thing
     in the section. The three positions exist because "append to the
     wrap" is not good enough: static.js has already appended s6's FAQ
     and footer, so appending .bc-copy put the page's final headline and
     its App Store badge BELOW the copyright line. Screenshotted. */
  function boxFor(wrap, where) {
    let box = wrap.querySelector(':scope > .m-st-flow[data-where="' + where + '"]');
    if (box) return box;
    box = document.createElement('div');
    box.className = 'm-st-flow mn-flow';
    box.dataset.where = where;
    const pin = wrap.querySelector(':scope > .pin');
    if (where === 'mn-a' && pin) wrap.insertBefore(box, pin);
    else if (where === 'mn-b' && pin) wrap.insertBefore(box, pin.nextSibling);
    else wrap.appendChild(box);
    return box;
  }

  /* Everything that is not art comes out of the scaled canvas. Lifting
     rather than re-styling in place is what lets copy be laid out in
     real screen px: inside .fit a 15px rule renders at 15 * k px, and k
     is 0.55-1.15 depending on the scene. */
  const LIFT = [
    ['s2', 'mn-b', ['.fit .m-col.m-copy']],
    ['s3', 'mn-b', ['.fit .m-col.m-copy']],
    /* mn-b, not mn-a: the owner wants the crate first and "Every day
       you climb, a crate drops." underneath it. mn-b is inserted straight
       after the stage, so the station reads kicker -> crate -> copy. */
    ['s4', 'mn-b', ['.fit .m-pa']],
    ['s6', 'mn-b', ['.bc-copy']],
  ];

  function lift() {
    for (const [id, where, sels] of LIFT) {
      const wrap = document.getElementById(id);
      if (!wrap) continue;
      for (const sel of sels) {
        const el = wrap.querySelector(sel);
        if (!el || el.closest('.m-st-flow')) continue;
        const box = boxFor(wrap, where);
        /* base.css gates s6's eyebrow and chips on `.bc-full .bc-eyebrow`,
           and base.js adds .bc-full only when CONFIG.showEyebrowAndChips
           is true. Lifting .bc-copy out of .bc breaks that ancestor link
           and the owner's switch silently stops working. Carry it. */
        const anc = el.parentElement && el.parentElement.closest('.bc-full');
        if (anc) box.classList.add('bc-full');
        homes.set(el, [el.parentNode, el.nextSibling]);
        box.appendChild(el);
      }
    }
  }

  /* ---- 4. the wall: a task AT each pickaxe -------------------------
   * HOW MANY ANCHORS THE ART ACTUALLY HAS
   * Five, and exactly five, so nothing had to double up. svg.rig's top
   * group holds five <circle> glows at canvas (902,278) (968,353)
   * (902,428) (968,503) (902,578) — alternating left/right, 75 canvas px
   * apart vertically, one per axe placement. Two of them are r=0: those
   * are the two tasks not yet proved, so no axe is planted and there is
   * no glow to draw. Their centres are still the correct anchor points,
   * which is why this reads cx/cy and ignores r.
   *
   * WHY THE LABELS ARE NOT INSIDE THE CANVAS
   * They were, and that is exactly what made them unreadable. A label
   * inside .fit is scaled by k along with the art, and at any k that
   * fits all five placements across 390px the authored 12.5px sub-line
   * lands at 6-7px. Out here they are positioned in SCREEN pixels at the
   * projected anchor coordinates, so type size is independent of how far
   * the art is zoomed out. That is the whole trick.
   *
   * The rows are MOVED, not cloned — a clone would duplicate every task
   * name in the page's text.
   */
  const ROW_W = 294;          // authored card width, canvas px
  const FALLBACK_ANCHORS = [[902, 278], [968, 353], [902, 428], [968, 503], [902, 578]];

  function anchorPoints() {
    const rig = document.querySelector('#s2 svg.rig');
    const g = rig && rig.querySelector('g');
    const cs = g ? [...g.children].filter((c) => c.tagName === 'circle') : [];
    if (cs.length !== 5) return FALLBACK_ANCHORS.slice();
    const pts = cs.map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')])
      .filter((q) => isFinite(q[0]) && isFinite(q[1]));
    return pts.length === 5 ? pts.sort((a, b) => a[1] - b[1]) : FALLBACK_ANCHORS.slice();
  }

  function wallAnchors() {
    const wrap = document.getElementById('s2');
    if (!wrap) return;
    const pin = wrap.querySelector(':scope > .pin');
    if (!pin || pin.querySelector('.mn-anchors')) return;
    const rows = [...wrap.querySelectorAll('.fit .row')];
    if (rows.length < 5) return;   // the scene has not finished building
    const pts = anchorPoints();

    const layer = document.createElement('div');
    layer.className = 'mn-anchors';
    /* Paired by vertical order, not by DOM index: both lists are
       monotonic in y, and a re-export that reordered the markup would
       otherwise silently hang "Gym" off the wrong axe. */
    rows.slice().sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
      .forEach((r, i) => {
        const left = parseFloat(r.style.left) || 0;
        homes.set(r, [r.parentNode, r.nextSibling]);
        r.dataset.mnLeft = r.style.left || '';
        r.dataset.mnTop = r.style.top || '';
        /* the side the authored card sat on, which is also the side its
           orange rope runs out to */
        r.dataset.mnSide = left < 900 ? 'L' : 'R';
        /* the canvas x where that rope ends. The label's inner edge is
           put exactly there, so the rope lands on the label instead of
           pointing at bare wall. */
        r.dataset.mnEdge = String(left < 900 ? left + ROW_W : left);
        r.dataset.mnAy = String(pts[i][1]);
        r.style.left = ''; r.style.top = '';
        layer.appendChild(r);
      });
    pin.appendChild(layer);
  }

  /* Place the five labels at their projected anchors. Lives here rather
     than in CSS because every number depends on the frame, and it is
     called from geometry() for the same reason. */
  function placeAnchors(rx, ry, k, W) {
    const layer = document.querySelector('#s2 .mn-anchors');
    if (!layer) return;
    const GUT = 6;                                  // screen px off each edge
    for (const r of layer.children) {
      const edge = (parseFloat(r.dataset.mnEdge) - rx) * k;
      const ay = (parseFloat(r.dataset.mnAy) - ry) * k;
      if (r.dataset.mnSide === 'L') {
        r.style.left = GUT + 'px';
        r.style.width = Math.max(96, Math.round(edge - GUT)) + 'px';
      } else {
        r.style.left = Math.round(edge) + 'px';
        r.style.width = Math.max(96, Math.round(W - edge - GUT)) + 'px';
      }
      /* Centre the plate on its anchor. offsetHeight is read after the
         width is set, so a sub-line that wrapped to two lines still
         centres correctly. This is the only layout read in the file and
         it runs once per resize, never per frame. */
      r.style.top = Math.round(ay - r.offsetHeight / 2) + 'px';
    }
  }

  /* ---- 5. station chrome + the extra CTAs -------------------------
   * s6 is absent from STATION on purpose: base.js already ships a
   * "07 — Base camp" eyebrow inside .bc-copy and native.css restyles it
   * to match. Adding a second label there would mean either duplicating
   * it or hiding shipped copy, and neither is worth a tidier rhythm.
   */
  function chrome() {
    for (const [id, name] of Object.entries(STATION)) {
      const wrap = document.getElementById(id);
      if (!wrap || wrap.querySelector(':scope > .mn-kick')) continue;
      const k = document.createElement('div');
      k.className = 'mn-kick';
      k.setAttribute('aria-hidden', 'true');   // decorative: the h2 below is the real heading
      const b = document.createElement('b'); b.textContent = name;
      k.appendChild(b);
      wrap.insertBefore(k, wrap.firstChild);
    }
    /* NO per-station App Store buttons. An earlier pass added one to s2
       and one to s5 on the "visible early and repeatedly" principle; the
       owner overruled it — "dont have the blue app buttons just the cta
       at the top of the page and the one at the bottom". So the page
       carries exactly two in-page CTAs, the hero badge and the base-camp
       badge, plus the sticky nav pill. native.css additionally hides the
       export's own blue inline buttons in s3 and s4, which are the
       "blue app buttons" that instruction is about. */
  }

  /* ---- 6. phone-only copy -----------------------------------------
   * The s3 paragraph names TikTok. The owner wants the phone page
   * generic but still intriguing, so the sentence is swapped here — not
   * in index.html, which every export replaces, and not on desktop,
   * which is explicitly out of scope. The original is stashed so exit()
   * restores it when a window leaves phone range.
   *
   * Deliberately NOT touched: the "TikTok blocked for 00:34" inside
   * assets/screen-home.jpg and that image's alt text. That is a
   * photograph of real product UI, not marketing copy, and editing it
   * would misrepresent the app.
   */
  const COPY = [
    ['#s3 .m-copy .disp + div',
      'Every app on your phone is built to drag you back down. Arc76 shuts the ones that pull hardest, and makes you earn your way back in.'],
  ];
  const copyWas = new Map();

  function swapCopy() {
    for (const [sel, text] of COPY) {
      const el = document.querySelector(sel);
      if (!el || copyWas.has(el)) continue;
      copyWas.set(el, el.textContent);
      el.textContent = text;
    }
  }

  function restoreCopy() {
    for (const [el, was] of copyWas) el.textContent = was;
    copyWas.clear();
  }

  /* ---- 7. enter / exit -------------------------------------------- */

  function apply() {
    lift();
    wallAnchors();
    chrome();
    swapCopy();
    geometry();
  }

  function enter() {
    ON = true;
    window.__arc76Native = true;
    root.classList.add('mn');
    apply();
  }

  function exit() {
    ON = false;
    window.__arc76Native = false;
    root.classList.remove('mn');
    ungeometry();
    /* put every moved node back where it came from, newest first, so a
       window leaving phone range hands the desktop layout back intact */
    for (const [el, [parent, next]] of homes) {
      if (el.dataset.mnLeft !== undefined) {
        if (el.dataset.mnLeft) el.style.left = el.dataset.mnLeft;
        if (el.dataset.mnTop) el.style.top = el.dataset.mnTop;
        el.style.width = '';
        delete el.dataset.mnLeft; delete el.dataset.mnTop;
        delete el.dataset.mnSide; delete el.dataset.mnEdge; delete el.dataset.mnAy;
      }
      if (parent) parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    }
    homes.clear();
    restoreCopy();
    document.querySelectorAll('.mn-flow, .mn-kick, .mn-anchors').forEach((n) => n.remove());
    if (typeof fit === 'function') { try { fit(); } catch (e) { /* ignore */ } }
  }

  function decide() {
    /* static mode is a hard requirement, not a preference: these rects
       describe a page with no camera, and every selector in native.css
       is scoped .m-static so that a missing static.js degrades to the
       previous phone layout rather than to a scroll engine aiming at
       rectangles that no longer mean anything. */
    const want = phone() && !!window.__arc76Static;
    if (want === ON) { if (ON) apply(); return; }   // re-apply on resize: --st-h depends on innerHeight
    if (want) enter(); else exit();
  }

  decide();
  /* same cadence as static.js's own retry loop, for the same reason:
     crate.js, route.js and base.js build their scenes on a timer, so a
     block to lift or a row to list can appear after this file has run.
     Everything above is idempotent, so re-running is free. */
  let tries = 0;
  const again = setInterval(() => {
    decide();
    if (++tries > 45) clearInterval(again);
  }, 120);

  addEventListener('resize', decide);
  addEventListener('orientationchange', () => setTimeout(decide, 200));
})();
