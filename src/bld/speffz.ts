/**
 * Speffz lettering: each face lettered clockwise from its own top-left sticker, faces taken in the
 * order U, L, F, R, B, D, with edges and corners lettered separately.
 *
 * Everything here is a sticker, not a piece. A corner has three stickers with three different
 * letters, and which one you name is what tells you how the piece is twisted.
 */

import { type Face } from '../cube/cube';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');

export type Letter = string;

/**
 * Facelet index for each corner letter. The index convention is the Kociemba one used everywhere
 * else in this codebase: U, R, F, D, L, B, nine stickers each, read like the unfolded net.
 */
export const CORNER_STICKER: Record<Letter, number> = {
  A: 0, B: 2, C: 8, D: 6, // U face: ULB, UBR, UFR, UFL
  E: 36, F: 38, G: 44, H: 42, // L face: ULB, UFL, DFL, DBL
  I: 18, J: 20, K: 26, L: 24, // F face: UFL, UFR, DFR, DFL
  M: 9, N: 11, O: 17, P: 15, // R face: URF, UBR, DBR, DFR
  Q: 45, R: 47, S: 53, T: 51, // B face: UBR, ULB, DBL, DBR
  U: 27, V: 29, W: 35, X: 33, // D face: DFL, DFR, DBR, DBL
};

/** Facelet index for each edge letter. */
export const EDGE_STICKER: Record<Letter, number> = {
  A: 1, B: 5, C: 7, D: 3, // U face: UB, UR, UF, UL
  E: 37, F: 41, G: 43, H: 39, // L face: UL, LF, DL, LB
  I: 19, J: 23, K: 25, L: 21, // F face: UF, FR, DF, FL
  M: 10, N: 14, O: 16, P: 12, // R face: UR, BR, DR, FR
  Q: 46, R: 50, S: 52, T: 48, // B face: UB, BL, DB, BR
  U: 28, V: 32, W: 34, X: 30, // D face: DF, DR, DB, DL
};

/** The three stickers of each corner piece, and the two of each edge, as letter groups. */
export const CORNER_PIECES: Letter[][] = [
  ['A', 'E', 'R'], // ULB
  ['B', 'Q', 'N'], // UBR
  ['C', 'M', 'J'], // UFR
  ['D', 'I', 'F'], // UFL
  ['U', 'G', 'L'], // DFL
  ['V', 'K', 'P'], // DFR
  ['W', 'O', 'T'], // DBR
  ['X', 'S', 'H'], // DBL
];

export const EDGE_PIECES: Letter[][] = [
  ['A', 'Q'], // UB
  ['B', 'M'], // UR
  ['C', 'I'], // UF
  ['D', 'E'], // UL
  ['F', 'L'], // FL
  ['J', 'P'], // FR
  ['N', 'T'], // BR
  ['H', 'R'], // BL
  ['U', 'K'], // DF
  ['V', 'O'], // DR
  ['W', 'S'], // DB
  ['X', 'G'], // DL
];

const byStickerIndex = (map: Record<Letter, number>): Map<number, Letter> =>
  new Map(Object.entries(map).map(([letter, index]) => [index, letter] as const));

export const CORNER_LETTER_AT = byStickerIndex(CORNER_STICKER);
export const EDGE_LETTER_AT = byStickerIndex(EDGE_STICKER);

/** The other stickers of the same piece, in order, starting from this one. */
export function cornerPieceOf(letter: Letter): Letter[] {
  const piece = CORNER_PIECES.find((stickers) => stickers.includes(letter))!;
  const start = piece.indexOf(letter);
  return [...piece.slice(start), ...piece.slice(0, start)];
}

export function edgePieceOf(letter: Letter): Letter[] {
  const piece = EDGE_PIECES.find((stickers) => stickers.includes(letter))!;
  return piece[0] === letter ? [...piece] : [piece[1], piece[0]];
}

/**
 * Which sticker is sitting in a given place, named by its letter.
 *
 * The facelets say what colour is where; a corner or edge is named by the colours of its stickers
 * read in the piece's own order, which is what lets a target be looked up.
 */
export function cornerLetterIn(facelets: string, place: Letter): Letter {
  const colours = cornerPieceOf(place).map((sticker) => facelets[CORNER_STICKER[sticker]] as Face);
  return pieceLetter(colours, CORNER_PIECES, CORNER_STICKER, facelets.length === 54);
}

export function edgeLetterIn(facelets: string, place: Letter): Letter {
  const colours = edgePieceOf(place).map((sticker) => facelets[EDGE_STICKER[sticker]] as Face);
  return pieceLetter(colours, EDGE_PIECES, EDGE_STICKER, facelets.length === 54);
}

/** Solved-cube colour of each sticker, used to recognise which piece is which. */
const SOLVED_COLOUR = (index: number): Face => 'URFDLB'[Math.floor(index / 9)] as Face;

function pieceLetter(
  colours: Face[],
  pieces: Letter[][],
  stickers: Record<Letter, number>,
  ok: boolean,
): Letter {
  if (!ok) throw new Error('Not a facelet string');
  for (const piece of pieces) {
    for (let rotation = 0; rotation < piece.length; rotation++) {
      const candidate = [...piece.slice(rotation), ...piece.slice(0, rotation)];
      if (candidate.every((sticker, i) => SOLVED_COLOUR(stickers[sticker]) === colours[i])) {
        return candidate[0];
      }
    }
  }
  throw new Error(`No piece has the colours ${colours.join('')}`);
}
