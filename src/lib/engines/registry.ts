import { COMPAT_RUNTIME_FEATURES } from '../player/profile';
import type { EngineDefinition, EngineId } from './types';

/**
 * The engine registry.
 *
 * Facts below were checked against the upstream repositories on 2026-11-07.
 * `playback` reflects what exists in this app: Psych charts can be played by the
 * built-in compatibility runtime, which is experimental and not an engine port.
 * Every other engine stays `unavailable` until a runtime has actually been built
 * and tested against real mods.
 */
export const ENGINES: Record<EngineId, EngineDefinition> = {
  psych: {
    id: 'psych',
    name: 'Psych Engine',
    shortName: 'Psych',
    upstream: 'https://github.com/ShadowMario/FNF-PsychEngine',
    license: 'Apache-2.0',
    licenseNote:
      'Apache-2.0 permits redistribution of modified sources with notices; base-game assets and music are not covered and must not be bundled.',
    import: 'supported',
    playback: 'experimental',
    playbackNote:
      'The built-in FNF OS compatibility runtime reads Psych-format charts and audio in the browser. It is not a Psych Engine port: Lua, HScript, characters, stages and chart events are not implemented, and it is not yet verified against community mods.',
    features: { ...COMPAT_RUNTIME_FEATURES },
    limitations: [
      'Desktop-only build flags gate Lua/HScript and video subsystems upstream.',
      'Video cutscenes rely on hxvlc, which has no direct browser equivalent.',
      'Mod folders are read from a filesystem path; the built-in runtime reads them from browser storage instead.',
      'Characters, stages, chart events and scripts are not drawn or executed yet.',
    ],
  },
  vslice: {
    id: 'vslice',
    name: 'Friday Night Funkin’ V-Slice',
    shortName: 'V-Slice',
    upstream: 'https://github.com/FunkinCrew/Funkin',
    license: 'Apache-2.0 (code) / separate asset licence',
    licenseNote:
      'Code is Apache-2.0. Game assets are licensed separately at funkin.assets and "Friday Night Funkin\'" is a trademark of The Funkin\' Crew Inc. Never bundle base-game assets.',
    import: 'supported',
    playback: 'unavailable',
    playbackNote:
      'The official HTML5 build exists, but it has no normal browser-side mod installation. A legitimate browser mod loader built on Polymod’s asset resolution is required, and that port does not exist yet. The built-in runtime does not read V-Slice charts.',
    features: {
      gameplay: 'unknown',
      charts: 'unknown',
      characters: 'unknown',
      stages: 'unknown',
      audio: 'unknown',
      lua: 'unsupported',
      hscript: 'unsupported',
      shaders: 'unknown',
      'asset-replacement': 'unknown',
      saves: 'unknown',
      'mobile-controls': 'unknown',
    },
    limitations: [
      'Official web build loads base assets only; browser mod installation is not supported upstream.',
      'Polymod resolves assets through the filesystem and needs a browser-side replacement.',
      'Assets are separately licensed; redistributing them is not permitted.',
      'The built-in runtime parses Psych charts only, so V-Slice charts fail with a named parse error.',
    ],
  },
  kade: {
    id: 'kade',
    name: 'Kade Engine',
    shortName: 'Kade',
    upstream: 'https://github.com/kadedev/Kade-Engine',
    license: 'Apache-2.0',
    licenseNote:
      'Apache-2.0. Historically superseded by later engines; treat compatibility reports as historical rather than maintained.',
    import: 'supported',
    playback: 'unavailable',
    playbackNote:
      'Kade charts follow the Psych format, so the built-in runtime can attempt them, but Kade mods typically rely on ModCore and asset folders that are not supported. No maintained Kade browser runtime exists.',
    features: {
      gameplay: 'unknown',
      charts: 'unknown',
      characters: 'unknown',
      audio: 'unknown',
      'asset-replacement': 'unknown',
      saves: 'unknown',
      'mobile-controls': 'unknown',
    },
    limitations: [
      'ModCore mod loading is desktop-only.',
      'Older HaxeFlixel target; some lime/openfl APIs used are not available on web.',
      'No maintained upstream browser target to adapt from.',
    ],
  },
  codename: {
    id: 'codename',
    name: 'Codename Engine',
    shortName: 'Codename',
    upstream: 'https://github.com/CodenameCrew/CodenameEngine',
    license: 'Apache-2.0 + additional README restrictions',
    licenseNote:
      'Apache-2.0, but the README states you may not release the entirety of Codename Engine on platforms, may not build unrelated engines from its code, and must credit when using it as a template. Redistributing a packaged runtime would conflict with that, so this engine stays behind a licensing gate until written permission is obtained.',
    import: 'supported',
    playback: 'unavailable',
    playbackNote:
      'Blocked by licensing before it is blocked by engineering: a redistributed browser runtime would be "releasing the entirety of Codename Engine on platforms". Requires explicit permission from the Codename Crew.',
    features: {
      gameplay: 'unknown',
      charts: 'unknown',
      characters: 'unknown',
      stages: 'unknown',
      audio: 'unknown',
      hscript: 'unknown',
      shaders: 'unknown',
      'asset-replacement': 'unknown',
      saves: 'unknown',
      'mobile-controls': 'unknown',
    },
    limitations: [
      'Redistribution restricted by the upstream README: a packaged runtime is not clearly permitted.',
      'HaxeFlixel + HScript Improved; same virtual-filesystem problem as Psych.',
      'Gate: obtain written permission before any runtime work.',
    ],
  },
};

export const ENGINE_LIST: EngineDefinition[] = Object.values(ENGINES);

export function getEngine(id: EngineId | null | undefined): EngineDefinition | null {
  if (!id) return null;
  return ENGINES[id] ?? null;
}

/** True when any engine can actually play a mod. Drives the honest UI copy. */
export function anyEnginePlayable(): boolean {
  return ENGINE_LIST.some((e) => e.playback === 'full' || e.playback === 'near-full' || e.playback === 'partial' || e.playback === 'experimental');
}
