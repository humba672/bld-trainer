import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { markMoves, prefixStates, progressOf } from './scramble-progress';

const SCRAMBLE = "R U F' L2 D";
const states = prefixStates(SCRAMBLE);

describe('following a scramble onto the cube', () => {
  it('knows the state after every prefix', () => {
    expect(states).toHaveLength(6); // before any move, and after each of five
    expect(states[0]).toBe(SOLVED);
    expect(states[5]).toBe(applyAlg(SOLVED, SCRAMBLE));
  });

  it('starts at nothing done and nothing wrong', () => {
    expect(progressOf(states, SOLVED)).toEqual({ done: 0, wrong: false });
  });

  it('counts each correct turn as it lands', () => {
    expect(progressOf(states, applyAlg(SOLVED, 'R'), 0)).toEqual({ done: 1, wrong: false });
    expect(progressOf(states, applyAlg(SOLVED, 'R U'), 1)).toEqual({ done: 2, wrong: false });
    expect(progressOf(states, applyAlg(SOLVED, "R U F'"), 2)).toEqual({ done: 3, wrong: false });
  });

  it('calls a wrong turn wrong, and stays where it was', () => {
    // Two moves in, then a turn that is not F'.
    const wrong = applyAlg(SOLVED, 'R U B');
    expect(progressOf(states, wrong, 2)).toEqual({ done: 2, wrong: true });
  });

  it('walks back by itself when you undo', () => {
    expect(progressOf(states, applyAlg(SOLVED, 'R'), 2)).toEqual({ done: 1, wrong: false });
    expect(progressOf(states, SOLVED, 1)).toEqual({ done: 0, wrong: false });
  });

  it('recovers when you undo the wrong turn', () => {
    const wrong = applyAlg(SOLVED, 'R U B');
    const stuck = progressOf(states, wrong, 2);
    expect(stuck.wrong).toBe(true);
    // Undo the B and you are back where you were, no longer wrong.
    expect(progressOf(states, applyAlg(SOLVED, 'R U'), stuck.done)).toEqual({
      done: 2,
      wrong: false,
    });
  });

  it('knows when the whole scramble is on', () => {
    expect(progressOf(states, applyAlg(SOLVED, SCRAMBLE), 4)).toEqual({ done: 5, wrong: false });
  });

  it('prefers the reading nearest where you already were', () => {
    // A scramble that passes through the same state twice: after two moves and after four.
    const loop = prefixStates("R U U' R'");
    expect(progressOf(loop, applyAlg(SOLVED, 'R'), 1).done).toBe(1);
    expect(progressOf(loop, applyAlg(SOLVED, 'R'), 3).done).toBe(3);
  });

  it('is not fooled by a cube that has nothing to do with the scramble', () => {
    expect(progressOf(states, applyAlg(SOLVED, 'B2 D2 L'), 3)).toEqual({ done: 3, wrong: true });
  });
});

describe('how the scramble reads on screen', () => {
  it('greens what is done and points at what is next', () => {
    expect(markMoves(5, { done: 2, wrong: false })).toEqual([
      'done',
      'done',
      'next',
      'todo',
      'todo',
    ]);
  });

  it('reddens the move you got wrong', () => {
    expect(markMoves(5, { done: 2, wrong: true })).toEqual([
      'done',
      'done',
      'wrong',
      'todo',
      'todo',
    ]);
  });

  it('greens the lot once the scramble is on', () => {
    expect(markMoves(3, { done: 3, wrong: false })).toEqual(['done', 'done', 'done']);
  });
});
