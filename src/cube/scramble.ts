/**
 * Scrambles: a random cube state, solved by a two-phase solver, and the solution inverted. That is
 * what a random-state scramble is, and it is what the statistics downstream depend on - a scramble
 * made of random turns would tilt which cases come up.
 *
 * The solver runs in a worker, and one scramble is always kept ready so the timer never waits.
 */

export interface Scramble {
  alg: string;
  /** False only if the solver could not start, which the screen then says out loud. */
  randomState: boolean;
}

const MOVES = "U U' U2 D D' D2 R R' R2 L L' L2 F F' F2 B B' B2".split(' ');

/** Last-resort scramble if the solver will not start: close to random, but not random state. */
export function randomTurns(length = 25): string {
  const out: string[] = [];
  let lastFace = '';
  while (out.length < length) {
    const move = MOVES[Math.floor(Math.random() * MOVES.length)];
    if (move[0] === lastFace) continue;
    lastFace = move[0];
    out.push(move);
  }
  return out.join(' ');
}

type Reply = { id: number; scramble?: string; error?: string };

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (reply: Reply) => void>();
let queued: Promise<string> | null = null;
let solverWorks = true;

function ensureWorker(): Worker | null {
  if (worker || !solverWorks) return worker;
  try {
    // A plain worker, served from public/: see scripts/copy-cubejs.mjs for why.
    worker = new Worker(`${import.meta.env.BASE_URL}scramble-worker.js`);
    worker.onmessage = (event: MessageEvent<Reply>) => {
      waiting.get(event.data.id)?.(event.data);
      waiting.delete(event.data.id);
    };
    worker.onerror = () => {
      solverWorks = false;
      for (const resolve of waiting.values()) resolve({ id: 0, error: 'worker failed' });
      waiting.clear();
    };
  } catch {
    solverWorks = false;
  }
  return worker;
}

function askWorker(): Promise<string> {
  const live = ensureWorker();
  if (!live) return Promise.reject(new Error('no solver'));
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('solver timed out'));
    }, 30000);
    waiting.set(id, (reply) => {
      clearTimeout(timeout);
      if (reply.scramble) resolve(reply.scramble);
      else reject(new Error(reply.error ?? 'no scramble'));
    });
    live.postMessage({ id });
  });
}

/** Start the solver and keep one scramble in hand, so the first one is not a wait. */
export function warmScrambler(): void {
  if (!queued && solverWorks) queued = askWorker().catch(() => (solverWorks = false) as never);
}

export async function randomScramble(): Promise<Scramble> {
  if (solverWorks) {
    const pending = queued ?? askWorker();
    queued = null;
    try {
      const alg = await pending;
      warmScrambler(); // get the next one ready while you turn
      return { alg, randomState: true };
    } catch {
      solverWorks = false;
    }
  }
  return { alg: randomTurns(), randomState: false };
}
