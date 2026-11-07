import { ENGINES, ENGINE_LIST } from '../lib/engines/registry';
import { STATUS_LABEL } from '../lib/engines/types';
import { Icon } from '../components/ui';
import { useNavigate } from '../router';
import { useSettings } from '../state/settings';

/**
 * First-visit Launch Menu.
 *
 * It describes what the platform does *today*, including what it cannot do.
 * Engine status is read from the registry rather than written here, so it stays
 * true when support changes.
 */
export function LaunchMenu(): JSX.Element {
  const { completeLaunch } = useSettings();
  const navigate = useNavigate();

  const enter = () => {
    completeLaunch();
    navigate('/');
  };

  return (
    <div className="launch">
      <div className="launch-inner">
        <header className="launch-hero">
          <span className="tagline">Your FNF universe. One place.</span>
          <h1>FNF OS</h1>
          <p style={{ maxWidth: '62ch' }}>
            A browser-based platform for playing, managing and creating Friday Night Funkin' mods. Import
            your mods, keep them organised, inspect what they need, and develop against the engines they
            were built for - all on your own device.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={enter}>
              <Icon name="play" size={16} />
              Launch FNF OS
            </button>
            <span className="faint">No account. No uploads. Nothing leaves this browser.</span>
          </div>
        </header>

        <div className="launch-grid">
          <section className="launch-panel">
            <h3>What it does</h3>
            <ul className="list">
              <li>Imports mod ZIPs, extracted folders and complete game builds.</li>
              <li>Detects the engine and version, with evidence and a confidence level.</li>
              <li>Shows which engine features a mod depends on before you try to run it.</li>
              <li>Keeps a personal library with collections, tags and favourites.</li>
              <li>Opens development projects from imported mod templates.</li>
            </ul>
          </section>

          <section className="launch-panel">
            <h3>Why use it</h3>
            <ul className="list">
              <li>No traditional desktop install; it is a web app.</li>
              <li>Mods are stored locally, not on someone else's server.</li>
              <li>Engine adapters are separate, so one engine cannot break another.</li>
              <li>Works offline once the app and a runtime are cached.</li>
              <li>Desktop and mobile, with the same library.</li>
            </ul>
          </section>

          <section className="launch-panel">
            <h3>Limitations - read this</h3>
            <ul className="list">
              <li>
                <strong>No engine runtime has been published yet.</strong> FNF OS can identify and analyse
                mods, but it cannot play them in this version.
              </li>
              <li>Not every mod will be compatible, even once runtimes exist.</li>
              <li>Some engine features cannot be reproduced in a browser at all.</li>
              <li>Browser storage limits vary and are not guaranteed.</li>
              <li>Large mods take time to import and verify.</li>
              <li>Mobile performance varies by device.</li>
            </ul>
          </section>

          <section className="launch-panel">
            <h3>Requirements</h3>
            <ul className="list">
              <li>A modern browser with IndexedDB and WebAssembly support.</li>
              <li>Available browser storage for your mods.</li>
              <li>Internet access for the first visit and for runtime downloads.</li>
              <li>On phones, install FNF OS to your home screen before using the library.</li>
            </ul>
          </section>
        </div>

        <section className="launch-panel">
          <h3>Engine support - actual status</h3>
          <div>
            {ENGINE_LIST.map((engine) => (
              <div className="engine-row" key={engine.id}>
                <div>
                  <strong style={{ fontSize: '0.88rem' }}>{engine.name}</strong>
                  <p className="faint" style={{ marginTop: 3, maxWidth: '68ch' }}>
                    {engine.playbackNote}
                  </p>
                </div>
                <span className={engine.playback === 'unavailable' ? 'badge badge-warn' : 'badge'}>
                  {STATUS_LABEL[engine.playback]}
                </span>
              </div>
            ))}
          </div>
          <p className="faint">
            Import and detection support{' '}
            {Object.values(ENGINES).every((engine) => engine.import === 'supported')
              ? 'all four engines'
              : 'some engines'}{' '}
            today. Playback status above is literal: nothing is advertised as supported until it has been
            tested against real mods.
          </p>
        </section>

        <div className="launch-grid">
          <section className="launch-panel">
            <h3>Privacy and security</h3>
            <ul className="list">
              <li>No account and no cloud storage.</li>
              <li>Imported mods stay on your device and are never uploaded.</li>
              <li>No telemetry, no crash-report uploads.</li>
              <li>Engine runtimes download only when you choose to install one.</li>
              <li>
                Imported scripts run under browser sandboxing, which limits but does not eliminate risk from
                untrusted content.
              </li>
            </ul>
          </section>

          <section className="launch-panel">
            <h3>Before you start</h3>
            <p className="muted">
              FNF OS does not include any Friday Night Funkin' engine, base-game assets, music or characters.
              You supply your own mods. Everything you import is your responsibility to own the rights to.
            </p>
            <p className="disclaimer">
              FNF OS is an unofficial community project and is not affiliated with or endorsed by the Friday
              Night Funkin' developers.
            </p>
          </section>
        </div>

        <div className="row" style={{ justifyContent: 'center', paddingBottom: 24 }}>
          <button type="button" className="btn btn-primary" onClick={enter}>
            Launch FNF OS
          </button>
        </div>
      </div>
    </div>
  );
}
