import { describe, expect, it } from 'vitest';
import { FACES, type Face } from '../cube/cube';
import { draggedTo, facingness, viewFor, visibleFaces } from './cube3d';

/**
 * A solid cube shows three faces at a time, so a drill that points at one sticker has to be sure
 * the sticker is one you can see. That is all geometry: turn each face's outward normal by the
 * view's two angles and see which ones end up pointing at you. Getting it wrong would show you a
 * cube and hide the very thing it is asking about, which no amount of looking at the screen while
 * writing the CSS would reliably catch.
 */

describe('which faces you can see', () => {
  it('shows three from a corner-on view', () => {
    expect(visibleFaces({ yaw: -30, pitch: -20 }).sort()).toEqual(['F', 'R', 'U']);
  });

  it('shows the front squarely from straight on', () => {
    expect(visibleFaces({ yaw: 0, pitch: 0 })).toEqual(['F']);
  });

  it('shows the back when you turn all the way round', () => {
    expect(visibleFaces({ yaw: 180, pitch: 0 })).toEqual(['B']);
  });

  it('never shows both of a pair of opposite faces', () => {
    for (let yaw = -180; yaw <= 180; yaw += 15) {
      for (let pitch = -80; pitch <= 80; pitch += 10) {
        const seen = visibleFaces({ yaw, pitch });
        const opposites: Array<[Face, Face]> = [
          ['U', 'D'],
          ['R', 'L'],
          ['F', 'B'],
        ];
        for (const [a, b] of opposites) {
          expect(seen.includes(a) && seen.includes(b), `${yaw},${pitch} shows ${a} and ${b}`).toBe(
            false,
          );
        }
      }
    }
  });

  it('never shows more than three at once', () => {
    for (let yaw = -180; yaw <= 180; yaw += 7) {
      for (let pitch = -80; pitch <= 80; pitch += 7) {
        expect(visibleFaces({ yaw, pitch }).length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('the view a sticker is asked from', () => {
  it('puts every one of the 54 stickers where you can see it', () => {
    for (let index = 0; index < 54; index++) {
      const face = FACES[Math.floor(index / 9)];
      const view = viewFor(index);
      expect(visibleFaces(view), `sticker ${index} on ${face}`).toContain(face);
      // And not edge-on, where a sticker is a sliver you cannot read.
      expect(facingness(face, view), `sticker ${index} on ${face} is edge-on`).toBeGreaterThan(0.4);
    }
  });

  it('leaves white on top unless the sticker is on the white or yellow face', () => {
    // The letters are learnt against a fixed cube, so turning it over would undo the point. Only a
    // sticker on U or D forces a tilt far enough to lose that.
    for (let index = 9; index < 27; index++) expect(Math.abs(viewFor(index).pitch)).toBeLessThan(45);
    for (let index = 36; index < 54; index++) expect(Math.abs(viewFor(index).pitch)).toBeLessThan(45);
  });

  it('looks down on the top face and up at the bottom one', () => {
    expect(viewFor(4).pitch).toBeLessThan(-40);
    expect(viewFor(31).pitch).toBeGreaterThan(40);
  });

  it('brings the sticker to the front rather than leaving it at the side', () => {
    // The face the sticker is on should be the one most towards you, not merely visible.
    for (let index = 0; index < 54; index++) {
      const face = FACES[Math.floor(index / 9)];
      const view = viewFor(index);
      const best = Math.max(...FACES.map((other) => facingness(other, view)));
      expect(facingness(face, view), `sticker ${index} on ${face}`).toBe(best);
    }
  });
});

describe('turning it with the pointer', () => {
  it('turns the way you push it', () => {
    const view = draggedTo({ yaw: 0, pitch: 0 }, 50, 0);
    expect(view.yaw).toBeGreaterThan(0);
    expect(view.pitch).toBe(0);
  });

  it('tips towards you when you pull down, and stops short of upside down', () => {
    expect(draggedTo({ yaw: 0, pitch: 0 }, 0, 40).pitch).toBeLessThan(0);
    // However hard you pull, the cube never goes over the top: past vertical it reads as upside
    // down and you have lost track of which face is which.
    expect(draggedTo({ yaw: 0, pitch: 0 }, 0, 100000).pitch).toBeGreaterThanOrEqual(-90);
    expect(draggedTo({ yaw: 0, pitch: 0 }, 0, -100000).pitch).toBeLessThanOrEqual(90);
  });

  it('keeps the yaw within half a turn either way, however long you spin it', () => {
    // Left to accumulate, the yaw runs off to hundreds of degrees, and the next snap then winds
    // the whole way back round instead of taking the short way.
    let view = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 40; i++) view = draggedTo(view, 60, 0);
    expect(Math.abs(view.yaw)).toBeLessThanOrEqual(180);
  });

  it('shows the same faces whether the yaw was wound up or wrapped', () => {
    const wound = { yaw: 375, pitch: -18 };
    const wrapped = { yaw: 15, pitch: -18 };
    expect(visibleFaces(wound).sort()).toEqual(visibleFaces(wrapped).sort());
  });
});
