import { describe, expect, it } from 'vitest';
import {
  averageOf,
  bestAverage,
  bestSingle,
  effectiveMs,
  formatMs,
  meanOf,
  type Solve,
} from './averages';

const solve = (timeMs: number, penalty: Solve['penalty'] = 'none'): Solve => ({
  at: 0,
  scramble: '',
  randomState: true,
  timeMs,
  penalty,
  moves: [],
  unclear: [],
});

const times = (...ms: number[]) => ms.map((t) => solve(t));

describe('what the clock says', () => {
  it('adds two seconds for a +2', () => {
    expect(effectiveMs(solve(12000))).toBe(12000);
    expect(effectiveMs(solve(12000, 'plus2'))).toBe(14000);
  });

  it('puts a DNF last', () => {
    expect(effectiveMs(solve(9000, 'dnf'))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('averages', () => {
  it('waits until there are enough solves', () => {
    expect(averageOf(times(10000, 11000), 5)).toBeNull();
    expect(averageOf(times(10000, 11000, 12000, 13000), 5)).toBeNull();
  });

  it('drops the best and the worst', () => {
    // 10, 20, 12, 14, 16 -> drop 10 and 20, mean of 12, 14, 16
    expect(averageOf(times(10000, 20000, 12000, 14000, 16000), 5)).toBe(14000);
  });

  it('only counts the last five', () => {
    expect(averageOf(times(99000, 10000, 20000, 12000, 14000, 16000), 5)).toBe(14000);
  });

  it('takes one DNF as the worst solve', () => {
    const solves = [solve(12000), solve(14000), solve(16000), solve(11000), solve(0, 'dnf')];
    // Drop the DNF as worst and 11 as best: mean of 12, 14, 16.
    expect(averageOf(solves, 5)).toBe(14000);
  });

  it('gives up on two DNFs', () => {
    const solves = [solve(12000), solve(14000), solve(16000), solve(0, 'dnf'), solve(0, 'dnf')];
    expect(averageOf(solves, 5)).toBe(Number.POSITIVE_INFINITY);
  });

  it('means everything for an average of two', () => {
    expect(averageOf(times(10000, 20000), 2)).toBe(15000);
  });
});

describe('mean of three', () => {
  it('drops nothing', () => {
    expect(meanOf(times(10000, 20000, 30000), 3)).toBe(20000);
  });

  it('waits for three solves', () => {
    expect(meanOf(times(10000, 20000), 3)).toBeNull();
  });

  it('is a DNF if any of them was', () => {
    const solves = [solve(10000), solve(20000), solve(0, 'dnf')];
    expect(meanOf(solves, 3)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('bests', () => {
  it('finds the best single, ignoring DNFs', () => {
    const solves = [solve(12000), solve(9000, 'dnf'), solve(11000)];
    expect(bestSingle(solves)).toBe(11000);
    expect(bestSingle([solve(0, 'dnf')])).toBeNull();
  });

  it('finds the best average anywhere in the session', () => {
    const solves = times(20000, 20000, 20000, 20000, 20000, 10000, 10000, 10000, 10000, 10000);
    expect(bestAverage(solves, 5)).toBe(10000);
  });

  it('has no best average before five solves', () => {
    expect(bestAverage(times(10000, 11000), 5)).toBeNull();
  });
});

describe('how a time reads', () => {
  it('shows hundredths', () => {
    expect(formatMs(12340)).toBe('12.34');
    expect(formatMs(1234)).toBe('1.23');
  });

  it('shows minutes when it has to', () => {
    expect(formatMs(62340)).toBe('1:02.34');
    expect(formatMs(600000)).toBe('10:00.00');
  });

  it('says DNF and nothing at all', () => {
    expect(formatMs(Number.POSITIVE_INFINITY)).toBe('DNF');
    expect(formatMs(null)).toBe('—');
  });
});
