# Arc76 — website

Marketing site for **Arc76**, a discipline app by Incognito Labs. Tasks are
proved with a live photo and a ranked ladder rises and falls with them.

- App Store: https://apps.apple.com/app/id6794336316 (free, iPhone, iOS 17+)
- Live: https://arc76.pages.dev
- Domain: `arc76.app` (not yet pointed at Cloudflare)

## Run it

```bash
node dev.mjs          # http://localhost:9300
```

Live reload on any file change. It also watches `~/Downloads` and installs
any new `arc76*.zip` export automatically, then refreshes the page.

## The one thing to understand before editing

`index.html` is a **design-tool export**. It gets re-exported and replaces
the whole file, so anything patched into it is gone on the next download.

Everything that must survive an export lives outside it:

| File | What it does |
|---|---|
| `scroll-fix.js` | Snaps to section boundaries after the descent |
| `mobile-lite.css` | Strips blur/backdrop-filter on phones. Without it iOS Safari kills the tab |
| `perf.js` | Pauses off-screen scenes, thins the blizzard, drops oversized SVG filters on phones |
| `base/`, `crate/`, `route/` | Redesigned sections 6, 4 and 5 |
| `mobile/` | Portrait phone layout (full-bleed scenes, re-laid copy, two-page crate/route/base camp) |

`dev.mjs` injects `scroll-fix.js` and `perf.js` into the HTTP **response** at serve time,
so the file on disk stays exactly what the design tool produced.

## Deploying

A static host does not run `dev.mjs`, so the injected fixes have to be
written into real files first:

```bash
node bake.mjs                                        # -> dist/
npx wrangler pages deploy dist --project-name arc76
```

`bake.mjs` deliberately **fails loudly** rather than shipping a half-patched
build. It currently guards:

- **App Store links.** Every export ships `id_YOUR_APP_ID`, roughly nine
  times across `index.html`, `base/base.js` and `route/route.js` — i.e.
  every conversion path on the site, dead. It rewrites them to the real id
  and refuses to build if one survives.
- **Dead scroll.** `s1` is authored longer than its descent needs, leaving
  most of a screen of scrolling where nothing happens before `s2` arrives.
  It trims `s1` to the descent plus a short hold, reading the descent
  length from the export rather than hardcoding it (exports have shipped
  2.2, 1.6 and 1.4).

## Things deliberately not on the site

- The app's *"72% improvement in discipline"* onboarding line. Unsubstantiated
  efficacy claim, real liability.
- The App Store rating. It is 5 stars from 2 ratings, which is not social
  proof.
- Any download count, user count or completion rate. No real figures exist,
  so none are shown.

## Still open

- `base/base.js` has empty `privacyUrl` and `contactEmail`, which render as
  dead links in the footer. Apple requires a reachable privacy policy.
- `arc76.app` still resolves to Namecheap's nameservers. Move them to
  Cloudflare, then add the domain under the Pages project.
- Landscape phones get a "turn your phone upright" screen rather than a
  landscape layout; the scenes are too short at that height.
