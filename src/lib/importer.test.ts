import { describe, expect, it } from 'vitest';
import { newSubject } from './factory';
import { applyDrafts, applyRows, classify, draftsFrom, inferType, parseLines, parseText, type SourceLine } from './importer';
import { summarizeInternal } from './internal';

/** Tesseract's output (single-block mode) for a real CUIMS marks screenshot, misreads included. */
const OCR_TEXT = `Subject: APTITUDE - I

Exam Description                    Max. Marks Marks Obt.
Mid-Semester Test-1                   20              15.5

Subject: Computer Organization and Architecture

Exam Description ~~ Max Marks Marks Obt.
Mid-Semester Test-1                   20              18

Subject: Probability and Statistics

Exam Description ~~ Max. Marks Marks Obt.
Mid-Semester Test-1                   20              14

Subject: Object Oriented Programming using Java

Exam Description                    Max. Marks Marks Obt.
MST-1 Hybrid                   20          15

Practical assessment-1                 30              28

Practical Mid Term                     30              30

Subject: Database Management System
ExamiDescription Max Marks Maris Obt.__
MST-1 Hybrid                   20          17

Practical assessment-1                 30              27

Practical Mid Term                     30              27.5

Subject: Agile Development Methodologies

Exam Description ~~ Max. Marks Marks Obt.
MST-1 Hybrid                   20          1"

Practical assessment-1                 30              27

Practical Mid Term                     30              28

Subject: Advanced Data Structures

Exam Description                    Max. Marks Marks Obt.
MST-1 Hybrid                   20          16

Practical assessment-1                 30              28

Practical Mid Term                     30              29

Subject: Critical Enquiry and Research Methodology

Exam Description                    Max. Marks Marks Obt.
Test-1                                    10              9

Test-2                                    10              9

Test-4                                    10              9

Test-5                                    10              10`;

describe('reading CUIMS marks text', () => {
  const subjects = parseText(OCR_TEXT);

  it('finds every subject and row', () => {
    expect(subjects.map((s) => s.name)).toEqual([
      'APTITUDE - I',
      'Computer Organization and Architecture',
      'Probability and Statistics',
      'Object Oriented Programming using Java',
      'Database Management System',
      'Agile Development Methodologies',
      'Advanced Data Structures',
      'Critical Enquiry and Research Methodology',
    ]);
    expect(subjects.map((s) => s.rows.length)).toEqual([1, 1, 1, 3, 3, 3, 3, 4]);
  });

  it('reads the numbers', () => {
    expect(subjects[0].rows[0]).toMatchObject({ description: 'Mid-Semester Test-1', max: 20, obtained: 15.5, flag: null });
    expect(subjects[4].rows[2]).toMatchObject({ description: 'Practical Mid Term', max: 30, obtained: 27.5, flag: null });
  });

  it('flags the garbled one instead of trusting it', () => {
    const agile = subjects[5].rows[0];
    expect(agile.max).toBe(20);
    expect(agile.flag).toMatch(/not sure/);
  });

  it('flags low-confidence OCR words and fixes dropped decimals', () => {
    const [s] = parseLines([
      { text: 'Subject: DBMS' },
      { text: 'Practical Mid Term 30 275', words: [{ text: '30', confidence: 92 }, { text: '275', confidence: 67 }] },
      { text: 'Practical assessment-1 30 2', words: [{ text: '30', confidence: 95 }, { text: '2', confidence: 83 }] },
      { text: 'MST-1 Hybrid 20 n', words: [{ text: '20', confidence: 93 }, { text: 'n', confidence: 12 }] },
    ]);
    expect(s.rows[0]).toMatchObject({ obtained: 27.5 });
    expect(s.rows[0].flag).toMatch(/changed it to 27.5/);
    expect(s.rows[1].flag).toMatch(/not sure/);
    expect(s.rows[2]).toMatchObject({ obtained: null });
    expect(s.rows[2].flag).toMatch(/couldn't read/);
  });

  it('keeps rows from a second screenshot under the subject they continue', () => {
    const subs = parseLines([{ text: 'Subject: Java' }, { text: 'MST-1 Hybrid 20 15' }, { text: 'Practical Mid Term 30 30' }]);
    expect(subs).toHaveLength(1);
    expect(subs[0].rows).toHaveLength(2);
  });
});

/** OCR of a second CUIMS screenshot, title bar included ("< MARKS VIEW" + filter icon read as 4). */
const SECOND = `<                               MARKS VIEW 4
Subject: Probability and Statistics
Exam Description                                         Max. Marks          Marks Obt.
Mid-Semester Test-1                                   20                     1"
Subject: APTITUDE - |
Mid-Semester Test-1                                   20                     13
Subject: Database Management System
MST-1 Hybrid                                           20                     14.5
Practical assessment-1                                30                     27.99
Practical Mid Term                      30             29
Subject: Agile Development Methodologies
Exam Description                                         Max. Marks          Marks Obt.
MST-1 Hybrid                                           20                     16
Practical assessment-1                                30                     26
Practical assessment-2                                30                     26
Practical Mid Term                      30             26
Subject: Object Oriented Programming using Java
MST-1 Hybrid                                           20                     10.5
Practical assessment-3/Project Evaluation       30                     24
BxamDescripion ~~ Max Marks  MarksObt`;

const asImages = (...texts: string[]): SourceLine[] =>
  texts.flatMap((t, image) => t.split('\n').map((text) => ({ text, image })));

describe('screenshot noise and overlaps', () => {
  it("ignores the app's title bar", () => {
    const subs = parseLines(asImages(SECOND));
    expect(subs.map((x) => x.name)).toEqual([
      'Probability and Statistics',
      'APTITUDE - I',
      'Database Management System',
      'Agile Development Methodologies',
      'Object Oriented Programming using Java',
    ]);
    expect(subs.flatMap((x) => x.rows).some((r) => /view/i.test(r.description))).toBe(false);
  });

  it('reads two-decimal marks and numbered practicals', () => {
    const subs = parseLines(asImages(SECOND));
    expect(subs[2].rows[1]).toMatchObject({ obtained: 27.99, flag: null });
    expect(classify('Practical assessment-3/Project Evaluation')).toEqual({ kind: 'worksheet', n: 3 });
  });

  it('merges overlapping screenshots without doubling marks', () => {
    const top = `Subject: Agile Development Methodologies
MST-1 Hybrid 20 16
Practical assessment-1 30 26`;
    // the second screenshot repeats the end of the first, then carries on
    const bottom = `Practical assessment-1 30 26
Practical assessment-2 30 26
Practical Mid Term 30 26
Subject: Advanced Data Structures
MST-1 Hybrid 20 14`;
    const drafts = draftsFrom(parseLines(asImages(top, bottom)), []);
    expect(drafts.map((d) => d.name)).toEqual(['Agile Development Methodologies', 'Advanced Data Structures']);
    expect(drafts[0].rows.map((r) => r.description)).toEqual(['MST-1 Hybrid', 'Practical assessment-1', 'Practical assessment-2', 'Practical Mid Term']);
  });

  it('keeps the clean read when one copy of a row was garbled', () => {
    const a = 'Subject: Probability and Statistics\nMid-Semester Test-1 20 1"';
    const b = 'Subject: Probability and Statistics\nMid-Semester Test-1 20 11';
    const [d] = draftsFrom(parseLines(asImages(a, b)), []);
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({ obtained: 11, flag: null });
  });
});

describe('matching rows to mark boxes', () => {
  it('classifies CUIMS row names', () => {
    expect(classify('MST-1 Hybrid')).toEqual({ kind: 'mst', n: 1 });
    expect(classify('Mid-Semester Test-1')).toEqual({ kind: 'mst', n: 1 });
    expect(classify('Practical assessment-1')).toEqual({ kind: 'worksheet', n: 1 });
    expect(classify('Practical Mid Term')).toEqual({ kind: 'labmst', n: null });
    expect(classify('Test-4')).toEqual({ kind: 'test', n: 4 });
    expect(classify('Assignment 2')).toEqual({ kind: 'assignment', n: 2 });
    // our own head names map back to the same kinds
    expect(classify('Surprise Tests / Quizzes').kind).toBe('test');
    expect(classify('Lab MST').kind).toBe('labmst');
    expect(classify('Lab Worksheets').kind).toBe('worksheet');
  });

  it('guesses how a subject is marked', () => {
    const subs = parseText(OCR_TEXT);
    expect(inferType(subs[3].rows)).toBe('hybrid');
    expect(inferType(subs[0].rows)).toBe('theory');
    expect(inferType(subs[7].rows)).toBe('theory');
  });

  it('fills the right boxes, creating missing ones', () => {
    const subs = parseText(OCR_TEXT);
    const java = applyRows(newSubject({ type: 'hybrid', name: 'Java' }), subs[3].rows);
    const byName = Object.fromEntries(java.components.map((c) => [c.name, c.entries]));
    expect(byName['Mid-Sem Tests (MST)'][0]).toMatchObject({ label: 'MST 1', obtained: 15, max: 20 });
    expect(byName['Practical Assessments (worksheets)'][0]).toMatchObject({ label: 'Practical 1', obtained: 28, max: 30 });
    expect(byName['Practical Mid Term'][0]).toMatchObject({ obtained: 30, max: 30 });

    const cerm = applyRows(newSubject({ type: 'theory', name: 'CERM' }), subs[7].rows);
    const tests = cerm.components.find((c) => c.name.startsWith('Surprise'))!.entries;
    expect(tests.map((e) => [e.label, e.obtained])).toEqual([
      ['Test 1', 9],
      ['Test 2', 9],
      ['Test 4', 9],
      ['Test 5', 10],
    ]);
    expect(summarizeInternal(cerm).hasData).toBe(true);
  });

  it('updates existing subjects and adds new ones without duplicates', () => {
    const existing = [newSubject({ name: 'Advanced Data Structures', type: 'hybrid', credits: 4 })];
    const drafts = draftsFrom(parseText(OCR_TEXT), existing);
    expect(drafts.find((d) => d.name === 'Advanced Data Structures')!.existingId).toBe(existing[0].id);
    expect(drafts.find((d) => d.name === 'Aptitude - I')).toMatchObject({ creditsGuessed: false, credits: 1, type: 'theory' });

    const once = applyDrafts(existing, drafts);
    expect(once).toHaveLength(8);
    // importing the same screenshot again changes nothing structurally
    const twice = applyDrafts(once, draftsFrom(parseText(OCR_TEXT), once));
    expect(twice).toHaveLength(8);
    const ads = twice.find((s) => s.name === 'Advanced Data Structures')!;
    expect(ads.components.flatMap((c) => c.entries).filter((e) => e.obtained !== null)).toHaveLength(3);
  });

  it('keeps a mark the student corrected when the same shaky read comes back', () => {
    const first = draftsFrom(parseText(OCR_TEXT), []);
    const agile = first.find((d) => d.name.startsWith('Agile'))!;
    agile.rows[0] = { ...agile.rows[0], obtained: 11, flag: null };
    const saved = applyDrafts([], first);

    const again = draftsFrom(parseText(OCR_TEXT), saved).find((d) => d.name.startsWith('Agile'))!;
    expect(again.rows[0]).toMatchObject({ obtained: 11, flag: null });
  });

  it('leaves out MSTs for a subject that had none when other subjects already had MST-1', () => {
    const subjects = applyDrafts([], draftsFrom(parseText(OCR_TEXT), []));
    const cerm = subjects.find((s) => s.name.startsWith('Critical'))!;
    const java = subjects.find((s) => s.name.startsWith('Object'))!;
    expect(cerm.components.some((c) => c.name.startsWith('Mid-Sem'))).toBe(false);
    expect(summarizeInternal(cerm).mst).toBeNull();
    expect(summarizeInternal(java).mst).toMatchObject({ done: 1, remaining: 1 });
  });

  it('fills in 3rd-semester credits instead of guessing', () => {
    const drafts = draftsFrom(parseText(OCR_TEXT), []);
    const credits = Object.fromEntries(drafts.map((d) => [d.name, [d.credits, d.creditsGuessed]]));
    expect(credits['Probability and Statistics']).toEqual([4, false]);
    expect(credits['Object Oriented Programming using Java']).toEqual([2, false]);
    expect(credits['Agile Development Methodologies']).toEqual([4, false]);
    expect(credits['Advanced Data Structures']).toEqual([4, false]);
    expect(credits['Computer Organization and Architecture']).toEqual([3, false]);
    expect(credits['Critical Enquiry and Research Methodology']).toEqual([1, false]);
    expect(credits['Aptitude - I']).toEqual([1, false]);
    expect(credits['Database Management System']).toEqual([4, false]);
  });

  it('uses the real 70/30 split for sem-1 subjects like Engineering Physics', () => {
    const [s] = applyDrafts([], draftsFrom(parseText('Subject: Engineering Physics\nMST-1 Hybrid 20 18'), []));
    expect(s).toMatchObject({ internalMax: 70, externalMax: 30, credits: 4 });
    const fixed = applyDrafts([{ ...s, internalMax: 75, externalMax: 25, type: 'hybrid' }], draftsFrom(parseText('Subject: Engineering Physics\nMST-1 Hybrid 20 18'), [{ ...s, internalMax: 75, externalMax: 25, type: 'hybrid' }]));
    expect(fixed[0]).toMatchObject({ internalMax: 70, externalMax: 30 });
  });

  it('recognises first-year subjects and their credits', () => {
    const [d] = draftsFrom(parseText('Subject: DATA STRUCTURES AND ALGORITHMS\nMST-1 Hybrid 20 18'), []);
    expect(d).toMatchObject({ name: 'Data Structures and Algorithms', credits: 4, creditsGuessed: false, type: 'hybrid' });
  });
});
