# Browser runtime research

Reviewed 2026-11-07. This file records what was checked, what it means, and what
would have to change before any of these projects could enter the runtime
catalogue. Nothing described here is integrated, installed or supported by FNF OS
today, and the catalogue in `src/lib/runtime/catalogue.ts` stays empty.

## Summary

| Project | Kind | Browser build? | Self-host? | Redistribute? | Loads user ZIPs? | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Psych Engine HTML5 (star-studios-official) | engine port | source can target HTML5 | yes, with work | Apache-2.0 | **no** — mods gated to desktop | untested |
| Psych Engine HTML5 (itch.io, kelvindoan) | engine port | yes, hosted | no | unclear, ships base assets | no | no usable build |
| H-Slice | conversion | yes, single-file HTML | yes | code MIT, bundled assets are not | via converted song folders + `mods.js` line | candidate |
| Kade 1.5.1 browser port (Axmed) | community port | yes, hosted | no | unverified, no source | unverified | unverifiable |
| Codename Engine | engine port | not shipped; maintainers call HTML5 broken | blocked | Apache-2.0 + no whole-engine release | not in a browser | blocked: licence |

## Psych Engine HTML5 — star-studios-official/FNF-PsychEngine-HTML5

Source: <https://github.com/star-studios-official/FNF-PsychEngine-HTML5>

- Apache-2.0 Psych tree (fork lineage of Shadow Mario's engine), 1,203 commits,
  `Project.xml` still declares version `0.2.8`.
- `Project.xml` gates the mod system to desktop:

  ```xml
  <define name="MODS_ALLOWED" if="desktop" />
  <define name="HSCRIPT_ALLOWED" if="desktop" />
  <define name="LUA_ALLOWED" if="desktop" />
  ```

  There is an HTML5 window block, so the project compiles for the web, but a web
  build ships with **no mod folders, no Lua and no HScript** — the three things
  that make a Psych mod a Psych mod.
- `BUILDING.md` documents only `lime test windows|linux|mac`. No web build
  instructions, no release artifacts, no published checksums.
- Upstream Psych issues agree: HTML5 builds break on native-only `sys.io.File`,
  and maintainers answered "you can't" to loading a mods folder in a web build.
  Lua is likewise reported as not running on HTML5.

**Consequence:** the gap is not packaging, it is the engine. A viable Psych web
runtime needs mod loading reimplemented against a virtual filesystem (which is
what FNF OS's `RuntimeHost` already provides) and then real mod testing.

## Psych Engine HTML5 — itch.io hosted build

Source: <https://kelvindoan.itch.io/fnf-psych-engine>

- Playable HTML5 build (OpenFL platform tag), Psych features listed.
- Content is baked in: there is no interface for installing a user's own mod, and
  no source, checksum or re-hosting permission attached to the build.
- It also embeds base-game assets, which the engine licence does not cover.

**Consequence:** useful proof that Psych *can* render in a browser; useless as a
runtime for arbitrary mods, and not something FNF OS may redistribute.

## H-Slice — AverageCatUser/H-slice

Source: <https://github.com/AverageCatUser/H-slice> ·
Modding guide: <https://github.com/AverageCatUser/H-slice/blob/main/MODDING.md>

- Single-file HTML engine, build **b33**, MIT for the engine, mod builder and
  docs. The repo nevertheless ships FNF's seven weeks, characters and music,
  which are explicitly **not** MIT.
- It is a conversion-based engine: `mod-builder.html` reads selected V-Slice or
  Psych files (one song at a time, or a `.fnfc`) and emits its own `mod.js` plus
  assets. A `HSLICE.load('mods/<id>/mod.js')` line in `engineassets/mods.js` is
  what makes the song appear.
- Documented limits ("What H-Slice doesn't do yet"): no Psych Lua, no V-Slice
  HScript, only four camera events, custom note types play as normal notes, only
  Sparrow sheets, animated stage props render still, only the `NOTE_assets` skin,
  audio must be `.ogg`/`.mp3`/`.wav`.

**Consequence:** genuinely self-hostable and genuinely playable, but it is **not a
Psych or V-Slice runtime**. Converted content is a subset, and its compatibility
profile has to be measured and reported separately. Two blockers remain before it
could be catalogued: the bundled non-free assets, and a loading path that does
not require editing `mods.js` on disk per song.

## Kade 1.5.1 browser port — Axmed119

Sources: <https://github.com/Axmed119/FNF-Kade-Engine-1.51-Browser-port/tree/kade> ·
<https://thedeviousaxmed.itch.io/kade-engine-151-browser-port>

- The itch page is titled "KADE ENGINE 1.3.1 BROWSER PORT" (released 2021-06-17)
  while the URL and the author's comments claim 1.5.1. Commenters report 1.3.1.
- The linked GitHub branch contains **only a README.md** — no source, no build.
- No checksum, no licence statement for the port, no way to rebuild it.

**Consequence:** unverifiable. It cannot be reviewed, hosted, patched or tested,
so it cannot be a runtime. Revisit only if the source reappears.

## Codename Engine — CodenameCrew/CodenameEngine

Source: <https://github.com/CodenameCrew/CodenameEngine>

- Apache-2.0 with README restrictions. "Please do not: Release the entirety of
  Codename Engine on platforms (mods that use Codename Engine as source are
  fine)". A packaged browser runtime reads as precisely that forbidden release.
- Web/HTML5 and mobile support are listed as future work; a maintainer in
  discussion #630 describes HTML5 builds as "kinda broken, we're working on
  that".

**Consequence:** blocked on licensing before engineering. Written permission from
the Codename Crew is a prerequisite, not a formality.

## What this changes in FNF OS

Nothing about playback status. Every engine stays `unavailable`, every feature
stays `unknown`, and `RUNTIME_CATALOGUE` is empty. What changed is the shape of
the catalogue, which now models the three kinds that actually exist:

- `engine-port` — a browser build of an engine, with its own mod layout.
- `community-port` — an unofficial build, carrying its own provenance risk.
- `conversion` — an independent engine that imports selected content; its profile
  is its own and may never be reported as the source engine's support.

Each entry carries version, licence and licence note, distribution permission,
self-hostability, engine versions, mod formats, capabilities and **test runs**.
`publishBlockers` refuses any entry without a reviewed checksum, permitted
distribution, a self-hostable build, a mod format that loaded in a real test and
at least one passed run that assigned a level.

## Fastest legitimate route to playable mods

1. **H-Slice as a conversion runtime.** It runs today, needs no port, and its
   converter already reads Psych 0.6/0.7/1.0 and V-Slice charts. Blockers: an
   asset-free build (or permission) and a serving path for converted mods that
   avoids hand-editing `mods.js`.
2. **Psych HTML5 with a VFS.** Fork the HTML5 tree, replace desktop-gated mod
   loading with the FNF OS virtual filesystem, then run real mods. Highest
   ceiling, real work.
3. **Codename** — last, and only after permission.
