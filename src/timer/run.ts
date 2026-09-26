/**
 * When a solve starts and stops.
 *
 * There is no button: the scramble is confirmed by the cube reaching that state, the clock starts
 * on the first turn after that, and it stops the moment the cube is solved. Kept apart from the
 * screen so it can be checked without a cube in hand.
 */

import { SOLVED } from '../cube/cube';
import type { Turn } from './cfop';

export type Phase = 'scrambling' | 'applying' | 'ready' | 'inspecting' | 'solving' | 'done';

export interface RunOptions {
  inspection?: boolean;
}

export class SolveRun {
  phase: Phase = 'scrambling';
  /** The turns of this solve, in order, with the clock reading when each landed. */
  turns: Turn[] = [];
  /** Host clock at the moment the scramble was confirmed, which is when inspection starts. */
  confirmedAt = 0;

  private scrambled = SOLVED;
  private inspection: boolean;

  constructor(options: RunOptions = {}) {
    this.inspection = options.inspection ?? false;
  }

  /** A new scramble to apply. */
  setScramble(scrambledState: string): void {
    this.scrambled = scrambledState;
    this.phase = 'applying';
    this.turns = [];
  }

  setInspection(on: boolean): void {
    this.inspection = on;
  }

  get startedAt(): number {
    return this.turns[0]?.t ?? 0;
  }

  /** Elapsed time so far, or of the finished solve. */
  get elapsedMs(): number {
    if (this.turns.length < 2) return 0;
    return this.turns[this.turns.length - 1].t - this.turns[0].t;
  }

  /**
   * Feed in everything that happened since the last call: the turns the cube reported, and the
   * state it is in now. Returns true when this call ended the solve.
   */
  feed(fresh: Turn[], cubeState: string, now: number): boolean {
    if (this.phase === 'applying') {
      if (cubeState === this.scrambled) {
        this.phase = this.inspection ? 'inspecting' : 'ready';
        this.confirmedAt = now;
      }
      return false;
    }

    if (this.phase === 'ready' || this.phase === 'inspecting') {
      if (!fresh.length) return false;
      this.phase = 'solving';
      this.turns = [];
    }

    if (this.phase !== 'solving') return false;

    this.turns.push(...fresh);
    // A solve that is somehow already solved on its first turn is not a solve.
    if (cubeState === SOLVED && this.turns.length > 1) {
      this.phase = 'done';
      return true;
    }
    return false;
  }

  /** Inspection time used, for the +2 and DNF that WCA inspection carries. */
  inspectionPenalty(now: number): 'none' | 'plus2' | 'dnf' {
    if (!this.inspection || this.phase !== 'inspecting') return 'none';
    const used = now - this.confirmedAt;
    if (used > 17000) return 'dnf';
    if (used > 15000) return 'plus2';
    return 'none';
  }
}
