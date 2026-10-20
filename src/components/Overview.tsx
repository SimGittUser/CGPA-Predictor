import type { ReactNode } from 'react';
import { cgpaWith, pastTotals, type AimPlan, type Simulation, type SubjectModel } from '../lib/predict';
import type { AppState } from '../lib/types';
import { AimLine } from './Aim';
import { AnimatedNumber } from './motion';

const f2 = (n: number) => n.toFixed(2);
import { CgpaExplainer, GoalPair } from './Goal';
import { SgpaHistogram } from './SgpaHistogram';
import { Card, GradeChip, InternalBar, Icon, Segmented, chanceWord, fmt, pct } from './ui';

interface Props {
  state: AppState;
  models: SubjectModel[];
  sim: Simulation;
  plan: AimPlan;
  targetSgpa: number;
  update: (fn: (s: AppState) => AppState) => void;
  open: (id: string) => void;
}

export function ChanceBadge({ p }: { p: number }) {
  const c = chanceWord(p);
  return (
    <span key={c.word} className={`badge pop tone-${c.tone}`}>
      {c.word}
      {c.showPct && <> · {pct(p)} chance</>}
    </span>
  );
}

/** "MST 1: 14/20, Practical 1: 28/30" — what the prediction is based on. */
export function basedOn(m: SubjectModel, limit = 3): string {
  const filled = m.subject.components.flatMap((c) => c.entries.filter((e) => e.obtained !== null));
  const shown = filled.slice(0, limit).map((e) => `${e.label} ${fmt(e.obtained!, 2)}/${e.max}`);
  return shown.join(', ') + (filled.length > limit ? ` +${filled.length - limit} more` : '');
}

const showCgpaGoal = (state: AppState) => state.targetMode === 'cgpa' && pastTotals(state.pastSemesters).credits > 0;

export function Overview({ state, models, sim, plan, targetSgpa, update, open }: Props) {
  if (!state.subjects.length) {
    return (
      <div className="stack">
        <Card className="empty">
          <h2>No subjects yet</h2>
          <p className="muted">Upload a screenshot of your marks from CUIMS and we'll set everything up, or add subjects one by one.</p>
          <div className="empty-actions">
            <a className="btn primary big" href="#/import">
              📷 Upload a screenshot
            </a>
            <a className="btn big" href="#/add">
              <Icon name="plus" /> Add a subject by hand
            </a>
          </div>
        </Card>
      </div>
    );
  }

  const graded = models.filter((m) => !m.subject.excluded);
  const credits = sim.credits;
  const past = pastTotals(state.pastSemesters);
  const median = sim.quantile(0.5);
  const anyMarks = models.some((m) => m.internal.hasData);
  const cgpaAt = (sgpa: number) => cgpaWith(state.pastSemesters, sgpa, credits);

  return (
    <div className="stack">
      <a className="upload-bar" href="#/import">
        <span className="upload-bar-icon" aria-hidden>
          📷
        </span>
        <span>
          <b>{anyMarks ? 'Got new marks?' : 'Add your marks the quick way'}</b>
          <span className="small muted">Upload a screenshot from CUIMS and we'll fill them in</span>
        </span>
        <Icon name="chev" />
      </a>

      <Card className="summary">
        <div className="summary-top">
          <div>
            <div className="eyebrow">{anyMarks ? 'Your expected SGPA' : 'Your expected SGPA (rough guess)'}</div>
            <div className="hero">{credits ? <AnimatedNumber value={median} format={f2} /> : '–'}</div>
            <div className="muted">
              Most likely between <b>{fmt(sim.quantile(0.1), 2)}</b> and <b>{fmt(sim.quantile(0.9), 2)}</b>
            </div>
            {past.cgpa !== null && (
              <div className="muted">
                CGPA {fmt(past.cgpa, 2)} → about{' '}
                <b>
                  <AnimatedNumber value={cgpaAt(median)} format={f2} />
                </b>
              </div>
            )}
          </div>
          <div className="goal">
            <span className="goal-label">My goal</span>
            <GoalPair
              size="small"
              past={state.pastSemesters}
              credits={credits}
              goal={{ mode: state.targetMode, target: state.target }}
              onChange={(g) => g.target !== null && update((s) => ({ ...s, targetMode: g.mode, target: g.target }))}
            />
            <ChanceBadge p={targetSgpa > 10 ? 0 : sim.chanceAtLeast(targetSgpa)} />
            <span className="small muted">
              {targetSgpa <= 10 && sim.chanceAtLeast(targetSgpa) >= 0.35 ? 'if you keep scoring like you have' : 'Your plan below shows how to get there'}
            </span>
          </div>
        </div>
        <CgpaExplainer past={state.pastSemesters} credits={credits} sgpa={targetSgpa <= 10 ? targetSgpa : null} />
      </Card>

      <PlanCard state={state} graded={graded} plan={plan} targetSgpa={targetSgpa} credits={credits} open={open} update={update} />

      <div className="insights">
        <Card className="insight">
          <h3>Your CGPA</h3>
          {past.cgpa !== null ? (
            <>
              <div className="cgpa-flow">
                <div>
                  <span className="small muted">Now</span>
                  <b>{fmt(past.cgpa, 2)}</b>
                </div>
                <span className="cgpa-arrow" aria-hidden>
                  →
                </span>
                <div>
                  <span className="small muted">After this semester</span>
                  <b className={cgpaAt(median) >= past.cgpa ? 'up' : ''}>
                    <AnimatedNumber value={cgpaAt(median)} format={f2} />
                  </b>
                </div>
              </div>
              <p className="small muted">
                Most likely between {fmt(cgpaAt(sim.quantile(0.1)), 2)} and {fmt(cgpaAt(sim.quantile(0.9)), 2)}, if you keep scoring like you have.
              </p>
            </>
          ) : (
            <p className="muted">
              Add your CGPA so far to plan for a CGPA goal.{' '}
              <a className="link" href="#/cgpa">
                Add it
              </a>
            </p>
          )}
        </Card>

        <Card className="insight">
          <h3>What your SGPA could be</h3>
          <SgpaHistogram sgpa={sim.sgpa} target={targetSgpa <= 10 ? targetSgpa : null} />
        </Card>
      </div>

      <div className="section-head">
        <h2>Subject by subject</h2>
        <span className="muted small">Tap one to see or change marks</span>
      </div>
      <ul className="subject-list">
        {models.map((m) => (
          <SubjectRow key={m.subject.id} m={m} sim={sim} onOpen={() => open(m.subject.id)} />
        ))}
      </ul>
      <a className="btn" href="#/add">
        <Icon name="plus" /> Add a subject by hand
      </a>
    </div>
  );
}

// ---- The plan: what to aim for in the next MST and the end-sem ------------------------

function PlanCard({
  state,
  graded,
  plan,
  targetSgpa,
  credits,
  open,
  update,
}: {
  state: AppState;
  graded: SubjectModel[];
  plan: AimPlan;
  targetSgpa: number;
  credits: number;
  open: (id: string) => void;
  update: Props['update'];
}) {
  const hasPast = pastTotals(state.pastSemesters).credits > 0;
  const goalCgpa = hasPast ? cgpaWith(state.pastSemesters, targetSgpa, credits) : targetSgpa;
  // Name the goal both ways: what this semester needs and where it takes the CGPA.
  const goal = !hasPast
    ? `an SGPA of ${fmt(targetSgpa, 2)}`
    : targetSgpa > 10
      ? `a CGPA of ${fmt(state.target ?? 0, 2)}`
      : `SGPA ${fmt(targetSgpa, 2)} (CGPA ${fmt(goalCgpa, 2)})`;
  // The most this semester can give, in the same terms as the goal (rounded down so it's really reachable).
  const bestGoal = Math.floor((showCgpaGoal(state) ? cgpaWith(state.pastSemesters, plan.maxSgpa, credits) : plan.maxSgpa) * 20) / 20;
  const Goal = goal[0].toUpperCase() + goal.slice(1);
  const anyMst = graded.some((m) => (m.internal.mst?.remaining ?? 0) > 0);
  const guessed = graded.filter((m) => m.subject.internalMax > 0 && !m.internal.hasData).length;
  const cgpaOf = (sgpa: number) => cgpaWith(state.pastSemesters, sgpa, credits);
  const showCgpa = hasPast;

  let intro: ReactNode;
  if (plan.level === null) {
    intro = (
      <>
        <p className="plan-line">
          {Goal} is a bigger jump than one semester can give, so let's make this one count.{' '}
          <mark className="highlight">
            The most you can reach now is <b>SGPA {fmt(Math.floor(plan.maxSgpa * 20) / 20, 2)}</b>
            {hasPast && (
              <>
                {' '}
                (CGPA <b>{fmt(Math.floor(cgpaWith(state.pastSemesters, plan.maxSgpa, credits) * 20) / 20, 2)}</b>)
              </>
            )}
          </mark>
          , and every semester after this can take you further. Here's how to get the most out of this one:
        </p>
        <button type="button" className="btn primary" onClick={() => update((s) => ({ ...s, target: bestGoal }))}>
          Make {fmt(bestGoal, 2)} my goal for now
        </button>
      </>
    );
  } else if (plan.level <= 0) {
    intro = <p className="plan-line">🎉 Your marks so far already put {goal} in the bag. Just pass what's left.</p>;
  } else {
    intro = (
      <p className="plan-line">
        Score at least these{anyMst ? ' in your next MST and the end-sem exam' : ' in your end-sem exams'}
        {plan.safe
          ? ', and you’ll get there even if this year’s grade cut-offs come out high.'
          : state.settings.planSafe
            ? '. These work when the grade cut-offs land where they usually do, so a few extra marks make it safer.'
            : '. That’s usually enough. A few extra marks make it safer.'}
      </p>
    );
  }

  return (
    <Card className="plan-card">
      <div className="plan-head">
        <h3>🎯 Your plan for {goal}</h3>
        <Segmented
          label="How careful should the plan be"
          value={state.settings.planSafe ? 'safe' : 'usual'}
          options={[
            { value: 'safe', label: 'To be safe' },
            { value: 'usual', label: 'Usually enough' },
          ]}
          onChange={(v) => update((s) => ({ ...s, settings: { ...s.settings, planSafe: v === 'safe' } }))}
        />
      </div>
      {intro}
      {(
        <ul className="plan-list">
          {graded.map((m) => {
            const aim = plan.aims.get(m.subject.id);
            if (!aim) return null;
            return (
              <li key={m.subject.id}>
                <button type="button" className="plan-row" onClick={() => open(m.subject.id)}>
                  <GradeChip grade={aim.grade} size="sm" />
                  <span className="plan-row-main">
                    <span className="plan-row-name">
                      {m.subject.name}
                      {aim.pinned && <span className="pin" title="You picked this grade"> 📌</span>}
                    </span>
                    <AimLine m={m} p={aim.p} />
                    {!m.internal.hasData && m.subject.internalMax > 0 && <span className="small muted">No marks yet, so this is a guess</span>}
                  </span>
                  <Icon name="chev" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {plan.level !== null && plan.level > 0 && (
        <p className="small muted plan-foot">
          These grades add up to SGPA{' '}
          <b key={plan.sgpa} className="pop">
            {fmt(plan.sgpa, 2)}
          </b>
          {showCgpa && <> → CGPA <b>{fmt(cgpaOf(plan.sgpa), 2)}</b></>}. We assume the rest of your internals (practicals, assignments) go like they have so
          far.{guessed > 0 && ` ${guessed} subject${guessed > 1 ? 's have' : ' has'} no marks yet, so we guessed 80% there.`} Tap a subject to try other
          combinations.
        </p>
      )}
    </Card>
  );
}

function SubjectRow({ m, sim, onOpen }: { m: SubjectModel; sim: Simulation; onOpen: () => void }) {
  const s = m.subject;
  const out = sim.perSubject.get(s.id);

  let status: ReactNode;
  if (s.excluded) status = <>Pass/fail only. Doesn't affect SGPA</>;
  else if (s.internalMax === 0) status = <>Final exam only</>;
  else if (!m.internal.hasData) status = <span className="accent">No marks yet. Tap to add →</span>;
  else if (s.internalMode === 'direct') status = <>Internal total {fmt(m.internal.projected, 1)}/{s.internalMax}</>;
  else
    status = (
      <>
        Internal ≈ {fmt(m.internal.projected, 1)}/{s.internalMax} · from {m.internal.count} mark{m.internal.count === 1 ? '' : 's'} ({basedOn(m, 2)})
      </>
    );

  return (
    <li>
      <button type="button" className="subject-row" onClick={onOpen}>
        <GradeChip grade={s.excluded ? null : out?.mostLikely ?? null} />
        <div className="subject-main">
          <div className="subject-name">{s.name}</div>
          <div className="subject-meta">
            {!s.excluded && out && (m.internal.hasData || s.internalMax === 0) && (
              <span>
                Likely <b>{out.mostLikely}</b>
              </span>
            )}
            <span>
              {fmt(s.credits, 1)} credit{s.credits === 1 ? '' : 's'}
            </span>
          </div>
          {m.internal.hasData && s.internalMax > 0 && !s.excluded && (
            <div className="row-bar">
              <InternalBar value={m.internal.projected} max={s.internalMax} />
            </div>
          )}
          <div className="subject-status small muted">{status}</div>
        </div>
        <Icon name="chev" />
      </button>
    </li>
  );
}
