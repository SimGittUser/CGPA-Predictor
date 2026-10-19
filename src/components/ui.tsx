import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GradeLetter } from '../lib/types';

export function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '–';
  return Number(n.toFixed(dp)).toString();
}

export const pct = (p: number) => {
  if (p >= 0.995 && p < 1) return '>99%';
  if (p > 0 && p < 0.01) return '<1%';
  return `${Math.round(p * 100)}%`;
};

function parse(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

interface NumberFieldProps {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  label?: string;
  /** Replace an empty field with this on blur. */
  fallback?: number;
}

/** Number input that lets you type freely ("12.", "") and commits parsed values as you go. */
export function NumberField({ value, onChange, min, max, step, placeholder, className, label, fallback }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current && parse(text) !== value) setText(value === null ? '' : String(value));
  }, [value]);

  const clampv = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  return (
    <input
      className={`num ${className ?? ''}`}
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      step={step}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const t = e.target.value.replace(',', '.');
        if (!/^-?\d*\.?\d*$/.test(t)) return;
        setText(t);
        const n = parse(t);
        if (n !== null) onChange(clampv(n));
        else if (t.trim() === '') onChange(null);
      }}
      onBlur={() => {
        focused.current = false;
        let n = parse(text);
        if (n === null && fallback !== undefined) n = fallback;
        if (n !== null) n = clampv(n);
        setText(n === null ? '' : String(n));
        if (n !== value) onChange(n);
      }}
    />
  );
}

export function gradeTone(g: GradeLetter | null): string {
  if (!g) return 'none';
  if (g === 'A+' || g === 'A') return 'a';
  if (g === 'B+' || g === 'B') return 'b';
  if (g === 'C+' || g === 'C') return 'c';
  if (g === 'D') return 'd';
  return 'f';
}

export function GradeChip({ grade, size = 'md', dim }: { grade: GradeLetter | null; size?: 'sm' | 'md' | 'lg'; dim?: boolean }) {
  return (
    <span className={`chip chip-${size} tone-${gradeTone(grade)} ${dim ? 'chip-dim' : ''}`}>{grade ?? '–'}</span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className ?? ''}`}>{children}</section>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Internal progress: solid = secured, lighter = projected, track = max. */
export function InternalBar({ secured, projected, maxPossible, max }: { secured: number; projected: number; maxPossible: number; max: number }) {
  if (max <= 0) return null;
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="ibar" aria-hidden>
      <div className="ibar-max" style={{ width: w(maxPossible) }} />
      <div className="ibar-proj" style={{ width: w(projected) }} />
      <div className="ibar-sec" style={{ width: w(secured) }} />
    </div>
  );
}

export function Icon({ name }: { name: 'back' | 'plus' | 'trash' | 'more' | 'check' | 'chev' | 'x' | 'sun' | 'moon' }) {
  const p: Record<string, ReactNode> = {
    back: <path d="M15 18l-6-6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="19" cy="12" r="1.2" />
      </>
    ),
    check: <path d="M5 12l5 5 9-10" />,
    chev: <path d="M9 6l6 6-6 6" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />,
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}
