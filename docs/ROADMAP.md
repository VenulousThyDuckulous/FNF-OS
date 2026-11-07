# Roadmap

## v1.0.0-alpha.1 - platform (current)

Shipped: Launch Menu first-run flow, hash-routed app shell (sidebar + bottom nav),
import pipeline (ZIP / folder / complete game build) with traversal and bomb
protection, SHA-256 duplicate detection, heuristic engine detection with override,
static compatibility analysis, local library with collections/tags/favourites,
themes with custom accents, PWA offline shell, storage management, GitHub Pages
deployment.

Not shipped, deliberately: any browser engine runtime. No compatibility level is
assigned to anything in this version.

## v1.1 - runtime foundation

- Runtime package format + manifest schema, published to GitHub Releases.
- `RuntimeHost` component: sandboxed iframe, lifecycle, crash recovery, `postMessage`
  protocol with an explicit message allowlist.
- Virtual filesystem contract (`open`, `read`, `exists`, `list`) implemented over
  IndexedDB.
- Compatibility Lab harness with fixture mods and machine-readable reports.
- Storage cleanup UI for installed-but-unused runtimes.

Gate: a trivial "hello world" runtime proving the host, VFS and integrity path.

## v1.2 - Psych Engine (first real engine)

- Pin upstream, extend `browser-adaptation/` patches, build a web target.
- Asset resolution through the VFS; chart loading; audio via Web Audio.
- Lua host; then shaders; then modcharts; then custom events.
- Mobile: input bridge and virtual controls.

Gate: three real mods reach Level 3 or better; licence and checksum review passes.

## v1.3 - compatibility depth and Mod Studio

- Assign levels from lab results only; surface per-feature failures.
- Open the engine's own chart editor against a project working copy.
- Project save/export round-trip.

## v1.4 - V-Slice

- Polymod-compatible asset resolution over the VFS.
- Local save backend replacing the online one.
- No bundled assets: users import their own data.

Gate: same as Psych, plus a trademark/branding review.

## Backlog / gated

- **Kade Engine** - low priority; historical engine, weak ceiling.
- **Codename Engine** - blocked pending written permission from the Codename Crew.
- Controller support (Gamepad API) once a runtime exists to consume it.
- Optional AI assistant - explicitly out of scope for v1.0 and not scheduled.

## Explicit non-goals

- Online mod catalogue, featured community mods, server-side discovery.
- User accounts, public profiles, cloud mod storage.
- Automatic uploads, telemetry, crash reporting.
- Running native executables, DLLs or desktop plugins.
- Advertising any engine as supported before real mods pass the lab.
