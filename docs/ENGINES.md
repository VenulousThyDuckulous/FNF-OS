# Engines

FNF OS does not include, bundle or redistribute any engine. It contains adapters
and metadata. This file is the honest scoreboard.

**Current state: no engine runs in a browser through FNF OS yet.** Import and
detection work for all four; playback is `unavailable` for all four. That is
reflected in the engine registry, the Launch Menu and every mod page.

## Why a "browser build" is not enough

All four engines are Haxe/HaxeFlixel projects. Even where an HTML5 target exists,
they assume:

- a writable filesystem for `mods/` (lime `sys.FileSystem`, `File.saveContent`),
- native video playback (hxvlc) for cutscenes,
- desktop window/input APIs,
- synchronous asset existence checks during preload.

A browser runtime therefore needs, per engine **and per version**:

1. the engine compiled to a web target (WebAssembly via HashLink/emscripten, or a
   JS transpilation),
2. a virtual filesystem backed by the mod's `Uint8Array` map from IndexedDB,
3. an asset loader that resolves through the engine's own asset system,
4. an input bridge (keyboard, gamepad, touch),
5. a script host for Lua/HScript,
6. a packaging + integrity pipeline (SHA-256) for distribution.

That is the work FNF OS v1.0 deliberately leaves un-started rather than faking.

## Psych Engine

- Upstream: <https://github.com/ShadowMario/FNF-PsychEngine> — Apache-2.0.
- Import/detection: **works** (`pack.json`, `data/<song>/<song>.json`, `scripts/*.lua`).
- Playback: **unavailable**.
- Obstacles: Lua/HScript hosts gated behind desktop flags upstream; hxvlc video;
  filesystem-backed mod folders; shader pipeline uses OpenFL shaders that need a
  WebGL translation layer.
- Reference worth reading: the community mobile port
  <https://github.com/BrenninhoTools/FNF-PsychEngine-Mobile> — useful for input and
  asset handling, but a native mobile port does not imply browser compatibility.
- First milestone: boot to a song with replacement assets and no scripts, then add
  the Lua host, then modcharts and shaders.

## Friday Night Funkin' V-Slice

- Upstream: <https://github.com/FunkinCrew/Funkin> — code Apache-2.0; assets are
  licensed separately; the name/logo are trademarks.
- Import/detection: **works** (`_polymod_meta.json`, `mod.json` with `api_version`).
- Playback: **unavailable**. An official HTML5 build exists but has no browser-side
  mod installation, and FNF OS must not bundle base assets to work around that.
- Obstacles: Polymod resolves assets through the filesystem; chart format differs
  from legacy engines; save data uses a backend that must be reimplemented locally.
- First milestone: Polymod-compatible asset resolution over an in-memory map.

## Kade Engine

- Upstream: <https://github.com/kadedev/Kade-Engine> — Apache-2.0.
- Import/detection: **works** (`assetsMods/`, `ModCore/`, bare chart folders).
- Playback: **unavailable**.
- Obstacles: ModCore mod loading is desktop-only; the project is historical and
  largely superseded, so porting effort has a low ceiling. Treated as
  lowest priority; compatibility reports will be marked historical.

## Codename Engine

- Upstream: <https://github.com/CodenameCrew/CodenameEngine> — Apache-2.0 **plus
  additional README restrictions**.
- Import/detection: **works** (Codename keys in `mod.json`, Haxe scripts).
- Playback: **blocked by licensing before engineering**. The README states, among
  other conditions, that you may not "release the entirety of Codename Engine on
  platforms". A redistributed browser runtime is arguably exactly that.
- Gate: written permission from the Codename Crew. Until then, no runtime work
  begins. Do not copy Codename code into another runtime to dodge this.

## Adapter workspace layout

```
engines/
  registry.json           # machine-readable status, mirrored in src/lib/engines
  psych/
    source/               # pinned upstream checkout (not vendored in git)
    browser-adaptation/   # our patches only, clearly separated
    runtime/              # build output + package manifest (never committed)
  vslice/ kade/ codename/ # same shape
```

Rules:

- Original engine sources stay separate from our patches. Never edit upstream
  files in place without a patch file that records the change.
- A runtime package is only added to `RUNTIME_CATALOG` after it has a SHA-256, a
  licence review and a passing Compatibility Lab run.
- `playback` in the registry changes only after real mods pass. Never before.

## Audited status (checked 2026-11-08)

The machine-readable version of this table is `src/lib/engines/runtimeStatus.ts`, and
it is what the app's Engines page renders. `canClaimPlayable()` gates every
"playable" word in the UI and is false for all four engines.

| Engine | Status | Licence | Browser build | Engine code in page | Real mod tested |
| --- | --- | --- | --- | --- | --- |
| Psych Engine | Blocked by technical limits | Apache-2.0 (code) | Community HTML5 builds compile, mods and Lua unavailable | No | No |
| V-Slice | Blocked by technical limits | Apache-2.0 code / separate assets | Official HTML5 build, base content only, no mod install | No | No |
| Kade Engine | Blocked by technical limits | Apache-2.0 | `lime build html5` documented; only public port has no source | No | No |
| Codename Engine | Blocked by licensing | Apache-2.0 + README restrictions | Web support unchecked upstream | No | No |

Evidence per row (issues, docs and discussions that were actually read) is stored
in the audit entries rather than summarised here, so it can be re-checked.

### What would change a row

1. A build of that engine that loads a user's own mod in the browser, by any
   legitimate route, with a licence that permits self-hosting.
2. Packaging it as a checksummed runtime (`RUNTIME_CATALOG`), then launching it
   through `RuntimeHost` with a mod's files served over the virtual filesystem.
3. A real mod from outside this repository, played to the results screen on
   desktop and on a phone, with the outcome recorded as a test run.

Only then does `playback` change, and only through `publishBlockers` clearing for
that catalogue entry.
