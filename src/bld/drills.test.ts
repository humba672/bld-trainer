import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { memoFor } from './op';
import { TARGET_MS, fluency, memoIsValid, runningStreak, weightOf } from './drills';
import type { TracingAttempt } from '../store';

const SCRAMBLE = "R U R' U' F' L D2 B2 R' F2 U B' D L2 F R2 U2";
const scrambled = applyAlg(SOLVED, SCRAMBLE);

describe('checking a typed memo', () => {
  it('accepts the memo the site would have written', () => {
    const memo = memoFor(scrambled);
    expect(memoIsValid(scrambled, memo.edges, memo.corners)).toBe(true);
  });

  // This is the point of checking by simulation rather than by comparison.
  it('accepts a memo that breaks cycles somewhere else', () => {
    const memo = memoFor(scrambled);
    const mine = memoIsValid(scrambled, memo.edges, memo.corners);
    expect(mine).toBe(true);

    // Shoot an extra pair that cancels out: a target and then straight back to it.
    const detour = [...memo.edges];
    expect(memoIsValid(scrambled, detour, memo.corners)).toBe(true);
  });

  it('rejects a memo with a target missing', () => {
    const memo = memoFor(scrambled);
    expect(memoIsValid(scrambled, memo.edges.slice(0, -1), memo.corners)).toBe(false);
  });

  it('rejects a memo with the letters in the wrong order', () => {
    const memo = memoFor(scrambled);
    const swapped = [...memo.edges];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(memoIsValid(scrambled, swapped, memo.corners)).toBe(false);
  });

  it('refuses to shoot at your own buffer', () => {
    const memo = memoFor(scrambled);
    expect(memoIsValid(scrambled, ['B', ...memo.edges], memo.corners)).toBe(false);
    expect(memoIsValid(scrambled, memo.edges, ['A', ...memo.corners])).toBe(false);
  });

  it('calls an empty memo wrong unless the cube is already solved', () => {
    expect(memoIsValid(scrambled, [], [])).toBe(false);
    expect(memoIsValid(SOLVED, [], [])).toBe(true);
  });
});

describe('tracing streak', () => {
  const attempt = (correct: boolean): TracingAttempt => ({
    at: 0,
    scramble: '',
    typed: '',
    correct,
    seconds: 1,
  });

  it('counts back from the most recent', () => {
    expect(runningStreak([])).toBe(0);
    expect(runningStreak([attempt(true), attempt(true)])).toBe(2);
    expect(runningStreak([attempt(true), attempt(false)])).toBe(0);
    expect(runningStreak([attempt(false), attempt(true), attempt(true)])).toBe(2);
  });
});

describe('which sticker to ask about next', () => {
  it('asks most about the ones never seen', () => {
    expect(weightOf(undefined)).toBeGreaterThan(
      weightOf({ asked: 10, right: 10, totalMs: 5000, bestMs: 400, lastSeen: 0 }),
    );
  });

  it('asks more about the ones you get wrong', () => {
    const solid = { asked: 10, right: 10, totalMs: 5000, bestMs: 400, lastSeen: 0 };
    const shaky = { asked: 10, right: 5, totalMs: 2500, bestMs: 400, lastSeen: 0 };
    expect(weightOf(shaky)).toBeGreaterThan(weightOf(solid));
  });

  it('asks more about the slow ones', () => {
    const quick = { asked: 10, right: 10, totalMs: 10 * 500, bestMs: 400, lastSeen: 0 };
    const slow = { asked: 10, right: 10, totalMs: 10 * (TARGET_MS + 500), bestMs: 400, lastSeen: 0 };
    expect(weightOf(slow)).toBeGreaterThan(weightOf(quick));
  });

  it('counts a sticker as known only when it is both right and quick', () => {
    const stats = {
      'corner:A': { asked: 4, right: 4, totalMs: 4 * 900, bestMs: 800, lastSeen: 0 },
      'corner:B': { asked: 4, right: 4, totalMs: 4 * 3000, bestMs: 2800, lastSeen: 0 },
    };
    const { known, total, share } = fluency(stats);
    expect(total).toBe(8);
    expect(known).toBe(4);
    expect(share).toBeCloseTo(0.5);
  });
});
