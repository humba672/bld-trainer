import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg, faceMapOf, type Face } from '../cube/cube';
import { ScrambleTracker } from './scramble-tracker';

const SCRAMBLE = "R U F' L2 D B2";
const moves = SCRAMBLE.split(' ');

/**
 * What the cube reports when you hold it turned by `holding` and do the scramble as written: the
 * same moves, relabelled through the way you are holding it.
 */
function asHeld(holding: string, upTo: number): string {
  const map = faceMapOf(holding);
  const inverse = Object.fromEntries(Object.entries(map).map(([from, to]) => [to, from])) as Record<
    Face,
    Face
  >;
  const alg = moves
    .slice(0, upTo)
    .map((move) => inverse[move[0] as Face] + move.slice(1))
    .join(' ');
  return alg ? applyAlg(SOLVED, alg) : SOLVED;
}

describe('white on top, green in front', () => {
  it('counts the turns up as they land', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    expect(tracker.update(SOLVED)).toEqual({ done: 0, wrong: false });
    for (let i = 1; i <= moves.length; i++) {
      expect(tracker.update(asHeld('', i))).toEqual({ done: i, wrong: false });
    }
    expect(tracker.holding).toBe('');
  });

  it('knows what state the finished scramble is', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    expect(tracker.target).toBe(applyAlg(SOLVED, SCRAMBLE));
  });
});

describe('held any other way', () => {
  for (const holding of ['y', "y'", 'x', 'z2', "x y"]) {
    it(`follows a scramble applied with the cube turned by ${holding || 'nothing'}`, () => {
      const tracker = new ScrambleTracker(SCRAMBLE);
      tracker.update(SOLVED);
      for (let i = 1; i <= moves.length; i++) {
        expect(tracker.update(asHeld(holding, i)), `${holding} after ${i}`).toEqual({
          done: i,
          wrong: false,
        });
      }
      // The name may differ - x y and y z are the same rotation - so compare what it does.
      expect(faceMapOf(tracker.holding)).toEqual(faceMapOf(holding));
      // And the state it now expects is the one the cube is really in.
      expect(tracker.target).toBe(asHeld(holding, moves.length));
    });
  }

  it('does not guess the holding before your turns have said', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    tracker.update(SOLVED);
    // A solved cube looks the same every way up: all 24 holdings are still possible.
    expect(tracker.possibleHoldings).toBe(24);
    expect(tracker.holding).toBe('');

    // One turn only says which face you turned, and four holdings turn the same face.
    tracker.update(asHeld('y', 1));
    expect(tracker.possibleHoldings).toBeGreaterThan(1);
    expect(tracker.holding).toBe('');

    // A second turn on a different face settles it.
    tracker.update(asHeld('y', 2));
    expect(tracker.possibleHoldings).toBe(1);
    expect(faceMapOf(tracker.holding)).toEqual(faceMapOf('y'));
  });

  it('sticks with the holding once it knows, so a wrong turn stays wrong', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    tracker.update(SOLVED);
    tracker.update(asHeld('y', 2));
    expect(tracker.holding).toBe('y');
    // A turn that is right for a different holding is still wrong for this one.
    expect(tracker.update(asHeld('x', 3)).wrong).toBe(true);
  });
});

describe('going wrong', () => {
  it('calls a turn that is in no scramble wrong', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    tracker.update(SOLVED);
    tracker.update(asHeld('', 2));
    const wrong = applyAlg(asHeld('', 2), 'B');
    expect(tracker.update(wrong)).toEqual({ done: 2, wrong: true });
  });

  it('clears when you undo it', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    tracker.update(SOLVED);
    tracker.update(asHeld('', 2));
    tracker.update(applyAlg(asHeld('', 2), 'B'));
    expect(tracker.update(asHeld('', 2))).toEqual({ done: 2, wrong: false });
  });

  it('walks back when you undo a correct turn', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    tracker.update(SOLVED);
    tracker.update(asHeld('', 3));
    expect(tracker.update(asHeld('', 2))).toEqual({ done: 2, wrong: false });
  });

  it('starts over for a fresh cube', () => {
    const tracker = new ScrambleTracker(SCRAMBLE);
    tracker.update(SOLVED);
    tracker.update(asHeld('y', 2));
    tracker.reset();
    expect(tracker.holding).toBe('');
    expect(tracker.progress).toEqual({ done: 0, wrong: false });
  });
});
