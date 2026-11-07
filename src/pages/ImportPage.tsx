import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import { ENGINES } from '../lib/engines/registry';
import { ENGINE_IDS, type EngineId } from '../lib/engines/types';
import { formatBytes } from '../lib/import/safety';
import {
  describeCandidate,
  scanFolder,
  scanZip,
  summariseScan,
  type ImportScan,
  type ModCandidate,
} from '../lib/import/importer';
import { pluralise } from '../lib/format';
import { useNavigate } from '../router';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

export function ImportPage(): JSX.Element {
  const { importCandidates, mods } = useLibrary();
  const { push } = useToast();
  const navigate = useNavigate();

  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const [scan, setScan] = useState<ImportScan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, EngineId | null>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; ratio: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);

  const applyScan = (result: ImportScan) => {
    setScan(result);
    setSelected(new Set(result.candidates.filter((c) => !c.duplicateId).map((c) => c.key)));
    setOverrides({});
    if (result.candidates.length === 0) {
      setError('No usable mod content was found. Check that the archive contains a mod folder with data/ or a manifest.');
    }
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setScan(null);
    setProgress({ stage: 'Preparing', ratio: 0 });

    try {
      const zip = files.find((file) => file.name.toLowerCase().endsWith('.zip'));
      if (zip && files.length === 1) {
        const bytes = new Uint8Array(await zip.arrayBuffer());
        applyScan(await scanZip(bytes, zip.name, (stage, ratio) => setProgress({ stage, ratio })));
      } else {
        // Folder selections carry the directory in `webkitRelativePath`; a bare
        // file list has none. Testing the *file name* for a dot mislabelled every
        // folder import, because real files (pack.json, Inst.ogg) have extensions.
        const relative =
          (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
        const folderName =
          relative.split('/')[0] || files[0].name.replace(/\.[^.]+$/, '') || 'Imported folder';
        applyScan(
          await scanFolder(files, folderName, (stage, ratio) => setProgress({ stage, ratio })),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import could not be read.');
    } finally {
      setBusy(false);
      setProgress(null);
      if (zipInput.current) zipInput.current.value = '';
      if (folderInput.current) folderInput.current.value = '';
    }
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const items = [...event.dataTransfer.files];
    void handleFiles(items);
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chosen = scan ? scan.candidates.filter((candidate) => selected.has(candidate.key)) : [];

  const commit = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const created = await importCandidates(chosen, overrides);
      push(
        created.length === 1
          ? `Imported "${created[0].name}".`
          : `Imported ${pluralise(created.length, 'mod')}.`,
        'success',
      );
      if (created.length === 1) navigate(`/mod/${created[0].id}`);
      else navigate('/library');
      setScan(null);
      setSelected(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import failed while saving to the browser.');
    } finally {
      setBusy(false);
    }
  };

  const setAll = (value: boolean) => {
    if (!scan) return;
    setSelected(value ? new Set(scan.candidates.map((candidate) => candidate.key)) : new Set());
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Import</h1>
          <p>
            ZIP mod packages, extracted mod folders or complete game builds. Everything is scanned locally;
            native executables are detected and never run.
          </p>
        </div>
      </header>

      <div
        className="dropzone"
        data-active={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon name="import" size={26} />
        <div>
          <h3>Drop a mod ZIP or folder here</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            Large archives are checked against size, entry-count and compression-ratio limits before
            anything is stored.
          </p>
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => zipInput.current?.click()} disabled={busy}>
            Choose ZIP
          </button>
          <button type="button" className="btn" onClick={() => folderInput.current?.click()} disabled={busy}>
            Choose folder
          </button>
        </div>
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => void handleFiles([...(event.target.files ?? [])])}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          onChange={(event) => void handleFiles([...(event.target.files ?? [])])}
        />
      </div>

      {progress ? (
        <div className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">{progress.stage}</span>
            <span className="faint">{Math.round(progress.ratio * 100)}%</span>
          </div>
          <div className="progress">
            <span style={{ width: `${Math.max(4, Math.min(100, progress.ratio * 100))}%` }} />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)' }}>
          <div className="row">
            <Icon name="info" size={16} />
            <p style={{ color: 'var(--text)' }}>{error}</p>
          </div>
        </div>
      ) : null}

      {scan ? (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2>{summariseScan(scan)}</h2>
              <p className="faint" style={{ marginTop: 4 }}>
                {scan.fileName} · {pluralise(scan.totals.entries, 'file')} · {formatBytes(scan.totals.bytes)}
              </p>
            </div>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => setAll(true)}>
                Select all
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setAll(false)}>
                Deselect all
              </button>
            </div>
          </div>

          {scan.warnings.length > 0 ? (
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>Notes from the scan</h3>
              <ul className="list">
                {scan.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {scan.issues.length > 0 ? (
            <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)' }}>
              <h3 style={{ marginBottom: 8 }}>Rejected content</h3>
              <ul className="list">
                {scan.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="stack" style={{ gap: 10 }}>
            {scan.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.key}
                candidate={candidate}
                checked={selected.has(candidate.key)}
                onToggle={() => toggle(candidate.key)}
                override={overrides[candidate.key]}
                onOverride={(engine) =>
                  setOverrides((prev) => {
                    const next = { ...prev };
                    if (engine === undefined) delete next[candidate.key];
                    else next[candidate.key] = engine;
                    return next;
                  })
                }
              />
            ))}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setScan(null)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void commit()}
              disabled={busy || chosen.length === 0}
            >
              Import {chosen.length === 0 ? '' : pluralise(chosen.length, 'mod')}
            </button>
          </div>

          <p className="faint">
            Library currently holds {pluralise(mods.length, 'mod')}. Imported content stays in this browser only.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CandidateRow({
  candidate,
  checked,
  onToggle,
  override,
  onOverride,
}: {
  candidate: ModCandidate;
  checked: boolean;
  onToggle: () => void;
  override: EngineId | null | undefined;
  onOverride: (engine: EngineId | null | undefined) => void;
}): JSX.Element {
  const engine = override === undefined ? candidate.detection.engine : override;

  return (
    <div className="candidate" data-selected={checked}>
      <input
        type="checkbox"
        className="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Import ${candidate.name}`}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <strong style={{ fontSize: '0.92rem' }}>{candidate.name}</strong>
          {candidate.kind === 'game' ? <span className="badge badge-accent">Complete build</span> : null}
          <span className="badge">
            {candidate.detection.confidence === 'none'
              ? 'Engine not recognised'
              : `${candidate.detection.confidence} confidence`}
          </span>
        </div>
        <p className="faint" style={{ marginTop: 4 }}>
          {describeCandidate(candidate)}
          {candidate.detection.engineVersion ? ` · v${candidate.detection.engineVersion}` : ''}
        </p>
        {candidate.detection.evidence.length > 0 ? (
          <p className="faint" style={{ marginTop: 4 }}>
            Detected from: {candidate.detection.evidence.slice(0, 3).join('; ')}
          </p>
        ) : null}
        {candidate.duplicateId ? (
          <p className="faint" style={{ marginTop: 6, color: 'var(--warn)' }}>
            Looks identical to “{candidate.duplicateName}”, already in your library. Import anyway only if
            that is intentional.
          </p>
        ) : null}
        {candidate.compat.blockers.length > 0 ? (
          <p className="faint" style={{ marginTop: 6 }}>
            {candidate.compat.blockers[0]}
          </p>
        ) : null}
      </div>
      <div className="field" style={{ minWidth: 150 }}>
        <label htmlFor={`engine-${candidate.key}`}>Engine</label>
        <select
          id={`engine-${candidate.key}`}
          className="input"
          value={engine ?? 'unknown'}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'auto') onOverride(undefined);
            else if (value === 'unknown') onOverride(null);
            else onOverride(value as EngineId);
          }}
        >
          <option value="auto">
            Detected{override === undefined && candidate.detection.engine ? ` (${ENGINES[candidate.detection.engine].shortName})` : ''}
          </option>
          <option value="unknown">Unknown</option>
          {ENGINE_IDS.map((id) => (
            <option key={id} value={id}>
              {ENGINES[id].shortName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
