import { describe, expect, it } from 'vitest';
import letterPairs from './letter-pairs.json';

/**
 * The bundled letter-pair ideas are data, not code, so they are guarded by tests rather than by
 * types: a hand edit that breaks coverage or slips in something unusable fails the build.
 */

const SPEFFZ = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');

/** Every pair you can be asked to memorise: Speffz A to X, never the same letter twice. */
const ALL_PAIRS = SPEFFZ.flatMap((first) =>
  SPEFFZ.filter((second) => second !== first).map((second) => first + second),
);

const ideas = letterPairs as Record<string, string[]>;
const entries = Object.entries(ideas);
const everyIdea = entries.flatMap(([, list]) => list);

// Anything that would make a poor memo image, or that has no place on a personal trainer.
const UNUSABLE =
  /\b(sex\w*|porn|penis|vagina|boob\w*|nipple|naked|nude|orgasm|masturbat\w*|hooker|whore|slut|bitch|bastard|shit\w*|fuck\w*|piss|arse|asshole|dick|cock|anal|rape|cocaine|heroin|meth|marijuana|drunk|murder|nazi|hitler|suicide|queer|fag\w*)\b/i;

describe('bundled letter-pair ideas', () => {
  it('covers all 552 Speffz pairs and nothing else', () => {
    expect(ALL_PAIRS).toHaveLength(552);
    expect(Object.keys(ideas).sort()).toEqual([...ALL_PAIRS].sort());
  });

  it('is in pair order, so the file reads like the grid', () => {
    expect(Object.keys(ideas)).toEqual(ALL_PAIRS);
  });

  it('gives every pair two or three ideas', () => {
    const wrong = entries.filter(([, list]) => list.length < 2 || list.length > 3);
    expect(wrong.map(([pair, list]) => `${pair}: ${list.length}`)).toEqual([]);
  });

  it('has no idea used twice anywhere, so no two pairs share an image', () => {
    const seen = new Map<string, string[]>();
    for (const [pair, list] of entries) {
      for (const idea of list) {
        const key = idea.toLowerCase();
        seen.set(key, [...(seen.get(key) ?? []), pair]);
      }
    }
    const repeated = [...seen].filter(([, pairs]) => pairs.length > 1);
    expect(repeated.map(([idea, pairs]) => `${idea} in ${pairs.join(', ')}`)).toEqual([]);
  });

  it('holds short, tidy, usable phrases', () => {
    expect(everyIdea.filter((idea) => idea !== idea.trim())).toEqual([]);
    expect(everyIdea.filter((idea) => idea.length < 2 || idea.length > 40)).toEqual([]);
    expect(everyIdea.filter((idea) => UNUSABLE.test(idea))).toEqual([]);
  });

  it('has 1,656 ideas in total', () => {
    expect(everyIdea).toHaveLength(1656);
  });
});
