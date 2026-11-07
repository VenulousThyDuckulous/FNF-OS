import { getEngine } from '../engines/registry';
import type { EngineId } from '../engines/types';
import { FEATURE_SIGNALS, NATIVE_BINARY_RE } from './features';

/**
 * Static compatibility analysis.
 *
 * What it can do: identify which engine features a mod depends on, flag hard
 * blockers (native binaries, unimplemented runtime, missing chart), and list
 * what a runtime would have to support.
 *
 * What it must never do: invent a compatibility level or a percentage. Levels
 * 1-4 are only assigned by the Compatibility Lab after running the mod.
 */

export interface FeatureFinding {
  id: string;
  label: string;
  detected: boolean;
  note: string;
  evidence: string[];
}

export interface CompatibilityReport {
  engine: EngineId | null;
  engineVersion: string | null;
  /** null until a runtime test run has actually happened. */
  level: 1 | 2 | 3 | 4 | null;
  levelReason: string;
  /** True only when produced by a real test run. Always false in v1.0. */
  verified: boolean;
  findings: FeatureFinding[];
  blockers: string[];
  warnings: string[];
  checkedAt: string;
}

export interface AnalysisInput {
  engine: EngineId | null;
  engineVersion: string | null;
  paths: string[];
}

export function analyzeMod(input: AnalysisInput): CompatibilityReport {
  const paths = input.paths.map((p) => p.replace(/\\/g, '/').toLowerCase());
  const engine = getEngine(input.engine);

  const findings: FeatureFinding[] = FEATURE_SIGNALS.map((signal) => {
    const evidence = paths.filter((p) => signal.test([p]));
    return {
      id: signal.id,
      label: signal.label,
      detected: evidence.length > 0,
      note: signal.note,
      evidence: evidence.slice(0, 5),
    };
  });

  const blockers: string[] = [];
  const warnings: string[] = [];

  const native = paths.filter((p) => NATIVE_BINARY_RE.test(p));
  if (native.length > 0) {
    blockers.push(
      `Archive contains native executables (${native.slice(0, 3).join(', ')}). FNF OS never executes EXE, DLL or native plugins.`,
    );
  }

  if (!engine) {
    blockers.push(
      'Engine could not be identified from this folder layout. Set the engine manually to see an accurate report.',
    );
  } else if (engine.import === 'none') {
    blockers.push(`${engine.name} is not supported for import yet.`);
  } else if (engine.playback !== 'full' && engine.playback !== 'near-full' && engine.playback !== 'partial' && engine.playback !== 'experimental') {
    blockers.push(`No browser runtime exists for ${engine.name} yet, so this mod cannot be launched.`);
  }

  const hasChart = paths.some((p) => /(^|\/)data(\/songs)?\/.*\.json$/.test(p));
  if (!hasChart) {
    warnings.push('No chart JSON found under data/. The mod may be an asset-only pack.');
  }

  const hasAudio = paths.some((p) => /\.(ogg|mp3|wav)$/.test(p));
  if (!hasAudio) {
    warnings.push('No audio files found. The mod may rely entirely on base-game audio.');
  }

  const video = findings.find((f) => f.id === 'video');
  if (video?.detected && input.engine === 'psych') {
    warnings.push('Video cutscenes are expected to fail: hxvlc playback is not available in browsers.');
  }

  const unsupported: FeatureFinding[] = [];
  if (engine) {
    for (const finding of findings) {
      if (!finding.detected) continue;
      const support = engine.features[finding.id as keyof typeof engine.features];
      if (support === 'unsupported') unsupported.push(finding);
    }
  }
  for (const finding of unsupported) {
    warnings.push(`${finding.label} is not supported by the ${engine?.shortName} browser runtime.`);
  }

  return {
    engine: input.engine,
    engineVersion: input.engineVersion,
    level: null,
    levelReason: engine
      ? `No compatibility level is assigned. Levels 1-4 require a runtime test run and no ${engine.shortName} browser runtime has been published.`
      : 'No compatibility level is assigned because the engine is unknown.',
    verified: false,
    findings,
    blockers,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

export function detectedFeatureCount(report: CompatibilityReport): number {
  return report.findings.filter((f) => f.detected).length;
}

export function canLaunch(report: CompatibilityReport): boolean {
  return report.blockers.length === 0 && report.verified && report.level !== null && report.level >= 2;
}
