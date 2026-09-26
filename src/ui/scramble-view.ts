/**
 * A scramble shown move by move, coloured by what the cube says you have actually done.
 */

import { markMoves, type ScrambleProgress } from '../timer/scramble-progress';

export function renderScramble(
  into: HTMLElement,
  scramble: string,
  progress: ScrambleProgress,
  live: boolean,
): void {
  const moves = scramble.trim().split(/\s+/).filter(Boolean);
  const marks = markMoves(moves.length, progress);
  into.innerHTML = '';
  moves.forEach((move, i) => {
    const span = document.createElement('span');
    span.className = `move ${live ? marks[i] : 'plain'}`;
    span.textContent = move;
    into.appendChild(span);
  });
}
