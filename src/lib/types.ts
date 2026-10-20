export type GradeLetter = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';

/** Evaluation split. CU course codes hint at it: xxH = hybrid, xxP = practical, xxT = theory. */
export type CourseType = 'hybrid' | 'practical' | 'theory' | 'external' | 'custom';

export interface Entry {
  id: string;
  label: string;
  obtained: number | null;
  max: number;
  date: string; // ISO yyyy-mm-dd
}

/** One internal-assessment head (MST, assignments, worksheets…) that counts for `weight` internal marks. */
export interface Component {
  id: string;
  name: string;
  weight: number;
  /** How many of these you expect over the semester. null = one per entry box (filled or empty). */
  expectedCount: number | null;
  /** Only the best N count (e.g. best 2 of 3 quizzes). null = all count. */
  bestOf: number | null;
  entries: Entry[];
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
  type: CourseType;
  internalMax: number;
  externalMax: number;
  /** Qualified/non-credit subjects (e.g. Academic & Career Pathway Planning) don't count towards SGPA. */
  excluded: boolean;
  internalMode: 'components' | 'direct';
  directInternal: number | null;
  components: Component[];
  /** Expected external score as % of external max. null = derived from internals. */
  expectedExternalPct: number | null;
  targetGrade: GradeLetter | null;
  /** Shifts every grade cutoff (marks out of 100). Negative = class scores low, so cutoffs drop. */
  cutoffShift: number;
}

export interface PastSemester {
  id: string;
  name: string;
  sgpa: number | null;
  credits: number | null;
}

export type Uncertainty = 'low' | 'medium' | 'high';
export type Theme = 'system' | 'light' | 'dark';

export interface AppState {
  version: 1;
  /** False until the first-time setup has been finished or skipped. */
  setupDone: boolean;
  semesterName: string;
  subjects: Subject[];
  targetMode: 'sgpa' | 'cgpa';
  /** The student's goal; null until they've set one (we never assume it). */
  target: number | null;
  pastSemesters: PastSemester[];
  settings: {
    uncertainty: Uncertainty;
    theme: Theme;
    /** Plan against cut-offs that hold 95% of the time (true) or where they usually land. */
    planSafe: boolean;
  };
  updatedAt: string | null;
}
