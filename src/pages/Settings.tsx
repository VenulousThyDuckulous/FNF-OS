import { useEffect, useMemo, useState } from 'react';
import { LabSection } from '../components/LabSection';
import { Icon, Section } from '../components/ui';
import { ENGINE_LIST } from '../lib/engines/registry';
import { FEATURE_LABEL, supportMatrix } from '../lib/engines/support';
import { STATUS_LABEL } from '../lib/engines/types';
import { engineName } from '../lib/format';
import { formatBytes } from '../lib/import/safety';
import { COMPAT_RUNTIME, COMPAT_RUNTIME_FEATURES, COMPAT_RUNTIME_LIMITATIONS } from '../lib/player/profile';
import { RUNTIME_CANDIDATES, type CandidateStatus } from '../lib/runtime/catalogue';
import { installedRuntimes, RUNTIME_CATALOG } from '../lib/runtime/manager';
import { readStorage, requestPersistence, storageWarning, type StorageSnapshot } from '../lib/storage';
import { Link } from '../router';
import { ACCENT_PRESETS, useSettings, type ThemeMode } from '../state/settings';
import { useToast } from '../state/toast';
import { useLibrary } from '../state/library';

const VERSION = '1.0.0-alpha.1';

const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  candidate: 'candidate',
  untested: 'untested',
  unverifiable: 'unverifiable',
  'blocked-licence': 'blocked: licence',
  'no-browser-build': 'no usable browser build',
};

export function SettingsPage(): JSX.Element {
  const { settings, setTheme, setAccent, resetAppearance, reopenLaunch } = useSettings();
  const { mods, projects, storage } = useLibrary();
  const { push } = useToast();
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(storage);

  useEffect(() => {
    setSnapshot(storage);
  }, [storage]);

  const warning = snapshot ? storageWarning(snapshot) : null;

  const support = useMemo(() => {
    const manifests = Object.values(installedRuntimes()).flatMap((entry) =>
      entry.manifest ? [entry.manifest] : [],
    );
    return supportMatrix(manifests);
  }, []);

  return (
    <div className="stack" style={{ gap: 26 }}>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Appearance, storage, engine status and information. Everything here is stored on this device.</p>
        </div>
      </header>

      <Section title="Appearance" description="Themes and accent colours. Changes apply immediately.">
        <div className="card stack">
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="theme-mode">Mode</label>
            <select
              id="theme-mode"
              className="input"
              value={settings.theme}
              onChange={(event) => setTheme(event.target.value as ThemeMode)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Match system</option>
            </select>
          </div>

          <div className="field">
            <label>Accent colour</label>
            <div className="swatch-row">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="swatch"
                  style={{ background: preset.value }}
                  data-selected={settings.accent.toLowerCase() === preset.value.toLowerCase()}
                  onClick={() => setAccent(preset.value, preset.id)}
                  aria-label={preset.name}
                  title={preset.name}
                />
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <input
                type="color"
                value={settings.accent}
                onChange={(event) => setAccent(event.target.value)}
                aria-label="Custom accent colour"
                style={{
                  width: 42,
                  height: 34,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  padding: 3,
                }}
              />
              <span className="faint">Custom accent</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAppearance}>
                Reset to default
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Launch menu" description="The welcome screen is shown once. You can revisit it any time.">
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <p className="muted">
            Status: {settings.launchComplete ? 'already seen' : 'not yet completed'}. Re-opening it will not
            delete anything.
          </p>
          <button type="button" className="btn" onClick={reopenLaunch}>
            View Launch Menu
          </button>
        </div>
      </Section>

      <Section title="Storage" description="Browser storage is finite and can be cleared by the browser.">
        <div className="card stack">
          {warning ? <p style={{ color: 'var(--warn)' }}>{warning}</p> : null}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Used</span>
            <span>
              {snapshot?.usage !== null && snapshot?.usage !== undefined ? formatBytes(snapshot.usage) : 'Unknown'}
              {snapshot?.quota ? ` of ~${formatBytes(snapshot.quota)}` : ''}
            </span>
          </div>
          {snapshot?.ratio !== null && snapshot?.ratio !== undefined ? (
            <div className="progress">
              <span style={{ width: `${Math.min(100, Math.max(2, snapshot.ratio * 100))}%` }} />
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Persistent storage</span>
            <span>
              {snapshot?.persisted === null || snapshot?.persisted === undefined
                ? 'Unknown'
                : snapshot.persisted
                  ? 'Granted'
                  : 'Not granted'}
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Library</span>
            <span>
              {mods.length} mods · {projects.length} projects
            </span>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const granted = await requestPersistence();
                setSnapshot(await readStorage());
                push(
                  granted
                    ? 'Persistent storage granted. Your library is less likely to be evicted.'
                    : 'The browser did not grant persistent storage. Export backups of anything important.',
                  granted ? 'success' : 'error',
                );
              }}
            >
              Request persistent storage
            </button>
            <span className="faint">
              Browsers decide whether to grant this. FNF OS never promises a fixed amount of space.
            </span>
          </div>
        </div>
      </Section>

      <Section title="Engines" description="Literal status from the engine registry.">
        <div className="stack" style={{ gap: 10 }}>
          {ENGINE_LIST.map((engine) => (
            <div className="card" key={engine.id}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <h3>{engine.name}</h3>
                  <p className="faint" style={{ marginTop: 3 }}>
                    Import: {engine.import === 'supported' ? 'supported' : 'unavailable'} · Playback:{' '}
                    {STATUS_LABEL[engine.playback]}
                  </p>
                </div>
                <a href={engine.upstream} target="_blank" rel="noreferrer noopener" className="btn btn-sm">
                  Upstream
                  <Icon name="external" size={13} />
                </a>
              </div>
              <p className="muted" style={{ marginBottom: 8 }}>
                {engine.playbackNote}
              </p>
              <ul className="list">
                {engine.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
                <li>
                  Licence: {engine.license} — {engine.licenseNote}
                </li>
              </ul>
            </div>
          ))}
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3>Runtime packages</h3>
                <p className="muted" style={{ marginTop: 4 }}>
                  {RUNTIME_CATALOG.length === 0
                    ? 'None published. Runtimes are downloaded on demand, checksum-verified and cached separately from your mods.'
                    : `${RUNTIME_CATALOG.length} available.`}
                </p>
              </div>
              <span className="badge badge-warn">
                {Object.keys(installedRuntimes()).length} cached on this device
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Engine feature support"
        description="Derived from the manifests of installed engine runtimes. A feature only leaves “unknown” when a runtime declares it, never because the desktop engine has it."
      >
        <div className="stack" style={{ gap: 10 }}>
          {support.map((entry) => (
            <div className="card" key={entry.engine}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{engineName(entry.engine)}</strong>
                <span className="badge">
                  {entry.manifest ? `runtime ${entry.manifest.version}` : 'no runtime'}
                </span>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {entry.rows.map((row) => (
                  <span
                    key={row.feature}
                    className="badge"
                    title={`${row.label}: ${row.support}`}
                    data-support={row.support}
                  >
                    {row.label}
                    <span className="faint"> · {row.support}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="faint">
            No engine runtime has been published, so every cell above is unknown. This table fills in from real
            runtime manifests; it is never edited by hand to look complete.
          </p>
        </div>
      </Section>

      <Section
        title="Browser runtimes under research"
        description="Projects that exist today and what each still needs. Nothing listed here is installed, launchable or counted as support."
      >
        <div className="stack" style={{ gap: 10 }}>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>{COMPAT_RUNTIME.name}</strong>
              <span className="badge badge-warn">{COMPAT_RUNTIME.statusLabel}</span>
            </div>
            <p className="muted" style={{ marginBottom: 8 }}>
              Built into the app. Reads a Psych-format chart and the mod's own instrumental in the browser — no
              engine build is downloaded or executed. It is not a Psych Engine port, and it is not yet verified
              against community mods.
            </p>
            <p className="faint" style={{ marginBottom: 8 }}>
              v{COMPAT_RUNTIME.version} · {COMPAT_RUNTIME.formats.join(' · ')}
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {Object.entries(COMPAT_RUNTIME_FEATURES).map(([id, support]) => (
                <span key={id} className="badge" data-support={support}>
                  {FEATURE_LABEL[id as keyof typeof FEATURE_LABEL] ?? id} · {support}
                </span>
              ))}
            </div>
            <ul className="list">
              {COMPAT_RUNTIME_LIMITATIONS.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link to="/lab/player" className="btn btn-sm" style={{ alignSelf: 'flex-start', marginTop: 10 }}>
              Play the built-in test song
            </Link>
          </div>

          {RUNTIME_CANDIDATES.map((candidate) => (
            <div className="card" key={candidate.id}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{candidate.name}</strong>
                <span className="badge">{CANDIDATE_STATUS_LABEL[candidate.status]}</span>
              </div>
              <p className="muted" style={{ marginBottom: 8 }}>
                {candidate.summary}
              </p>
              <p className="faint" style={{ marginBottom: 8 }}>
                {candidate.kind} · {candidate.license} · distribution: {candidate.distribution} · build:{' '}
                {candidate.buildStatus}
              </p>
              <ul className="list">
                {candidate.missing.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
              <a
                href={candidate.upstream}
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn-sm"
                style={{ alignSelf: 'flex-start', marginTop: 10 }}
              >
                Source
                <Icon name="external" size={13} />
              </a>
            </div>
          ))}
          <p className="faint">
            The catalogue stays empty: an entry needs a redistributable build, a reviewed checksum, a mod format that
            has loaded in a real test, and a passed run against a real mod.
          </p>
        </div>
      </Section>

      <LabSection />

      <Section title="About">
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Version</span>
            <span className="mono">{VERSION}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Source</span>
            <a
              href="https://github.com/VenulousThyDuckulous/FNF-OS"
              target="_blank"
              rel="noreferrer noopener"
            >
              GitHub repository
            </a>
          </div>
          <p className="disclaimer">
            FNF OS is an unofficial community project and is not affiliated with or endorsed by the Friday
            Night Funkin' developers. No engine, game asset, music or character is bundled with this app.
          </p>
        </div>
      </Section>
    </div>
  );
}
