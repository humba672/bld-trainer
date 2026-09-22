/**
 * Everything the site remembers, in this browser's IndexedDB. Nothing is sent anywhere.
 *
 * Browser data is lost if you clear site data or change browser, so Settings can write the whole
 * lot to a file and read it back.
 */

import { del, get, keys, set } from 'idb-keyval';

export interface StickerStat {
  /** Times asked, times right, and the best and total time in milliseconds. */
  asked: number;
  right: number;
  totalMs: number;
  bestMs: number;
  lastSeen: number;
}

export interface TracingAttempt {
  at: number;
  scramble: string;
  typed: string;
  correct: boolean;
  seconds: number;
}

export interface Progress {
  /** 0 Foundations, 1 Old Pochmann, 2 Orozco, 3 three-style. */
  stage: number;
  /** Stages unlocked by hand, overriding the exit test. */
  unlocked: number[];
  /** Whether the memo advice has been shown once already. */
  memoAdviceSeen: boolean;
}

const DEFAULT_PROGRESS: Progress = { stage: 0, unlocked: [], memoAdviceSeen: false };

/** Keys are namespaced so an export can round-trip the whole store. */
const KEY = {
  mac: 'cube-mac',
  autoConnect: 'auto-connect',
  letterStats: 'letter-stats',
  tracing: 'tracing-attempts',
  pairImages: 'pair-images',
  progress: 'progress',
} as const;

export const loadMac = () => get<string>(KEY.mac);
export const saveMac = (mac: string) => set(KEY.mac, mac);
export const forgetMac = () => del(KEY.mac);

export const loadAutoConnect = async () => (await get<boolean>(KEY.autoConnect)) ?? true;
export const saveAutoConnect = (on: boolean) => set(KEY.autoConnect, on);

export type LetterStats = Record<string, StickerStat>;

export const loadLetterStats = async (): Promise<LetterStats> =>
  (await get<LetterStats>(KEY.letterStats)) ?? {};
export const saveLetterStats = (stats: LetterStats) => set(KEY.letterStats, stats);

export const loadTracing = async (): Promise<TracingAttempt[]> =>
  (await get<TracingAttempt[]>(KEY.tracing)) ?? [];
export async function addTracingAttempt(attempt: TracingAttempt): Promise<TracingAttempt[]> {
  const all = [...(await loadTracing()), attempt].slice(-200);
  await set(KEY.tracing, all);
  return all;
}

/** Your own image for a letter pair, which always shows before the bundled ideas. */
export type PairImages = Record<string, string>;

export const loadPairImages = async (): Promise<PairImages> =>
  (await get<PairImages>(KEY.pairImages)) ?? {};
export async function savePairImage(pair: string, image: string): Promise<PairImages> {
  const all = await loadPairImages();
  if (image.trim()) all[pair] = image.trim();
  else delete all[pair];
  await set(KEY.pairImages, all);
  return all;
}

export const loadProgress = async (): Promise<Progress> => ({
  ...DEFAULT_PROGRESS,
  ...((await get<Progress>(KEY.progress)) ?? {}),
});
export const saveProgress = (progress: Progress) => set(KEY.progress, progress);

// ---------------------------------------------------------------- export and import

export interface Backup {
  kind: 'bld-trainer-backup';
  version: 1;
  savedAt: string;
  data: Record<string, unknown>;
}

export async function exportAll(): Promise<Backup> {
  const data: Record<string, unknown> = {};
  for (const key of await keys()) {
    if (typeof key === 'string') data[key] = await get(key);
  }
  return { kind: 'bld-trainer-backup', version: 1, savedAt: new Date().toISOString(), data };
}

/** Read a backup back in. Anything not in the file is left alone. */
export async function importAll(backup: unknown): Promise<number> {
  const parsed = backup as Backup;
  if (!parsed || parsed.kind !== 'bld-trainer-backup') {
    throw new Error('That file is not a BLD Trainer backup.');
  }
  let restored = 0;
  for (const [key, value] of Object.entries(parsed.data ?? {})) {
    await set(key, value);
    restored += 1;
  }
  return restored;
}

export async function eraseAll(): Promise<void> {
  for (const key of await keys()) await del(key);
}
