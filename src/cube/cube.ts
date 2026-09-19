/**
 * A 3x3 cube as 54 stickers, in the Kociemba facelet order (U, R, F, D, L, B).
 *
 * Every move is generated from 3D geometry rather than from a hand-written permutation table:
 * each sticker knows where it sits and which way it faces, and a move rotates the stickers whose
 * position falls in the turning layers. Face turns, slices, wide moves and whole-cube rotations
 * all come out of the same three lines of maths, which is what makes the slice and wide
 * identities (M = R L' x', Rw = L x) checkable rather than assumed.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

type Vec = [number, number, number]; // x right, y up, z towards you

/** Sticker positions and outward normals, in facelet-index order. */
const STICKERS: Array<{ pos: Vec; normal: Vec }> = (() => {
  // For each face: its outward normal, the direction of increasing row, and of increasing column,
  // matching the standard unfolded net that the Kociemba string describes.
  const layout: Array<{ face: Face; normal: Vec; row: Vec; col: Vec }> = [
    { face: 'U', normal: [0, 1, 0], row: [0, 0, 1], col: [1, 0, 0] },
    { face: 'R', normal: [1, 0, 0], row: [0, -1, 0], col: [0, 0, -1] },
    { face: 'F', normal: [0, 0, 1], row: [0, -1, 0], col: [1, 0, 0] },
    { face: 'D', normal: [0, -1, 0], row: [0, 0, -1], col: [1, 0, 0] },
    { face: 'L', normal: [-1, 0, 0], row: [0, -1, 0], col: [0, 0, 1] },
    { face: 'B', normal: [0, 0, -1], row: [0, -1, 0], col: [-1, 0, 0] },
  ];
  const out: Array<{ pos: Vec; normal: Vec }> = [];
  for (const { normal, row, col } of layout) {
    // Top-left sticker of the face: on the face, one step back along both row and column.
    const origin: Vec = [
      normal[0] - row[0] - col[0],
      normal[1] - row[1] - col[1],
      normal[2] - row[2] - col[2],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out.push({
          pos: [
            origin[0] + r * row[0] + c * col[0],
            origin[1] + r * row[1] + c * col[1],
            origin[2] + r * row[2] + c * col[2],
          ],
          normal,
        });
      }
    }
  }
  return out;
})();

export const SOLVED: string = FACES.map((f) => f.repeat(9)).join('');

/** A quarter turn about the +x, +y or +z axis, in the R, U and F directions. */
function rotate(v: Vec, axis: 0 | 1 | 2): Vec {
  const [x, y, z] = v;
  if (axis === 0) return [x, z, -y]; // R: front goes up
  if (axis === 1) return [-z, y, x]; // U: front goes left
  return [y, -x, z]; // F: up goes right
}

const key = (pos: Vec, normal: Vec) => pos.join(',') + '|' + normal.join(',');

const INDEX_BY_KEY = new Map<string, number>(
  STICKERS.map((s, i) => [key(s.pos, s.normal), i] as const),
);

export interface ParsedMove {
  token: string;
  axis: 0 | 1 | 2;
  /** Which layers turn, as coordinates along the axis. */
  layers: number[];
  /** Signed quarter turns about the positive axis. */
  quarters: number;
}

const AXIS_OF: Record<string, 0 | 1 | 2> = {
  R: 0, L: 0, M: 0, x: 0,
  U: 1, D: 1, E: 1, y: 1,
  F: 2, B: 2, S: 2, z: 2,
};
const SIGN_OF: Record<string, 1 | -1> = { R: 1, L: -1, U: 1, D: -1, F: 1, B: -1 };

export function parseMove(token: string): ParsedMove {
  const parsed = /^([URFDLBMESxyz])(w?)('|2)?$/.exec(token);
  if (!parsed) throw new Error(`Not a move: ${token}`);
  const [, letter, wide, suffix] = parsed;
  if (wide && !SIGN_OF[letter]) throw new Error(`Not a move: ${token}`);
  const amount = suffix === "'" ? -1 : suffix === '2' ? 2 : 1;
  const axis = AXIS_OF[letter];

  if ('xyz'.includes(letter)) {
    return { token, axis, layers: [1, 0, -1], quarters: amount };
  }
  if ('MES'.includes(letter)) {
    // M follows L, E follows D, S follows F.
    return { token, axis, layers: [0], quarters: amount * (letter === 'S' ? 1 : -1) };
  }
  const sign = SIGN_OF[letter];
  return {
    token,
    axis,
    layers: wide ? [sign, 0] : [sign],
    quarters: amount * sign,
  };
}

export function parseAlg(alg: string): ParsedMove[] {
  return alg.trim().split(/\s+/).filter(Boolean).map(parseMove);
}

/** Where each sticker index ends up after a move, as a permutation of facelet indices. */
const permutationCache = new Map<string, number[]>();

function permutationFor(move: ParsedMove): number[] {
  const cacheKey = `${move.axis}|${move.layers.join()}|${move.quarters}`;
  const cached = permutationCache.get(cacheKey);
  if (cached) return cached;

  const turns = (((move.quarters % 4) + 4) % 4);
  const perm = STICKERS.map((_, i) => i);
  for (let i = 0; i < STICKERS.length; i++) {
    const sticker = STICKERS[i];
    if (!move.layers.includes(sticker.pos[move.axis])) continue;
    let pos = sticker.pos;
    let normal = sticker.normal;
    for (let t = 0; t < turns; t++) {
      pos = rotate(pos, move.axis);
      normal = rotate(normal, move.axis);
    }
    const to = INDEX_BY_KEY.get(key(pos, normal));
    if (to === undefined) throw new Error(`Lost a sticker turning ${move.token}`);
    perm[to] = i; // the sticker at `to` afterwards is the one that was at `i`
  }
  permutationCache.set(cacheKey, perm);
  return perm;
}

export function applyMove(facelets: string, move: string | ParsedMove): string {
  const perm = permutationFor(typeof move === 'string' ? parseMove(move) : move);
  let out = '';
  for (let i = 0; i < perm.length; i++) out += facelets[perm[i]];
  return out;
}

export function applyAlg(facelets: string, alg: string): string {
  let state = facelets;
  for (const move of parseAlg(alg)) state = applyMove(state, move);
  return state;
}

export function invertMove(token: string): string {
  if (token.endsWith('2')) return token;
  return token.endsWith("'") ? token.slice(0, -1) : `${token}'`;
}

export function invertAlg(alg: string): string {
  return alg.trim().split(/\s+/).filter(Boolean).map(invertMove).reverse().join(' ');
}

/** The 24 ways a cube can be held, as algs of whole-cube rotations. */
export const ORIENTATIONS: string[] = (() => {
  const seen = new Map<string, string>();
  for (const front of ['', 'y', 'y2', "y'", 'x', "x'"]) {
    for (const roll of ['', 'z', 'z2', "z'"]) {
      const alg = `${front} ${roll}`.trim();
      const fingerprint = applyAlg(SOLVED, alg);
      if (!seen.has(fingerprint)) seen.set(fingerprint, alg);
    }
  }
  return [...seen.values()];
})();

/**
 * The same cube, however it is being held. All of the site's correctness checks use this, because
 * a slice move and the pair of face turns that look identical on the wire differ only by a
 * whole-cube rotation.
 */
export function equalUpToRotation(a: string, b: string): boolean {
  return ORIENTATIONS.some((rotation) => applyAlg(a, rotation) === b);
}

export function canonicalUpToRotation(facelets: string): string {
  let best: string | null = null;
  for (const rotation of ORIENTATIONS) {
    const candidate = applyAlg(facelets, rotation);
    if (best === null || candidate < best) best = candidate;
  }
  return best!;
}

/** Where each face ends up after a whole-cube rotation: the face at `from` moves to `to`. */
export function faceMapOf(rotationAlg: string): Record<Face, Face> {
  const centre: Record<Face, number> = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 };
  const rotated = applyAlg(SOLVED, rotationAlg);
  const map = {} as Record<Face, Face>;
  for (const face of FACES) {
    // After the rotation, the sticker sitting at `face` came from centre `rotated[centre[face]]`.
    map[rotated[centre[face]] as Face] = face;
  }
  return map;
}

export const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
