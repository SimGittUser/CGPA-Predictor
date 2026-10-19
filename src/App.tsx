import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HowItWorks } from './components/HowItWorks';
import { Overview } from './components/Overview';
import { PastSemesters } from './components/PastSemesters';
import { SubjectDetail } from './components/SubjectDetail';
import { Icon } from './components/ui';
import { initialState } from './lib/factory';
import { simulate, subjectModel } from './lib/predict';
import { STORAGE_KEY, downloadBackup, loadState, readBackup, saveState } from './lib/storage';
import type { AppState, Subject } from './lib/types';

type Route = { view: 'semester' } | { view: 'cgpa' } | { view: 'how' } | { view: 'subject'; id: string };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('s/')) return { view: 'subject', id: h.slice(2) };
  if (h === 'cgpa') return { view: 'cgpa' };
  if (h === 'how') return { view: 'how' };
  return { view: 'semester' };
}

const go = (hash: string) => {
  location.hash = hash;
};

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [route, setRoute] = useState<Route>(parseHash);
  const skipSave = useRef(true);

  // Save on every change.
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveStatus(saveState(state) ? 'saved' : 'error');
  }, [state]);

  // Keep other open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        skipSave.current = true;
        setState(loadState());
      }
    };
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    addEventListener('storage', onStorage);
    addEventListener('hashchange', onHash);
    return () => {
      removeEventListener('storage', onStorage);
      removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    const t = state.settings.theme;
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [state.settings.theme]);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((s) => ({ ...fn(s), updatedAt: new Date().toISOString() }));
  }, []);

  const models = useMemo(
    () => state.subjects.map((s) => subjectModel(s, state.settings.uncertainty)),
    [state.subjects, state.settings.uncertainty],
  );
  const sim = useMemo(() => simulate(models), [models]);

  const changeSubject = (id: string) => (fn: (s: Subject) => Subject) =>
    update((st) => ({ ...st, subjects: st.subjects.map((s) => (s.id === id ? fn(s) : s)) }));

  const openModel = route.view === 'subject' ? models.find((m) => m.subject.id === route.id) : undefined;
  const tab = route.view === 'subject' ? 'semester' : route.view;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            A+
          </span>
          <div>
            <h1>CU Grade Predictor</h1>
            <SaveBadge status={saveStatus} at={state.updatedAt} />
          </div>
        </div>
        <Menu state={state} update={update} replace={(s) => setState(s)} />
      </header>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ['semester', 'This semester', '#/'],
            ['cgpa', 'CGPA', '#/cgpa'],
            ['how', 'How it works', '#/how'],
          ] as const
        ).map(([key, label, hash]) => (
          <a key={key} href={hash} className={tab === key ? 'on' : ''} aria-current={tab === key ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>

      <main>
        {route.view === 'subject' && openModel ? (
          <SubjectDetail
            m={openModel}
            sim={sim}
            change={changeSubject(openModel.subject.id)}
            remove={() => {
              update((st) => ({ ...st, subjects: st.subjects.filter((s) => s.id !== openModel.subject.id) }));
              go('#/');
            }}
            back={() => go('#/')}
          />
        ) : route.view === 'cgpa' ? (
          <PastSemesters state={state} sim={sim} update={update} />
        ) : route.view === 'how' ? (
          <HowItWorks />
        ) : (
          <Overview state={state} models={models} sim={sim} update={update} open={(id) => go(`#/s/${id}`)} />
        )}
      </main>
      <footer className="muted small">
        Unofficial estimate, not affiliated with Chandigarh University. Your marks stay in this browser; export a backup to move them.
      </footer>
    </div>
  );
}

function SaveBadge({ status, at }: { status: 'idle' | 'saved' | 'error'; at: string | null }) {
  if (status === 'error') return <span className="save error">Couldn't save. Export a backup</span>;
  if (!at) return <span className="save muted">Saves automatically</span>;
  const t = new Date(at);
  return (
    <span className="save muted" title={t.toLocaleString()}>
      <Icon name="check" /> Saved {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

function Menu({ state, update, replace }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; replace: (s: AppState) => void }) {
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const themeNext = state.settings.theme === 'dark' ? 'light' : state.settings.theme === 'light' ? 'system' : 'dark';

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => downloadBackup(state)}>
            Export backup (.json)
          </button>
          <button type="button" role="menuitem" onClick={() => file.current?.click()}>
            Import backup…
          </button>
          <div className="menu-sep" />
          <div className="menu-label small muted">Exam-day uncertainty</div>
          <div className="menu-seg">
            {(['low', 'medium', 'high'] as const).map((u) => (
              <button
                key={u}
                type="button"
                className={state.settings.uncertainty === u ? 'on' : ''}
                onClick={() => update((s) => ({ ...s, settings: { ...s.settings, uncertainty: u } }))}
              >
                {u}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => update((s) => ({ ...s, settings: { ...s.settings, theme: themeNext } }))}>
            Theme: {state.settings.theme} → {themeNext}
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              if (confirm('Delete all subjects, marks and semesters? Export a backup first if you might want them.')) {
                update(() => initialState());
                setOpen(false);
                go('#/');
              }
            }}
          >
            Reset everything
          </button>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const s = await readBackup(f);
            if (confirm(`Replace your current data with this backup (${s.subjects.length} subjects)?`)) {
              replace({ ...s, updatedAt: new Date().toISOString() });
              setOpen(false);
              go('#/');
            }
          } catch (err) {
            alert(`Couldn't read that file: ${(err as Error).message}`);
          }
        }}
      />
    </div>
  );
}
