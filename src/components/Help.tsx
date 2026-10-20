import { useState } from 'react';
import { BASE_CUTOFFS, CALIBRATION, GRADE_POINTS, KNOWN_SHIFTS, PASS_GRADES, cutoffsFor, gradeForTotal } from '../lib/grading';
import type { GradeLetter } from '../lib/types';
import { Card, Collapsible, GradeChip, fmt } from './ui';

const ROWS: GradeLetter[] = ['A+', 'A', 'B+', 'B', 'C+'];

function CalibrationChart() {
  const [hover, setHover] = useState<number | null>(null);
  const W = 420;
  const left = 30;
  const right = 12;
  const rowH = 34;
  const top = 20;
  const H = top + ROWS.length * rowH + 26;
  const lo = 60;
  const hi = 100;
  const x = (v: number) => left + ((v - lo) / (hi - lo)) * (W - left - right);
  const rows = CALIBRATION.map((r, i) => ({ ...r, i, total: r.internal + r.external })).filter((r) => r.grade !== 'Qualified');
  const h = hover !== null ? rows.find((r) => r.i === hover) : null;

  return (
    <figure className="calib">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Past totals by grade with estimated cutoffs" onMouseLeave={() => setHover(null)}>
        {(['A+', 'A', 'B+', 'B', 'C+'] as const).map((g) => {
          const c = BASE_CUTOFFS[g];
          return (
            <g key={g}>
              <rect x={x(c.mu - c.sigma)} y={top - 6} width={x(c.mu + c.sigma) - x(c.mu - c.sigma)} height={ROWS.length * rowH + 6} className="calib-band" />
              <line x1={x(c.mu)} x2={x(c.mu)} y1={top - 6} y2={top + ROWS.length * rowH} className="calib-cut" />
              <text x={x(c.mu)} y={top - 9} textAnchor="middle" className="calib-cut-label">
                {g} ≈ {c.mu}
              </text>
            </g>
          );
        })}
        {ROWS.map((g, ri) => (
          <g key={g}>
            <line x1={left} x2={W - right} y1={top + ri * rowH + rowH / 2} y2={top + ri * rowH + rowH / 2} className="calib-grid" />
            <text x={left - 8} y={top + ri * rowH + rowH / 2 + 4} textAnchor="end" className="calib-row-label">
              {g}
            </text>
          </g>
        ))}
        {rows.map((r) => {
          const ri = ROWS.indexOf(r.grade as GradeLetter);
          if (ri < 0) return null;
          const cy = top + ri * rowH + rowH / 2 + (r.student - 2) * 7;
          const special = r.code in KNOWN_SHIFTS;
          return (
            <g key={r.i} onMouseEnter={() => setHover(r.i)} onTouchStart={() => setHover(r.i)}>
              <circle cx={x(r.total)} cy={cy} r={12} fill="transparent" />
              <circle cx={x(r.total)} cy={cy} r={hover === r.i ? 6 : 4.5} className={`calib-dot ${special ? 'hollow' : ''}`} />
            </g>
          );
        })}
        {[60, 70, 80, 90, 100].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="calib-axis">
            {t}
          </text>
        ))}
      </svg>
      <figcaption className="small muted">
        {h ? (
          <>
            <b>{h.name}</b>: {fmt(h.internal, 2)} + {fmt(h.external, 2)} = <b>{fmt(h.total, 2)}</b> → got <b>{h.grade}</b>, model says{' '}
            {gradeForTotal(h.total, cutoffsFor(KNOWN_SHIFTS[h.code] ?? 0))}
            {h.code in KNOWN_SHIFTS ? ' (external-only subject, cutoffs about 8 lower)' : ''}
          </>
        ) : (
          <>Each dot is one subject result from the 2025 batch (total out of 100). Lines are the estimated cutoffs; shaded bands show how far they move. Hover a dot for details.</>
        )}
      </figcaption>
    </figure>
  );
}

export function Help() {
  const rows = CALIBRATION.filter((r) => r.grade !== 'Qualified');
  const hits = rows.filter((r) => gradeForTotal(r.internal + r.external, cutoffsFor(KNOWN_SHIFTS[r.code] ?? 0)) === r.grade).length;

  return (
    <div className="stack prose">
      <Card>
        <h3>How to use this site</h3>
        <ol>
          <li>
            Open CUIMS, go to the page with your internal marks (the table with “Exam Description”, “Max. Marks” and “Marks Obt.”) and take a screenshot.
          </li>
          <li>
            On <b>My Subjects</b>, tap <b>Got new marks?</b> and choose the screenshot. Long page? Pick several screenshots at once.
          </li>
          <li>Check the marks we read. Anything we weren't sure about is highlighted in yellow, next to that bit of your screenshot.</li>
          <li>See your expected SGPA and CGPA, and tap any subject to see what you need in its final exam.</li>
          <li>Got new marks next week? Upload a new screenshot. Marks you already have are updated, never doubled.</li>
        </ol>
      </Card>

      <Card className="faq">
        <Collapsible title="What are internal and external marks?">
          <p>
            <b>Internal marks</b> are everything you get during the semester: MSTs, assignments, surprise tests, quizzes, lab worksheets. <b>External marks</b>{' '}
            come from the final (end-semester) exam.
          </p>
          <p>The two add up to 100. How they're split depends on the subject:</p>
          <ul>
            <li>Theory + Lab subjects: 75 internal + 25 final exam</li>
            <li>Lab / practical subjects: 60 internal + 40 final exam</li>
            <li>Theory-only subjects (like Maths): 50 internal + 50 final exam</li>
            <li>General Proficiency: 100 final exam, no internals</li>
          </ul>
        </Collapsible>
        <Collapsible title="A test was out of a different number (like 30 instead of 20)">
          <p>
            Tap the small number after the “/” in that box and change it. Need more boxes? Tap <b>Add one more</b>. To rename or remove boxes, open{' '}
            <b>Subject settings</b> at the bottom of the subject and tap <b>Change the mark boxes</b>.
          </p>
        </Collapsible>
        <Collapsible title="What does “worth 20 marks” mean?">
          <p>
            Each part of your internals counts for a fixed share of the internal total. If MSTs are worth 20 marks and you average 80% in them, they give you 16
            of those 20 marks.
          </p>
          <p>
            These shares are our best guess at CU's scheme. If your teacher tells you a different split, change it under <b>Subject settings → Change the mark
            boxes</b>.
          </p>
        </Collapsible>
        <Collapsible title="How does the plan for my next MST and end-sem work?">
          <p>
            You set a goal (an SGPA, or a CGPA if you've added your past results). For each subject, the plan picks a grade and the lowest marks that get it,
            so that together your grades reach the goal. It asks for the same percentage in your next MST and the end-sem exam, and spreads the effort so no
            subject needs more than it has to.
          </p>
          <p>
            Want a different grade in a subject? Open it and tap the grade. The plan keeps your choice (📌) and works the other subjects around it. The slider
            there shows what happens if you score more or less in the MST: more in the MST means you need less in the end-sem.
          </p>
          <p>
            <b>To be safe</b> aims high enough to work even if this year's cut-offs come out high. <b>Usually enough</b> is what works in a normal year.
          </p>
        </Collapsible>
        <Collapsible title="What is relative grading?">
          <p>
            At CU, the marks needed for each grade depend on how the whole class did. If everyone scores high, you need more for an A. If a subject is hard for
            everyone, you need less.
          </p>
          <p>
            Nobody knows the exact cut-offs before results come out, so this site gives two numbers. <b>Safe</b> is enough even if the cut-offs come out high.{' '}
            <b>Normal year</b> is what's usually enough.
          </p>
        </Collapsible>
        <Collapsible title="How are SGPA and CGPA calculated?">
          <p>Every grade is worth some points:</p>
          <div className="scale">
            {PASS_GRADES.concat('F').map((g) => (
              <span key={g} className="scale-item">
                <GradeChip grade={g} size="sm" /> {GRADE_POINTS[g]}
              </span>
            ))}
          </div>
          <p>
            <b>SGPA</b> = (points × credits for every subject, added up) ÷ total credits. So a 5-credit subject like Maths counts five times as much as a 1-credit
            lab. Pass/fail subjects (“Qualified”) don't count.
          </p>
          <p>
            <b>CGPA</b> is the same calculation over all your semesters together.
          </p>
        </Collapsible>
        <Collapsible title="How sure is the prediction?">
          <p>
            It's a good estimate, not a promise. The site imagines your semester 4,000 times. Each time your final exams go a bit better or worse and the cut-offs
            move a bit. The “chance” is how often you hit your goal.
          </p>
          <p>The more marks you fill in, the more accurate it gets. This is not an official CU tool.</p>
        </Collapsible>
        <Collapsible title="Is my screenshot uploaded anywhere?">
          <p>
            No. The screenshot is read by your own phone or laptop, inside the browser. The first time, the browser downloads the text-reading tool (a few MB).
            After that it works quickly.
          </p>
        </Collapsible>
        <Collapsible title="It read a number wrong">
          <p>
            On the “Check your marks” screen, tap the number and type the right one. Already saved? Open the subject and fix it in its box. Clearer screenshots
            (not photos of a screen, not zoomed out) get read better.
          </p>
        </Collapsible>
        <Collapsible title="Where are my marks saved? Can I lose them?">
          <p>
            They're saved in this browser on this device. Nobody else can see them. They stay even if you close the tab, but clearing your browser data deletes
            them.
          </p>
          <p>
            To keep a copy or move to another phone or laptop, open the <b>⋯ menu</b> (top right) → <b>Save a backup file</b>. On the other device, use{' '}
            <b>Load a backup file</b>.
          </p>
        </Collapsible>
      </Card>

      <Card>
        <Collapsible title="For the curious: where the cut-offs come from">
          <CalibrationChart />
          <p>
            Worked out from real 2025-batch results: three students, two semesters each, {rows.length} graded subjects. These cut-offs give {hits} of{' '}
            {rows.length} grades exactly. The rest are one grade off, all on totals close to a cut-off. All six SGPAs on those result sheets (7.86, 8.35, 8.00,
            7.91, 9.67, 9.43) come out exactly.
          </p>
          <div className="table-wrap">
            <table className="grades">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Usual total needed</th>
                  <th>Could be anywhere from</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(BASE_CUTOFFS) as (keyof typeof BASE_CUTOFFS)[]).map((g) => {
                  const c = BASE_CUTOFFS[g];
                  return (
                    <tr key={g}>
                      <td>
                        <GradeChip grade={g} size="sm" />
                      </td>
                      <td>{c.mu}</td>
                      <td>
                        {fmt(c.mu - 1.645 * c.sigma, 1)} – {fmt(Math.min(100, c.mu + 1.645 * c.sigma), 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Totals are out of 100. The A+ line is tight: the lowest A+ seen was 95.5 and the highest A was 95.33. A few subjects mark more generously
            (Communication Skills-I, Soft Skills, General Proficiency), so their cut-offs are lower. C and D are estimated, so those ranges are wider. Below 40 is
            a fail.
          </p>
        </Collapsible>
      </Card>
    </div>
  );
}
