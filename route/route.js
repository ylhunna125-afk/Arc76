/* Arc76 — Your 60 Days (#s5), rebuilt.
 *
 * Injected with route.css (dev.mjs locally; assemble.py for the hosted
 * build). Kept out of index.html because every design-tool export
 * replaces that file.
 *
 * WHAT IT KEEPS: the planner. Same five tasks, same default selection
 * (Gym, Run, Cold Shower), same arithmetic (tasks a day x day number),
 * same "N TASKS A DAY" label and the same dynamic CTA label as the
 * export's component. Every number on screen is the visitor's own
 * selection multiplied out. Nothing else is computed or claimed.
 *
 * WHAT IT CHANGES: presentation. The route is laid on a contour map (the
 * same map the Cache -> Route transition flies into, which this script
 * also redraws so the two match), it starts at the summit and ends at
 * base camp, all six milestones and the day-60 total sit in one frame,
 * and the chips drive the route directly.
 *
 * STRUCTURE CHANGE: #s5 is shortened at runtime (SECTION below) so the
 * planner is usable as soon as the scene lands. .wrap elements are only
 * resized, never added or removed, so scroll-fix.js keeps working.
 */
(() => {
  'use strict';
  if (window.__arc76Route) return;
  window.__arc76Route = true;

  const SECTION = { height: 200, transition: 1.0 };   // vh, screens

  /* ---------- terrain ---------- */
  const PEAK = [1134, 122];          // the summit the site opened on
  const SX = 1.32, SY = 0.8;         // contour ellipse stretch
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const R = rng(76);
  const PH = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
  // radius distortion of the mountain at angle t: shared by every contour
  // and by the route, so the route genuinely sits on the terrain
  const warp = (t, r) => 1 + 0.13 * Math.sin(2 * t + PH[0]) + 0.07 * Math.sin(3 * t + PH[1] + r / 400) + 0.04 * Math.sin(5 * t + PH[2]);
  const onRing = (r, t) => { const k = r * warp(t, r); return [PEAK[0] + k * SX * Math.cos(t), PEAK[1] + k * SY * Math.sin(t)]; };

  function contours() {
    let out = '';
    for (let i = 1; i <= 30; i++) {
      const r = i * 32, heavy = i % 5 === 0;
      let d = '';
      for (let k = 0; k <= 120; k++) { const t = (k / 120) * Math.PI * 2; const [x, y] = onRing(r, t); d += (k ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); }
      out += `<path d="${d}Z" fill="none" stroke="${heavy ? '#8fb0e8' : '#5f82c4'}" stroke-width="${heavy ? 1.3 : .9}" opacity="${heavy ? .42 : .2}"/>`;
    }
    // a second, lower hill to the west so the map is terrain, not a target
    const H2 = [560, 800];
    for (let i = 1; i <= 9; i++) {
      let d = '';
      for (let k = 0; k <= 90; k++) { const t = (k / 90) * Math.PI * 2; const rr = i * 30 * (1 + .12 * Math.sin(3 * t + PH[3])); d += (k ? 'L' : 'M') + (H2[0] + rr * 1.5 * Math.cos(t)).toFixed(1) + ',' + (H2[1] + rr * .7 * Math.sin(t)).toFixed(1); }
      out += `<path d="${d}Z" fill="none" stroke="#5f82c4" stroke-width=".9" opacity="${i % 5 ? .16 : .3}"/>`;
    }
    const lab = [[PEAK[0] + 26, PEAK[1] + 58, '7,600'], [PEAK[0] - 250, PEAK[1] + 250, '6,300'], [PEAK[0] - 150, PEAK[1] + 470, '5,400'], [PEAK[0] + 120, PEAK[1] + 560, '4,800']];
    out += lab.map(([x, y, s]) => `<text x="${x}" y="${y}" font-family="JetBrains Mono,monospace" font-size="10" letter-spacing="2" fill="#8fb0e8" opacity=".45">${s}</text>`).join('');
    return out;
  }
  function grid() {
    let g = '';
    for (let x = 0; x <= 1440; x += 120) g += `<path d="M${x},0V900" stroke="#6b8fd0" stroke-width="1" opacity=".06"/>`;
    for (let y = 0; y <= 900; y += 120) g += `<path d="M0,${y}H1440" stroke="#6b8fd0" stroke-width="1" opacity=".06"/>`;
    return g;
  }

  /* ---------- the route: down the fall line, easing along the contours ---------- */
  const R0 = 22, R1 = 822;
  const angle = (r) => 1.83 + 0.16 * Math.sin(r / 150 + 0.6) + 0.05 * Math.sin(r / 47);
  // the climb runs bottom to top: base camp (you are here) up to the summit on day 45
  const DAYS = [1, 7, 15, 30, 45];
  const fOfDay = (d) => 0.13 + 0.87 * Math.pow(d / 45, 0.85);            // 0 at base camp, 1 at the summit
  const rOfDay = (d) => R1 - (R1 - R0) * fOfDay(d);
  const pt = (r) => onRing(r, angle(r));
  function routeD() {
    let d = '';
    for (let r = R1, k = 0; r >= R0 - .01; r -= 4, k++) { const [x, y] = pt(r); d += (k ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); }
    return d;
  }
  const START = pt(R0), END = pt(R1);
  window.__arcRouteStart = END;   // the climb starts at base camp
  window.__arcRouteEnd = START;   // and tops out at the summit

  /* ---------- planner (same behaviour as the export's component) ---------- */
  const NAMES = { gym: 'Gym', run: 'Run', sup: 'Supplements', cold: 'Cold Shower', push: 'Push Ups' };
  const ORDER = ['gym', 'run', 'sup', 'cold', 'push'];
  const ICON = {
    gym: '<path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    run: '<circle cx="15" cy="4.5" r="2" fill="currentColor"/><path d="M8 21l3-6 3 2v4M6 12l3-3 4 1 3 4 3 1M11 15l2-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    sup: '<rect x="4" y="9" width="16" height="7" rx="3.5" transform="rotate(-35 12 12.5)" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.6 9.1l4.8 6.8" stroke="currentColor" stroke-width="2"/>',
    cold: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    push: '<path d="M3 16h4l3-4 5 1 6 3M7 16l-1 4M15 13l1-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17.5" cy="6" r="2" fill="currentColor"/>',
  };
  const MS = { 1: 'First proof in', 7: 'One week, unbroken', 15: 'It starts to stick', 30: 'Halfway up', 45: 'Past the hard part' };
  const storeUrl = (typeof APP_STORE_URL !== 'undefined' ? APP_STORE_URL : 'https://apps.apple.com/app/id_YOUR_APP_ID');
  const APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z"/></svg>';

  function vals(sel) {
    const n = sel.length;
    return {
      n,
      countLabel: n === 0 ? 'PICK AT LEAST ONE' : n + (n === 1 ? ' TASK A DAY' : ' TASKS A DAY'),
      total: (n * 60).toLocaleString('en-US'),
      perDay: n + (n === 1 ? ' task' : ' tasks'),
      ctaLabel: n === 0 ? 'Start my 60 days' : 'Start ' + (n <= 2 ? sel.map((k) => NAMES[k]).join(' + ') : NAMES[sel[0]] + ' + ' + (n - 1) + ' more'),
      p: Object.fromEntries(DAYS.map((d) => [d, (n * d).toLocaleString('en-US')])),
    };
  }

  function build() {
    const root = document.querySelector('#s5 .fit > div');
    if (!root) return false;
    if (root.querySelector('.rt')) return true;
    root.classList.add('rt-host');

    const wps = DAYS.map((d) => ({ d, xy: pt(rOfDay(d)) }));
    const el = document.createElement('div');
    el.className = 'rt';
    el.innerHTML = `
<svg class="rt-map" viewBox="0 0 1440 900" width="1440" height="900" aria-hidden="true">
  <defs>
    <radialGradient id="rtPeakLight" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#cfe0ff" stop-opacity=".18"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="rtCampLight" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffc98a" stop-opacity=".55"/><stop offset=".45" stop-color="#ff9a5a" stop-opacity=".16"/><stop offset="1" stop-color="#ff9a5a" stop-opacity="0"/></radialGradient>
    <radialGradient id="rtLamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe2b8" stop-opacity=".9"/><stop offset=".35" stop-color="#ffb866" stop-opacity=".35"/><stop offset="1" stop-color="#ffb866" stop-opacity="0"/></radialGradient>
    <linearGradient id="rtLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#070d1c" stop-opacity=".96"/><stop offset=".42" stop-color="#070d1c" stop-opacity=".82"/><stop offset=".62" stop-color="#070d1c" stop-opacity="0"/></linearGradient>
    <linearGradient id="rtRoute" gradientUnits="userSpaceOnUse" x1="${START[0]}" y1="${START[1]}" x2="${END[0]}" y2="${END[1]}"><stop offset="0" stop-color="#eaf2ff"/><stop offset=".75" stop-color="#cfe0ff"/><stop offset="1" stop-color="#ffd9a8"/></linearGradient>
    <filter id="rtGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <rect width="1440" height="900" fill="#0b1630"/>
  <g class="rt-topo">${grid()}${contours()}</g>
  <ellipse cx="${PEAK[0]}" cy="${PEAK[1] + 40}" rx="300" ry="190" fill="url(#rtPeakLight)"/>
  <ellipse cx="${END[0]}" cy="${END[1] + 10}" rx="260" ry="130" fill="url(#rtCampLight)" class="rt-camplight"/>
  <rect width="1440" height="900" fill="url(#rtLeft)"/>

  <!-- the route: a faint planned line, then the drawn line over it -->
  <path class="rt-plan" d="${routeD()}" fill="none" stroke="#9fbef0" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round" opacity=".45"/>
  <path class="rt-glow" d="${routeD()}" fill="none" stroke="#bcd4ff" stroke-width="10" stroke-linecap="round" opacity=".28" filter="url(#rtGlow)" pathLength="1000"/>
  <path class="rt-line" d="${routeD()}" fill="none" stroke="url(#rtRoute)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1000"/>

  <!-- summit: where the site began -->
  <g class="rt-summit">
    <path d="M${START[0]},${START[1]} V${START[1] - 34}" stroke="#dfe8ff" stroke-width="2"/>
    <path d="M${START[0]},${START[1] - 34} l22,5 l-22,7 z" fill="#3f7bff"/>
    <circle cx="${START[0]}" cy="${START[1]}" r="5" fill="#eaf2ff"/>
  </g>
  <!-- base camp: where it ends -->
  <g class="rt-camp">
    <path d="M${END[0] + 22},${END[1] + 4} l18,-26 l18,26 z" fill="#1c2b4d" stroke="#ffcf95" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M${END[0] + 34},${END[1] + 4} l6,-10 l6,10 z" fill="#ffd9a8" opacity=".85"/>
    <path d="M${END[0] + 48},${END[1] + 6} l13,-19 l13,19 z" fill="#162340" stroke="#ffcf95" stroke-width="1.2" stroke-linejoin="round" opacity=".85"/>
  </g>
  ${wps.map((w, i) => `
  <g class="rt-wp" style="--f:${fOfDay(w.d).toFixed(3)}">
    <circle cx="${w.xy[0]}" cy="${w.xy[1]}" r="34" fill="url(#rtLamp)" class="rt-lamp"/>
    <circle cx="${w.xy[0]}" cy="${w.xy[1]}" r="${i === 4 ? 8 : 6}" fill="#0b1630" stroke="#cfe0ff" stroke-width="2" class="rt-dot"/>
    <path d="M${w.xy[0] - 12},${w.xy[1]} H${w.xy[0] - 40}" stroke="#8fb0e8" stroke-width="1" opacity=".6"/>
  </g>`).join('')}
  <text x="${START[0] + 30}" y="${START[1] - 26}" class="rt-lbl">SUMMIT · DAY 45</text>
  <g class="rt-here" transform="translate(${END[0]},${END[1]})">
    <path d="M0,-12 C-9,-24 -15,-30 -15,-38 a15,15 0 0 1 30,0 c0,8 -6,14 -15,26z" fill="#ffb257" stroke="#fff3e0" stroke-width="2"/>
    <circle cx="0" cy="-38" r="5.5" fill="#0a1426"/>
    <ellipse class="rt-ping" cx="0" cy="0" rx="26" ry="9" fill="none" stroke="#ffb257" stroke-width="2"/>
  </g>
  <text x="${END[0] + 92}" y="${END[1] - 6}" class="rt-lbl warm">YOU ARE HERE</text>
  <text x="${END[0] + 92}" y="${END[1] + 10}" class="rt-lbl dim">BASE CAMP · DAY 0</text>
</svg>

<div class="rt-copy">
  <h2 class="rt-h">Pick your tasks.<br>Watch your route draw.</h2>
  <p class="rt-p">Choose what you’ll prove every day. The route is your climb: from base camp, where you are now, up to the summit.</p>
  <div class="rt-pick" role="group" aria-label="Daily tasks">
    ${ORDER.map((k) => `<button type="button" class="rt-tk" data-k="${k}" aria-pressed="false"><span class="rt-ic"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${ICON[k]}</svg></span><span class="rt-nm">${NAMES[k]}</span><span class="rt-ck" aria-hidden="true"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>`).join('')}
    <div class="rt-own"><span aria-hidden="true">+</span> Your own, in the app</div>
  </div>
  <div class="rt-count" aria-live="polite"><b class="rt-countv"></b></div>
</div>

${wps.map((w) => `
<div class="rt-ms" data-d="${w.d}" style="left:${(w.xy[0] - 40 - 290).toFixed(0)}px;top:${(w.xy[1] - 30).toFixed(0)}px;--f:${fOfDay(w.d).toFixed(3)}">
  <div class="rt-d">Day ${w.d}</div>
  <div class="rt-l">${MS[w.d]}</div>
  <div class="rt-n"><b data-p="${w.d}"></b> <span>tasks completed</span></div>
</div>`).join('')}

<div class="rt-final" style="left:${(END[0] + 96).toFixed(0)}px;top:${(END[1] - 176).toFixed(0)}px">
  <div class="rt-k">Day 60 · Winter arc complete</div>
  <div class="rt-big"><span class="rt-total"></span> <small>proofs</small></div>
  <div class="rt-sub"></div>
  <a class="rt-cta" href="${storeUrl}?cta=route" target="_blank" rel="noopener noreferrer">${APPLE}<span class="rt-ctal"></span></a>
</div>`;
    root.appendChild(el);

    /* state */
    let sel = ['gym', 'run', 'cold'];
    const $ = (s) => el.querySelector(s), $$ = (s) => [...el.querySelectorAll(s)];
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

    function render(redraw) {
      const v = vals(sel);
      el.dataset.n = String(v.n);
      $$('.rt-tk').forEach((b) => { const on = sel.includes(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $('.rt-countv').textContent = v.countLabel;
      $$('[data-p]').forEach((b) => { b.textContent = v.n ? v.p[b.dataset.p] : '—'; });
      $('.rt-total').textContent = v.total;
      $('.rt-sub').textContent = v.n ? `${v.perDay} a day, 60 days, every one on camera or ticked off.` : 'Pick at least one task to plan your 60 days.';
      $('.rt-ctal').textContent = v.ctaLabel;
      if (redraw && !REDUCED.matches) { el.classList.remove('drawn'); void el.offsetWidth; }
      requestAnimationFrame(() => el.classList.add('drawn'));
    }
    $$('.rt-tk').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      sel = sel.includes(k) ? sel.filter((x) => x !== k) : ORDER.filter((x) => sel.includes(x) || x === k);
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      render(true);
    }));

    // draw the route the first time the scene is actually on screen
    render(false);
    el.classList.remove('drawn');
    const pin = root.closest('.pin');
    const arm = () => {
      const on = pin && pin.classList.contains('on') && (typeof stateAt !== 'function' || stateAt(sy).i === 4 && stateAt(sy).e > .85);
      if (on) { el.classList.add('drawn'); return; }
      requestAnimationFrame(arm);
    };
    if (REDUCED.matches) el.classList.add('drawn'); else requestAnimationFrame(arm);
    return true;
  }

  /* the Cache -> Route transition flies into #fxTopo; give it this exact map */
  function syncTransitionMap() {
    const t = document.getElementById('fxTopo');
    if (!t) return;
    t.setAttribute('viewBox', '0 0 1440 900');
    t.innerHTML = `<rect width="1440" height="900" fill="#0b1630"/>${grid()}${contours()}`;
  }

  function resizeSection() {
    const s5 = document.getElementById('s5');
    if (!s5) return;
    s5.style.height = SECTION.height + 'vh';
    s5.dataset.t = String(SECTION.transition);
    try { if (typeof TR !== 'undefined' && Array.isArray(TR)) TR[4] = SECTION.transition; } catch (e) { /* not present */ }
    dispatchEvent(new Event('resize'));
  }

  resizeSection();
  syncTransitionMap();
  if (!build()) { let n = 0; const t = setInterval(() => { if (build() || ++n > 60) clearInterval(t); }, 100); }
})();
