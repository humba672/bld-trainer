/**
 * The shortest way to put a pair in.
 *
 * Searched rather than looked up: iterative deepening over the free layer and the two faces beside
 * the slot, stopping the moment the first two layers are whole. The first solution found at a
 * given depth is the shortest there is in those three faces, which is what an F2L algorithm is.
 *
 * Everything here works in the cube's own frame, where white is up and the free layer is D. The
 * answer is turned round for display: the cube is shown the way you hold it, white down with the
 * slot at the front right, so the algorithm reads in R, U and F like any alg sheet.
 */

import { ORIENTATIONS, applyMove, faceMapOf, type Face } from '../cube/cube';
import { f2lComplete } from './cfop';

/** The free layer and the two faces either side of the front-right slot. */
const FACES: Face[] = ['D', 'R', 'F'];
const MOVES: string[] = FACES.flatMap((face) => [face, `${face}'`, `${face}2`]);

/**
 * Held white-down with this slot at the front right, D reads as U, R as F and F as R. Found rather
 * than written out, so it cannot drift from what the engine actually does.
 */
const DISPLAY_ROTATION = ORIENTATIONS.find((rotation) => {
  const map = faceMapOf(rotation);
  return map.U === 'D' && map.F === 'R' && map.R === 'F';
})!;

const DISPLAY_MAP = faceMapOf(DISPLAY_ROTATION);

/** The same algorithm, written the way you would read it off a sheet. */
export function inSolverNotation(alg: string): string {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((move) => DISPLAY_MAP[move[0] as Face] + move.slice(1))
    .join(' ');
}

const cache = new Map<string, string | null>();

/**
 * The shortest algorithm that finishes the first two layers from here, in the cube's own frame.
 * Null if there is none within `maxDepth`, which should not happen for a real case: undoing the
 * moves that set it up is always a solution, and those are in the same three faces.
 */
export function solveF2LCase(state: string, maxDepth = 12): string | null {
  // The cache is only good for the full search; a shallower one is a different question.
  const cached = maxDepth === 12 ? cache.get(state) : undefined;
  if (cached !== undefined) return cached;

  let answer: string | null = null;
  for (let depth = 0; depth <= maxDepth && answer === null; depth++) {
    answer = search(state, depth, '', []);
  }
  if (maxDepth === 12) cache.set(state, answer);
  return answer;
}

function search(state: string, depth: number, lastFace: string, path: string[]): string | null {
  if (f2lComplete(state)) return path.join(' ');
  if (depth === 0) return null;

  for (const move of MOVES) {
    // Two turns of one face in a row are one turn, and never shorter.
    if (move[0] === lastFace) continue;
    const next = applyMove(state, move);
    path.push(move);
    const found = search(next, depth - 1, move[0], path);
    path.pop();
    if (found !== null) return found;
  }
  return null;
}
