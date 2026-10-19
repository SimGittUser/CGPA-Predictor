import { useState } from 'react';
import { COURSE_TYPES, PASS_GRADES, typeFromCode } from '../lib/grading';
import { COMPONENT_PRESETS, newComponent, newEntry } from '../lib/factory';
import type { ComponentSummary } from '../lib/internal';
import { requirements, type Simulation, type SubjectModel } from '../lib/predict';
import type { Component, CourseType, Entry, GradeLetter, Subject } from '../lib/types';
import { needText } from './Overview';
import { Card, GradeChip, Icon, InternalBar, NumberField, Segmented, fmt, pct } from './ui';

interface Props {
  m: SubjectModel;
  sim: Simulation;
  change: (fn: (s: Subject) => Subject) => void;
  remove: () => void;
  back: () => void;
}

export function SubjectDetail({ m, sim, change, remove, back }: Props) {
  const s = m.subject;
  const out = sim.perSubject.get(s.id);
  const set = (patch: Partial<Subject>) => change((x) => ({ ...x, ...patch }));

  return (
    <div className="stack">
      <div className="detail-top">
        <button type="button" className="btn ghost" onClick={back}>
          <Icon name="back" /> All subjects
        </button>
        <button
          type="button"
          className="btn ghost danger"
          onClick={() => confirm(`Delete “${s.name}” and all its marks?`) && remove()}
        >
          <Icon name="trash" /> Delete
        </button>
      </div>

      <Card>
        <div className="detail-head">
          <GradeChip grade={out?.mostLikely ?? null} size="lg" dim={s.excluded} />
          <div className="grow">
            <input
              className="title-input"
              value={s.name}
              aria-label="Subject name"
              onChange={(e) => set({ name: e.target.value })}
              onFocus={(e) => s.name === 'New subject' && e.currentTarget.select()}
            />
            <div className="muted small">
              {out && !s.excluded ? <>Most likely {out.mostLikely} ({pct(out.dist[out.mostLikely])})</> : s.excluded ? 'Not counted in SGPA' : ''}
            </div>
          </div>
        </div>
        <div className="fields">
          <label>
            <span>Code</span>
            <input
              value={s.code}
              placeholder="25CSH-103"
              onChange={(e) => {
                const code = e.target.value.toUpperCase();
                const t = typeFromCode(code);
                // Only auto-set the split while it still matches the preset for the old type.
                const untouched = s.type !== 'custom';
                set(t && untouched && t !== s.type ? { code, type: t, internalMax: COURSE_TYPES[t].internal, externalMax: COURSE_TYPES[t].external } : { code });
              }}
            />
          </label>
          <label>
            <span>Credits</span>
            <NumberField value={s.credits} min={0} max={30} fallback={1} onChange={(v) => v !== null && set({ credits: v })} />
          </label>
          <label className="wide">
            <span>Evaluation split</span>
            <select
              value={s.type}
              onChange={(e) => {
                const t = e.target.value as CourseType;
                set(t === 'custom' ? { type: t } : { type: t, internalMax: COURSE_TYPES[t].internal, externalMax: COURSE_TYPES[t].external });
              }}
            >
              {(Object.keys(COURSE_TYPES) as CourseType[]).map((t) => (
                <option key={t} value={t}>
                  {COURSE_TYPES[t].label}
                </option>
              ))}
            </select>
          </label>
          {s.type === 'custom' && (
            <>
              <label>
                <span>Internal max</span>
                <NumberField value={s.internalMax} min={0} max={100} fallback={0} onChange={(v) => v !== null && set({ internalMax: v })} />
              </label>
              <label>
                <span>External max</span>
                <NumberField value={s.externalMax} min={0} max={100} fallback={0} onChange={(v) => v !== null && set({ externalMax: v })} />
              </label>
            </>
          )}
        </div>
        {s.internalMax + s.externalMax !== 100 && (
          <p className="note small">Internal + external add up to {s.internalMax + s.externalMax}. Grade cutoffs assume a total out of 100.</p>
        )}
        <label className="check">
          <input type="checkbox" checked={s.excluded} onChange={(e) => set({ excluded: e.target.checked })} />
          <span>Qualified / non-credit subject (not counted in SGPA)</span>
        </label>
      </Card>

      {s.internalMax > 0 ? <InternalSection m={m} change={change} /> : (
        <Card>
          <h3>Internal marks</h3>
          <p className="muted">This subject is graded entirely on the external exam.</p>
        </Card>
      )}

      {!s.excluded && <GradeSection m={m} sim={sim} change={change} />}
    </div>
  );
}

// ---- Internals ---------------------------------------------------------------

function InternalSection({ m, change }: { m: SubjectModel; change: Props['change'] }) {
  const s = m.subject;
  const i = m.internal;
  const [adding, setAdding] = useState(false);
  const setComponents = (fn: (cs: Component[]) => Component[]) => change((x) => ({ ...x, components: fn(x.components) }));

  return (
    <Card>
      <div className="section-row">
        <h3>Internal marks</h3>
        <Segmented
          label="How to enter internals"
          value={s.internalMode}
          options={[
            { value: 'components', label: 'Track each test' },
            { value: 'direct', label: 'I know my total' },
          ]}
          onChange={(v) => change((x) => ({ ...x, internalMode: v }))}
        />
      </div>

      <div className="istats">
        <div>
          <span className="small muted">Secured so far</span>
          <b>{fmt(i.secured, 2)}</b>
        </div>
        <div>
          <span className="small muted">{i.hasData ? 'Projected' : 'Assumed'}</span>
          <b className="accent">{fmt(i.projected, 2)}</b>
        </div>
        <div>
          <span className="small muted">Best case</span>
          <b>{fmt(i.maxPossible, 2)}</b>
        </div>
        <div>
          <span className="small muted">Out of</span>
          <b>{s.internalMax}</b>
        </div>
      </div>
      <InternalBar secured={i.secured} projected={i.projected} maxPossible={i.maxPossible} max={s.internalMax} />
      {s.internalMode === 'components' && (
        <p className="muted small">
          {Math.round(i.completion * 100)}% of internal work entered. “Projected” assumes the rest goes like your average so far; “best case” assumes full marks
          on everything left.
        </p>
      )}

      {s.internalMode === 'direct' ? (
        <label className="direct">
          <span>Internal total (out of {s.internalMax})</span>
          <NumberField
            value={s.directInternal}
            min={0}
            max={s.internalMax}
            placeholder={`0–${s.internalMax}`}
            onChange={(v) => change((x) => ({ ...x, directInternal: v }))}
          />
        </label>
      ) : (
        <>
          {s.components.length > 0 && i.weightSum !== s.internalMax && (
            <p className="note small">
              Component weights add up to {fmt(i.weightSum, 2)}, not {s.internalMax}, so they're scaled to fit. Set each weight from your course's evaluation
              scheme (CUIMS or the course handout) to get exact marks.
            </p>
          )}
          <div className="components">
            {s.components.map((c) => (
              <ComponentCard
                key={c.id}
                c={c}
                cs={i.components.get(c.id)}
                scale={i.weightSum ? s.internalMax / i.weightSum : 1}
                change={(fn) => setComponents((cs) => cs.map((x) => (x.id === c.id ? fn(x) : x)))}
                remove={() => setComponents((cs) => cs.filter((x) => x.id !== c.id))}
              />
            ))}
          </div>
          {s.components.length === 0 && (
            <p className="muted">
              Add the heads your internals are made of, e.g. MSTs, assignments, worksheets and quizzes. Each head counts for a set number of internal marks.
            </p>
          )}
          {adding ? (
            <div className="presets">
              {COMPONENT_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  className="btn small"
                  onClick={() => {
                    setComponents((cs) => [
                      ...cs,
                      newComponent({
                        name: p.name,
                        weight: p.weight,
                        expectedCount: p.expectedCount,
                        entries: [newEntry({ label: `${p.entryLabel} 1`, max: p.max })],
                      }),
                    ]);
                    setAdding(false);
                  }}
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setComponents((cs) => [...cs, newComponent({ name: 'Other', entries: [newEntry({ label: 'Entry 1' })] })]);
                  setAdding(false);
                }}
              >
                Something else
              </button>
              <button type="button" className="btn small ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Add component
            </button>
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
  return `${last?.label ?? c.name} ${c.entries.length + 1}`;
}

function ComponentCard({
  c,
  cs,
  scale,
  change,
  remove,
}: {
  c: Component;
  cs: ComponentSummary | undefined;
  scale: number;
  change: (fn: (c: Component) => Component) => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [settings, setSettings] = useState(false);
  const setEntries = (fn: (e: Entry[]) => Entry[]) => change((x) => ({ ...x, entries: fn(x.entries) }));
  const set = (patch: Partial<Component>) => change((x) => ({ ...x, ...patch }));

  return (
    <div className="comp">
      <div className="comp-head">
        <button type="button" className={`twisty ${open ? 'open' : ''}`} aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen((v) => !v)}>
          <Icon name="chev" />
        </button>
        <input className="comp-name" value={c.name} aria-label="Component name" onChange={(e) => set({ name: e.target.value })} />
        <label className="comp-weight" title="How many internal marks this head counts for">
          <NumberField value={c.weight} min={0} max={100} fallback={0} label="Weight" onChange={(v) => v !== null && set({ weight: v })} />
          <span className="small muted">marks</span>
        </label>
      </div>
      <div className="comp-sub small muted">
        <span>
          {cs && cs.avg !== null ? (
            <>
              Avg <b>{pct(cs.avg)}</b> · {cs.counted}/{cs.expected} counted · ≈ {fmt(c.weight * scale * cs.projectedFrac, 2)} of {fmt(c.weight * scale, 2)}
            </>
          ) : (
            <>No marks yet. Projected at your average from other heads</>
          )}
        </span>
        <button type="button" className="link" onClick={() => setSettings((v) => !v)}>
          {settings ? 'Hide options' : 'Options'}
        </button>
      </div>
      {settings && (
        <div className="comp-settings">
          <label>
            <span className="small">Expected in total</span>
            <NumberField
              value={c.expectedCount}
              min={1}
              max={100}
              placeholder="as entered"
              onChange={(v) => set({ expectedCount: v === null ? null : Math.round(v) })}
            />
          </label>
          <label>
            <span className="small">Only best N count</span>
            <NumberField value={c.bestOf} min={1} max={100} placeholder="all" onChange={(v) => set({ bestOf: v === null ? null : Math.round(v) })} />
          </label>
          <button type="button" className="btn small ghost danger" onClick={() => confirm(`Remove “${c.name}” and its marks?`) && remove()}>
            <Icon name="trash" /> Remove head
          </button>
          <p className="small muted full">
            Set “expected in total” (e.g. 2 MSTs, 10 worksheets) so the app knows how much is still to come and can show a best case.
          </p>
        </div>
      )}
      {open && (
        <div className="entries">
          {c.entries.length > 0 && (
            <div className="entry entry-head small muted" aria-hidden>
              <span>Assessment</span>
              <span>Scored</span>
              <span>Out of</span>
              <span>Date</span>
              <span />
            </div>
          )}
          {c.entries.map((e) => {
            const setE = (patch: Partial<Entry>) => setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));
            const over = e.obtained !== null && e.obtained > e.max;
            return (
              <div className="entry" key={e.id}>
                <input value={e.label} aria-label="Assessment name" onChange={(ev) => setE({ label: ev.target.value })} />
                <NumberField
                  className={over ? 'bad' : ''}
                  value={e.obtained}
                  min={0}
                  placeholder="–"
                  label={`${e.label} marks scored`}
                  onChange={(v) => setE({ obtained: v })}
                />
                <NumberField value={e.max} min={0.5} fallback={10} label={`${e.label} out of`} onChange={(v) => v !== null && setE({ max: v })} />
                <input type="date" value={e.date} aria-label="Date" onChange={(ev) => setE({ date: ev.target.value })} />
                <button type="button" className="icon-btn" aria-label={`Delete ${e.label}`} onClick={() => setEntries((es) => es.filter((x) => x.id !== e.id))}>
                  <Icon name="x" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const last = c.entries[c.entries.length - 1];
              setEntries((es) => [...es, newEntry({ label: nextLabel(c), max: last?.max ?? 10 })]);
            }}
          >
            <Icon name="plus" /> Add marks
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Grades & externals --------------------------------------------------------

function GradeSection({ m, sim, change }: { m: SubjectModel; sim: Simulation; change: Props['change'] }) {
  const s = m.subject;
  const out = sim.perSubject.get(s.id);
  const reqs = requirements(m);
  const set = (patch: Partial<Subject>) => change((x) => ({ ...x, ...patch }));
  const ext = Math.round(m.expectedExternal * 100);

  return (
    <Card>
      <h3>External exam &amp; grades</h3>

      <div className="slider-row">
        <label htmlFor={`ext-${s.id}`}>
          Expected external score <b>{ext}%</b>{' '}
          <span className="muted">
            ≈ {fmt((m.expectedExternal * s.externalMax), 1)}/{s.externalMax}
          </span>
        </label>
        <input
          id={`ext-${s.id}`}
          type="range"
          min={0}
          max={100}
          value={ext}
          onChange={(e) => set({ expectedExternalPct: Number(e.target.value) })}
        />
        <div className="small muted">
          {m.expectedIsAuto ? (
            <>Auto: matches your internal percentage. Past results show externals average about the same, but vary by ±12 points.</>
          ) : (
            <>
              Set by you.{' '}
              <button type="button" className="link" onClick={() => set({ expectedExternalPct: null })}>
                Reset to auto
              </button>
            </>
          )}
        </div>
      </div>

      <label className="target-grade">
        <span>Target grade</span>
        <select value={s.targetGrade ?? ''} onChange={(e) => set({ targetGrade: (e.target.value || null) as GradeLetter | null })}>
          <option value="">None</option>
          {PASS_GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>

      <div className="table-wrap">
        <table className="grades">
          <thead>
            <tr>
              <th>Grade</th>
              <th title="Estimated total out of 100 needed for this grade">Cutoff</th>
              <th title="External marks needed if the cutoff lands where it usually does">Need (typical)</th>
              <th title="External marks that clear the cutoff 95% of the time">Need (safe)</th>
              <th title="Chance of this grade or better at your expected external score">Chance</th>
            </tr>
          </thead>
          <tbody>
            {reqs.map((r) => {
              const chance = out?.atLeast[r.grade] ?? 0;
              const safe = needText(r.safeExternal, s.externalMax);
              return (
                <tr key={r.grade} className={r.grade === s.targetGrade ? 'is-target' : ''} onClick={() => set({ targetGrade: r.grade })}>
                  <td>
                    <GradeChip grade={r.grade} size="sm" />
                  </td>
                  <td>~{fmt(r.cutoff, 1)}</td>
                  <td>{needText(r.likelyExternal, s.externalMax)}</td>
                  <td className={safe === 'Out of reach' ? 'muted' : 'strong'}>{safe}</td>
                  <td>
                    <span className="chance-cell">
                      <span className="chance-bar" style={{ width: `${Math.round(chance * 100)}%` }} />
                      <span>{pct(chance)}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        External marks needed, out of {s.externalMax}, given a projected internal of {fmt(m.internal.projected, 2)}/{s.internalMax}. “Safe” clears the cutoff in 95%
        of the years we'd expect. Tap a row to make it your target.
      </p>

      <div className="slider-row">
        <label htmlFor={`shift-${s.id}`}>
          Cutoff adjustment <b>{s.cutoffShift > 0 ? '+' : ''}{s.cutoffShift}</b>
        </label>
        <input
          id={`shift-${s.id}`}
          type="range"
          min={-12}
          max={8}
          step={0.5}
          value={s.cutoffShift}
          onChange={(e) => set({ cutoffShift: Number(e.target.value) })}
        />
        <div className="small muted">
          Grading is relative. If this subject is tough and the class scores low, slide left to lower every cutoff. General Proficiency ran about 8 marks lower
          last year.
        </div>
      </div>
    </Card>
  );
}
