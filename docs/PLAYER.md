# Playback runtime

FNF OS can play a mod's songs in the browser. This document says exactly how,
and exactly what it does not do.

## What runs

`src/lib/player/` is an in-house runtime, not an engine port:

| Module | Responsibility |
| --- | --- |
| `chart.ts` | Parses Psych chart JSON (sections, lanes, sustains, note types, events). |
| `engine.ts` | Judging, scoring, combo, health, misses, completion. Pure functions, no DOM. |
| `pipeline.ts` | Finds charts in an imported mod, resolves `inst`/`voices` audio, reports what it cannot honour. |
| `render.ts` | Canvas note highway: receptors, notes, sustains, health, score, accuracy. |
| `demo.ts` | A synthesised test chart and instrumental, generated in the browser. |

`src/components/PlayerStage.tsx` drives it. Audio is the clock: note times are
compared against `AudioContext.currentTime`, so a dropped animation frame cannot
desynchronise the chart. The audio context, buffer sources and animation frame are
all released on unmount.

It reads the mod's own files through the stored `EntryMap` — no code from a mod is
ever executed, and no file is written anywhere.

## Playing a mod

1. Import a Psych (or Kade) mod that ships charts and its own instrumental.
2. Open it and press **Play**.
3. Pick a difficulty if the mod has more than one chart.
4. Press **Start**.

Keys are `A S D F` or the arrow keys; on touch devices the four quarters of the
screen are the lanes. `Escape` stops the song.

## What is implemented

- Psych chart parsing, including `mustHitSection` lane ownership.
- Notes, sustains (judged on the initial hit), custom note types drawn as normal.
- Sick/good/bad/shit/miss windows (45/90/135/160 ms), combo, score, accuracy,
  health, failure and completion.
- Opponent notes played automatically, as the engine does.
- Instrumental and vocals playback, both decoded by the browser.
- Autoplay, results screen, restart, touch lanes.
- Named failures: a missing instrumental says which paths were searched; an
  invalid chart says what was wrong with it.

## What is not implemented

Everything below is listed as a limitation in the UI, not as partial support:

- Characters, stages, backgrounds and note skins are not drawn.
- Lua and HScript are never executed.
- Chart events are parsed but not applied (no camera moves, animations, effects).
- No hold-release scoring, no ghost tapping, no health drain between notes.
- No V-Slice or Codename chart format: those are different formats, and the
  failure message says so.
- No saved scores or session history yet.

## Verified behaviour

`tests/player-chart.test.ts`, `tests/player-engine.test.ts` and
`tests/player-pipeline.test.ts` cover parsing, the judging windows, a full
autoplay run of a chart in simulation, health failure, missing audio, wrapped
mod folders, case-different filenames and the warning paths.

The built-in test song at `#/lab/player` runs the same code against synthesised
audio in a real browser. Passing that proves the runtime can decode audio, keep
time, judge notes and finish a song; it does **not** prove compatibility with any
particular community mod, which is why no compatibility level is assigned.

## Status

`experimental`, and `COMPAT_RUNTIME` in `src/lib/player/profile.ts` is the single
source for that claim. Moving it to `verified` requires real community mods,
tested one by one, with the results recorded.
