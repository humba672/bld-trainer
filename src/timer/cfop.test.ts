import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg, invertAlg } from '../cube/cube';
import {
  CASE_MOVES,
  SLOT_NAMES,
  analyseSolve,
  crossSolved,
  enumerateF2LCases,
  f2lCaseOf,
  lastLayerOriented,
  slotSolved,
  type Turn,
} from './cfop';

/**
 * The cube always reports its own frame, where white is on U. A white-cross solver holds white
 * down, so their free layer is D here and the cross lives on U. Everything below is in the cube's
 * frame for that reason.
 */

const turns = (alg: string, startMs = 1000, gapMs = 200): Turn[] =>
  alg
    .trim()
    .split(/\s+/)
    .map((move, i) => ({ move, t: startMs + i * gapMs }));

describe('reading the stages off a cube', () => {
  it('sees a solved cube as every stage done', () => {
    expect(crossSolved(SOLVED)).toBe(true);
    for (const slot of SLOT_NAMES) expect(slotSolved(SOLVED, slot)).toBe(true);
    expect(lastLayerOriented(SOLVED)).toBe(true);
  });

  it('sees a broken cross', () => {
    // R moves the UR cross edge out.
    expect(crossSolved(applyAlg(SOLVED, 'R'))).toBe(false);
    // A turn of the free layer leaves the cross alone.
    expect(crossSolved(applyAlg(SOLVED, 'D'))).toBe(true);
  });

  it('sees which slot is open', () => {
    // R' takes the front-right pair down into the free layer, R puts something else back.
    const open = applyAlg(SOLVED, "R' D R");
    expect(slotSolved(open, 'FR')).toBe(false);
    expect(slotSolved(open, 'FL')).toBe(true);
    expect(slotSolved(open, 'BL')).toBe(true);
    expect(slotSolved(open, 'BR')).toBe(true);
    expect(crossSolved(open)).toBe(true);
  });

  it('sees when the last layer is not oriented', () => {
    // Turning the free layer leaves every last-layer sticker facing the same way.
    expect(lastLayerOriented(applyAlg(SOLVED, 'D2'))).toBe(true);
    // Any other face brings something unoriented into it.
    expect(lastLayerOriented(applyAlg(SOLVED, 'R'))).toBe(false);
  });
});

describe('the 41 F2L cases', () => {
  const cases = enumerateF2LCases();

  it('finds every case exactly once, and no more', () => {
    // 24 with both pieces in the free layer, 6 with each of them alone there, 6 with both in the
    // slot - one of which is the pair already solved.
    expect(cases.size).toBe(42);
    expect([...cases.values()].filter((entry) => entry.solved)).toHaveLength(1);
  });

  it('gives every case a way to set it up that leaves the rest of the cube alone', () => {
    for (const [key, entry] of cases) {
      const state = applyAlg(SOLVED, entry.setup);
      expect(crossSolved(state), `${key} keeps the cross`).toBe(true);
      for (const slot of SLOT_NAMES) {
        if (slot === 'FR') continue;
        expect(slotSolved(state, slot), `${key} keeps ${slot}`).toBe(true);
      }
      expect(f2lCaseOf(state, 'FR').key, `${key} is what it says`).toBe(key);
    }
  });

  it('reads the same case whichever slot it is in, and whatever the free layer is doing', () => {
    const base = applyAlg(SOLVED, "R' D R");
    const key = f2lCaseOf(base, 'FR').key;
    // The free layer turning does not change the case.
    for (const auf of ['D', 'D2', "D'"]) {
      expect(f2lCaseOf(applyAlg(base, auf), 'FR').key).toBe(key);
    }
  });

  it('never needs more than a handful of moves to set one up', () => {
    // Setups are the fewest pair moves, not the fewest turns, so a deep case runs to a dozen.
    for (const entry of cases.values()) {
      expect(entry.setup.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(15);
    }
  });

  it('builds its setups only from moves that put a pair back', () => {
    for (const move of CASE_MOVES) {
      const state = applyAlg(SOLVED, move);
      expect(crossSolved(state), `${move} keeps the cross`).toBe(true);
      for (const slot of ['FL', 'BL', 'BR'] as const) {
        expect(slotSolved(state, slot), `${move} keeps ${slot}`).toBe(true);
      }
    }
  });
});

describe('reading a whole solve', () => {
  /** Build a solve backwards: take the cube apart, then the forward moves are the solution. */
  function buildSolve(parts: string[]): { scrambled: string; solution: string } {
    const solution = parts.join(' ');
    return { scrambled: applyAlg(SOLVED, invertAlg(solution)), solution };
  }

  it('splits a clean solve into cross, four pairs, and the last layer', () => {
    // Four pair insertions, then a last layer that only touches the free layer.
    const { scrambled, solution } = buildSolve([
      "R' D R", // front-right pair
      "F' D' F", // front-left pair
      "L' D L", // back-left pair
      "B' D' B", // back-right pair
      'D2', // last layer, such as it is
    ]);
    const analysis = analyseSolve(scrambled, turns(solution));

    expect(analysis.solved).toBe(true);
    expect(analysis.pairs.map((pair) => pair.slot)).toEqual(['FR', 'FL', 'BL', 'BR']);
    expect(analysis.unclear).toEqual([]);
    // The cross was already done before the first move.
    expect(analysis.stages.crossMs).toBe(0);
    expect(analysis.pairs[0].moves).toEqual(["R'", 'D', 'R']);
    expect(analysis.pairs[1].moves).toEqual(["F'", "D'", 'F']);
  });

  it('times each pair from the moment the one before it landed', () => {
    const { scrambled, solution } = buildSolve(["R' D R", "F' D' F", "L' D L", "B' D' B"]);
    const moves = turns(solution, 1000, 200);
    // A long think before the second pair.
    for (let i = 3; i < moves.length; i++) moves[i].t += 1500;
    const analysis = analyseSolve(scrambled, moves);

    expect(analysis.pairs[1].recognitionMs).toBe(1700);
    expect(analysis.pairs[1].executionMs).toBe(400);
    expect(analysis.pairs[0].recognitionMs).toBe(0); // it started the solve
  });

  it('names the case each pair was', () => {
    const { scrambled, solution } = buildSolve(["R' D R", "F' D' F", "L' D L", "B' D' B"]);
    const analysis = analyseSolve(scrambled, turns(solution));
    for (const pair of analysis.pairs) {
      expect(pair.caseKey).toBeTruthy();
      expect(pair.caseKey).not.toBe('solved');
    }
  });

  it('says so when it cannot tell what was going on', () => {
    // A solve that never finishes cannot be split up honestly.
    const scrambled = applyAlg(SOLVED, "R U F' D2 L");
    const analysis = analyseSolve(scrambled, turns("R U'"));
    expect(analysis.solved).toBe(false);
    expect(analysis.unclear.length).toBeGreaterThan(0);
  });

  it('flags a solve where a slot was filled and taken apart again', () => {
    const { scrambled, solution } = buildSolve(["R' D R", "F' D' F", "L' D L", "B' D' B"]);
    // Put the front-right pair in, pull it out, put it back: multislotting looks like this.
    const messy = `R' D R R' D' R R' D R ${solution.split(' ').slice(3).join(' ')}`;
    const analysis = analyseSolve(scrambled, turns(messy));
    expect(analysis.unclear.join(' ')).toMatch(/FR/);
  });

  it('does not let the last layer eat the F2L', () => {
    // A whole solve: four pairs, then a Sune, then a T perm. Both of those turn the free layer
    // and a side face, which breaks and remakes the cross over and over and swings slots out and
    // back. None of that is pair work and none of it should be read as any.
    const { scrambled, solution } = buildSolve([
      "R' D R",
      "F' D' F",
      "L' D L",
      "B' D' B",
      // The solver holds white down, which is a z2 from the frame the cube reports, so their R
      // is this L and their U is this D. A Sune and a T perm, translated.
      "L D L' D L D2 L'",
      "L D L' D' L' F L2 D' L' D' L D L' F'",
    ]);
    const analysis = analyseSolve(scrambled, turns(solution, 0, 100));

    expect(analysis.solved).toBe(true);
    expect(analysis.pairs.map((pair) => pair.slot)).toEqual(['FR', 'FL', 'BL', 'BR']);
    expect(analysis.unclear).toEqual([]);

    // F2L ends when the fourth pair goes in. The clock starts on the first turn, so twelve
    // turns at 100ms apart is eleven gaps.
    expect(analysis.stages.crossMs).toBe(0);
    expect(analysis.stages.f2lMs).toBe(1100);
    // The Sune is seven moves and the T perm fourteen.
    expect(analysis.stages.ollMs).toBe(700);
    expect(analysis.stages.pllMs).toBe(1400);
  });

  it('measures how fast you turned', () => {
    const { scrambled, solution } = buildSolve(["R' D R", "F' D' F", "L' D L", "B' D' B"]);
    const analysis = analyseSolve(scrambled, turns(solution, 0, 100));
    expect(analysis.moveCount).toBe(12);
    expect(analysis.timeMs).toBe(1100); // first move to last
    expect(analysis.tps).toBeCloseTo(12 / 1.1, 1);
  });
});
