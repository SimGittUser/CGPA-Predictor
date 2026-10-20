import { describe, expect, it } from 'vitest';
import { CALIBRATION, KNOWN_SHIFTS, cutoffsFor, gradeForTotal, sgpaFrom, typeFromCode } from './grading';
import { COURSE_TYPES } from './grading';
import { INTERNAL_TEMPLATES, TEMPLATES, newComponent, newEntry, newSubject, subjectsFromTemplate } from './factory';
import { summarizeInternal, withMstCount, withMstWorth } from './internal';
import { SAFE_Z, choosePlan, effortFor, externalNeeded, planAims, requiredSgpaForCgpa, simulate, subjectModel } from './predict';

const sem = (student: 1 | 2 | 3, s: 1 | 2) => CALIBRATION.filter((r) => r.student === student && r.sem === s);

describe('SGPA matches the result sheets', () => {
  it.each([
    [1, 1, 7.86],
    [1, 2, 8.35],
    [2, 1, 8.0],
    [2, 2, 7.91],
    [3, 1, 9.67],
    [3, 2, 9.43],
  ] as const)('student %i sem %i → %d', (st, s, expected) => {
    expect(sgpaFrom(sem(st, s)).toFixed(2)).toBe(expected.toFixed(2));
  });
});

describe('default cutoffs vs real grades', () => {
  it('reproduce most of the observed grades', () => {
    const rows = CALIBRATION.filter((r) => r.grade !== 'Qualified');
    const hits = rows.filter((r) => gradeForTotal(r.internal + r.external, cutoffsFor(KNOWN_SHIFTS[r.code] ?? 0)) === r.grade);
    // Relative grading means some subjects will disagree; the centres should still fit most.
    expect(hits.length / rows.length).toBeGreaterThan(0.75);
  });

  it('are never more than one grade off', () => {
    const order = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
    for (const r of CALIBRATION) {
      if (r.grade === 'Qualified') continue;
      const g = gradeForTotal(r.internal + r.external, cutoffsFor(KNOWN_SHIFTS[r.code] ?? 0));
      expect(Math.abs(order.indexOf(g) - order.indexOf(r.grade)), `${r.name} ${r.internal + r.external}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('course codes', () => {
  it('map to splits', () => {
    expect(typeFromCode('25CSH-103')).toBe('hybrid');
    expect(typeFromCode('25PCP-111')).toBe('practical');
    expect(typeFromCode('25SMT-198')).toBe('theory');
    expect(typeFromCode('25GPT-121')).toBe('external');
  });
});

describe('templates', () => {
  it('internal heads add up to each split', () => {
    for (const t of ['hybrid', 'practical', 'theory'] as const) {
      expect(INTERNAL_TEMPLATES[t].reduce((a, h) => a + h.weight, 0)).toBe(COURSE_TYPES[t].internal);
    }
  });

  it('semester templates match the result sheets’ credits', () => {
    const graded = (id: string) =>
      subjectsFromTemplate(TEMPLATES.find((t) => t.id === id)!)
        .filter((s) => !s.excluded)
        .reduce((a, s) => a + s.credits, 0);
    expect(graded('s1-bio')).toBe(21);
    expect(graded('s1-phy')).toBe(21);
    expect(graded('s2-phy')).toBe(23);
    expect(graded('s2-bio')).toBe(23);
  });

  it('new subjects come with empty mark boxes', () => {
    const s = newSubject({ code: '25CSH-103', name: 'DSA', credits: 4 });
    expect(s.internalMax).toBe(75);
    expect(s.components.length).toBeGreaterThan(0);
    expect(s.components.every((c) => c.entries.every((e) => e.obtained === null))).toBe(true);
    expect(summarizeInternal(s).hasData).toBe(false);
  });
});

describe('internal marks', () => {
  it('only counts marks that were entered; empty boxes are just places to type', () => {
    const s = newSubject({
      type: 'theory',
      internalMax: 50,
      components: [newComponent({ weight: 50, entries: [newEntry({ obtained: 18, max: 20 }), newEntry({ max: 20 })] })],
    });
    const i = summarizeInternal(s);
    expect(i.projected).toBeCloseTo(45);
    expect(i.count).toBe(1);
  });

  it('knows there are two MSTs and what the next one is worth', () => {
    // Maths: 14/20 in MST-1. MSTs assumed worth 25 of the 50 internal marks.
    const maths = newSubject({ type: 'theory', credits: 5 });
    maths.components[0].entries[0].obtained = 14;
    const i = summarizeInternal(maths);
    expect(i.projected).toBeCloseTo(35); // 70% everywhere
    expect(i.mst).toMatchObject({ remaining: 1, max: 20, worth: 25 });
    expect(i.mst!.base).toBeCloseTo(26.25); // MST-2 = 0
    expect(i.mst!.slope).toBeCloseTo(12.5); // MST-2 is worth 12.5 internal marks
  });

  it('lets the student say how much MSTs are worth', () => {
    const s = withMstWorth(newSubject({ type: 'theory' }), 30);
    expect(s.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(50);
    expect(s.components[0].weight).toBe(30);
  });

  it('projects unfinished heads at the running average', () => {
    const s = newSubject({
      type: 'hybrid',
      internalMax: 75,
      components: [
        newComponent({ weight: 50, expectedCount: 2, entries: [newEntry({ obtained: 16, max: 20 })] }), // 80%, 1 of 2
        newComponent({ weight: 25, entries: [newEntry({ obtained: 9, max: 10 }), newEntry({ obtained: 7, max: 10 })] }), // 80%
      ],
    });
    expect(summarizeInternal(s).projected).toBeCloseTo(60);
  });

  it('scales weights that do not add up to the internal max', () => {
    const s = newSubject({
      internalMax: 60,
      type: 'practical',
      components: [newComponent({ weight: 10, entries: [newEntry({ obtained: 5, max: 10 })] })],
    });
    expect(summarizeInternal(s).projected).toBeCloseTo(30);
  });

  it('counts only the best N', () => {
    const s = newSubject({
      internalMax: 50,
      type: 'theory',
      components: [
        newComponent({ weight: 50, bestOf: 2, entries: [4, 10, 8].map((o) => newEntry({ obtained: o, max: 10 })) }),
      ],
    });
    expect(summarizeInternal(s).projected).toBeCloseTo(45);
  });
});

describe('predictions', () => {
  const strong = newSubject({ type: 'hybrid', credits: 4, internalMode: 'direct', directInternal: 70, expectedExternalPct: 80 });
  const m = subjectModel(strong, 'medium');

  it('gives sensible grade odds', () => {
    // 70 + 20 = 90 expected → mostly A territory
    const sim = simulate([m]);
    const o = sim.perSubject.get(strong.id)!;
    expect(o.atLeast['B+']).toBeGreaterThan(0.95);
    expect(o.atLeast.A).toBeGreaterThan(0.4);
    expect(o.atLeast['A+']).toBeLessThan(0.2);
  });

  it('is less sure about internals when fewer marks are in', () => {
    const one = newSubject({ type: 'theory' });
    one.components[0].entries[0].obtained = 14;
    const three = newSubject({ type: 'theory' });
    three.components[0].entries[0].obtained = 14;
    three.components[1].entries[0].obtained = 7;
    three.components[2].entries[0].obtained = 7;
    expect(subjectModel(one, 'medium').internalSd).toBeGreaterThan(subjectModel(three, 'medium').internalSd);
  });
});

describe('MST + end-sem plan', () => {
  const maths = newSubject({ type: 'theory', credits: 5, name: 'Maths' });
  maths.components[0].entries[0].obtained = 14;
  const mm = subjectModel(maths, 'medium');
  const safeBPlus = 82.5 + SAFE_Z * 2;

  it('finds the same score to hit in MST-2 and the end-sem for a grade', () => {
    const p = effortFor(mm, safeBPlus);
    // 26.25 + 12.5·p (internal) + 50·p (end-sem) = 85.79
    expect(p).toBeCloseTo((safeBPlus - 26.25) / 62.5, 5);
    expect(p * 20).toBeCloseTo(19.05, 1); // MST-2 out of 20
    expect(p * 50).toBeCloseTo(47.6, 1); // end-sem out of 50
  });

  it('plans every MST still to come at the start of the semester', () => {
    const fresh = subjectModel(newSubject({ type: 'theory', credits: 5 }), 'medium');
    expect(fresh.internal.mst).toMatchObject({ total: 2, done: 0, remaining: 2, labels: ['MST 1', 'MST 2'] });
    const three = subjectModel(withMstCount(newSubject({ type: 'theory', credits: 5 }), 3), 'medium');
    expect(three.internal.mst!.labels).toEqual(['MST 1', 'MST 2', 'MST 3']);
    // both MSTs move the internal total, so each MST mark matters twice as much as with one left
    expect(fresh.internal.mst!.slope).toBeCloseTo(25);
  });

  it('only plans the end-sem once the MSTs are done', () => {
    const done = newSubject({ type: 'theory', credits: 5 });
    done.components[0].entries[0].obtained = 14;
    done.components[0].entries[1].obtained = 16;
    const dm = subjectModel(done, 'medium');
    expect(dm.internal.mst).toMatchObject({ done: 2, remaining: 0, labels: [] });
    expect(dm.internal.mst!.slope).toBe(0);
  });

  it('trades MST-2 marks against end-sem marks', () => {
    const ifFull = externalNeeded(mm, safeBPlus, 1); // 20/20 in MST-2
    const ifHalf = externalNeeded(mm, safeBPlus, 0.5); // 10/20
    expect(ifHalf - ifFull).toBeCloseTo(6.25); // 10 MST marks ≈ 6.25 internal marks
  });

  it('plans grades across subjects for an SGPA target', () => {
    const a = subjectModel(newSubject({ type: 'hybrid', credits: 4, internalMode: 'direct', directInternal: 70 }), 'medium');
    const b = subjectModel(newSubject({ type: 'theory', credits: 4, internalMode: 'direct', directInternal: 45 }), 'medium');
    const plan = planAims([a, b], 9, true);
    const safeA = 89.5 + SAFE_Z * 1.25;
    expect(plan.aims.get(a.subject.id)).toMatchObject({ grade: 'A' });
    expect(plan.aims.get(a.subject.id)!.p).toBeCloseTo((safeA - 70) / 25, 4);
    expect(plan.aims.get(b.subject.id)!.p).toBeCloseTo((safeA - 45) / 50, 4);
    expect(plan.level).toBeCloseTo((safeA - 45) / 50, 3);
    expect(planAims([a, b], 10, true).level).toBeNull();
  });

  it('keeps a grade the student picked, and falls back to a normal year when safe is impossible', () => {
    const pinned = newSubject({ type: 'theory', credits: 4, internalMode: 'direct', directInternal: 45, targetGrade: 'B' });
    const plan = choosePlan([subjectModel(pinned, 'medium')], 6);
    expect(plan.aims.values().next().value).toMatchObject({ grade: 'B', pinned: true });

    const weak = subjectModel(newSubject({ type: 'hybrid', credits: 4, internalMode: 'direct', directInternal: 65 }), 'medium');
    // safe A needs 91.56 > 65 + 25; the usual A cut-off (89.5) is just reachable
    const p = choosePlan([weak], 9);
    expect(p.safe).toBe(false);
    expect(p.level).not.toBeNull();
  });

  it('works out the SGPA needed for a CGPA target', () => {
    const past = [{ id: 'a', name: 's1', sgpa: 8, credits: 21 }];
    expect(requiredSgpaForCgpa(past, 8.5, 23)).toBeCloseTo((8.5 * 44 - 168) / 23);
  });
});
