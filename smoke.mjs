/* Pre-deploy smoke test.
 *
 * perf.js was written by an agent that stalled before it could verify its
 * own work, so the file is unproven. This does not try to reproduce its
 * performance claims; it answers the only question that blocks a deploy:
 * does the page still load, run and render on desktop and on a phone,
 * with no thrown errors?
 *
 *   node smoke.mjs            (expects dev.mjs already serving :9300)
 */
/* playwright-core lives in the content-engine project, not here, and ESM
   ignores NODE_PATH — so resolve it by absolute path rather than adding a
   second copy of a browser driver to this repo. */
const pw = await import(
  'file:///C:/Users/Owenl/Desktop/Arc26-Content-Engine-Bot/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;

const BASE = 'http://localhost:9300/';
const PROFILES = [
  { name: 'desktop 1440x900 DPR1', viewport: { width: 1440, height: 900 }, dsf: 1, mobile: false },
  { name: 'mac-ish 1680x1050 DPR2', viewport: { width: 1680, height: 1050 }, dsf: 2, mobile: false },
  { name: 'iphone 390x844 DPR3', viewport: { width: 390, height: 844 }, dsf: 3, mobile: true },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--enable-gpu', '--hide-scrollbars'],
});

let bad = 0;

for (const p of PROFILES) {
  const ctx = await browser.newContext({
    viewport: p.viewport,
    deviceScaleFactor: p.dsf,
    isMobile: p.mobile,
    hasTouch: p.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2500);

  // scroll the whole page the way a visitor would, and see if it survives
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.round(p.viewport.height * 0.8)) {
    await page.evaluate((yy) => scrollTo(0, yy), y);
    await page.waitForTimeout(90);
  }

  const state = await page.evaluate(() => ({
    html: document.documentElement.className || '(none)',
    pins: document.querySelectorAll('.pin').length,
    pinsOn: document.querySelectorAll('.pin.on').length,
    wraps: document.querySelectorAll('.wrap').length,
    flakes: document.querySelectorAll('.bz').length,
    scrollH: document.documentElement.scrollHeight,
    // did anything actually paint? a blank page is the failure we care about
    bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
    appstore: [...document.querySelectorAll('a[href*="apps.apple.com"]')].length,
    placeholder: document.documentElement.outerHTML.includes('YOUR_APP_ID'),
  }));

  const ok = errors.length === 0 && state.bodyText > 200 && state.pins > 0 && !state.placeholder;
  if (!ok) bad++;
  console.log('\n' + (ok ? 'PASS' : 'FAIL') + '  ' + p.name);
  console.log('  html class   ' + state.html);
  console.log('  pins         ' + state.pinsOn + ' on / ' + state.pins + '   wraps ' + state.wraps);
  console.log('  blizzard     ' + state.flakes + ' flakes');
  console.log('  scrollHeight ' + state.scrollH);
  console.log('  text chars   ' + state.bodyText);
  console.log('  appstore     ' + state.appstore + ' links, placeholder=' + state.placeholder);
  if (errors.length) {
    console.log('  ERRORS:');
    for (const e of [...new Set(errors)].slice(0, 8)) console.log('    - ' + e.slice(0, 160));
  }

  await page.screenshot({ path: 'smoke-' + p.name.split(' ')[0] + '.png' });
  await ctx.close();
}

await browser.close();
console.log('\n' + (bad ? bad + ' PROFILE(S) FAILED' : 'all profiles passed') + '\n');
process.exit(bad ? 1 : 0);
