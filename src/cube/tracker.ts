/**
 * Turns what the cube puts on the wire into the moves you actually made.
 *
 * The cube has no gyroscope, so it can only report how far each face has turned relative to its
 * own core. Three things follow, and this file is where all three live:
 *
 *  - A slice move arrives as two opposite face turns (M reads as R and L'), and the core turns
 *    under your hands. That hidden turn is tracked, so every later report is read in your frame.
 *  - A wide move arrives as a single turn of the opposite face (Rw reads as L) plus the same
 *    hidden core turn. Nothing on the wire can separate Rw from a plain L, so a lone turn is read
 *    as the plain face turn until you say otherwise with markWide().
 *  - A genuine R L' and an M are identical on the wire. Only the display depends on the guess;
 *    the state itself is only ever compared with equalUpToRotation().
 */

import {
  type Face,
  FACES,
  OPPOSITE,
  SOLVED,
  applyAlg,
  applyMove,
  faceMapOf,
  invertAlg,
  invertMove,
} from './cube';

export type { Face };

/** One face turn as the cube reports it: the face is the cube's own label, not yours. */
export interface WireTurn {
  face: Face;
  /** 1 clockwise, -1 anticlockwise, seen from outside that face. */
  dir: 1 | -1;
  /** Host clock, in milliseconds: when this turn reached the browser. */
  t: number;
  /**
   * The cube's own clock, in milliseconds, when it has one. Turns the library recovers after
   * missed Bluetooth packets all arrive at the same instant, so only this says when they really
   * happened - and that is what decides whether two of them were one slice move.
   */
  ct?: number;
}

export type MoveKind = 'face' | 'slice' | 'wide';

export interface LogEntry {
  /** Position in the log, from 1. */
  n: number;
  t: number;
  /** What the cube reported, in its own labels. */
  wire: string[];
  /** What you did, in your frame. */
  move: string;
  kind: MoveKind;
}

/** One resolved report: a single turn, or a pair of opposite turns read as a slice. */
interface Group {
  turns: WireTurn[];
  /** Set when you tell the site that lone turn was really a wide move. */
  wide: boolean;
}

const AXIS_FACES: Record<'x' | 'y' | 'z', Face[]> = { x: ['R', 'L'], y: ['U', 'D'], z: ['F', 'B'] };

/** The slice on each axis, and the face whose clockwise turn names it unprimed. */
const SLICE_OF_AXIS = {
  x: { letter: 'M', reference: 'R' as Face, rotation: "x'" },
  y: { letter: 'E', reference: 'U' as Face, rotation: "y'" },
  z: { letter: 'S', reference: 'B' as Face, rotation: 'z' },
};

/** The whole-cube rotation a wide move of each face drags the core through. */
const ROTATION_OF_FACE: Record<Face, string> = {
  R: 'x', L: "x'", U: 'y', D: "y'", F: 'z', B: "z'",
};

const axisOf = (face: Face): 'x' | 'y' | 'z' =>
  face === 'R' || face === 'L' ? 'x' : face === 'U' || face === 'D' ? 'y' : 'z';

const suffixOf = (dir: 1 | -1) => (dir === 1 ? '' : "'");

const identityOrientation = (): Record<Face, Face> =>
  Object.fromEntries(FACES.map((f) => [f, f])) as Record<Face, Face>;

export interface TrackerOptions {
  /** How close two opposite face turns must be to count as one slice move. */
  pairWindowMs?: number;
}

export class CubeTracker {
  pairWindowMs: number;

  private groups: Group[] = [];
  private buffer: WireTurn[] = [];
  private log: LogEntry[] = [];
  private orient = identityOrientation();
  private rotations: string[] = [];
  private facelets = SOLVED;
  private origin = SOLVED;

  constructor(options: TrackerOptions = {}) {
    this.pairWindowMs = options.pairWindowMs ?? 120;
  }

  /** The moves read so far, oldest first. */
  get entries(): readonly LogEntry[] {
    return this.log;
  }

  /** Turns reported but not yet resolved, because a slice partner may still be coming. */
  get pending(): readonly WireTurn[] {
    return this.buffer;
  }

  /** Everything you have done, in your frame. */
  alg(): string {
    return this.log.map((e) => e.move).join(' ');
  }

  /** The cube as you are holding it: this is what the picture shows. */
  holderFacelets(): string {
    return this.facelets;
  }

  /** The same cube in its own frame, which is what the cube itself reports. */
  cubeFacelets(): string {
    return applyAlg(this.facelets, invertAlg(this.rotations.join(' ')));
  }

  /** Which of your faces each of the cube's own face labels is pointing at. */
  orientation(): Record<Face, Face> {
    return { ...this.orient };
  }

  /** The hidden turns of the core, in order. */
  coreRotation(): string {
    return this.rotations.join(' ');
  }

  /**
   * Start again from a known cube. Pass the cube's own facelets to adopt the state it is really
   * in; with nothing passed the cube is taken to be solved. Either way you are taken to be
   * holding it white top, green front.
   */
  reset(origin: string = SOLVED): void {
    this.origin = origin;
    this.groups = [];
    this.buffer = [];
    this.rebuild();
  }

  /** Feed one turn from the cube. Returns the moves that became certain because of it. */
  onWire(turn: WireTurn): LogEntry[] {
    const out: LogEntry[] = [];

    // Anything too old to still be half of a slice is a plain face turn.
    while (this.buffer.length && this.tooFarApart(this.buffer[0], turn)) {
      out.push(this.resolve([this.buffer.shift()!]));
    }

    const partner = this.buffer.findIndex(
      (held) => OPPOSITE[held.face] === turn.face && held.dir !== turn.dir,
    );
    if (partner === -1) {
      this.buffer.push(turn);
      return out;
    }

    // Emit anything older first, so the log stays in the order you turned.
    for (let i = 0; i < partner; i++) out.push(this.resolve([this.buffer[i]]));
    const held = this.buffer[partner];
    this.buffer.splice(0, partner + 1);
    out.push(this.resolve([held, turn]));
    return out;
  }

  /** Were these two turns made too far apart to be one slice move? */
  private tooFarApart(held: WireTurn, turn: WireTurn): boolean {
    const gap =
      held.ct !== undefined && turn.ct !== undefined
        ? Math.abs(turn.ct - held.ct)
        : turn.t - held.t;
    return gap > this.pairWindowMs;
  }

  /** Give up on slice partners that are now too late to arrive. */
  flushBefore(now: number): LogEntry[] {
    const out: LogEntry[] = [];
    while (this.buffer.length && now - this.buffer[0].t > this.pairWindowMs) {
      out.push(this.resolve([this.buffer.shift()!]));
    }
    return out;
  }

  flushAll(): LogEntry[] {
    const out = this.buffer.map((turn) => this.resolve([turn]));
    this.buffer = [];
    return out;
  }

  /**
   * Say that the most recent lone turn was really a wide move. Pressed twice it marks both halves
   * of a wide double. Returns null when the last move was a slice, which cannot have been wide.
   */
  markWide(): LogEntry | null {
    return this.setWide(true);
  }

  /** Take back the most recent wide move, reading it as a plain face turn again. */
  unmarkWide(): LogEntry | null {
    return this.setWide(false);
  }

  private setWide(wide: boolean): LogEntry | null {
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const group = this.groups[i];
      if (group.turns.length !== 1) return null; // a slice: not a wide move
      if (group.wide !== wide) {
        group.wide = wide;
        this.rebuild();
        return this.log[i];
      }
    }
    return null;
  }

  private resolve(turns: WireTurn[]): LogEntry {
    const group: Group = { turns, wide: false };
    this.groups.push(group);
    return this.append(group);
  }

  private rebuild(): void {
    this.log = [];
    this.orient = identityOrientation();
    this.rotations = [];
    this.facelets = this.origin;
    for (const group of this.groups) this.append(group);
  }

  /** Read one resolved report in your frame, and move the tracked cube on. */
  private append(group: Group): LogEntry {
    const { move, kind, rotation } = this.read(group);
    if (rotation) {
      const map = faceMapOf(rotation);
      for (const face of FACES) this.orient[face] = map[this.orient[face]];
      this.rotations.push(rotation);
    }
    this.facelets = applyMove(this.facelets, move);

    const entry: LogEntry = {
      n: this.log.length + 1,
      t: group.turns[group.turns.length - 1].t,
      wire: group.turns.map((turn) => turn.face + suffixOf(turn.dir)),
      move,
      kind,
    };
    this.log.push(entry);
    return entry;
  }

  private read(group: Group): { move: string; kind: MoveKind; rotation: string | null } {
    const held = group.turns.map((turn) => ({
      face: this.orient[turn.face], // the cube's label, read as the face you are looking at
      dir: turn.dir,
    }));

    if (held.length === 2) {
      const axis = axisOf(held[0].face);
      const { letter, reference, rotation } = SLICE_OF_AXIS[axis];
      const onReference = held.find((turn) => turn.face === reference)!;
      const primed = onReference.dir === -1;
      return {
        move: letter + (primed ? "'" : ''),
        kind: 'slice',
        rotation: primed ? invertMove(rotation) : rotation,
      };
    }

    const [turn] = held;
    if (!group.wide) {
      return { move: turn.face + suffixOf(turn.dir), kind: 'face', rotation: null };
    }

    // A wide move shows up as a lone turn of the opposite face, dragging the core with it.
    const face = OPPOSITE[turn.face];
    const rotation = ROTATION_OF_FACE[face];
    return {
      move: `${face}w${suffixOf(turn.dir)}`,
      kind: 'wide',
      rotation: turn.dir === 1 ? rotation : invertMove(rotation),
    };
  }
}

/** Which faces of a solved cube each axis holds, for the demo panel and for tests. */
export { AXIS_FACES };
