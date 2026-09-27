/**
 * A small solid cube drawn flat: the three faces you look at, in isometric.
 *
 * The F2L case list wants one picture per case, forty-one at a time, and a turnable CSS cube each
 * would be thousands of elements for pictures nobody is going to turn. An isometric drawing is a
 * couple of dozen polygons, and it shows exactly the three faces an F2L case lives on - the free
 * layer on top and the two around the slot.
 *
 * Which three they are depends on nothing here: the caller rotates the cube into the grip it wants
 * pictured and this draws U, F and R of whatever it is handed.
 */

import { BLANK_HEX, COLOUR_HEX } from '../cube/colours';
import type { Face } from '../cube/cube';

/** Screen directions of the cube's three axes, for a cube resting with vertical vertical edges. */
const RIGHT: [number, number] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
const FRONT: [number, number] = [-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
const DOWN: [number, number] = [0, 1];

const FACE_INDEX: Record<'U' | 'R' | 'F', number> = { U: 0, R: 1, F: 2 };

export interface IsoSticker {
  face: 'U' | 'R' | 'F';
  /** Index into the 54-character facelet string. */
  facelet: number;
  colour: Face;
  /** Corners, clockwise, in cube units before scaling. */
  corners: Array<[number, number]>;
}

const add = (...points: Array<[number, number]>): [number, number] => [
  points.reduce((sum, [x]) => sum + x, 0),
  points.reduce((sum, [, y]) => sum + y, 0),
];

const times = ([x, y]: [number, number], by: number): [number, number] => [x * by, y * by];

/**
 * Where each of the 27 visible stickers sits.
 *
 * The three faces are walked in the facelet string's own order - across each row, top row first,
 * seen from outside that face - and turned into positions on the drawing. The top face's first row
 * is the one at the back, and the right face's first column is the one next to the front, which is
 * what the net's layout says and what makes a rotated cube come out looking like itself.
 */
export function isoStickers(facelets: string): IsoSticker[] {
  const out: IsoSticker[] = [];

  const corner = (a: number, down: number, depth: number): [number, number] =>
    add(times(RIGHT, a), times(DOWN, down), times(FRONT, depth));

  const quad = (
    origin: [number, number, number],
    first: [number, number, number],
    second: [number, number, number],
  ): Array<[number, number]> => {
    const at = (u: number, v: number) =>
      corner(
        origin[0] + first[0] * u + second[0] * v,
        origin[1] + first[1] * u + second[1] * v,
        origin[2] + first[2] * u + second[2] * v,
      );
    return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
  };

  for (let cell = 0; cell < 9; cell++) {
    const row = Math.floor(cell / 3);
    const col = cell % 3;

    // Top: columns run to the right, rows run from the back towards you.
    out.push({
      face: 'U',
      facelet: FACE_INDEX.U * 9 + cell,
      colour: facelets[FACE_INDEX.U * 9 + cell] as Face,
      corners: quad([col, 0, row], [1, 0, 0], [0, 0, 1]),
    });

    // Front: columns to the right, rows down, along the near edge of the top face.
    out.push({
      face: 'F',
      facelet: FACE_INDEX.F * 9 + cell,
      colour: facelets[FACE_INDEX.F * 9 + cell] as Face,
      corners: quad([col, row, 3], [1, 0, 0], [0, 1, 0]),
    });

    // Right: its first column is the one beside the front face, so columns run away from you.
    out.push({
      face: 'R',
      facelet: FACE_INDEX.R * 9 + cell,
      colour: facelets[FACE_INDEX.R * 9 + cell] as Face,
      corners: quad([3, row, 3 - col], [0, 0, -1], [0, 1, 0]),
    });
  }

  return out;
}

/** Faces away from the light are drawn darker, which is what makes the drawing read as a solid. */
const SHADE: Record<'U' | 'R' | 'F', number> = { U: 1, F: 0.82, R: 0.62 };

export function shade(hex: string, by: number): string {
  const value = parseInt(hex.slice(1), 16);
  const parts = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return `#${parts.map((part) => Math.round(part * by).toString(16).padStart(2, '0')).join('')}`;
}

export interface IsoOptions {
  /** The length of one sticker's edge, in pixels. */
  cell?: number;
  blank?: boolean;
  /** A facelet to ring, if one wants pointing out. */
  highlight?: number;
}

export function isoSvg(facelets: string, options: IsoOptions = {}): string {
  const cell = options.cell ?? 16;
  const inset = 0.055;

  let shapes = '';
  for (const sticker of isoStickers(facelets)) {
    // Shrunk towards its own middle, so the stickers read as separate tiles.
    const mid: [number, number] = [
      sticker.corners.reduce((sum, [x]) => sum + x, 0) / 4,
      sticker.corners.reduce((sum, [, y]) => sum + y, 0) / 4,
    ];
    const points = sticker.corners
      .map(([x, y]) => {
        const px = (x + (mid[0] - x) * inset * 4) * cell;
        const py = (y + (mid[1] - y) * inset * 4) * cell;
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      })
      .join(' ');
    const base = options.blank ? BLANK_HEX : COLOUR_HEX[sticker.colour] ?? BLANK_HEX;
    const fill = shade(base, SHADE[sticker.face]);
    const ring =
      options.highlight === sticker.facelet ? ' stroke="#fff" stroke-width="2"' : ' stroke="none"';
    shapes += `<polygon points="${points}" fill="${fill}"${ring} />`;
  }

  const width = 6 * RIGHT[0] * cell;
  const height = 6 * cell;
  const left = -3 * RIGHT[0] * cell;
  return (
    `<svg viewBox="${left.toFixed(2)} 0 ${width.toFixed(2)} ${height.toFixed(2)}" ` +
    `width="${width.toFixed(0)}" height="${height.toFixed(0)}" role="img" aria-label="cube">` +
    `${shapes}</svg>`
  );
}
