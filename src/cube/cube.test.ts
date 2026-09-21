import { describe, expect, it } from 'vitest';
import {
  SOLVED,
  applyAlg,
  canonicalUpToRotation,
  equalUpToRotation,
  invertAlg,
  looksLikeACube,
  parseAlg,
} from './cube';

// A fixed scramble, so identities are tested on a messy cube and not only on a solved one.
const SCRAMBLE = "R U R' U' F' L D2 B2 R' F2 U B' D L2 F R2 U2";
const scrambled = () => applyAlg(SOLVED, SCRAMBLE);

describe('facelet model', () => {
  it('has a 54-sticker solved state in Kociemba order', () => {
    expect(SOLVED).toBe(
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB',
    );
  });

  // Published vector from the gan-web-bluetooth docs: the state after F then R.
  it('matches the published facelets for "F R"', () => {
    expect(applyAlg(SOLVED, 'F R')).toBe(
      'UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB',
    );
  });

  it('returns to the start after four quarter turns of any move', () => {
    for (const m of 'U R F D L B M E S x y z'.split(' ').concat(['Rw', 'Uw', 'Fw', 'Lw', 'Dw', 'Bw'])) {
      expect(applyAlg(scrambled(), `${m} ${m} ${m} ${m}`)).toBe(scrambled());
    }
  });

  it('treats a double turn as two quarter turns and a prime as three', () => {
    expect(applyAlg(scrambled(), 'R2')).toBe(applyAlg(scrambled(), 'R R'));
    expect(applyAlg(scrambled(), "R'")).toBe(applyAlg(scrambled(), 'R R R'));
  });

  it('undoes an alg when inverted', () => {
    const alg = "R U M' Rw D2 S x y' Bw' E";
    expect(applyAlg(applyAlg(scrambled(), alg), invertAlg(alg))).toBe(scrambled());
  });

  it('parses faces, slices, wides and rotations', () => {
    expect(parseAlg("R U' M2 Rw' x2").map((m) => m.token)).toEqual([
      'R',
      "U'",
      'M2',
      "Rw'",
      'x2',
    ]);
    expect(() => parseAlg('Q')).toThrow();
  });
});

// These identities are what the wire-to-notation table rests on: what the cube reports for a
// slice or a wide move is the outer-layer turns plus a hidden turn of the core.
describe('slice and wide identities', () => {
  const cases: Array<[string, string]> = [
    ['M', "R L' x'"],
    ["M'", "R' L x"],
    ['E', "U D' y'"],
    ["E'", "U' D y"],
    ['S', "B F' z"],
    ["S'", "B' F z'"],
    ['Rw', 'L x'],
    ["Rw'", "L' x'"],
    ['Lw', "R x'"],
    ["Lw'", "R' x"],
    ['Uw', 'D y'],
    ["Uw'", "D' y'"],
    ['Dw', "U y'"],
    ["Dw'", "U' y"],
    ['Fw', 'B z'],
    ["Fw'", "B' z'"],
    ['Bw', "F z'"],
    ["Bw'", "F' z"],
  ];

  for (const [move, equivalent] of cases) {
    it(`${move} is ${equivalent}`, () => {
      expect(applyAlg(scrambled(), move)).toBe(applyAlg(scrambled(), equivalent));
    });
  }
});

// Nothing in the Bluetooth protocol checks that a packet arrived intact, and the cube's state is
// decoded by deriving the last corner and edge from a sum. A garbled packet therefore comes
// through as a cube that cannot exist, and must not be mistaken for the site having lost a turn.
describe('sanity check on a state the cube reports', () => {
  it('accepts real cubes', () => {
    expect(looksLikeACube(SOLVED)).toBe(true);
    expect(looksLikeACube(scrambled())).toBe(true);
    // Face turns leave the centres where they were, which is what the cube always reports.
    expect(looksLikeACube(applyAlg(SOLVED, "R L' U2 B"))).toBe(true);
  });

  it('rejects anything the wrong length', () => {
    expect(looksLikeACube('')).toBe(false);
    expect(looksLikeACube(SOLVED.slice(0, 53))).toBe(false);
    expect(looksLikeACube(SOLVED + 'U')).toBe(false);
  });

  it('rejects a cube without nine of each colour', () => {
    expect(looksLikeACube(SOLVED.replace('R', 'U'))).toBe(false);
    expect(looksLikeACube('U'.repeat(54))).toBe(false);
  });

  it('rejects unknown colours', () => {
    expect(looksLikeACube(SOLVED.slice(0, 53) + 'X')).toBe(false);
  });

  it("rejects a cube whose centres have wandered, since the cube reports in its own frame", () => {
    const swappedCentres = SOLVED.split('');
    [swappedCentres[4], swappedCentres[13]] = [swappedCentres[13], swappedCentres[4]];
    expect(looksLikeACube(swappedCentres.join(''))).toBe(false);
    expect(looksLikeACube(applyAlg(SOLVED, 'x'))).toBe(false);
  });
});

describe('comparison that ignores which way the cube is facing', () => {
  it('sees a rotated cube as the same cube', () => {
    expect(equalUpToRotation(SOLVED, applyAlg(SOLVED, 'x y2 z'))).toBe(true);
    expect(applyAlg(SOLVED, 'x')).not.toBe(SOLVED);
  });

  it("sees M and R L' as the same cube", () => {
    expect(equalUpToRotation(applyAlg(SOLVED, 'M'), applyAlg(SOLVED, "R L'"))).toBe(true);
    expect(applyAlg(SOLVED, 'M')).not.toBe(applyAlg(SOLVED, "R L'"));
  });

  it('still tells different cubes apart', () => {
    expect(equalUpToRotation(SOLVED, applyAlg(SOLVED, 'R'))).toBe(false);
    expect(equalUpToRotation(scrambled(), applyAlg(scrambled(), 'U'))).toBe(false);
  });

  it('gives every rotation of a cube the same canonical form', () => {
    const forms = ['', 'x', 'y', 'z', "x'", 'x y', 'z2 y'].map((r) =>
      canonicalUpToRotation(applyAlg(scrambled(), r)),
    );
    expect(new Set(forms).size).toBe(1);
  });
});
