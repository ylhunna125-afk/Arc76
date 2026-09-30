/* Arc76 — the crate scene (#s4), rebuilt.
 *
 * Injected by dev.mjs next to crate.css. Lives outside index.html because
 * the design tool's export replaces that file wholesale. It mounts into
 * the scene root at load and draws everything on the scene's own
 * 1440x900 canvas, so --k scales it like every other scene.
 *
 * The export's own crate art, side crates, beam, "tap to open" pill and
 * phones are covered or hidden by crate.css. The headline and the
 * "Earn your first crate" CTA are the export's own and stay untouched.
 *
 * Editing the pool: change TIERS below. `odds` is deliberately null on
 * every tier: no drop rates are published yet. Put a string in (e.g.
 * '3%') and the empty slot in the reward pool fills itself.
 */
(() => {
  'use strict';
  if (window.__arc76Crate) return;
  window.__arc76Crate = true;

  const BASE = window.__arc76CrateBase || (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/crate\.js.*$/, '') : 'crate/');

  // lowest to highest. Colours match the app's own reward screens
  // (common blue, rare gold, legendary red); epic sits between in violet.
  const TIERS = [
    { id: 'common', name: 'Common', lvl: 1, kind: 'time', title: '15 min app time', sub: 'Added to your time', odds: null },
    { id: 'rare', name: 'Rare', lvl: 2, kind: 'xp', title: '+250 XP', value: '+250', unit: 'XP', sub: 'Experience points', odds: null },
    { id: 'epic', name: 'Epic', lvl: 3, kind: 'pfp', title: 'Profile picture', img: 'pfp-epic.png', sub: 'Added to your profile', odds: null },
    { id: 'legendary', name: 'Legendary', lvl: 4, kind: 'pfp', title: 'Profile picture', img: 'pfp-legendary.png', sub: 'Added to your profile', odds: null },
  ];
  const BY = Object.fromEntries(TIERS.map((t) => [t.id, t]));
  // what the crate gives when the visitor opens it without picking a tier:
  // the top of the ladder first, then round the rest so they can compare
  const ORDER = ['legendary', 'common', 'rare', 'epic'];

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  const CHARGE = { common: 700, rare: 850, epic: 1000, legendary: 1350 };

  const bars = (n) => '<span class="crx-lv" aria-hidden="true">' + [1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('') + '</span>';
  const gem = '<span class="crx-gem" aria-hidden="true"></span>';

  function ring(size, stroke, frac, inner) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<svg class="crx-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${size / 2 - 1}" y="${stroke + 5}" width="2" height="6" rx="1" fill="currentColor" opacity=".45" transform="rotate(${i * 90} ${size / 2} ${size / 2})"/>`).join('')}
      ${inner || ''}</svg>`;
  }

  function art(t, big) {
    if (t.kind === 'pfp') return `<span class="crx-pfp"><img src="${BASE}${t.img}" alt="" width="320" height="320" decoding="async"></span>`;
    if (t.kind === 'xp') return big
      ? `<span class="crx-xp"><img src="${BASE}xp-badge.png" alt="" decoding="async"><span class="crx-num">${t.value}<small>${t.unit}</small></span></span>`
      : `<span class="crx-xpmini"><img src="${BASE}xp-badge.png" alt="" decoding="async"></span>`;
    // generic "app time": a timer ring, no third-party marks
    return big
      ? `<span class="crx-time">${ring(128, 7, 0.25)}<span class="crx-time-v"><b>15</b><small>MIN</small></span></span>`
      : `<span class="crx-timemini">${ring(44, 3.5, 0.25)}<b>15</b></span>`;
  }

  function crateSVG() {
    // canvas coords. Camera sits a little left of centre, so the right side shows.
    return `
<svg class="crx-crate" viewBox="0 0 1440 900" width="1440" height="900" aria-hidden="true">
 <defs>
  <linearGradient id="crxFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2636"/><stop offset=".55" stop-color="#121826"/><stop offset="1" stop-color="#0a0e17"/></linearGradient>
  <linearGradient id="crxSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b0f18"/><stop offset="1" stop-color="#06080e"/></linearGradient>
  <linearGradient id="crxLidTop" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2b3548"/><stop offset="1" stop-color="#1a2130"/></linearGradient>
  <linearGradient id="crxSteel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a3344"/><stop offset=".45" stop-color="#5b677d"/><stop offset=".55" stop-color="#48536a"/><stop offset="1" stop-color="#232b3a"/></linearGradient>
  <linearGradient id="crxInside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02040a"/><stop offset="1" stop-color="#0b111d"/></linearGradient>
  <linearGradient id="crxMouth" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".35" style="stop-color:var(--tc)"/><stop offset="1" style="stop-color:var(--tc)" stop-opacity=".4"/></linearGradient>
  <linearGradient id="crxDrift" gradientUnits="userSpaceOnUse" x1="0" y1="740" x2="0" y2="846"><stop offset="0" stop-color="#e3ecfa"/><stop offset=".45" stop-color="#8ea2c6"/><stop offset="1" stop-color="#22324f" stop-opacity="0"/></linearGradient>
  <filter id="crxBlur12" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="12"/></filter>
  <filter id="crxBlur4" x="-10%" y="-100%" width="120%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>
 </defs>
 <!-- weight: a soft contact shadow, then a tight occlusion line where it meets the snow -->
 <ellipse cx="742" cy="752" rx="250" ry="24" fill="#01030a" opacity=".7" filter="url(#crxBlur12)"/>
 <ellipse cx="736" cy="745" rx="192" ry="7" fill="#000" opacity=".85" filter="url(#crxBlur4)"/>
 <g class="crx-rig">
 <g class="crx-body">
  <!-- right side -->
  <polygon points="880,594 912,556 912,706 880,746" fill="url(#crxSide)"/>
  <polygon points="880,594 912,556 912,566 880,604" fill="#3b4558" opacity=".7"/>
  <!-- the open mouth: dark inside, filled with the tier's light once open -->
  <polygon points="566,592 876,592 906,560 600,560" fill="url(#crxInside)"/>
  <polygon class="crx-mouth" points="572,590 872,590 900,562 604,562" fill="url(#crxMouth)"/>
  <!-- front face: planks -->
  <rect x="560" y="594" width="320" height="152" rx="3" fill="url(#crxFront)"/>
  ${[632, 670, 708].map((y) => `<rect x="560" y="${y}" width="320" height="1.5" fill="#05070c" opacity=".8"/><rect x="560" y="${y + 1.5}" width="320" height="1" fill="#2c3547" opacity=".5"/>`).join('')}
  <!-- steel: top rim, two straps, corner guards, rivets -->
  <rect x="560" y="594" width="320" height="9" fill="url(#crxSteel)"/>
  <rect x="560" y="738" width="320" height="8" fill="#1b2230"/>
  ${[590, 832].map((x) => `<rect x="${x}" y="594" width="18" height="152" fill="url(#crxSteel)"/>` + [612, 652, 692, 730].map((y) => `<circle cx="${x + 9}" cy="${y}" r="2.4" fill="#8e9ab0"/><circle cx="${x + 9}" cy="${y + .8}" r="2.4" fill="none" stroke="#0b0f18" stroke-width=".8" opacity=".6"/>`).join('')).join('')}
  <path d="M560,594 h26 v8 h-18 v144 h-8 z M880,594 h-26 v8 h18 v144 h8 z" fill="#6b778d"/>
  <!-- emblem plate -->
  <rect x="682" y="628" width="76" height="76" rx="8" fill="#0a0e17" stroke="#2c3649" stroke-width="1.5"/>
  <image href="${BASE.replace(/crate\/$/, '')}assets/logo-blue.png" x="688" y="634" width="64" height="64"/>
 </g>
 <!-- light escaping round the lid while it is shut -->
 <rect class="crx-seam" x="566" y="591" width="310" height="5" rx="2.5" style="fill:var(--tc)"/>
 <g class="crx-lid">
  <polygon points="552,560 890,560 920,524 590,524" fill="url(#crxLidTop)"/>
  <polygon points="590,524 920,524 918,528 592,528" fill="#56627a" opacity=".8"/>
  <polygon points="890,560 920,524 920,562 890,598" fill="url(#crxSide)"/>
  <rect x="552" y="560" width="338" height="38" rx="3" fill="url(#crxFront)"/>
  <rect x="552" y="560" width="338" height="7" fill="url(#crxSteel)"/>
  ${[590, 832].map((x) => `<rect x="${x}" y="560" width="18" height="38" fill="url(#crxSteel)"/><polygon points="${x},560 ${x + 18},560 ${x + 18 + 30 * ((x - 552) / 338) + 4},524 ${x + 30 * ((x - 552) / 338) + 4},524" fill="url(#crxSteel)" opacity=".9"/>`).join('')}
  <path d="M552,560 h28 v7 h-21 v31 h-7 z M890,560 h-28 v7 h21 v31 h7 z" fill="#6b778d"/>
  <!-- clasp -->
  <rect x="704" y="584" width="32" height="30" rx="4" fill="#0a0e17" stroke="#6b778d" stroke-width="2"/>
  <circle cx="720" cy="596" r="3.5" fill="#6b778d"/><rect x="718.6" y="597" width="2.8" height="8" rx="1.2" fill="#6b778d"/>
 </g>
 </g>
 <!-- snow banked against the base: it is sitting in the snow, not on it -->
 <path d="M330,818 C450,790 530,752 590,742 C640,739 700,746 760,744 C820,742 872,738 905,742 C970,752 1040,786 1160,818 C1080,836 940,846 745,846 C550,846 410,836 330,818 Z" fill="url(#crxDrift)"/>
 <path d="M540,752 C600,742 700,750 780,747 C850,745 900,746 950,760" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>
</svg>`;
  }

  function bg() {
    const stars = Array.from({ length: 60 }, (_, i) => {
      const x = (i * 197.3) % 1440, y = (i * 83.7) % 420, r = i % 7 === 0 ? 1.4 : 0.9;
      return `<circle cx="${x.toFixed(0)}" cy="${(y + 70).toFixed(0)}" r="${r}" fill="#dbe6ff" opacity="${(0.25 + (i % 5) * 0.12).toFixed(2)}"/>`;
    }).join('');
    return `
<svg class="crx-bg" viewBox="0 0 1440 900" width="1440" height="900" aria-hidden="true">
 <defs>
  <linearGradient id="crxSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a16"/><stop offset=".55" stop-color="#0c1730"/><stop offset=".72" stop-color="#162646"/><stop offset="1" stop-color="#0a1426"/></linearGradient>
  <linearGradient id="crxField" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3e63"/><stop offset=".35" stop-color="#1c2a47"/><stop offset="1" stop-color="#0b1325"/></linearGradient>
  <linearGradient id="crxMist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f86b8" stop-opacity="0"/><stop offset="1" stop-color="#6f86b8" stop-opacity=".22"/></linearGradient>
 </defs>
 <rect width="1440" height="900" fill="url(#crxSky)"/>
 ${stars}
 <path d="M-20,600 L80,548 L150,566 L250,512 L330,548 L420,500 L520,556 L600,530 L700,572 L800,520 L880,552 L980,494 L1080,540 L1170,508 L1260,548 L1350,516 L1460,560 L1460,640 L-20,640 Z" fill="#131f3a"/>
 <rect y="520" width="1440" height="120" fill="url(#crxMist)"/>
 <path d="M-20,640 C200,618 420,626 640,620 C860,614 1100,622 1460,634 L1460,900 L-20,900 Z" fill="url(#crxField)"/>
 <path d="M-20,640 C200,618 420,626 640,620 C860,614 1100,622 1460,634" fill="none" stroke="#9fb3d8" stroke-width="1.5" opacity=".35"/>
 ${[[90, 700, 150], [300, 812, 220], [1160, 690, 180], [1060, 840, 260], [180, 860, 200]].map(([x, y, w]) => `<path d="M${x},${y} q${w / 2},-8 ${w},0" fill="none" stroke="#7d93bf" stroke-width="1.2" opacity=".35"/>`).join('')}
</svg>`;
  }

  function cardHTML(t) {
    return `
<div class="crx-card-glow" aria-hidden="true"></div>
<div class="crx-card-edge" aria-hidden="true"></div>
<div class="crx-card-in">
  <div class="crx-tierline">${gem}<b>${t.name}</b>${bars(t.lvl)}</div>
  <div class="crx-art">${art(t, true)}</div>
  <div class="crx-name">${t.kind === 'xp' ? 'Experience' : t.title}</div>
  <div class="crx-sub">${t.sub}</div>
  <button type="button" class="crx-again">Open another</button>
</div>
<span class="crx-corner tl" aria-hidden="true"></span><span class="crx-corner tr" aria-hidden="true"></span>
<span class="crx-corner bl" aria-hidden="true"></span><span class="crx-corner br" aria-hidden="true"></span>`;
  }

  function poolHTML() {
    const rows = TIERS.slice().reverse().map((t) => `
    <li><button type="button" class="crx-row t-${t.id}" data-tier="${t.id}" aria-label="Preview a ${t.name.toLowerCase()} drop: ${t.title}">
      <span class="crx-thumb">${art(t, false)}</span>
      <span class="crx-row-main">
        <span class="crx-row-top">${gem}<b>${t.name}</b>${bars(t.lvl)}</span>
        <span class="crx-row-name">${t.title}</span>
        <span class="crx-row-kind">${t.kind === 'pfp' ? 'Cosmetic' : t.kind === 'xp' ? 'Progression' : 'Screen time unlock'}</span>
      </span>
      <span class="crx-odds${t.odds ? ' has' : ''}" data-odds="${t.odds || ''}"><em>Odds</em><span>${t.odds || '—'}</span></span>
    </button></li>`).join('');
    return `
<div class="crx-pool-head"><b>Inside every crate</b><span>Four tiers. Tap one to preview it.</span></div>
<ol class="crx-ladder">${rows}</ol>`;
  }

  function build() {
    const root = document.querySelector('#s4 .fit > div');
    if (!root || root.querySelector('#crx')) return !!root;
    const el = document.createElement('div');
    el.id = 'crx';
    el.className = 'crx';
    el.dataset.state = 'idle';
    el.style.setProperty('--tc', '#9cc3ff');
    el.innerHTML = `
${bg()}
<div class="crx-light" aria-hidden="true"><i class="crx-col"></i><i class="crx-spill"></i></div>
${crateSVG()}
<button type="button" class="crx-hit" aria-label="Open the crate"></button>
<div class="crx-prompt" aria-hidden="true"><span>Open the crate</span></div>
<div class="crx-card" role="status" aria-live="polite"></div>
<aside class="crx-pool" aria-label="What is inside a crate">${poolHTML()}</aside>`;
    root.appendChild(el);
    root.classList.add('crx-host');
    wire(el);
    return true;
  }

  function wire(el) {
    const card = el.querySelector('.crx-card');
    const rows = [...el.querySelectorAll('.crx-row')];
    let n = 0, timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };

    function reset() {
      clear();
      el.dataset.state = 'idle';
      el.removeAttribute('data-tier');
      rows.forEach((r) => r.classList.remove('on'));
    }

    function open(id) {
      const t = BY[id] || BY[ORDER[n++ % ORDER.length]];
      const wasOpen = el.dataset.state !== 'idle';
      clear();
      if (wasOpen) { el.dataset.state = 'closing'; }
      const go = () => {
        el.dataset.tier = t.id;
        el.style.setProperty('--tc', `var(--t-${t.id})`);
        card.className = `crx-card t-${t.id} k-${t.kind}`;
        card.innerHTML = cardHTML(t);
        card.querySelector('.crx-again').addEventListener('click', () => open());
        rows.forEach((r) => r.classList.toggle('on', r.dataset.tier === t.id));
        if (REDUCED.matches) { el.dataset.state = 'open'; return; }
        el.dataset.state = 'charging';
        void el.offsetWidth;
        later(() => { el.dataset.state = 'open'; }, CHARGE[t.id]);
      };
      if (wasOpen && !REDUCED.matches) later(go, 420); else go();
    }

    el.querySelector('.crx-hit').addEventListener('click', () => {
      if (el.dataset.state === 'idle') open();
    });
    rows.forEach((r) => r.addEventListener('click', () => open(r.dataset.tier)));
    el.__crx = { open, reset };
  }

  if (!build()) {
    let tries = 0;
    const t = setInterval(() => { if (build() || ++tries > 60) clearInterval(t); }, 100);
  }
})();
