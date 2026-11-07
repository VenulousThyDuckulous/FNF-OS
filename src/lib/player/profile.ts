import type { EngineFeature, EngineId, FeatureSupport } from '../engines/types';

/**
 * The built-in compatibility runtime.
 *
 * This is not an engine port. It is our own playback implementation that reads
 * Psych-format chart data and audio from an imported mod. It exists because the
 * official engine web builds cannot load user mods, and shipping someone else's
 * engine build is either impossible or not permitted.
 *
 * Everything it claims is implemented in `src/lib/player` and covered by tests
 * in `tests/player-*.test.ts`. Anything not implemented is listed as such, and
 * its status is `experimental` until it has run real community mods.
 */

export const COMPAT_RUNTIME = {
  id: 'fnf-os-compat',
  name: 'FNF OS compatibility runtime',
  version: '0.1.0',
  status: 'experimental' as const,
  statusLabel: 'Experimental',
  /** Engines whose charts are read directly. Kade charts follow the Psych format. */
  engines: ['psych', 'kade'] as EngineId[],
  formats: ['Psych chart JSON under data/<song>/', 'Instrumental and vocals as ogg, mp3 or wav'],
  entry: 'Built into the app; nothing is downloaded or executed from a mod',
} as const;

export const COMPAT_RUNTIME_FEATURES: Partial<Record<EngineFeature, FeatureSupport>> = {
  gameplay: 'supported',
  charts: 'supported',
  audio: 'supported',
  'custom-notes': 'partial',
  'mobile-controls': 'supported',
  'custom-events': 'unsupported',
  characters: 'unsupported',
  stages: 'unsupported',
  lua: 'unsupported',
  hscript: 'unsupported',
  shaders: 'unsupported',
  modcharts: 'unsupported',
  video: 'unsupported',
  'asset-replacement': 'unsupported',
  saves: 'unsupported',
};

export const COMPAT_RUNTIME_LIMITATIONS = [
  'No characters, stages or backgrounds: the note highway plays over a plain backdrop.',
  'Lua and HScript are never executed, so script-driven mod logic does not run.',
  'Custom note types are drawn and judged as normal notes.',
  'Chart events are read but not applied; no camera moves, character animations or stage effects.',
  'Sustains are judged on their initial hit; there is no hold release scoring yet.',
  'No note skins or asset replacement: sprites from the mod are not loaded yet.',
  'Songs must ship their own instrumental; base-game audio is never bundled.',
];

export function hasCompatRuntime(engine: EngineId | null | undefined): boolean {
  return engine !== null && engine !== undefined && COMPAT_RUNTIME.engines.includes(engine);
}
