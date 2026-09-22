/**
 * Home: where you are, what the cube is doing, and what is worth practising today.
 */

import { isConnected, onCubeChange, state } from '../session';
import { TARGET_MS, fluency, runningStreak, weightOf } from '../bld/drills';
import { CORNER_STICKER, EDGE_STICKER, LETTERS } from '../bld/speffz';
import {
  loadLetterStats,
  loadProgress,
  loadTracing,
  saveProgress,
  type LetterStats,
  type Progress,
  type TracingAttempt,
} from '../store';

const STAGES = [
  { name: 'Foundations', what: 'Speffz recall, tracing, cycle breaks, parity' },
  { name: 'Old Pochmann', what: 'T, Ja, Jb and the altered Y perm' },
  { name: 'Orozco', what: 'One commutator per target on the new buffers' },
  { name: '3-style', what: 'One commutator per letter pair' },
];

/** The memo advice, shown once and then never again. */
const MEMO_ADVICE =
  'Memorise corners first, as images. Then edges, as sounds. Execute edges first.';

export function mountHome(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head"><h1>Home</h1></header>
    <div id="advice" class="note" hidden></div>
    <div class="two-up">
      <section class="panel">
        <h2>Where you are</h2>
        <div id="stage" class="details"></div>
        <div class="controls">
          <button id="unlock">Unlock the next stage anyway</button>
        </div>
        <p class="hint">The exit test is a guide, not a gate — you can always override it.</p>
      </section>
      <section class="panel">
        <h2>The cube</h2>
        <div id="cube" class="details"></div>
        <div class="controls"><a class="button" href="#cube-link">Open the cube link</a></div>
      </section>
    </div>
    <div class="two-up">
      <section class="panel">
        <h2>Worth practising today</h2>
        <div id="due" class="details"></div>
        <div class="controls">
          <a class="button" href="#letter-drill">Letter drill</a>
          <a class="button" href="#tracing-drill">Tracing drill</a>
        </div>
      </section>
      <section class="panel">
        <h2>Last five attempts</h2>
        <div class="table-wrap short">
          <table>
            <thead><tr><th>When</th><th>Drill</th><th>Time</th><th>Verdict</th></tr></thead>
            <tbody id="recent"></tbody>
          </table>
        </div>
        <p class="hint">Full solves arrive in the next phase; these are tracing attempts.</p>
      </section>
    </div>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  let stats: LetterStats = {};
  let attempts: TracingAttempt[] = [];
  let progress: Progress = { stage: 0, unlocked: [], memoAdviceSeen: false };

  function rows(into: HTMLElement, pairs: Array<[string, string]>): void {
    into.innerHTML = '';
    for (const [key, value] of pairs) {
      const item = document.createElement('div');
      item.className = 'detail';
      item.innerHTML = '<span class="key"></span><span class="value"></span>';
      item.querySelector('.key')!.textContent = key;
      item.querySelector('.value')!.textContent = value;
      into.appendChild(item);
    }
  }

  function render(): void {
    const letters = fluency(stats);
    const seen = Object.keys(stats).length;
    const streak = runningStreak(attempts);
    const stage = STAGES[progress.stage] ?? STAGES[0];
    const passed = letters.share >= 0.95 && seen === 48 && streak >= 5;

    rows(el('stage'), [
      ['Stage', `${progress.stage}. ${stage.name}`],
      ['Learning', stage.what],
      ['Letters', `${Math.round(letters.share * 100)}% right under 2s, ${seen} of 48 stickers seen`],
      ['Tracing', `${streak} correct in a row`],
      ['Exit test', passed ? 'passed — next stage is open' : 'not yet: 95% of 48 letters, and 5 traces in a row'],
    ]);

    rows(el('cube'), [
      ['Connection', isConnected() ? `connected to ${state.info.deviceName ?? 'the cube'}` : 'not connected'],
      ...(state.info.battery === undefined ? [] : ([['Battery', `${state.info.battery}%`]] as Array<[string, string]>)),
      ...(state.info.generation ? ([['Protocol', state.info.generation]] as Array<[string, string]>) : []),
      ['Last checked', state.lastCheck ? (state.lastCheck.matched ? 'matches the cube' : 'drifted') : 'not yet'],
    ]);

    const weakest = [...LETTERS.flatMap((letter) => [
      { kind: 'corner' as const, letter, index: CORNER_STICKER[letter] },
      { kind: 'edge' as const, letter, index: EDGE_STICKER[letter] },
    ])]
      .map((item) => ({ item, weight: weightOf(stats[`${item.kind}:${item.letter}`]) }))
      .sort((a, b) => b.weight - a.weight);
    const shaky = weakest.filter(({ weight }) => weight > 2).length;

    rows(el('due'), [
      ['Letters below target', `${shaky} of 48`],
      [
        'Slowest right now',
        weakest
          .slice(0, 5)
          .map(({ item }) => `${item.letter} ${item.kind}`)
          .join(', '),
      ],
      ['Target', `every sticker under ${TARGET_MS / 1000}s`],
      ['Tracing', streak >= 5 ? 'exit test met — keep it warm' : `${5 - streak} more correct in a row`],
    ]);

    const recent = el('recent');
    recent.innerHTML = '';
    for (const attempt of [...attempts].reverse().slice(0, 5)) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${new Date(attempt.at).toLocaleString()}</td><td>Tracing</td><td>${attempt.seconds.toFixed(
        0,
      )}s</td><td class="${attempt.correct ? 'good' : 'bad'}">${attempt.correct ? 'right' : 'wrong'}</td>`;
      recent.appendChild(row);
    }
    if (!attempts.length) {
      recent.innerHTML = '<tr><td colspan="4" class="hint">Nothing yet.</td></tr>';
    }

    el<HTMLButtonElement>('unlock').disabled = progress.stage >= STAGES.length - 1;
  }

  el('unlock').addEventListener('click', async () => {
    progress = { ...progress, stage: Math.min(progress.stage + 1, STAGES.length - 1) };
    progress.unlocked = [...new Set([...progress.unlocked, progress.stage])];
    await saveProgress(progress);
    render();
  });

  void (async () => {
    [stats, attempts, progress] = await Promise.all([loadLetterStats(), loadTracing(), loadProgress()]);
    if (!progress.memoAdviceSeen) {
      const advice = el('advice');
      advice.hidden = false;
      advice.textContent = MEMO_ADVICE;
      progress = { ...progress, memoAdviceSeen: true };
      await saveProgress(progress);
    }
    render();
  })();

  return onCubeChange(render);
}
