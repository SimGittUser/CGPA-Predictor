import { initialState } from './factory';
import type { AppState } from './types';

export const STORAGE_KEY = 'cu-grade-predictor:v1';

/** Fill in any fields missing from older or hand-edited saves. */
export function normalize(raw: unknown): AppState {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  if (!Array.isArray(r.subjects)) throw new Error('Not a CU Grade Predictor backup (no subjects list).');
  return {
    ...base,
    ...r,
    version: 1,
    subjects: r.subjects.map((s) => ({
      ...s,
      components: (s.components ?? []).map((c) => ({
        ...c,
        expectedCount: c.expectedCount ?? null,
        bestOf: c.bestOf ?? null,
        entries: c.entries ?? [],
      })),
      cutoffShift: s.cutoffShift ?? 0,
      expectedExternalPct: s.expectedExternalPct ?? null,
      targetGrade: s.targetGrade ?? null,
      internalMode: s.internalMode ?? 'components',
      directInternal: s.directInternal ?? null,
      excluded: !!s.excluded,
    })),
    pastSemesters: r.pastSemesters ?? [],
    settings: { ...base.settings, ...(r.settings ?? {}) },
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : initialState();
  } catch {
    return initialState();
  }
}

export function saveState(s: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function downloadBackup(s: AppState) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cu-grades-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readBackup(file: File): Promise<AppState> {
  return normalize(JSON.parse(await file.text()));
}
