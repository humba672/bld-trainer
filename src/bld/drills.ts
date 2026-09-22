/**
 * The thinking behind the drills, kept apart from the screens that show them: what counts as a
 * correct memo, which sticker to ask about next, and how well it is going.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { CORNER_BUFFER, EDGE_BUFFER, executionFor } from './op';
import { LETTERS, cornerPieceOf, edgePieceOf, type Letter } from './speffz';
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
