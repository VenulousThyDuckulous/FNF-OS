# V-Slice adapter

Upstream: <https://github.com/FunkinCrew/Funkin> - Apache-2.0 code, separate asset
licence, trademarks reserved.

## Status

- Import/detection: supported (`_polymod_meta.json`, `mod.json` with `api_version`).
- Playback: **not available**.

## Work order

1. Pin upstream; evaluate the official HTML5 target and its Polymod asset layer.
2. Replace filesystem-backed Polymod resolution with a browser asset resolver over
   the virtual filesystem - without shipping any base-game assets.
3. Local save backend replacing the online one.
4. Chart format compatibility and input bridge.

## Hard constraints

- Never bundle `funkin.assets`. Users import their own data.
- Trademark: do not imply official endorsement or use the logo as FNF OS branding.
- Browser-side mod installation does not exist upstream; our loader must be an
  adaptation, not a fork of assets.

## Not yet started

No runtime, no vendored source.
