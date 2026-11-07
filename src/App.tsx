import { useEffect } from 'react';
import { Shell } from './components/Shell';
import { Icon } from './components/ui';
import { isAndroid, isIOS, promptInstall, requiresInstall } from './lib/platform';
import { HomePage } from './pages/Home';
import { ImportPage } from './pages/ImportPage';
import { LaunchMenu } from './pages/LaunchMenu';
import { LibraryPage } from './pages/Library';
import { ModDetailPage } from './pages/ModDetail';
import { ModStudioPage } from './pages/ModStudio';
import { PlayPage } from './pages/Play';
import { PlayerLabPage } from './pages/PlayerLab';
import { SettingsPage } from './pages/Settings';
import { Link, matchRoute, parsePath, useHashPath } from './router';
import { LibraryProvider } from './state/library';
import { SettingsProvider, useSettings } from './state/settings';
import { ToastProvider } from './state/toast';

export default function App(): JSX.Element {
  return (
    <SettingsProvider>
      <ToastProvider>
        <LibraryProvider>
          <Routes />
        </LibraryProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}

function Routes(): JSX.Element {
  const path = useHashPath();
  const { pathname } = parsePath(path);
  const { settings } = useSettings();

  // First visit always lands on the Launch Menu.
  useEffect(() => {
    if (!settings.launchComplete && pathname !== '/launch') {
      window.location.hash = '#/launch';
    }
  }, [settings.launchComplete, pathname]);

  if (pathname === '/launch') return <LaunchMenu />;
  if (!settings.launchComplete) return <LaunchMenu />;

  const playMatch = matchRoute('/play/:id', pathname);
  if (playMatch) return <PlayPage modId={playMatch.id} />;

  const modMatch = matchRoute('/mod/:id', pathname);

  // Phones must install before reaching the library or playback.
  const gated =
    requiresInstall() &&
    (pathname === '/library' || pathname === '/import' || pathname === '/studio' || Boolean(modMatch));

  if (gated) {
    return (
      <Shell>
        <InstallGate />
      </Shell>
    );
  }

  let page: JSX.Element;
  if (pathname === '/' ) page = <HomePage />;
  else if (pathname === '/library') page = <LibraryPage />;
  else if (pathname === '/import') page = <ImportPage />;
  else if (pathname === '/studio') page = <ModStudioPage />;
  else if (pathname === '/settings') page = <SettingsPage />;
  else if (pathname === '/lab/player') page = <PlayerLabPage />;
  else if (modMatch) page = <ModDetailPage modId={modMatch.id} />;
  else page = <NotFound />;

  return <Shell>{page}</Shell>;
}

function InstallGate(): JSX.Element {
  const ios = isIOS();
  const android = isAndroid();

  return (
    <div className="stack" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1>Install FNF OS first</h1>
      <p>
        On phones, FNF OS runs from your home screen. Installing keeps your library available and lets the
        app use storage the browser will not evict as readily.
      </p>

      <div className="card stack">
        <h3>{ios ? 'On iPhone or iPad' : android ? 'On Android' : 'On your device'}</h3>
        {ios ? (
          <ul className="list">
            <li>Open this page in Safari.</li>
            <li>
              Tap the share button, then <strong>Add to Home Screen</strong>.
            </li>
            <li>Open FNF OS from the new icon — the library unlocks there.</li>
          </ul>
        ) : (
          <ul className="list">
            <li>Open the browser menu.</li>
            <li>
              Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </li>
            <li>Open FNF OS from the new icon — the library unlocks there.</li>
          </ul>
        )}
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const outcome = await promptInstall();
              if (outcome === 'unavailable') {
                // We cannot detect installability; say so rather than pretend.
                alert('Your browser did not offer an install prompt. Use the browser menu to add FNF OS to your home screen.');
              }
            }}
          >
            Try the install prompt
          </button>
          <Link to="/" className="btn btn-ghost">
            Back to home
          </Link>
        </div>
        <p className="faint">
          Browsers do not reliably report whether installation is possible, so FNF OS only reacts to a real
          install prompt and otherwise shows these instructions.
        </p>
      </div>
    </div>
  );
}

function NotFound(): JSX.Element {
  return (
    <div className="empty">
      <Icon name="info" size={22} />
      <strong>Page not found</strong>
      <p>That route does not exist in FNF OS.</p>
      <Link to="/" className="btn">
        Go home
      </Link>
    </div>
  );
}
