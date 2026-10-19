import { describe, expect, it } from 'vitest';
import { CALIBRATION, KNOWN_SHIFTS, cutoffsFor, gradeForTotal, sgpaFrom, typeFromCode } from './grading';
import { newComponent, newEntry, newSubject } from './factory';
import { summarizeInternal } from './internal';
import { planUniform, requiredSgpaForCgpa, simulate, subjectModel } from './predict';

const sem = (student: 1 | 2, s: 1 | 2) => CALIBRATION.filter((r) => r.student === student && r.sem === s);

describe('SGPA matches the result sheets', () => {
  it.each([
    [1, 1, 7.86],
    [1, 2, 8.35],
    [2, 1, 8.0],
    [2, 2, 7.91],
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

describe('internal marks', () => {
  it('projects unfinished heads at the running average', () => {
    const s = newSubject({
      type: 'hybrid',
      internalMax: 75,
      components: [
        newComponent({ weight: 50, expectedCount: 2, entries: [newEntry({ obtained: 16, max: 20 })] }), // 80%, 1 of 2
        newComponent({ weight: 25, entries: [newEntry({ obtained: 9, max: 10 }), newEntry({ obtained: 7, max: 10 })] }), // 80%
      ],
    });
    const i = summarizeInternal(s);
    expect(i.projected).toBeCloseTo(60);
    expect(i.secured).toBeCloseTo(50 * 0.4 + 25 * 0.8);
    expect(i.maxPossible).toBeCloseTo(50 * 0.9 + 25 * 0.8);
    expect(i.completion).toBeCloseTo((50 * 0.5 + 25) / 75);
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

  it('plans the external needed for a target', () => {
    const plan = planUniform([m], 9, true);
    // safe A cutoff ≈ 89.5 + 1.645·1.25 ≈ 91.56 → need ≈ 21.56 / 25
    expect(plan.x! * 25).toBeCloseTo(21.56, 1);
    expect(planUniform([m], 10, true).x).toBeNull();
  });

  it('works out the SGPA needed for a CGPA target', () => {
    const past = [{ id: 'a', name: 's1', sgpa: 8, credits: 21 }];
    expect(requiredSgpaForCgpa(past, 8.5, 23)).toBeCloseTo((8.5 * 44 - 168) / 23);
  });
});
