# FNF OS

**Your FNF universe. One place.**

FNF OS is a browser-based launcher, mod manager and development platform for
Friday Night Funkin' mods. It runs entirely in the browser, stores everything on
your own device, and needs no account.

> FNF OS is an unofficial community project and is not affiliated with or
> endorsed by the Friday Night Funkin' developers.

---

## Status: v1.0.0-alpha.1

The platform shell is implemented and working. The engine layer is an adapter
framework with **no browser runtimes published yet**, and the app is honest
about that everywhere it matters: it will import, identify and analyse a mod,
but it will not claim it can play one.

| Area | State |
| --- | --- |
| Launch Menu (first visit) | Working |
| Import: ZIP, folder, complete game ZIP | Working |
| Engine detection with confidence + manual override | Working (heuristics) |
| Import safety (path traversal, bombs, size caps) | Working |
| Duplicate detection (SHA-256 fingerprint) | Working |
| Mod library, collections, search, sort, favourites | Working |
| Compatibility analysis (static) | Working |
| Compatibility levels 1-4 | **Not assignable yet** - requires runtime tests |
| Runtime manager (download, verify, cache, pin) | Working, empty catalogue |
| Browser engine runtimes (Psych, V-Slice, Kade, Codename) | **Not implemented** |
| Mod Studio | Detects project engine; native editors unavailable |
| Themes, dark/light, custom accent | Working |
| PWA install, offline shell | Working |
| Storage management | Working |

Read [`docs/ENGINES.md`](docs/ENGINES.md) for the per-engine reality,
[`docs/LICENSING.md`](docs/LICENSING.md) for the redistribution gates, and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what comes next.

## Why the engine layer is not done

Shipping one engine in the browser is not a UI problem, it is a port. Each
engine is a HaxeFlixel/Haxe codebase that assumes a writable filesystem, native
video playback, native input and window APIs. A browser runtime needs that
engine compiled to WebAssembly or JS, an asset loader that reads from
IndexedDB, and a virtual filesystem - per engine, per version, tested against
real mods. It also needs licence clearance before redistribution: Psych, V-Slice
and Kade are Apache-2.0 (with asset and trademark terms), while Codename
Engine's README explicitly forbids releasing the engine in its entirety on
platforms.

FNF OS v1.0 therefore ships the platform and refuses to fake the rest.

## Local development

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # unit tests for detection, zip safety, compatibility
npm run build      # typecheck + static build into dist/
npm run preview    # serve the built output
```

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` typechecks, tests and builds on every push to
`main`, then publishes `dist/` to Pages. Enable it once:

1. Repository **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
2. Push to `main`.

The build uses a relative base path and hash routing, so it works at
`https://<user>.github.io/FNF-OS/` without extra configuration.

## Repository layout

```
engines/          engine adapter workspace (sources, patches, runtime manifests)
src/lib/          pure logic: detection, import, safety, compatibility, storage
src/pages/        screens
src/components/   shell, navigation, cards
src/state/        settings, library, toasts
public/           manifest, service worker, icons
docs/             architecture, engines, licensing, compatibility, security
tests/            unit tests
```

## Privacy

No accounts, no telemetry, no cloud storage, no automatic uploads. Imported
mods never leave the device. Engine runtimes are downloaded only when you
choose to install one. See [`docs/SECURITY.md`](docs/SECURITY.md).

## Licence

Platform code: MIT (see `LICENSE`). Engines, game assets and mods remain under
their own licences and are **not** included in this repository.
