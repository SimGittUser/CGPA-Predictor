import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ResolvedTheme, Theme } from '../lib/types';

export const THEMES: { id: ResolvedTheme; name: string; blurb: string }[] = [
  { id: 'light', name: 'Light', blurb: 'Warm paper, easy on the eyes' },
  { id: 'space', name: 'Space', blurb: 'A night sky full of stars' },
  { id: 'sand', name: 'Desert', blurb: 'Sand dunes under a low sun' },
  { id: 'ocean', name: 'Ocean', blurb: 'Deep water and slow waves' },
];

/** Browser toolbar colour per theme (mobile address bar). */
const BAR_COLOR: Record<ResolvedTheme, string> = { light: '#f6f3ec', space: '#060913', sand: '#ecdcbd', ocean: '#04212b' };

const prefersDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const resolveTheme = (t: Theme): ResolvedTheme => (t === 'system' ? (prefersDark() ? 'space' : 'light') : t);

export function applyTheme(t: ResolvedTheme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[t]);
}

/** The theme in use, following the device when set to 'system'. */
export function useResolvedTheme(theme: Theme): ResolvedTheme {
  const [resolved, setResolved] = useState(() => resolveTheme(theme));
  useEffect(() => {
    const sync = () => {
      const r = resolveTheme(theme);
      setResolved(r);
      applyTheme(r);
    };
    sync();
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [theme]);
  return resolved;
}

/**
 * Switch theme with the new one spreading out in a circle from where the student tapped
 * (View Transitions API). Browsers without it, or with reduced motion on, switch instantly.
 */
export function switchTheme(next: Theme, origin: { x: number; y: number } | null, commit: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const run = () => {
    applyTheme(resolveTheme(next));
    flushSync(commit);
  };
  if (!doc.startViewTransition || reducedMotion()) return run();
  const root = document.documentElement;
  root.style.setProperty('--vt-x', `${origin?.x ?? innerWidth / 2}px`);
  root.style.setProperty('--vt-y', `${origin?.y ?? 0}px`);
  doc.startViewTransition(run);
}

// ---- Background scenes ---------------------------------------------------------------

/** Deterministic star field: the same sky every visit. */
function starShadows(count: number, seed: number, size: number) {
  let a = seed;
  const rand = () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const tint = rand() < 0.15 ? '255 226 180' : rand() < 0.2 ? '196 214 255' : '255 255 255';
    out.push(`${Math.round(rand() * size)}px ${Math.round(rand() * size)}px rgb(${tint} / ${(0.45 + rand() * 0.55).toFixed(2)})`);
  }
  return out.join(', ');
}

function SpaceScene() {
  const layers = useMemo(
    () => [
      { cls: 'stars stars-sm', shadow: starShadows(260, 7, 2000) },
      { cls: 'stars stars-md', shadow: starShadows(70, 19, 2000) },
      { cls: 'stars stars-lg', shadow: starShadows(22, 43, 2000) },
    ],
    [],
  );
  return (
    <div className="scene scene-space" aria-hidden>
      <div className="space-haze" />
      {layers.map((l) => (
        <div key={l.cls} className={l.cls} style={{ boxShadow: l.shadow }} />
      ))}
      <span className="shooting-star" />
      <span className="shooting-star shooting-star-2" />
    </div>
  );
}

function SandScene() {
  return (
    <div className="scene scene-sand" aria-hidden>
      <div className="sun" />
      <svg className="dunes" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path className="dune dune-back" d="M0 205 C 220 150 430 168 650 196 C 880 226 1090 138 1440 178 L1440 320 L0 320 Z" />
        <path className="dune dune-mid" d="M0 248 C 250 196 520 228 770 252 C 1010 276 1210 212 1440 236 L1440 320 L0 320 Z" />
        <path className="dune dune-front" d="M0 288 C 300 258 560 280 830 294 C 1090 308 1270 276 1440 286 L1440 320 L0 320 Z" />
      </svg>
      <div className="grain" />
    </div>
  );
}

const BUBBLES = [
  { left: '8%', size: 6, dur: 19, delay: 0 },
  { left: '21%', size: 4, dur: 23, delay: 6 },
  { left: '37%', size: 8, dur: 27, delay: 11 },
  { left: '58%', size: 5, dur: 21, delay: 3 },
  { left: '72%', size: 7, dur: 25, delay: 15 },
  { left: '86%', size: 4, dur: 18, delay: 9 },
  { left: '94%', size: 6, dur: 29, delay: 19 },
];

function OceanScene() {
  // A wave strip twice the screen width, drifting sideways forever.
  const wave = 'M0 40 C 120 10 240 10 360 40 C 480 70 600 70 720 40 C 840 10 960 10 1080 40 C 1200 70 1320 70 1440 40 L1440 120 L0 120 Z';
  return (
    <div className="scene scene-ocean" aria-hidden>
      <div className="rays" />
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="bubble"
          style={{ left: b.left, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `-${b.delay}s` }}
        />
      ))}
      <div className="waves">
        {['wave-back', 'wave-front'].map((cls) => (
          <svg key={cls} className={`wave ${cls}`} viewBox="0 0 2880 120" preserveAspectRatio="none">
            <path d={wave} />
            <path d={wave} transform="translate(1440 0)" />
          </svg>
        ))}
      </div>
    </div>
  );
}

export function Scene({ theme }: { theme: ResolvedTheme }) {
  if (theme === 'space') return <SpaceScene />;
  if (theme === 'sand') return <SandScene />;
  if (theme === 'ocean') return <OceanScene />;
  return <div className="scene scene-light" aria-hidden />;
}

// ---- Picker ---------------------------------------------------------------------------

export function ThemePicker({ theme, onPick }: { theme: Theme; onPick: (t: Theme, origin: { x: number; y: number }) => void }) {
  const current = resolveTheme(theme);
  return (
    <div className="theme-picker">
      <div className="theme-grid" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={current === t.id}
            className={`theme-option ${current === t.id ? 'on' : ''}`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onPick(t.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
          >
            <span className={`swatch swatch-${t.id}`} aria-hidden />
            <span className="theme-name">{t.name}</span>
          </button>
        ))}
      </div>
      {theme !== 'system' && (
        <button type="button" className="link small" onClick={(e) => onPick('system', { x: e.clientX, y: e.clientY })}>
          Follow my device (Light by day, Space in dark mode)
        </button>
      )}
    </div>
  );
}
