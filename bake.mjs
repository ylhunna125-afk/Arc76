/* Build a deployable copy of the site.
 *
 *   node bake.mjs          -> writes ./dist
 *
 * dev.mjs applies the scroll fix, the framing fix and the showcase to the
 * HTTP RESPONSE, so the file on disk stays exactly what the design tool
 * exported. That is right for local work and useless for a static host,
 * which never runs dev.mjs. This writes those same changes into real
 * files so the deployed site behaves like localhost does.
 *
 * Re-run it after every export before you deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

/* Kept in step with dev.mjs by hand. If you change one, change the other;
   the alternative is importing across them and making the dev server
   depend on the build script, which is worse. */
const RE_S1 = /(id="s1"[^>]*?height:\s*)(\d+(?:\.\d+)?)vh/;
const RE_DESCENT = /(const\s+DESCENT_VH\s*=\s*)([0-9.]+)/;
const RE_HTMLTAG = /<html(\s|>)/i;

/* Do NOT hardcode the descent length. Each export retunes it (2.2 -> 1.6
   -> 1.4) and forcing a stale value makes the intro slower than the
   design tool intended. Read what the export asks for, and only trim the
   dead scroll after it: s1 needs the descent plus a short hold on the
   camp, and exports routinely leave 60-100vh of nothing beyond that. */
const HOLD_VH = 25;

/* The design tool ships every App Store link as id_YOUR_APP_ID. Nine of
   them, across index.html, base/base.js and route/route.js — i.e. every
   conversion path on the site, dead. Verified against Apple's lookup API:
   id 6794336316 is Arc76, INCOGNITO LABS LIMITED, Free, iOS 17+.
   No country code on purpose: apps.apple.com/app/id... redirects each
   visitor to their own storefront, a /us/ or /gb/ path pins everyone to
   one country's store. */
const APP_ID = '6794336316';
const RE_APPID = /id_YOUR_APP_ID/g;

/* Copy everything the export ships rather than a fixed list: exports add
   new folders (base/, crate/, route/) and a stale allowlist silently
   deploys a site with missing stylesheets. */
const SKIP = new Set(['dist', 'node_modules', '.wrangler', '.git',
  'dev.mjs', 'bake.mjs', 'index.html', 'Claude outputs']);
const isSkipped = (n) => SKIP.has(n) || n.endsWith('.zip')
  || n.endsWith('.bak') || n.includes('.prev-');

function copyRec(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyRec(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const before = html;

const dm = html.match(RE_DESCENT);
if (!dm) { console.error('  BAKE FAILED: no DESCENT_VH in the export'); process.exit(1); }
const DESCENT = parseFloat(dm[2]);
const S1_VH = Math.round(DESCENT * 100) + HOLD_VH;

html = html.replace(RE_S1, (m, pre) => pre + S1_VH + 'vh');
html = html.replace(RE_HTMLTAG, '<html data-descent-vh="' + DESCENT + '"$1');
if (!html.includes('scroll-fix.js')) {
  html = html.replace('</body>',
    '<link rel="stylesheet" href="/showcase.css">\n'
    + '<script src="/scroll-fix.js" defer></script>\n'
    + '<script src="/showcase.js" defer></script>\n'
    + '</body>');
}

// a silently-unpatched build is worse than a failed one: it looks fine
// until you scroll, on a URL you have already given people
const checks = [
  ['s1 height', new RegExp('id="s1"[^>]*?height:\\s*' + S1_VH + 'vh')],
  ['scroll-fix tag', /scroll-fix\.js/],
  ['showcase tag', /showcase\.js/],
];
const failed = checks.filter(([, re]) => !re.test(html)).map(([n]) => n);
if (html === before) failed.push('nothing was rewritten at all');
if (failed.length) {
  console.error('\n  BAKE FAILED — the export probably changed shape:');
  for (const f of failed) console.error('    - ' + f);
  console.error('\n  Fix the patterns in bake.mjs and dev.mjs, then re-run.\n');
  process.exit(1);
}

fs.writeFileSync(path.join(DIST, 'index.html'), html);
let copied = 0;
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (isSkipped(e.name)) continue;
  const src = path.join(ROOT, e.name), dst = path.join(DIST, e.name);
  if (e.isDirectory()) copyRec(src, dst); else fs.copyFileSync(src, dst);
  copied++;
}
for (const need of ['scroll-fix.js', 'showcase.js', 'showcase.css']) {
  if (!fs.existsSync(path.join(DIST, need))) {
    console.error('  BAKE FAILED: missing ' + need); process.exit(1);
  }
}

/* Replace the App Store placeholder everywhere, including the module JS
   that bake copies verbatim. Then refuse to ship if one survived: a live
   site whose only CTA 404s is worse than a failed build. */
let patchedLinks = 0;
function fixLinks(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { fixLinks(f); continue; }
    if (!/\.(html|js|css)$/i.test(e.name)) continue;
    const t = fs.readFileSync(f, 'utf8');
    if (!RE_APPID.test(t)) { RE_APPID.lastIndex = 0; continue; }
    RE_APPID.lastIndex = 0;
    const out = t.replace(RE_APPID, 'id' + APP_ID);
    patchedLinks += (t.match(RE_APPID) || []).length;
    RE_APPID.lastIndex = 0;
    fs.writeFileSync(f, out);
  }
}
fixLinks(DIST);

const leftovers = [];
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { scan(f); continue; }
    if (!/\.(html|js|css)$/i.test(e.name)) continue;
    if (fs.readFileSync(f, 'utf8').includes('YOUR_APP_ID')) leftovers.push(e.name);
  }
})(DIST);
if (leftovers.length) {
  console.error('  BAKE FAILED: App Store placeholder survived in ' + leftovers.join(', '));
  process.exit(1);
}

// .app is HSTS-preloaded, so the browser refuses plain HTTP outright.
// Cloudflare Pages serves HTTPS by default; this just pins the headers.
fs.writeFileSync(path.join(DIST, '_headers'),
`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
`);

const size = (d) => fs.readdirSync(d, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name))
    : fs.statSync(path.join(d, e.name)).size), 0);

console.log('\n  baked -> ' + DIST);
console.log('  ' + (size(DIST) / 1048576).toFixed(1) + ' MB');
console.log('\n  deploy:  npx wrangler pages deploy dist --project-name arc76\n');
