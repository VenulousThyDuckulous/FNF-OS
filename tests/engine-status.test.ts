import { describe, expect, it } from 'vitest';
import { ENGINES } from '../src/lib/engines/registry';
import {
  ENGINE_AUDITS,
  STATUS_LABEL,
  auditFor,
  auditedEngines,
  canClaimPlayable,
  engineStatusSummary,
  playableEngines,
} from '../src/lib/engines/runtimeStatus';
import { ENGINE_IDS } from '../src/lib/engines/types';

describe('engine audit coverage', () => {
  it('audits every engine exactly once', () => {
    expect(auditedEngines().sort()).toEqual([...ENGINE_IDS].sort());
    expect(new Set(auditedEngines()).size).toBe(ENGINE_IDS.length);
  });

  it('every audit carries evidence, blockers and a next step', () => {
    for (const audit of ENGINE_AUDITS) {
      expect(audit.blockers.length).toBeGreaterThan(0);
      expect(audit.nextStep.length).toBeGreaterThan(20);
      expect(audit.sources.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(audit.checkedAt))).toBe(false);
      expect(STATUS_LABEL[audit.status]).toBeTruthy();
    }
  });

  it('reports the blocked engines for the reasons that were actually found', () => {
    expect(auditFor('psych').status).toBe('blocked-technical');
    expect(auditFor('vslice').status).toBe('blocked-technical');
    expect(auditFor('kade').status).toBe('blocked-technical');
    expect(auditFor('codename').status).toBe('blocked-licensing');
  });
});

describe('playability gate', () => {
  it('claims no playable engine today', () => {
    expect(playableEngines()).toEqual([]);
    for (const engine of ENGINE_IDS) expect(canClaimPlayable(engine)).toBe(false);
  });

  it('never treats a compiled-or-disabled browser build as playable', () => {
    const psych = auditFor('psych');
    // The community build exists and compiles, but cannot read user mods.
    const build = psych.browserBuild;
    expect(build.state).toBe('community');
    expect(build.state === 'none' ? null : build.modLoading).toBe(false);
    expect(psych.embeddedRuntime).toBe(false);
    expect(canClaimPlayable('psych')).toBe(false);
  });

  it('keeps the launch menu copy honest', () => {
    expect(engineStatusSummary()).toMatch(/No engine runs inside the browser yet/);
  });
});

describe('audit and registry agree', () => {
  it('never advertises playback the audit has not verified', () => {
    for (const audit of ENGINE_AUDITS) {
      const playback = ENGINES[audit.engine].playback;
      if (!canClaimPlayable(audit.engine)) {
        expect(['full', 'near-full', 'partial']).not.toContain(playback);
      }
      if (playback === 'experimental') {
        // The in-house runtime may run, but it is not the engine.
        expect(audit.embeddedRuntime).toBe(false);
      }
    }
  });

  it('requires an embedded runtime before claiming a real mod was tested', () => {
    for (const audit of ENGINE_AUDITS) {
      if (audit.realModTested) expect(audit.embeddedRuntime).toBe(true);
      if (audit.embeddedRuntime) expect(audit.browserBuild.state).not.toBe('none');
      if (audit.licenceGate) expect(canClaimPlayable(audit.engine)).toBe(false);
    }
  });
});
