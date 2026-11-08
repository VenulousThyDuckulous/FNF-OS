import { useEffect, useState } from 'react';
import { Link, parsePath, useHashPath, useNavigate } from '../router';
import { useLibrary } from '../state/library';
import { useSettings } from '../state/settings';
import { Icon, type IconName } from './ui';

interface NavEntry {
  to: string;
  label: string;
  icon: IconName;
  /** Only shown once the user actually has a development project. */
  needsProject?: boolean;
  /** Extra paths that should keep this item highlighted. */
  match?: string[];
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/library', label: 'Library', icon: 'library', match: ['/mod'] },
  { to: '/import', label: 'Import', icon: 'import' },
  { to: '/engines', label: 'Engines', icon: 'info' },
  { to: '/studio', label: 'Mod Studio', icon: 'studio', needsProject: true },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

function isActive(entry: NavEntry, pathname: string): boolean {
  if (entry.to === '/') return pathname === '/';
  if (pathname === entry.to || pathname.startsWith(`${entry.to}/`)) return true;
  return (entry.match ?? []).some((prefix) => pathname.startsWith(prefix));
}

export function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  const path = useHashPath();
  const { pathname } = parsePath(path);
  const { settings, setSidebarCollapsed } = useSettings();
  const { projects } = useLibrary();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const hasProjects = projects.length > 0;
  const collapsed = settings.sidebarCollapsed;
  const entries = NAV.filter((entry) => !entry.needsProject || hasProjects);

  useEffect(() => {
    const query = parsePath(path).query.get('q');
    setTerm(query ?? '');
  }, [path]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = term.trim();
    navigate(query ? `/library?q=${encodeURIComponent(query)}` : '/library');
    setSearchOpen(false);
  };

  return (
    <div className="shell" data-collapsed={collapsed}>
      <aside className="sidebar" aria-label="Primary">
        <Link to="/" className="brand" aria-label="FNF OS home">
          <span className="brand-mark">FNF</span>
          {collapsed ? null : (
            <span className="brand-text">
              <strong>FNF OS</strong>
              <span>Your FNF universe</span>
            </span>
          )}
        </Link>

        {entries.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            className="nav-item"
            data-active={isActive(entry, pathname)}
            title={entry.label}
            aria-current={isActive(entry, pathname) ? 'page' : undefined}
          >
            <span className="icon">
              <Icon name={entry.icon} />
            </span>
            {collapsed ? <span className="sr-only">{entry.label}</span> : entry.label}
          </Link>
        ))}

        <div className="sidebar-footer">
          <button
            type="button"
            className="collapse-btn"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
            {collapsed ? null : 'Collapse'}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          {searchOpen ? (
            <form className="search" onSubmit={submitSearch} style={{ maxWidth: '100%' }}>
              <Icon name="search" size={16} />
              <input
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search your library"
                aria-label="Search your library"
                onBlur={() => setSearchOpen(false)}
              />
              <button type="button" className="btn-ghost btn btn-sm" onClick={() => setSearchOpen(false)}>
                <Icon name="close" size={14} />
              </button>
            </form>
          ) : (
            <button type="button" className="search" onClick={() => setSearchOpen(true)}>
              <Icon name="search" size={16} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.88rem' }}>Search your library</span>
              <span className="faint">/</span>
            </button>
          )}

          <div className="topbar-actions">
            <Link to="/import" className="btn btn-primary btn-sm">
              <Icon name="plus" size={15} />
              Import
            </Link>
          </div>
        </header>

        <main className="content">{children}</main>

        <nav className="bottom-nav" aria-label="Primary">
          {entries.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="nav-item"
              data-active={isActive(entry, pathname)}
              aria-current={isActive(entry, pathname) ? 'page' : undefined}
            >
              <Icon name={entry.icon} />
              {entry.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
