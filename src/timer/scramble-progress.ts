/**
 * How far through a scramble you are, read off the cube rather than counted.
 *
 * The state after every prefix of the scramble is worked out once; whatever the cube says it is
 * now is looked up against those. That way an undo walks backwards by itself, and a wrong turn is
 * caught on the turn it happens rather than at the end.
 */

import { SOLVED, applyAlg } from '../cube/cube';

export interface ScrambleProgress {
  /** How many moves of the scramble are on the cube. */
  done: number;
  /** True when the cube is in no state the scramble passes through: a wrong turn. */
  wrong: boolean;
}

/**
 * The state after none of the scramble, after one move, after two, and so on.
 *
 * `from` is where the cube is starting: solved for a scramble, but the driller sets a case up from
 * wherever the last rep left the cube.
 */
export function prefixStates(scramble: string, from: string = SOLVED): string[] {
  const moves = scramble.trim().split(/\s+/).filter(Boolean);
  const states = [from];
  for (const move of moves) states.push(applyAlg(states[states.length - 1], move));
  return states;
}

/**
 * Where the cube is in the scramble.
 *
 * `previous` breaks the tie if the scramble passes through the same state twice, by preferring the
 * reading nearest to where you already were.
 */
export function progressOf(
  states: string[],
  cubeState: string,
  previous = 0,
): ScrambleProgress {
  let best = -1;
  for (let i = 0; i < states.length; i++) {
    if (states[i] !== cubeState) continue;
    if (best === -1 || Math.abs(i - previous) < Math.abs(best - previous)) best = i;
  }
  if (best === -1) return { done: previous, wrong: true };
  return { done: best, wrong: false };
}

/** How each move of the scramble should read on screen. */
export type MoveMark = 'done' | 'wrong' | 'next' | 'todo';

export function markMoves(moveCount: number, progress: ScrambleProgress): MoveMark[] {
  const marks: MoveMark[] = [];
  for (let i = 0; i < moveCount; i++) {
    if (i < progress.done) marks.push('done');
    else if (i === progress.done) marks.push(progress.wrong ? 'wrong' : 'next');
    else marks.push('todo');
  }
  return marks;
}
