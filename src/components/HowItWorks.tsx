import { useState } from 'react';
import { BASE_CUTOFFS, CALIBRATION, GRADE_POINTS, KNOWN_SHIFTS, PASS_GRADES, cutoffsFor, gradeForTotal } from '../lib/grading';
import type { GradeLetter } from '../lib/types';
import { Card, GradeChip, fmt } from './ui';

const ROWS: GradeLetter[] = ['A', 'B+', 'B', 'C+'];

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
        {(['A', 'B+', 'B', 'C+'] as const).map((g) => {
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
          const cy = top + ri * rowH + rowH / 2 + (r.student === 1 ? -6 : 6);
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

export function HowItWorks() {
  const rows = CALIBRATION.filter((r) => r.grade !== 'Qualified');
  const hits = rows.filter((r) => gradeForTotal(r.internal + r.external, cutoffsFor(KNOWN_SHIFTS[r.code] ?? 0)) === r.grade).length;

  return (
    <div className="stack prose">
      <Card>
        <h3>How your grade is worked out</h3>
        <ol>
          <li>
            <b>Total = internal + external</b>, out of 100. The split depends on the course: hybrid courses are 75/25, practical 60/40, theory 50/50, and
            General Proficiency is 100% external.
          </li>
          <li>
            <b>Grades are relative.</b> CU sets cutoffs from how the whole class scored, so the same total can get different grades in different subjects or
            years. Nobody knows the exact cutoffs in advance, so the app treats each one as a range.
          </li>
          <li>
            <b>SGPA = Σ(grade points × credits) ÷ Σ credits</b>. Qualified-only subjects are left out. CGPA does the same across all semesters.
          </li>
        </ol>
        <div className="scale">
          {PASS_GRADES.concat('F').map((g) => (
            <span key={g} className="scale-item">
              <GradeChip grade={g} size="sm" /> {GRADE_POINTS[g]}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <h3>Where the cutoffs come from</h3>
        <CalibrationChart />
        <p>
          Estimated from real 2025-batch results: two students, two semesters, {rows.length} graded subjects. With these cutoffs the model gets {hits} of{' '}
          {rows.length} grades exactly right, and the rest are one grade off, all right at a boundary. The four SGPAs on those result sheets (7.86, 8.35, 8.00,
          7.91) come out exactly.
        </p>
        <div className="table-wrap">
          <table className="grades">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Typical cutoff</th>
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
        <p className="small muted">A+ never showed up in the data (a 95.33 still got an A), and C/D are extrapolated, so those ranges are wider. Below 40 is a fail.</p>
      </Card>

      <Card>
        <h3>How the prediction works</h3>
        <ul>
          <li>
            <b>Internals.</b> Each head (MST, assignments, worksheets…) counts for a set number of marks. Your average in a head is scaled to its weight. For work
            still to come, “projected” assumes you keep your current average. If weights don't add up to the internal max, they're scaled to fit.
          </li>
          <li>
            <b>Externals.</b> By default your external is expected to match your internal percentage. In past results externals averaged about the same but
            varied by roughly ±12 points either way. Change it per subject with the slider.
          </li>
          <li>
            <b>Chances.</b> The app runs your semester 4,000 times, varying your external score, your remaining internals and where each cutoff lands. The chance
            of a grade is the share of runs where you got it.
          </li>
          <li>
            <b>Minimum external.</b> “Typical” is what clears the usual cutoff. “Safe” clears it in 95% of cases. The plan on the main page finds the single
            external percentage that reaches your target SGPA in every subject at once.
          </li>
        </ul>
        <p className="small muted">
          This is an estimate, not an official calculator. A strong or weak class can move cutoffs more than this; use the cutoff adjustment on a subject if you
          hear how the class did.
        </p>
      </Card>
    </div>
  );
}
