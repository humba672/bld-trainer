import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { enumerateF2LCases, f2lCaseOf, f2lComplete, isSolved, slotSolved } from './cfop';
import { inSolverNotation, solveF2LCase } from './f2l-solve';
import solutions from '../data/f2l-solutions.json';

const cases = [...enumerateF2LCases().values()].filter((entry) => !entry.solved);
const stateOf = (setup: string) => applyAlg(SOLVED, setup);
const shipped = solutions as Record<
  string,
  { setup: string; cubeFrame: string; alg: string; length: number }
>;

/**
 * The search that produced these takes a minute and a half for all 41, so they are worked out by
 * scripts/build-f2l-solutions.mjs and committed. What is checked here is that every one of them
 * still does what it says - which is fast, because applying an algorithm is not searching for one.
 */
describe('the algorithms that ship with the site', () => {
  it('has one for every case', () => {
    expect(Object.keys(shipped)).toHaveLength(41);
    for (const entry of cases) expect(shipped[entry.key], `case ${entry.key}`).toBeTruthy();
  });

  it('finishes the first two layers from every case', () => {
    for (const [key, solution] of Object.entries(shipped)) {
      const state = stateOf(solution.setup);
      expect(f2lCaseOf(state, 'FR').key, `${key} is the case it says`).toBe(key);
      expect(f2lComplete(applyAlg(state, solution.cubeFrame)), `${key} solves`).toBe(true);
    }
  });

  it('leaves the cross and the other three slots alone', () => {
    for (const [key, solution] of Object.entries(shipped)) {
      const after = applyAlg(stateOf(solution.setup), solution.cubeFrame);
      for (const slot of ['FL', 'BL', 'BR'] as const) {
        expect(slotSolved(after, slot), `${key} keeps ${slot}`).toBe(true);
      }
    }
  });

  it('reads in R, U and F, the way an alg sheet does', () => {
    for (const [key, solution] of Object.entries(shipped)) {
      expect(inSolverNotation(solution.cubeFrame), `${key} notation`).toBe(solution.alg);
      expect(solution.alg, `${key} uses only R, U and F`).toMatch(/^[RUF][2']?( [RUF][2']?)*$/);
      expect(solution.length).toBe(solution.alg.split(' ').length);
    }
  });

  it('is short, as an F2L algorithm should be', () => {
    const lengths = Object.values(shipped).map((solution) => solution.length);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(9);
    expect(lengths.reduce((a, b) => a + b, 0) / lengths.length).toBeLessThan(8);
  });
});

describe('searching for one', () => {
  it('finds nothing to do when the pair is already in', () => {
    expect(solveF2LCase(SOLVED)).toBe('');
  });

  it('agrees with what shipped, on the quick ones', () => {
    for (const [key, solution] of Object.entries(shipped).filter(([, s]) => s.length <= 6)) {
      expect(solveF2LCase(stateOf(solution.setup))?.split(' ').length, key).toBe(solution.length);
    }
  });

  it('is shortest: nothing one turn quicker exists', () => {
    for (const solution of Object.values(shipped).filter((s) => s.length <= 6).slice(0, 4)) {
      expect(solveF2LCase(stateOf(solution.setup), solution.length - 1)).toBeNull();
    }
  });
});

describe('what the cube looks like when a rep ends', () => {
  it('ends with the pair in, whatever the last layer is doing', () => {
    // This is what the driller waits for: the first two layers, not a solved cube. Setting a case
    // up turns the free layer, so plenty of them finish with the last layer still scrambled.
    const endsUnsolved = Object.values(shipped).filter((solution) => {
      const after = applyAlg(stateOf(solution.setup), solution.cubeFrame);
      return f2lComplete(after) && !isSolved(after);
    });
    expect(endsUnsolved.length).toBeGreaterThan(10);
  });
});

describe('reading it the way you hold the cube', () => {
  it('turns the free layer into U, and the slot faces into R and F', () => {
    expect(inSolverNotation("D R' F2")).toBe("U F' R2");
    expect(inSolverNotation('')).toBe('');
  });

  it('keeps the direction of every turn', () => {
    expect(inSolverNotation("D'")).toBe("U'");
    expect(inSolverNotation('D2')).toBe('U2');
  });
});
