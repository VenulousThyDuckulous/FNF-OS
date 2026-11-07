import type { EngineFeature, EngineId, FeatureSupport } from './types';
import { ENGINE_IDS } from './types';
import type { RuntimeManifest } from '../runtime/manifest';

/**
 * Engine feature support.
 *
 * Support is *derived data*, never a hand-written claim: a feature leaves
 * `unknown` only when a published engine runtime declares it, and that runtime
 * carries a manifest that passed integrity and manifest validation. With no
 * published runtime, every cell stays `unknown` — the honest state, not a
 * placeholder for "probably fine".
 */

export const FEATURE_LABEL: Record<EngineFeature, string> = {
  gameplay: 'Gameplay',
  charts: 'Charts',
  characters: 'Characters',
  stages: 'Stages',
  audio: 'Audio',
  video: 'Video',
  lua: 'Lua',
  hscript: 'HScript',
  shaders: 'Shaders',
  modcharts: 'Modcharts',
  'custom-events': 'Custom events',
  'custom-notes': 'Custom notes',
  'asset-replacement': 'Asset replacement',
  saves: 'Saves',
  'mobile-controls': 'Mobile controls',
};

export const FEATURE_ORDER: EngineFeature[] = [
  'gameplay',
  'charts',
  'characters',
  'stages',
  'audio',
  'video',
  'lua',
  'hscript',
  'shaders',
  'modcharts',
  'custom-events',
  'custom-notes',
  'asset-replacement',
  'saves',
  'mobile-controls',
];

export interface FeatureSupportRow {
  feature: EngineFeature;
  label: string;
  support: FeatureSupport;
}

export interface EngineSupportEntry {
  engine: EngineId;
  /** The runtime whose manifest supplied this row, if any. */
  manifest: RuntimeManifest | null;
  rows: FeatureSupportRow[];
}

/** Newest engine runtime manifest for an engine, by semantic-ish version order. */
export function latestEngineManifest(
  manifests: readonly RuntimeManifest[],
  engine: EngineId,
): RuntimeManifest | null {
  const relevant = manifests.filter((manifest) => manifest.kind === 'engine' && manifest.engine === engine);
  if (relevant.length === 0) return null;
  return [...relevant].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  )[0];
}

/**
 * Build the engine × feature matrix.
 *
 * Reference runtimes are ignored entirely: the lab self-test proves the host,
 * not an engine, and must never colour this table.
 */
export function supportMatrix(manifests: readonly RuntimeManifest[]): EngineSupportEntry[] {
  return ENGINE_IDS.map((engine) => {
    const manifest = latestEngineManifest(manifests, engine);
    const rows = FEATURE_ORDER.map((feature) => ({
      feature,
      label: FEATURE_LABEL[feature],
      support: manifest?.features[feature] ?? 'unknown',
    }));
    return { engine, manifest, rows };
  });
}

/** Count of features an engine's runtime actually implements, partially or fully. */
export function implementedFeatureCount(entry: EngineSupportEntry): number {
  return entry.rows.filter((row) => row.support === 'supported' || row.support === 'partial').length;
}
