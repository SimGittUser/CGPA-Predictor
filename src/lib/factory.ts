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

export function newSubject(p: Partial<Subject> & { name?: string } = {}): Subject {
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
    components: [],
    expectedExternalPct: null,
    targetGrade: null,
    cutoffShift: p.code ? KNOWN_SHIFTS[p.code.toUpperCase()] ?? 0 : 0,
    ...p,
  };
}

export interface ComponentPreset {
  name: string;
  weight: number;
  max: number;
  expectedCount: number | null;
  entryLabel: string;
}

/**
 * Starting points only — weights differ per course. Match them to your
 * course's evaluation scheme on CUIMS / the course handout.
 */
export const COMPONENT_PRESETS: ComponentPreset[] = [
  { name: 'MST (Mid-Sem Test)', weight: 20, max: 20, expectedCount: 2, entryLabel: 'MST' },
  { name: 'Assignments', weight: 10, max: 10, expectedCount: null, entryLabel: 'Assignment' },
  { name: 'Quizzes / Surprise tests', weight: 5, max: 10, expectedCount: null, entryLabel: 'Quiz' },
  { name: 'Worksheets / Experiments', weight: 20, max: 30, expectedCount: null, entryLabel: 'Worksheet' },
  { name: 'Lab MST / Practical test', weight: 10, max: 20, expectedCount: 1, entryLabel: 'Lab MST' },
  { name: 'Viva', weight: 5, max: 10, expectedCount: null, entryLabel: 'Viva' },
  { name: 'Project / Presentation', weight: 10, max: 10, expectedCount: 1, entryLabel: 'Project' },
  { name: 'Attendance', weight: 2, max: 100, expectedCount: 1, entryLabel: 'Attendance %' },
];

export function newComponent(p: Partial<Component> = {}): Component {
  return { id: uid(), name: 'Component', weight: 10, expectedCount: null, bestOf: null, entries: [], ...p };
}

export function newEntry(p: Partial<Entry> = {}): Entry {
  return { id: uid(), label: 'Entry', obtained: null, max: 10, date: today(), ...p };
}

export function newPastSemester(n: number): PastSemester {
  return { id: uid(), name: `Semester ${n}`, sgpa: null, credits: null };
}

export function initialState(): AppState {
  return {
    version: 1,
    semesterName: 'Current semester',
    subjects: [],
    targetMode: 'sgpa',
    target: 8.5,
    pastSemesters: [],
    settings: { uncertainty: 'medium', theme: 'system' },
    updatedAt: null,
  };
}

type T = { code: string; name: string; credits: number; type?: CourseType; internalMax?: number; externalMax?: number; excluded?: boolean };

const S = {
  LTPS: { code: '25CSH-107', name: 'Logical Thinking & Problem Solving', credits: 4 },
  DTI: { code: '25CSP-102', name: 'Design Thinking and Innovation', credits: 1 },
  ACP: { code: '25CST-110', name: 'Academic & Career Pathway Planning', credits: 1, excluded: true },
  AI: { code: '25ECP-102', name: 'AI Applications Lab', credits: 1 },
  CGL: { code: '25MEP-102', name: 'Computer Graphics Lab', credits: 1 },
  COMM1: { code: '25PCH-110', name: 'Communication Skills-I', credits: 2 },
  M1: { code: '25SMT-121', name: 'Mathematics-I', credits: 5 },
  SEMI: { code: '25SPH-143', name: 'Semiconductor Physics and Applications', credits: 3 },
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
  EP: { code: '25SPH-141', name: 'Engineering Physics', credits: 4 },
  SS: { code: '25TDP-151', name: 'SOFT SKILLS - I', credits: 1 },
} satisfies Record<string, T>;

export interface Template {
  name: string;
  description: string;
  subjects: T[];
}

/** First-year CSE subject sets seen in the 2025 batch (the two groups swap sets between semesters). */
export const TEMPLATES: Template[] = [
  { name: 'Sem 1 · Group with Bio / AI Lab', description: '10 subjects, 21 graded credits', subjects: [S.LTPS, S.DTI, S.ACP, S.AI, S.CGL, S.COMM1, S.M1, S.SEMI, S.BIO, S.UHV] },
  { name: 'Sem 1 · Group with Physics / EDT', description: '8 subjects, 21 graded credits', subjects: [S.LTPS, S.ACP, S.EDT, S.COMM1, S.M1, S.EP, S.SEMI, S.UHV] },
  { name: 'Sem 2 · Group with DE / Physics', description: '9 subjects, 23 credits', subjects: [S.DSA, S.PP, S.DE, S.EDT, S.GP, S.COMM2, S.M2, S.EP, S.SS] },
  { name: 'Sem 2 · Group with Bio / AI Lab', description: '11 subjects, 23 credits', subjects: [S.DSA, S.DTI, S.PP, S.DE, S.AI, S.GP, S.CGL, S.COMM2, S.M2, S.BIO, S.SS] },
];

export function subjectsFromTemplate(t: Template): Subject[] {
  return t.subjects.map((x) => newSubject({ ...x }));
}
