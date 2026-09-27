import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg, invertAlg } from '../cube/cube';
import type { Solve } from './averages';
import { analyseSolve } from './cfop';
import { READING, reread } from './reread';

/**
 * A solve keeps the state it began in and every turn with its time, so anything read out of it can
 * be read again. That is what makes a fix to the reading reach backwards: the numbers on the F2L
 * table are worked out, not recorded, and a solve stored under a wrong reading is not lost.
 */

const turnsOf = (alg: string, from = 0) =>
  alg
    .trim()
    .split(/\s+/)
    .map((move, index) => ({ move, t: from + index * 500 }));

/**
 * A solve built backwards: these are the turns, and the scramble is whatever state they undo. A
 * real solve is what has to be re-read, so this is a legible one - four pairs and a last layer -
 * rather than a scramble played in reverse, which reads as nothing in particular.
 */
const SOLUTION = ["R' D R", "F' D' F", "L' D L", "B' D' B", 'D2'].join(' ');

const solveOf = (extras: Partial<Solve> = {}): Solve => ({
  at: 1,
  scramble: invertAlg(SOLUTION),
  startState: applyAlg(SOLVED, invertAlg(SOLUTION)),
  randomState: true,
  timeMs: 1000,
  penalty: 'none',
  moves: turnsOf(SOLUTION),
  unclear: [],
  ...extras,
});

describe('re-reading solves that were stored under an older reading', () => {
  it('works the stages and pairs out again from the turns', () => {
    const stale = solveOf({ pairs: [{ slot: 'FL', caseKey: 'nonsense', recognitionMs: 1, executionMs: 1 }] });
    const { solves, changed } = reread([stale]);
    expect(changed).toBe(1);
    expect(solves[0].reading).toBe(READING);
    expect(solves[0].pairs?.some((pair) => pair.caseKey === 'nonsense')).toBe(false);
  });

  it('leaves a solve alone once it has been read this way', () => {
    const [fresh] = reread([solveOf()]).solves;
    const again = reread([fresh]);
    expect(again.changed).toBe(0);
    expect(again.solves[0]).toBe(fresh);
  });

  it('does not touch what was recorded rather than worked out', () => {
    const stale = solveOf({ timeMs: 12345, penalty: 'plus2', at: 999 });
    const [fresh] = reread([stale]).solves;
    expect(fresh.timeMs).toBe(12345);
    expect(fresh.penalty).toBe('plus2');
    expect(fresh.at).toBe(999);
    expect(fresh.scramble).toBe(stale.scramble);
    expect(fresh.moves).toBe(stale.moves);
  });

  it('keeps what only the cube could have told us', () => {
    // Whether the turns added up to the state the cube reported cannot be worked out from the
    // turns, so that verdict and its note survive the re-reading.
    const note = 'the cube does not agree with the turns recorded, so turns went missing';
    const stale = solveOf({ verified: false, unclear: [note, 'the cross was never complete'] });
    const [fresh] = reread([stale]).solves;
    expect(fresh.verified).toBe(false);
    expect(fresh.unclear).toContain(note);
    expect(fresh.unclear.filter((line) => line === note)).toHaveLength(1);
  });

  it('cannot re-read a solve that was stored without the state it began in', () => {
    const stale = solveOf();
    delete stale.startState;
    const { solves, changed } = reread([stale]);
    expect(changed).toBe(0);
    expect(solves[0].reading).toBeUndefined();
  });

  it('reads the same pairs the timer would have read from the same turns', () => {
    const [fresh] = reread([solveOf()]).solves;
    expect(fresh.pairs?.length).toBeGreaterThan(0);
    expect(fresh.pairs!.map((pair) => pair.slot)).toEqual(['FR', 'FL', 'BL', 'BR']);
    // And the same reading as the timer itself would have taken from those turns.
    const direct = analyseSolve(fresh.startState!, fresh.moves);
    expect(fresh.pairs!.map((pair) => pair.caseKey)).toEqual(direct.pairs.map((pair) => pair.caseKey));
  });
});
