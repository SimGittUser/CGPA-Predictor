import { cutoffsFor, gradeForTotal, GRADE_POINTS, ALL_GRADES, type Cutoff } from './grading';
import { DEFAULT_PCT, summarizeInternal, type InternalSummary } from './internal';
import type { GradeLetter, PastSemester, Subject, Uncertainty } from './types';

/** Spread of your external score around what you expect, as a fraction of the external max. */
export const EXTERNAL_SD: Record<Uncertainty, number> = { low: 0.06, medium: 0.1, high: 0.14 };

/** "To be safe" = the cutoff lands at or below this line 95% of the time. */
export const SAFE_Z = 1.645;

/**
 * How far your final internal % may drift from your average so far, with no marks in.
 * It narrows as marks come in (÷√(marks+1)): one MST tells us less than six tests do.
 */
const INTERNAL_SPREAD = 0.15;

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
    internalSd: s.internalMode === 'direct' && internal.hasData ? 0 : (s.internalMax * INTERNAL_SPREAD) / Math.sqrt(internal.count + 1),
  };
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
      const I = clamp(internal.projected + gaussian(rand) * m.internalSd, 0, s.internalMax);
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

// ---- Planner: what to aim for in the next MST and the end-sem exam -----------------

/** Total (out of 100) a grade needs: where the cut-off usually lands, or high enough to hold 95% of the time. */
export const cutoffTotal = (c: Cutoff, safe: boolean) => c.mu + (safe ? SAFE_Z * c.sigma : 0);

/**
 * The single score (as a fraction) to hit in every remaining MST *and* the end-sem exam to reach
 * `total`, with the rest of the internals going like they have so far.
 * ≤ 0 means it's already secured; > 1 means it isn't possible.
 */
export function effortFor(m: SubjectModel, total: number): number {
  const base = m.internal.mst?.base ?? m.internal.projected;
  const slope = m.internal.mst?.slope ?? 0;
  const per = slope + m.subject.externalMax;
  if (per <= 0) return total <= base ? -Infinity : Infinity;
  return (total - base) / per;
}

/** End-sem marks needed to reach `total` if the remaining MSTs score `mstFrac` (0–1). */
export function externalNeeded(m: SubjectModel, total: number, mstFrac: number): number {
  const base = m.internal.mst?.base ?? m.internal.projected;
  return total - base - (m.internal.mst?.slope ?? 0) * mstFrac;
}

export interface GradeAim {
  grade: GradeLetter;
  /** See effortFor. */
  p: number;
}

export function gradeAims(m: SubjectModel, safe: boolean): GradeAim[] {
  return m.cutoffs.map((c) => ({ grade: c.grade, p: effortFor(m, cutoffTotal(c, safe)) }));
}

export interface Aim extends GradeAim {
  /** The student picked this grade themselves. */
  pinned: boolean;
}

export interface AimPlan {
  aims: Map<string, Aim>;
  /** Highest score any subject needs (0–1), or null if the target can't be reached. */
  level: number | null;
  /** SGPA the planned grades add up to. */
  sgpa: number;
  /** Best SGPA reachable with full marks in everything left. */
  maxSgpa: number;
  /** Planned against cut-offs that hold 95% of the time (true) or where they usually land. */
  safe: boolean;
}

/**
 * Pick a grade for each subject so the SGPA reaches `target` while asking for the lowest
 * possible score in the subject that needs the most: the fairest single bar to clear.
 * Each subject then gets the lowest MST/end-sem aim that still earns its grade.
 * Grades the student picked themselves are kept as they are.
 */
export function planAims(models: SubjectModel[], target: number, safe: boolean): AimPlan {
  const graded = models.filter((m) => !m.subject.excluded);
  const table = new Map(graded.map((m) => [m.subject.id, gradeAims(m, safe)]));
  const credits = graded.reduce((a, m) => a + m.subject.credits, 0);

  const aimAt = (m: SubjectModel, level: number): Aim => {
    const list = table.get(m.subject.id)!;
    const pinned = m.subject.targetGrade && list.find((a) => a.grade === m.subject.targetGrade);
    if (pinned) return { ...pinned, pinned: true };
    const a = list.find((x) => x.p <= level + 1e-9);
    return a ? { ...a, pinned: false } : { grade: 'F', p: 0, pinned: false };
  };
  const at = (level: number) => {
    const aims = new Map(graded.map((m) => [m.subject.id, aimAt(m, level)]));
    const pts = graded.reduce((a, m) => a + GRADE_POINTS[aims.get(m.subject.id)!.grade] * m.subject.credits, 0);
    return { aims, sgpa: credits ? pts / credits : 0 };
  };

  const best = at(1);
  if (best.sgpa < target - 0.005) return { aims: best.aims, level: null, sgpa: best.sgpa, maxSgpa: best.sgpa, safe };
  let lo = 0;
  let hi = 1;
  if (at(0).sgpa >= target - 0.005) hi = 0;
  for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).sgpa >= target - 0.005) hi = mid;
    else lo = mid;
  }
  const plan = at(hi);
  return { aims: plan.aims, level: hi, sgpa: plan.sgpa, maxSgpa: best.sgpa, safe };
}

/** Plan to be safe if asked and possible, otherwise plan for a normal year. */
export function choosePlan(models: SubjectModel[], target: number, preferSafe = true): AimPlan {
  if (!preferSafe) return planAims(models, target, false);
  const safe = planAims(models, target, true);
  return safe.level !== null ? safe : planAims(models, target, false);
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
