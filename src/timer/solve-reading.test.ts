import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg, invertAlg } from '../cube/cube';
import { CubeTracker, type Face } from '../cube/tracker';
import { analyseSolve, type Turn } from './cfop';

/**
 * The join between the cube link and the solve reading.
 *
 * The tracker keeps two readings of every turn: what the cube reported, in its own labels, and
 * what you did in your hands. They part company the moment you make a slice move, because a slice
 * turns the core and everything after it is relabelled. The solve is read in the cube's frame, so
 * it has to be fed the cube's reading. Feeding it the other one produces a solve where nothing is
 * ever solved, which is exactly what it looked like.
 */

// A slice at the front - R with L' - then four pair insertions and a turn of the free layer.
const SOLUTION = "R L' R' D R F' D' F L' D L B' D' B D2";
const scrambled = applyAlg(SOLVED, invertAlg(SOLUTION));

/**
 * Feed the solve into the tracker the way the cube would report it. The cube only ever reports
 * quarter turns, so a double arrives as two of them.
 */
function trackSolve(): CubeTracker {
  const tracker = new CubeTracker({ pairWindowMs: 120 });
  tracker.reset(scrambled);
  let t = 1000;
  SOLUTION.split(' ').forEach((move, i) => {
    // The R and the L' are made together, so the cube reports them 10ms apart and they pair.
    t += i === 1 ? 10 : 200;
    const dir = move.endsWith("'") ? -1 : 1;
    const quarters = move.endsWith('2') ? 2 : 1;
    for (let q = 0; q < quarters; q++) {
      tracker.onWire({ face: move[0] as Face, dir, t: t + q * 30 });
    }
  });
  tracker.flushAll();
  return tracker;
}

/** Quarter turns as the cube would report them, for counting. */
const wireTurnCount = SOLUTION.split(' ').reduce(
  (total, move) => total + (move.endsWith('2') ? 2 : 1),
  0,
);

const wireTurns = (tracker: CubeTracker): Turn[] =>
  tracker.entries.flatMap((entry) => entry.wire.map((move) => ({ move, t: entry.t })));

const handTurns = (tracker: CubeTracker): Turn[] =>
  tracker.entries.map((entry) => ({ move: entry.move, t: entry.t }));

describe('reading a solve off the tracker', () => {
  it('reads the slice as one move in your hands and two on the wire', () => {
    const tracker = trackSolve();
    expect(tracker.entries[0].move).toBe('M');
    expect(tracker.entries[0].wire).toEqual(['R', "L'"]);
    // The pair counts as one move in your hands, two on the wire.
    expect(wireTurns(tracker).length).toBe(wireTurnCount);
    expect(handTurns(tracker).length).toBe(wireTurnCount - 1);
  });

  it('ends solved when fed what the cube reported', () => {
    const tracker = trackSolve();
    expect(tracker.cubeFacelets()).toBe(SOLVED);
    const analysis = analyseSolve(scrambled, wireTurns(tracker));
    expect(analysis.solved).toBe(true);
    expect(analysis.unclear).not.toContain('the cube did not end solved');
  });

  it('does not end solved when fed the reading from your hands', () => {
    // This is the bug this test exists for: the same solve, read in the wrong frame.
    const tracker = trackSolve();
    const analysis = analyseSolve(scrambled, handTurns(tracker));
    expect(analysis.solved).toBe(false);
  });

  it('finds the pairs when it is fed the right frame', () => {
    const tracker = trackSolve();
    const analysis = analyseSolve(scrambled, wireTurns(tracker));
    expect(analysis.pairs.map((pair) => pair.slot)).toEqual(['FR', 'FL', 'BL', 'BR']);
  });
});
