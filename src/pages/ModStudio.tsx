import { useState } from 'react';
import { Icon, Section } from '../components/ui';
import { getEngine } from '../lib/engines/registry';
import { formatDate } from '../lib/format';
import { useNavigate } from '../router';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

/**
 * Mod Studio.
 *
 * The product goal is to open the engine's *own* editor inside the browser,
 * preserving native tools. No browser runtime exists yet, so the studio
 * detects the project engine and says plainly that the native editors are not
 * available. It does not ship a fake chart editor.
 */
export function ModStudioPage(): JSX.Element {
  const { projects, mods, createProjectFromMod, removeProject } = useLibrary();
  const { push } = useToast();
  const navigate = useNavigate();
  const [showPicker, setShowPicker] = useState(false);

  const candidates = mods.filter((mod) => !projects.some((project) => project.modId === mod.id));

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Mod Studio</h1>
          <p>
            Projects open the engine's own editor wherever that is possible in a browser. FNF OS never
            substitutes a fake editor for a real one.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowPicker(!showPicker)}>
          <Icon name="plus" size={15} />
          New project
        </button>
      </header>

      <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--warn) 40%, transparent)' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Icon name="info" size={17} />
          <div>
            <h3>Native editors are not available yet</h3>
            <p className="muted" style={{ marginTop: 6, maxWidth: '78ch' }}>
              Chart, character and stage editors live inside each engine. Until a browser runtime is
              published for your project's engine, FNF OS can create and track the working copy but cannot
              render the engine's editor. Creating a project now keeps your structure ready for when a
              runtime lands.
            </p>
          </div>
        </div>
      </div>

      {showPicker ? (
        <div className="card stack">
          <h3>Pick a mod to open as a working copy</h3>
          {candidates.length === 0 ? (
            <p className="muted">Every imported mod already has a project, or your library is empty.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {candidates.map((mod) => (
                <div className="candidate" key={mod.id}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.9rem' }}>{mod.name}</strong>
                    <p className="faint" style={{ marginTop: 3 }}>
                      {getEngine(mod.engine)?.name ?? 'Unknown engine'}
                      {mod.engineVersion ? ` · v${mod.engineVersion}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      await createProjectFromMod(mod);
                      setShowPicker(false);
                      push('Working copy created. The original import was left untouched.', 'success');
                    }}
                  >
                    Open as project
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Section title="Your projects" description="Working copies are separate from the original import.">
        {projects.length === 0 ? (
          <div className="empty">
            <strong>No projects yet</strong>
            <p>
              Import a mod template or an existing mod, then open it as a project to begin. The original
              import is never overwritten.
            </p>
            <button type="button" className="btn" onClick={() => setShowPicker(true)}>
              Create a project
            </button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {projects.map((project) => (
              <div className="candidate" key={project.id}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.92rem' }}>{project.name}</strong>
                  <p className="faint" style={{ marginTop: 4 }}>
                    {getEngine(project.engine)?.name ?? 'Unknown engine'}
                    {project.engineVersion ? ` · v${project.engineVersion}` : ''} · created{' '}
                    {formatDate(project.createdAt)}
                  </p>
                  <p className="faint" style={{ marginTop: 4 }}>
                    Editor unavailable:{' '}
                    {getEngine(project.engine)?.playbackNote ?? 'no runtime for this engine.'}
                  </p>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => navigate(`/mod/${project.modId}`)}
                  >
                    View source mod
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={async () => {
                      await removeProject(project.id);
                      push('Project removed. The source mod is unchanged.', 'success');
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="What will happen when a runtime exists">
        <div className="panel-grid">
          <div className="card">
            <h3>1 · Detect</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              The project's engine and version come from the imported template, not from a manual choice.
            </p>
          </div>
          <div className="card">
            <h3>2 · Open</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              The adapted runtime boots the engine's own tools — chart editor included — against the working
              copy.
            </p>
          </div>
          <div className="card">
            <h3>3 · Save</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              Changes are written back to the project in local storage and can be exported as a ZIP.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
