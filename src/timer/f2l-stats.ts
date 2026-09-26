/**
 * Which F2L cases are costing you time.
 *
 * Two sources feed this: the pairs read out of real solves, and reps from the driller. Execution
 * transfers between them, so both count towards it. Recognition does not - in a drill you already
 * know which case is coming - so recognition is only ever counted from real solves.
 *
 * Nothing is ranked on a handful of samples. One fumble doubles an average of two, and a ranking
 * built on that would send you off drilling the wrong thing.
 */

import type { Solve } from './averages';

/** The fewest reps before a case is worth ranking at all. */
export const ENOUGH_SAMPLES = 5;

export interface DrillAttempt {
  at: number;
  caseKey: string;
  slot: string;
  timeMs: number;
  moveCount: number;
  /** False when the slot did not end up filled: a failed rep, not a slow one. */
  solved: boolean;
}

export interface CaseStat {
  caseKey: string;
  /** Reps counted: pairs from solves plus successful drills. */
  samples: number;
  /** How many of those came from real solves. */
  fromSolves: number;
  meanExecutionMs: number;
  bestExecutionMs: number;
  /** Recognition is only meaningful in a real solve, so this counts solves only. */
  meanRecognitionMs: number | null;
  /** Times this case turned up per solve. */
  perSolve: number;
  /**
   * Seconds this case costs you per solve, against a typical case of your own. Cases you are
   * quicker than usual on come out negative, which is as it should be.
   */
  lossPerSolveMs: number;
  /** False when there is not enough here to say anything. */
  ranked: boolean;
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Work out, case by case, where the time goes.
 *
 * Only solves the cube agreed with are counted: a solve whose turns did not add up is not evidence
 * about anything.
 */
export function f2lStats(solves: Solve[], drills: DrillAttempt[]): CaseStat[] {
  const trusted = solves.filter((solve) => solve.verified !== false && solve.penalty !== 'dnf');
  const solveCount = trusted.length;

  const executions = new Map<string, number[]>();
  const recognitions = new Map<string, number[]>();
  const fromSolves = new Map<string, number>();
  const occurrences = new Map<string, number>();

  const push = (map: Map<string, number[]>, key: string, value: number) => {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  };

  for (const solve of trusted) {
    for (const pair of solve.pairs ?? []) {
      push(executions, pair.caseKey, pair.executionMs);
      push(recognitions, pair.caseKey, pair.recognitionMs);
      fromSolves.set(pair.caseKey, (fromSolves.get(pair.caseKey) ?? 0) + 1);
      occurrences.set(pair.caseKey, (occurrences.get(pair.caseKey) ?? 0) + 1);
    }
  }

  for (const drill of drills) {
    if (!drill.solved) continue;
    push(executions, drill.caseKey, drill.timeMs);
  }

  // What a typical case costs you, to measure the rest against.
  const typical = median([...executions.values()].flat());

  const stats: CaseStat[] = [];
  for (const [caseKey, times] of executions) {
    const samples = times.length;
    const perSolve = solveCount ? (occurrences.get(caseKey) ?? 0) / solveCount : 0;
    const recognised = recognitions.get(caseKey) ?? [];
    stats.push({
      caseKey,
      samples,
      fromSolves: fromSolves.get(caseKey) ?? 0,
      meanExecutionMs: mean(times),
      bestExecutionMs: Math.min(...times),
      meanRecognitionMs: recognised.length ? mean(recognised) : null,
      perSolve,
      lossPerSolveMs: (mean(times) - typical) * perSolve,
      ranked: samples >= ENOUGH_SAMPLES,
    });
  }

  // Worst first, but only among the cases there is enough of; the rest trail behind by how little
  // is known about them, so the driller has something to aim at.
  return stats.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    if (a.ranked) return b.lossPerSolveMs - a.lossPerSolveMs;
    return a.samples - b.samples;
  });
}

/**
 * What to drill next: the case costing you most, or the one you have least evidence about when
 * nothing has enough reps yet.
 */
export function nextToDrill(stats: CaseStat[], allCases: string[]): string {
  const unseen = allCases.filter((key) => !stats.some((stat) => stat.caseKey === key));
  if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)];

  const ranked = stats.filter((stat) => stat.ranked);
  if (ranked.length) return ranked[0].caseKey;

  const thinnest = [...stats].sort((a, b) => a.samples - b.samples);
  return thinnest[0]?.caseKey ?? allCases[0];
}
