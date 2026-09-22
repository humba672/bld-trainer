import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { LETTERS, cornerPieceOf, edgePieceOf } from './speffz';
import {
  CORNER_BUFFER,
  CORNER_SWAPS,
  EDGE_BUFFER,
  EDGE_SWAPS,
  arrangementOf,
  executionFor,
  memoFor,
  memoSolves,
  pairsOf,
  shoot,
  shotFor,
} from './op';

/** Deterministic scrambles, so a failure can be reproduced exactly. */
function scrambler(seed: number) {
  const moves = 'U U\' U2 D D\' D2 R R\' R2 L L\' L2 F F\' F2 B B\' B2'.split(' ');
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return (length = 25) => {
    const out: string[] = [];
    let lastFace = '';
    while (out.length < length) {
      const move = moves[Math.floor(next() * moves.length)];
      if (move[0] === lastFace) continue;
      lastFace = move[0];
      out.push(move);
    }
    return out.join(' ');
  };
}

describe('the algorithms this method is built on', () => {
  it('shoots edges to UL, and to UF when that will not do', () => {
    expect(EDGE_SWAPS).toHaveLength(2);
    expect(EDGE_SWAPS[0].helper).toBe('D'); // UL
    expect(EDGE_SWAPS[1].helper).toBe('C'); // UF
  });

  it('shoots corners to RDF', () => {
    expect(CORNER_SWAPS[0].helper).toBe('P');
  });

  it('knows the side effects setups have to leave alone', () => {
    // The edge algorithm swaps two corners every time; keeping that pair the same is what makes
    // an even number of shots cancel, and an odd number leave exactly one parity to fix.
    expect([...EDGE_SWAPS[0].fixedOther].sort()).toEqual(['B', 'C', 'J', 'M', 'N', 'Q']);
    expect([...CORNER_SWAPS[0].fixedOther].sort()).toEqual(['A', 'D', 'E', 'Q']);
  });
});

describe('shooting to a target', () => {
  const edgeTargets = LETTERS.filter((l) => !edgePieceOf(EDGE_BUFFER).includes(l));
  const cornerTargets = LETTERS.filter((l) => !cornerPieceOf(CORNER_BUFFER).includes(l));

  it('has a way to reach all 22 edge targets', () => {
    expect(edgeTargets).toHaveLength(22);
    for (const target of edgeTargets) expect(() => shotFor('edge', target)).not.toThrow();
  });

  it('has a way to reach all 21 corner targets', () => {
    expect(cornerTargets).toHaveLength(21);
    for (const target of cornerTargets) expect(() => shotFor('corner', target)).not.toThrow();
  });

  // This is the join between the memo, which is bookkeeping, and the turns, which are real.
  it('moves the cube exactly the way the memo thinks it does', () => {
    const scramble = scrambler(99);
    for (const target of edgeTargets) {
      const facelets = applyAlg(SOLVED, scramble());
      const expected = arrangementOf(facelets, 'edge');
      shoot(expected, EDGE_BUFFER, target, 'edge');
      const actual = arrangementOf(applyAlg(facelets, shotFor('edge', target).moves), 'edge');
      expect(actual, `edge shot to ${target}`).toEqual(expected);
    }
    for (const target of cornerTargets) {
      const facelets = applyAlg(SOLVED, scramble());
      const expected = arrangementOf(facelets, 'corner');
      shoot(expected, CORNER_BUFFER, target, 'corner');
      const actual = arrangementOf(applyAlg(facelets, shotFor('corner', target).moves), 'corner');
      expect(actual, `corner shot to ${target}`).toEqual(expected);
    }
  });

  it('leaves the buffer piece alone, whichever target is shot', () => {
    for (const target of edgeTargets) {
      const shot = shotFor('edge', target);
      expect(shot.setup.length, `setup for ${target} is short`).toBeLessThanOrEqual(11);
    }
  });
});

describe('memo', () => {
  it('has nothing to say about a solved cube', () => {
    const memo = memoFor(SOLVED);
    expect(memo.edges).toEqual([]);
    expect(memo.corners).toEqual([]);
    expect(memo.parity).toBe(false);
  });

  it('names the one target a single swap needs', () => {
    // A T perm swaps the buffer edge with UL, and two corners with it.
    const facelets = applyAlg(SOLVED, "R U R' U' R' F R2 U' R' U' R U R' F'");
    const memo = memoFor(facelets);
    expect(memo.edges).toEqual(['D']);
    expect(memo.parity).toBe(true);
    expect(memoSolves(facelets)).toBe(true);
  });

  it('reads targets in letter pairs', () => {
    expect(pairsOf(['A', 'B', 'C', 'D', 'E'])).toEqual(['AB', 'CD', 'E']);
  });

  it('counts pieces that are home but turned the wrong way', () => {
    const memo = memoFor(applyAlg(SOLVED, "M' U M' U M' U M' U' M' U' M' U' M'"));
    expect(memo.flippedEdges.length + memo.twistedCorners.length).toBeGreaterThan(0);
  });
});

// This is the test the whole phase turns on: the memo the site produces has to solve the cube.
describe('the memo solves the cube', () => {
  it('solves 1,000 scrambles', () => {
    const scramble = scrambler(20260921);
    const failures: string[] = [];
    let withParity = 0;
    let targets = 0;

    for (let i = 0; i < 1000; i++) {
      const alg = scramble();
      const facelets = applyAlg(SOLVED, alg);
      const memo = memoFor(facelets);
      if (memo.parity) withParity += 1;
      targets += memo.edges.length + memo.corners.length;
      if (applyAlg(facelets, executionFor(memo)) !== SOLVED) failures.push(alg);
    }

    expect(failures.slice(0, 3)).toEqual([]);
    expect(failures).toHaveLength(0);
    // A sanity check that the 1,000 were varied: about half should have parity.
    expect(withParity).toBeGreaterThan(300);
    expect(withParity).toBeLessThan(700);
    expect(targets / 1000).toBeGreaterThan(15);
  });

  it('solves cubes that are barely scrambled at all', () => {
    for (const alg of ['U', "R U R' U'", "R L' U2", 'F', "R U R' U R U2 R'", 'F2 B2 U2']) {
      const facelets = applyAlg(SOLVED, alg);
      expect(memoSolves(facelets), `after ${alg}`).toBe(true);
    }
  });

  it('works on the cube as the cube reports it, with its centres at home', () => {
    // A slice move turns the core, so M2 leaves a cube that is solved in your hands but whose
    // centres have moved. The cube always reports its own frame, which is the frame memo is for,
    // and the site never hands it anything else.
    const centresMoved = applyAlg(SOLVED, 'M2');
    expect(memoSolves(centresMoved)).toBe(false);
    expect(memoSolves(applyAlg(centresMoved, 'M2'))).toBe(true);
  });
});
