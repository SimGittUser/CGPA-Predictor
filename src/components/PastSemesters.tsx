import { newPastSemester } from '../lib/factory';
import { cgpaWith, pastTotals, requiredSgpaForCgpa, type Simulation } from '../lib/predict';
import type { AppState, PastSemester } from '../lib/types';
import { Card, Icon, NumberField, fmt, pct } from './ui';

interface Props {
  state: AppState;
  sim: Simulation;
  update: (fn: (s: AppState) => AppState) => void;
}

export function PastSemesters({ state, sim, update }: Props) {
  const past = pastTotals(state.pastSemesters);
  const setPast = (fn: (p: PastSemester[]) => PastSemester[]) => update((s) => ({ ...s, pastSemesters: fn(s.pastSemesters) }));
  const credits = sim.credits;
  const median = sim.quantile(0.5);
  const target = state.targetMode === 'cgpa' ? state.target : null;
  const needed = target !== null ? requiredSgpaForCgpa(state.pastSemesters, target, credits) : null;

  return (
    <div className="stack">
      <Card>
        <h3>Completed semesters</h3>
        <p className="muted small">
          Enter the SGPA and graded credits from your result sheet. Leave out Qualified subjects (like Academic &amp; Career Pathway Planning) from credits.
        </p>
        <div className="past">
          {state.pastSemesters.length > 0 && (
            <div className="past-row past-head small muted" aria-hidden>
              <span>Semester</span>
              <span>SGPA</span>
              <span>Credits</span>
              <span />
            </div>
          )}
          {state.pastSemesters.map((p) => {
            const set = (patch: Partial<PastSemester>) => setPast((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
            return (
              <div className="past-row" key={p.id}>
                <input value={p.name} aria-label="Semester name" onChange={(e) => set({ name: e.target.value })} />
                <NumberField value={p.sgpa} min={0} max={10} placeholder="8.00" label="SGPA" onChange={(v) => set({ sgpa: v })} />
                <NumberField value={p.credits} min={0} max={60} placeholder="21" label="Credits" onChange={(v) => set({ credits: v })} />
                <button type="button" className="icon-btn" aria-label={`Delete ${p.name}`} onClick={() => setPast((ps) => ps.filter((x) => x.id !== p.id))}>
                  <Icon name="x" />
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn" onClick={() => setPast((ps) => [...ps, newPastSemester(ps.length + 1)])}>
          <Icon name="plus" /> Add semester
        </button>
      </Card>

      <Card>
        <div className="istats">
          <div>
            <span className="small muted">CGPA so far</span>
            <b>{past.cgpa === null ? '–' : fmt(past.cgpa, 2)}</b>
          </div>
          <div>
            <span className="small muted">Credits done</span>
            <b>{fmt(past.credits, 1)}</b>
          </div>
          <div>
            <span className="small muted">This semester (predicted)</span>
            <b>{credits ? fmt(median, 2) : '–'}</b>
          </div>
          <div>
            <span className="small muted">CGPA after it</span>
            <b className="accent">{credits ? fmt(cgpaWith(state.pastSemesters, median, credits), 2) : '–'}</b>
          </div>
        </div>
        <p className="muted small">CGPA = total of (SGPA × credits) ÷ total credits, across every semester.</p>
      </Card>

      <Card>
        <h3>CGPA target</h3>
        <div className="target-row">
          <span>I want a CGPA of</span>
          <NumberField
            className="target-input"
            value={target}
            min={0}
            max={10}
            placeholder="8.5"
            label="Target CGPA"
            onChange={(v) => v !== null && update((s) => ({ ...s, targetMode: 'cgpa', target: v }))}
          />
        </div>
        {needed !== null && credits > 0 && (
          <p>
            {needed > 10 ? (
              <>Not reachable this semester. Even a 10 SGPA would leave you at {fmt(cgpaWith(state.pastSemesters, 10, credits), 2)}.</>
            ) : needed <= 0 ? (
              <>Already locked in, whatever happens this semester.</>
            ) : (
              <>
                You need an SGPA of <b>{fmt(needed, 2)}</b> this semester ({credits} credits). Current chance: <b>{pct(sim.chanceAtLeast(needed))}</b>.
              </>
            )}
          </p>
        )}
        {target === null && <p className="muted small">Setting this switches the target on the main page to CGPA.</p>}
      </Card>
    </div>
  );
}
