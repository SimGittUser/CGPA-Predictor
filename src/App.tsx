import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddSubject } from './components/AddSubject';
import { GoalStep } from './components/Goal';
import { Help } from './components/Help';
import { ImportFlow } from './components/Import';
import { Overview } from './components/Overview';
import { PastSemesters } from './components/PastSemesters';
import { SubjectDetail } from './components/SubjectDetail';
import { Welcome } from './components/Welcome';
import { animateOut, useConfirm } from './components/motion';
import { Icon } from './components/ui';
import { initialState } from './lib/factory';
import { choosePlan, requiredSgpaForCgpa, simulate, subjectModel } from './lib/predict';
import { STORAGE_KEY, downloadBackup, loadState, readBackup, saveState } from './lib/storage';
import type { AppState, Subject } from './lib/types';

type Route = { view: 'semester' } | { view: 'cgpa' } | { view: 'help' } | { view: 'add' } | { view: 'import' } | { view: 'subject'; id: string };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('s/')) return { view: 'subject', id: h.slice(2) };
  if (h === 'cgpa') return { view: 'cgpa' };
  if (h === 'help' || h === 'how') return { view: 'help' };
  if (h === 'add') return { view: 'add' };
  if (h === 'import') return { view: 'import' };
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

  // Keep other open tabs in sync, and follow the address bar.
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
  // The goal as an SGPA for this semester (a CGPA goal is converted using past semesters).
  const targetSgpa =
    state.target === null
      ? null
      : state.targetMode === 'cgpa'
        ? requiredSgpaForCgpa(state.pastSemesters, state.target, sim.credits)
        : state.target;
  const planSafe = state.settings.planSafe;
  const plan = useMemo(() => (targetSgpa === null ? null : choosePlan(models, targetSgpa, planSafe)), [models, targetSgpa, planSafe]);
  // Ask for the goal before showing any results.
  const needsGoal = state.setupDone && state.subjects.length > 0 && state.target === null;

  const changeSubject = (id: string) => (fn: (s: Subject) => Subject) =>
    update((st) => ({ ...st, subjects: st.subjects.map((s) => (s.id === id ? fn(s) : s)) }));

  const openModel = route.view === 'subject' ? models.find((m) => m.subject.id === route.id) : undefined;
  const tab = route.view === 'subject' || route.view === 'add' || route.view === 'import' ? 'semester' : route.view;
  const inSetup = !state.setupDone && route.view !== 'help';

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/">
          <span className="logo" aria-hidden>
            A+
          </span>
          <div>
            <h1>CU Grade Predictor</h1>
            <SaveBadge status={saveStatus} at={state.updatedAt} />
          </div>
        </a>
        <Menu state={state} update={update} replace={(s) => setState(s)} />
      </header>

      {!inSetup && (
        <nav className="tabs" aria-label="Sections">
          {(
            [
              ['semester', 'My Subjects', '#/'],
              ['cgpa', 'My CGPA', '#/cgpa'],
              ['help', 'Help', '#/help'],
            ] as const
          ).map(([key, label, hash]) => (
            <a key={key} href={hash} className={tab === key ? 'on' : ''} aria-current={tab === key ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
      )}

      {/* Keyed by page, so each page change replays the entrance animation. */}
      <main key={route.view === 'subject' ? `s/${route.id}` : `${route.view}${inSetup ? '-setup' : ''}${needsGoal ? '-goal' : ''}`}>
        {inSetup ? (
          <Welcome state={state} update={update} />
        ) : route.view === 'subject' && openModel ? (
          <SubjectDetail
            key={openModel.subject.id}
            m={openModel}
            sim={sim}
            plan={plan}
            goal={state}
            change={changeSubject(openModel.subject.id)}
            remove={() => {
              update((st) => ({ ...st, subjects: st.subjects.filter((s) => s.id !== openModel.subject.id) }));
              go('#/');
            }}
            back={() => go('#/')}
          />
        ) : route.view === 'import' ? (
          <ImportFlow state={state} update={update} onDone={() => go('#/')} onCancel={() => go('#/')} />
        ) : route.view === 'add' ? (
          <AddSubject update={update} open={(id) => go(`#/s/${id}`)} back={() => history.back()} />
        ) : route.view === 'cgpa' ? (
          <PastSemesters state={state} sim={sim} update={update} />
        ) : route.view === 'help' ? (
          <Help />
        ) : (
          needsGoal || plan === null || targetSgpa === null ? (
            <GoalStep state={state} update={update} />
          ) : (
            <Overview state={state} models={models} sim={sim} plan={plan} targetSgpa={targetSgpa} update={update} open={(id) => go(`#/s/${id}`)} />
          )
        )}
      </main>
      <footer className="muted small">
        An estimate made by students, not an official Chandigarh University tool. Your marks stay on this device.
      </footer>
    </div>
  );
}

function SaveBadge({ status, at }: { status: 'idle' | 'saved' | 'error'; at: string | null }) {
  if (status === 'error') return <span className="save error">Couldn't save. Use ⋯ → Save a backup file</span>;
  if (!at) return <span className="save muted">Your marks save by themselves</span>;
  return (
    <span className="save muted" title={new Date(at).toLocaleString()}>
      <span key={at} className="pop save-check">
        <Icon name="check" />
      </span>{' '}
      All changes saved
    </span>
  );
}

function Menu({ state, update, replace }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; replace: (s: AppState) => void }) {
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const dark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const ask = useConfirm();

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="more" />
        <span>Menu</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => (downloadBackup(state), setOpen(false))}>
            <b>Save a backup file</b>
            <span className="small muted">Keep a copy, or move your marks to another device</span>
          </button>
          <button type="button" role="menuitem" onClick={() => file.current?.click()}>
            <b>Load a backup file</b>
            <span className="small muted">Bring back marks from a saved file</span>
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => (update((s) => ({ ...s, settings: { ...s.settings, theme: dark ? 'light' : 'dark' } })), setOpen(false))}
          >
            <b>{dark ? 'Switch to light mode' : 'Switch to dark mode'}</b>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              const ok = await ask({
                title: 'Pick a different semester?',
                body: 'Your current subjects and their marks will be removed. Your past semester results are kept.',
                confirmLabel: 'Yes, start again',
                danger: true,
              });
              if (ok)
                animateOut(document.querySelector('main'), () => {
                  update((s) => ({ ...s, setupDone: false, subjects: [], target: null }));
                  go('#/');
                });
            }}
          >
            <b>Choose a different semester</b>
            <span className="small muted">Start again with another set of subjects</span>
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={async () => {
              setOpen(false);
              const ok = await ask({
                title: 'Delete everything?',
                body: 'All your subjects, marks and past results will be removed from this device. This can’t be undone. Save a backup file first if you might want them back.',
                confirmLabel: 'Delete everything',
                danger: true,
              });
              if (ok)
                animateOut(document.querySelector('main'), () => {
                  update(() => initialState());
                  go('#/');
                }, 280);
            }}
          >
            <b>Delete everything</b>
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
            setOpen(false);
            const ok = await ask({
              title: 'Load this backup?',
              body: `It has ${s.subjects.length} subject${s.subjects.length === 1 ? '' : 's'}. What's on this device now will be replaced.`,
              confirmLabel: 'Load backup',
            });
            if (ok) {
              replace({ ...s, updatedAt: new Date().toISOString() });
              go('#/');
            }
          } catch {
            await ask({
              title: 'That isn’t a backup file',
              body: 'Pick the .json file you saved with “Save a backup file”.',
              cancelLabel: null,
            });
          }
        }}
      />
    </div>
  );
}
