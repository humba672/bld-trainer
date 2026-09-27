import { describe, expect, it } from 'vitest';
import { ENOUGH_SAMPLES, speedBand, type CaseStat } from './f2l-stats';

/**
 * The colour on a case card. Measured against your own typical case rather than against a fixed
 * time, so it always says where to work next: get quicker everywhere and the board does not turn
 * green, it re-sorts itself around the new normal.
 */

const stat = (meanExecutionMs: number, samples = ENOUGH_SAMPLES): CaseStat => ({
  caseKey: 'c0.0e0.0',
  samples,
  fromSolves: samples,
  meanExecutionMs,
  bestExecutionMs: meanExecutionMs,
  meanRecognitionMs: null,
  perSolve: 1,
  lossPerSolveMs: 0,
  ranked: samples >= ENOUGH_SAMPLES,
});

describe('the colour a case gets', () => {
  it('says nothing at all about a case you have never had', () => {
    expect(speedBand(undefined, 2000)).toBe('unseen');
  });

  it('says nothing about one with barely any reps', () => {
    expect(speedBand(stat(9000, ENOUGH_SAMPLES - 1), 2000)).toBe('thin');
  });

  it('is kind to the ones you are quick at and hard on the ones you are not', () => {
    expect(speedBand(stat(1200), 2000)).toBe('quick');
    expect(speedBand(stat(1800), 2000)).toBe('fine');
    expect(speedBand(stat(2200), 2000)).toBe('middling');
    expect(speedBand(stat(2800), 2000)).toBe('slow');
    expect(speedBand(stat(4000), 2000)).toBe('worst');
  });

  it('moves with you: the same time is good or bad depending on the rest', () => {
    expect(speedBand(stat(2000), 4000)).toBe('quick');
    expect(speedBand(stat(2000), 1000)).toBe('worst');
  });

  it('holds off until there is a typical case to measure against', () => {
    expect(speedBand(stat(2000), 0)).toBe('thin');
  });
});
