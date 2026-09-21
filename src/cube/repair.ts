/**
 * Works out which turns the site never saw.
 *
 * The cube numbers every turn it makes and can be asked for its own state at any time. When that
 * state disagrees with the tracked one, turns were lost on the way - the Gen2 protocol replays at
 * most seven and drops the rest without a word. Rather than throwing away the whole log, this
 * searches for the shortest run of face turns that explains the gap, so the missing turns can be
 * fed back in and everything else survives.
 */

import { type Face, applyMove } from './cube';

const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** Every single face turn the cube could have reported, cheapest first. */
const CANDIDATES: Array<{ face: Face; notation: string; turns: Array<{ face: Face; dir: 1 | -1 }> }> =
  FACES.flatMap((face) => [
    { face, notation: face, turns: [{ face, dir: 1 as const }] },
    { face, notation: `${face}'`, turns: [{ face, dir: -1 as const }] },
    { face, notation: `${face}2`, turns: [{ face, dir: 1 as const }, { face, dir: 1 as const }] },
  ]);

export interface MissingTurns {
  /** The quarter turns to feed back in, in the order the cube made them. */
  turns: Array<{ face: Face; dir: 1 | -1 }>;
  /** The same thing to read, such as "R2 U'". */
  notation: string;
}

/**
 * Find the shortest sequence of face turns that takes `tracked` to `reported`, both in the cube's
 * own frame. Returns null when no short answer exists, which means too much was lost to guess at
 * and the only honest move is to start again from the cube's state.
 */
export function findMissingTurns(
  tracked: string,
  reported: string,
  maxTurns = 3,
): MissingTurns | null {
  if (tracked === reported) return { turns: [], notation: '' };

  for (let depth = 1; depth <= maxTurns; depth++) {
    const found = search(tracked, reported, depth, null);
    if (found) {
      return {
        turns: found.flatMap((step) => step.turns),
        notation: found.map((step) => step.notation).join(' '),
      };
    }
  }
  return null;
}

type Step = (typeof CANDIDATES)[number];

function search(state: string, target: string, depth: number, lastFace: Face | null): Step[] | null {
  for (const step of CANDIDATES) {
    if (step.face === lastFace) continue; // two turns of one face are one turn
    const next = applyMove(state, step.notation);
    if (depth === 1) {
      if (next === target) return [step];
      continue;
    }
    const rest = search(next, target, depth - 1, step.face);
    if (rest) return [step, ...rest];
  }
  return null;
}
