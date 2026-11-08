import { ENGINE_LIST, getEngine } from '../lib/engines/registry';
import {
  ENGINE_AUDITS,
  STATUS_LABEL,
  STATUS_TONE,
  canClaimPlayable,
  engineStatusSummary,
} from '../lib/engines/runtimeStatus';
import { Link } from '../router';

const TONE_CLASS = {
  ok: 'badge badge-ok',
  warn: 'badge badge-warn',
  danger: 'badge badge-danger',
  muted: 'badge',
} as const;

/**
 * Engine status.
 *
 * Every row here is read from `src/lib/engines/runtimeStatus.ts`, which only
 * records evidence that was actually checked. Nothing on this page is a
 * promise: an engine appears as playable only when its own code has run in this
 * app against a real mod, and no engine has yet.
 */
export function EnginesPage(): JSX.Element {
  return (
    <div className="stack">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Engines</h1>
        <p>
          Funkhub-class hosting means running an engine&rsquo;s own code in the page, not reimplementing it. This
          page records what has been verified for each engine, with the sources that were read.
        </p>
      </header>

      <div className="card stack">
        <strong>{engineStatusSummary()}</strong>
        <p className="faint">
          Import and analysis work for all four engines. Playback status below is literal: an engine is only
          marked playable when its own compiled code runs here, loads a real mod and plays a song. A chart
          parser, a compatible menu or an imitation gameplay loop never counts.
        </p>
        <div className="row">
          <Link to="/library" className="btn btn-sm">
            Your library
          </Link>
          <Link to="/import" className="btn btn-ghost btn-sm">
            Import a mod
          </Link>
        </div>
      </div>

      {ENGINE_AUDITS.map((audit) => {
        const definition = getEngine(audit.engine);
        const playable = canClaimPlayable(audit.engine);
        const build =
          audit.browserBuild.state === 'none'
            ? 'No browser build'
            : `${audit.browserBuild.state === 'upstream' ? 'Upstream' : 'Community'} browser build`;

        return (
          <section className="card stack" key={audit.engine} aria-label={`${definition?.name ?? audit.engine} status`}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{definition?.name ?? audit.engine}</h3>
              <span className={TONE_CLASS[STATUS_TONE[audit.status]]}>{STATUS_LABEL[audit.status]}</span>
            </div>

            <ul className="list">
              <li>
                <strong>Licence</strong> — {audit.licence}
              </li>
              <li>
                <strong>Browser build</strong> — {build}
                {audit.browserBuild.state === 'none'
                  ? ''
                  : ` · ${audit.browserBuild.modLoading ? 'reads user mods' : 'cannot read user mods'} · ${
                      audit.browserBuild.selfHostable ? 'can be self-hosted' : 'not self-hostable'
                    }`}
              </li>
              <li>
                <strong>Engine running inside this app</strong> — {audit.embeddedRuntime ? 'yes' : 'no'}
              </li>
              <li>
                <strong>Real mod tested through it</strong> — {audit.realModTested ? 'yes' : 'no'}
              </li>
              <li>
                <strong>Scripting in the browser</strong> —{' '}
                {audit.scripting === 'runs-in-browser'
                  ? 'runs'
                  : audit.scripting === 'unavailable'
                    ? 'not available on the web target'
                    : 'not established'}
              </li>
              <li>
                <strong>Playable claim</strong> — {playable ? 'verified' : 'withheld (conditions not met)'}
              </li>
            </ul>

            {audit.browserBuild.evidence ? <p className="faint">{audit.browserBuild.evidence}</p> : null}

            {audit.licenceGate ? (
              <p>
                <strong>Licence gate.</strong> {audit.licenceGate}
              </p>
            ) : null}

            <div className="stack" style={{ gap: 4 }}>
              <strong>Why it is not embedded</strong>
              <ul className="list">
                {audit.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>

            <p className="faint">
              <strong>Next step:</strong> {audit.nextStep}
            </p>

            <p className="faint">
              Checked {audit.checkedAt}. Sources:{' '}
              {audit.sources.map((source, index) => (
                <span key={source}>
                  {index > 0 ? ' · ' : ''}
                  <a href={source} target="_blank" rel="noreferrer noopener">
                    {source.replace('https://github.com/', '')}
                  </a>
                </span>
              ))}
            </p>
          </section>
        );
      })}

      <div className="card stack">
        <h3 style={{ margin: 0 }}>What is running today</h3>
        <p>
          Mods are imported, identified and analysed locally, and{' '}
          <Link to="/lab/player">FNF OS’s own compatibility runtime</Link> can play a Psych-format chart with its
          audio. That runtime is this project’s own implementation, reported as <code>experimental</code>; it is
          not Psych Engine, V-Slice, Kade or Codename, and it is never presented as one.
        </p>
        <p className="faint">
          Engine runtimes are packaged, checksum-verified downloads that run in a sandboxed frame
          (<code>RuntimeHost</code>). The catalogue is empty because no engine build has passed the checks this
          page lists — not because the plumbing is missing.
        </p>
      </div>

      <p className="faint">Detected engines: {ENGINE_LIST.map((engine) => engine.shortName).join(', ')}.</p>
    </div>
  );
}
