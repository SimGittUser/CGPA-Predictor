import { useState } from 'react';
import { COURSE_TYPES, PASS_GRADES, typeFromCode } from '../lib/grading';
import { EXTRA_HEADS, componentFromHead, hasMarks, headsFor, newEntry } from '../lib/factory';
import { MSTS_PER_SEMESTER, withMstCount, withMstWorth, type ComponentSummary } from '../lib/internal';
import { cutoffTotal, externalNeeded, gradeAims, type AimPlan, type Simulation, type SubjectModel } from '../lib/predict';
import type { AppState, Component, CourseType, Entry, GradeLetter, Subject } from '../lib/types';
import { aimMarks, aimState, half } from './Aim';
import { AnimatedNumber, animateOut, useConfirm } from './motion';
import { ChanceBadge, basedOn } from './Overview';
import { Card, Collapsible, GradeChip, Icon, InternalBar, NumberField, Segmented, fmt, pct } from './ui';

interface Props {
  m: SubjectModel;
  sim: Simulation;
  plan: AimPlan | null;
  /** The student's goal (SGPA or CGPA), for wording. */
  goal: AppState;
  change: (fn: (s: Subject) => Subject) => void;
  remove: () => void;
  back: () => void;
}

export function SubjectDetail({ m, sim, plan, goal, change, remove, back }: Props) {
  const s = m.subject;
  const out = sim.perSubject.get(s.id);
  const [editing, setEditing] = useState(false);

  return (
    <div className="stack">
      <div className="detail-top">
        <button type="button" className="btn ghost" onClick={back}>
          <Icon name="back" /> All subjects
        </button>
      </div>

      <Card>
        <div className="detail-head">
          <GradeChip grade={s.excluded ? null : out?.mostLikely ?? null} size="lg" />
          <div className="grow">
            <h2 className="detail-title">{s.name}</h2>
            <div className="muted small">
              {fmt(s.credits, 1)} credit{s.credits === 1 ? '' : 's'} · {s.internalMax > 0 ? `${s.internalMax} internal + ${s.externalMax} final exam` : `final exam out of ${s.externalMax}`}
            </div>
          </div>
        </div>
        {s.excluded ? (
          <p className="muted">This subject is pass/fail (“Qualified”). It doesn't change your SGPA, so there's nothing to predict.</p>
        ) : (
          out &&
          (m.internal.hasData || s.internalMax === 0) && (
            <p className="detail-verdict">
              Right now you're heading for <GradeChip grade={out.mostLikely} size="sm" /> in this subject ({pct(out.dist[out.mostLikely])} chance).
            </p>
          )
        )}
      </Card>

      {!s.excluded &&
        (s.internalMax > 0 ? (
          <InternalCard m={m} change={change} editing={editing} setEditing={setEditing} />
        ) : (
          <Card>
            <h3>
              <span className="step-num">1</span> Internal marks
            </h3>
            <p className="muted">This subject has no internal marks. Your grade depends only on the final exam (out of {s.externalMax}).</p>
          </Card>
        ))}

      {!s.excluded && <PlanSection m={m} sim={sim} plan={plan} goal={goal} change={change} />}

      <SettingsCard m={m} change={change} remove={remove} editing={editing} setEditing={setEditing} />
    </div>
  );
}

// ---- 1. Internal marks ---------------------------------------------------------

function InternalCard({
  m,
  change,
  editing,
  setEditing,
}: {
  m: SubjectModel;
  change: Props['change'];
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const s = m.subject;
  const i = m.internal;
  const scale = i.weightSum ? s.internalMax / i.weightSum : 1;
  const setComponents = (fn: (cs: Component[]) => Component[]) => change((x) => ({ ...x, components: fn(x.components) }));

  return (
    <Card>
      <h3>
        <span className="step-num">1</span> Your internal marks
      </h3>
      {editing ? (
        <div className="editing-bar">
          <span>
            <b>Editing the mark boxes.</b> Rename, remove or change what each part is worth.
          </span>
          <button type="button" className="btn small primary" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      ) : (
        <p className="muted small">Type each mark as you get it. Leave a box empty if that test hasn't happened yet. It all saves by itself.</p>
      )}

      <div className="istats">
        <div>
          <span className="small muted">Your average so far</span>
          <span>
            <b>{i.hasData ? pct(i.projected / s.internalMax) : '–'}</b>
          </span>
        </div>
        <div>
          <span className="small muted">{i.hasData ? 'If you keep this up' : 'Guess until you add marks'}</span>
          <span>
            <b className="accent">
              <AnimatedNumber value={i.projected} format={(n) => fmt(n, 1)} />
            </b>{' '}
            <span className="muted">/ {s.internalMax}</span>
          </span>
        </div>
      </div>
      <InternalBar value={i.projected} max={s.internalMax} />
      {i.hasData && s.internalMode === 'components' && (
        <p className="muted small">
          Based on the {i.count} mark{i.count === 1 ? '' : 's'} you've entered. We don't assume how many more tests are coming (it changes every
          semester), except that there are always {MSTS_PER_SEMESTER} MSTs.
        </p>
      )}

      {s.internalMode === 'direct' ? (
        <div className="big-field">
          <label>Your total internal marks (out of {s.internalMax})</label>
          <NumberField
            className="big-input small-w"
            value={s.directInternal}
            min={0}
            max={s.internalMax}
            placeholder={`0–${s.internalMax}`}
            label="Total internal marks"
            onChange={(v) => change((x) => ({ ...x, directInternal: v }))}
          />
          <button type="button" className="link" onClick={() => change((x) => ({ ...x, internalMode: 'components' }))}>
            Enter my marks test by test instead
          </button>
        </div>
      ) : (
        <>
          {editing && Math.abs(i.weightSum - s.internalMax) > 0.01 && (
            <p className="note small">
              The parts add up to {fmt(i.weightSum, 1)} marks, but this subject has {s.internalMax} internal marks. They're scaled to fit, which is fine if
              you're unsure.
            </p>
          )}
          <div className="heads">
            {s.components.map((c) => (
              <Head
                key={c.id}
                c={c}
                cs={i.components.get(c.id)}
                scale={scale}
                editing={editing}
                change={(fn) => setComponents((cs) => cs.map((x) => (x.id === c.id ? fn(x) : x)))}
                remove={() => setComponents((cs) => cs.filter((x) => x.id !== c.id))}
              />
            ))}
          </div>
          {s.components.length === 0 && !editing && (
            <p className="muted">
              No mark boxes.{' '}
              <button type="button" className="link" onClick={() => change((x) => ({ ...x, components: headsFor(x.type) }))}>
                Add the standard ones
              </button>
            </p>
          )}
          {editing && (
            <div className="add-head">
              <span className="small muted">Add a part:</span>
              {EXTRA_HEADS.map((h) => (
                <button type="button" key={h.name} className="btn small" onClick={() => setComponents((cs) => [...cs, componentFromHead(h)])}>
                  <Icon name="plus" /> {h.name}
                </button>
              ))}
            </div>
          )}
          {!editing && (
            <p className="small muted">
              Only know your total internal marks?{' '}
              <button type="button" className="link" onClick={() => change((x) => ({ ...x, internalMode: 'direct' }))}>
                Type the total instead
              </button>
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function nextLabel(c: Component) {
  const last = c.entries[c.entries.length - 1];
  const m = last?.label.match(/^(.*?)(\d+)$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return last ? `${last.label} 2` : 'Test 1';
}

function Head({
  c,
  cs,
  scale,
  editing,
  change,
  remove,
}: {
  c: Component;
  cs: ComponentSummary | undefined;
  scale: number;
  editing: boolean;
  change: (fn: (c: Component) => Component) => void;
  remove: () => void;
}) {
  const ask = useConfirm();
  const set = (patch: Partial<Component>) => change((x) => ({ ...x, ...patch }));
  const setEntries = (fn: (e: Entry[]) => Entry[]) => change((x) => ({ ...x, entries: fn(x.entries) }));
  const worth = c.weight * scale;

  return (
    <div className="head">
      <div className="head-top">
        {editing ? (
          <input className="head-name-input" value={c.name} aria-label="Part name" onChange={(e) => set({ name: e.target.value })} />
        ) : (
          <h4>{c.name}</h4>
        )}
        {editing ? (
          <label className="head-worth">
            worth <NumberField value={c.weight} min={0} max={100} fallback={0} label="Worth (marks)" onChange={(v) => v !== null && set({ weight: v })} /> marks
          </label>
        ) : (
          <span className="head-worth muted small">worth {fmt(worth, 1)} marks</span>
        )}
      </div>
      {(!cs || cs.avg === null) && !editing && <div className="small muted head-avg">No marks yet</div>}
      {cs && cs.avg !== null && (
        <div className="small muted head-avg">
          Your average here: <b>{pct(cs.avg)}</b> → about {fmt(worth * cs.projectedFrac, 1)} of {fmt(worth, 1)} marks
        </div>
      )}
      <div className="boxes">
        {c.entries.map((e) => (
          <MarkBox
            key={e.id}
            e={e}
            editing={editing}
            change={(patch) => setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, ...patch } : x)))}
            remove={() => setEntries((es) => es.filter((x) => x.id !== e.id))}
          />
        ))}
        <button
          type="button"
          className="box box-add"
          onClick={() => setEntries((es) => [...es, newEntry({ label: nextLabel(c), max: es[es.length - 1]?.max ?? 10 })])}
        >
          <Icon name="plus" />
          <span>Add one more</span>
        </button>
      </div>
      {editing && (
        <div className="head-edit">
          <label>
            Only the best{' '}
            <NumberField value={c.bestOf} min={1} max={100} placeholder="all" label="Best N count" onChange={(v) => set({ bestOf: v === null ? null : Math.round(v) })} />{' '}
            count
          </label>
          <button
            type="button"
            className="btn small ghost danger"
            onClick={async (ev) => {
              const el = ev.currentTarget.closest('.head');
              if (await ask({ title: `Remove “${c.name}”?`, body: 'Its marks will be removed too.', confirmLabel: 'Remove', danger: true })) animateOut(el, remove);
            }}
          >
            <Icon name="trash" /> Remove this part
          </button>
        </div>
      )}
    </div>
  );
}

function MarkBox({ e, editing, change, remove }: { e: Entry; editing: boolean; change: (p: Partial<Entry>) => void; remove: () => void }) {
  const over = e.obtained !== null && e.obtained > e.max;
  return (
    <div className={`box ${e.obtained !== null ? 'filled' : ''} ${over ? 'bad' : ''}`}>
      {editing ? (
        <input className="box-label-input" value={e.label} aria-label="Test name" onChange={(ev) => change({ label: ev.target.value })} />
      ) : (
        <span className="box-label">{e.label}</span>
      )}
      <div className="box-row">
        <NumberField className="box-input" value={e.obtained} min={0} placeholder="–" label={`${e.label}: marks you got`} onChange={(v) => change({ obtained: v })} />
        <span className="box-of">/</span>
        <NumberField className="box-max" skipTab value={e.max} min={1} fallback={10} label={`${e.label}: out of`} onChange={(v) => v !== null && change({ max: v })} />
      </div>
      {over && <span className="box-err">More than {e.max}?</span>}
      {editing && (
        <button type="button" className="box-del" aria-label={`Remove ${e.label}`} onClick={(ev) => animateOut(ev.currentTarget.closest('.box'), remove)}>
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

// ---- 2. What to aim for -----------------------------------------------------------

/** "MST 2", "MST 1 & MST 2" */
const joinLabels = (labels: string[]) => (labels.length <= 1 ? labels[0] ?? '' : `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`);

function PlanSection({ m, sim, plan, goal, change }: { m: SubjectModel; sim: Simulation; plan: AimPlan | null; goal: AppState; change: Props['change'] }) {
  const s = m.subject;
  const out = sim.perSubject.get(s.id);
  const planned = plan?.aims.get(s.id);
  const set = (patch: Partial<Subject>) => change((x) => ({ ...x, ...patch }));
  const safeAims = gradeAims(m, true);
  const usualAims = gradeAims(m, false);
  // Same footing as the dashboard plan (it drops to normal-year cut-offs when "safe" can't reach the goal),
  // so the numbers here always match it. Without a plan, aim safe when possible.
  const wantSafe = plan ? plan.safe : goal.settings.planSafe;
  const aimFor = (g: GradeLetter) => {
    const safe = safeAims.find((a) => a.grade === g)!;
    return wantSafe && safe.p <= 1 ? { p: safe.p, safe: true } : { p: usualAims.find((a) => a.grade === g)!.p, safe: false };
  };
  const grade: GradeLetter = s.targetGrade ?? planned?.grade ?? out?.mostLikely ?? 'B';
  const a = aimFor(grade);
  const st = aimState(a.p);
  const am = aimMarks(m, a.p);
  const best = safeAims.find((x) => x.p <= 1)?.grade ?? usualAims.find((x) => x.p <= 1)?.grade;
  const mst = m.internal.mst;
  const goalText = goal.target === null ? null : goal.targetMode === 'cgpa' ? `CGPA ${fmt(goal.target, 2)}` : `SGPA ${fmt(goal.target, 2)}`;
  const max = s.externalMax;
  const extPct = Math.round(m.expectedExternal * 100);
  const what = am.msts.length ? `${joinLabels(am.msts.map((x) => x.label))} and the end-sem` : 'the end-sem';

  return (
    <Card>
      <h3>
        <span className="step-num">2</span> What to aim for
      </h3>
      <p className="muted small">
        {planned && planned.grade !== 'F' && !s.targetGrade && goalText ? (
          <>
            For your goal of {goalText}, your plan gives this subject <b>{planned.grade}</b>. Tap another grade to see what it takes.
          </>
        ) : (
          <>Which grade do you want in this subject?</>
        )}
      </p>
      <div className="grade-pick" role="radiogroup" aria-label="Grade you want">
        {PASS_GRADES.map((g) => (
          <button
            type="button"
            key={g}
            role="radio"
            aria-checked={grade === g}
            aria-label={`I want ${g}`}
            className={`grade-btn ${grade === g ? 'on' : ''}`}
            onClick={() => set({ targetGrade: g })}
          >
            <GradeChip grade={g} size="sm" />
          </button>
        ))}
      </div>
      {s.targetGrade && (
        <p className="small muted">
          📌 You picked {s.targetGrade}, so your plan works around it.{' '}
          <button type="button" className="link" onClick={() => set({ targetGrade: null })}>
            Let the plan choose
          </button>
        </p>
      )}

      <div className="answer">
        {st === 'secured' ? (
          <p className="answer-main">🎉 Your marks so far already lock in {grade}. Just pass the end-sem exam.</p>
        ) : st === 'ok' ? (
          <>
            <div className="tiles">
              {am.msts.map((x) => (
                <div className="tile" key={x.label}>
                  <span className="small muted">{x.label}</span>
                  <span key={x.aim} className="tile-num pop">
                    {x.aim} <span>/ {x.max}</span>
                  </span>
                </div>
              ))}
              {am.est && (
                <div className="tile">
                  <span className="small muted">End-sem exam</span>
                  <span key={am.est.aim} className="tile-num pop">
                    {am.est.aim} <span>/ {am.est.max}</span>
                  </span>
                </div>
              )}
            </div>
            <p className="answer-main">
              {a.safe
                ? `Score at least this in ${what} and ${grade} is yours, even if this year's cut-offs come out high.`
                : `Score this in ${what} and you'll usually get ${grade}. A little extra makes it safer.`}
            </p>
            {mst && mst.remaining > 0 && (
              <Tradeoff key={grade} m={m} total={cutoffTotal(m.cutoffs.find((c) => c.grade === grade)!, a.safe)} start={Number(am.msts[0]?.aim ?? 0)} />
            )}
          </>
        ) : (
          <p className="answer-main">
            {grade} needs more than the marks left in this subject.
            {best ? (
              <>
                {' '}
                <b>{best}</b> is still yours to take.{' '}
                <button type="button" className="btn small primary" onClick={() => set({ targetGrade: best })}>
                  Aim for {best}
                </button>
              </>
            ) : (
              ' Every mark you add still counts towards your SGPA.'
            )}
          </p>
        )}
        {out && st !== 'impossible' && (
          <div className="answer-chance">
            <span className="muted small">Where you stand for {grade}:</span> <ChanceBadge p={out.atLeast[grade]} />
          </div>
        )}
      </div>

      <Collapsible title="See every grade at once">
        <div className="table-wrap">
          <table className="grades">
            <thead>
              <tr>
                <th>Grade</th>
                {mst && mst.remaining > 0 && <th>{mst.remaining === 1 ? mst.labels[0] : `${joinLabels(mst.labels)} (each)`}</th>}
                <th>End-sem</th>
              </tr>
            </thead>
            <tbody>
              {PASS_GRADES.map((g) => {
                const x = aimFor(g);
                const xs = aimState(x.p);
                const xm = aimMarks(m, x.p);
                return (
                  <tr key={g} className={g === grade ? 'is-target' : ''} onClick={() => set({ targetGrade: g })}>
                    <td>
                      <GradeChip grade={g} size="sm" />
                    </td>
                    {xs === 'ok' ? (
                      <>
                        {xm.msts[0] && (
                          <td className="strong">
                            {xm.msts[0].aim}/{xm.msts[0].max}
                          </td>
                        )}
                        <td className="strong">{xm.est ? `${xm.est.aim}/${xm.est.max}` : '–'}</td>
                      </>
                    ) : (
                      <td colSpan={mst && mst.remaining > 0 ? 2 : 1} className="muted">
                        {xs === 'secured' ? 'Already yours' : 'Needs more than the marks left'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">Tap a row to make it your grade for this subject.</p>
      </Collapsible>

      <Collapsible title="How we worked this out">
        <p className="small">
          {m.internal.hasData ? (
            <>
              Your internal average so far is <b>{pct(m.internal.projected / s.internalMax)}</b> (from {basedOn(m)}). We assume the rest of your internals,
              like assignments and practicals, go about the same.
            </>
          ) : s.internalMax > 0 ? (
            <>You haven't entered any marks here yet, so we've assumed 80% for assignments and practicals.</>
          ) : (
            <>This subject has no internals, so it all comes down to the end-sem exam.</>
          )}
        </p>
        {mst && (
          <>
            <label className="inline-field small">
              This subject has
              <NumberField
                value={mst.total}
                min={Math.max(1, mst.done)}
                max={6}
                fallback={MSTS_PER_SEMESTER}
                label="Number of MSTs"
                onChange={(v) => v !== null && change((x) => withMstCount(x, v))}
              />
              MSTs this semester{mst.done > 0 && <>, and you've written {mst.done}</>}.
            </label>
            <label className="inline-field small">
              Together they count for
              <NumberField
                value={Number(fmt(mst.worth, 1))}
                min={0}
                max={s.internalMax}
                fallback={Number(fmt(mst.worth, 1))}
                label="Internal marks the MSTs are worth"
                onChange={(v) => v !== null && change((x) => withMstWorth(x, v))}
              />
              of your {s.internalMax} internal marks.
              <span className="muted"> Our guess. Change it if your teacher told you otherwise.</span>
            </label>
          </>
        )}
        <p className="small muted">
          “Even if the cut-offs come out high” means the marks still work in about 19 years out of 20. Grades at CU depend on how the whole class does.
        </p>
        <div className="slider-row">
          <label htmlFor={`ext-${s.id}`} className="small">
            To show where you stand, we expect you to get <b>about {fmt(m.expectedExternal * max, 1)}/{max}</b> ({extPct}%) in the end-sem.
          </label>
          <input id={`ext-${s.id}`} type="range" min={0} max={100} value={extPct} onChange={(e) => set({ expectedExternalPct: Number(e.target.value) })} />
          <div className="small muted">
            {m.expectedIsAuto ? (
              <>That's the same as your internal average. Move it if you expect to do better or worse.</>
            ) : (
              <button type="button" className="link" onClick={() => set({ expectedExternalPct: null })}>
                Go back to the automatic guess
              </button>
            )}
          </div>
        </div>
      </Collapsible>
    </Card>
  );
}

/** "If I get 15 in MST 2, what do I need in the end-sem?" */
function Tradeoff({ m, total, start }: { m: SubjectModel; total: number; start: number }) {
  const mst = m.internal.mst!;
  const [score, setScore] = useState(start);
  const need = externalNeeded(m, total, score / mst.max);
  const max = m.subject.externalMax;
  const which = mst.remaining === 1 ? mst.labels[0] : `each of ${joinLabels(mst.labels)}`;
  return (
    <div className="tradeoff">
      <label htmlFor={`try-${m.subject.id}`}>
        Try other combinations. If I get <b>{fmt(score, 1)}/{mst.max}</b> in {which}…
      </label>
      <input id={`try-${m.subject.id}`} type="range" min={0} max={mst.max} step={0.5} value={score} onChange={(e) => setScore(Number(e.target.value))} />
      <p className="tradeoff-result">
        {need <= 0 ? (
          <>…that's already enough. Just pass the end-sem. 🎉</>
        ) : need > max + 1e-9 ? (
          <>…I'd need a bit more in the MST{mst.remaining > 1 ? 's' : ''} to make it work. Slide right.</>
        ) : (
          <>
            …I need <b>{half(need)}/{max}</b> in the end-sem.
          </>
        )}
      </p>
    </div>
  );
}

// ---- Settings ------------------------------------------------------------------

const SHIFTS = [
  { value: '-8', label: 'Much harder' },
  { value: '-4', label: 'A bit harder' },
  { value: '0', label: 'Normal' },
  { value: '4', label: 'Easier' },
] as const;

function SettingsCard({
  m,
  change,
  remove,
  editing,
  setEditing,
}: {
  m: SubjectModel;
  change: Props['change'];
  remove: () => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const ask = useConfirm();
  const s = m.subject;
  const set = (patch: Partial<Subject>) => change((x) => ({ ...x, ...patch }));
  const setType = (t: CourseType) =>
    change((x) => ({
      ...x,
      type: t,
      ...(t === 'custom' ? {} : { internalMax: COURSE_TYPES[t].internal, externalMax: COURSE_TYPES[t].external }),
      // Fresh boxes for the new split, unless marks are already in.
      ...(hasMarks(x) ? {} : { components: headsFor(t) }),
    }));

  return (
    <Card className="settings">
      <Collapsible title="Subject settings">
        <p className="muted small">You usually don't need to change these.</p>
        <div className="fields">
          <label className="wide">
            <span>Subject name</span>
            <input value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            <span>Credits</span>
            <NumberField value={s.credits} min={0} max={30} fallback={1} label="Credits" onChange={(v) => v !== null && set({ credits: v })} />
          </label>
          <label>
            <span>Subject code (optional)</span>
            <input
              value={s.code}
              placeholder="25CSH-103"
              onChange={(e) => {
                const code = e.target.value.toUpperCase();
                const t = typeFromCode(code);
                if (t && t !== s.type && !hasMarks(s)) {
                  set({ code });
                  setType(t);
                } else set({ code });
              }}
            />
          </label>
          <label className="wide">
            <span>How is it marked?</span>
            <select value={s.type} onChange={(e) => setType(e.target.value as CourseType)}>
              {(Object.keys(COURSE_TYPES) as CourseType[]).map((t) => (
                <option key={t} value={t}>
                  {COURSE_TYPES[t].label}
                </option>
              ))}
            </select>
            <span className="small muted">{COURSE_TYPES[s.type].hint}</span>
          </label>
          {s.type === 'custom' && (
            <>
              <label>
                <span>Internal marks</span>
                <NumberField value={s.internalMax} min={0} max={100} fallback={0} label="Internal marks" onChange={(v) => v !== null && set({ internalMax: v })} />
              </label>
              <label>
                <span>Final exam marks</span>
                <NumberField value={s.externalMax} min={0} max={100} fallback={0} label="Final exam marks" onChange={(v) => v !== null && set({ externalMax: v })} />
              </label>
            </>
          )}
        </div>

        <div className="setting-block">
          <div className="setting-title">Is this subject hard for everyone this year?</div>
          <Segmented
            label="Subject difficulty"
            value={String(s.cutoffShift) as (typeof SHIFTS)[number]['value']}
            options={SHIFTS.map((x) => ({ ...x }))}
            onChange={(v) => set({ cutoffShift: Number(v) })}
          />
          <p className="small muted">
            Grades depend on how the whole class does. If most people score low in this subject, the marks needed for each grade go down too.
          </p>
        </div>

        <label className="check">
          <input type="checkbox" checked={s.excluded} onChange={(e) => set({ excluded: e.target.checked })} />
          <span>Pass/fail only (shows “Qualified” on the result, not counted in SGPA)</span>
        </label>

        <div className="settings-actions">
          {s.internalMax > 0 && !s.excluded && s.internalMode === 'components' && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(!editing);
                if (!editing) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              {editing ? 'Stop editing mark boxes' : 'Change the mark boxes'}
            </button>
          )}
          {s.internalMax > 0 && !s.excluded && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (
                  !hasMarks(s) ||
                  (await ask({
                    title: 'Reset the mark boxes?',
                    body: 'They go back to the standard ones, and the marks you typed in here are removed.',
                    confirmLabel: 'Reset',
                    danger: true,
                  }))
                )
                  set({ components: headsFor(s.type), internalMode: 'components', directInternal: null });
              }}
            >
              Reset mark boxes
            </button>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (await ask({ title: `Delete “${s.name}”?`, body: 'The subject and all its marks will be removed.', confirmLabel: 'Delete subject', danger: true }))
                animateOut(document.querySelector('main'), remove);
            }}
          >
            <Icon name="trash" /> Delete subject
          </button>
        </div>
      </Collapsible>
    </Card>
  );
}
