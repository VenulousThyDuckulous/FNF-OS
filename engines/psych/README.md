# Psych Engine adapter

Upstream: <https://github.com/ShadowMario/FNF-PsychEngine> - Apache-2.0

## Status

- Import/detection: supported (`pack.json`, `data/<song>/<song>.json`, `scripts/*.lua`).
- Playback: **not available**. No runtime built.

## Work order

1. Pin upstream; build for a web target; document every desktop-only flag.
2. Virtual filesystem over the imported file map (read-only first).
3. Asset resolution through the engine's own paths, no base-game fallback.
4. Boot to a song with replacement assets and no scripts.
5. Lua host (sandboxed, no filesystem writes).
6. HScript host.
7. Shaders (OpenFL -> WebGL translation).
8. Modcharts and custom events.
9. Video: expected to remain unsupported; report it, do not fake it.
10. Touch input and virtual controls.

## Known obstacles

- Lua/HScript and video are gated behind desktop flags upstream.
- Mod folders are read from a filesystem path; browser needs a VFS shim.
- `hxvlc` has no browser equivalent.
- Mobile port for reference: <https://github.com/BrenninhoTools/FNF-PsychEngine-Mobile>
  - input/asset handling only; it does not imply browser support.

## Not yet started

Nothing in `source/`, `browser-adaptation/` or `runtime/` exists. Do not add a
runtime package until the Compatibility Lab passes.
