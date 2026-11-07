import type { EngineId } from '../lib/engines/types';
import { engineName } from '../lib/format';

export type IconName =
  | 'home'
  | 'library'
  | 'import'
  | 'studio'
  | 'settings'
  | 'search'
  | 'chevron-left'
  | 'chevron-right'
  | 'play'
  | 'star'
  | 'download'
  | 'trash'
  | 'close'
  | 'plus'
  | 'info'
  | 'external';

const PATHS: Record<IconName, JSX.Element> = {
  home: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  library: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  import: (
    <>
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </>
  ),
  studio: (
    <>
      <path d="M4 20l4-1 10-10-3-3L5 16z" />
      <path d="m14 6 3 3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  'chevron-left': <path d="m14 6-6 6 6 6" />,
  'chevron-right': <path d="m10 6 6 6-6 6" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  star: <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.8l5.9-.9z" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.6v.6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export function EngineBadge({ engine }: { engine: EngineId | null }): JSX.Element {
  if (!engine) return <span className="badge">Engine unknown</span>;
  return <span className="badge">{engineName(engine)}</span>;
}

/**
 * Compatibility is "not verified" until a runtime test run happened. This
 * component has no percentage and never guesses a level.
 */
export function CompatBadge({ level }: { level: 1 | 2 | 3 | 4 | null }): JSX.Element {
  if (level === null) return <span className="badge">Compatibility not verified</span>;
  const map: Record<1 | 2 | 3 | 4, { label: string; className: string }> = {
    1: { label: 'Level 1 - Incompatible', className: 'badge badge-danger' },
    2: { label: 'Level 2 - Partial', className: 'badge badge-warn' },
    3: { label: 'Level 3 - Near-full', className: 'badge badge-ok' },
    4: { label: 'Level 4 - Full', className: 'badge badge-ok' },
  };
  const entry = map[level];
  return <span className={entry.className}>{entry.label}</span>;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p style={{ maxWidth: '52ch' }}>{body}</p>
      {action}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
