import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg } from '../cube/cube';
import { DISPLAY_ROTATION } from '../timer/f2l-solve';
import { isoStickers, isoSvg, shade } from './iso';

/**
 * The drawing has one job beyond looking like a cube: the sticker you see in a given place has to
 * be the sticker that is really there. That is the mapping from facelet index to position, and it
 * is easy to get subtly wrong - a face mirrored, a row reversed - in a way that still looks like a
 * perfectly good cube.
 */

describe('the three faces it draws', () => {
  it('draws 27 stickers, nine from each of U, F and R', () => {
    const stickers = isoStickers(SOLVED);
    expect(stickers).toHaveLength(27);
    for (const face of ['U', 'F', 'R'] as const) {
      expect(stickers.filter((sticker) => sticker.face === face)).toHaveLength(9);
    }
  });

  it('takes each sticker from the facelet the picture is of', () => {
    // A cube with every sticker different, so nothing can be right by luck.
    const painted = [...SOLVED]
      .map((_, index) => 'URFDLB'[index % 6])
      .join('');
    for (const sticker of isoStickers(painted)) {
      expect(sticker.colour, `facelet ${sticker.facelet}`).toBe(painted[sticker.facelet]);
    }
  });

  it('reads the top face with its first row at the back', () => {
    const stickers = isoStickers(SOLVED);
    const backLeft = stickers.find((s) => s.facelet === 0)!;
    const frontLeft = stickers.find((s) => s.facelet === 6)!;
    // Further down the screen means nearer you, and the two share a column.
    const lowest = (s: typeof backLeft) => Math.max(...s.corners.map(([, y]) => y));
    expect(lowest(frontLeft)).toBeGreaterThan(lowest(backLeft));
  });

  it('reads the right face with its first column next to the front', () => {
    const stickers = isoStickers(SOLVED);
    const nearFront = stickers.find((s) => s.facelet === 9)!;
    const nearBack = stickers.find((s) => s.facelet === 11)!;
    const rightmost = (s: typeof nearFront) => Math.max(...s.corners.map(([x]) => x));
    expect(rightmost(nearBack)).toBeGreaterThan(rightmost(nearFront));
  });

  it('puts the front face below the top face', () => {
    const stickers = isoStickers(SOLVED);
    const topFront = stickers.find((s) => s.facelet === 6)!;
    const frontTop = stickers.find((s) => s.facelet === 18)!;
    const lowest = (s: typeof topFront) => Math.max(...s.corners.map(([, y]) => y));
    expect(lowest(frontTop)).toBeGreaterThan(lowest(topFront));
  });

  it('never overlaps two stickers on the same spot', () => {
    const seen = new Set(
      isoStickers(SOLVED).map((sticker) =>
        sticker.corners.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' '),
      ),
    );
    expect(seen.size).toBe(27);
  });
});

describe('what it draws', () => {
  it('is a picture of the cube it was handed, not of a solved one', () => {
    expect(isoSvg(applyAlg(SOLVED, "R U R'"))).not.toBe(isoSvg(SOLVED));
  });

  it('darkens the faces turned away from the light, and only those', () => {
    expect(shade('#ffffff', 1)).toBe('#ffffff');
    expect(shade('#ffffff', 0.5)).toBe('#808080');
    expect(shade('#2fb14a', 1)).toBe('#2fb14a');
  });

  it('greys the whole thing out when asked', () => {
    const blank = isoSvg(SOLVED, { blank: true });
    expect(blank).not.toContain('#f7f7f7');
    expect(blank.match(/<polygon/g)).toHaveLength(27);
  });
});

describe('the cube the F2L case list pictures', () => {
  it('shows the grip the algorithms are written for, on the faces it says', () => {
    // The claim the case list makes is that the picture IS the instruction: hold your cube to look
    // like this and the moves underneath work. That claim is only true if the face drawn on the
    // left is the one the grip calls the front, and it is the colour the grip names.
    const stickers = isoStickers(applyAlg(SOLVED, DISPLAY_ROTATION));
    const colourOn = (face: 'U' | 'F' | 'R') => stickers.find((s) => s.face === face)!.colour;
    expect(colourOn('U')).toBe('D');
    expect(colourOn('F')).toBe('R');
    expect(colourOn('R')).toBe('F');

    const middle = (face: 'U' | 'F' | 'R') =>
      stickers.filter((s) => s.face === face).reduce((sum, s) => sum + s.corners[0][0], 0) / 9;
    expect(middle('F')).toBeLessThan(0);
    expect(middle('R')).toBeGreaterThan(0);
  });
});
