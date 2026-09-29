/**
 * The thinking behind the drills, kept apart from the screens that show them: what counts as a
 * correct memo, which sticker to ask about next, and how well it is going.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { CORNER_BUFFER, EDGE_BUFFER, arrangementOf, executionFor, shoot } from './op';
import {
  CORNER_PIECES,
  EDGE_PIECES,
  LETTERS,
  cornerPieceOf,
  edgePieceOf,
  type Letter,
} from './speffz';

type Kind = 'edge' | 'corner';
import type { StickerStat, TracingAttempt } from '../store';

/** Under this, a sticker counts as known. */
export const TARGET_MS = 2000;

/** Letters only; anything else typed is ignored. */
export const lettersIn = (typed: string): Letter[] =>
  typed
    .toUpperCase()
    .split('')
    .filter((character) => LETTERS.includes(character));

/**
 * Does this memo, whoever wrote it, actually solve that scramble?
 *
 * Checked by running it rather than by comparing it with the site's own, so any valid order of
 * cycle breaks passes.
 */
export function memoIsValid(scrambled: string, edges: Letter[], corners: Letter[]): boolean {
  if (edges.some((letter) => edgePieceOf(EDGE_BUFFER).includes(letter))) return false;
  if (corners.some((letter) => cornerPieceOf(CORNER_BUFFER).includes(letter))) return false;
  const memo = {
    edges,
    corners,
    parity: edges.length % 2 === 1,
    flippedEdges: [],
    twistedCorners: [],
  };
  return applyAlg(scrambled, executionFor(memo)) === SOLVED;
}

/**
 * Where a memo stops being possible.
 *
 * `at` counts targets from one, so it reads the way a memo does. `expected` is the only letter
 * that could have come next, and is null where the tracer had a free choice - at a cycle break,
 * any piece still out of place will do, so there is nothing to have got wrong except choosing a
 * piece that is already home.
 */
export interface MemoFault {
  at: number;
  reason:
    | 'buffer-sticker'
    | 'wrong-sticker'
    | 'wrong-target'
    | 'already-solved'
    | 'stopped-early'
    | 'kept-going';
  /** What was written there, or null where nothing was. */
  letter: Letter | null;
  expected: Letter | null;
}

export interface MemoCheck {
  ok: boolean;
  /** Targets that were right before anything went wrong. */
  good: number;
  fault: MemoFault | null;
}

/**
 * Follow a memo on the cube and say where it stops being possible.
 *
 * There is no single right memo, so nothing is compared with anything: the memo is walked, and at
 * each step the cube itself says what could come next. Away from a cycle break there is exactly
 * one answer - the sticker sitting in the buffer says where the piece in your hand belongs - and
 * at a break there are many, all equally good.
 *
 * Only the first mistake is worth reporting. Everything after a wrong target is wrong because of
 * it, not on its own account.
 */
export function checkMemo(scrambled: string, typed: Letter[], kind: Kind): MemoCheck {
  const buffer = kind === 'edge' ? EDGE_BUFFER : CORNER_BUFFER;
  const pieces = kind === 'edge' ? EDGE_PIECES : CORNER_PIECES;
  const pieceOf = kind === 'edge' ? edgePieceOf : cornerPieceOf;

  const at = arrangementOf(scrambled, kind);
  const bufferPiece = pieceOf(buffer);
  const isHome = (piece: Letter[]) => piece.every((place) => at[place] === place);
  const allDone = () => pieces.every((piece) => piece.includes(buffer) || isHome(piece));

  const fault = (index: number, reason: MemoFault['reason'], expected: Letter | null): MemoCheck => ({
    ok: false,
    good: index,
    fault: { at: index + 1, reason, letter: typed[index] ?? null, expected },
  });

  for (let index = 0; index < typed.length; index++) {
    const letter = typed[index];
    if (bufferPiece.includes(letter)) return fault(index, 'buffer-sticker', null);
    if (allDone()) return fault(index, 'kept-going', null);

    const inBuffer = at[buffer];
    if (bufferPiece.includes(inBuffer)) {
      // The buffer is home, so this is a cycle break and any piece still out of place will do.
      if (isHome(pieceOf(letter))) return fault(index, 'already-solved', null);
    } else if (letter !== inBuffer) {
      // Shooting to the other sticker of the right piece is a different mistake from shooting to
      // the wrong piece: the piece arrives, turned the wrong way.
      const reason = pieceOf(letter).includes(inBuffer) ? 'wrong-sticker' : 'wrong-target';
      return fault(index, reason, inBuffer);
    }

    shoot(at, buffer, letter, kind);
  }

  if (!allDone()) {
    const inBuffer = at[buffer];
    const expected = bufferPiece.includes(inBuffer) ? null : inBuffer;
    return {
      ok: false,
      good: typed.length,
      fault: { at: typed.length + 1, reason: 'stopped-early', letter: null, expected },
    };
  }

  return { ok: true, good: typed.length, fault: null };
}

/**
 * What is wrong with a memo that is still being typed.
 *
 * The same walk, but a half-written memo is not a mistake - it is a memo you have not finished.
 * Everything else is worth saying the moment it is typed, because a tracer who is told at once can
 * put it right while they still remember what they were looking at.
 */
export function faultSoFar(scrambled: string, typed: Letter[], kind: Kind): MemoFault | null {
  const { fault } = checkMemo(scrambled, typed, kind);
  return fault && fault.reason !== 'stopped-early' ? fault : null;
}

/** How many tracing attempts in a row have been right, counting back from the most recent. */
export function runningStreak(attempts: TracingAttempt[]): number {
  let streak = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (!attempts[i].correct) break;
    streak += 1;
  }
  return streak;
}

/** How badly this sticker needs asking about. */
export function weightOf(stat: StickerStat | undefined): number {
  if (!stat || stat.asked === 0) return 8;
  const accuracy = stat.right / stat.asked;
  const average = stat.totalMs / Math.max(1, stat.right);
  return 1 + 5 * (1 - accuracy) + (average > TARGET_MS ? 3 : 0) + (stat.asked < 3 ? 2 : 0);
}

/** How much of your answering has been both right and inside the target time. */
export function fluency(stats: Record<string, StickerStat>): {
  known: number;
  total: number;
  share: number;
} {
  const all = Object.values(stats);
  const total = all.reduce((sum, stat) => sum + stat.asked, 0);
  const known = all.reduce(
    (sum, stat) => sum + (stat.right > 0 && stat.totalMs / stat.right <= TARGET_MS ? stat.right : 0),
    0,
  );
  return { known, total, share: total ? known / total : 0 };
}
