import { useMemo, useState } from 'react';
import { cgpaWith, pastTotals, planAims, requiredSgpaForCgpa, simulate, subjectModel } from '../lib/predict';
import type { AppState, PastSemester } from '../lib/types';
import { Card, Collapsible, NumberField, fmt } from './ui';

export interface Goal {
  mode: 'sgpa' | 'cgpa';
  target: number | null;
}

/** The same goal in both terms: the SGPA this semester and the CGPA it leads to. */
export function bothGoals(past: PastSemester[], credits: number, goal: Goal): { sgpa: number | null; cgpa: number | null } {
  if (goal.target === null) return { sgpa: null, cgpa: null };
  if (pastTotals(past).credits <= 0 || credits <= 0) return { sgpa: goal.target, cgpa: goal.target };
  return goal.mode === 'sgpa'
    ? { sgpa: goal.target, cgpa: cgpaWith(past, goal.target, credits) }
    : { sgpa: requiredSgpaForCgpa(past, goal.target, credits), cgpa: goal.target };
}

const r2 = (n: number | null) => (n === null ? null : Number(n.toFixed(2)));

/**
 * Two linked boxes: type the SGPA you want this semester, or the CGPA you want overall, and the
 * other fills itself in. In 1st semester there's only one box, because the two are the same.
 */
export function GoalPair({ past, credits, goal, onChange, size = 'big' }: { past: PastSemester[]; credits: number; goal: Goal; onChange: (g: Goal) => void; size?: 'big' | 'small' }) {
  const hasPast = pastTotals(past).credits > 0;
  const { sgpa, cgpa } = bothGoals(past, credits, goal);
  const cls = size === 'big' ? 'big-input' : 'target-input';

  if (!hasPast) {
    return (
      <div className={`goal-pair goal-pair-${size}`}>
        <label>
          <span>SGPA (and CGPA) goal</span>
          <NumberField value={goal.target} min={0} max={10} placeholder="e.g. 8.5" className={cls} label="SGPA goal" onChange={(v) => onChange({ mode: 'sgpa', target: v })} />
        </label>
      </div>
    );
  }
  return (
    <div className={`goal-pair goal-pair-${size}`}>
      <label className={goal.mode === 'sgpa' && goal.target !== null ? 'driving' : ''}>
        <span>This semester (SGPA)</span>
        <NumberField value={r2(sgpa)} min={0} max={10} placeholder="e.g. 9.0" className={cls} label="SGPA goal for this semester" onChange={(v) => onChange({ mode: 'sgpa', target: v })} />
      </label>
      <span className="goal-arrow" aria-hidden>
        →
      </span>
      <label className={goal.mode === 'cgpa' && goal.target !== null ? 'driving' : ''}>
        <span>Overall (CGPA)</span>
        <NumberField value={r2(cgpa)} min={0} max={10} placeholder="e.g. 9.5" className={cls} label="CGPA goal" onChange={(v) => onChange({ mode: 'cgpa', target: v })} />
      </label>
      {sgpa !== null && sgpa > 10 && <span className="goal-note small">That CGPA needs more than a perfect 10 SGPA this semester. Try a smaller step.</span>}
    </div>
  );
}

/** SGPA vs CGPA in plain words, worked through with the student's own numbers. */
export function CgpaExplainer({ past, credits, sgpa, open = false }: { past: PastSemester[]; credits: number; sgpa: number | null; open?: boolean }) {
  const t = pastTotals(past);
  const example = sgpa ?? 8;
  return (
    <Collapsible title="What's the difference between SGPA and CGPA?" defaultOpen={open}>
      <ul className="explain">
        <li>
          <b>SGPA</b> is your score for <b>one semester</b>, out of 10.
        </li>
        <li>
          <b>CGPA</b> is your score for <b>all your semesters together</b>. It's the average of your SGPAs, but a semester with more credits counts more.
        </li>
      </ul>
      {t.credits > 0 && credits > 0 ? (
        <div className="formula">
          <div className="small muted">With your numbers:</div>
          <div>
            Your CGPA so far is <b>{fmt(t.cgpa!, 2)}</b> over <b>{fmt(t.credits, 1)}</b> credits. This semester has <b>{fmt(credits, 1)}</b> credits.
          </div>
          <div className="formula-line">
            ({fmt(t.cgpa!, 2)} × {fmt(t.credits, 1)} + <b>{fmt(example, 2)}</b> × {fmt(credits, 1)}) ÷ {fmt(t.credits + credits, 1)} ={' '}
            <b>{fmt(cgpaWith(past, example, credits), 2)}</b>
          </div>
          <div className="small muted">
            So an SGPA of {fmt(example, 2)} this semester makes your CGPA {fmt(cgpaWith(past, example, credits), 2)}. Your CGPA moves slowly, because the semesters
            already done count too.
          </div>
        </div>
      ) : (
        <p className="small muted">In your first semester there's nothing to average yet, so your CGPA is the same as your SGPA.</p>
      )}
    </Collapsible>
  );
}

/**
 * Asks for the goal before showing any results, as both an SGPA (this semester) and a CGPA (overall),
 * with where the student is heading and the most they can reach, so the goal is ambitious but real.
 */
export function GoalStep({ state, update }: { state: AppState; update: (fn: (s: AppState) => AppState) => void }) {
  const past = pastTotals(state.pastSemesters);
  const hasPast = past.credits > 0;
  const { pace, best, credits } = useMemo(() => {
    const models = state.subjects.map((s) => subjectModel(s, state.settings.uncertainty));
    const sim = simulate(models, 1500);
    const max = planAims(models, 11, false).maxSgpa;
    return { pace: sim.quantile(0.5), best: max, credits: sim.credits };
  }, [state.subjects, state.settings.uncertainty]);

  const toCgpa = (sgpa: number) => (hasPast ? cgpaWith(state.pastSemesters, sgpa, credits) : sgpa);
  // Rounded down to .05 so "the most you can reach" really is reachable.
  const bestSgpa = Math.floor(best * 20) / 20;
  const bestCgpa = Math.floor(toCgpa(best) * 20) / 20;
  // Quick picks, in CGPA terms: from where they are now up to the most they can reach.
  const floor = Math.floor(Math.min(toCgpa(pace), past.cgpa ?? toCgpa(pace)) * 2) / 2;
  const options = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5].filter((g) => g <= bestCgpa + 1e-9 && g >= floor);
  const [goal, setGoal] = useState<Goal>({ mode: hasPast ? 'cgpa' : 'sgpa', target: null });
  const both = bothGoals(state.pastSemesters, credits, goal);
  const pick = (g: number) => setGoal({ mode: hasPast ? 'cgpa' : 'sgpa', target: g });
  const picked = (g: number) => goal.target !== null && Math.abs((hasPast ? both.cgpa! : both.sgpa!) - g) < 0.005;

  return (
    <Card className="goal-step">
      <div className="step-label">Last step</div>
      <h2>What are you aiming for?</h2>
      <p className="muted">
        {hasPast ? (
          <>
            Your CGPA now is <b>{fmt(past.cgpa!, 2)}</b>. Type the SGPA you want this semester, or the CGPA you want overall. We'll fill in the other one.
          </>
        ) : (
          <>Pick the SGPA you want this semester. In your first semester, your CGPA will be the same.</>
        )}
      </p>

      {credits > 0 && (
        <div className="goal-context">
          <div>
            <span className="small muted">At your current pace</span>
            <b>{fmt(hasPast ? toCgpa(pace) : pace, 2)}</b>
            {hasPast && <span className="small muted">CGPA, from an SGPA of about {fmt(pace, 2)}</span>}
          </div>
          <div>
            <span className="small muted">The most you can reach this semester</span>
            <b className="accent">{fmt(hasPast ? bestCgpa : bestSgpa, 2)}</b>
            {hasPast && <span className="small muted">CGPA, with an SGPA of {fmt(bestSgpa, 2)}</span>}
          </div>
        </div>
      )}

      <div className="goal-chips">
        {options.map((g) => (
          <button type="button" key={g} className={`goal-chip ${picked(g) ? 'on' : ''}`} onClick={() => pick(g)}>
            {g.toFixed(1)}
          </button>
        ))}
        {credits > 0 && !options.includes(hasPast ? bestCgpa : bestSgpa) && (
          <button
            type="button"
            className={`goal-chip goal-chip-top ${picked(hasPast ? bestCgpa : bestSgpa) ? 'on' : ''}`}
            onClick={() => pick(hasPast ? bestCgpa : bestSgpa)}
          >
            {fmt(hasPast ? bestCgpa : bestSgpa, 2)} <span>the highest</span>
          </button>
        )}
      </div>
      {hasPast && options.length > 0 && <p className="small muted chips-label">Quick picks are CGPA goals.</p>}

      <GoalPair past={state.pastSemesters} credits={credits} goal={goal} onChange={setGoal} />
      {both.sgpa !== null && both.sgpa <= 10 && credits > 0 && both.sgpa > bestSgpa + 0.005 && (
        <p className="small muted">
          That's a big jump for one semester. We'll plan for the most you can get now, and you can keep climbing next semester.
        </p>
      )}

      <CgpaExplainer past={state.pastSemesters} credits={credits} sgpa={both.sgpa !== null && both.sgpa <= 10 ? both.sgpa : null} open />

      <button
        type="button"
        className="btn primary big full"
        disabled={goal.target === null}
        onClick={() => update((s) => ({ ...s, targetMode: goal.mode, target: goal.target }))}
      >
        Show my plan
      </button>
    </Card>
  );
}
