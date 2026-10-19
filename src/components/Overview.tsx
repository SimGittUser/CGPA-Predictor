import { useState } from 'react';
import { COURSE_TYPES } from '../lib/grading';
import { TEMPLATES, newSubject, subjectsFromTemplate } from '../lib/factory';
import { cgpaWith, pastTotals, planUniform, requirements, requiredSgpaForCgpa, type Simulation, type SubjectModel } from '../lib/predict';
import type { AppState } from '../lib/types';
import { SgpaHistogram } from './SgpaHistogram';
import { Card, GradeChip, Icon, InternalBar, NumberField, Segmented, fmt, pct } from './ui';

interface Props {
  state: AppState;
  models: SubjectModel[];
  sim: Simulation;
  update: (fn: (s: AppState) => AppState) => void;
  open: (id: string) => void;
}

export function Overview({ state, models, sim, update, open }: Props) {
  const graded = models.filter((m) => !m.subject.excluded);
  if (!state.subjects.length) return <EmptyState update={update} open={open} />;

  const credits = sim.credits;
  const past = pastTotals(state.pastSemesters);
  const targetSgpa =
    state.targetMode === 'cgpa' ? requiredSgpaForCgpa(state.pastSemesters, state.target, credits) : state.target;
  const median = sim.quantile(0.5);
  const safePlan = planUniform(graded, targetSgpa, true);
  const likelyPlan = planUniform(graded, targetSgpa, false);
  const noData = models.filter((m) => !m.internal.hasData && m.subject.internalMax > 0 && m.subject.expectedExternalPct === null).length;

  return (
    <div className="stack">
      <Card className="summary">
        <div className="summary-top">
          <div>
            <div className="eyebrow">Predicted SGPA</div>
            <div className="hero">{credits ? fmt(median, 2) : '–'}</div>
            <div className="muted small">
              Likely between <b>{fmt(sim.quantile(0.1), 2)}</b> and <b>{fmt(sim.quantile(0.9), 2)}</b> · {credits} credits
            </div>
            {past.cgpa !== null && (
              <div className="muted small">
                CGPA after this semester ≈ <b>{fmt(cgpaWith(state.pastSemesters, median, credits), 2)}</b> (now {fmt(past.cgpa, 2)})
              </div>
            )}
          </div>
          <div className="target">
            <div className="target-row">
              <Segmented
                label="Target type"
                value={state.targetMode}
                options={[
                  { value: 'sgpa', label: 'SGPA' },
                  { value: 'cgpa', label: 'CGPA' },
                ]}
                onChange={(v) => update((s) => ({ ...s, targetMode: v }))}
              />
              <NumberField
                label="Target"
                className="target-input"
                value={state.target}
                min={0}
                max={10}
                fallback={8}
                onChange={(v) => v !== null && update((s) => ({ ...s, target: v }))}
              />
            </div>
            {state.targetMode === 'cgpa' && (
              <div className="muted small">
                {past.credits ? (
                  <>Needs SGPA <b>{fmt(targetSgpa, 2)}</b> this semester</>
                ) : (
                  <>Add past semesters in the CGPA tab</>
                )}
              </div>
            )}
            <div className="chance">
              <span className="chance-num">{targetSgpa > 10 ? '0%' : pct(sim.chanceAtLeast(targetSgpa))}</span>
              <span className="muted small">chance of reaching it</span>
            </div>
          </div>
        </div>

        <SgpaHistogram sgpa={sim.sgpa} target={targetSgpa <= 10 ? targetSgpa : null} />

        <div className="plan">
          {safePlan.x === null && likelyPlan.x !== null ? (
            <p>
              <span className="plan-num">{Math.ceil(likelyPlan.x * 100)}%</span> in every external reaches <b>{fmt(targetSgpa, 2)}</b> if cutoffs land
              where they usually do. No score guarantees it with {noData ? 'the internals assumed so far' : 'your current internals'}.
            </p>
          ) : safePlan.x === null ? (
            <p>
              <b>{fmt(targetSgpa, 2)}</b> isn't reachable with {noData ? 'the internals assumed so far' : 'your current internals'}, even with full marks in every
              external. The best
              you can count on is <b>{fmt(safePlan.maxSgpa, 2)}</b> (or {fmt(likelyPlan.maxSgpa, 2)} if cutoffs land where they usually do).
            </p>
          ) : (
            <>
              <p>
                <span className="plan-num">{Math.ceil(safePlan.x * 100)}%</span> in every external gets you to{' '}
                <b>{fmt(targetSgpa, 2)}</b>, even if cutoffs come out on the high side.
              </p>
              {likelyPlan.x !== null && likelyPlan.x < safePlan.x - 0.005 && (
                <p className="muted small">
                  At typical cutoffs, {Math.ceil(likelyPlan.x * 100)}% should be enough.
                </p>
              )}
              <div className="plan-grades">
                {graded.map((m) => (
                  <span key={m.subject.id} className="plan-grade" title={m.subject.name}>
                    <GradeChip grade={safePlan.grades.get(m.subject.id) ?? null} size="sm" />
                    <span className="small">{shortName(m.subject.name)}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        {noData > 0 && (
          <p className="note small">
            {noData} subject{noData > 1 ? 's have' : ' has'} no marks yet, so they're assumed at 80% in internals and externals.
          </p>
        )}
      </Card>

      <div className="section-head">
        <h2>Subjects</h2>
        <span className="muted small">Tap a subject to enter marks</span>
      </div>
      <ul className="subject-list">
        {models.map((m) => (
          <SubjectRow key={m.subject.id} m={m} sim={sim} onOpen={() => open(m.subject.id)} />
        ))}
      </ul>
      <AddSubjectBar update={update} open={open} />
    </div>
  );
}

function shortName(name: string) {
  const words = name.replace(/[,&-]/g, ' ').split(/\s+/).filter(Boolean);
  if (name.length <= 14) return name;
  return words
    .filter((w) => !/^(and|of|for|the)$/i.test(w))
    .map((w) => (/^[IVX]+$/.test(w) || /^\d+$/.test(w) ? w : w[0].toUpperCase()))
    .join('');
}

function SubjectRow({ m, sim, onOpen }: { m: SubjectModel; sim: Simulation; onOpen: () => void }) {
  const s = m.subject;
  const out = sim.perSubject.get(s.id);
  const target = s.targetGrade;
  const req = target ? requirements(m).find((r) => r.grade === target) : null;
  const i = m.internal;
  return (
    <li>
      <button type="button" className="subject-row" onClick={onOpen}>
        <GradeChip grade={out?.mostLikely ?? null} dim={s.excluded} />
        <div className="subject-main">
          <div className="subject-name">{s.name}</div>
          <div className="subject-meta">
            <span>{fmt(s.credits, 1)} cr</span>
            <span>
              {s.internalMax}/{s.externalMax}
            </span>
            {s.excluded ? (
              <span>Not in SGPA</span>
            ) : out ? (
              <span>{pct(out.dist[out.mostLikely])} likely</span>
            ) : null}
          </div>
          {s.internalMax > 0 && (
            <div className="subject-internal">
              {i.hasData && <InternalBar secured={i.secured} projected={i.projected} maxPossible={i.maxPossible} max={s.internalMax} />}
              <span className="small muted">
                {i.hasData ? (
                  <>
                    Internal ≈ <b>{fmt(i.projected, 1)}</b>/{s.internalMax}
                    {i.completion < 0.999 && <> · {Math.round(i.completion * 100)}% entered</>}
                  </>
                ) : (
                  <>No internal marks yet</>
                )}
              </span>
            </div>
          )}
        </div>
        <div className="subject-side">
          {target && req && out ? (
            <>
              {req.safeExternal <= s.externalMax || req.likelyExternal > s.externalMax ? (
                <>
                  <div className="small muted">For {target}, need</div>
                  <div className="side-need">{needText(req.safeExternal, s.externalMax)}</div>
                </>
              ) : (
                <>
                  <div className="small muted">For {target}, typically</div>
                  <div className="side-need">{needText(req.likelyExternal, s.externalMax)}</div>
                </>
              )}
              <div className="small muted">{pct(out.atLeast[target])} chance</div>
            </>
          ) : (
            <span className="small muted side-hint">{s.excluded ? '' : 'Set a target'}</span>
          )}
          <Icon name="chev" />
        </div>
      </button>
    </li>
  );
}

export function needText(need: number, max: number) {
  if (need <= 0) return 'Secured';
  if (need > max + 1e-9) return 'Out of reach';
  return `${fmt(Math.ceil(need * 4) / 4, 2)}/${max}`;
}

function AddSubjectBar({ update, open }: { update: Props['update']; open: Props['open'] }) {
  const [showTemplates, setShowTemplates] = useState(false);
  return (
    <div className="add-bar">
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          const s = newSubject();
          update((st) => ({ ...st, subjects: [...st.subjects, s] }));
          open(s.id);
        }}
      >
        <Icon name="plus" /> Add subject
      </button>
      <button type="button" className="btn" onClick={() => setShowTemplates((v) => !v)}>
        Add from a template
      </button>
      {showTemplates && <TemplateList update={update} onDone={() => setShowTemplates(false)} />}
    </div>
  );
}

function TemplateList({ update, onDone }: { update: Props['update']; onDone: () => void }) {
  return (
    <div className="templates">
      {TEMPLATES.map((t) => (
        <button
          type="button"
          key={t.name}
          className="template"
          onClick={() => {
            update((s) => ({ ...s, subjects: [...s.subjects, ...subjectsFromTemplate(t)] }));
            onDone();
          }}
        >
          <b>{t.name}</b>
          <span className="small muted">{t.subjects.map((x) => shortName(x.name)).join(' · ')}</span>
          <span className="small muted">{t.description}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ update, open }: { update: Props['update']; open: Props['open'] }) {
  return (
    <div className="stack">
      <Card className="empty">
        <h2>Predict your grades before results day</h2>
        <p className="muted">
          Enter your internal marks as they come in: MSTs, assignments, worksheets, quizzes. The app works out your internal total,
          the chance of each grade, and the minimum external score you need for the grade you want.
        </p>
        <ol className="steps muted">
          <li>Add your subjects with credits and their internal/external split ({COURSE_TYPES.hybrid.label}, {COURSE_TYPES.practical.label}…).</li>
          <li>Add each assessment head and its marks. Add more marks every week and edit old ones any time.</li>
          <li>Set a target SGPA or CGPA and see what you need in the externals.</li>
        </ol>
        <p className="muted small">Everything is saved automatically in this browser.</p>
      </Card>
      <AddSubjectBar update={update} open={open} />
    </div>
  );
}
