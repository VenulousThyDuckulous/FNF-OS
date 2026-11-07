# Kade Engine adapter

Upstream: <https://github.com/kadedev/Kade-Engine> - Apache-2.0

## Status

- Import/detection: supported (`assetsMods/`, `ModCore/`, bare chart folders).
- Playback: **not available**.
- Priority: lowest of the four.

## Why low priority

Kade Engine is historical. Its mod loading (`ModCore`) and filesystem access are
desktop-only, and the project is superseded by Psych and Codename. Porting effort
here buys less compatibility than the same effort spent on Psych.

If it is ever attempted:

1. Pin the `stable` branch.
2. Replace `ModCore` with the FNF OS virtual filesystem adapter.
3. Audit lime/openfl APIs that do not exist on web.
4. Mark compatibility reports as historical in the UI.

Existing historical HTML5 demonstrations are not evidence of browser support.
