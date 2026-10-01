/* Arc76 — phone layout.
 *
 * Injected after the other modules (assemble.py for the hosted build;
 * bake.mjs/dev.mjs pick it up from the tag in index.html). Kept out of
 * index.html because every design-tool export replaces that file.
 *
 * On a portrait phone the site stops being a landscape card and fills the
 * screen: each 1440x900 scene is scaled so its full height fits the
 * phone, then slid sideways so the part that matters (the flag, the
 * climber, the crate...) sits in the middle. mobile.css re-lays the copy
 * and the interactive pieces inside that visible strip.
 *
 * Scenes with more than one screen of content (crate, route, base camp)
 * use the pause that already follows each camera move: scrolling through
 * it slides the first "page" of the scene away and brings the second in.
 * No sections are added or removed, so scroll-fix.js keeps working.
 *
 * Desktop and tablets in landscape are untouched.
 */
(() => {
  'use strict';
  if (window.__arc76Mobile) return;
  window.__arc76Mobile = true;

  const root = document.documentElement;
  const phone = () => innerWidth <= 820 && innerHeight > innerWidth * 1.15;
  const landscapePhone = () => innerHeight <= 500 && innerWidth > innerHeight && matchMedia('(pointer: coarse)').matches;

  /* where each scene is looked at from, in canvas pixels (x of the centre
     of the screen). s1 moves from the summit to the camp as you descend. */
  const FOCUS = { s1: [1060, 700], s2: 905, s3: 1000, s4: 740, s5: 942, s6: 800 };
  /* the pause after the move that becomes a second page, per scene
     (fraction of a screen of scrolling it takes to swap pages) */
  const PAGES = { s4: 0.55, s5: 0.55, s6: 0.55 };
  const S6_HEIGHT = 270;   // vh; base camp needs room for its second page

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  const wrapsM = [...document.querySelectorAll('.wrap')];
  const fits = Object.fromEntries(wrapsM.map((w) => [w.id, w.querySelector('.fit')]));
  let on = false, VW = 1440, KK = 1, s6h = '';
  const shift = {};   // canvas px each scene is slid by (screen centre - 720)

  function setFocus(id, cx) {
    const f = fits[id];
    if (!f) return;
    shift[id] = 720 - cx;
    f.style.setProperty('--mx', (shift[id] * KK).toFixed(2) + 'px');
    f.style.setProperty('--vl', (cx - VW / 2).toFixed(1) + 'px');
  }

  function layout() {
    const was = on;
    on = phone();
    root.classList.toggle('m', on);
    root.classList.toggle('m-land', !on && landscapePhone());
    const s6 = document.getElementById('s6');
    if (!on) {
      if (was) {
        Object.values(fits).forEach((f) => f && ['--mx', '--vl'].forEach((p) => f.style.removeProperty(p)));
        if (s6 && s6h) s6.style.height = s6h;
        ['--gap', '--rad', '--vw', '--z', '--gs'].forEach((p) => root.style.removeProperty(p));
        if (typeof fit === 'function') fit();
      }
      return;
    }
    /* full bleed: the frame is the screen. 100lvh so the scene does not
       jump when Safari's toolbar slides away. */
    const H = Math.max(probe.offsetHeight || 0, innerHeight);
    FW = innerWidth; FH = H; K = FH / 900; KK = K;
    VW = FW / K;
    const st = root.style;
    st.setProperty('--gap', '0px'); st.setProperty('--rad', '0px');
    st.setProperty('--fl', '0px'); st.setProperty('--ft', '0px');
    st.setProperty('--fw', FW + 'px'); st.setProperty('--fh', FH + 'px');
    st.setProperty('--k', K.toFixed(4));
    st.setProperty('--vw', VW.toFixed(1) + 'px');
    st.setProperty('--z', (1 / K).toFixed(4));
    /* the wall's climber group: as large as the strip allows (it is ~760 canvas px wide) */
    st.setProperty('--gs', Math.min(0.64, (VW - 36) / 780).toFixed(4));
    ['s2', 's3', 's4', 's5', 's6'].forEach((id) => setFocus(id, FOCUS[id]));
    setFocus('s1', FOCUS.s1[0]);
    if (s6) { if (!s6h) s6h = s6.style.height; s6.style.height = S6_HEIGHT + 'vh'; }
    if (typeof sizeCanvas === 'function') sizeCanvas();
    try { lastY = -1; } catch (e) { /* not present */ }
  }

  /* the route moves aim the camera at points on the #s5 map; account for the slide */
  const raw = { start: window.__arcRouteStart, end: window.__arcRouteEnd };
  const adj = (p) => (on && p ? [p[0] + (shift.s5 || 0), p[1]] : p);
  try {
    Object.defineProperty(window, '__arcRouteStart', { configurable: true, get: () => adj(raw.start), set: (v) => { raw.start = v; } });
    Object.defineProperty(window, '__arcRouteEnd', { configurable: true, get: () => adj(raw.end), set: (v) => { raw.end = v; } });
  } catch (e) { /* leave as is */ }

  /* per-frame: s1's focus follows the descent; the second pages */
  const cl = (v) => Math.max(0, Math.min(1, v));
  const ease = (u) => u * u * (3 - 2 * u);
  let lastD = -1;
  const pageLast = {};
  /* mobile/static.js turns the phone into an ordinary scroll, so both of
     the loops below have nothing left to compute: s1's focus is pinned to
     the camp and the paged scenes show both pages at once. They exit
     without re-arming rather than spinning on a frozen page — a rAF
     callback that only reads a boolean still keeps the phone's frame
     clock running at 60Hz, which is exactly the battery cost this mode is
     supposed to remove. restartLoops() below puts them back if static
     mode ever switches off (a narrow desktop window widening again). */
  function frame() {
    if (window.__arc76Static) return;
    requestAnimationFrame(frame);
    if (!on || typeof stateAt !== 'function') return;
    const d = typeof DESC_T === 'number' ? DESC_T : 0;
    if (Math.abs(d - lastD) > 0.0005) {
      lastD = d;
      const u = ease(cl((d - 0.55) / 0.4));
      setFocus('s1', FOCUS.s1[0] + (FOCUS.s1[1] - FOCUS.s1[0]) * u);
    }
    const vh = innerHeight, y = typeof sy === 'number' ? sy : scrollY;
    wrapsM.forEach((w, i) => {
      const len = PAGES[w.id];
      if (!len) return;
      const settle = w.offsetTop + (TR[i] || 0) * vh;
      const p = ease(cl((y - settle - vh * 0.06) / (len * vh)));
      if (pageLast[w.id] !== undefined && Math.abs(pageLast[w.id] - p) < 0.0005) return;
      pageLast[w.id] = p;
      fits[w.id].style.setProperty('--pg', p.toFixed(4));
      fits[w.id].classList.toggle('m-p2', p > 0.5);
    });
  }

  /* scroll-fix.js snaps to scene boundaries; on a phone the paged scenes
     also rest on their first and second page */
  window.__arcSnapExtra = () => {
    if (!on || typeof TR === 'undefined') return [];
    const vh = innerHeight, out = [];
    wrapsM.forEach((w, i) => {
      const len = PAGES[w.id];
      if (!len) return;
      const settle = w.offsetTop + (TR[i] || 0) * vh;
      out.push(settle, settle + (0.06 + len) * vh);
    });
    return out;
  };

  /* the route draws itself when its page arrives */
  let rtShown = false;
  function routeDraw() {
    if (window.__arc76Static) return;
    requestAnimationFrame(routeDraw);
    if (!on) return;
    const f = fits.s5, rt = f && f.querySelector('.rt');
    if (!rt) return;
    const p2 = f.classList.contains('m-p2');
    if (p2 && !rtShown) { rtShown = true; rt.classList.remove('drawn'); void rt.offsetWidth; requestAnimationFrame(() => rt.classList.add('drawn')); }
    if (!p2 && rtShown && (parseFloat(f.style.getPropertyValue('--pg')) || 0) < 0.05) rtShown = false;
  }

  /* mark the pieces mobile.css re-lays (harmless on desktop) */
  const tag = (sel, cls) => document.querySelectorAll(sel).forEach((e) => e.classList.add(...cls.split(' ')));
  function prepare() {
    tag('#s1 .hero:not(.scrollcue)', 'm-col m-copy m-bot m-hero');
    tag('#s1 .campcopy', 'm-col m-copy m-bot');
    tag('#s2 .fit > div > div[style*="left:72px"]', 'm-col m-copy m-bot');
    tag('#s3 .fit > div > div[style*="left:72px"]', 'm-col m-copy m-bot');
    tag('#s4 .fit > div > div[style*="left:72px"]', 'm-col m-copy m-top m-pa');
    /* route: the planner sits above the milestone cards so its backdrop dims them */
    const rt = document.querySelector('#s5 .rt'), rc = rt && rt.querySelector(':scope > .rt-copy');
    if (rc && rt.lastElementChild !== rc && on) rt.appendChild(rc);
    /* route labels that would run off a phone's right edge go left of their point */
    if (rt && on) rt.querySelectorAll('.rt-map text.rt-lbl').forEach((t) => {
      if (t.dataset.mx) return;
      t.dataset.mx = t.getAttribute('x');
      if (/SUMMIT/.test(t.textContent)) { t.style.display = 'none'; return; }   // the day-45 card says it instead
      t.setAttribute('x', String(+t.dataset.mx - 128));
      t.setAttribute('text-anchor', 'end');
    });
    /* the wall: the climber and his five task cards travel as one group */
    const w = document.querySelector('#s2 .fit > div');
    if (w && !w.querySelector('.m-grp')) {
      const parts = [...w.querySelectorAll(':scope > .row, :scope > svg.rig')];
      if (parts.length) {
        const g = document.createElement('div');
        g.className = 'm-grp';
        parts[0].before(g);
        parts.forEach((p) => g.appendChild(p));
      }
    }
  }
  prepare();
  let tries = 0;
  const again = setInterval(() => { prepare(); if (++tries > 30) clearInterval(again); }, 150);

  addEventListener('resize', layout);
  addEventListener('orientationchange', () => setTimeout(layout, 200));
  layout();
  requestAnimationFrame(frame);
  requestAnimationFrame(routeDraw);

  /* static.js calls this when it hands control back */
  window.__arc76MobileRestart = () => {
    requestAnimationFrame(frame);
    requestAnimationFrame(routeDraw);
  };
})();
