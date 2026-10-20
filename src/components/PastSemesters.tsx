import { newPastSemester } from '../lib/factory';
import { cgpaWith, pastTotals, requiredSgpaForCgpa, type Simulation } from '../lib/predict';
import type { AppState, PastSemester } from '../lib/types';
import { ChanceBadge } from './Overview';
import { Card, Icon, NumberField, fmt } from './ui';

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
      <Card className="summary">
        <div className="cgpa-stats">
          <div>
            <div className="eyebrow">CGPA right now</div>
            <div className="hero">{past.cgpa === null ? '–' : fmt(past.cgpa, 2)}</div>
            {past.cgpa === null && <div className="muted small">Add your past results below</div>}
          </div>
          <div>
            <div className="eyebrow">After this semester</div>
            <div className="hero accent">{credits ? fmt(cgpaWith(state.pastSemesters, median, credits), 2) : '–'}</div>
            <div className="muted small">if you get the expected SGPA of {fmt(median, 2)}</div>
          </div>
        </div>
      </Card>

      <Card>
        <h3>Your past semester results</h3>
        <p className="muted small">
          Copy the SGPA and credits from each result on CUIMS. In 1st year, each semester is usually 21 to 23 credits. Don't count “Qualified” subjects.
        </p>
        {state.pastSemesters.length === 0 && <p className="muted">In your 1st semester? You don't have any yet, and that's fine.</p>}
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
          <Icon name="plus" /> Add a past semester
        </button>
      </Card>

      {past.credits > 0 && (
        <Card>
          <h3>Aiming for a CGPA?</h3>
          <div className="goal-row">
            <span>I want a CGPA of</span>
            <NumberField
              className="target-input"
              value={target}
              min={0}
              max={10}
              placeholder="8.5"
              label="CGPA goal"
              onChange={(v) => v !== null && update((s) => ({ ...s, targetMode: 'cgpa', target: v }))}
            />
          </div>
          {needed !== null && credits > 0 && (
            <p>
              {needed > 10 ? (
                <>
                  That's more than one semester can add: even a perfect 10 SGPA takes you to {fmt(cgpaWith(state.pastSemesters, 10, credits), 2)}. A great
                  semester now still moves you most of the way, and the next one can finish the job.
                </>
              ) : needed <= 0 ? (
                <>You'll stay above that whatever happens this semester.</>
              ) : (
                <>
                  You need an SGPA of <b>{fmt(needed, 2)}</b> this semester. <ChanceBadge p={sim.chanceAtLeast(needed)} />
                </>
              )}
            </p>
          )}
          {target === null && <p className="muted small">Type a number and your goal on the “My Subjects” page switches to this CGPA.</p>}
          {target !== null && (
            <button type="button" className="link small" onClick={() => update((s) => ({ ...s, targetMode: 'sgpa' }))}>
              Go back to an SGPA goal
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
