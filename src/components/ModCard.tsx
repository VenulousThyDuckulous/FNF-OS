import { useEffect, useState } from 'react';
import { getCover, type ModRecord } from '../lib/db';
import { formatRelative } from '../lib/format';
import { Link } from '../router';
import { EngineBadge, Icon } from './ui';

/** Object URLs are cached for the session; covers are small and reused often. */
const coverUrls = new Map<string, string>();

function Cover({ mod }: { mod: ModRecord }): JSX.Element {
  const [url, setUrl] = useState<string | null>(() => coverUrls.get(mod.id) ?? null);

  useEffect(() => {
    if (url || !mod.coverPath) return;
    let active = true;
    getCover(mod.id)
      .then((blob) => {
        if (!active || !blob) return;
        const objectUrl = URL.createObjectURL(blob);
        coverUrls.set(mod.id, objectUrl);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [mod.id, mod.coverPath, url]);

  if (url) return <img src={url} alt="" loading="lazy" />;

  const initials = mod.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return <span aria-hidden="true">{initials || 'FNF'}</span>;
}

export function ModCard({ mod }: { mod: ModRecord }): JSX.Element {
  return (
    <Link to={`/mod/${mod.id}`} className="mod-card">
      <div className="mod-cover">
        <Cover mod={mod} />
      </div>
      <div className="mod-body">
        <span className="mod-title" title={mod.name}>
          {mod.name}
        </span>
        <div className="mod-meta">
          <EngineBadge engine={mod.engine} />
          {mod.engineVersion ? <span className="badge">{mod.engineVersion}</span> : null}
          {mod.favourite ? (
            <span className="fav-dot" title="Favourite">
              <Icon name="star" size={14} />
            </span>
          ) : null}
        </div>
        <span className="faint">
          {mod.lastPlayedAt ? `Played ${formatRelative(mod.lastPlayedAt)}` : `Added ${formatRelative(mod.importedAt)}`}
        </span>
      </div>
    </Link>
  );
}
