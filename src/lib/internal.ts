import type { Component, Subject } from './types';

/** Assumed score (internal and external) for a subject with no marks yet. The 2025 results averaged ~85% on both. */
export const DEFAULT_PCT = 0.8;

export interface ComponentSummary {
  /** Average % across counted entries, or null if none entered. */
  avg: number | null;
  /** Entries that count towards the head (after best-of). */
  counted: number;
  /** How many entries the head expects in total. */
  expected: number;
  /** Fraction (0–1) of the head's weight already earned, missing entries counted as zero. */
  securedFrac: number;
  /** Fraction if the missing entries match your average so far. */
  projectedFrac: number;
  /** Fraction if every missing entry is full marks. */
  maxFrac: number;
}

function entryPcts(c: Component): number[] {
  return c.entries
    .filter((e) => e.obtained !== null && e.max > 0)
    .map((e) => Math.min(1, Math.max(0, (e.obtained as number) / e.max)))
    .sort((a, b) => b - a);
}

export function summarizeComponent(c: Component, fallbackPct: number): ComponentSummary {
  const pcts = entryPcts(c);
  const expected = Math.max(1, c.bestOf ?? c.expectedCount ?? pcts.length);
  const used = pcts.slice(0, expected);
  const sum = used.reduce((a, b) => a + b, 0);
  const avg = used.length ? sum / used.length : null;
  const missing = expected - used.length;
  return {
    avg,
    counted: used.length,
    expected,
    securedFrac: sum / expected,
    projectedFrac: (sum + missing * (avg ?? fallbackPct)) / expected,
    maxFrac: (sum + missing) / expected,
  };
}

export interface InternalSummary {
  /** Marks already locked in (unentered work counted as zero). */
  secured: number;
  /** Expected final internal if you keep your current average. */
  projected: number;
  /** Best case: full marks on everything still to come. */
  maxPossible: number;
  /** 0–1: share of the internal weight that has marks entered. */
  completion: number;
  hasData: boolean;
  weightSum: number;
  components: Map<string, ComponentSummary>;
}

export function summarizeInternal(s: Subject): InternalSummary {
  const components = new Map<string, ComponentSummary>();
  const max = s.internalMax;
  if (max <= 0) {
    return { secured: 0, projected: 0, maxPossible: 0, completion: 1, hasData: false, weightSum: 0, components };
  }
  if (s.internalMode === 'direct') {
    const v = s.directInternal === null ? null : Math.min(max, Math.max(0, s.directInternal));
    return {
      secured: v ?? 0,
      projected: v ?? max * DEFAULT_PCT,
      maxPossible: v ?? max,
      completion: v === null ? 0 : 1,
      hasData: v !== null,
      weightSum: max,
      components,
    };
  }

  // Heads without marks yet are projected at the subject's weighted average so far.
  let wAvg = 0;
  let wWithData = 0;
  for (const c of s.components) {
    const a = summarizeComponent(c, DEFAULT_PCT);
    if (a.avg !== null && c.weight > 0) {
      wAvg += a.avg * c.weight;
      wWithData += c.weight;
    }
  }
  const fallback = wWithData ? wAvg / wWithData : DEFAULT_PCT;

  let W = 0;
  let secured = 0;
  let projected = 0;
  let maxPossible = 0;
  let done = 0;
  for (const c of s.components) {
    const cs = summarizeComponent(c, fallback);
    components.set(c.id, cs);
    const w = Math.max(0, c.weight);
    W += w;
    secured += w * cs.securedFrac;
    projected += w * cs.projectedFrac;
    maxPossible += w * cs.maxFrac;
    done += w * (cs.counted / cs.expected);
  }

  if (W <= 0) {
    return { secured: 0, projected: max * DEFAULT_PCT, maxPossible: max, completion: 0, hasData: false, weightSum: 0, components };
  }
  // Weights that don't add up to the internal max are scaled proportionally.
  const scale = max / W;
  return {
    secured: secured * scale,
    projected: projected * scale,
    maxPossible: maxPossible * scale,
    completion: done / W,
    hasData: wWithData > 0,
    weightSum: W,
    components,
  };
}
