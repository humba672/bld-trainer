/**
 * Times, penalties and averages, the way a speedcubing timer counts them.
 *
 * An average of five drops the best and the worst and means the rest. A DNF counts as the worst
 * one; two of them and there is no average at all. A +2 is two seconds on the clock, not a
 * separate thing to remember.
 */

export type Penalty = 'none' | 'plus2' | 'dnf';

export interface Solve {
  at: number;
  scramble: string;
  /** False if the scramble was random turns because the solver would not start. */
  randomState: boolean;
  /** First turn to last turn. */
  timeMs: number;
  penalty: Penalty;
  moves: Array<{ move: string; t: number }>;
  unclear: string[];
  stages?: { crossMs: number; f2lMs: number; ollMs: number; pllMs: number };
  pairs?: Array<{ slot: string; caseKey: string; recognitionMs: number; executionMs: number }>;
  moveCount?: number;
  tps?: number;
  /**
   * Whether the turns recorded actually add up to the state the cube says it is in. True means the
   * cube's own packets agree with the reconstruction; null means it could not be asked.
   */
  verified?: boolean | null;
}

/** What the clock says once penalties are counted. DNF sorts last. */
export function effectiveMs(solve: Solve): number {
  if (solve.penalty === 'dnf') return Number.POSITIVE_INFINITY;
  return solve.timeMs + (solve.penalty === 'plus2' ? 2000 : 0);
}

export const isDNF = (solve: Solve): boolean => solve.penalty === 'dnf';

/**
 * The average of the last `count` solves, or null if there are not that many yet. Returns
 * Infinity when too many were DNFs for an average to mean anything.
 */
export function averageOf(solves: Solve[], count: number): number | null {
  if (solves.length < count) return null;
  const window = solves.slice(-count).map(effectiveMs);
  if (count < 3) return window.reduce((a, b) => a + b, 0) / count;

  const dnfs = window.filter((ms) => !Number.isFinite(ms)).length;
  if (dnfs > 1) return Number.POSITIVE_INFINITY;

  const sorted = [...window].sort((a, b) => a - b);
  const middle = sorted.slice(1, -1); // drop the best and the worst
  return middle.reduce((a, b) => a + b, 0) / middle.length;
}

/**
 * The mean of the last `count` solves with nothing dropped, which is how a mo3 is counted. Any
 * DNF among them and there is no mean.
 */
export function meanOf(solves: Solve[], count: number): number | null {
  if (solves.length < count) return null;
  const window = solves.slice(-count).map(effectiveMs);
  if (window.some((ms) => !Number.isFinite(ms))) return Number.POSITIVE_INFINITY;
  return window.reduce((a, b) => a + b, 0) / count;
}

/** The best single, ignoring DNFs. */
export function bestSingle(solves: Solve[]): number | null {
  const times = solves.map(effectiveMs).filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

/** The best average of `count` over the whole session. */
export function bestAverage(solves: Solve[], count: number): number | null {
  let best: number | null = null;
  for (let end = count; end <= solves.length; end++) {
    const average = averageOf(solves.slice(0, end), count);
    if (average !== null && Number.isFinite(average) && (best === null || average < best)) {
      best = average;
    }
  }
  return best;
}

/** Times read as 12.34, and long ones as 1:02.34. */
export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (!Number.isFinite(ms)) return 'DNF';
  const total = ms / 1000;
  if (total < 60) return total.toFixed(2);
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}
