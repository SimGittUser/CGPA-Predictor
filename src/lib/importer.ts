import { COURSE_TYPES } from './grading';
import { HEADS_BY_KIND, KNOWN_SUBJECTS, classify, newComponent, newEntry, newSubject, uid } from './factory';

export { classify };
import type { Component, CourseType, Entry, Subject } from './types';

/** One line of text, from OCR (with word confidences and position) or from pasted text. */
type Box = { x0: number; y0: number; x1: number; y1: number };

export interface SourceLine {
  text: string;
  words?: { text: string; confidence: number; bbox?: Box }[];
  /** Which uploaded image and where on it, for showing the line next to the number. */
  image?: number;
  bbox?: Box;
}

export interface ImportedRow {
  id: string;
  description: string;
  max: number | null;
  obtained: number | null;
  /** Why the student should double-check this row, if anything. */
  flag: string | null;
  source?: { image: number; bbox: NonNullable<SourceLine['bbox']> };
}

export interface ImportedSubject {
  id: string;
  name: string;
  rows: ImportedRow[];
}

/** Below this OCR confidence (0–100) a number gets flagged for checking. Clean reads score 94–97. */
const MIN_CONFIDENCE = 88;

const NUM = String.raw`\d{1,3}(?:[.,]\d{1,2})?`;
const SUBJECT_RE = /^sub[ij1l]ect\s*[:;.]?\s*(.+)$/i;
const ROW_RE = new RegExp(String.raw`^(.*?[A-Za-z].*?)\s+(${NUM})\s+(\S+)$`);
const ROW_NO_MARKS_RE = new RegExp(String.raw`^(.*?[A-Za-z].*?)\s+(${NUM})$`);
const HEADER_RE = /descr|obt\b|obt\.|max\.?\s*mark/i;
/** App chrome that sits above the table, e.g. the "< MARKS VIEW ▽" title bar (its filter icon reads as a digit). */
const CHROME_RE = /marks\s*view/i;
const ABSENT_RE = /^(ab|abs|absent)$/i;

const toNum = (s: string) => Number(s.replace(',', '.'));

function clean(text: string) {
  return text
    .replace(/[|“”"‘’'`~_—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRow(line: SourceLine): ImportedRow | null {
  const text = clean(line.text);
  const conf = (fromEnd: number) => line.words?.[line.words.length - fromEnd]?.confidence ?? 100;
  // Point at the two numbers (max and marks) rather than the whole line, so the crop is readable.
  const nums = (line.words ?? []).slice(-2).map((w) => w.bbox).filter((b): b is Box => !!b);
  const box = nums.length
    ? { x0: Math.min(...nums.map((b) => b.x0)), y0: Math.min(...nums.map((b) => b.y0)), x1: Math.max(...nums.map((b) => b.x1)), y1: Math.max(...nums.map((b) => b.y1)) }
    : line.bbox;
  const source = line.image !== undefined && box ? { image: line.image, bbox: box } : undefined;

  let m = text.match(ROW_RE);
  if (m) {
    const description = m[1].trim();
    const max = toNum(m[2]);
    const raw = m[3];
    let obtained: number | null = null;
    let flag: string | null = null;

    if (ABSENT_RE.test(raw)) {
      obtained = 0;
      flag = 'Marked absent, so counted as 0.';
    } else {
      const digits = raw.replace(/[^\d.,]/g, '');
      if (!/\d/.test(digits)) {
        flag = "We couldn't read this number. Please type it.";
      } else {
        obtained = toNum(digits);
        // Stray characters next to a number (like 1" for 11) mean the reader struggled.
        const lastToken = line.text.trim().split(/\s+/).pop() ?? '';
        const junk = digits !== raw || /[^\d.,]/.test(lastToken);
        if (junk || conf(1) < MIN_CONFIDENCE || conf(2) < MIN_CONFIDENCE) flag = "We're not sure we read this right. Please check.";
      }
    }

    if (obtained !== null && obtained > max) {
      // A dropped decimal point is the usual OCR slip: 155 for 15.5.
      const guess = obtained / 10;
      if (!/[.,]/.test(raw) && guess <= max) {
        flag = `We read ${raw}, which is more than ${max}. We changed it to ${guess}. Please check.`;
        obtained = guess;
      } else flag = `This is more than the maximum (${max}). Please fix it.`;
    }
    return { id: uid(), description, max, obtained, flag, source };
  }

  m = text.match(ROW_NO_MARKS_RE);
  if (m && !HEADER_RE.test(text)) {
    return { id: uid(), description: m[1].trim(), max: toNum(m[2]), obtained: null, flag: 'No marks shown for this one yet.', source };
  }
  return null;
}

/** Turn lines from one or more screenshots (in order) into subjects with their rows. */
export function parseLines(lines: SourceLine[]): ImportedSubject[] {
  const subjects: ImportedSubject[] = [];
  let current: ImportedSubject | null = null;
  let image: number | undefined;
  let headerSeen = false;

  for (const line of lines) {
    if (line.image !== image) {
      image = line.image;
      headerSeen = false;
    }
    const text = clean(line.text);
    if (!text || CHROME_RE.test(text)) continue;
    // OCR reads the roman numeral I as "|" (APTITUDE - |).
    const sm = clean(line.text.replace(/\|/g, 'I')).match(SUBJECT_RE);
    if (sm) {
      current = { id: uid(), name: sm[1].trim(), rows: [] };
      subjects.push(current);
      headerSeen = true;
      continue;
    }
    if (HEADER_RE.test(text) && !/\d\s*$/.test(text)) continue;
    const row = parseRow(line);
    if (!row) continue;
    const kind = classify(row.description).kind;
    // Only rows that look like real assessments: not status bars, titles or icons read as digits.
    if (kind === 'other' && (row.obtained === null || !headerSeen)) continue;
    if (!headerSeen && row.obtained === null) continue;
    if (!current) {
      // A screenshot that starts mid-subject, with no earlier screenshot to continue.
      current = { id: uid(), name: '', rows: [] };
      subjects.push(current);
    }
    // Rows above this screenshot's first "Subject:" continue the previous screenshot's last subject.
    current.rows.push(row);
  }
  return subjects.filter((s) => s.rows.length > 0);
}

/** The same row read twice (overlapping screenshots): keep one, preferring the clean read. */
export function dedupeRows(rows: ImportedRow[]): ImportedRow[] {
  const byKey = new Map<string, ImportedRow>();
  for (const r of rows) {
    const key = normalizeName(r.description);
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, r);
    else if (prev.flag && !r.flag) byKey.set(key, r);
    else if (!prev.flag && !r.flag && prev.obtained !== r.obtained && prev.obtained !== null && r.obtained !== null)
      byKey.set(key, { ...prev, flag: `Your screenshots show two different marks for this (${prev.obtained} and ${r.obtained}). Please check.` });
  }
  return [...byKey.values()];
}

export function parseText(text: string): ImportedSubject[] {
  return parseLines(text.split(/\r?\n/).map((t) => ({ text: t })));
}

// ---- Mapping rows onto mark boxes ------------------------------------------------

/** Best guess at how a subject is marked, from the kinds of rows it has. */
export function inferType(rows: { description: string }[]): CourseType {
  const kinds = new Set(rows.map((r) => classify(r.description).kind));
  const lab = kinds.has('worksheet') || kinds.has('labmst');
  if (rows.some((r) => /hybrid/i.test(r.description)) || (kinds.has('mst') && lab)) return 'hybrid';
  if (lab) return 'practical';
  return 'theory';
}

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

function sameName(a: string, b: string) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.includes(short);
}

export function findSubject<T extends { name: string }>(name: string, list: T[]): T | undefined {
  return list.find((s) => sameName(s.name, name));
}

export function knownSubject(name: string) {
  return findSubject(name, KNOWN_SUBJECTS);
}

/** Credits to start from when we don't recognise a subject. The student is asked to check. */
export const GUESSED_CREDITS: Record<CourseType, number> = { hybrid: 4, practical: 2, theory: 3, external: 1, custom: 3 };

const trailingNumber = (label: string) => {
  const m = label.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};

/** The head and box a CUIMS row belongs in, if they exist yet. */
function locate(components: Component[], description: string): { comp?: Component; entry?: Entry } {
  const { kind, n } = classify(description);
  const comp =
    kind === 'other'
      ? components.find((c) => normalizeName(c.name) === normalizeName(description))
      : components.find((c) => classify(c.name).kind === kind);
  if (!comp) return {};
  let entry: Entry | undefined;
  if (kind === 'other') entry = comp.entries[0];
  else if (n !== null && kind !== 'labmst') entry = comp.entries.find((e) => trailingNumber(e.label) === n);
  else entry = comp.entries.find((e) => e.obtained === null) ?? (comp.entries.length === 1 ? comp.entries[0] : undefined);
  return { comp, entry };
}

/** Put imported marks into the right boxes, adding heads and boxes as needed. Returns a new subject. */
export function applyRows(subject: Subject, rows: ImportedRow[]): Subject {
  const components: Component[] = subject.components.map((c) => ({ ...c, entries: c.entries.map((e) => ({ ...e })) }));

  for (const row of rows) {
    const { kind, n } = classify(row.description);
    let { comp, entry } = locate(components, row.description);
    if (!comp) {
      const h = HEADS_BY_KIND[kind];
      comp = kind === 'other' ? newComponent({ name: row.description, weight: h.weight }) : newComponent({ name: h.name, weight: h.weight });
      components.push(comp);
    }

    if (!entry) {
      const h = HEADS_BY_KIND[kind];
      const label = kind === 'other' ? row.description : n !== null && kind !== 'labmst' ? `${h.label} ${n}` : h.label;
      entry = newEntry({ label, max: row.max ?? h.max });
      comp.entries.push(entry);
      comp.entries.sort((a, b) => (trailingNumber(a.label) ?? 0) - (trailingNumber(b.label) ?? 0));
    }
    if (row.max !== null) entry.max = row.max;
    if (row.obtained !== null) entry.obtained = row.obtained;
  }
  return { ...subject, internalMode: 'components', components };
}

// ---- Review drafts -------------------------------------------------------------------

export interface DraftSubject {
  id: string;
  name: string;
  rows: ImportedRow[];
  credits: number | null;
  creditsGuessed: boolean;
  type: CourseType;
  /** Subject already in the app that these marks update. */
  existingId: string | null;
  include: boolean;
}

export function draftsFrom(imported: ImportedSubject[], existing: Subject[]): DraftSubject[] {
  // Same subject over two screenshots → one draft.
  const merged: ImportedSubject[] = [];
  for (const s of imported) {
    const prev = s.name ? findSubject(s.name, merged) : undefined;
    if (prev) prev.rows.push(...s.rows);
    else merged.push({ ...s, rows: [...s.rows] });
  }
  for (const s of merged) s.rows = dedupeRows(s.rows);
  return merged.map((s) => {
    const have = s.name ? findSubject(s.name, existing) : undefined;
    const known = s.name ? knownSubject(s.name) : undefined;
    // What we know about a subject (its real split) wins over an older saved guess.
    const type = known?.type ?? have?.type ?? inferType(s.rows);
    // Known CU credits win over what's saved, which may be an old guess. The student still sees and can change them.
    const credits = known?.credits ?? have?.credits ?? null;
    // A shaky read of a mark the student already checked last time: keep their number.
    const rows = s.rows.map((r) => {
      if (!r.flag || !have) return r;
      const saved = locate(have.components, r.description).entry?.obtained;
      return saved == null ? r : { ...r, obtained: saved, flag: null };
    });
    return {
      id: s.id,
      name: have?.name ?? known?.name ?? prettyName(s.name),
      rows,
      credits: credits ?? GUESSED_CREDITS[type],
      creditsGuessed: credits === null,
      type,
      existingId: have?.id ?? null,
      include: true,
    };
  });
}

/** "APTITUDE - I" → "Aptitude - I"; leaves mixed-case names alone. */
function prettyName(name: string) {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(I{1,3}|Iv|Vi{0,3})\b/g, (r) => r.toUpperCase());
}

/** Apply reviewed drafts to the subject list: update matched subjects, add new ones. */
export function applyDrafts(subjects: Subject[], drafts: DraftSubject[]): Subject[] {
  let out = [...subjects];
  // If MSTs have been written in other subjects but none shows here, this subject has no MSTs.
  const hasMst = (d: DraftSubject) => d.rows.some((r) => classify(r.description).kind === 'mst');
  const mstsHappened = drafts.some((d) => d.include && hasMst(d));
  for (const d of drafts) {
    if (!d.include) continue;
    const credits = d.credits ?? GUESSED_CREDITS[d.type];
    const known = knownSubject(d.name);
    // A custom split comes from what we know about the subject (e.g. 70/30, 40/60), not the 50/50 placeholder.
    const split =
      d.type !== 'custom'
        ? { internalMax: COURSE_TYPES[d.type].internal, externalMax: COURSE_TYPES[d.type].external }
        : known?.internalMax !== undefined
          ? { internalMax: known.internalMax, externalMax: known.externalMax ?? 100 - known.internalMax }
          : {};
    const existing = d.existingId ? out.find((s) => s.id === d.existingId) : undefined;
    if (existing) {
      const splitChanged =
        existing.type !== d.type ||
        ('internalMax' in split && (split.internalMax !== existing.internalMax || split.externalMax !== existing.externalMax));
      const base: Subject = { ...existing, name: d.name || existing.name, credits, ...(splitChanged ? { type: d.type, ...split } : {}) };
      out = out.map((s) => (s.id === existing.id ? applyRows(base, d.rows) : s));
    } else {
      const base = newSubject({
        code: known?.code ?? '',
        excluded: known?.excluded ?? false,
        name: d.name || 'Unnamed subject',
        credits,
        type: d.type,
        ...split,
      });
      // Only boxes CUIMS actually showed (plus the MSTs, always two): no invented tests.
      const filled = applyRows(base, d.rows);
      const noMsts = mstsHappened && !hasMst(d);
      out.push({
        ...filled,
        components: filled.components
          .filter((c) => !(noMsts && classify(c.name).kind === 'mst'))
          .map((c) => (classify(c.name).kind === 'mst' ? c : { ...c, entries: c.entries.filter((e) => e.obtained !== null) })),
      });
    }
  }
  return out;
}
