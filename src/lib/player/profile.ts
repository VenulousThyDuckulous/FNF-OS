import type { EngineFeature, EngineId, FeatureSupport } from '../engines/types';

/**
 * The built-in compatibility runtime.
 *
 * This is not an engine port. It is our own playback implementation that reads
 * Psych-format and V-Slice chart data, the mod's own audio, and the mod's own
 * Sparrow art. It exists because the official engine web builds cannot load user
 * mods, and shipping someone else's engine build is either impossible or not
 * permitted.
 *
 * Everything it claims is implemented in `src/lib/player` and covered by tests
 * in `tests/player-*.test.ts`. Status stays `experimental` until real community
 * mods have been through it: synthetic fixtures prove the code paths, not the
 * mod ecosystem.
 */

export const COMPAT_RUNTIME = {
  id: 'fnf-os-compat',
  name: 'FNF OS compatibility runtime',
  version: '0.2.0',
  status: 'experimental' as const,
  statusLabel: 'Experimental',
  /** Chart dialects read directly. Kade charts follow the Psych format. */
  engines: ['psych', 'vslice', 'kade'] as EngineId[],
  formats: [
    'Psych chart JSON under data/<song>/ (sections, sustains, note types, events)',
    'V-Slice chart JSON under songs/<song>/ (version + per-difficulty notes)',
    'Sparrow PNG+XML note skins, characters and stage backgrounds from the mod',
    'Instrumental and vocals as ogg, mp3 or wav',
  ],
  entry: 'Built into the app; nothing is downloaded or executed from a mod',
} as const;

export const COMPAT_RUNTIME_FEATURES: Partial<Record<EngineFeature, FeatureSupport>> = {
  gameplay: 'supported',
  charts: 'supported',
  audio: 'supported',
  'mobile-controls': 'supported',
  'custom-notes': 'partial',
  characters: 'partial',
  stages: 'partial',
  'custom-events': 'partial',
  'asset-replacement': 'partial',
  saves: 'partial',
  lua: 'unsupported',
  hscript: 'unsupported',
  shaders: 'unsupported',
  modcharts: 'unsupported',
  video: 'unsupported',
};

export const COMPAT_RUNTIME_LIMITATIONS = [
  'Lua and HScript are never executed, so script-driven mod logic does not run.',
  'Chart events: camera zoom, scroll speed, Play Animation, Hey! and Change Character are applied; every other event name is reported per song.',
  'Change Character records the swap but does not load a second set of sprites yet.',
  'Stages are a background plus an optional front layer. Stage scripts, camera pans and lighting are not implemented.',
  'Characters support idle/sing animations, offsets, flip and scale; alt animations and shaders are not applied.',
  'Note skins are Sparrow atlases only. Skins that ship as individual images fall back to the default notes.',
  'Hold scoring uses one model for every chart format: a tail completes while held, and a release more than 120 ms early drops it. Engine-specific hold tables are not applied yet.',
  'Custom note types are drawn and judged as normal notes.',
  'V-Slice charts in tick time are refused rather than silently desynced; float and millisecond charts are read.',
  'Scores are stored in this browser only, in our own model, not in an engine save format.',
  'No real community mod has been through this runtime yet, so no compatibility level is claimed.',
];

export function hasCompatRuntime(engine: EngineId | null | undefined): boolean {
  return engine !== null && engine !== undefined && COMPAT_RUNTIME.engines.includes(engine);
}
