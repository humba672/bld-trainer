import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { enumerateF2LCases, f2lCaseOf, f2lComplete, isSolved, slotSolved } from './cfop';
import {
  DISPLAY_GRIP,
  DISPLAY_ROTATION,
  gripSentence,
  inSolverNotation,
  solveF2LCase,
} from './f2l-solve';
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

describe('the grip the printed solution assumes', () => {
  it('is the one where the free layer is up and the slot is at your front right', () => {
    const { up, front, right } = DISPLAY_GRIP;
    // The cross colour is underneath, its opposite on top, and the pair goes in between the two
    // faces you are looking at.
    expect(up).toBe('D');
    expect(front).toBe('R');
    expect(right).toBe('F');
  });

  it('names the colours you would actually be looking at', () => {
    // Worked out from the rotation rather than written down, so it cannot drift from the notation.
    const held = applyAlg(SOLVED, DISPLAY_ROTATION);
    expect(held[4]).toBe(DISPLAY_GRIP.up);
    expect(held[2 * 9 + 4]).toBe(DISPLAY_GRIP.front);
    expect(held[1 * 9 + 4]).toBe(DISPLAY_GRIP.right);
    expect(gripSentence()).toBe('yellow on top, red facing you, green on your right');
  });

  it('agrees with the picture: held that way, the printed moves are the moves that work', () => {
    // Hold the cube as the grip says and make the turns as written, and you must end up where the
    // cube-frame algorithm would have put you. If the notation and the rotation ever disagree,
    // every solution on the case list is quietly wrong and this is what says so.
    for (const [key, solution] of Object.entries(shipped)) {
      const state = stateOf(solution.setup);
      const asHeld = applyAlg(applyAlg(state, DISPLAY_ROTATION), solution.alg);
      const asStored = applyAlg(applyAlg(state, solution.cubeFrame), DISPLAY_ROTATION);
      expect(asHeld, `${key} held as the grip says`).toBe(asStored);

      // And the same for the setup, which the case list prints beside it: held that way, those
      // turns from a solved cube have to build the case in the picture.
      const built = applyAlg(applyAlg(SOLVED, DISPLAY_ROTATION), inSolverNotation(solution.setup));
      expect(built, `${key} set up as the grip says`).toBe(applyAlg(state, DISPLAY_ROTATION));
    }
  });
});

describe('the case as the case list draws it', () => {
  /**
   * The picture is only worth printing if it shows what an F2L case looks like: the layers you
   * have already built, solid, with one slot open and the free layer on top. Held the way the
   * algorithms are written, that means the two faces you can see are their own colour everywhere
   * except the column beside the open slot.
   */
  it('shows two solid faces with one slot open', () => {
    for (const [key, solution] of Object.entries(shipped)) {
      const shown = applyAlg(stateOf(solution.setup), DISPLAY_ROTATION);
      const front = shown.slice(18, 27);
      const right = shown.slice(9, 18);

      // The slot being filled is at the front right, so it is the front face's right-hand column
      // and the right face's left-hand column that are allowed to be anything.
      for (const cell of [3, 4, 6, 7]) {
        expect(front[cell], `${key} front cell ${cell}`).toBe(front[4]);
      }
      for (const cell of [4, 5, 7, 8]) {
        expect(right[cell], `${key} right cell ${cell}`).toBe(right[4]);
      }
    }
  });

  it('shows the free layer on top, where the pair is waiting', () => {
    // The top face is the free layer, so it is the one allowed to be a mess.
    const messy = Object.values(shipped).filter((solution) => {
      const top = applyAlg(stateOf(solution.setup), DISPLAY_ROTATION).slice(0, 9);
      return [...top].some((colour) => colour !== top[4]);
    });
    expect(messy.length).toBeGreaterThan(30);
  });
});
