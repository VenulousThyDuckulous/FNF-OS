import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, Icon } from '../components/ui';
import { engineName, formatRelative } from '../lib/format';
import { STORES, clearStore } from '../lib/idb';
import {
  deleteScore,
  listScores,
  personalBests,
  recentSongs,
  summarise,
  type ScoreRecord,
} from '../lib/scores';
import { Link } from '../router';

/**
 * Scores and play history.
 *
 * Everything on this page comes from this browser's IndexedDB. Records are
 * grouped by engine, mod, chart and difficulty, so the same song name in two
 * engines is never merged. Autoplay runs are listed but excluded from bests.
 */
export function HistoryPage(): JSX.Element {
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    listScores()
      .then((records) => {
        setScores(records);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Saved scores could not be read from this browser.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const summary = useMemo(() => summarise(scores), [scores]);
  const bests = useMemo(() => personalBests(scores), [scores]);
  const recent = useMemo(() => recentSongs(scores, 6), [scores]);

  const remove = async (id: string) => {
    await deleteScore(id);
    reload();
  };

  const clearAll = async () => {
    await clearStore(STORES.scores);
    setConfirmClear(false);
    reload();
  };

  return (
    <div className="stack" style={{ gap: 26 }}>
      <header className="page-head">
        <div>
          <h1>Scores &amp; history</h1>
          <p>
            Saved in this browser only. Runs are grouped by engine, mod, chart and difficulty — autoplay runs
            are kept for reference but never ranked.
          </p>
        </div>
        <Link to="/library" className="btn btn-ghost">
          <Icon name="library" size={16} />
          Library
        </Link>
      </header>

      {error ? (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <p>{error}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="muted">Reading saved scores…</p>
      ) : scores.length === 0 ? (
        <EmptyState
          title="No runs saved yet"
          body="Play a song from one of your mods. Finished runs — including failed ones — appear here with their score, accuracy, misses and hold drops."
          action={
            <Link to="/library" className="btn btn-primary">
              Open your library
            </Link>
          }
        />
      ) : (
        <>
          <section className="panel-grid">
            <Stat label="Runs" value={String(summary.plays)} />
            <Stat label="Songs played" value={String(summary.songs)} />
            <Stat label="Best rank" value={summary.bestRank ?? '—'} />
            <Stat label="Total score" value={summary.totalScore.toLocaleString()} />
            <Stat label="Misses" value={String(summary.misses)} />
            <Stat label="Holds dropped" value={String(summary.holdDrops)} />
          </section>

          <section className="stack">
            <h2>Personal bests</h2>
            {bests.length === 0 ? (
              <p className="muted">Every saved run so far was autoplay, so there is no ranked best yet.</p>
            ) : (
              <div className="panel-grid">
                {bests.map((entry) => (
                  <article key={entry.key} className="card stack" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{entry.songTitle}</strong>
                      <span className="badge badge-accent">{entry.best.rank}</span>
                    </div>
                    <p className="faint">
                      {entry.difficulty} · {engineName(entry.engine)}
                      {entry.modId ? ` · ${entry.modName}` : ' · built-in chart'}
                    </p>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span>{entry.best.score.toLocaleString()}</span>
                      <span>{(entry.best.accuracy * 100).toFixed(2)}%</span>
                      <span>×{entry.best.maxCombo}</span>
                    </div>
                    <p className="faint">
                      {entry.attempts} attempt{entry.attempts === 1 ? '' : 's'} · last{' '}
                      {formatRelative(entry.lastPlayedAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="stack">
            <h2>Recently played</h2>
            <ul className="list">
              {recent.map((entry) => (
                <li key={entry.key}>
                  <span>
                    {entry.songTitle} <span className="faint">· {entry.difficulty}</span>
                  </span>
                  <span className="faint">
                    {entry.bestRank} · {entry.plays} play{entry.plays === 1 ? '' : 's'} ·{' '}
                    {formatRelative(entry.lastPlayedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>All runs</h2>
              {confirmClear ? (
                <span className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-sm" onClick={() => void clearAll()}>
                    Delete {scores.length} runs
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>
                  <Icon name="trash" size={14} />
                  Clear history
                </button>
              )}
            </div>

            <ul className="list">
              {scores.map((score) => (
                <li key={score.id} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{score.songTitle}</strong>{' '}
                    <span className="faint">
                      · {score.difficulty} · {engineName(score.engine)}
                      {score.autoplay ? ' · autoplay' : ''}
                      {score.failed ? ' · failed' : ''}
                    </span>
                    <br />
                    <span className="faint">
                      {score.score.toLocaleString()} · {(score.accuracy * 100).toFixed(2)}% · rank{' '}
                      {score.rank} · {score.counts.miss} miss{score.counts.miss === 1 ? '' : 'es'} ·{' '}
                      {score.holdDrops} dropped hold{score.holdDrops === 1 ? '' : 's'} ·{' '}
                      {formatRelative(score.playedAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void remove(score.id)}
                    aria-label={`Delete run of ${score.songTitle}`}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="faint">
              Rank thresholds: S ≥ 95%, A ≥ 90%, B ≥ 80%, C ≥ 70%, D ≥ 60%. Per-engine scoring tables are not
              applied yet; every saved run uses this runtime's own accuracy model, including sustained notes which
              count as two units (head and tail).
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <p className="faint" style={{ marginBottom: 4 }}>
        {label}
      </p>
      <strong style={{ fontSize: '1.2rem' }}>{value}</strong>
    </div>
  );
}
