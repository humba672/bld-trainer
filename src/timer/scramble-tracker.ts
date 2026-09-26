/**
 * Following a scramble onto the cube, however you happen to be holding it.
 *
 * The cube reports its own frame, so a scramble applied with the cube turned round lands in a
 * different state from the same scramble applied white-on-top. It is the same scramble to solve -
 * a rotation of it - but the states do not match, so the site would otherwise call every turn
 * wrong. Holding the cube turned by `r` and doing a move as written is the same as the cube seeing
 * that move relabelled through `r`, so every way of holding it is followed at once until your
 * turns say which one you are using.
 */

import { ORIENTATIONS, SOLVED, faceMapOf, type Face } from '../cube/cube';
import { prefixStates, progressOf, type ScrambleProgress } from './scramble-progress';

const relabel = (alg: string, map: Record<Face, Face>): string =>
  alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((move) => (map[move[0] as Face] ?? move[0]) + move.slice(1))
    .join(' ');

interface Variant {
  /** How the cube is being held, as a rotation from white on top, green in front. */
  holding: string;
  states: string[];
}

export class ScrambleTracker {
  readonly moveCount: number;
  private readonly variants: Variant[];
  /** Ways of holding the cube that still fit every turn so far. */
  private candidates: Variant[];
  private done = 0;
  private wrong = false;

  constructor(scramble: string, from: string = SOLVED) {
    this.moveCount = scramble.trim().split(/\s+/).filter(Boolean).length;
    this.variants = ORIENTATIONS.map((holding) => {
      const map = faceMapOf(holding);
      const inverse = Object.fromEntries(
        Object.entries(map).map(([from, to]) => [to, from]),
      ) as Record<Face, Face>;
      return { holding, states: prefixStates(relabel(scramble, inverse), from) };
    });
    this.candidates = this.variants;
  }

  /** How the cube is being held, once enough turns have happened to tell. Empty until then. */
  get holding(): string {
    return this.candidates.length === 1 ? this.candidates[0].holding : '';
  }

  /** How many ways of holding it still fit what you have turned. */
  get possibleHoldings(): number {
    return this.candidates.length;
  }

  /** The state the cube will be in once the whole scramble is on, the way you are holding it. */
  get target(): string {
    return this.candidates[0].states[this.moveCount];
  }

  /** Is the whole scramble on the cube? */
  get complete(): boolean {
    return this.done === this.moveCount && !this.wrong;
  }

  get progress(): ScrambleProgress {
    return { done: this.done, wrong: this.wrong };
  }

  /**
   * Read the cube and say how far through the scramble it is.
   *
   * Several ways of holding the cube produce the same first turn - four of them turn the same face
   * - so nothing is decided on one move. The candidates are narrowed instead, and the holding is
   * known once one of them is left. A turn that fits none of the survivors is a wrong turn, and it
   * narrows nothing, so undoing it picks up where you were.
   */
  update(cubeState: string): ScrambleProgress {
    const readings = this.candidates
      .map((variant) => ({ variant, found: progressOf(variant.states, cubeState, this.done) }))
      .filter(({ found }) => !found.wrong);

    if (!readings.length) {
      this.wrong = true;
      return this.progress;
    }

    // Nearest reading to where we already were wins, so an undo walks back rather than jumping.
    const nearest = Math.min(...readings.map(({ found }) => Math.abs(found.done - this.done)));
    const kept = readings.filter(({ found }) => Math.abs(found.done - this.done) === nearest);

    this.candidates = kept.map(({ variant }) => variant);
    this.done = kept[0].found.done;
    this.wrong = false;
    return this.progress;
  }

  /** Start this scramble again from a cube that has not been touched. */
  reset(): void {
    this.candidates = this.variants;
    this.done = 0;
    this.wrong = false;
  }
}
