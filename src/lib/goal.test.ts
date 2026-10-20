import { describe, expect, it } from 'vitest';
import { bothGoals } from '../components/Goal';

const past = [{ id: 'p', name: 'Year 1', sgpa: 9.55, credits: 44 }];

describe('SGPA and CGPA goals', () => {
  it('turns an SGPA goal into the CGPA it leads to (credit-weighted average)', () => {
    const g = bothGoals(past, 28, { mode: 'sgpa', target: 9 });
    expect(g.cgpa).toBeCloseTo((9.55 * 44 + 9 * 28) / 72);
  });

  it('turns a CGPA goal into the SGPA needed this semester', () => {
    const g = bothGoals(past, 28, { mode: 'cgpa', target: 9.5 });
    expect(g.sgpa).toBeCloseTo((9.5 * 72 - 9.55 * 44) / 28);
  });

  it('treats them as the same thing in 1st semester', () => {
    expect(bothGoals([], 23, { mode: 'sgpa', target: 8.5 })).toEqual({ sgpa: 8.5, cgpa: 8.5 });
  });
});
