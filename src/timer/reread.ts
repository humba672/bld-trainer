/**
 * Reading stored solves again.
 *
 * Almost nothing about a solve is recorded: the scramble, the state it began in, every turn with
 * the time it landed, and the verdict the cube itself gave. The stages, the pairs and the case
 * names are all worked out from those. So when the working-out turns out to have been wrong -
 * as naming a case in a slot other than the front-right one was - the solves are not lost. They
 * are read again.
 *
 * `READING` goes up whenever the reading changes in a way that would give different numbers. Each
 * solve remembers which reading it was stored under, so this happens once and not on every load.
 */

import type { Solve } from './averages';
import { analyseSolve } from './cfop';

/**
 * 1 - the first reading.
 * 2 - cases in the FL, BL and BR slots were named by the wrong pair's colours.
 */
export const READING = 2;

/** Notes that came from asking the cube, which no amount of re-reading could produce. */
const FROM_THE_CUBE = 'the cube does not agree with the turns recorded, so turns went missing';

/** The same solve with everything derived worked out afresh. */
export function rereadSolve(solve: Solve): Solve {
  const analysis = analyseSolve(solve.startState!, solve.moves);
  const unclear = [...analysis.unclear];
  if (solve.verified === false && !unclear.includes(FROM_THE_CUBE)) unclear.push(FROM_THE_CUBE);

  return {
    ...solve,
    reading: READING,
    unclear,
    stages: analysis.stages,
    pairs: analysis.pairs.map(({ slot, caseKey, recognitionMs, executionMs }) => ({
      slot,
      caseKey,
      recognitionMs,
      executionMs,
    })),
    // The clock, the move count and the turns themselves stand: they were measured, not deduced.
  };
}

/**
 * Every solve that can be read again and has not been, read again. Solves stored before the start
 * state was kept cannot be: the same scramble lands somewhere else depending on how you were
 * holding the cube, so there is nothing to read from. Those are left exactly as they are.
 */
export function reread(solves: Solve[]): { solves: Solve[]; changed: number } {
  let changed = 0;
  const out = solves.map((solve) => {
    if (solve.reading === READING) return solve;
    if (!solve.startState || solve.moves.length === 0) return solve;
    changed++;
    return rereadSolve(solve);
  });
  return { solves: changed ? out : solves, changed };
}
