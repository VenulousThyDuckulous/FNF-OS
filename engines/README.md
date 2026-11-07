# Engine adapter workspace

This directory is for engine work. It is intentionally **empty of engine code**:
nothing here ships in the site build, and nothing here is redistributed.

```
engines/
  registry.json           machine-readable status mirrored in src/lib/engines/registry.ts
  psych/
    README.md             adapter notes and obstacles
    source/               pinned upstream checkout - git-ignored, never committed
    browser-adaptation/   our patches only, applied to a clean checkout
    runtime/              build output and package manifest - git-ignored
  vslice/ kade/ codename/ same shape
```

## Rules

1. **Never commit engine source.** Clone upstream into `source/`, pin a commit, and
   keep only patches in `browser-adaptation/`.
2. **Record every modification.** Apache-2.0 requires modified files to carry
   prominent change notices.
3. **Never bundle assets.** No base-game art, music, characters or fonts, ever.
4. **Licence before engineering.** Codename Engine additionally requires written
   permission (see `../docs/LICENSING.md`).
5. **No fake runtimes.** A package enters `RUNTIME_CATALOG` only when it has a
   SHA-256, a licence review and a passing Compatibility Lab run.
6. **Status is earned.** `playback` changes in the registry only after real mods
   pass the lab, and the Launch Menu reads from that registry.

## Adding a runtime package

1. Build for the web target; verify it boots in a browser.
2. Run the Compatibility Lab; save the report.
3. Publish the package to GitHub Releases (Pages is not a suitable host for large
   binaries).
4. Add an entry to `RUNTIME_CATALOG` in `src/lib/runtime/manager.ts` with engine,
   version, URL, byte size and SHA-256.
5. Update `playback`, `features` and `limitations` in the engine registry.
