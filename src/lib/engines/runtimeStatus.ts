import type { EngineId } from './types';

/**
 * The engine audit.
 *
 * This file answers one question per engine: *is that engine's real code
 * running inside a web page, loading a real mod, and playing a song?* It is a
 * record of checked evidence, not a plan, and every field carries a date and a
 * source so the answer can be re-checked rather than trusted.
 *
 * Rules this file exists to enforce:
 *
 * - `embeddedRuntime` is true only when the engine's own compiled code runs in
 *   an iframe through `RuntimeHost`. A parser, an imitation gameplay engine or
 *   a compatible-looking menu is not an embedded engine.
 * - `realModTested` is true only after a mod from the wild has been imported,
 *   loaded by that runtime and played. Synthetic fixtures do not count.
 * - `canClaimPlayable()` gates every "playable" word in the UI. It is false for
 *   all four engines today, and no copy may contradict it.
 *
 * `checkedAt` is the date the linked evidence was last read.
 */
export type RuntimeStatus =
  /** Nothing has been read yet. */
  | 'research-required'
  /** Upstream source, build system and licence have been read. */
  | 'source-verified'
  /** A browser build is being produced. No claim of working yet. */
  | 'browser-build-in-progress'
  /** A build boots in a browser. Still no mod loading. */
  | 'browser-build-working'
  /** A build reads a mod's own files through the virtual filesystem. */
  | 'mod-loading-working'
  /** A real mod was played through that build, with results recorded. */
  | 'gameplay-tested'
  /** Verified against a documented list of real mods. */
  | 'fully-playable'
  /** Cannot be distributed without permission the project does not have. */
  | 'blocked-licensing'
  /** Cannot be built for a browser without work upstream does not provide. */
  | 'blocked-technical';

export const STATUS_LABEL: Record<RuntimeStatus, string> = {
  'research-required': 'Research required',
  'source-verified': 'Source verified',
  'browser-build-in-progress': 'Browser build in progress',
  'browser-build-working': 'Browser build working',
  'mod-loading-working': 'Mod loading working',
  'gameplay-tested': 'Gameplay tested',
  'fully-playable': 'Fully playable',
  'blocked-licensing': 'Blocked by licensing',
  'blocked-technical': 'Blocked by technical limits',
};

export type StatusTone = 'ok' | 'warn' | 'danger' | 'muted';

export const STATUS_TONE: Record<RuntimeStatus, StatusTone> = {
  'research-required': 'muted',
  'source-verified': 'muted',
  'browser-build-in-progress': 'warn',
  'browser-build-working': 'warn',
  'mod-loading-working': 'warn',
  'gameplay-tested': 'ok',
  'fully-playable': 'ok',
  'blocked-licensing': 'danger',
  'blocked-technical': 'danger',
};

/**
 * Where a browser build comes from, if one exists at all.
 *
 * `selfHostable` and `modLoading` are only meaningful once `state` is not
 * `none`; they answer two separate questions, and both must be true before a
 * build could ever be packaged as a runtime here.
 */
export interface BrowserBuild {
  state: 'none' | 'upstream' | 'community';
  /** What was actually read to establish this. */
  evidence?: string;
  /** Whether this project may serve that build from its own origin. */
  selfHostable?: boolean;
  /** Whether that build can read a user's own mod from browser storage. */
  modLoading?: boolean;
}

export interface EngineAudit {
  engine: EngineId;
  status: RuntimeStatus;
  sourceVerified: boolean;
  licenceVerified: boolean;
  licence: string;
  /** Non-null when distribution needs permission that has not been given. */
  licenceGate: string | null;
  browserBuild: BrowserBuild;
  /** The engine's own code executing in this app. */
  embeddedRuntime: boolean;
  /** A mod from outside this repository, loaded and played by that runtime. */
  realModTested: boolean;
  scripting: 'runs-in-browser' | 'unavailable' | 'unknown';
  /** Exact reasons the engine cannot be embedded here today. */
  blockers: string[];
  /** The next concrete step that would move the status forward. */
  nextStep: string;
  checkedAt: string;
  sources: string[];
}

const CHECKED = '2026-11-08';

export const ENGINE_AUDITS: EngineAudit[] = [
  {
    engine: 'psych',
    status: 'blocked-technical',
    sourceVerified: true,
    licenceVerified: true,
    licence: 'Apache-2.0 (code). Base-game assets, music and the name are not covered.',
    licenceGate: null,
    browserBuild: {
      state: 'community',
      evidence:
        'Community forks compile with `lime test html5`, and Psych’s maintainers document only Windows, Linux and macOS builds. The fork’s own README states “modpacks and Lua scripts are unavailable in HTML5”.',
      selfHostable: true,
      modLoading: false,
    },
    embeddedRuntime: false,
    realModTested: false,
    scripting: 'unavailable',
    blockers: [
      'The HTML5 target fails on native-only `sys` APIs (`sys.File`, `sys.io.File`) used for weeks, mods and editors; compiling means stubbing every one of them.',
      'LuaJIT (`linc_luajit`) is a native binding with no browser target, and Psych gates `LUA_ALLOWED` / `HSCRIPT_ALLOWED` / `MODS_ALLOWED` behind desktop-only `if="desktop"` flags.',
      'Mod folders come from the filesystem. A browser build needs an asset resolver backed by the mod’s `Uint8Array` map, not a path.',
      'Video cutscenes use hxvlc, a native VLC binding.',
      'No upstream browser build exists whose mod loading has been shown to work, so there is nothing to package and test.',
    ],
    nextStep:
      'Produce a browser build with mod loading genuinely working (not compiled-and-disabled), serve it as a checksummed runtime package, then load a real Psych mod through RuntimeHost before changing any status.',
    checkedAt: CHECKED,
    sources: [
      'https://github.com/ShadowMario/FNF-PsychEngine/issues/12000',
      'https://github.com/ShadowMario/FNF-PsychEngine/issues/11523',
      'https://github.com/Migration-Team/PsychEngine/blob/main/BUILDING.md',
      'https://github.com/moxie-coder/FNF-PsychEngine-Extra-continuation',
    ],
  },
  {
    engine: 'vslice',
    status: 'blocked-technical',
    sourceVerified: true,
    licenceVerified: true,
    licence: 'Apache-2.0 for code; game assets are licensed separately and the name is a trademark.',
    licenceGate: null,
    browserBuild: {
      state: 'upstream',
      evidence:
        'An official HTML5 build exists and is hosted by the project. It loads the base game from its own bundle; there is no browser-side mod installation path.',
      selfHostable: false,
      modLoading: false,
    },
    embeddedRuntime: false,
    realModTested: false,
    scripting: 'unknown',
    blockers: [
      'Polymod resolves mod assets through the filesystem; a browser build would need its own resolver over the virtual filesystem.',
      'The official web build ships the base game’s assets, which are not ours to redistribute, so it cannot be repackaged as a runtime package.',
      'Saves go through the project’s backend; a local-first replacement would have to be written and tested.',
      'Nothing upstream loads a user’s own mod in the browser, so there is no build to test against.',
    ],
    nextStep:
      'Only an asset-free, self-hostable V-Slice web build with Polymod-compatible mod resolution could be packaged; until then, parsing its charts is not V-Slice support and is labelled as this app’s own runtime.',
    checkedAt: CHECKED,
    sources: [
      'https://github.com/FunkinCrew/Funkin',
      'https://github.com/FunkinCrew/Funkin/blob/main/docs/TO-DO.md',
    ],
  },
  {
    engine: 'kade',
    status: 'blocked-technical',
    sourceVerified: true,
    licenceVerified: true,
    licence: 'Apache-2.0 (code), upstream Funkin’ copyright retained.',
    licenceGate: null,
    browserBuild: {
      state: 'community',
      evidence:
        'Kade’s own building docs allow `lime build html5` from any platform, and 2021-era browser builds exist on itch.io, but the linked GitHub branch carries no source or build.',
      selfHostable: false,
      modLoading: false,
    },
    embeddedRuntime: false,
    realModTested: false,
    scripting: 'unavailable',
    blockers: [
      'ModCore, Kade’s mod loader, is desktop-only; browser builds load their embedded assets only.',
      'The only public browser port has no published source, so it cannot be reviewed, rebuilt, checksummed or hosted here.',
      'The project is historical (Haxe 4.2.x-era libraries), so compatibility work has a low ceiling.',
    ],
    nextStep:
      'Needs a published, licensed source for a browser build that loads user mods; without that there is nothing to package or test.',
    checkedAt: CHECKED,
    sources: [
      'https://github.com/KadeDev/Kade-Engine/blob/stable/docs/building.md',
      'https://github.com/Axmed119/FNF-Kade-Engine-1.51-Browser-port/tree/kade',
    ],
  },
  {
    engine: 'codename',
    status: 'blocked-licensing',
    sourceVerified: true,
    licenceVerified: true,
    licence: 'Apache-2.0 with extra README restrictions on redistribution.',
    licenceGate:
      'The README forbids releasing the entirety of Codename Engine on platforms. A packaged browser runtime hosted by this app reads as exactly that, so written permission is required first.',
    browserBuild: {
      state: 'none',
      evidence:
        'The README lists Web (HTML5) support as unchecked, and maintainers describe HTML5 builds as broken in their own discussions.',
      selfHostable: false,
      modLoading: false,
    },
    embeddedRuntime: false,
    realModTested: false,
    scripting: 'unknown',
    blockers: [
      'Licence: distribution of the engine itself needs permission this project does not have.',
      'No maintainer-supported web target exists yet; HTML5 is listed as future work.',
      'Even with permission, the same filesystem and shader problems as Psych apply.',
      'Substituting an imitation runtime would breach both the licence and this project’s rules.',
    ],
    nextStep:
      'Obtain written permission from the Codename Crew for a packaged browser runtime. Until then no runtime work starts and Codename mods stay importable and analysable only.',
    checkedAt: CHECKED,
    sources: [
      'https://github.com/CodenameCrew/CodenameEngine',
      'https://github.com/CodenameCrew/CodenameEngine/blob/main/README.md',
      'https://github.com/CodenameCrew/CodenameEngine/discussions/630',
    ],
  },
];

export function auditFor(engine: EngineId): EngineAudit {
  const found = ENGINE_AUDITS.find((audit) => audit.engine === engine);
  if (!found) throw new Error(`No engine audit exists for "${engine}".`);
  return found;
}

/**
 * The single gate for every "playable" claim in the UI.
 *
 * All five conditions must hold, and each is independently checkable: a real
 * engine build, running in the page, reading a real mod, with a clean licence.
 */
export function canClaimPlayable(engine: EngineId): boolean {
  const audit = auditFor(engine);
  return (
    audit.embeddedRuntime &&
    audit.realModTested &&
    audit.browserBuild.state !== 'none' &&
    audit.browserBuild.selfHostable === true &&
    audit.licenceGate === null
  );
}

export function playableEngines(): EngineId[] {
  return ENGINE_AUDITS.filter((audit) => canClaimPlayable(audit.engine)).map((audit) => audit.engine);
}

/** True when an engine's own code runs in this app at all. */
export function anyEmbeddedRuntime(): boolean {
  return ENGINE_AUDITS.some((audit) => audit.embeddedRuntime);
}

export function auditedEngines(): EngineId[] {
  return ENGINE_AUDITS.map((audit) => audit.engine);
}

/** One line the shell can show without overstating anything. */
export function engineStatusSummary(): string {
  if (anyEmbeddedRuntime()) {
    const playable = playableEngines();
    return playable.length > 0
      ? `${playable.length} engine runtime(s) embedded and tested.`
      : 'An engine runtime is embedded, but no real mod has been tested yet.';
  }
  return 'No engine runs inside the browser yet. Mods can be imported, identified and analysed.';
}
