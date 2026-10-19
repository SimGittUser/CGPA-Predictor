import type { CourseType, GradeLetter } from './types';

export const GRADE_POINTS: Record<GradeLetter, number> = {
  'A+': 10,
  A: 9,
  'B+': 8,
  B: 7,
  'C+': 6,
  C: 5,
  D: 4,
  F: 0,
};

/** Passing grades, best first. Anything below the D cutoff is F. */
export const PASS_GRADES: GradeLetter[] = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
export const ALL_GRADES: GradeLetter[] = [...PASS_GRADES, 'F'];

/** Minimum total (out of 100) to pass, regardless of how the class did. */
export const PASS_MARK = 40;

/**
 * Estimated grade cutoffs on the total (internal + external, out of 100).
 *
 * CU grades relatively, so the real cutoffs move with each class. These centres and
 * spreads come from the 2025-batch results in CALIBRATION below:
 *  - A:  lowest A seen 88.93, highest B+ seen 89.25        → ~89.5, tight
 *  - B+: lowest B+ seen 80.74, highest B seen 83.5          → ~82.5
 *  - B:  lowest B seen 72, highest C+ seen 74               → ~73.5
 *  - C+: lowest C+ seen 64 (Soft Skills)                    → ~64
 *  - A+: never observed; a 95.33 still got an A            → ~96, wide
 *  - C, D: no data, extrapolated from the spacing above     → wide
 */
export const BASE_CUTOFFS: Record<Exclude<GradeLetter, 'F'>, { mu: number; sigma: number }> = {
  'A+': { mu: 96, sigma: 2 },
  A: { mu: 89.5, sigma: 1.25 },
  'B+': { mu: 82.5, sigma: 2 },
  B: { mu: 73.5, sigma: 2.5 },
  'C+': { mu: 64, sigma: 3.5 },
  C: { mu: 55, sigma: 4 },
  D: { mu: 45, sigma: 4 },
};

export interface Cutoff {
  grade: GradeLetter;
  mu: number;
  sigma: number;
}

export function cutoffsFor(shift: number): Cutoff[] {
  return PASS_GRADES.map((grade) => {
    const base = BASE_CUTOFFS[grade as Exclude<GradeLetter, 'F'>];
    return { grade, mu: Math.max(PASS_MARK, base.mu + shift), sigma: base.sigma };
  });
}

/** Grade for a total when each cutoff sits at mu + z·sigma (z shared so cutoffs stay ordered). */
export function gradeForTotal(total: number, cutoffs: Cutoff[], z = 0): GradeLetter {
  for (const c of cutoffs) {
    const line = c.grade === 'D' ? Math.max(PASS_MARK, c.mu + z * c.sigma) : c.mu + z * c.sigma;
    if (total >= line - 1e-9) return c.grade;
  }
  return 'F';
}

export const COURSE_TYPES: Record<CourseType, { label: string; internal: number; external: number; hint: string }> = {
  hybrid: { label: 'Hybrid (75 / 25)', internal: 75, external: 25, hint: 'Codes like 25CSH, 25ECH, 25SPH, 25PCH' },
  practical: { label: 'Practical (60 / 40)', internal: 60, external: 40, hint: 'Codes like 25CSP, 25ECP, 25PCP, 25TDP' },
  theory: { label: 'Theory (50 / 50)', internal: 50, external: 50, hint: 'Codes like 25SMT, 25SZT' },
  external: { label: 'External only (0 / 100)', internal: 0, external: 100, hint: 'e.g. General Proficiency (25GPT)' },
  custom: { label: 'Custom split', internal: 50, external: 50, hint: 'Set internal and external max yourself' },
};

/** Guess the course type from a CU subject code such as "25CSH-103". */
export function typeFromCode(code: string): CourseType | null {
  const m = code.trim().toUpperCase().match(/^\d{2}([A-Z]{3})-?\d+/);
  if (!m) return null;
  if (m[1] === 'GPT') return 'external';
  const last = m[1][2];
  if (last === 'H') return 'hybrid';
  if (last === 'P') return 'practical';
  if (last === 'T') return 'theory';
  return null;
}

export function sgpaFrom(rows: { grade: GradeLetter | 'Qualified'; credits: number }[]): number {
  let pts = 0;
  let cr = 0;
  for (const r of rows) {
    if (r.grade === 'Qualified') continue;
    pts += GRADE_POINTS[r.grade] * r.credits;
    cr += r.credits;
  }
  return cr ? pts / cr : 0;
}

export interface CalibrationRow {
  code: string;
  name: string;
  internal: number;
  external: number;
  credits: number;
  grade: GradeLetter | 'Qualified';
  student: 1 | 2;
  sem: 1 | 2;
}

/** Real 2025-batch results (two students, two semesters) used to set BASE_CUTOFFS. */
export const CALIBRATION: CalibrationRow[] = [
  // Student 1, Sem 1 — SGPA 7.86
  { student: 1, sem: 1, code: '25CSH-107', name: 'Logical Thinking & Problem Solving', internal: 62.93, external: 26, credits: 4, grade: 'A' },
  { student: 1, sem: 1, code: '25CSP-102', name: 'Design Thinking and Innovation', internal: 46, external: 28, credits: 1, grade: 'C+' },
  { student: 1, sem: 1, code: '25CST-110', name: 'Academic & Career Pathway Planning', internal: 47, external: 44.38, credits: 1, grade: 'Qualified' },
  { student: 1, sem: 1, code: '25ECP-102', name: 'AI Applications Lab', internal: 54.5, external: 32, credits: 1, grade: 'B+' },
  { student: 1, sem: 1, code: '25MEP-102', name: 'Computer Graphics Lab', internal: 55, external: 32.5, credits: 1, grade: 'B+' },
  { student: 1, sem: 1, code: '25PCH-110', name: 'Communication Skills-I', internal: 55.81, external: 20.75, credits: 2, grade: 'B' },
  { student: 1, sem: 1, code: '25SMT-121', name: 'Mathematics-I', internal: 49.75, external: 38.33, credits: 5, grade: 'B+' },
  { student: 1, sem: 1, code: '25SPH-143', name: 'Semiconductor Physics and Applications', internal: 62.46, external: 22, credits: 3, grade: 'B+' },
  { student: 1, sem: 1, code: '25SZT-148', name: 'Biology for Engineers', internal: 41, external: 37.5, credits: 3, grade: 'B' },
  { student: 1, sem: 1, code: '25UCT-103', name: 'Universal Human Values, Ethics and Life Skills-1', internal: 40, external: 42, credits: 1, grade: 'B+' },
  // Student 1, Sem 2 — SGPA 8.35
  { student: 1, sem: 2, code: '25CSH-103', name: 'Data Structures and Algorithms', internal: 70.23, external: 18.75, credits: 4, grade: 'B+' },
  { student: 1, sem: 2, code: '25CSP-105', name: 'Programming Practice', internal: 54.5, external: 29, credits: 1, grade: 'B' },
  { student: 1, sem: 2, code: '25ECH-101', name: 'Digital Electronics', internal: 71.63, external: 22.92, credits: 4, grade: 'A' },
  { student: 1, sem: 2, code: '25ECP-103', name: 'Emerging and Disruptive Technologies Workshop', internal: 54.25, external: 35, credits: 2, grade: 'B+' },
  { student: 1, sem: 2, code: '25GPT-121', name: 'General Proficiency-1', internal: 0, external: 67.5, credits: 1, grade: 'B' },
  { student: 1, sem: 2, code: '25PCP-111', name: 'Communication Skills-II', internal: 49.25, external: 28.5, credits: 1, grade: 'B' },
  { student: 1, sem: 2, code: '25SMT-198', name: 'Mathematics-II', internal: 47.5, external: 42.5, credits: 5, grade: 'A' },
  { student: 1, sem: 2, code: '25SPH-141', name: 'Engineering Physics', internal: 68.83, external: 24.17, credits: 4, grade: 'A' },
  { student: 1, sem: 2, code: '25TDP-151', name: 'SOFT SKILLS - I', internal: 37, external: 27, credits: 1, grade: 'C+' },
  // Student 2, Sem 1 — SGPA 8.00
  { student: 2, sem: 1, code: '25CSH-107', name: 'Logical Thinking & Problem Solving', internal: 62.42, external: 24, credits: 4, grade: 'B+' },
  { student: 2, sem: 1, code: '25CST-110', name: 'Academic & Career Pathway Planning', internal: 38, external: 47.81, credits: 1, grade: 'Qualified' },
  { student: 2, sem: 1, code: '25ECP-103', name: 'Emerging and Disruptive Technologies Workshop', internal: 41.5, external: 36, credits: 2, grade: 'B' },
  { student: 2, sem: 1, code: '25PCH-110', name: 'Communication Skills-I', internal: 57.24, external: 23.5, credits: 2, grade: 'B+' },
  { student: 2, sem: 1, code: '25SMT-121', name: 'Mathematics-I', internal: 48.25, external: 47.08, credits: 5, grade: 'A' },
  { student: 2, sem: 1, code: '25SPH-141', name: 'Engineering Physics', internal: 59.66, external: 25, credits: 4, grade: 'B+' },
  { student: 2, sem: 1, code: '25SPH-143', name: 'Semiconductor Physics and Applications', internal: 58.53, external: 16, credits: 3, grade: 'B' },
  { student: 2, sem: 1, code: '25UCT-103', name: 'Universal Human Values, Ethics and Life Skills-1', internal: 32, external: 50.25, credits: 1, grade: 'B+' },
  // Student 2, Sem 2 — SGPA 7.91
  { student: 2, sem: 2, code: '25CSH-103', name: 'Data Structures and Algorithms', internal: 69.94, external: 20.42, credits: 4, grade: 'A' },
  { student: 2, sem: 2, code: '25CSP-102', name: 'Design Thinking and Innovation', internal: 53.25, external: 36, credits: 1, grade: 'B+' },
  { student: 2, sem: 2, code: '25CSP-105', name: 'Programming Practice', internal: 57, external: 36, credits: 1, grade: 'A' },
  { student: 2, sem: 2, code: '25ECH-101', name: 'Digital Electronics', internal: 63.13, external: 18.75, credits: 4, grade: 'B' },
  { student: 2, sem: 2, code: '25ECP-102', name: 'AI Applications Lab', internal: 55, external: 38, credits: 1, grade: 'A' },
  { student: 2, sem: 2, code: '25GPT-121', name: 'General Proficiency-1', internal: 0, external: 63.13, credits: 1, grade: 'C+' },
  { student: 2, sem: 2, code: '25MEP-102', name: 'Computer Graphics Lab', internal: 47.25, external: 30, credits: 1, grade: 'B' },
  { student: 2, sem: 2, code: '25PCP-111', name: 'Communication Skills-II', internal: 51.7, external: 35.5, credits: 1, grade: 'B+' },
  { student: 2, sem: 2, code: '25SMT-198', name: 'Mathematics-II', internal: 46.92, external: 37.5, credits: 5, grade: 'B+' },
  { student: 2, sem: 2, code: '25SZT-148', name: 'Biology for Engineers', internal: 45.5, external: 43.75, credits: 3, grade: 'B+' },
  { student: 2, sem: 2, code: '25TDP-151', name: 'SOFT SKILLS - I', internal: 42, external: 30, credits: 1, grade: 'B' },
];

/** General Proficiency is external-only and scores low across the class: a 67.5 got a B, 63.13 a C+. */
export const KNOWN_SHIFTS: Record<string, number> = {
  '25GPT-121': -8,
};
