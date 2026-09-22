/**
 * Old Pochmann: memo for the UR edge buffer and the UBL corner buffer, and the turns that execute
 * it.
 *
 * Nothing here is copied from an alg sheet. Four algorithms are given, and everything else - which
 * place each one shoots to, which setup moves are allowed, and the setup for each target - is
 * worked out from what those algorithms actually do to a cube. That way a wrong assumption fails a
 * test instead of quietly producing memo that does not solve.
 */

import { applyAlg, invertAlg, parseAlg, SOLVED } from '../cube/cube';
import {
  CORNER_PIECES,
  CORNER_STICKER,
  EDGE_PIECES,
  EDGE_STICKER,
  type Letter,
  cornerLetterIn,
  cornerPieceOf,
  edgeLetterIn,
  edgePieceOf,
} from './speffz';

export const EDGE_BUFFER: Letter = 'B'; // UR
export const CORNER_BUFFER: Letter = 'A'; // UBL

/** Swaps the UR and UL edges, and the UFR and UBR corners with it. */
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";
/** Swaps the UR and UF edges, leaving the same corners swapped as the T perm. */
const JB_PERM = "R U R' F' R U R' U' R' F R2 U' R' U'";
/** Swaps the UBL and DFR corners, and the UL and UB edges with it. */
const CORNER_PERM = "R U' R' U' R U R' F' R U R' U' R' F R";
/** Undoes both of those side effects at once, which is what parity is. */
export const PARITY_ALG = "R U' R' U' R U R D R' U' R D' R' U2 R' U'";

type Kind = 'edge' | 'corner';

const STICKER = { edge: EDGE_STICKER, corner: CORNER_STICKER };
const PIECES = { edge: EDGE_PIECES, corner: CORNER_PIECES };
const pieceOf = { edge: edgePieceOf, corner: cornerPieceOf };
const letterIn = { edge: edgeLetterIn, corner: cornerLetterIn };

/** Where each sticker ends up after an alg: position in, position out. */
function stickerMap(alg: string, kind: Kind): Record<Letter, Letter> {
  const after = applyAlg(SOLVED, alg);
  const map = {} as Record<Letter, Letter>;
  for (const letter of Object.keys(STICKER[kind])) {
    // Whatever sticker is sitting in this place now started out wherever the solved cube had it.
    const arrived = letterIn[kind](after, letter);
    map[arrived] = letter;
  }
  return map;
}

export interface SwapAlg {
  alg: string;
  /** The place a shot sends the buffer's sticker to, before the setup is undone. */
  helper: Letter;
  /** Places the setup must leave alone: the buffer, and whatever the alg disturbs on the way. */
  fixed: Set<Letter>;
  /** Places on the other kind of piece that the alg disturbs, which setups must also leave alone. */
  fixedOther: Set<Letter>;
  kind: Kind;
}

function describeSwap(alg: string, kind: Kind, buffer: Letter): SwapAlg {
  const map = stickerMap(alg, kind);
  const helper = map[buffer];
  if (!helper || helper === buffer) throw new Error(`${alg} does not move the buffer`);

  const helperPiece = new Set(pieceOf[kind](helper));
  const fixed = new Set<Letter>();
  for (const [from, to] of Object.entries(map)) {
    if (from !== to && !helperPiece.has(from)) fixed.add(from);
  }

  const other: Kind = kind === 'edge' ? 'corner' : 'edge';
  const otherMap = stickerMap(alg, other);
  const fixedOther = new Set<Letter>();
  for (const [from, to] of Object.entries(otherMap)) if (from !== to) fixedOther.add(from);

  return { alg, helper, fixed, fixedOther, kind };
}

export const EDGE_SWAPS: SwapAlg[] = [
  describeSwap(T_PERM, 'edge', EDGE_BUFFER),
  describeSwap(JB_PERM, 'edge', EDGE_BUFFER),
];
export const CORNER_SWAPS: SwapAlg[] = [describeSwap(CORNER_PERM, 'corner', CORNER_BUFFER)];

// ---------------------------------------------------------------- setups

const SETUP_MOVES = ['U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S', 'Dw', 'Lw', 'Rw', 'Uw', 'Fw', 'Bw']
  .flatMap((face) => [face, `${face}'`, `${face}2`])
  .filter((move) => {
    try {
      parseAlg(move);
      return true;
    } catch {
      return false;
    }
  });

/** Does this move leave every one of these places exactly where it is? */
function leavesAlone(move: string, kind: Kind, places: Set<Letter>): boolean {
  const map = stickerMap(move, kind);
  for (const place of places) if (map[place] !== place) return false;
  return true;
}

/**
 * Setup moves allowed for a swap: those that disturb neither the buffer nor the side effects the
 * algorithm leaves behind. Keeping those constant is what makes the side effects cancel out, and
 * it is what parity is left over from.
 */
function allowedSetupMoves(swap: SwapAlg): string[] {
  const other: Kind = swap.kind === 'edge' ? 'corner' : 'edge';
  return SETUP_MOVES.filter(
    (move) => leavesAlone(move, swap.kind, swap.fixed) && leavesAlone(move, other, swap.fixedOther),
  );
}

const setupCache = new Map<string, string | null>();

/** The shortest setup that brings `target` to the place this algorithm shoots to. */
export function findSetup(swap: SwapAlg, target: Letter, maxMoves = 3): string | null {
  const key = `${swap.alg}|${target}|${maxMoves}`;
  const cached = setupCache.get(key);
  if (cached !== undefined) return cached;

  const answer = searchSetup(swap, target, maxMoves);
  setupCache.set(key, answer);
  return answer;
}

function searchSetup(swap: SwapAlg, target: Letter, maxMoves: number): string | null {
  if (target === swap.helper) return '';
  const moves = allowedSetupMoves(swap);

  let frontier: Array<{ alg: string; map: Record<Letter, Letter> }> = [
    { alg: '', map: Object.fromEntries(Object.keys(STICKER[swap.kind]).map((l) => [l, l])) },
  ];
  for (let depth = 1; depth <= maxMoves; depth++) {
    const next: typeof frontier = [];
    for (const state of frontier) {
      for (const move of moves) {
        const alg = state.alg ? `${state.alg} ${move}` : move;
        const map = stickerMap(alg, swap.kind);
        if (map[target] === swap.helper) return alg;
        next.push({ alg, map });
      }
    }
    frontier = next;
  }
  return null;
}

export interface Shot {
  target: Letter;
  setup: string;
  alg: string;
  /** The whole thing: setup, algorithm, setup undone. */
  moves: string;
}

/** How to shoot to one target: the first algorithm that has a short enough setup wins. */
export function shotFor(kind: Kind, target: Letter): Shot {
  const swaps = kind === 'edge' ? EDGE_SWAPS : CORNER_SWAPS;
  for (const maxMoves of [0, 1, 2, 3, 4]) {
    for (const swap of swaps) {
      const setup = findSetup(swap, target, maxMoves);
      if (setup === null) continue;
      return {
        target,
        setup,
        alg: swap.alg,
        moves: [setup, swap.alg, invertAlg(setup)].filter(Boolean).join(' '),
      };
    }
  }
  throw new Error(`No way to shoot to ${kind} ${target}`);
}

// ---------------------------------------------------------------- memo

/** What sticker is sitting in each place. */
export type Arrangement = Record<Letter, Letter>;

export function arrangementOf(facelets: string, kind: Kind): Arrangement {
  const map = {} as Arrangement;
  for (const letter of Object.keys(STICKER[kind])) map[letter] = letterIn[kind](facelets, letter);
  return map;
}

/** Swap the buffer piece with the piece holding `target`, the way the algorithm does. */
export function shoot(at: Arrangement, buffer: Letter, target: Letter, kind: Kind): void {
  const bufferPlaces = pieceOf[kind](buffer);
  const targetPlaces = pieceOf[kind](target);
  const before = { ...at };
  bufferPlaces.forEach((place, i) => (at[place] = before[targetPlaces[i]]));
  targetPlaces.forEach((place, i) => (at[place] = before[bufferPlaces[i]]));
}

export interface Memo {
  edges: Letter[];
  corners: Letter[];
  /** An odd number of targets on each, which the parity algorithm puts right. */
  parity: boolean;
  /** Pieces sitting in their own place but turned the wrong way. */
  flippedEdges: Letter[];
  twistedCorners: Letter[];
}

function targetsFor(at: Arrangement, buffer: Letter, kind: Kind): Letter[] {
  const targets: Letter[] = [];
  const bufferPiece = pieceOf[kind](buffer);
  const solved = (piece: Letter[]) => piece.every((place) => at[place] === place);

  for (let guard = 0; guard < 200; guard++) {
    let target = at[buffer];
    if (bufferPiece.includes(target)) {
      // The buffer is home, so there is nothing to shoot: break into a cycle somewhere else.
      const unsolved = PIECES[kind].find(
        (piece) => !piece.includes(buffer) && !solved(piece),
      );
      if (!unsolved) return targets;
      target = unsolved[0];
    }
    targets.push(target);
    shoot(at, buffer, target, kind);
  }
  throw new Error('Memo did not finish');
}

function turnedInPlace(at: Arrangement, kind: Kind): Letter[] {
  return PIECES[kind]
    .filter((piece) => piece.some((place) => at[place] !== place) && piece.includes(at[piece[0]]))
    .map((piece) => piece[0]);
}

/** The memo for a scramble: which targets to shoot, in order. */
export function memoFor(facelets: string): Memo {
  const edgesAt = arrangementOf(facelets, 'edge');
  const cornersAt = arrangementOf(facelets, 'corner');
  const flippedEdges = turnedInPlace(edgesAt, 'edge');
  const twistedCorners = turnedInPlace(cornersAt, 'corner');

  const edges = targetsFor({ ...edgesAt }, EDGE_BUFFER, 'edge');
  const corners = targetsFor({ ...cornersAt }, CORNER_BUFFER, 'corner');

  return {
    edges,
    corners,
    parity: edges.length % 2 === 1,
    flippedEdges,
    twistedCorners,
  };
}

/** Letter pairs, the way the memo is actually remembered. */
export function pairsOf(targets: Letter[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < targets.length; i += 2) pairs.push(targets.slice(i, i + 2).join(''));
  return pairs;
}

// ---------------------------------------------------------------- execution

/**
 * Every turn of the solve, in the order they are made: edges, then the parity algorithm when there
 * is one, then corners. Parity goes in the middle because the edge algorithm leaves two corners
 * swapped, and they have to be put back before the corner memo is executed.
 */
export function executionFor(memo: Memo): string {
  const parts: string[] = [];
  for (const target of memo.edges) parts.push(shotFor('edge', target).moves);
  if (memo.parity) parts.push(PARITY_ALG);
  for (const target of memo.corners) parts.push(shotFor('corner', target).moves);
  return parts.join(' ');
}

/** Does this memo actually solve that scramble? */
export function memoSolves(facelets: string, memo: Memo = memoFor(facelets)): boolean {
  return applyAlg(facelets, executionFor(memo)) === SOLVED;
}
