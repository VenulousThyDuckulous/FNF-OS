import type { EngineFeature, FeatureSupport } from '../engines/types';
import type { RuntimePackage } from './manager';

/**
 * The runtime catalogue schema.
 *
 * Three kinds of runtime are supported, because three kinds now exist in the
 * wild. They are not interchangeable, and the catalogue must never let one be
 * presented as another:
 *
 * - `engine-port`     a browser build of an engine (its own mod layout).
 * - `community-port`  an unofficial browser build of an engine, with its own
 *                     provenance and maintenance risk.
 * - `conversion`      an independent engine that imports selected content from
 *                     other engines (H-Slice). Its compatibility profile is its
 *                     own: it is never a Psych or V-Slice runtime.
 *
 * The catalogue is empty and stays empty until an entry can satisfy
 * {@link publishBlockers}. Everything below is structure, not a claim.
 */

export type RuntimeKind = 'engine-port' | 'community-port' | 'conversion';

export type DistributionPermission =
  /** Upstream licence permits redistributing this build. */
  | 'permitted'
  /** Upstream restrictions make redistribution unclear or forbidden. */
  | 'restricted'
  /** Licence has not been reviewed yet; treated as restricted. */
  | 'unreviewed';

export type TestOutcome = 'passed' | 'failed' | 'blocked';

export interface ModFormat {
  /** Stable id, e.g. `psych-pack`, `vslice-polymod`, `fnfc`. */
  id: string;
  label: string;
}

/** One real run against one real mod. This is the only source of a level. */
export interface RuntimeTestRun {
  ranAt: string;
  modName: string;
  modFormat: string;
  outcome: TestOutcome;
  /** 1-4 only for a passed run; never inferred from a failed or blocked one. */
  level: 1 | 2 | 3 | 4 | null;
  device: 'desktop' | 'mobile';
  notes: string;
}

export interface CatalogueRuntime extends RuntimePackage {
  kind: RuntimeKind;
  /** Source repository or distribution page. */
  upstream: string;
  license: string;
  licenseNote: string;
  distribution: DistributionPermission;
  /** True when the build can be served from our own origin. */
  selfHostable: boolean;
  /** True when the only usable build is somebody else's hosted page. */
  hostedOnly: boolean;
  /** Engine versions whose content this runtime accepts. */
  engineVersions: string[];
  /** Mod layouts it reads. Empty means "not established by testing". */
  modFormats: string[];
  /** What it actually implements. `unknown` unless measured. */
  capabilities: Partial<Record<EngineFeature, FeatureSupport>>;
  testRuns: RuntimeTestRun[];
}

export const RUNTIME_CATALOGUE: CatalogueRuntime[] = [];

/**
 * Why an entry cannot be published yet. An entry with any blocker must not be
 * added to the catalogue; the UI derives "not available" from this.
 */
export function publishBlockers(entry: CatalogueRuntime): string[] {
  const blockers: string[] = [];

  if (!/^[a-f0-9]{64}$/i.test(entry.sha256)) {
    blockers.push('No SHA-256 checksum reviewed for this build.');
  }
  if (entry.distribution !== 'permitted') {
    blockers.push(
      entry.distribution === 'unreviewed'
        ? 'Distribution licence has not been reviewed.'
        : 'Upstream restricts redistributing this build.',
    );
  }
  if (entry.hostedOnly) {
    blockers.push('Only a third-party hosted build exists; it cannot be self-hosted.');
  }
  if (!entry.selfHostable) {
    blockers.push('The build is not known to be self-hostable.');
  }
  if (entry.modFormats.length === 0) {
    blockers.push('No mod format has been shown to load in a real test.');
  }
  if (!entry.testRuns.some((run) => run.outcome === 'passed' && run.level !== null)) {
    blockers.push('No real mod has passed a test run, so no compatibility level exists.');
  }
  if (entry.kind === 'conversion') {
    const claimsEngineFeature = Object.keys(entry.capabilities).length > 0 && entry.engine === null;
    if (claimsEngineFeature) {
      blockers.push('A conversion runtime must describe its own profile, not an engine’s features.');
    }
  }

  return blockers;
}

export function isPublishable(entry: CatalogueRuntime): boolean {
  return publishBlockers(entry).length === 0;
}

/**
 * Projects that exist and matter to this decision, with what each one still
 * needs. This is research data, not a runtime list: nothing here can be
 * launched, and no entry may be copied into the catalogue without the tests
 * listed in its `missing` field.
 */
export type CandidateStatus =
  | 'candidate'
  | 'untested'
  | 'unverifiable'
  | 'blocked-licence'
  | 'no-browser-build';

export type BuildStatus =
  | 'no-browser-build'
  | 'hosted-build-only'
  | 'self-hostable'
  | 'source-unavailable';

export interface RuntimeCandidate {
  id: string;
  name: string;
  kind: RuntimeKind;
  license: string;
  licenseNote: string;
  distribution: DistributionPermission;
  upstream: string;
  buildStatus: BuildStatus;
  status: CandidateStatus;
  summary: string;
  /** Concrete work required before this could enter the catalogue. */
  missing: string[];
}

export const RUNTIME_CANDIDATES: RuntimeCandidate[] = [
  {
    id: 'psych-html5-star-studios',
    name: 'Psych Engine HTML5 (star-studios-official)',
    kind: 'engine-port',
    license: 'Apache-2.0',
    licenseNote:
      'Psych Engine is Apache-2.0; base-game assets and music are not covered and must not be bundled.',
    distribution: 'permitted',
    upstream: 'https://github.com/star-studios-official/FNF-PsychEngine-HTML5',
    buildStatus: 'no-browser-build',
    status: 'untested',
    summary:
      'A Psych source tree that can be compiled with Lime, but the project gates MODS_ALLOWED, LUA_ALLOWED and HSCRIPT_ALLOWED behind `if="desktop"`, so a web build has no mod loading, no Lua and no HScript. BUILDING.md documents only Windows, Linux and macOS.',
    missing: [
      'A browser build with mod loading compiled in — upstream Psych hits native-only sys.io.File, and maintainers have said a mods folder does not work on HTML5.',
      'A VFS-backed asset resolver to replace filesystem mod loading.',
      'Real mod test runs: chart-only, Lua-heavy, custom stage, shader.',
      'Mobile test on a real device, including audio and input latency.',
    ],
  },
  {
    id: 'psych-html5-itch-hosted',
    name: 'Psych Engine HTML5 (itch.io hosted build)',
    kind: 'engine-port',
    license: 'Psych Engine Apache-2.0 + base assets not covered',
    licenseNote:
      'The hosted build embeds base-game assets. Nothing indicates it may be re-hosted by a third party.',
    distribution: 'restricted',
    upstream: 'https://kelvindoan.itch.io/fnf-psych-engine',
    buildStatus: 'hosted-build-only',
    status: 'no-browser-build',
    summary:
      'A playable HTML5 build exists on itch.io, made with OpenFL. It ships fixed content: there is no in-app path to install a user’s own ZIP, and no source, checksum or hosting permission to build on.',
    missing: [
      'A redistributable, self-hostable build with permission.',
      'Any documented way to load user mods in the browser.',
      'Checksums and a licence review for the exact artifacts.',
    ],
  },
  {
    id: 'h-slice',
    name: 'H-Slice',
    kind: 'conversion',
    license: 'MIT (engine, builder, docs); bundled FNF assets excluded',
    licenseNote:
      'The engine and mod builder are MIT, but the repository ships Friday Night Funkin’ base-game weeks, characters and music that are not MIT and are not the author’s to relicense. A redistributed package would have to exclude them.',
    distribution: 'restricted',
    upstream: 'https://github.com/AverageCatUser/H-slice',
    buildStatus: 'self-hostable',
    status: 'candidate',
    summary:
      'A single-file HTML engine (build b33) with a converter that turns selected V-Slice and Psych content into its own per-song mod format. It is an independent engine, not a port of either: it does not run Psych Lua, V-Slice HScript, custom note types, animate atlases or animated stage props, and it needs a `mods.js` script line per mod.',
    missing: [
      'Permission or an asset-free build before we could redistribute it.',
      'A loading path that does not require editing mods.js on disk per song.',
      'Test runs of converted songs, including known-unsupported cases, measured honestly.',
      'A separate compatibility profile: converted Psych content is not “Psych support”.',
    ],
  },
  {
    id: 'kade-browser-port',
    name: 'Kade Engine 1.5.1 browser port',
    kind: 'community-port',
    license: 'Unverified (Kade Engine itself is Apache-2.0)',
    licenseNote:
      'The repository’s only branch on GitHub contains a README and no source or build, so the provenance and licence of the deployed HTML5 build cannot be inspected.',
    distribution: 'unreviewed',
    upstream: 'https://github.com/Axmed119/FNF-Kade-Engine-1.51-Browser-port/tree/kade',
    buildStatus: 'source-unavailable',
    status: 'unverifiable',
    summary:
      'An itch.io HTML5 build from 2021, labelled 1.5.1 in the title while its own page and commenters report 1.3.1. The linked GitHub branch has no code, so the build cannot be reviewed, rebuilt, checksummed or self-hosted.',
    missing: [
      'Source and a licence that permits redistribution.',
      'A rebuild we can checksum and host ourselves.',
      'Proof that user mods load at all in the browser.',
    ],
  },
  {
    id: 'codename-engine',
    name: 'Codename Engine',
    kind: 'engine-port',
    license: 'Apache-2.0 plus README usage restrictions',
    licenseNote:
      'The README forbids "release the entirety of Codename Engine on platforms" while allowing mods that use it as a source. A redistributed browser runtime reads as exactly that forbidden release.',
    distribution: 'restricted',
    upstream: 'https://github.com/CodenameCrew/CodenameEngine',
    buildStatus: 'no-browser-build',
    status: 'blocked-licence',
    summary:
      'Web/HTML5 and mobile support are listed as future work, and maintainers describe HTML5 builds as broken. The licence question comes first: written permission would be required before any packaged runtime may be distributed.',
    missing: [
      'Written permission from the Codename Crew for a packaged browser runtime.',
      'A web build the maintainers consider usable.',
      'Mod loading through a virtual filesystem, then real mod tests.',
    ],
  },
];

export function candidatesByStatus(status: CandidateStatus): RuntimeCandidate[] {
  return RUNTIME_CANDIDATES.filter((candidate) => candidate.status === status);
}
