import { describe, expect, it } from 'vitest';
import { ORIENTATIONS, SOLVED, applyAlg, faceMapOf, type Face } from '../cube/cube';
import { SLOT_NAMES, enumerateF2LCases, f2lComplete, openSlot } from './cfop';
import { solutionFor } from './f2l-solve';

/**
 * The algorithm shown has to be the one you would actually make with your hands. That means it
 * depends on two things the stored algorithm knows nothing about: which slot the case landed in,
 * and which way round you are holding the cube.
 */

const cases = [...enumerateF2LCases().values()].filter((entry) => !entry.solved);

const relabel = (alg: string, map: Record<Face, Face>): string =>
  alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((move) => (map[move[0] as Face] ?? move[0]) + move.slice(1))
    .join(' ');

/** What the cube sees when you make these moves holding it turned by `holding`. */
const asHeld = (alg: string, holding: string): string => {
  const map = faceMapOf(holding);
  const inverse = Object.fromEntries(Object.entries(map).map(([from, to]) => [to, from])) as Record<
    Face,
    Face
  >;
  return relabel(alg, inverse);
};

describe('the algorithm you are shown', () => {
  it('solves the case in the front-right slot, held the usual way', () => {
    for (const entry of cases) {
      const state = applyAlg(SOLVED, entry.setup);
      const alg = solutionFor(state, 'FR');
      expect(alg, `case ${entry.key}`).not.toBeNull();
      expect(f2lComplete(applyAlg(state, alg!)), `case ${entry.key}`).toBe(true);
    }
  });

  it('solves it in whichever slot the setup opened', () => {
    // The same case set up in each of the four slots. Turning the cube would not do it: a real
    // cube's frame never moves, so the setup itself is relabelled into the other slot instead.
    for (const entry of cases.slice(0, 8)) {
      for (const slot of SLOT_NAMES) {
        const intoSlot = { FR: '', FL: 'y', BL: 'y2', BR: "y'" }[slot];
        const setup = intoSlot ? relabel(entry.setup, faceMapOf(intoSlot)) : entry.setup;
        const state = applyAlg(SOLVED, setup);

        const open = openSlot(state);
        expect(open, `${entry.key} into ${slot}`).toBe(slot);

        const alg = solutionFor(state, open!);
        expect(alg, `${entry.key} in ${slot}`).not.toBeNull();
        expect(f2lComplete(applyAlg(state, alg!)), `${entry.key} in ${slot}`).toBe(true);
      }
    }
  });

  it('is written for the way you are holding the cube', () => {
    for (const entry of cases.slice(0, 10)) {
      for (const holding of ['', 'y', 'x', 'z2', "x y"]) {
        const state = applyAlg(SOLVED, entry.setup);
        const alg = solutionFor(state, 'FR', holding)!;
        expect(alg, `${entry.key} held ${holding}`).toBeTruthy();

        // Making those moves while holding the cube that way has to finish the pair.
        const whatTheCubeSees = asHeld(alg, holding);
        expect(
          f2lComplete(applyAlg(state, whatTheCubeSees)),
          `${entry.key} held ${holding || 'the usual way'}`,
        ).toBe(true);
      }
    }
  });

  it('works for every way of holding the cube at once', () => {
    const entry = cases[3];
    const state = applyAlg(SOLVED, entry.setup);
    for (const holding of ORIENTATIONS) {
      const alg = solutionFor(state, 'FR', holding)!;
      expect(f2lComplete(applyAlg(state, asHeld(alg, holding))), `held ${holding}`).toBe(true);
    }
  });

  it('says nothing rather than guessing when the pair is stuck in another slot', () => {
    // A turn of the cross layer puts a pair piece somewhere none of the 41 cases covers.
    expect(solutionFor(applyAlg(SOLVED, 'U'), 'FR')).toBeNull();
  });
});
