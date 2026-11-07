# Playback runtime

FNF OS can play a mod's songs in the browser. This document says exactly how,
and exactly what it does not do.

## What runs

`src/lib/player/` is an in-house runtime, not an engine port:

| Module | Responsibility |
| --- | --- |
| `chart.ts` | Reads Psych chart JSON (sections, lanes, sustains, note types, events) and dispatches current V-Slice charts. |
| `vslice.ts` | Reads V-Slice charts (`version` + `scrollSpeed` + per-difficulty `notes` of `{t,d,l,k}`) and `metadata.json`. |
| `engine.ts` | Judging, hold scoring, scoring, combo, health, misses, completion. Pure functions, no DOM. |
| `events.ts` | Applies the chart event types this runtime implements and reports the rest by name. |
| `sparrow.ts` | Parses Sparrow atlas XML and draws trimmed frames. |
| `skins.ts` | Finds and resolves note-skin frames per lane and state, with a fallback per missing frame. |
| `characters.ts` | Parses Psych character JSON, animations, stage and character asset paths. |
| `scene.ts` | Decodes the mod's images and builds the animated scene. |
| `pipeline.ts` | Finds Psych and V-Slice charts, resolves audio and art, reports what it cannot honour. |
| `render.ts` | Canvas stage, characters, note highway, receptors, notes, skins, HUD. |
| `scores.ts` | Saved runs, personal bests, recent songs and history summaries. |
| `demo.ts` | A synthesised test chart and instrumental, generated in the browser. |

`src/components/PlayerStage.tsx` drives it. Audio is the clock: note times are
compared against `AudioContext.currentTime`, so a dropped animation frame cannot
desynchronise the chart. The audio context, buffer sources, animation frame and
decoded images are all released on unmount.

It reads the mod's own files through the stored `EntryMap` — no code from a mod is
ever executed, and no file is written anywhere.

## Playing a mod

1. Import a Psych/Kade mod with charts and its own instrumental, or a V-Slice mod
   with `songs/<song>/` charts and `Inst.ogg`/`Voices.ogg`.
2. Open it and press **Play**.
3. Pick a song and difficulty if the mod has more than one.
4. Press **Start**.

Keys are `A S D F` or the arrow keys; on touch devices the four quarters of the
screen are the lanes. Hold the key through a sustain. `Escape` stops the song.

## Hold scoring

Sustains are two judged units: the head (normal windows) and the tail.

- The tail completes while the lane is still held when the sustain ends.
- Releasing more than `HOLD_RELEASE_GRACE_MS` (120 ms) before the end drops the
  tail: it is a miss, resets combo, costs health and counts against accuracy.
- A missed head produces one miss, not two — the tail is not judged separately.
- `unitsTotal` is heads plus sustained tails; the results screen reports units and
  dropped holds.

One model is used for every chart dialect because Psych sustains and V-Slice
`l` are both milliseconds of hold. Engine-specific hold *tables* (different grace
values or tail scoring per engine) are not implemented — that needs per-engine
source verification, not a guess.

## Chart events

Applied: `Camera Zoom`, `Add Camera Zoom`, `Change Scroll Speed`,
`Play Animation`, `Hey!`, `Change Character`.

- Zoom eases over the event's duration and scales the stage and characters.
- Scroll speed changes the highway's pixels-per-ms.
- `Play Animation` and `Hey!` switch the addressed character's animation.
- `Change Character` is recorded and shown, but a second sprite set is not loaded.

Every other event name is counted and listed per song in the ready panel and in
`window.__fnfosPlayer.getState().eventsUnsupported`, never silently dropped.

## Notes, characters and stages

- Note skins: Sparrow `NOTE_assets`-style PNG+XML under `images/noteSkins/` or
  `images/`. Frames are resolved per lane for note, press, hold piece and hold
  end. Missing frames fall back to the built-in diamonds.
- Characters: `characters/<name>.json` + PNG + XML, with idle/sing animations,
  offsets, flip and scale. Lane presses trigger `singLEFT/DOWN/UP/RIGHT`.
- Stages: `stages/<name>/bg.png` or `images/<stage>.png`, plus an optional front
  layer. Stage scripts, camera pans and lighting are not implemented.

## Saved scores and history

Finished runs are written to this browser's IndexedDB (`scores` store, DB
version 3). A record keeps engine, mod, chart, difficulty, score, accuracy,
max combo, judgement counts, misses, held/dropped holds, rank, duration and
timestamp.

- Ranks: S ≥ 95%, A ≥ 90%, B ≥ 80%, C ≥ 70%, D ≥ 60%.
- Personal bests are grouped by engine + mod + chart + difficulty, so the same
  song in two engines is never merged.
- Autoplay runs are saved but never ranked and can never become a personal best.
- `#/history` lists summary stats, personal bests, recently played songs and every
  saved run, with per-run deletion and clearing.
- This is FNF OS's own score model, not an engine save format.

## V-Slice

Current V-Slice charts are detected by `version` + `scrollSpeed` + a per-difficulty
`notes` object. Notes use `d` where `floor(d / 4)` is the strumline (0 = player)
and `d % 4` the lane — verified against Fun's `SongNoteData.getStrumlineIndex`.
`l` is the hold length, `k` the note kind. Events are `{t,e,v}` and are flattened
into the shared event shape.

`metadata.json` is read for song name, stage, characters and difficulties.
`timeFormat: "float"` (seconds) is converted to milliseconds; `"ticks"` is refused
with a named problem because it needs the tempo map to convert honestly.

Older V-Slice charts use Psych's section layout and are read by the Psych parser
and reported as `psych`, not mislabelled as V-Slice.

## What is not implemented

Everything below is listed as a limitation in the UI, not as partial support:

- Lua and HScript are never executed.
- Shaders, modcharts and videos.
- Character swaps do not load alternate sprites.
- Stage scripts, camera pans and lighting.
- Custom note types are drawn and judged as normal notes.
- Engine-specific accuracy/scoring tables; all runs use this runtime's model.

## Verified behaviour

`tests/player-*.test.ts` and `tests/scores.test.ts` cover: chart parsing for both
dialects, V-Slice detection/strumline/sustains/events/time formats, judging
windows, hold completion, early release, missed heads, autoplay runs, health
failure, Sparrow frame parsing and animation timing, note-skin frame resolution,
character parsing and asset resolution, event application and unsupported-event
reporting, rank thresholds and personal-best grouping.

The built-in test song at `#/lab/player` runs the same code against synthesised
audio in a real browser. Passing that proves the runtime can decode audio, keep
time, judge notes, score holds and finish a song; it does **not** prove
compatibility with any particular community mod, which is why no compatibility
level is assigned.

## Status

`experimental`, and `COMPAT_RUNTIME` in `src/lib/player/profile.ts` is the single
source for that claim. Moving it to `verified` requires real community mods,
tested one by one, with the results recorded.
