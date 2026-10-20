import type { SubjectModel } from '../lib/predict';
import { fmt } from './ui';

/** Marks rounded up to the next half mark, e.g. 15.2 → 15.5. */
export const half = (n: number) => fmt(Math.ceil(n * 2 - 1e-9) / 2, 1);

export type AimState = 'secured' | 'ok' | 'impossible';

export function aimState(p: number): AimState {
  if (p <= 0) return 'secured';
  if (p > 1 + 1e-9) return 'impossible';
  return 'ok';
}

/** The marks to aim for in the next MST and the end-sem exam at effort level p. */
export function aimMarks(m: SubjectModel, p: number) {
  const mst = m.internal.mst;
  const q = Math.min(1, Math.max(0, p));
  return {
    /** Every MST still to come, each with the same aim. */
    msts: mst && mst.remaining > 0 ? mst.labels.map((label) => ({ label, aim: half(q * mst.max), max: mst.max })) : [],
    est: m.subject.externalMax > 0 ? { aim: half(q * m.subject.externalMax), max: m.subject.externalMax } : null,
  };
}

/** One line: "MST 1: 16/20 · MST 2: 16/20 · End-sem: 38/50". */
export function AimLine({ m, p }: { m: SubjectModel; p: number }) {
  const st = aimState(p);
  if (st === 'secured') return <span className="aim-line">Already secured. Just pass the end-sem</span>;
  if (st === 'impossible') return <span className="aim-line muted">Give it your best: every mark here still adds up</span>;
  const a = aimMarks(m, p);
  return (
    <span className="aim-line">
      {a.msts.map((x) => (
        <span key={x.label} className="aim-pill">
          {x.label}:{' '}
          <b key={x.aim} className="pop">
            {x.aim}
          </b>
          /{x.max}
        </span>
      ))}
      {a.est && (
        <span className="aim-pill">
          End-sem:{' '}
          <b key={a.est.aim} className="pop">
            {a.est.aim}
          </b>
          /{a.est.max}
        </span>
      )}
    </span>
  );
}
