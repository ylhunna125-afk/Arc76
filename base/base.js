/* Arc76 — Base Camp (#s6), the closing screen.
 *
 * Injected next to base.css (dev.mjs locally; assemble.py for the hosted
 * build). Kept out of index.html because every design-tool export
 * replaces that file wholesale.
 *
 * It keeps the export's backdrop (the lit route up the mountain to the
 * flag) and the export's App Store badge node, and replaces the copy,
 * stat band, QR and FAQ with the layout below.
 *
 * STRUCTURE CHANGE: it shortens #s6 at runtime (see SECTION below) so the
 * page ends the moment the scene settles. #s6 is the last .wrap, so its
 * offsetTop is unchanged and scroll-fix.js's snap targets are unaffected.
 */
(() => {
  'use strict';
  if (window.__arc76Base) return;
  window.__arc76Base = true;

  /* ---------- fill these in ---------- */
  const CONFIG = {
    company: 'Incognito Labs Limited',
    privacyUrl: '',          // e.g. the URL listed on your App Store page
    contactEmail: '',        // shown as text as well as a link
    showEyebrowAndChips: false, // sections 1-5 currently have none; set true to add them here
  };
  /* the move from Your 60 Days into Base Camp, in screen heights. The
     section is sized to (transition + 1 screen) so nothing is left to
     scroll once the scene has arrived. */
  const SECTION = { transition: 1.0 };

  const FAQ = [
    ['Is Arc76 free?', 'Arc76 is free to download. Some features are available as in-app purchases.'],
    ['Is it iPhone only?', 'Yes. Arc76 is on the App Store for iPhone.'],
    ['What counts as proof?', 'Some tasks need a photo taken in the app to confirm them. Others are ticked off when you’re done.'],
    ['What happens if I miss a day?', 'You slip back down. The climb only counts the days you proved.'],
    ['Is it just for fitness?', 'No. Gym and runs are there, and you can add your own tasks: reading, study, anything you want to prove.'],
  ];

  const year = new Date().getFullYear();
  const storeUrl = (typeof APP_STORE_URL !== 'undefined' ? APP_STORE_URL : 'https://apps.apple.com/app/id6794336316');

  function resizeSection() {
    const s6 = document.getElementById('s6');
    if (!s6) return;
    s6.dataset.t = String(SECTION.transition);
    s6.style.height = ((SECTION.transition + 1) * 100) + 'vh';
    // the camera script reads data-t once at load; keep it in step
    try { if (typeof TR !== 'undefined' && Array.isArray(TR)) TR[5] = SECTION.transition; } catch (e) { /* not present locally */ }
    dispatchEvent(new Event('resize'));
  }

  function faqHTML() {
    return FAQ.map(([q, a], i) => `
      <details class="bc-q" name="bc-faq"${i === 0 ? '' : ''}>
        <summary><span>${q}</span><i aria-hidden="true"></i></summary>
        <p>${a}</p>
      </details>`).join('');
  }

  function footerHTML() {
    const priv = CONFIG.privacyUrl
      ? `<a href="${CONFIG.privacyUrl}" target="_blank" rel="noopener noreferrer">Privacy policy</a>`
      : `<a class="bc-missing" href="#" title="Set privacyUrl in base/base.js" aria-disabled="true">Privacy policy</a>`;
    const contact = CONFIG.contactEmail
      ? `<a href="mailto:${CONFIG.contactEmail}">Contact</a><span class="bc-mail">${CONFIG.contactEmail}</span>`
      : `<a class="bc-missing" href="#" title="Set contactEmail in base/base.js" aria-disabled="true">Contact</a>`;
    return `
      <span class="bc-co">© ${year} ${CONFIG.company}</span>
      <nav class="bc-links" aria-label="Legal and contact">${priv}<span class="bc-dot" aria-hidden="true"></span>${contact}</nav>
      <a class="bc-top" href="#" data-go="summit">Back to the summit <span aria-hidden="true">↑</span></a>`;
  }

  function build() {
    const root = document.querySelector('#s6 .fit > div');
    if (!root) return false;
    if (root.querySelector('.bc')) return true;

    const badge = root.querySelector('a.bigstore');
    const el = document.createElement('div');
    el.className = 'bc' + (CONFIG.showEyebrowAndChips ? ' bc-full' : '');
    el.innerHTML = `
<div class="bc-scrim" aria-hidden="true"></div>

<div class="bc-copy">
  <div class="bc-eyebrow">07 — Base camp</div>
  <h2 class="bc-h">Start at the bottom.<br>Prove every step up.</h2>
  <p class="bc-p">Pick your tasks. Prove each one with a photo. Miss a day and the ladder drops you. Sixty days of that and you’re standing where this page began.</p>
  <div class="bc-chips"><span>Photo proof</span><span>60 days</span><span>No shortcuts</span></div>

  <div class="bc-cta">
    <div class="bc-cta-main">
      <div class="bc-halo" aria-hidden="true"></div>
      <div class="bc-badge-slot"></div>
    </div>
    <div class="bc-cta-note">Free to download<br>In-app purchases</div>
    <div class="bc-qr">
      <div class="bc-qr-code" aria-hidden="true"></div>
      <div class="bc-qr-t"><b>On a computer?</b><span>Scan with your iPhone camera.</span></div>
    </div>
  </div>
</div>

<aside class="bc-faq" aria-label="Questions">
  <div class="bc-faq-h">Questions</div>
  ${faqHTML()}
</aside>

<footer class="bc-foot">${footerHTML()}</footer>`;
    root.appendChild(el);
    root.classList.add('bc-host');

    // the export's own badge (its href is already rewritten to APP_STORE_URL)
    const slot = el.querySelector('.bc-badge-slot');
    if (badge) { slot.appendChild(badge); badge.setAttribute('aria-label', 'Download Arc76 on the App Store'); }
    else slot.innerHTML = `<a class="bigstore" href="${storeUrl}?cta=base" target="_blank" rel="noopener noreferrer">Download on the App Store</a>`;

    // QR: a real one when qrcodejs is present, otherwise the export's placeholder
    const q = el.querySelector('.bc-qr-code');
    if (window.QRCode) {
      new QRCode(q, { text: storeUrl + '?cta=qr', width: 84, height: 84, colorDark: '#0a1024', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    } else {
      const old = root.querySelector('.qr svg');
      if (old) q.appendChild(old.cloneNode(true));
    }

    // one answer open at a time (older browsers ignore details[name])
    const qs = [...el.querySelectorAll('.bc-q')];
    qs.forEach((d) => d.addEventListener('toggle', () => { if (d.open) qs.forEach((o) => { if (o !== d) o.open = false; }); }));
    el.querySelectorAll('.bc-missing').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
    return true;
  }

  /* the copy and FAQ ride in with the scene but only resolve as it lands,
     so the zoom from the route map never drags oversized text across the frame */
  function arrival() {
    const el = document.querySelector('.bc');
    /* In static phone mode (mobile/static.js) there is no route -> base
       camp move to ride in on, and stateAt() would report i < 5 for the
       whole page above this section — which resolved to --bc-in: 0, i.e.
       the entire base-camp block, its App Store button and the footer
       rendered invisible. Pin it open and stop the loop. */
    if (window.__arc76Static) { if (el) el.style.setProperty('--bc-in', '1'); return; }
    if (el && typeof stateAt === 'function' && typeof sy !== 'undefined') {
      const s = stateAt(sy);
      const k = s.i < 5 ? 0 : Math.max(0, Math.min(1, (s.e - 0.72) / 0.28));
      el.style.setProperty('--bc-in', (k * k * (3 - 2 * k)).toFixed(3));
    } else if (el) el.style.setProperty('--bc-in', '1');
    requestAnimationFrame(arrival);
  }

  resizeSection();
  requestAnimationFrame(arrival);
  if (!build()) {
    let n = 0;
    const t = setInterval(() => { if (build() || ++n > 60) clearInterval(t); }, 100);
  }
})();
