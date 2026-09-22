import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import {
  CORNER_PIECES,
  CORNER_STICKER,
  EDGE_PIECES,
  EDGE_STICKER,
  LETTERS,
  cornerLetterIn,
  cornerPieceOf,
  edgeLetterIn,
  edgePieceOf,
} from './speffz';

describe('Speffz lettering', () => {
  it('has 24 letters', () => {
    expect(LETTERS).toHaveLength(24);
    expect(LETTERS[0]).toBe('A');
    expect(LETTERS[23]).toBe('X');
  });

  it('gives every corner sticker its own letter', () => {
    const indices = LETTERS.map((letter) => CORNER_STICKER[letter]);
    expect(new Set(indices).size).toBe(24);
    // Corners are the four corner stickers of each face, never a centre or an edge.
    for (const index of indices) expect([0, 2, 6, 8]).toContain(index % 9);
  });

  it('gives every edge sticker its own letter', () => {
    const indices = LETTERS.map((letter) => EDGE_STICKER[letter]);
    expect(new Set(indices).size).toBe(24);
    for (const index of indices) expect([1, 3, 5, 7]).toContain(index % 9);
  });

  // The buffers and helpers the spec names, spelled out so a wrong table cannot pass unnoticed.
  it('puts the buffers where the spec says they are', () => {
    expect(EDGE_STICKER.B).toBe(5); // UR, the Old Pochmann edge buffer
    expect(EDGE_STICKER.D).toBe(3); // UL, where edges are shot
    expect(EDGE_STICKER.C).toBe(7); // UF, the Orozco and 3-style edge buffer
    expect(CORNER_STICKER.A).toBe(0); // UBL, the Old Pochmann corner buffer
    expect(CORNER_STICKER.P).toBe(15); // RDF, where corners are shot
    expect(CORNER_STICKER.C).toBe(8); // UFR, the Orozco and 3-style corner buffer
  });

  it('groups the stickers of each piece', () => {
    expect(CORNER_PIECES).toHaveLength(8);
    expect(EDGE_PIECES).toHaveLength(12);
    expect(CORNER_PIECES.flat().sort()).toEqual([...LETTERS].sort());
    expect(EDGE_PIECES.flat().sort()).toEqual([...LETTERS].sort());
  });

  it('reads a piece from any of its stickers', () => {
    expect(cornerPieceOf('A')).toEqual(['A', 'E', 'R']);
    // Every corner reads clockwise from outside, so a twist is a rotation of its own list.
    expect(cornerPieceOf('U')).toEqual(['U', 'G', 'L']);
    expect(cornerPieceOf('E')).toEqual(['E', 'R', 'A']);
    expect(cornerPieceOf('R')).toEqual(['R', 'A', 'E']);
    expect(edgePieceOf('B')).toEqual(['B', 'M']);
    expect(edgePieceOf('M')).toEqual(['M', 'B']);
  });

  it('finds every sticker at home on a solved cube', () => {
    for (const letter of LETTERS) {
      expect(cornerLetterIn(SOLVED, letter)).toBe(letter);
      expect(edgeLetterIn(SOLVED, letter)).toBe(letter);
    }
  });

  it('names the sticker a turn brings into a place', () => {
    // After U, the piece that was at UFR sits at UFL, so the UFL place now holds the UFR sticker.
    const afterU = applyAlg(SOLVED, 'U');
    expect(cornerLetterIn(afterU, 'D')).toBe('C');
    expect(edgeLetterIn(afterU, 'D')).toBe('C');
    // And the buffer at UR now holds what was at UB.
    expect(edgeLetterIn(afterU, 'B')).toBe('A');
  });

  it('reads every place as a sticker of a different piece, however scrambled', () => {
    const scrambled = applyAlg(SOLVED, "R U R' U' F' L D2 B2 R' F2 U B' D L2 F R2 U2");
    const cornerHomes = ['A', 'B', 'C', 'D', 'U', 'V', 'W', 'X'];
    const found = cornerHomes.map((place) => cornerPieceOf(cornerLetterIn(scrambled, place))[0]);
    expect(new Set(found).size).toBe(8);

    const edgeHomes = ['A', 'B', 'C', 'D', 'F', 'J', 'N', 'H', 'U', 'V', 'W', 'X'];
    const edgesFound = edgeHomes.map((place) => edgePieceOf(edgeLetterIn(scrambled, place))[0]);
    expect(new Set(edgesFound).size).toBe(12);
  });
});
