import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { f2lComplete } from './cfop';
import { DISPLAY_ROTATION } from './f2l-solve';
import { bestExecution, costOfAlg } from './execution';
import solutions from '../data/f2l-solutions.json';

const shipped = solutions as Record<string, { setup: string; alg: string; options: string[] }>;
const optionsFor = (key: string) => shipped[key].options;

/**
 * The shortest algorithm is not the quickest one. An F move means letting go of the cube, and a
 * turn you cannot make without a regrip is worth about two you can - so a longer way round is
 * often faster, and so is turning the cube first and doing it all with the hand you had on it.
 */

describe('what a way of turning costs', () => {
  it('counts a turn you can make with your fingers as one', () => {
    expect(costOfAlg("R U R'")).toBe(3);
    expect(costOfAlg("L U2 L'")).toBe(3);
  });

  it('counts one you have to let go for as two', () => {
    expect(costOfAlg("F' U' F")).toBe(5);
    expect(costOfAlg("B U B'")).toBe(5);
  });

  it('counts turning the cube round as about a move', () => {
    expect(costOfAlg("y' R' U' R")).toBe(4);
  });
});

describe('the nicest way to do a case', () => {
  it('turns the cube rather than regripping, when that is cheaper', () => {
    // F' U' F is three moves but two of them need a regrip. Rotated, it is the same three moves
    // with the hand already on them.
    const best = bestExecution(optionsFor('c4.2e11.0'), DISPLAY_ROTATION);
    expect(best.rotation).toBe("y'");
    expect(best.alg).toBe("R' U' R");
    expect(best.regrips).toBe(0);
  });

  it('leaves a case that was already comfortable alone', () => {
    const best = bestExecution(optionsFor('c4.1e10.1'), DISPLAY_ROTATION);
    expect(best.rotation).toBe('');
    expect(best.alg).toBe("R U R'");
  });

  it('takes a longer algorithm over one with a regrip in it', () => {
    // Six moves with two regrips, or seven with none. The seven is quicker to turn.
    const best = bestExecution(optionsFor('c4.0e11.1'), DISPLAY_ROTATION);
    expect(best.regrips).toBe(0);
    expect(best.length).toBe(7);
    expect(best.alg).toBe("R U R' U R U' R'");
  });

  it('never picks a longer algorithm for nothing', () => {
    for (const [key, entry] of Object.entries(shipped)) {
      const best = bestExecution(entry.options, DISPLAY_ROTATION);
      const shortest = entry.alg.split(' ').length;
      // A move longer is only worth it if it buys at least one regrip.
      const bought = countRegrips(entry.alg) - best.regrips;
      expect(best.length - shortest, `${key} got longer for nothing`).toBeLessThanOrEqual(bought);
    }
  });

  it('actually solves the case, whichever way round it ends up', () => {
    for (const [key, entry] of Object.entries(shipped)) {
      const best = bestExecution(entry.options, DISPLAY_ROTATION);
      const state = applyAlg(SOLVED, entry.setup);
      // Held as the picture shows, rotated as it says, and turned as written.
      const done = applyAlg(state, `${DISPLAY_ROTATION} ${best.rotation} ${best.alg}`);
      expect(f2lComplete(applyAlg(done, invert(`${DISPLAY_ROTATION} ${best.rotation}`))), key).toBe(
        true,
      );
    }
  });

  it('gets most of the 41 down to no regrip at all', () => {
    // 32 of them, at the time of writing. The rest are the cases where the pair genuinely needs
    // both of the faces beside its slot, and no amount of turning the cube moves them both under
    // the same hand.
    const clean = Object.values(shipped).filter(
      (entry) => bestExecution(entry.options, DISPLAY_ROTATION).regrips === 0,
    );
    expect(clean.length).toBeGreaterThanOrEqual(30);
  });

  it('keeps a regrip only when getting rid of it would cost more', () => {
    // The count above could be met by luck. This is the thing actually being claimed: nothing is
    // left with a regrip in it that could have been avoided for the same price or less.
    for (const [key, entry] of Object.entries(shipped)) {
      const best = bestExecution(entry.options, DISPLAY_ROTATION);
      if (best.regrips === 0) continue;
      const clean = entry.options
        .map((alg) => bestExecution([alg], DISPLAY_ROTATION))
        .filter((option) => option.regrips === 0);
      for (const option of clean) {
        expect(option.cost, `${key} could have avoided a regrip for less`).toBeGreaterThan(
          best.cost,
        );
      }
    }
  });
});

const countRegrips = (alg: string) =>
  alg.split(' ').filter((move) => move[0] === 'F' || move[0] === 'B').length;

const invert = (alg: string) =>
  alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map((move) =>
      move.endsWith('2') ? move : move.endsWith("'") ? move.slice(0, -1) : `${move}'`,
    )
    .join(' ');
