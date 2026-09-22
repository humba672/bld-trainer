/**
 * Scrambles.
 *
 * The spec asks for random-state scrambles. cubing.js can produce them, but its solver runs in a
 * worker and none of its three ways of finding that worker survive this bundler: they all end up
 * loading our own bundle as the worker, which then fails. So the site tries once, and otherwise
 * falls back to a long run of random turns and says so on screen rather than pretending.
 */

export interface Scramble {
  alg: string;
  /** False when this is random turns because the random-state scrambler could not start. */
  randomState: boolean;
}

const MOVES = "U U' U2 D D' D2 R R' R2 L L' L2 F F' F2 B B' B2".split(' ');

export function randomTurns(length = 25): string {
  const out: string[] = [];
  let lastFace = '';
  while (out.length < length) {
    const move = MOVES[Math.floor(Math.random() * MOVES.length)];
    if (move[0] === lastFace) continue;
    lastFace = move[0];
    out.push(move);
  }
  return out.join(' ');
}

/** Once the random-state scrambler has failed, stop paying for it on every scramble. */
let randomStateWorks: boolean | null = null;

export async function randomScramble(): Promise<Scramble> {
  if (randomStateWorks !== false) {
    try {
      const { randomScrambleForEvent } = await import('cubing/scramble');
      const alg = await randomScrambleForEvent('333');
      randomStateWorks = true;
      return { alg: alg.toString(), randomState: true };
    } catch {
      randomStateWorks = false;
    }
  }
  return { alg: randomTurns(), randomState: false };
}
