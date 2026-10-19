import { cutoffsFor, gradeForTotal, GRADE_POINTS, ALL_GRADES, type Cutoff } from './grading';
import { DEFAULT_PCT, summarizeInternal, type InternalSummary } from './internal';
import type { GradeLetter, PastSemester, Subject, Uncertainty } from './types';

/** Spread of your external score around what you expect, as a fraction of the external max. */
export const EXTERNAL_SD: Record<Uncertainty, number> = { low: 0.06, medium: 0.1, high: 0.14 };

/** "To be safe" = the cutoff lands at or below this line 95% of the time. */
export const SAFE_Z = 1.645;

/** Spread of the internal marks still to come (fraction of the marks left). */
const REMAINING_INTERNAL_SD = 0.12;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface SubjectModel {
  subject: Subject;
  internal: InternalSummary;
  cutoffs: Cutoff[];
  /** Fraction of external max you're expected to score. */
  expectedExternal: number;
  expectedIsAuto: boolean;
  externalSd: number;
  internalSd: number;
}

export function subjectModel(s: Subject, uncertainty: Uncertainty): SubjectModel {
  const internal = summarizeInternal(s);
  const auto = internal.hasData && s.internalMax > 0 ? clamp(internal.projected / s.internalMax, 0.35, 0.95) : DEFAULT_PCT;
  return {
    subject: s,
    internal,
    cutoffs: cutoffsFor(s.cutoffShift),
    expectedExternal: s.expectedExternalPct === null ? auto : clamp(s.expectedExternalPct / 100, 0, 1),
    expectedIsAuto: s.expectedExternalPct === null,
    externalSd: EXTERNAL_SD[uncertainty],
    internalSd: (internal.maxPossible - internal.secured) * REMAINING_INTERNAL_SD,
  };
}

export interface GradeRequirement {
  grade: GradeLetter;
  cutoff: number;
  safeCutoff: number;
  /** External marks needed if the cutoff lands where we expect. */
  likelyExternal: number;
  /** External marks needed to clear the cutoff 95% of the time. */
  safeExternal: number;
}

export function requirements(m: SubjectModel): GradeRequirement[] {
  const I = m.internal.projected;
  return m.cutoffs.map((c) => {
    const safeCutoff = c.mu + SAFE_Z * c.sigma;
    return { grade: c.grade, cutoff: c.mu, safeCutoff, likelyExternal: c.mu - I, safeExternal: safeCutoff - I };
  });
}

// ---- Monte Carlo -----------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export interface SubjectOutcome {
  /** Probability of each grade. */
  dist: Record<GradeLetter, number>;
  /** Probability of this grade or better. */
  atLeast: Record<GradeLetter, number>;
  mostLikely: GradeLetter;
}

export interface Simulation {
  perSubject: Map<string, SubjectOutcome>;
  /** Sorted simulated SGPAs. */
  sgpa: Float64Array;
  mean: number;
  credits: number;
  quantile: (q: number) => number;
  chanceAtLeast: (sgpa: number) => number;
}

export function simulate(models: SubjectModel[], runs = 4000, seed = 20250101): Simulation {
  const rand = mulberry32(seed);
  const counted = models.filter((m) => !m.subject.excluded);
  const credits = counted.reduce((a, m) => a + m.subject.credits, 0);
  const tallies = new Map<string, Record<GradeLetter, number>>();
  for (const m of models) tallies.set(m.subject.id, Object.fromEntries(ALL_GRADES.map((g) => [g, 0])) as Record<GradeLetter, number>);

  const sgpa = new Float64Array(runs);
  for (let r = 0; r < runs; r++) {
    let pts = 0;
    for (const m of models) {
      const { internal, subject: s } = m;
      const I = clamp(internal.projected + gaussian(rand) * m.internalSd, internal.secured, internal.maxPossible);
      const E = s.externalMax * clamp(m.expectedExternal + gaussian(rand) * m.externalSd, 0, 1);
      const grade = gradeForTotal(I + E, m.cutoffs, gaussian(rand));
      tallies.get(s.id)![grade]++;
      if (!s.excluded) pts += GRADE_POINTS[grade] * s.credits;
    }
    sgpa[r] = credits ? pts / credits : 0;
  }
  sgpa.sort();

  const perSubject = new Map<string, SubjectOutcome>();
  for (const [id, t] of tallies) {
    const dist = {} as Record<GradeLetter, number>;
    const atLeast = {} as Record<GradeLetter, number>;
    let cum = 0;
    let mostLikely: GradeLetter = ALL_GRADES[0];
    for (const g of ALL_GRADES) {
      dist[g] = t[g] / runs;
      cum += dist[g];
      atLeast[g] = Math.min(1, cum);
      if (dist[g] > dist[mostLikely]) mostLikely = g;
    }
    perSubject.set(id, { dist, atLeast, mostLikely });
  }

  const mean = sgpa.reduce((a, b) => a + b, 0) / runs;
  return {
    perSubject,
    sgpa,
    mean,
    credits,
    quantile: (q) => sgpa[Math.min(runs - 1, Math.max(0, Math.floor(q * runs)))],
    chanceAtLeast: (x) => {
      // first index with sgpa >= x - epsilon (SGPAs are rounded to 2dp on the result sheet)
      let lo = 0;
      let hi = runs;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sgpa[mid] < x - 0.005) lo = mid + 1;
        else hi = mid;
      }
      return (runs - lo) / runs;
    },
  };
}

// ---- Planner ---------------------------------------------------------------

/** Grade each subject gets if you score fraction `x` of every external. */
export function gradesAtUniform(models: SubjectModel[], x: number, safe: boolean): Map<string, GradeLetter> {
  const out = new Map<string, GradeLetter>();
  for (const m of models) {
    const total = m.internal.projected + m.subject.externalMax * x;
    out.set(m.subject.id, gradeForTotal(total, m.cutoffs, safe ? SAFE_Z : 0));
  }
  return out;
}

export function sgpaOf(models: SubjectModel[], grades: Map<string, GradeLetter>): number {
  let pts = 0;
  let cr = 0;
  for (const m of models) {
    if (m.subject.excluded) continue;
    pts += GRADE_POINTS[grades.get(m.subject.id) ?? 'F'] * m.subject.credits;
    cr += m.subject.credits;
  }
  return cr ? pts / cr : 0;
}

export interface UniformPlan {
  /** Lowest external fraction that reaches the target, or null if even 100% doesn't. */
  x: number | null;
  sgpa: number;
  grades: Map<string, GradeLetter>;
  maxSgpa: number;
}

export function planUniform(models: SubjectModel[], target: number, safe: boolean): UniformPlan {
  const best = gradesAtUniform(models, 1, safe);
  const maxSgpa = sgpaOf(models, best);
  if (maxSgpa < target - 0.005) return { x: null, sgpa: maxSgpa, grades: best, maxSgpa };
  let lo = 0;
  let hi = 1;
  if (sgpaOf(models, gradesAtUniform(models, 0, safe)) >= target - 0.005) hi = 0;
  for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    if (sgpaOf(models, gradesAtUniform(models, mid, safe)) >= target - 0.005) hi = mid;
    else lo = mid;
  }
  const grades = gradesAtUniform(models, hi, safe);
  return { x: hi, sgpa: sgpaOf(models, grades), grades, maxSgpa };
}

// ---- CGPA -------------------------------------------------------------------

export function pastTotals(past: PastSemester[]) {
  let points = 0;
  let credits = 0;
  for (const p of past) {
    if (p.sgpa === null || p.credits === null || p.credits <= 0) continue;
    points += p.sgpa * p.credits;
    credits += p.credits;
  }
  return { points, credits, cgpa: credits ? points / credits : null };
}

export function cgpaWith(past: PastSemester[], sgpa: number, credits: number): number {
  const t = pastTotals(past);
  const cr = t.credits + credits;
  return cr ? (t.points + sgpa * credits) / cr : 0;
}

/** SGPA needed this semester to lift CGPA to `target`. */
export function requiredSgpaForCgpa(past: PastSemester[], target: number, credits: number): number {
  const t = pastTotals(past);
  if (credits <= 0) return 0;
  return (target * (t.credits + credits) - t.points) / credits;
}
