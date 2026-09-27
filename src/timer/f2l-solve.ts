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

import {
  ORIENTATIONS,
  SOLVED,
  applyAlg,
  applyMove,
  faceMapOf,
  invertAlg,
  type Face,
} from '../cube/cube';
import { COLOUR_NAME } from '../cube/colours';
import { TO_FRONT_RIGHT, f2lCaseOf, f2lComplete, type SlotName } from './cfop';
import { bestExecution, type Execution } from './execution';
import solutionData from '../data/f2l-solutions.json';

/** The free layer and the two faces either side of the front-right slot. */
const FACES: Face[] = ['D', 'R', 'F'];
const MOVES: string[] = FACES.flatMap((face) => [face, `${face}'`, `${face}2`]);

/**
 * Held white-down with this slot at the front right, D reads as U, R as F and F as R. Found rather
 * than written out, so it cannot drift from what the engine actually does.
 */
export const DISPLAY_ROTATION = ORIENTATIONS.find((rotation) => {
  const map = faceMapOf(rotation);
  return map.U === 'D' && map.F === 'R' && map.R === 'F';
})!;

const DISPLAY_MAP = faceMapOf(DISPLAY_ROTATION);

/**
 * Which face of the cube ends up where, when you hold it the way the printed algorithms are
 * written. Read off a solved cube rather than written down, so it cannot drift from the notation:
 * whatever rotation the display uses, this is what you would be looking at.
 */
export const DISPLAY_GRIP = (() => {
  const held = applyAlg(SOLVED, DISPLAY_ROTATION);
  return {
    up: held[4] as Face,
    right: held[1 * 9 + 4] as Face,
    front: held[2 * 9 + 4] as Face,
  };
})();

/** The same thing in words, for the screens: which colour goes where. */
export function gripSentence(): string {
  const { up, front, right } = DISPLAY_GRIP;
  return `${COLOUR_NAME[up]} on top, ${COLOUR_NAME[front]} facing you, ${COLOUR_NAME[right]} on your right`;
}

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

/**
 * The cheapest algorithm rather than the shortest, when the faces do not cost the same.
 *
 * An F move cannot be made without letting go of the cube, so it is worth more than a turn of the
 * face your fingers are already on - which means the shortest algorithm is not always the quickest
 * one. Give the awkward face a higher price and the search will happily take a longer route round
 * it, which is what a speedsolver does by hand.
 *
 * Costs are in the cube's own frame, where the two faces beside the slot are R and F; which of
 * them is the awkward one depends on how the cube is being held, so that is the caller's business.
 */
export function cheapestF2L(
  state: string,
  costOf: Record<string, number>,
  maxCost = 14,
): string | null {
  const walk = (at: string, left: number, lastFace: string, path: string[]): string | null => {
    if (f2lComplete(at)) return path.join(' ');
    for (const move of MOVES) {
      const cost = costOf[move[0]] ?? 1;
      if (move[0] === lastFace || cost > left) continue;
      path.push(move);
      const found = walk(applyMove(at, move), left - cost, move[0], path);
      path.pop();
      if (found !== null) return found;
    }
    return null;
  };

  for (let bound = 0; bound <= maxCost; bound++) {
    const found = walk(state, bound, '', []);
    if (found !== null) return found;
  }
  return null;
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

// ---------------------------------------------------------------- the one you can actually do

const SOLUTIONS = solutionData as Record<string, { cubeFrame: string; options?: string[] }>;

const relabel = (alg: string, map: Record<Face, Face>): string =>
  alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((move) => (map[move[0] as Face] ?? move[0]) + move.slice(1))
    .join(' ');

const invertMap = (map: Record<Face, Face>): Record<Face, Face> =>
  Object.fromEntries(Object.entries(map).map(([from, to]) => [to, from])) as Record<Face, Face>;

/**
 * The algorithm for the case in front of you, written as the turns you would actually make.
 *
 * A stored algorithm solves its case in the cube's own frame with the slot at the front right.
 * Neither of those is true when you are drilling: the case lands in whichever slot the setup
 * opened, and you hold the cube however you like. So it is turned round twice - once for the slot,
 * once for the way you are holding it - and every step is checked by applying it, rather than
 * trusted to come out right.
 *
 * `holding` is the rotation from white-on-top, green-in-front that the site worked out while you
 * were setting the case up. Empty means it could not tell, and the answer is then written for
 * white on top.
 */
export function solutionFor(state: string, slot: SlotName, holding = ''): string | null {
  const [first] = candidatesFor(state, slot);
  if (first === undefined) return null;
  return holding ? relabel(first, faceMapOf(holding)) : first;
}

/**
 * Every stored algorithm for this case, written so that it solves the cube actually in front of
 * you - in the cube's own frame, ready to be named for whatever grip it is going to be read in.
 *
 * The state is never turned round: a real cube's frame is its centres and they do not move, and
 * every "is this solved" check here is written against them. The algorithms are relabelled into
 * the slot instead. Both ways round are tried and only the ones that really do finish the pair are
 * kept, rather than trusting a rotation to compose the way I think it does.
 */
export function candidatesFor(state: string, slot: SlotName): string[] {
  const entry = SOLUTIONS[f2lCaseOf(state, slot).key];
  if (entry === undefined) return [];

  const intoSlot = faceMapOf(TO_FRONT_RIGHT[slot] ? invertAlg(TO_FRONT_RIGHT[slot]) : '');
  const found: string[] = [];

  for (const option of entry.options ?? [entry.cubeFrame]) {
    for (const alg of [relabel(option, intoSlot), relabel(option, invertMap(intoSlot))]) {
      // Which turn of the free layer lines this up with the case as it was stored.
      for (const auf of ['', 'D', 'D2', "D'"]) {
        const candidate = auf ? `${auf} ${alg}` : alg;
        if (!f2lComplete(applyAlg(state, candidate))) continue;
        if (!found.includes(candidate)) found.push(candidate);
        break;
      }
    }
  }
  return found;
}

/**
 * The nicest way to do the case in front of you, in the turns your own hands would make.
 *
 * `holding` is the rotation the site worked out while you set the case up. Knowing it means the
 * moves can be named for the cube as you are actually holding it, and the rotation that saves a
 * regrip can be chosen for that grip rather than for the one the case list assumes. Empty means it
 * could not tell, and the grip the pictures use is assumed instead.
 */
export function executionFor(state: string, slot: SlotName, holding = ''): Execution | null {
  const candidates = candidatesFor(state, slot);
  if (!candidates.length) return null;
  return bestExecution(candidates, holding || DISPLAY_ROTATION);
}
