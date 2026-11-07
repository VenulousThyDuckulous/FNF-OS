import { ENGINE_IDS, type EngineFeature, type EngineId, type FeatureSupport } from '../engines/types';

/**
 * Runtime package manifests.
 *
 * A runtime is a self-contained web bundle for one engine at one version. The
 * manifest is the contract between whoever publishes that bundle and FNF OS, so
 * it is validated strictly: a manifest that cannot be parsed is a package that
 * cannot be installed.
 *
 * The package's own SHA-256 is deliberately *not* in the manifest. A file cannot
 * contain the hash of itself, so the checksum lives in the runtime catalogue
 * (`RuntimePackage.sha256`) and is compared against the downloaded bytes before
 * anything is unpacked.
 */

export const RUNTIME_SCHEMA_VERSION = 1;

/** Manifest filename at the root of every runtime package. */
export const RUNTIME_MANIFEST_FILE = 'runtime.json';

export const RUNTIME_LIMITS = {
  maxEntries: 5000,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathLength: 512,
} as const;

const FEATURE_IDS: EngineFeature[] = [
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

const SUPPORT_LEVELS: FeatureSupport[] = ['supported', 'partial', 'unsupported', 'unknown'];

export interface RuntimeManifest {
  schemaVersion: 1;
  /** Stable package id, e.g. `psych-0.7.3-web`. */
  id: string;
  engine: EngineId;
  /** Engine version this runtime serves. */
  version: string;
  /** HTML entry point, relative to the package root. */
  entry: string;
  /** ISO date the package was published. */
  publishedAt: string;
  /** Licence of the bundled engine build, as reviewed for this package. */
  license: string;
  /** What this runtime actually supports. Absent keys mean unknown. */
  features: Partial<Record<EngineFeature, FeatureSupport>>;
  notes?: string;
}

export class RuntimeManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeManifestError';
  }
}

function fail(message: string): never {
  throw new RuntimeManifestError(message);
}

/**
 * Reject anything that is not a plain relative path inside the package.
 * Windows separators are normalised; `..`, absolute paths, drive letters and
 * control characters are refused, mirroring the import safety rules.
 */
export function isSafeRuntimePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > RUNTIME_LIMITS.maxPathLength) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;

  const normalised = value.replace(/\\/g, '/');
  if (normalised.startsWith('/')) return false;
  if (/^[a-z]:/i.test(normalised)) return false;

  return normalised.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRuntimeManifest(input: unknown): RuntimeManifest {
  if (!isRecord(input)) fail('Runtime manifest must be a JSON object.');

  if (input.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    fail(
      `Runtime manifest schema ${String(input.schemaVersion)} is not supported; this build reads schema ${RUNTIME_SCHEMA_VERSION}.`,
    );
  }

  const id = input.id;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id)) {
    fail('Runtime manifest needs a lowercase id such as `psych-0.7.3-web`.');
  }

  const engine = input.engine;
  if (typeof engine !== 'string' || !(ENGINE_IDS as string[]).includes(engine)) {
    fail(`Runtime manifest names an unknown engine: ${String(engine)}.`);
  }

  const version = input.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Runtime manifest version "${String(version)}" is not a semantic version.`);
  }

  const entry = input.entry;
  if (!isSafeRuntimePath(entry) || !entry.toLowerCase().endsWith('.html')) {
    fail('Runtime manifest entry must be a relative .html path inside the package.');
  }

  const publishedAt = input.publishedAt;
  if (typeof publishedAt !== 'string' || Number.isNaN(Date.parse(publishedAt))) {
    fail('Runtime manifest needs an ISO `publishedAt` date.');
  }

  const license = input.license;
  if (typeof license !== 'string' || license.trim().length === 0) {
    fail('Runtime manifest must name the licence of the bundled engine build.');
  }

  if (!isRecord(input.features)) fail('Runtime manifest needs a `features` object.');
  const features: Partial<Record<EngineFeature, FeatureSupport>> = {};
  for (const [key, value] of Object.entries(input.features)) {
    if (!(FEATURE_IDS as string[]).includes(key)) fail(`Unknown runtime feature "${key}".`);
    if (typeof value !== 'string' || !(SUPPORT_LEVELS as string[]).includes(value)) {
      fail(`Feature "${key}" must be one of ${SUPPORT_LEVELS.join(', ')}.`);
    }
    features[key as EngineFeature] = value as FeatureSupport;
  }

  const notes = input.notes;
  if (notes !== undefined && typeof notes !== 'string') fail('Runtime manifest `notes` must be text.');

  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id,
    engine: engine as EngineId,
    version,
    entry,
    publishedAt,
    license,
    features,
    ...(notes === undefined ? {} : { notes }),
  };
}

export function parseRuntimeManifestJson(text: string): RuntimeManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('Runtime manifest is not valid JSON.');
  }
  return parseRuntimeManifest(parsed);
}
