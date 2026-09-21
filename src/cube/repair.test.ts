import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from './cube';
import { findMissingTurns } from './repair';
import { CubeTracker } from './tracker';

const SCRAMBLE = "R U R' U' F' L D2 B2 R' F2 U B' D L2 F R2 U2";
const scrambled = applyAlg(SOLVED, SCRAMBLE);

describe('working out which turns went missing', () => {
  it('finds nothing when the two states already agree', () => {
    expect(findMissingTurns(scrambled, scrambled)).toEqual({ turns: [], notation: '' });
  });

  it('names a single missed quarter turn', () => {
    const found = findMissingTurns(scrambled, applyAlg(scrambled, "R'"));
    expect(found?.notation).toBe("R'");
    expect(found?.turns).toEqual([{ face: 'R', dir: -1 }]);
  });

  it('names a missed half turn as the two quarter turns the cube reported', () => {
    const found = findMissingTurns(scrambled, applyAlg(scrambled, 'U2'));
    expect(found?.notation).toBe('U2');
    expect(found?.turns).toEqual([
      { face: 'U', dir: 1 },
      { face: 'U', dir: 1 },
    ]);
  });

  it('names two missed turns, in the order they happened', () => {
    const found = findMissingTurns(scrambled, applyAlg(scrambled, "F L'"));
    expect(found?.notation).toBe("F L'");
  });

  it('finds every single turn from a solved cube', () => {
    for (const move of ['U', "U'", 'U2', 'R', "R'", 'F', "F'", 'D', "D'", 'L', "L'", 'B', "B'"]) {
      const found = findMissingTurns(SOLVED, applyAlg(SOLVED, move));
      expect(found?.notation, `missed ${move}`).toBe(move);
    }
  });

  it('gives up rather than guessing when too much was lost', () => {
    expect(findMissingTurns(scrambled, applyAlg(scrambled, "R U F D L B R'"))).toBeNull();
  });

  it('gives up when the states are unrelated', () => {
    expect(findMissingTurns(SOLVED, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBX')).toBeNull();
  });

  it('puts the tracked cube right when its turns are fed back in', () => {
    const tracker = new CubeTracker({ pairWindowMs: 120 });
    // Two turns happened on the cube but never reached the site.
    const onTheCube = applyAlg(SOLVED, "R' U2");

    const found = findMissingTurns(tracker.cubeFacelets(), onTheCube);
    expect(found).not.toBeNull();

    let t = 1000;
    for (const turn of found!.turns) {
      tracker.onWire({ ...turn, t: (t += 1000) });
    }
    tracker.flushAll();

    expect(tracker.cubeFacelets()).toBe(onTheCube);
    expect(tracker.entries.map((e) => e.move)).toEqual(["R'", 'U', 'U']);
  });
});
