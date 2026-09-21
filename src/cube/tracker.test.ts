import { describe, expect, it } from 'vitest';
import { SOLVED, applyAlg, equalUpToRotation, invertAlg } from './cube';
import { CubeTracker, type Face, type WireTurn } from './tracker';

/**
 * A stand-in for the physical cube, built from what the hardware actually measures: each face
 * axle reports how far that layer has turned *relative to the core*. Nothing here uses the
 * tracker's own lookup tables, so the tracker is checked against the physics and not itself.
 */
class CubeEmulator {
  /** True state of the cube in the holder's frame (white top, green front to start). */
  space = SOLVED;
  /** Whole-cube rotations the core has undergone, in order. */
  coreRot = '';
  private t = 0;

  /** What the cube itself would report as its facelets: its own frame, centres at home. */
  reported(): string {
    return applyAlg(this.space, invertAlg(this.coreRot));
  }

  /** The cube's own label for the face sitting at holder position `pos`. */
  private cubeLabelAt(pos: Face): Face {
    const centre: Record<Face, number> = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 };
    return applyAlg(SOLVED, this.coreRot)[centre[pos]] as Face;
  }

  /** Turn the cube in the holder's frame; returns what the cube puts on the wire. */
  turn(token: string): WireTurn[] {
    const parsed = /^([URFDLBMESxyz])(w?)('|2)?$/.exec(token);
    if (!parsed) throw new Error(`bad token ${token}`);
    const [, letter, wide, suffix] = parsed;
    const amount = suffix === "'" ? -1 : suffix === '2' ? 2 : 1;

    const axisOf: Record<string, 0 | 1 | 2> = {
      R: 0, L: 0, M: 0, x: 0,
      U: 1, D: 1, E: 1, y: 1,
      F: 2, B: 2, S: 2, z: 2,
    };
    const signOf: Record<string, 1 | -1> = { R: 1, L: -1, U: 1, D: -1, F: 1, B: -1 };
    const axis = axisOf[letter];

    let layers: number[];
    let q: number; // signed quarter turns about the positive axis (the R, U and F directions)
    if ('xyz'.includes(letter)) {
      layers = [1, 0, -1];
      q = amount;
    } else if ('MES'.includes(letter)) {
      layers = [0];
      q = amount * (letter === 'S' ? 1 : -1); // M follows L, E follows D, S follows F
    } else if (wide) {
      layers = [signOf[letter], 0];
      q = amount * signOf[letter];
    } else {
      layers = [signOf[letter]];
      q = amount * signOf[letter];
    }

    const faceAt: Record<number, Record<number, Face>> = {
      0: { 1: 'R', '-1': 'L' },
      1: { 1: 'U', '-1': 'D' },
      2: { 1: 'F', '-1': 'B' },
    };

    const coreQ = layers.includes(0) ? q : 0;
    const wireTurns: WireTurn[] = [];
    for (const s of [1, -1] as const) {
      const layerQ = layers.includes(s) ? q : 0;
      const rel = layerQ - coreQ; // what that face's axle sees
      const dir = ((rel > 0 ? 1 : -1) * s) as 1 | -1; // clockwise seen from outside that face
      for (let i = 0; i < Math.abs(rel); i++) {
        this.t += 6;
        wireTurns.push({ face: this.cubeLabelAt(faceAt[axis][s]), dir, t: this.t });
      }
    }

    this.space = applyAlg(this.space, token);
    const turns = (((coreQ % 4) + 4) % 4);
    if (turns !== 0) {
      const rotation = 'xyz'[axis] + (turns === 3 ? "'" : turns === 2 ? '2' : '');
      this.coreRot = this.coreRot ? `${this.coreRot} ${rotation}` : rotation;
    }
    this.t += 400; // a clear gap, so separate moves are never mistaken for one slice
    return wireTurns;
  }
}

const newTracker = () => new CubeTracker({ pairWindowMs: 120 });

describe('reading one turn at a time', () => {
  it('holds a lone turn back until the pairing window has passed', () => {
    const tracker = newTracker();
    expect(tracker.onWire({ face: 'R', dir: 1, t: 1000 })).toEqual([]);
    expect(tracker.flushBefore(1100)).toEqual([]);
    const out = tracker.flushBefore(1121);
    expect(out.map((e) => e.move)).toEqual(['R']);
    expect(out[0].kind).toBe('face');
    expect(out[0].wire).toEqual(['R']);
  });

  it('tracks the state and leaves the cube facing the same way', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: -1, t: 0 });
    tracker.flushAll();
    expect(tracker.alg()).toBe("R'");
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, "R'"));
    expect(tracker.cubeFacelets()).toBe(applyAlg(SOLVED, "R'"));
    expect(tracker.orientation()).toEqual({ U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' });
  });
});

describe('slice moves', () => {
  it("reads R with L' as M, and turns the core under your hands", () => {
    const tracker = newTracker();
    expect(tracker.onWire({ face: 'R', dir: 1, t: 0 })).toEqual([]);
    const out = tracker.onWire({ face: 'L', dir: -1, t: 10 });
    expect(out.map((e) => e.move)).toEqual(['M']);
    expect(out[0].kind).toBe('slice');
    expect(out[0].wire).toEqual(['R', "L'"]);
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'M'));
    expect(tracker.cubeFacelets()).toBe(applyAlg(SOLVED, "R L'"));
    expect(tracker.coreRotation()).toBe("x'");
    // The white centre now faces you, so the cube calls the layer on top B.
    expect(tracker.orientation()).toEqual({ U: 'F', F: 'D', D: 'B', B: 'U', R: 'R', L: 'L' });
  });

  it('reads the pair in either order', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'L', dir: -1, t: 0 });
    const out = tracker.onWire({ face: 'R', dir: 1, t: 10 });
    expect(out.map((e) => e.move)).toEqual(['M']);
  });

  it('reads every slice and its inverse', () => {
    const cases: Array<[string, Array<[Face, 1 | -1]>]> = [
      ['M', [['R', 1], ['L', -1]]],
      ["M'", [['R', -1], ['L', 1]]],
      ['E', [['U', 1], ['D', -1]]],
      ["E'", [['U', -1], ['D', 1]]],
      ['S', [['B', 1], ['F', -1]]],
      ["S'", [['B', -1], ['F', 1]]],
    ];
    for (const [move, turns] of cases) {
      const tracker = newTracker();
      tracker.onWire({ face: turns[0][0], dir: turns[0][1], t: 0 });
      const out = tracker.onWire({ face: turns[1][0], dir: turns[1][1], t: 10 });
      expect(out.map((e) => e.move)).toEqual([move]);
      expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, move));
    }
  });

  it("tells a real R L' from an M by time alone, never by state", () => {
    const slow = newTracker();
    slow.onWire({ face: 'R', dir: 1, t: 0 });
    slow.onWire({ face: 'L', dir: -1, t: 500 });
    slow.flushAll();
    expect(slow.entries.map((e) => e.move)).toEqual(['R', "L'"]);
    expect(equalUpToRotation(slow.holderFacelets(), applyAlg(SOLVED, 'M'))).toBe(true);
  });

  it('does not pair two turns that go the same way in space', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 0 });
    tracker.onWire({ face: 'L', dir: 1, t: 10 });
    tracker.flushAll();
    expect(tracker.entries.map((e) => e.move)).toEqual(['R', 'L']);
  });

  it('reads a fast M2 as two slices even when the wire groups the turns', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 0 });
    tracker.onWire({ face: 'R', dir: 1, t: 6 });
    tracker.onWire({ face: 'L', dir: -1, t: 12 });
    tracker.onWire({ face: 'L', dir: -1, t: 18 });
    tracker.flushAll();
    expect(tracker.entries.map((e) => e.move)).toEqual(['M', 'M']);
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'M2'));
  });

  it('keeps moves in order when another move lands between the two halves', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'U', dir: 1, t: 0 });
    tracker.onWire({ face: 'R', dir: 1, t: 6 });
    tracker.onWire({ face: 'L', dir: -1, t: 12 });
    tracker.flushAll();
    expect(tracker.entries.map((e) => e.move)).toEqual(['U', 'M']);
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'U M'));
  });
});

describe("later moves are read in the holder's frame", () => {
  it("maps the cube's face labels through the hidden core turn", () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 0 });
    tracker.onWire({ face: 'L', dir: -1, t: 10 }); // M: the white centre now faces you
    tracker.onWire({ face: 'B', dir: 1, t: 500 });
    tracker.flushAll();
    // The cube calls the layer on top B now, so a B report is a U turn in your hands.
    expect(tracker.entries.map((e) => e.move)).toEqual(['M', 'U']);
    expect(tracker.entries[1].wire).toEqual(['B']);
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'M U'));
  });
});

describe('wide moves', () => {
  it('reads a lone turn as a plain face turn until you say it was wide', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'L', dir: 1, t: 0 });
    tracker.flushAll();
    expect(tracker.entries.map((e) => e.move)).toEqual(['L']);

    const marked = tracker.markWide();
    expect(marked?.move).toBe('Rw');
    expect(marked?.kind).toBe('wide');
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'Rw'));
    // The cube cannot tell the two apart, so its own report is the same either way.
    expect(tracker.cubeFacelets()).toBe(applyAlg(SOLVED, 'L'));
    expect(tracker.coreRotation()).toBe('x');

    expect(tracker.unmarkWide()?.move).toBe('L');
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'L'));
    expect(tracker.coreRotation()).toBe('');
  });

  it('names the wide move on the opposite face, in every direction', () => {
    const cases: Array<[Face, 1 | -1, string]> = [
      ['L', 1, 'Rw'],
      ['L', -1, "Rw'"],
      ['R', 1, 'Lw'],
      ['D', 1, 'Uw'],
      ['U', -1, "Dw'"],
      ['B', 1, 'Fw'],
      ['F', -1, "Bw'"],
    ];
    for (const [face, dir, expected] of cases) {
      const tracker = newTracker();
      tracker.onWire({ face, dir, t: 0 });
      tracker.flushAll();
      expect(tracker.markWide()?.move).toBe(expected);
      expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, expected));
    }
  });

  it('marks each half of a wide double when pressed twice', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'L', dir: 1, t: 0 });
    tracker.onWire({ face: 'L', dir: 1, t: 200 });
    tracker.flushAll();
    tracker.markWide();
    tracker.markWide();
    expect(tracker.entries.map((e) => e.move)).toEqual(['Rw', 'Rw']);
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'Rw2'));
  });

  it('re-reads the moves that followed, because the core turned', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'L', dir: 1, t: 0 }); // really an Rw
    tracker.flushAll();
    tracker.markWide();
    tracker.onWire({ face: 'F', dir: 1, t: 500 });
    tracker.flushAll();
    // After Rw the green centre is on top, so the cube's F report is a U turn in your hands.
    expect(tracker.entries.map((e) => e.move)).toEqual(['Rw', 'U']);
    expect(tracker.holderFacelets()).toBe(applyAlg(SOLVED, 'Rw U'));
  });

  it('refuses to mark a slice as wide', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 0 });
    tracker.onWire({ face: 'L', dir: -1, t: 10 });
    expect(tracker.markWide()).toBeNull();
  });
});

describe('reset', () => {
  it('puts the cube back to solved, white up and green front', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 0 });
    tracker.onWire({ face: 'L', dir: -1, t: 10 });
    tracker.flushAll();
    tracker.reset();
    expect(tracker.holderFacelets()).toBe(SOLVED);
    expect(tracker.cubeFacelets()).toBe(SOLVED);
    expect(tracker.entries).toEqual([]);
    expect(tracker.coreRotation()).toBe('');
  });
});

describe("turns recovered in a batch, which all arrive at the same moment", () => {
  // When the browser misses Bluetooth packets the library replays up to seven turns at once, and
  // they all land with the same arrival time. Pairing has to go by the cube's own clock, or two
  // turns made seconds apart get read as one slice.
  it('does not pair two turns the cube timed far apart', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 5000, ct: 1000 });
    tracker.onWire({ face: 'L', dir: -1, t: 5000, ct: 3400 });
    tracker.flushAll();
    expect(tracker.entries.map((e) => e.move)).toEqual(['R', "L'"]);
  });

  it('pairs two turns the cube timed together, however late they arrive', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 5000, ct: 1000 });
    tracker.onWire({ face: 'L', dir: -1, t: 5000, ct: 1012 });
    expect(tracker.entries.map((e) => e.move)).toEqual(['M']);
  });

  it('falls back to arrival time when the cube gives no clock', () => {
    const tracker = newTracker();
    tracker.onWire({ face: 'R', dir: 1, t: 5000 });
    tracker.onWire({ face: 'L', dir: -1, t: 5010, ct: 1012 });
    tracker.flushAll();
    expect(tracker.entries.map((e) => e.move)).toEqual(['M']);
  });
});

describe('a long mixed run against the emulated cube', () => {
  // Deterministic, so any failure is reproducible.
  const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const plain = ['U', "U'", 'U2', 'D', "D'", 'R', "R'", 'R2', 'L', "L'", 'F', "F'", 'B', "B'"];
  const slices = ['M', "M'", 'M2', 'E', "E'", 'S', "S'"];
  const wides = ['Rw', "Rw'", 'Uw', "Uw'", 'Fw', "Fw'", 'Lw', "Dw'", 'Bw'];

  it('follows 120 mixed turns, including slices and wides', () => {
    const random = rng(20260918);
    const cube = new CubeEmulator();
    const tracker = newTracker();
    const done: string[] = [];

    for (let i = 0; i < 120; i++) {
      const roll = random();
      const pool = roll < 0.55 ? plain : roll < 0.85 ? slices : wides;
      const token = pool[Math.floor(random() * pool.length)];
      done.push(token);

      for (const turn of cube.turn(token)) tracker.onWire(turn);
      tracker.flushAll();
      if (wides.includes(token)) tracker.markWide();

      expect(tracker.cubeFacelets(), `cube's own frame after ${done.join(' ')}`).toBe(cube.reported());
      expect(tracker.holderFacelets(), `your frame after ${done.join(' ')}`).toBe(cube.space);
    }

    expect(done.filter((t) => slices.includes(t)).length).toBeGreaterThan(10);
    expect(done.filter((t) => wides.includes(t)).length).toBeGreaterThan(10);
  });

  it('still matches the cube when wide moves are never marked, ignoring which way it faces', () => {
    const random = rng(7);
    const cube = new CubeEmulator();
    const tracker = newTracker();
    const pool = [...plain, ...slices, ...wides];

    for (let i = 0; i < 60; i++) {
      const token = pool[Math.floor(random() * pool.length)];
      for (const turn of cube.turn(token)) tracker.onWire(turn);
      tracker.flushAll();
    }
    expect(tracker.cubeFacelets()).toBe(cube.reported());
    expect(equalUpToRotation(tracker.holderFacelets(), cube.space)).toBe(true);
  });
});
