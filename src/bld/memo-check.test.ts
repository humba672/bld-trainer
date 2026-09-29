import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { CORNER_BUFFER, EDGE_BUFFER, arrangementOf, memoFor, shoot } from './op';
import {
  CORNER_PIECES,
  EDGE_PIECES,
  cornerPieceOf,
  edgePieceOf,
  type Letter,
} from './speffz';
import { checkMemo, faultSoFar, memoIsValid } from './drills';

/**
 * Saying "that memo does not solve it" is true and useless. What a tracer needs is where it went
 * wrong - the target they were on when the chain broke - because everything after a wrong target
 * is wrong for free, and the mistake is always the first one.
 *
 * The hard part is that there is no single right memo. Where you break into a new cycle is yours
 * to choose, so the check cannot compare letters with its own answer; it has to follow your memo
 * on the cube and say, at each step, whether what you wrote was possible from there.
 */

const SCRAMBLE = "D2 F' R2 B U2 R2 F' D2 L2 F2 L2 U' L B' D' R F R' D F2";
const scrambled = applyAlg(SOLVED, SCRAMBLE);
const mine = memoFor(scrambled);

/**
 * A different but equally valid memo: at every cycle break, take the last unsolved piece rather
 * than the first. Any such choice solves the cube, and the check has to accept all of them.
 */
function memoBreakingLate(facelets: string, kind: 'edge' | 'corner'): Letter[] {
  const buffer = kind === 'edge' ? EDGE_BUFFER : CORNER_BUFFER;
  const pieces = kind === 'edge' ? EDGE_PIECES : CORNER_PIECES;
  const pieceOf = kind === 'edge' ? edgePieceOf : cornerPieceOf;
  const at = arrangementOf(facelets, kind);
  const bufferPiece = pieceOf(buffer);
  const targets: Letter[] = [];

  for (let guard = 0; guard < 200; guard++) {
    let target = at[buffer];
    if (bufferPiece.includes(target)) {
      const unsolved = [...pieces]
        .reverse()
        .find((piece) => !piece.includes(buffer) && !piece.every((place) => at[place] === place));
      if (!unsolved) return targets;
      target = unsolved[0];
    }
    targets.push(target);
    shoot(at, buffer, target, kind);
  }
  throw new Error('did not finish');
}

describe('following a memo on the cube', () => {
  it('passes the memo the site would have written', () => {
    expect(checkMemo(scrambled, mine.edges, 'edge')).toEqual({
      ok: true,
      good: mine.edges.length,
      fault: null,
    });
    expect(checkMemo(scrambled, mine.corners, 'corner').ok).toBe(true);
  });

  it('passes a memo that breaks into its cycles somewhere else', () => {
    for (const kind of ['edge', 'corner'] as const) {
      const other = memoBreakingLate(scrambled, kind);
      expect(checkMemo(scrambled, other, kind).ok, `${kind} broken late`).toBe(true);
    }
  });

  it('says which target was the first one wrong', () => {
    const typed = [...mine.edges];
    // Somewhere in the middle, and not a cycle break, so there is only one letter it could be.
    const spoiled = 3;
    typed[spoiled] = typed[spoiled] === 'C' ? 'D' : 'C';
    const check = checkMemo(scrambled, typed, 'edge');
    expect(check.ok).toBe(false);
    expect(check.good).toBe(spoiled);
    expect(check.fault?.at).toBe(spoiled + 1);
    expect(check.fault?.expected).toBe(mine.edges[spoiled]);
  });

  it('knows the difference between the wrong piece and the wrong way round', () => {
    // Shooting to the other sticker of the right piece is a different mistake: the piece arrives
    // but turned, and a tracer wants telling which of the two they did.
    const typed = [...mine.corners];
    const right = typed[1];
    const sibling = cornerPieceOf(right).find((letter) => letter !== right)!;
    typed[1] = sibling;
    const check = checkMemo(scrambled, typed, 'corner');
    expect(check.fault?.reason).toBe('wrong-sticker');
    expect(check.fault?.expected).toBe(right);
  });

  it('says so when the memo stops with work left', () => {
    const check = checkMemo(scrambled, mine.edges.slice(0, -2), 'edge');
    expect(check.ok).toBe(false);
    expect(check.fault?.reason).toBe('stopped-early');
    expect(check.good).toBe(mine.edges.length - 2);
  });

  it('says so when the memo carries on past the end', () => {
    const check = checkMemo(scrambled, [...mine.corners, 'J'], 'corner');
    expect(check.fault?.reason).toBe('kept-going');
    expect(check.fault?.at).toBe(mine.corners.length + 1);
  });

  it('will not take a sticker of the buffer piece as a target', () => {
    const onBuffer = edgePieceOf(EDGE_BUFFER)[1];
    const check = checkMemo(scrambled, [onBuffer], 'edge');
    expect(check.fault?.reason).toBe('buffer-sticker');
    expect(check.fault?.at).toBe(1);
  });

  it('will not break into a piece that is already done', () => {
    // Find where the site breaks a cycle, and break into something solved instead.
    const at = arrangementOf(scrambled, 'edge');
    const bufferPiece = edgePieceOf(EDGE_BUFFER);
    const typed: Letter[] = [];
    for (const target of mine.edges) {
      if (bufferPiece.includes(at[EDGE_BUFFER])) {
        // A cycle break: pick a piece that is sitting right where it belongs.
        const done = EDGE_PIECES.find(
          (piece) => !piece.includes(EDGE_BUFFER) && piece.every((place) => at[place] === place),
        );
        if (done) {
          typed.push(done[0]);
          const check = checkMemo(scrambled, typed, 'edge');
          expect(check.fault?.reason).toBe('already-solved');
          expect(check.fault?.at).toBe(typed.length);
          return;
        }
      }
      typed.push(target);
      shoot(at, EDGE_BUFFER, target, 'edge');
    }
    throw new Error('this scramble never breaks a cycle, so the test proves nothing');
  });
});

describe('checking each half on its own', () => {
  it('agrees with running the whole memo, over a lot of scrambles', () => {
    // Edges and corners can be read apart because the only mark the edge shots leave on the
    // corners is the pair the parity algorithm puts back. If that were not so, a memo could pass
    // both halves and still fail as a whole, and this is what would catch it.
    for (let seed = 0; seed < 60; seed++) {
      const state = applyAlg(SOLVED, scrambleFrom(seed));
      const memo = memoFor(state);
      const bothOk =
        checkMemo(state, memo.edges, 'edge').ok && checkMemo(state, memo.corners, 'corner').ok;
      expect(bothOk, `scramble ${seed}`).toBe(memoIsValid(state, memo.edges, memo.corners));
      expect(bothOk, `scramble ${seed} should solve`).toBe(true);
    }
  });

  it('fails one half without blaming the other', () => {
    const spoiled = [...mine.edges];
    spoiled[0] = spoiled[0] === 'R' ? 'S' : 'R';
    expect(checkMemo(scrambled, spoiled, 'edge').ok).toBe(false);
    expect(checkMemo(scrambled, mine.corners, 'corner').ok).toBe(true);
  });
});

/** A repeatable scramble, so a failure can be looked at again. */
function scrambleFrom(seed: number): string {
  const moves = ['U', 'D', 'L', 'R', 'F', 'B'];
  const suffix = ['', "'", '2'];
  let value = seed * 2654435761 + 1;
  const next = () => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return value;
  };
  const out: string[] = [];
  let last = -1;
  while (out.length < 22) {
    const face = next() % 6;
    if (face === last) continue;
    last = face;
    out.push(moves[face] + suffix[next() % 3]);
  }
  return out.join(' ');
}

describe('checking as you type', () => {
  it('holds its tongue while the memo is merely unfinished', () => {
    for (let upto = 0; upto <= mine.edges.length; upto++) {
      expect(faultSoFar(scrambled, mine.edges.slice(0, upto), 'edge'), `first ${upto}`).toBeNull();
    }
  });

  it('speaks up on the letter that breaks it, not the one after', () => {
    const typed = [...mine.edges.slice(0, 4)];
    typed[3] = typed[3] === 'C' ? 'D' : 'C';
    const fault = faultSoFar(scrambled, typed, 'edge');
    expect(fault?.at).toBe(4);
    expect(fault?.expected).toBe(mine.edges[3]);
  });

  it('stays quiet once the memo is complete, and complains if you carry on', () => {
    expect(faultSoFar(scrambled, mine.corners, 'corner')).toBeNull();
    expect(faultSoFar(scrambled, [...mine.corners, 'J'], 'corner')?.reason).toBe('kept-going');
  });

  it('says nothing about an empty box', () => {
    expect(faultSoFar(scrambled, [], 'edge')).toBeNull();
    expect(faultSoFar(scrambled, [], 'corner')).toBeNull();
  });
});
