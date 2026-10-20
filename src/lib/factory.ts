import { COURSE_TYPES, KNOWN_SHIFTS, typeFromCode } from './grading';
import type { AppState, Component, CourseType, Entry, PastSemester, Subject } from './types';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---- Internal-marks template ------------------------------------------------

export interface HeadTemplate {
  name: string;
  /** Internal marks this head is worth. */
  weight: number;
  /** Number of tests/boxes pre-created. */
  count: number;
  /** Marks each test is out of. */
  max: number;
  /** Box label; numbered when count > 1. */
  label: string;
  /** Known number of these per semester (only MSTs: always two). */
  expectedCount?: number;
  /** A one-off (like Practical Mid Term): its box isn't numbered. */
  single?: boolean;
}

/**
 * The mark boxes every subject starts with, by evaluation split.
 *
 * ⚠️ These weights are a best guess at CU's 2025 scheme. If you know the real
 * breakdown, change it here and every new subject picks it up. Each list's
 * weights should add up to that split's internal marks (75, 60, 50).
 */
export type HeadKind = 'mst' | 'assignment' | 'test' | 'worksheet' | 'labmst' | 'other';

/** Every subject with theory has two MSTs. Nothing else about the scheme is fixed between semesters. */
export const MSTS_PER_SEMESTER = 2;

/** Which kind of internal assessment a CUIMS row (or one of our head names) is, and its number. */
export function classify(description: string): { kind: HeadKind; n: number | null } {
  const d = description.toLowerCase();
  const num = d.match(/(\d+)(?!.*\d)/);
  const n = num ? Number(num[1]) : null;
  let kind: HeadKind = 'other';
  if (/practical|lab/.test(d) && /mid|mst|term/.test(d) && !/assessment/.test(d)) kind = 'labmst';
  else if (/practical|worksheet|experiment|assessment/.test(d)) kind = 'worksheet';
  else if (/\bmst\b|mst-|mid[\s-]*sem/.test(d)) kind = 'mst';
  else if (/assignment/.test(d)) kind = 'assignment';
  else if (/test|quiz/.test(d)) kind = 'test';
  return { kind, n };
}


/** One head of each kind, named the way CUIMS names the rows. */
export const HEADS_BY_KIND: Record<HeadKind, HeadTemplate> = {
  mst: { name: 'Mid-Sem Tests (MST)', weight: 20, count: MSTS_PER_SEMESTER, max: 20, label: 'MST', expectedCount: MSTS_PER_SEMESTER },
  // Other heads start with a single empty box to type into; how many there will be isn't known.
  assignment: { name: 'Assignments', weight: 10, count: 1, max: 10, label: 'Assignment' },
  test: { name: 'Surprise Tests / Quizzes', weight: 10, count: 1, max: 10, label: 'Test' },
  worksheet: { name: 'Practical Assessments (worksheets)', weight: 25, count: 1, max: 30, label: 'Practical' },
  labmst: { name: 'Practical Mid Term', weight: 10, count: 1, max: 30, label: 'Practical Mid Term', single: true },
  other: { name: 'Other marks', weight: 5, count: 1, max: 10, label: 'Other', single: true },
};

const H = (kind: HeadKind, weight: number): HeadTemplate => ({ ...HEADS_BY_KIND[kind], weight });

/**
 * The mark boxes every subject starts with, by evaluation split.
 *
 * ⚠️ These weights are a best guess at CU's 2025 scheme. If you know the real
 * breakdown, change it here and every new subject picks it up. Each list's
 * weights should add up to that split's internal marks (75, 60, 50).
 */
export const INTERNAL_TEMPLATES: Record<CourseType, HeadTemplate[]> = {
  hybrid: [H('mst', 20), H('assignment', 10), H('test', 10), H('worksheet', 25), H('labmst', 10)],
  practical: [H('worksheet', 35), H('labmst', 15), { name: 'Project / Viva', weight: 10, count: 1, max: 10, label: 'Project / Viva', single: true }],
  theory: [H('mst', 25), H('assignment', 10), H('test', 15)],
  external: [],
  custom: [H('mst', 25), H('assignment', 10), H('test', 15)],
};

export function headsFor(type: CourseType): Component[] {
  return INTERNAL_TEMPLATES[type].map(componentFromHead);
}

/** True once any mark has been typed into the subject. */
export function hasMarks(s: Subject): boolean {
  return s.directInternal !== null || s.components.some((c) => c.entries.some((e) => e.obtained !== null));
}

export function newSubject(p: Partial<Subject> = {}): Subject {
  const type: CourseType = p.type ?? (p.code ? typeFromCode(p.code) : null) ?? 'hybrid';
  const split = COURSE_TYPES[type];
  return {
    id: uid(),
    code: '',
    name: 'New subject',
    credits: 4,
    type,
    internalMax: split.internal,
    externalMax: split.external,
    excluded: false,
    internalMode: 'components',
    directInternal: null,
    components: p.excluded ? [] : headsFor(type),
    expectedExternalPct: null,
    targetGrade: null,
    cutoffShift: p.code ? KNOWN_SHIFTS[p.code.toUpperCase()] ?? 0 : 0,
    ...p,
  };
}

/** Extra heads offered when editing a subject's structure. */
/** Extra heads offered when editing a subject's structure. */
export const EXTRA_HEADS: HeadTemplate[] = [
  HEADS_BY_KIND.mst,
  HEADS_BY_KIND.assignment,
  HEADS_BY_KIND.test,
  HEADS_BY_KIND.worksheet,
  HEADS_BY_KIND.labmst,
  { name: 'Project / Viva', weight: 10, count: 1, max: 10, label: 'Project / Viva', single: true },
  { name: 'Attendance', weight: 2, count: 1, max: 100, label: 'Attendance %', single: true },
];

export function componentFromHead(h: HeadTemplate): Component {
  const numbered = !h.single;
  return newComponent({
    name: h.name,
    weight: h.weight,
    expectedCount: h.expectedCount ?? null,
    entries: Array.from({ length: h.count }, (_, i) => newEntry({ label: numbered ? `${h.label} ${i + 1}` : h.label, max: h.max })),
  });
}

export function newComponent(p: Partial<Component> = {}): Component {
  return { id: uid(), name: 'Other marks', weight: 10, expectedCount: null, bestOf: null, entries: [], ...p };
}

export function newEntry(p: Partial<Entry> = {}): Entry {
  return { id: uid(), label: 'Test', obtained: null, max: 10, date: today(), ...p };
}

export function newPastSemester(n: number, p: Partial<PastSemester> = {}): PastSemester {
  return { id: uid(), name: `Semester ${n}`, sgpa: null, credits: null, ...p };
}

export function initialState(): AppState {
  return {
    version: 1,
    setupDone: false,
    semesterName: 'Current semester',
    subjects: [],
    targetMode: 'sgpa',
    target: null,
    pastSemesters: [],
    settings: { uncertainty: 'medium', theme: 'system', planSafe: true },
    updatedAt: null,
  };
}

// ---- Semester templates -----------------------------------------------------

type T = { code: string; name: string; credits: number; type?: CourseType; internalMax?: number; externalMax?: number; excluded?: boolean };

const S = {
  // Some sem-1 theory+lab subjects are 70 internal + 30 external: results show externals of 30 and 27.75.
  LTPS: { code: '25CSH-107', name: 'Logical Thinking & Problem Solving', credits: 4, type: 'custom', internalMax: 70, externalMax: 30 },
  DTI: { code: '25CSP-102', name: 'Design Thinking and Innovation', credits: 1 },
  ACP: { code: '25CST-110', name: 'Academic & Career Pathway Planning', credits: 1, excluded: true },
  AI: { code: '25ECP-102', name: 'AI Applications Lab', credits: 1 },
  CGL: { code: '25MEP-102', name: 'Computer Graphics Lab', credits: 1 },
  COMM1: { code: '25PCH-110', name: 'Communication Skills-I', credits: 2, type: 'custom', internalMax: 70, externalMax: 30 },
  M1: { code: '25SMT-121', name: 'Mathematics-I', credits: 5 },
  SEMI: { code: '25SPH-143', name: 'Semiconductor Physics and Applications', credits: 3, type: 'custom', internalMax: 70, externalMax: 30 },
  BIO: { code: '25SZT-148', name: 'Biology for Engineers', credits: 3 },
  // UHV's split isn't confirmed (marks seen: 32+50.25, 40+42) — 40/60 fits both.
  UHV: { code: '25UCT-103', name: 'Universal Human Values, Ethics and Life Skills-1', credits: 1, type: 'custom', internalMax: 40, externalMax: 60 },
  DSA: { code: '25CSH-103', name: 'Data Structures and Algorithms', credits: 4 },
  PP: { code: '25CSP-105', name: 'Programming Practice', credits: 1 },
  DE: { code: '25ECH-101', name: 'Digital Electronics', credits: 4 },
  EDT: { code: '25ECP-103', name: 'Emerging and Disruptive Technologies Workshop', credits: 2 },
  GP: { code: '25GPT-121', name: 'General Proficiency-1', credits: 1 },
  COMM2: { code: '25PCP-111', name: 'Communication Skills-II', credits: 1 },
  M2: { code: '25SMT-198', name: 'Mathematics-II', credits: 5 },
  EP: { code: '25SPH-141', name: 'Engineering Physics', credits: 4, type: 'custom', internalMax: 70, externalMax: 30 },
  SS: { code: '25TDP-151', name: 'SOFT SKILLS - I', credits: 1 },
  // 3rd semester (2025 batch). Codes aren't known yet; the split is read from the CUIMS rows.
  PS: { code: '', name: 'Probability and Statistics', credits: 4, type: 'theory' },
  JAVA: { code: '', name: 'Object Oriented Programming using Java', credits: 2, type: 'hybrid' },
  AGILE: { code: '', name: 'Agile Development Methodologies', credits: 4, type: 'hybrid' },
  ADS: { code: '', name: 'Advanced Data Structures', credits: 4, type: 'hybrid' },
  COA: { code: '', name: 'Computer Organization and Architecture', credits: 3, type: 'theory' },
  CERM: { code: '', name: 'Critical Enquiry and Research Methodology', credits: 1, type: 'theory' },
  APTI: { code: '', name: 'Aptitude - I', credits: 1, type: 'theory' },
  DBMS: { code: '', name: 'Database Management System', credits: 4, type: 'hybrid' },
} satisfies Record<string, T>;

/** Every first-year subject we know the code and credits of. */
export const KNOWN_SUBJECTS: T[] = Object.values(S);

export interface Template {
  id: string;
  semester: number;
  title: string;
  /** The subjects that tell this group apart from the other one. */
  tellApart: string;
  subjects: T[];
  /** Graded credits of the semester before, to prefill the CGPA step. */
  prevCredits: number | null;
}

/** First-year CSE subject sets from the 2025 batch. The two groups swap sets between semesters. */
export const TEMPLATES: Template[] = [
  {
    id: 's1-bio',
    semester: 1,
    title: '1st Semester (Biology group)',
    tellApart: 'You have Biology, AI Applications Lab and Computer Graphics Lab',
    subjects: [S.LTPS, S.M1, S.SEMI, S.BIO, S.COMM1, S.DTI, S.AI, S.CGL, S.UHV, S.ACP],
    prevCredits: null,
  },
  {
    id: 's1-phy',
    semester: 1,
    title: '1st Semester (Physics group)',
    tellApart: 'You have Engineering Physics and the EDT Workshop',
    subjects: [S.LTPS, S.M1, S.EP, S.SEMI, S.COMM1, S.EDT, S.UHV, S.ACP],
    prevCredits: null,
  },
  {
    id: 's2-phy',
    semester: 2,
    title: '2nd Semester (Physics group)',
    tellApart: 'You have Engineering Physics and the EDT Workshop',
    subjects: [S.DSA, S.M2, S.DE, S.EP, S.EDT, S.PP, S.COMM2, S.GP, S.SS],
    prevCredits: 21,
  },
  {
    id: 's2-bio',
    semester: 2,
    title: '2nd Semester (Biology group)',
    tellApart: 'You have Biology, AI Applications Lab and Computer Graphics Lab',
    subjects: [S.DSA, S.M2, S.DE, S.BIO, S.PP, S.DTI, S.AI, S.CGL, S.COMM2, S.GP, S.SS],
    prevCredits: 21,
  },
  {
    id: 's3',
    semester: 3,
    title: '3rd Semester',
    tellApart: 'You have Java, DBMS, Agile and Advanced Data Structures',
    subjects: [S.PS, S.JAVA, S.AGILE, S.ADS, S.COA, S.DBMS, S.CERM, S.APTI],
    prevCredits: 44,
  },
];

export function subjectsFromTemplate(t: Template): Subject[] {
  return t.subjects.map((x) => newSubject({ ...x }));
}
