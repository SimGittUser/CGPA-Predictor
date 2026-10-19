import { useMemo, useState } from 'react';
import { fmt, pct } from './ui';

/** Distribution of simulated SGPAs in 0.1-wide bins, with the target marked. */
export function SgpaHistogram({ sgpa, target }: { sgpa: Float64Array; target: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const bins = useMemo(() => {
    if (!sgpa.length) return [];
    const lo = Math.floor(sgpa[0] * 10) / 10;
    const hi = Math.floor(sgpa[sgpa.length - 1] * 10) / 10;
    const n = Math.round((hi - lo) * 10) + 1;
    const counts = new Array(n).fill(0);
    for (const v of sgpa) counts[Math.min(n - 1, Math.round((Math.floor(v * 10 + 1e-9) / 10 - lo) * 10))]++;
    return counts.map((c, i) => ({ from: lo + i / 10, share: c / sgpa.length }));
  }, [sgpa]);

  if (bins.length < 2) return null;
  const W = 640;
  const H = 110;
    const peak = Math.max(...bins.map((b) => b.share));
  const from = bins[0].from;
  const to = bins[bins.length - 1].from + 0.1;
  const x = (v: number) => ((v - from) / (to - from)) * W;
  const bw = W / bins.length;
  const targetX = target !== null && target >= from && target <= to ? x(target) : null;
  const h = hover !== null ? bins[hover] : null;

  return (
    <figure className="hist">
      <svg viewBox={`0 0 ${W} ${H + 1}`} role="img" aria-label="Spread of possible SGPAs" onMouseLeave={() => setHover(null)}>
        {bins.map((b, i) => {
          const bh = Math.max(2, (b.share / peak) * (H - 6));
          const reached = target !== null && b.from + 0.05 >= target;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect
                className={`hist-bar ${reached ? 'reached' : ''} ${hover === i ? 'hover' : ''}`}
                x={i * bw + 1}
                y={H - bh}
                width={Math.max(1, bw - 2)}
                height={bh}
                rx={Math.min(3, bw / 3)}
              />
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} className="hist-axis" />
        {targetX !== null && <line x1={targetX} x2={targetX} y1={0} y2={H} className="hist-target" />}
      </svg>
      <div className="hist-range small muted">
        <span>{fmt(from, 1)}</span>
        <span>{fmt(to, 1)}</span>
      </div>
      <figcaption className="muted small">
        {h ? (
          <>SGPA {fmt(h.from, 1)}–{fmt(h.from + 0.1, 1)}: <b>{pct(h.share)}</b> of simulated outcomes</>
        ) : (
          <>Spread of 4,000 simulated results{targetX !== null ? '. Bars right of the line reach your target' : ''}</>
        )}
      </figcaption>
    </figure>
  );
}
