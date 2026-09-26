import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg, invertAlg } from '../cube/cube';
import { SolveRun } from './run';
import type { Turn } from './cfop';

const SCRAMBLE = "R U R' U' F' L D2 B2 R' F2 U B'";
const scrambled = applyAlg(SOLVED, SCRAMBLE);
const solution = invertAlg(SCRAMBLE).split(' ');

/** Walk the solution through, one turn at a time, as the cube would report it. */
function solveThrough(run: SolveRun, startMs = 1000, gapMs = 150): { ended: boolean; turns: Turn[] } {
  let state = scrambled;
  let ended = false;
  solution.forEach((move, i) => {
    state = applyAlg(state, move);
    const turn = { move, t: startMs + i * gapMs };
    if (run.feed([turn], state, turn.t)) ended = true;
  });
  return { ended, turns: run.turns };
}

describe('when a solve starts and stops', () => {
  it('waits for the scramble to go on the cube', () => {
    const run = new SolveRun();
    run.setScramble(scrambled);
    expect(run.phase).toBe('applying');

    // Turns while scrambling are not part of anything.
    run.feed([{ move: 'R', t: 100 }], applyAlg(SOLVED, 'R'), 100);
    expect(run.phase).toBe('applying');
    expect(run.turns).toEqual([]);

    run.feed([], scrambled, 500);
    expect(run.phase).toBe('ready');
  });

  it('starts on the first turn, not on a button', () => {
    const run = new SolveRun();
    run.setScramble(scrambled);
    run.feed([], scrambled, 500);

    const first = { move: solution[0], t: 1000 };
    run.feed([first], applyAlg(scrambled, solution[0]), 1000);
    expect(run.phase).toBe('solving');
    expect(run.turns).toEqual([first]);
    expect(run.startedAt).toBe(1000);
  });

  it('stops the moment the cube comes out solved', () => {
    const run = new SolveRun();
    run.setScramble(scrambled);
    run.feed([], scrambled, 500);

    const { ended, turns } = solveThrough(run);
    expect(ended).toBe(true);
    expect(run.phase).toBe('done');
    expect(turns).toHaveLength(solution.length);
    expect(run.elapsedMs).toBe((solution.length - 1) * 150);
  });

  it('does not stop on a turn that never scrambled anything', () => {
    const run = new SolveRun();
    run.setScramble(SOLVED); // a "scramble" that is already solved
    run.feed([], SOLVED, 0);
    expect(run.phase).toBe('ready');
    // One turn and back again should not count as a solve on the first turn.
    const ended = run.feed([{ move: 'R', t: 10 }], applyAlg(SOLVED, 'R'), 10);
    expect(ended).toBe(false);
  });

  it('takes several turns arriving at once', () => {
    const run = new SolveRun();
    run.setScramble(scrambled);
    run.feed([], scrambled, 500);

    const batch = solution.map((move, i) => ({ move, t: 1000 + i * 10 }));
    const ended = run.feed(batch, SOLVED, 1200);
    expect(ended).toBe(true);
    expect(run.turns).toHaveLength(solution.length);
  });

  it('starts over cleanly for the next scramble', () => {
    const run = new SolveRun();
    run.setScramble(scrambled);
    run.feed([], scrambled, 500);
    solveThrough(run);
    expect(run.turns.length).toBeGreaterThan(0);

    run.setScramble(scrambled);
    expect(run.phase).toBe('applying');
    expect(run.turns).toEqual([]);
  });
});

describe('inspection', () => {
  it('counts down instead of going straight to ready', () => {
    const run = new SolveRun({ inspection: true });
    run.setScramble(scrambled);
    run.feed([], scrambled, 5000);
    expect(run.phase).toBe('inspecting');
    expect(run.confirmedAt).toBe(5000);
  });

  it('gives two seconds after fifteen, and a DNF after seventeen', () => {
    const run = new SolveRun({ inspection: true });
    run.setScramble(scrambled);
    run.feed([], scrambled, 0);
    expect(run.inspectionPenalty(14000)).toBe('none');
    expect(run.inspectionPenalty(15500)).toBe('plus2');
    expect(run.inspectionPenalty(17500)).toBe('dnf');
  });

  it('is off unless asked for', () => {
    const run = new SolveRun();
    run.setScramble(scrambled);
    run.feed([], scrambled, 0);
    expect(run.phase).toBe('ready');
    expect(run.inspectionPenalty(60000)).toBe('none');
  });
});
