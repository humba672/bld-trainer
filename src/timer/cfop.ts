/**
 * Reading a CFOP solve off the turns you made.
 *
 * Everything here is in the cube's own frame, which is the only frame the cube reports: white on
 * U, centres never moving. A white-cross solver holds white down, so in here the cross lives on U
 * and the free layer - the one their U turns act on - is D. That swap is the only oddity; in
 * exchange, nothing depends on how the cube was held, and slots are named by colour rather than by
 * whatever direction you happened to be facing.
 */

import { SOLVED, applyAlg, applyMove } from '../cube/cube';

export type SlotName = 'FR' | 'FL' | 'BL' | 'BR';
export const SLOT_NAMES: SlotName[] = ['FR', 'FL', 'BL', 'BR'];

/** A turn as it was made, with the host clock reading when it landed. */
export interface Turn {
  move: string;
  t: number;
}

/** Sticker indices, in the Kociemba order used everywhere: U, R, F, D, L, B. */
const CROSS_EDGES = [
  [1, 46], // UB
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
];

/** Each slot's corner and edge. Corner stickers are listed clockwise from the white one. */
const SLOTS: Record<SlotName, { corner: number[]; edge: number[] }> = {
  FR: { corner: [8, 9, 20], edge: [23, 12] }, // URF corner, FR edge
  FL: { corner: [6, 18, 38], edge: [21, 41] }, // UFL corner, FL edge
  BL: { corner: [0, 36, 47], edge: [39, 50] }, // ULB corner, BL edge
  BR: { corner: [2, 45, 11], edge: [48, 14] }, // UBR corner, BR edge
};

/** The last layer, in this frame, is the D face: the eight stickers around its centre. */
const LAST_LAYER_FACE = [27, 28, 29, 30, 32, 33, 34, 35];

const isHome = (state: string, indices: number[]): boolean =>
  indices.every((index) => state[index] === SOLVED[index]);

export const crossSolved = (state: string): boolean =>
  CROSS_EDGES.every((edge) => isHome(state, edge));

export const slotSolved = (state: string, slot: SlotName): boolean =>
  isHome(state, SLOTS[slot].corner) && isHome(state, SLOTS[slot].edge);

export const lastLayerOriented = (state: string): boolean =>
  LAST_LAYER_FACE.every((index) => state[index] === 'D');

export const isSolved = (state: string): boolean => state === SOLVED;

/** Cross and all four slots. What the last layer is doing has nothing to do with it. */
export const f2lComplete = (state: string): boolean =>
  crossSolved(state) && SLOT_NAMES.every((slot) => slotSolved(state, slot));

/** Which slot still needs filling, if exactly one does. */
export function openSlot(state: string): SlotName | null {
  const open = SLOT_NAMES.filter((slot) => !slotSolved(state, slot));
  return open.length === 1 ? open[0] : null;
}

// ---------------------------------------------------------------- finding a pair

/** All eight corner places, each listed clockwise from the sticker that is white when solved. */
const CORNER_PLACES: number[][] = [
  [8, 9, 20], // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];

/** All twelve edge places. */
const EDGE_PLACES: number[][] = [
  [5, 10], [7, 19], [3, 37], [1, 46], // U layer: UR UF UL UB
  [23, 12], [21, 41], [39, 50], [48, 14], // E slice: FR FL BL BR
  [32, 16], [28, 25], [30, 43], [34, 52], // D layer: DR DF DL DB
];

const colours = (state: string, place: number[]): string => place.map((i) => state[i]).join('');

/** Where a piece has got to, and which way round it is. */
interface Placement {
  place: number;
  twist: number;
}

function findPiece(state: string, homePlace: number[], places: number[][]): Placement | null {
  const want = colours(SOLVED, homePlace);
  for (let place = 0; place < places.length; place++) {
    const here = colours(state, places[place]);
    for (let twist = 0; twist < here.length; twist++) {
      const rotated = here.slice(twist) + here.slice(0, twist);
      if (rotated === want) return { place, twist };
    }
  }
  return null;
}

/** Rotations that bring each slot round to the front-right, so one case list covers all four. */
const TO_FRONT_RIGHT: Record<SlotName, string> = { FR: '', FL: "y'", BL: 'y2', BR: 'y' };

export interface F2LCase {
  key: string;
  /** Both pieces already in the slot, the right way round. */
  solved: boolean;
}

/**
 * Which of the F2L cases is in front of you for a given slot.
 *
 * The slot is rotated round to the front right and the free layer is turned to whichever of its
 * four positions reads smallest, so the same case always comes out with the same name however the
 * cube happens to be sitting.
 */
export function f2lCaseOf(state: string, slot: SlotName): F2LCase {
  const facing = TO_FRONT_RIGHT[slot] ? applyAlg(state, TO_FRONT_RIGHT[slot]) : state;

  let best: string | null = null;
  let turned = facing;
  for (let auf = 0; auf < 4; auf++) {
    const corner = findPiece(turned, SLOTS.FR.corner, CORNER_PLACES);
    const edge = findPiece(turned, SLOTS.FR.edge, EDGE_PLACES);
    if (!corner || !edge) return { key: 'unknown', solved: false };
    const key = `c${corner.place}.${corner.twist}e${edge.place}.${edge.twist}`;
    if (best === null || key < best) best = key;
    turned = applyMove(turned, 'D');
  }
  return { key: best!, solved: best === 'c0.0e4.0' };
}

/**
 * The moves a case can be built from: turns of the free layer, and the three-move pairs that take
 * the front-right slot apart and put it back. Between them they reach every F2L case and leave the
 * cross and the other three slots exactly as they were.
 */
export const CASE_MOVES: string[] = [
  'D',
  "D'",
  'D2',
  // R' takes the front-right pair down into the free layer; R puts back whatever is there now.
  "R' D R",
  "R' D' R",
  "R' D2 R",
  // The same job from the front face instead.
  "F D F'",
  "F D' F'",
  "F D2 F'",
];

export interface F2LCaseEntry {
  key: string;
  /** Moves that build this case from a solved cube, leaving everything else alone. */
  setup: string;
  solved: boolean;
}

let cachedCases: Map<string, F2LCaseEntry> | null = null;

/** Every F2L case, found by taking a solved pair apart every way there is. */
export function enumerateF2LCases(): Map<string, F2LCaseEntry> {
  if (cachedCases) return cachedCases;

  const found = new Map<string, F2LCaseEntry>();
  const seenStates = new Set<string>();
  let frontier: Array<{ state: string; setup: string }> = [{ state: SOLVED, setup: '' }];
  seenStates.add(SOLVED);

  const record = (state: string, setup: string) => {
    const { key, solved } = f2lCaseOf(state, 'FR');
    if (!found.has(key)) found.set(key, { key, setup, solved });
  };
  record(SOLVED, '');

  // Six rounds is more than enough: the deepest case takes three pair moves to build.
  for (let depth = 0; depth < 6 && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const { state, setup } of frontier) {
      for (const move of CASE_MOVES) {
        const grown = applyAlg(state, move);
        if (seenStates.has(grown)) continue;
        seenStates.add(grown);
        const step = setup ? `${setup} ${move}` : move;
        record(grown, step);
        next.push({ state: grown, setup: step });
      }
    }
    frontier = next;
  }

  cachedCases = found;
  return found;
}

// ---------------------------------------------------------------- reading a solve

export interface PairRead {
  slot: SlotName;
  caseKey: string;
  /** From the last pair landing to your first move on this one. */
  recognitionMs: number;
  /** From that first move to the pair going in. */
  executionMs: number;
  moves: string[];
}

export interface SolveAnalysis {
  solved: boolean;
  timeMs: number;
  moveCount: number;
  tps: number;
  stages: { crossMs: number; f2lMs: number; ollMs: number; pllMs: number };
  pairs: PairRead[];
  /** Anything that makes the split above a guess rather than a reading. */
  unclear: string[];
}

/**
 * Work out what happened during a solve.
 *
 * A pair counts as finished at the last moment its slot fills and stays filled. That reads a clean
 * solve exactly; it cannot read a solver who works on two pairs at once, so that is called out in
 * `unclear` rather than quietly turned into numbers.
 */
export function analyseSolve(scrambled: string, turns: Turn[]): SolveAnalysis {
  const unclear: string[] = [];
  const states: string[] = [scrambled];
  for (const turn of turns) states.push(applyAlg(states[states.length - 1], turn.move));

  const startedAt = turns.length ? turns[0].t : 0;
  const endedAt = turns.length ? turns[turns.length - 1].t : 0;
  const at = (index: number) => (index <= 0 ? 0 : turns[index - 1].t - startedAt);

  const solved = isSolved(states[states.length - 1]);
  if (!solved) unclear.push('the cube did not end solved');

  // The cross: the first moment it is complete.
  let crossIndex = states.findIndex(crossSolved);
  if (crossIndex === -1) {
    unclear.push('the cross was never complete');
    crossIndex = 0;
  }

  // Only read the cube at rest. Inserting a pair swings neighbouring slots out and back on the
  // way - R' D R takes the back-right pair with it - so a reading taken mid-insertion would credit
  // one pair's work to another. Whenever the cross is whole, nothing is mid-flight.
  const checkpoints: number[] = [];
  for (let i = 0; i < states.length; i++) if (crossSolved(states[i])) checkpoints.push(i);

  // F2L is over the first time all four slots are in at once. Everything after that is the last
  // layer, whose algorithms break and remake the cross and swing slots out and back constantly -
  // none of which is pair work, and all of which would otherwise be read as some.
  const f2lDone =
    checkpoints.find((i) => SLOT_NAMES.every((slot) => slotSolved(states[i], slot))) ?? -1;
  if (f2lDone === -1) unclear.push('the first two layers were never all in at once');
  const f2lIndex = f2lDone === -1 ? states.length - 1 : f2lDone;

  const slotFilled = new Map<SlotName, number>();
  for (const slot of SLOT_NAMES) {
    let filledAt = -1;
    let wasIn = false;
    let takenApart = false;
    for (const i of checkpoints) {
      if (i > f2lIndex) break;
      const isIn = slotSolved(states[i], slot);
      if (isIn && !wasIn) filledAt = i;
      if (!isIn && wasIn) takenApart = true;
      wasIn = isIn;
    }
    if (filledAt < 0) {
      unclear.push(`${slot} never went in`);
      continue;
    }
    if (takenApart) unclear.push(`${slot} was filled and taken apart again`);
    slotFilled.set(slot, filledAt);
  }

  // Every pair insertion swings a cross edge out and back, and last layer algorithms do it over
  // and over, so a broken cross is only worth remarking on while the first two layers are being
  // built, and only when it stays broken longer than an insertion could account for.
  let brokenRun = 0;
  for (let i = crossIndex; i <= f2lIndex; i++) {
    brokenRun = crossSolved(states[i]) ? 0 : brokenRun + 1;
    if (brokenRun > 8) {
      unclear.push('the cross came apart and had to be rebuilt');
      break;
    }
  }

  const order = [...slotFilled.entries()].sort((a, b) => a[1] - b[1]);
  const simultaneous = order.filter(([, index], i) => i > 0 && order[i - 1][1] === index);
  if (simultaneous.length) unclear.push('two pairs landed on the same turn');

  const pairs: PairRead[] = [];
  let previousEnd = crossIndex;
  for (const [slot, filledAt] of order) {
    if (filledAt <= previousEnd) {
      previousEnd = Math.max(previousEnd, filledAt);
      continue;
    }
    const firstMove = previousEnd; // index into `turns` of this pair's first move
    pairs.push({
      slot,
      caseKey: f2lCaseOf(states[previousEnd], slot).key,
      recognitionMs: turns[firstMove] ? turns[firstMove].t - (previousEnd === 0 ? turns[0].t : turns[previousEnd - 1].t) : 0,
      executionMs: at(filledAt) - at(firstMove + 1),
      moves: turns.slice(firstMove, filledAt).map((turn) => turn.move),
    });
    previousEnd = filledAt;
  }

  // The last layer is oriented at the first point of rest after F2L where every one of its
  // stickers faces the same way. Points of rest only, for the same reason as above.
  const ollIndex =
    checkpoints.find((i) => i >= f2lIndex && lastLayerOriented(states[i])) ?? states.length - 1;

  return {
    solved,
    timeMs: endedAt - startedAt,
    moveCount: turns.length,
    tps: endedAt > startedAt ? (turns.length * 1000) / (endedAt - startedAt) : 0,
    stages: {
      crossMs: at(crossIndex),
      f2lMs: at(f2lIndex) - at(crossIndex),
      ollMs: at(ollIndex) - at(f2lIndex),
      pllMs: at(states.length - 1) - at(ollIndex),
    },
    pairs,
    unclear,
  };
}
