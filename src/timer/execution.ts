/**
 * Which way of doing a case is actually quickest in your hands.
 *
 * Counting moves says a three-move algorithm beats a seven-move one, and for F2L that is often
 * wrong. Two of the six faces - whichever two are facing you and away from you - cannot be turned
 * without letting go of the cube, and a regrip costs about as much as a couple of turns. So a
 * longer algorithm that stays on the faces your fingers are already on is faster, and so, often,
 * is turning the whole cube a quarter first and doing the same moves with the better hand.
 *
 * Nothing here decides what a case is. It takes the algorithms already worked out for it and picks
 * between them, knowing which way the cube is being held.
 */

import { faceMapOf, type Face } from '../cube/cube';

/** A turn of the front or back face means letting go; everything else is fingers. */
const REGRIP_FACES = new Set(['F', 'B']);

/** What a regrip is worth, in ordinary turns. */
const REGRIP_COST = 2;

/** What turning the whole cube round is worth. Cheaper than a regrip, dearer than nothing. */
const ROTATION_COST = 1;

/** The quarter turns worth trying before starting: the slot can go to any of the four corners. */
const ROTATIONS = ['', "y'", 'y', 'y2'];

export interface Execution {
  /** Turn the cube this way first, or '' to leave it where it is. */
  rotation: string;
  /** Then make these turns, named for where that leaves you. */
  alg: string;
  /** How many of them need letting go of the cube. */
  regrips: number;
  length: number;
  /** Moves, plus what the regrips and the rotation cost on top. */
  cost: number;
}

/** What a written-out algorithm costs to turn, counting regrips and any rotation in it. */
export function costOfAlg(alg: string): number {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((total, move) => {
      if (move[0] === 'y' || move[0] === 'x' || move[0] === 'z') return total + ROTATION_COST;
      return total + (REGRIP_FACES.has(move[0]) ? REGRIP_COST : 1);
    }, 0);
}

const relabel = (alg: string, map: Record<Face, Face>): string =>
  alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((move) => (map[move[0] as Face] ?? move[0]) + move.slice(1))
    .join(' ');

/**
 * The nicest of these algorithms, and the rotation to do it after.
 *
 * `grip` is the rotation that takes the cube's own frame to the one the reader is holding it in;
 * every candidate is tried in that grip and in each quarter turn from it, and the cheapest wins.
 * Ties go to the one with fewer regrips - two ways of the same price are not equally pleasant, and
 * the one that keeps hold of the cube flows better - then to the shorter, then to not turning the
 * cube at all.
 */
export function bestExecution(cubeFrameAlgs: string[], grip: string): Execution {
  let best: Execution | null = null;

  for (const alg of cubeFrameAlgs) {
    for (const rotation of ROTATIONS) {
      // Held as `grip` says and then turned by `rotation` - which is what the reader will do, in
      // that order, so that is the order the two rotations go in.
      const named = relabel(alg, faceMapOf(`${grip} ${rotation}`.trim()));
      const moves = named.split(' ').filter(Boolean);
      const regrips = moves.filter((move) => REGRIP_FACES.has(move[0])).length;
      const candidate: Execution = {
        rotation,
        alg: named,
        regrips,
        length: moves.length,
        cost: costOfAlg(named) + (rotation ? ROTATION_COST : 0),
      };

      if (!best || better(candidate, best)) best = candidate;
    }
  }

  return best ?? { rotation: '', alg: '', regrips: 0, length: 0, cost: 0 };
}

/** Cheapest first, then smoothest, then shortest, then leaving the cube where it is. */
function better(candidate: Execution, best: Execution): boolean {
  const order = (execution: Execution): number[] => [
    execution.cost,
    execution.regrips,
    execution.length,
    execution.rotation ? 1 : 0,
  ];
  const a = order(candidate);
  const b = order(best);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** The whole thing as you would read it off a sheet, rotation and all. */
export function writtenOut(execution: Execution): string {
  return execution.rotation ? `${execution.rotation} ${execution.alg}` : execution.alg;
}
