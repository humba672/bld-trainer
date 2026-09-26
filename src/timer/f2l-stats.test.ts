import { describe, expect, it } from 'vitest';
import { ENOUGH_SAMPLES, f2lStats, nextToDrill, type DrillAttempt } from './f2l-stats';
import type { Solve } from './averages';

const pair = (caseKey: string, executionMs: number, recognitionMs = 500) => ({
  slot: 'FR',
  caseKey,
  recognitionMs,
  executionMs,
});

const solve = (pairs: ReturnType<typeof pair>[], extra: Partial<Solve> = {}): Solve => ({
  at: 0,
  scramble: '',
  randomState: true,
  timeMs: 20000,
  penalty: 'none',
  moves: [],
  unclear: [],
  pairs,
  verified: true,
  ...extra,
});

const drill = (caseKey: string, timeMs: number, solved = true): DrillAttempt => ({
  at: 0,
  caseKey,
  slot: 'FR',
  timeMs,
  moveCount: 7,
  solved,
});

/** Enough solves of one case to get it ranked. */
const solvesOf = (caseKey: string, ms: number, count = ENOUGH_SAMPLES) =>
  Array.from({ length: count }, () => solve([pair(caseKey, ms)]));

describe('which cases cost you time', () => {
  it('says nothing about a case it has barely seen', () => {
    const [stat] = f2lStats([solve([pair('slow', 5000)])], []);
    expect(stat.samples).toBe(1);
    expect(stat.ranked).toBe(false);
  });

  it('ranks a case once there is enough of it', () => {
    const stats = f2lStats(solvesOf('slow', 5000), []);
    expect(stats[0].ranked).toBe(true);
    expect(stats[0].samples).toBe(ENOUGH_SAMPLES);
    expect(stats[0].meanExecutionMs).toBe(5000);
  });

  it('counts drills towards execution', () => {
    const drills = Array.from({ length: ENOUGH_SAMPLES }, () => drill('drilled', 2000));
    const [stat] = f2lStats([], drills);
    expect(stat.samples).toBe(ENOUGH_SAMPLES);
    expect(stat.fromSolves).toBe(0);
    expect(stat.meanExecutionMs).toBe(2000);
  });

  it('throws away a drill you did not finish', () => {
    const drills = [drill('failed', 2000, false), drill('failed', 3000, true)];
    const [stat] = f2lStats([], drills);
    expect(stat.samples).toBe(1);
    expect(stat.meanExecutionMs).toBe(3000);
  });

  it('never counts recognition from a drill, because you knew what was coming', () => {
    const drills = Array.from({ length: ENOUGH_SAMPLES }, () => drill('drilled', 2000));
    const [stat] = f2lStats([], drills);
    expect(stat.meanRecognitionMs).toBeNull();
  });

  it('counts recognition from real solves', () => {
    const stats = f2lStats(solvesOf('seen', 3000), []);
    expect(stats[0].meanRecognitionMs).toBe(500);
  });

  it('ignores a solve the cube disagreed with', () => {
    const solves = [...solvesOf('case', 3000), solve([pair('case', 99000)], { verified: false })];
    const stats = f2lStats(solves, []);
    expect(stats[0].samples).toBe(ENOUGH_SAMPLES);
    expect(stats[0].meanExecutionMs).toBe(3000);
  });

  it('ignores a DNF', () => {
    const solves = [...solvesOf('case', 3000), solve([pair('case', 99000)], { penalty: 'dnf' })];
    expect(f2lStats(solves, [])[0].samples).toBe(ENOUGH_SAMPLES);
  });
});

describe('what it costs you per solve', () => {
  it('charges a slow case by how often it turns up', () => {
    // Ten solves: a slow case in every one, a quick case in every one.
    const solves = Array.from({ length: 10 }, () =>
      solve([pair('slow', 4000), pair('quick', 2000)]),
    );
    const stats = f2lStats(solves, []);
    const slow = stats.find((stat) => stat.caseKey === 'slow')!;
    const quick = stats.find((stat) => stat.caseKey === 'quick')!;

    expect(slow.perSolve).toBe(1);
    // A typical case here is 3s, so the slow one costs a second every solve.
    expect(slow.lossPerSolveMs).toBe(1000);
    expect(quick.lossPerSolveMs).toBe(-1000);
    expect(stats[0].caseKey).toBe('slow');
  });

  it('puts a rare disaster below a common annoyance', () => {
    // Twenty solves with two quick pairs and one middling one; five with a disaster. A typical
    // case is 2s, so the middling one costs 2s x 0.8 a solve and the disaster 6s x 0.2.
    const solves = [
      ...Array.from({ length: 20 }, () =>
        solve([pair('quick', 2000), pair('quick', 2000), pair('common', 4000)]),
      ),
      ...Array.from({ length: ENOUGH_SAMPLES }, () => solve([pair('rare', 8000)])),
    ];
    const stats = f2lStats(solves, []).filter((stat) => stat.ranked);
    expect(stats.map((stat) => stat.caseKey).slice(0, 2)).toEqual(['common', 'rare']);
    expect(stats[0].lossPerSolveMs).toBeCloseTo(1600, 0);
    expect(stats[1].lossPerSolveMs).toBeCloseTo(1200, 0);
  });

  it('puts the cases it can rank above the ones it cannot', () => {
    const solves = [...solvesOf('known', 3000), solve([pair('barely', 9000)])];
    const stats = f2lStats(solves, []);
    expect(stats[0].caseKey).toBe('known');
    expect(stats[1].caseKey).toBe('barely');
  });
});

describe('what to drill next', () => {
  const allCases = ['a', 'b', 'c'];

  it('goes for a case it has never seen', () => {
    const stats = f2lStats(solvesOf('a', 3000), []);
    expect(['b', 'c']).toContain(nextToDrill(stats, allCases));
  });

  it('goes for the worst once everything has been seen', () => {
    const solves = [
      ...Array.from({ length: ENOUGH_SAMPLES }, () => solve([pair('a', 5000)])),
      ...Array.from({ length: ENOUGH_SAMPLES }, () => solve([pair('b', 2000)])),
      ...Array.from({ length: ENOUGH_SAMPLES }, () => solve([pair('c', 3000)])),
    ];
    expect(nextToDrill(f2lStats(solves, []), allCases)).toBe('a');
  });

  it('goes for the thinnest evidence when nothing can be ranked yet', () => {
    const solves = [
      solve([pair('a', 3000)]),
      solve([pair('a', 3000)]),
      solve([pair('b', 3000)]),
      solve([pair('c', 3000)]),
      solve([pair('c', 3000)]),
    ];
    expect(nextToDrill(f2lStats(solves, []), allCases)).toBe('b');
  });
});
