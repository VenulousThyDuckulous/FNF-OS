import { useMemo } from 'react';
import { ModCard } from '../components/ModCard';
import { EmptyState, Icon } from '../components/ui';
import { formatRelative } from '../lib/format';
import { storageWarning } from '../lib/storage';
import { Link } from '../router';
import { useLibrary } from '../state/library';

export function HomePage(): JSX.Element {
  const { mods, projects, storage, loading } = useLibrary();

  const recentlyPlayed = useMemo(
    () =>
      [...mods]
        .filter((mod) => mod.lastPlayedAt)
        .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
        .slice(0, 4),
    [mods],
  );

  const recentlyAdded = useMemo(
    () => [...mods].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 4),
    [mods],
  );

  const warning = storage ? storageWarning(storage) : null;

  return (
    <div className="stack" style={{ gap: 30 }}>
      <header className="page-head">
        <div>
          <h1>Welcome to FNF OS</h1>
          <p>
            Your mods, your projects, on your device. Import a mod to get started - everything is analysed
            locally and never uploaded.
          </p>
        </div>
        <Link to="/import" className="btn btn-primary">
          <Icon name="import" size={16} />
          Quick import
        </Link>
      </header>

      {warning ? (
        <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--warn) 45%, transparent)' }}>
          <div className="row">
            <Icon name="info" size={16} />
            <p style={{ color: 'var(--text)' }}>{warning}</p>
          </div>
        </div>
      ) : null}

      <section className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Recently played</h2>
          <Link to="/library?filter=recent" className="btn btn-ghost btn-sm">
            View all
          </Link>
        </div>
        {recentlyPlayed.length > 0 ? (
          <div className="mod-grid">
            {recentlyPlayed.map((mod) => (
              <ModCard key={mod.id} mod={mod} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing played yet"
            body="Once a browser runtime is installed and you launch a mod, it will show up here."
            action={
              <Link to="/import" className="btn">
                Import your first mod
              </Link>
            }
          />
        )}
      </section>

      <section className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Your uploads</h2>
          <Link to="/library" className="btn btn-ghost btn-sm">
            Open library
          </Link>
        </div>
        {loading ? (
          <p className="muted">Loading your library...</p>
        ) : recentlyAdded.length > 0 ? (
          <div className="mod-grid">
            {recentlyAdded.map((mod) => (
              <ModCard key={mod.id} mod={mod} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Your library is empty"
            body="FNF OS accepts mod ZIPs, extracted mod folders and complete game ZIPs. Nothing is uploaded anywhere."
            action={
              <Link to="/import" className="btn btn-primary">
                Import a mod
              </Link>
            }
          />
        )}
      </section>

      <section className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Continue developing</h2>
          <Link to="/studio" className="btn btn-ghost btn-sm">
            Mod Studio
          </Link>
        </div>
        {projects.length > 0 ? (
          <div className="panel-grid">
            {projects.slice(0, 3).map((project) => (
              <Link key={project.id} to="/studio" className="card" style={{ color: 'inherit' }}>
                <h3>{project.name}</h3>
                <p className="faint" style={{ marginTop: 6 }}>
                  Updated {formatRelative(project.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No development projects yet"
            body="Import a mod template or open one of your mods as a working copy to start a project."
            action={
              <Link to="/studio" className="btn">
                Open Mod Studio
              </Link>
            }
          />
        )}
      </section>

      <section className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 260px' }}>
          <h3>Supported import formats</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            ZIP mod packages - extracted mod folders - complete game ZIPs. Native executables inside an
            archive are never run.
          </p>
        </div>
        <Link to="/import" className="btn">
          Import something
        </Link>
      </section>
    </div>
  );
}
