import type { EngineFeature } from '../engines/types';

/**
 * Feature signals: what a mod *asks for*, inferred from its files.
 *
 * This is static analysis. It says "this mod contains Lua scripts", never "this
 * mod will run". Runtime compatibility levels come only from the Compatibility
 * Lab running the mod against a real runtime.
 */

export interface FeatureSignal {
  id: EngineFeature;
  label: string;
  /** Why this feature is hard or easy in a browser, shown in the report. */
  note: string;
  test: (paths: string[]) => boolean;
  evidence?: (paths: string[]) => string[];
}

const match = (paths: string[], re: RegExp) => paths.filter((p) => re.test(p));

export const FEATURE_SIGNALS: FeatureSignal[] = [
  {
    id: 'lua',
    label: 'Lua scripts',
    note: 'Needs a Lua host inside the runtime; script sandboxing differs from desktop.',
    test: (p) => match(p, /(^|\/).*\.lua$/).length > 0,
  },
  {
    id: 'hscript',
    label: 'Haxe scripts (HScript)',
    note: 'Needs an HScript interpreter compiled into the browser runtime.',
    test: (p) => match(p, /\.(hx|hxs|hscript)$/).length > 0,
  },
  {
    id: 'shaders',
    label: 'Custom shaders',
    note: 'GLSL usually survives a WebGL port, but engine-specific shader uniforms often do not.',
    test: (p) => match(p, /\.(frag|vert|glsl|shader)$/).length > 0,
  },
  {
    id: 'video',
    label: 'Video cutscenes',
    note: 'Desktop engines use hxvlc; browsers restrict autoplay and codec support varies.',
    test: (p) => match(p, /\.(mp4|webm|ogv|mkv|mov)$/).length > 0 || p.some((x) => x.includes('videos/')),
  },
  {
    id: 'modcharts',
    label: 'Modcharts',
    note: 'Scripted stage movement runs through the engine scripting host.',
    test: (p) => p.some((x) => x.includes('modchart')),
  },
  {
    id: 'custom-events',
    label: 'Custom events',
    note: 'Event systems are engine-specific and must be ported with the engine.',
    test: (p) => p.some((x) => x.includes('events.json') || x.includes('custom_events') || x.includes('custevent')),
  },
  {
    id: 'custom-notes',
    label: 'Custom note skins',
    note: 'Note skin loading is usually asset replacement and ports with the renderer.',
    test: (p) => p.some((x) => x.includes('noteskin') || x.includes('note_skins') || x.includes('custom_notes')),
  },
  {
    id: 'custom-characters',
    label: 'Custom characters/stages',
    note: 'Animation formats (XML/Animate Atlas) need a browser atlas loader.',
    test: (p) => p.some((x) => x.includes('characters/') || x.includes('stages/')),
  },
  {
    id: 'charts',
    label: 'Chart data',
    note: 'Chart JSON is portable; schema differences are handled by the adapter.',
    test: (p) => match(p, /(^|\/)data(\/songs)?\/.*\.json$/).length > 0,
  },
  {
    id: 'audio',
    label: 'Audio',
    note: 'OGG support is good in modern browsers; exact loop points are not.',
    test: (p) => match(p, /\.(ogg|mp3|wav|flac)$/).length > 0,
  },
] as FeatureSignal[];

/** Native binaries are never executed. They are a hard blocker, not a feature. */
export const NATIVE_BINARY_RE = /\.(exe|dll|so|dylib|bat|cmd|jar|apk|app)$/i;
