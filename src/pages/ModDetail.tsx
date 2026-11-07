import { useEffect, useMemo, useState } from 'react';
import { CompatBadge, EngineBadge, Icon, Section } from '../components/ui';
import { analyzeMod } from '../lib/compat/analyze';
import { getCover } from '../lib/db';
import { listCollections, type Collection } from '../lib/db';
import { ENGINES, getEngine } from '../lib/engines/registry';
import { ENGINE_IDS, LEVEL_LABEL, type EngineId } from '../lib/engines/types';
import { formatDate, formatRelative, pluralise } from '../lib/format';
import { formatBytes } from '../lib/import/safety';
import { writeZip } from '../lib/import/zip';
import { RUNTIME_CATALOG, runtimesForEngine } from '../lib/runtime/manager';
import { Link, useNavigate } from '../router';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

export function ModDetailPage({ modId }: { modId: string }): JSX.Element {
  const { mods, loading, readFiles, patchMod, removeMod, createProjectFromMod, toggleCollection } =
    useLibrary();
  const { push } = useToast();
  const navigate = useNavigate();

  const mod = mods.find((entry) => entry.id === modId);

  const [cover, setCover] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCollections()
      .then(setCollections)
      .catch(() => undefined);
  }, [mods]);

  useEffect(() => {
    let active = true;
    if (!mod?.coverPath) {
      setCover(null);
      return;
    }
    getCover(mod.id)
      .then((blob) => {
        if (!active || !blob) return;
        setCover(URL.createObjectURL(blob));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [mod?.id, mod?.coverPath]);

  const availableRuntimes = useMemo(() => (mod ? runtimesForEngine(mod.engine ?? 'psych') : []), [mod]);

  if (loading) return <p className="muted">Loading...</p>;

  if (!mod) {
    return (
      <div className="empty">
        <strong>Mod not found</strong>
        <p>It may have been deleted from this browser.</p>
        <Link to="/library" className="btn">
          Back to library
        </Link>
      </div>
    );
  }

  const level = mod.compat.level;
  const engine = getEngine(mod.engine);

  const startRename = () => {
    setNameDraft(mod.name);
    setRenaming(true);
  };

  const applyRename = async () => {
    const next = nameDraft.trim();
    if (!next) return;
    await patchMod(mod.id, { name: next });
    setRenaming(false);
    push('Display name updated. Files inside the mod were not changed.', 'success');
  };

  const exportZip = async () => {
    setBusy(true);
    try {
      const files = await readFiles(mod.id);
      if (!files) throw new Error('No stored files were found for this mod.');
      const zip = writeZip(files);
      const blob = new Blob([zip as unknown as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${mod.name.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'mod'}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      push('Export started.', 'success');
    } catch (cause) {
      push(cause instanceof Error ? cause.message : 'Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoval = async () => {
    await removeMod(mod.id);
    push(`Deleted "${mod.name}" from this browser.`, 'success');
    navigate('/library');
  };

  const changeEngine = async (engineId: EngineId | null) => {
    const compat = analyzeMod({
      engine: engineId,
      engineVersion: mod.engineVersion,
      paths: [],
    });
    await patchMod(mod.id, {
      engine: engineId,
      engineOverridden: true,
      compat: { ...compat, findings: mod.compat.findings },
    });
    push('Engine override saved and compatibility re-checked.', 'success');
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      <Link to="/library" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <Icon name="chevron-left" size={15} />
        Library
      </Link>

      <div className="detail-hero">
        <div className="detail-cover">
          {cover ? <img src={cover} alt="" /> : (mod.name[0] ?? 'F').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <EngineBadge engine={mod.engine} />
            {mod.engineVersion ? <span className="badge">v{mod.engineVersion}</span> : null}
            <CompatBadge level={level} />
            {mod.favourite ? (
              <span className="badge badge-warn">
                <Icon name="star" size={12} /> Favourite
              </span>
            ) : null}
          </div>
          <h1 style={{ marginBottom: 8 }}>{mod.name}</h1>
          <p className="faint">
            {pluralise(mod.fileCount, 'file')} · {formatBytes(mod.bytes)} · imported{' '}
            {formatRelative(mod.importedAt)}
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={mod.compat.blockers.length > 0}
              onClick={() => navigate(`/play/${mod.id}`)}
              title={mod.compat.blockers[0] ?? 'Launch this mod'}
            >
              <Icon name="play" size={15} />
              Play
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await createProjectFromMod(mod);
                push('Working copy created in Mod Studio.', 'success');
                navigate('/studio');
              }}
            >
              <Icon name="studio" size={15} />
              Edit Project
            </button>
            <button type="button" className="btn" onClick={startRename}>
              Rename
            </button>
            <button type="button" className="btn" onClick={() => void exportZip()} disabled={busy}>
              <Icon name="download" size={15} />
              Export
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void patchMod(mod.id, { favourite: !mod.favourite })}
              aria-pressed={mod.favourite}
            >
              <Icon name="star" size={15} />
              {mod.favourite ? 'Unfavourite' : 'Favourite'}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={15} />
              Delete
            </button>
          </div>
          {mod.compat.blockers.length > 0 ? (
            <p className="faint" style={{ marginTop: 12 }}>
              Play is disabled: {mod.compat.blockers[0]}
            </p>
          ) : null}
        </div>
      </div>

      <Section
        title="Compatibility report"
        description="Static analysis of what this mod depends on. This is not a compatibility level."
      >
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3>{level === null ? 'Level not assigned' : LEVEL_LABEL[level]}</h3>
              <p className="faint" style={{ marginTop: 4 }}>
                {mod.compat.levelReason}
              </p>
            </div>
            <span className="badge">Checked {formatDate(mod.compat.checkedAt)}</span>
          </div>

          {mod.compat.blockers.length > 0 ? (
            <div className="report-list">
              {mod.compat.blockers.map((blocker, index) => (
                <div className="report-row" key={`blocker-${index}`}>
                  <span className="dot dot-danger" />
                  <span>{blocker}</span>
                </div>
              ))}
            </div>
          ) : null}

          {mod.compat.warnings.length > 0 ? (
            <div className="report-list">
              {mod.compat.warnings.map((warning, index) => (
                <div className="report-row" key={`warning-${index}`}>
                  <span className="dot dot-warn" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          ) : null}

          <hr className="divider" />
          <h3>Detected features</h3>
          <div className="feature-grid">
            {mod.compat.findings.map((finding) => (
              <div className="feature" key={finding.id} data-detected={finding.detected} title={finding.note}>
                <span className={finding.detected ? 'dot dot-ok' : 'dot'} />
                <span>{finding.label}</span>
              </div>
            ))}
          </div>
          {engine ? (
            <p className="faint">
              {engine.shortName} runtime support for these features is not published, so no level can be
              assigned. See Settings, Engines, for the current, literal status.
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="Details">
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Detection</span>
            <span>
              {mod.detectionConfidence === 'none'
                ? 'Not recognised'
                : `${mod.detectionConfidence} confidence · score ${mod.detectionScore}`}
              {mod.engineOverridden ? ' · manually overridden' : ''}
            </span>
          </div>
          {mod.detectionEvidence.length > 0 ? (
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="muted">Evidence</span>
              <span className="faint" style={{ textAlign: 'right', maxWidth: '60ch' }}>
                {mod.detectionEvidence.join('; ')}
              </span>
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Source</span>
            <span>
              {mod.source.kind === 'game'
                ? 'Complete game build'
                : mod.source.kind === 'folder'
                  ? 'Folder'
                  : 'ZIP'}
              {mod.source.fileName ? ` · ${mod.source.fileName}` : ''}
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Imported</span>
            <span>{formatDate(mod.importedAt)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Last played</span>
            <span>{formatRelative(mod.lastPlayedAt)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Fingerprint</span>
            <span className="mono">{mod.fingerprint.slice(0, 16)}...</span>
          </div>
        </div>
      </Section>

      <Section title="Collections">
        <div className="card row" style={{ gap: 8 }}>
          {collections.length === 0 ? (
            <p className="muted">No collections yet. Create one from the Library page.</p>
          ) : (
            collections.map((collection) => {
              const active = mod.collectionIds.includes(collection.id);
              return (
                <button
                  key={collection.id}
                  type="button"
                  className={active ? 'badge badge-accent' : 'badge'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => void toggleCollection(mod.id, collection.id)}
                  aria-pressed={active}
                >
                  {collection.name}
                </button>
              );
            })
          )}
        </div>
      </Section>

      <Section title="Advanced" description="Engine override and runtime pinning.">
        <div className="card stack">
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <div className="field">
              <label htmlFor="detail-engine">Engine override</label>
              <select
                id="detail-engine"
                className="input"
                value={mod.engine ?? 'unknown'}
                onChange={(event) => {
                  const value = event.target.value;
                  void changeEngine(value === 'unknown' ? null : (value as EngineId));
                }}
              >
                <option value="unknown">Unknown</option>
                {ENGINE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {ENGINES[id].shortName}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="detail-runtime">Runtime version</label>
              <select
                id="detail-runtime"
                className="input"
                value={mod.runtimeVersion ?? ''}
                onChange={(event) => void patchMod(mod.id, { runtimeVersion: event.target.value || null })}
                disabled={availableRuntimes.length === 0}
              >
                <option value="">
                  {availableRuntimes.length === 0 ? 'No runtime published' : 'Engine default'}
                </option>
                {availableRuntimes.map((runtime) => (
                  <option key={runtime.id} value={runtime.version}>
                    {runtime.version}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="faint">
            {RUNTIME_CATALOG.length === 0
              ? 'No browser runtime packages exist yet, so there is nothing to pin. Runtimes will be listed here per engine and version once they are built, verified and cleared for distribution.'
              : 'Pinning a runtime keeps this mod on that version. Runtimes in use are never removed automatically.'}
          </p>
        </div>
      </Section>

      {renaming ? (
        <Modal title="Rename mod" onClose={() => setRenaming(false)}>
          <div className="field">
            <label htmlFor="rename-input">Display name</label>
            <input
              id="rename-input"
              className="input"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void applyRename();
              }}
            />
            <span className="faint">
              Only the FNF OS display name changes. Files inside the mod are untouched.
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void applyRename()}>
              Save name
            </button>
          </div>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal title="Delete this mod?" onClose={() => setConfirmDelete(false)}>
          <p>
            This removes "{mod.name}" and its {pluralise(mod.fileCount, 'stored file')} from this browser.
            It cannot be undone unless you exported a copy.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void confirmRemoval()}>
              Delete permanently
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        zIndex: 300,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 460, width: '100%', boxShadow: 'var(--shadow-soft)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
