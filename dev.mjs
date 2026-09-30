/* Arc76 local dev server: live reload + auto-install from Downloads.
 *
 *   node dev.mjs            -> http://localhost:9300
 *   node dev.mjs 9400       -> a different port
 *
 * Two jobs:
 *
 * 1. LIVE RELOAD. Any file that changes in this folder reloads every open
 *    browser tab. A <script> is injected into served HTML that listens on
 *    an SSE stream; nothing is written to your files.
 *
 * 2. AUTO-INSTALL. Watches your Downloads folder. Export from Claude, hit
 *    download, and the new build lands here and the page refreshes on its
 *    own. No unzipping, no dragging files around.
 *
 *    It only touches downloads whose name matches MATCH below and that
 *    arrived after this server started, so it can never resurrect an old
 *    export sitting in Downloads from last week.
 *
 * Zero dependencies.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] || 9300);
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
const MATCH = /arc76|arc-76/i;          // which downloads belong to this site
const STARTED = Date.now();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/* ── live reload ────────────────────────────────────────────────────── */
const clients = new Set();
function reloadAll(why) {
  for (const res of clients) res.write('data: reload\n\n');
  if (clients.size) console.log(`  ↻ reloaded ${clients.size} tab(s) — ${why}`);
}

const INJECT = `
<script>
// injected by dev.mjs — not part of your source
(() => {
  let es;
  const connect = () => {
    es = new EventSource('/__reload');
    es.onmessage = () => location.reload();
    es.onerror = () => { es.close(); setTimeout(connect, 700); };
  };
  connect();
})();
</script>`;

/* -- scroll fix, applied to the RESPONSE not the file ----------------
 * Every export from the design tool replaces index.html wholesale, so a
 * patch written to disk is gone the next time you hit download. Rewriting
 * the response instead means the fix survives every export, and the file
 * on disk stays exactly what the design tool produced.
 *
 * s1 is authored at 420vh but its descent finishes at DESCENT_VH screens,
 * and s2 only begins entering 100vh before s1 ends (margin-top:-100vh).
 * That left roughly a screen and a half of scrolling with nothing moving.
 *
 * Run `node bake.mjs` before deploying: a static host does not run this.
 */
const RE_S1 = /(id="s1"[^>]*?height:\s*)(\d+(?:\.\d+)?)vh/;
const RE_DESCENT = /(const\s+DESCENT_VH\s*=\s*)([0-9.]+)/;
const RE_HTMLTAG = /<html(\s|>)/i;
/* The export ships s1 at 290vh with a 220vh descent, leaving 70vh of
   scrolling after the camp lands and before s2 starts. Sections are
   sequential now (an earlier export overlapped them with margin-top
   :-100vh, which is why these numbers changed) so s1 only needs the
   descent plus a short hold on the camp. */
const S1_VH = 185;     // export ships 290
const DESCENT = 1.6;   // export ships 2.2

function fixScroll(html) {
  let out = html;
  out = out.replace(RE_S1, (m, pre) => pre + S1_VH + 'vh');
  out = out.replace(RE_DESCENT, (m, pre) => pre + DESCENT);
  // hand the value to scroll-fix.js so the two cannot drift apart
  out = out.replace(RE_HTMLTAG, '<html data-descent-vh="' + DESCENT + '"$1');
  if (!out.includes('scroll-fix.js')) {
    out = out.replace('</body>', '<link rel="stylesheet" href="/showcase.css"><script src="/scroll-fix.js" defer></script><script src="/showcase.js" defer></script>\n</body>');
  }
  return out;
}

/* ── server ─────────────────────────────────────────────────────────── */
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  // never serve outside this folder
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }

  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';

  if (ext === '.html') {
    let html = fs.readFileSync(file, 'utf8');
    html = fixScroll(html);
    html = html.includes('</body>')
      ? html.replace('</body>', INJECT + '\n</body>')
      : html + INJECT;
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\n  arc76 dev  →  http://localhost:${PORT}`);
  console.log(`  serving    ${ROOT}`);
  console.log(`  watching   ${DOWNLOADS}  (names matching /arc76/)\n`);
});

/* ── watch the site folder ──────────────────────────────────────────── */
let siteTimer = null;
fs.watch(ROOT, { recursive: true }, (_e, name) => {
  // dist is build output, and watching it recursively keeps a handle on
  // the directory that stops bake.mjs deleting it on Windows
  if (!name || name.startsWith('.') || name.startsWith('dist') || name.endsWith('.bak')) return;
  clearTimeout(siteTimer);
  siteTimer = setTimeout(() => reloadAll(`${name} changed`), 120);
});

/* ── watch Downloads, install new exports ───────────────────────────── */
function unzip(zip, dest) {
  return new Promise((ok, fail) => {
    execFile('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`],
      (err) => (err ? fail(err) : ok()));
  });
}

// a zip may contain the files at the root, or nested one folder deep
function flatten(dir) {
  const entries = fs.readdirSync(dir);
  if (entries.length === 1) {
    const only = path.join(dir, entries[0]);
    if (fs.statSync(only).isDirectory()) return only;
  }
  return dir;
}

function copyInto(from) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name), dst = path.join(ROOT, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyInto2(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}
function copyInto2(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name), dst = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copyInto2(src, dst); }
    else fs.copyFileSync(src, dst);
  }
}

// wait for the browser to finish writing before touching the file
function settled(file) {
  return new Promise((ok) => {
    let last = -1;
    const t = setInterval(() => {
      let size;
      try { size = fs.statSync(file).size; } catch { return; }
      if (size === last && size > 0) { clearInterval(t); ok(); }
      last = size;
    }, 200);
    setTimeout(() => { clearInterval(t); ok(); }, 15000);
  });
}

const handled = new Set();
async function install(file) {
  const base = path.basename(file);
  if (handled.has(base)) return;
  handled.add(base);
  setTimeout(() => handled.delete(base), 4000);

  await settled(file);
  const stamp = new Date().toLocaleTimeString('en-GB');
  try {
    if (file.toLowerCase().endsWith('.zip')) {
      const tmp = path.join(os.tmpdir(), 'arc76-drop-' + Date.now());
      fs.mkdirSync(tmp, { recursive: true });
      await unzip(file, tmp);
      copyInto(flatten(tmp));
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log(`  ⇩ ${stamp}  installed ${base}`);
    } else if (file.toLowerCase().endsWith('.html')) {
      fs.copyFileSync(file, path.join(ROOT, 'index.html'));
      console.log(`  ⇩ ${stamp}  installed ${base} as index.html`);
    } else return;
    reloadAll('new export installed');
  } catch (err) {
    console.log(`  ! ${stamp}  could not install ${base}: ${err.message}`);
  }
}

if (fs.existsSync(DOWNLOADS)) {
  fs.watch(DOWNLOADS, (_e, name) => {
    if (!name || !MATCH.test(name)) return;
    if (!/\.(zip|html)$/i.test(name)) return;
    const full = path.join(DOWNLOADS, name);
    let st; try { st = fs.statSync(full); } catch { return; }
    // only exports that arrived since this server started
    if (st.mtimeMs < STARTED) return;
    install(full);
  });
} else {
  console.log(`  (no Downloads folder at ${DOWNLOADS} — auto-install off)`);
}
