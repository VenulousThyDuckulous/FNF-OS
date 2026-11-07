# Codename Engine adapter

Upstream: <https://github.com/CodenameCrew/CodenameEngine> - Apache-2.0 **plus
additional README restrictions**

## Status

- Import/detection: supported (Codename keys in `mod.json`, Haxe scripts).
- Playback: **blocked**.

## The gate

The upstream README sets conditions beyond the licence. Among them:

- do not "release the entirety of Codename Engine on platforms" (mods that use it
  as source are excluded),
- do not build side/new engines from its code,
- do not copy its code into unrelated projects without proper credit.

A browser runtime is a packaged, redistributed form of the engine. Shipping one
through FNF OS is therefore **not clearly permitted**, so no work starts until the
Codename Crew gives written permission. Permission must cover redistribution of a
modified build, and it must be recorded in `docs/LICENSING.md` before any code is
written here.

Do not copy Codename code into another adapter to work around the restriction.

## If permission is granted

1. Pin upstream and record the permission reference.
2. HScript Improved host on a browser-interpretable path.
3. Virtual filesystem over the imported map.
4. Shaders, then stages, then modcharts.
5. Compatibility Lab, then a checksummed package, then a registry update.
