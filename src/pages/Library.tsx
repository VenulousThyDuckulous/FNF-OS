import { useEffect, useMemo, useState } from 'react';
import { ModCard } from '../components/ModCard';
import { EmptyState, Icon } from '../components/ui';
import { engineName } from '../lib/format';
import { parsePath, useHashPath } from '../router';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

type SortKey = 'added' | 'played' | 'alpha' | 'engine';

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'added', label: 'Recently added' },
  { value: 'played', label: 'Recently played' },
  { value: 'alpha', label: 'Alphabetical' },
  { value: 'engine', label: 'Engine' },
];

export function LibraryPage(): JSX.Element {
  const path = useHashPath();
  const { mods, collections, createCollection } = useLibrary();
  const { push } = useToast();

  const initialFilter = parsePath(path).query.get('filter') ?? 'all';
  const queryTerm = parsePath(path).query.get('q') ?? '';

  const [filter, setFilter] = useState(initialFilter);
  const [sort, setSort] = useState<SortKey>('added');
  const [term, setTerm] = useState(queryTerm);
  const [newCollection, setNewCollection] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setTerm(queryTerm);
  }, [queryTerm]);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();

    let list = [...mods];
    if (filter === 'recent') list = list.filter((mod) => mod.lastPlayedAt);
    else if (filter === 'favourites') list = list.filter((mod) => mod.favourite);
    else if (filter.startsWith('col:')) {
      const id = filter.slice(4);
      list = list.filter((mod) => mod.collectionIds.includes(id));
    }

    if (needle) {
      list = list.filter((mod) => {
        const haystack = [mod.name, mod.engineVersion ?? '', engineName(mod.engine), ...mod.tags]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    switch (sort) {
      case 'played':
        list.sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''));
        break;
      case 'alpha':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'engine':
        list.sort((a, b) => (a.engine ?? 'zzz').localeCompare(b.engine ?? 'zzz'));
        break;
      default:
        list.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    }

    return list;
  }, [mods, filter, term, sort]);

  const handleCreateCollection = async () => {
    const name = newCollection.trim();
    if (!name) return;
    await createCollection(name);
    setNewCollection('');
    setCreating(false);
    push(`Collection "${name}" created.`, 'success');
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Library</h1>
          <p>
            {mods.length === 0
              ? 'Nothing imported yet.'
              : `${mods.length} ${mods.length === 1 ? 'mod' : 'mods'} stored locally in this browser.`}
          </p>
        </div>
        <div className="row">
          <label className="sr-only" htmlFor="library-sort">
            Sort
          </label>
          <select
            id="library-sort"
            className="input"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ flex: '1 1 240px', maxWidth: 360 }}
          placeholder="Search by name, engine or tag"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Search library"
        />
        <div className="row" style={{ gap: 6 }}>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All mods" />
          <FilterChip active={filter === 'recent'} onClick={() => setFilter('recent')} label="Recently played" />
          <FilterChip
            active={filter === 'favourites'}
            onClick={() => setFilter('favourites')}
            label="Favourites"
          />
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {collections.map((collection) => (
          <FilterChip
            key={collection.id}
            active={filter === `col:${collection.id}`}
            onClick={() => setFilter(`col:${collection.id}`)}
            label={collection.name}
          />
        ))}
        {creating ? (
          <span className="row" style={{ gap: 6 }}>
            <input
              autoFocus
              className="input"
              style={{ width: 160 }}
              placeholder="Collection name"
              value={newCollection}
              onChange={(event) => setNewCollection(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreateCollection();
                if (event.key === 'Escape') setCreating(false);
              }}
              aria-label="New collection name"
            />
            <button type="button" className="btn btn-sm" onClick={() => void handleCreateCollection()}>
              Add
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            New collection
          </button>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="mod-grid">
          {filtered.map((mod) => (
            <ModCard key={mod.id} mod={mod} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={mods.length === 0 ? 'Your library is empty' : 'No mods match this view'}
          body={
            mods.length === 0
              ? 'Import a ZIP, a folder or a complete game build to fill your library.'
              : 'Try a different search term, sort order or collection.'
          }
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={active ? 'badge badge-accent' : 'badge'}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
