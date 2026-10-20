import { MSTS_PER_SEMESTER, classify } from './factory';
import type { Component, Subject } from './types';

/** Assumed score (internal and external) for a subject with no marks yet. The 2025 results averaged ~85% on both. */
export const DEFAULT_PCT = 0.8;

export { MSTS_PER_SEMESTER };

export interface ComponentSummary {
  /** Average % across counted entries, or null if none entered. */
  avg: number | null;
  /** Entries with marks that count towards the head (after best-of). */
  counted: number;
  /** How many the head is out of: its known total (2 for MSTs, best-of N) or just what's been entered. */
  expected: number;
  /** Share of the head earned so far, tests still to come counted as zero. */
  securedFrac: number;
  /** Share if the tests still to come go like your average. */
  projectedFrac: number;
}

function entryPcts(c: Component): number[] {
  return c.entries
    .filter((e) => e.obtained !== null && e.max > 0)
    .map((e) => Math.min(1, Math.max(0, (e.obtained as number) / e.max)))
    .sort((a, b) => b - a);
}

/**
 * Only marks actually entered count. Empty boxes are just places to type; they don't mean a
 * test is coming, because the scheme changes between semesters. The exceptions are a head with
 * a known size: MSTs (two per semester) or a best-of-N rule.
 */
export function summarizeComponent(c: Component, fallbackPct: number): ComponentSummary {
  const pcts = entryPcts(c);
  const known = c.bestOf ?? c.expectedCount;
  const expected = Math.max(1, known ?? pcts.length);
  const used = pcts.slice(0, expected);
  const sum = used.reduce((a, b) => a + b, 0);
  const avg = used.length ? sum / used.length : null;
  return {
    avg,
    counted: used.length,
    expected,
    securedFrac: sum / expected,
    projectedFrac: (sum + (expected - used.length) * (avg ?? fallbackPct)) / expected,
  };
}

export interface MstPlanInfo {
  /** MSTs this semester (2 unless the student says otherwise). */
  total: number;
  /** MSTs already written. */
  done: number;
  /** MSTs still to come. */
  remaining: number;
  /** Names of the MSTs still to come, e.g. ["MST 2"] or ["MST 1", "MST 2"]. */
  labels: string[];
  /** What each MST is out of. */
  max: number;
  /** Internal marks if every remaining MST scored 0, everything else going like your average. */
  base: number;
  /** Internal marks added per unit (0–1) scored in all the remaining MSTs. */
  slope: number;
  /** Internal marks the MSTs are worth in total. */
  worth: number;
}

export interface InternalSummary {
  /** Expected final internal if you keep scoring like you have so far. */
  projected: number;
  /** Marks typed in. */
  count: number;
  hasData: boolean;
  weightSum: number;
  components: Map<string, ComponentSummary>;
  /** How the remaining MSTs move the internal total; null when there are no MSTs to plan. */
  mst: MstPlanInfo | null;
}

export function mstComponent(s: Subject): Component | undefined {
  return s.components.find((c) => classify(c.name).kind === 'mst');
}

export function summarizeInternal(s: Subject): InternalSummary {
  const components = new Map<string, ComponentSummary>();
  const max = s.internalMax;
  if (max <= 0) return { projected: 0, count: 0, hasData: false, weightSum: 0, components, mst: null };
  if (s.internalMode === 'direct') {
    const v = s.directInternal === null ? null : Math.min(max, Math.max(0, s.directInternal));
    return { projected: v ?? max * DEFAULT_PCT, count: v === null ? 0 : 1, hasData: v !== null, weightSum: max, components, mst: null };
  }

  // Heads without marks yet are projected at the subject's weighted average so far.
  let wAvg = 0;
  let wWithData = 0;
  let count = 0;
  for (const c of s.components) {
    const a = summarizeComponent(c, DEFAULT_PCT);
    count += a.counted;
    if (a.avg !== null && c.weight > 0) {
      wAvg += a.avg * c.weight;
      wWithData += c.weight;
    }
  }
  const fallback = wWithData ? wAvg / wWithData : DEFAULT_PCT;

  let W = 0;
  let projected = 0;
  for (const c of s.components) {
    const cs = summarizeComponent(c, fallback);
    components.set(c.id, cs);
    W += Math.max(0, c.weight);
    projected += Math.max(0, c.weight) * cs.projectedFrac;
  }
  if (W <= 0) return { projected: max * DEFAULT_PCT, count, hasData: false, weightSum: 0, components, mst: null };

  // Weights that don't add up to the internal max are scaled proportionally.
  const scale = max / W;
  projected *= scale;

  let mst: MstPlanInfo | null = null;
  const mc = mstComponent(s);
  const ms = mc && components.get(mc.id);
  if (mc && ms && mc.weight > 0) {
    const worth = mc.weight * scale;
    const remaining = Math.max(0, ms.expected - ms.counted);
    const filled = mc.entries.filter((e) => e.obtained !== null);
    // Name the MSTs still to come by the numbers not used yet (MST 1 done → MST 2, MST 3…).
    const used = new Set(filled.map((e) => Number(e.label.match(/(\d+)\s*$/)?.[1])));
    const labels: string[] = [];
    for (let n = 1; labels.length < remaining && n < 50; n++) if (!used.has(n)) labels.push(`MST ${n}`);
    mst = {
      total: ms.expected,
      done: ms.counted,
      remaining,
      labels,
      max: filled[0]?.max ?? mc.entries[0]?.max ?? 20,
      base: projected - worth * (ms.projectedFrac - ms.securedFrac),
      slope: (worth * remaining) / ms.expected,
      worth,
    };
  }

  return { projected, count, hasData: wWithData > 0, weightSum: W, components, mst };
}

/** Set how many MSTs the subject has this semester. */
export function withMstCount(s: Subject, count: number): Subject {
  const mc = mstComponent(s);
  if (!mc) return s;
  return { ...s, components: s.components.map((c) => (c === mc ? { ...c, expectedCount: Math.max(1, Math.round(count)) } : c)) };
}

/** Set how many internal marks the MSTs are worth, scaling the other heads to fill the rest. */
export function withMstWorth(s: Subject, worth: number): Subject {
  const mc = mstComponent(s);
  if (!mc) return s;
  const others = s.components.filter((c) => c !== mc).reduce((a, c) => a + Math.max(0, c.weight), 0);
  const rest = Math.max(0, s.internalMax - worth);
  return {
    ...s,
    components: s.components.map((c) => {
      if (c === mc) return { ...c, weight: worth };
      return { ...c, weight: others > 0 ? (Math.max(0, c.weight) * rest) / others : c.weight };
    }),
  };
}
