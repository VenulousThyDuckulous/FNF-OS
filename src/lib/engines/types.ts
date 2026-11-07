/**
 * Shared vocabulary for engines, detection and compatibility.
 *
 * These types are deliberately strict about what has *actually* been verified.
 * A compatibility level of 1-4 may only be produced by a runtime test run; the
 * static analyser leaves `level` null and says why.
 */

export type EngineId = 'psych' | 'vslice' | 'kade' | 'codename';

/**
 * How far a mod can be taken with a given engine today.
 *
 * - full / near-full / partial: measured, tested results against a runtime.
 * - experimental: runs, but is expected to break on real mods.
 * - unavailable: no browser runtime exists yet (the v1.0 state for all engines).
 * - incompatible: cannot run in a browser at all.
 */
export type EngineStatus =
  | 'full'
  | 'near-full'
  | 'partial'
  | 'experimental'
  | 'unavailable'
  | 'incompatible';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export type EngineFeature =
  | 'gameplay'
  | 'charts'
  | 'characters'
  | 'stages'
  | 'audio'
  | 'video'
  | 'lua'
  | 'hscript'
  | 'shaders'
  | 'modcharts'
  | 'custom-events'
  | 'custom-notes'
  | 'asset-replacement'
  | 'saves'
  | 'mobile-controls';

/** Per-feature support *inside a browser runtime*, not inside the engine itself. */
export type FeatureSupport = 'supported' | 'partial' | 'unsupported' | 'unknown';

export interface EngineDefinition {
  id: EngineId;
  name: string;
  shortName: string;
  /** Upstream source repository, used by the adapter workspace in /engines. */
  upstream: string;
  /** SPDX-ish identifier recorded from the upstream repository. */
  license: string;
  /** Anything the licence or README adds beyond the bare licence. */
  licenseNote: string;
  /** Importing/identifying mods for this engine is supported today. */
  import: 'supported' | 'none';
  /** In-browser playback support. */
  playback: EngineStatus;
  playbackNote: string;
  /** Feature support of the browser runtime. Empty = no runtime exists yet. */
  features: Partial<Record<EngineFeature, FeatureSupport>>;
  /** Documented, honest limits. Shown in the Launch Menu and engine status. */
  limitations: string[];
}

export const ENGINE_IDS: EngineId[] = ['psych', 'vslice', 'kade', 'codename'];

export function isEngineId(value: string): value is EngineId {
  return (ENGINE_IDS as string[]).includes(value);
}

export const STATUS_LABEL: Record<EngineStatus, string> = {
  full: 'Fully supported',
  'near-full': 'Near-full support',
  partial: 'Partial support',
  experimental: 'Experimental',
  unavailable: 'Not yet available',
  incompatible: 'Incompatible',
};

export const LEVEL_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: 'Level 1 - Incompatible',
  2: 'Level 2 - Partial compatibility',
  3: 'Level 3 - Near-full compatibility',
  4: 'Level 4 - Full compatibility',
};
