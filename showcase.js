/* Phone showcase — mounts the fan of app screens into the summit scene.
 *
 * Kept out of index.html on purpose: every export from the design tool
 * replaces that file wholesale, so anything added to it is gone on the
 * next download. dev.mjs injects this instead.
 *
 * It mounts inside [data-stage] rather than next to it, because that is
 * where .hero lives and .hero fades via --heroO as the camera descends.
 * Sitting in the same place means the showcase leaves with the rest of
 * the summit copy for free, instead of floating over the descent.
 *
 * Screens reuse the site's own assets/screen-*.jpg. The export shipped
 * its own re-encoded copies of the same five shots; loading those too
 * would double the image weight for no visible gain.
 */
(() => {
  'use strict';
  if (document.getElementById('arc-showcase')) return;

  // fan order matches the design: 60days / home / mind(centre) / crate / pfp
  const PHONES = [
    { cls: 'p1', img: 'screen-60days.jpg', alt: 'Arc76 onboarding: your 60 day journey chart',
      buttons: [['left', 150, 34], ['left', 200, 58]] },
    { cls: 'p2', img: 'screen-home.jpg', alt: 'Arc76 home screen: blocked app timer and the day’s tasks',
      buttons: [['left', 150, 34], ['left', 200, 58]] },
    { cls: 'p5', img: 'screen-pfp.jpg', alt: 'Arc76 reward: a legendary profile picture unlocked',
      buttons: [['right', 190, 76]] },
    { cls: 'p4', img: 'screen-crate.jpg', alt: 'Arc76 crate earned after completing the day’s tasks',
      buttons: [['right', 190, 76]] },
    { cls: 'p3', img: 'screen-mind.jpg', alt: 'Arc76 mind screen: earn screen time with brain games',
      buttons: [['left', 150, 34], ['right', 190, 76]] },
  ];

  function build() {
    const stage = document.querySelector('#s1 [data-stage]');
    if (!stage) return false;

    const root = document.createElement('div');
    root.id = 'arc-showcase';
    root.setAttribute('aria-label', 'Arc76 app screens');

    const inner = document.createElement('div');
    inner.className = 'shw-in';

    const glow = document.createElement('div');
    glow.className = 'shw-glow';
    const floor = document.createElement('div');
    floor.className = 'shw-floor';
    inner.append(glow, floor);

    for (const ph of PHONES) {
      const el = document.createElement('div');
      el.className = 'ph ' + ph.cls;

      const fl = document.createElement('div');
      fl.className = 'fl';
      const dev = document.createElement('div');
      dev.className = 'dev';

      for (const [side, top, h] of ph.buttons) {
        const b = document.createElement('div');
        b.className = 'btn-side';
        b.style[side] = '-2px';
        b.style.top = top + 'px';
        b.style.height = h + 'px';
        dev.appendChild(b);
      }

      const scr = document.createElement('div');
      scr.className = 'scr';
      const img = document.createElement('img');
      img.src = 'assets/' + ph.img;
      img.alt = ph.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 591; img.height = 1280;
      const island = document.createElement('div');
      island.className = 'island';
      scr.append(img, island);

      dev.appendChild(scr);
      fl.appendChild(dev);
      el.appendChild(fl);
      inner.appendChild(el);
    }

    root.appendChild(inner);
    stage.appendChild(root);
    return true;
  }

  if (!build()) {
    // the scene is mounted by the page's own script, which may not have
    // run yet; retry briefly rather than racing it
    let tries = 0;
    const t = setInterval(() => {
      if (build() || ++tries > 40) clearInterval(t);
    }, 100);
  }
})();
