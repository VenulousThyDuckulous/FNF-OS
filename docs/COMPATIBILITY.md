# Compatibility

## The four levels

| Level | Meaning | Launch behaviour |
| --- | --- | --- |
| 4 - Full | Every required feature tested and working | Launch |
| 3 - Near-full | Minor or optional differences only | Launch |
| 2 - Partial | Runs, but some features are missing or behave differently | Launch with a warning |
| 1 - Incompatible | Cannot run reliably | Blocked |

A level is only ever produced by a **runtime test run**. Importing a mod
successfully tells you nothing about compatibility, so FNF OS never assigns a
level at import time.

## What static analysis does (and does not)

`src/lib/compat/analyze.ts` runs at import and on every manual engine change. It
answers three questions:

1. **What does this mod depend on?** Lua scripts, HScript, shaders, video
   cutscenes, modcharts, custom events, note skins, characters/stages, charts,
   audio - detected from file paths.
2. **Is anything a hard blocker?** Native executables (`EXE`, `DLL`, `so`, `jar`,
   `apk`), an unidentified engine, or an engine with no published runtime.
3. **What is missing?** No chart JSON, no audio, features the target runtime marks
   `unsupported`.

It reports `level: null` and a `levelReason` explaining that no runtime test has
happened. There is no percentage anywhere in the UI, because a percentage would be
invented.

## The Compatibility Lab

Design for the harness that will assign levels. It does not run yet because there
is nothing to run against.

For each engine + runtime version pair, run a scripted suite against fixture mods:

| Test | Pass condition |
| --- | --- |
| Boot | Runtime reaches the song select without an unhandled error |
| Chart load | Chart JSON parses and note counts match the source |
| Audio | All required tracks decode and stay in sync (within 40 ms) |
| Characters/stages | All referenced assets resolve; no missing-texture errors |
| Lua | Scripts execute; `onCreate`/`onUpdate` hooks fire |
| HScript | Interpreter loads and evaluates fixture scripts |
| Shaders | Custom shaders compile with no GL errors |
| Modcharts | Scripted camera/notes movement applies |
| Custom events | Event handlers fire at the expected beat |
| Custom notes | Note skins render |
| Video | Cutscene plays or is skipped with a documented warning |
| Saves | Score/completion persists across reloads |
| Mobile controls | Touch input registers on a touch-emulated viewport |
| Native deps | Any desktop-only dependency is reported, not silently dropped |

Each run produces a report with passed/failed tests, unsupported features, missing
dependencies, fatal blockers, warnings and suggested fixes. The level is derived
from that report by rule, never hand-written:

- any fatal blocker -> **1**
- required feature failing -> **2**
- only optional features failing -> **3**
- all required features pass -> **4**

## Current status

No runtime exists, so every mod reports "Compatibility not verified". The Feature
Checklist still does real work: it tells you what a mod needs before you spend time
installing a runtime for it.
