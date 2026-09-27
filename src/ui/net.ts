/**
 * A flat net of the cube, drawn as SVG, with an optional sticker singled out.
 *
 * Where every sticker has to be seen at once, or where the picture is too small for a solid to
 * read - the timer's scramble preview, the thumbnails in the F2L table - a net says more than a
 * cube does. The facelet order is the same one used everywhere else: U, R, F, D, L, B.
 */

import { BLANK_HEX, COLOUR_HEX } from '../cube/colours';
import type { Face } from '../cube/cube';



/** Where each face sits in the net, in cells. */
const FACE_ORIGIN: Record<number, [number, number]> = {
  0: [3, 0], // U
  1: [6, 3], // R
  2: [3, 3], // F
  3: [3, 6], // D
  4: [0, 3], // L
  5: [9, 3], // B
};

export interface NetOptions {
  /** Facelet index to ring. */
  highlight?: number;
  /** Draw every sticker in grey, for when the colours would give the answer away. */
  blank?: boolean;
  size?: number;
}

export function netSvg(facelets: string, options: NetOptions = {}): string {
  const cell = options.size ?? 22;
  const gap = 1.5;
  const width = 12 * cell;
  const height = 9 * cell;

  let squares = '';
  for (let index = 0; index < 54; index++) {
    const face = Math.floor(index / 9);
    const [fx, fy] = FACE_ORIGIN[face];
    const col = index % 3;
    const row = Math.floor((index % 9) / 3);
    const x = (fx + col) * cell;
    const y = (fy + row) * cell;
    const colour = options.blank ? BLANK_HEX : COLOUR_HEX[facelets[index] as Face] ?? BLANK_HEX;
    squares += `<rect x="${x + gap}" y="${y + gap}" width="${cell - gap * 2}" height="${
      cell - gap * 2
    }" rx="2" fill="${colour}" stroke="#14161a" stroke-width="1" />`;
    if (options.highlight === index) {
      squares += `<rect x="${x + gap}" y="${y + gap}" width="${cell - gap * 2}" height="${
        cell - gap * 2
      }" rx="2" fill="none" stroke="#4f8cff" stroke-width="3">
        <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite" />
      </rect>`;
    }
  }

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px" role="img" aria-label="cube net">${squares}</svg>`;
}
