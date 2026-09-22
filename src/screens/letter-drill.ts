/**
 * Letter drill: a sticker is picked out on a drawn cube and you say which letter it is. Timed, and
 * the ones you are worst at come back most often.
 */

import { SOLVED } from '../cube/cube';
import { CORNER_STICKER, EDGE_STICKER, LETTERS } from '../bld/speffz';
import { netSvg } from '../ui/net';
import { TARGET_MS, fluency, weightOf } from '../bld/drills';
import {
  loadLetterStats,
  saveLetterStats,
  type LetterStats,
  type StickerStat,
} from '../store';

interface Question {
  kind: 'corner' | 'edge';
  letter: string;
  index: number;
  askedAt: number;
}

const keyOf = (kind: string, letter: string) => `${kind}:${letter}`;

const blank: StickerStat = { asked: 0, right: 0, totalMs: 0, bestMs: 0, lastSeen: 0 };


export function mountLetterDrill(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head"><h1>Letter drill</h1></header>
    <p class="hint">
      One sticker is picked out below. Type its Speffz letter, or press it on the keypad. Under
      ${TARGET_MS / 1000} seconds counts as known, and the stickers you are slowest on come back most.
    </p>
    <div class="two-up">
      <section class="panel">
        <div id="net"></div>
        <p id="verdict" class="verdict">&nbsp;</p>
        <div id="keypad" class="keypad"></div>
      </section>
      <section class="panel">
        <h2>How it is going</h2>
        <div id="stats" class="details"></div>
        <h2>Weakest stickers</h2>
        <div id="weak" class="demo-buttons"></div>
        <div class="controls">
          <button id="reset-stats">Forget these stats</button>
        </div>
      </section>
    </div>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  let stats: LetterStats = {};
  let question: Question | null = null;
  let stopped = false;

  const pool = [
    ...LETTERS.map((letter) => ({ kind: 'corner' as const, letter, index: CORNER_STICKER[letter] })),
    ...LETTERS.map((letter) => ({ kind: 'edge' as const, letter, index: EDGE_STICKER[letter] })),
  ];

  function ask(): void {
    const weights = pool.map((item) => weightOf(stats[keyOf(item.kind, item.letter)]));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let picked = pool[0];
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        picked = pool[i];
        break;
      }
    }
    question = { ...picked, askedAt: performance.now() };
    el('net').innerHTML = netSvg(SOLVED, { highlight: picked.index, size: 26 });
    renderStats();
  }

  async function answer(letter: string): Promise<void> {
    if (!question) return;
    const took = performance.now() - question.askedAt;
    const right = letter === question.letter;
    const key = keyOf(question.kind, question.letter);
    const stat = { ...(stats[key] ?? blank) };
    stat.asked += 1;
    stat.lastSeen = Date.now();
    if (right) {
      stat.right += 1;
      stat.totalMs += took;
      stat.bestMs = stat.bestMs ? Math.min(stat.bestMs, took) : took;
    }
    stats[key] = stat;
    await saveLetterStats(stats);

    const verdict = el('verdict');
    verdict.textContent = right
      ? `${letter} — ${(took / 1000).toFixed(1)}s${took <= TARGET_MS ? '' : ', slow'}`
      : `${letter} is wrong: that sticker is ${question.letter}`;
    verdict.className = `verdict ${right ? 'good' : 'bad'}`;
    setTimeout(() => {
      if (!stopped) ask();
    }, right ? 350 : 1200);
    question = null;
  }

  function renderStats(): void {
    const { known, total, share } = fluency(stats);
    const seen = Object.keys(stats).length;
    const rows: Array<[string, string]> = [
      ['Answered', String(total)],
      ['Right and under 2s', `${known} (${Math.round(share * 100)}%)`],
      ['Stickers seen', `${seen} of 48`],
      ['Exit test', share >= 0.95 && seen === 48 ? 'passed' : 'needs 95% over all 48 stickers'],
    ];
    const box = el('stats');
    box.innerHTML = '';
    for (const [key, value] of rows) {
      const item = document.createElement('div');
      item.className = 'detail';
      item.innerHTML = '<span class="key"></span><span class="value"></span>';
      item.querySelector('.key')!.textContent = key;
      item.querySelector('.value')!.textContent = value;
      box.appendChild(item);
    }

    const weak = [...pool]
      .map((item) => ({ item, weight: weightOf(stats[keyOf(item.kind, item.letter)]) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 12);
    el('weak').innerHTML = weak
      .map(({ item }) => `<span class="chip">${item.letter} ${item.kind}</span>`)
      .join('');
  }

  const keypad = el('keypad');
  for (const letter of LETTERS) {
    const button = document.createElement('button');
    button.textContent = letter;
    button.addEventListener('click', () => void answer(letter));
    keypad.appendChild(button);
  }

  el('reset-stats').addEventListener('click', async () => {
    stats = {};
    await saveLetterStats(stats);
    renderStats();
  });

  const onKey = (event: KeyboardEvent) => {
    const letter = event.key.toUpperCase();
    if (LETTERS.includes(letter)) void answer(letter);
  };
  document.addEventListener('keydown', onKey);

  void loadLetterStats().then((loaded) => {
    stats = loaded;
    ask();
  });

  return () => {
    stopped = true;
    document.removeEventListener('keydown', onKey);
  };
}
