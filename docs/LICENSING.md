# Licensing

FNF OS is an unofficial community project. It is not affiliated with or endorsed
by The Funkin' Crew Inc. "Friday Night Funkin'" and its logo are trademarks of
The Funkin' Crew Inc.

Verified against upstream repositories on **2026-11-07**. Licences change; re-check
before shipping any runtime.

| Engine | Code licence | Redistribution notes |
| --- | --- | --- |
| Psych Engine | Apache-2.0 | Modified sources may be distributed with notices and licence copy. Base-game assets are not covered. |
| FNF V-Slice | Apache-2.0 (code) | Assets licensed separately at `FunkinCrew/funkin.assets`. Trademark restrictions apply to branding. |
| Kade Engine | Apache-2.0 | Same Apache terms; upstream itself is historical. |
| Codename Engine | Apache-2.0 + README restrictions | See gate below. |

## What this repository contains

Only FNF OS platform code (MIT) plus original documentation and UI. It contains
**no** engine source, compiled runtime, game asset, song, character, chart or
font. Detection rules reference filenames; they do not embed engine code.

## Apache-2.0 obligations for a future runtime

If FNF OS ever distributes a modified engine build:

1. Include a copy of the Apache-2.0 licence.
2. State prominently which files were modified (the `browser-adaptation/` patches
   exist for exactly this).
3. Retain copyright, patent, trademark and attribution notices from the source.
4. Do not use the upstream project's trademarks to imply endorsement.

## The Codename gate

Codename Engine's README sets conditions beyond Apache-2.0, including prohibitions
on releasing the engine in its entirety on platforms, on using its code for
unrelated engines, and a credit requirement when used as a template.

Because a browser runtime is a packaged, redistributed form of the engine, FNF OS
treats Codename as **blocked pending written permission**. The registry records
`playback: 'unavailable'` with that reason. No workaround - including copying
Codename code into another adapter - is acceptable.

## Assets, music and mods

Mods imported by users are their own responsibility. FNF OS:

- does not bundle mods, base-game assets, music or characters,
- does not upload imported content anywhere,
- stores imported bytes only in the user's browser,
- never executes native binaries found inside an archive.

A mod that ships copyrighted base-game assets without permission is the importer's
problem, not something FNF OS can launder. Distribution of an *exported* mod is the
user's action and their responsibility.

## Runtime distribution size

GitHub Pages has published-site size and bandwidth limits, and is unsuitable for
multi-hundred-megabyte runtime packages. Runtimes are therefore kept out of the
site build entirely and fetched on demand from a separate host (GitHub Releases is
the intended default, with SHA-256 pinning). Check current GitHub documentation for
the limits in force before choosing a host.

## Checklist before publishing any runtime

- [ ] Written licence review for that engine and version.
- [ ] Permission recorded for Codename (if applicable).
- [ ] No base-game assets, music or characters in the package.
- [ ] Attribution and modification notices included.
- [ ] SHA-256 checksum generated and published alongside the package.
- [ ] Compatibility Lab run passes and the registry is updated honestly.
