/**
 * Tracing drill: a scramble is shown, the site watches you apply it, and then you type the memo
 * you traced. The memo is checked by simulating it, so any valid order of cycle breaks passes.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { memoFor, pairsOf } from '../bld/op';
import { lettersIn, memoIsValid, runningStreak } from '../bld/drills';
import { randomScramble } from '../cube/scramble';
import { loadPairPanel, pairChip, wirePairChips } from '../ui/pairs-panel';
import { addTracingAttempt, loadTracing, type TracingAttempt } from '../store';
import { isConnected, onCubeChange, tracker } from '../session';

type Stage = 'scrambling' | 'applying' | 'tracing' | 'done';

export function mountTracingDrill(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head">
      <h1>Tracing drill</h1>
      <div class="actions"><button id="new" class="primary">New scramble</button></div>
    </header>

    <section class="panel">
      <h2>Scramble</h2>
      <p id="scramble" class="scramble">…</p>
      <p id="scramble-kind" class="hint"></p>
      <div id="apply-state" class="apply-state"></div>
      <div class="controls">
        <button id="skip-cube">Applied it without the cube</button>
      </div>
    </section>

    <section class="panel" id="trace-panel" hidden>
      <h2>Your memo</h2>
      <p class="hint">
        Letters only; spaces are ignored. Any order of cycle breaks is fine — the site checks the
        memo by running it, not by comparing it with its own.
      </p>
      <label for="edges-in">Edges</label>
      <input id="edges-in" autocomplete="off" spellcheck="false" />
      <label for="corners-in">Corners</label>
      <input id="corners-in" autocomplete="off" spellcheck="false" />
      <div class="controls">
        <button id="check" class="primary">Check my memo</button>
        <span id="timer" class="hint"></span>
      </div>
      <div id="result"></div>
    </section>

    <section class="panel">
      <h2>Recent attempts <span id="streak" class="count"></span></h2>
      <div class="table-wrap short">
        <table>
          <thead><tr><th>When</th><th>Memo</th><th>Time</th><th>Verdict</th></tr></thead>
          <tbody id="history"></tbody>
        </table>
      </div>
    </section>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  let stage: Stage = 'scrambling';
  let scramble = '';
  let scrambled = SOLVED;
  let startedAt = 0;
  let attempts: TracingAttempt[] = [];

  async function newScramble(): Promise<void> {
    stage = 'scrambling';
    el('scramble').textContent = 'Working one out…';
    el('trace-panel').hidden = true;
    el('result').innerHTML = '';
    const { alg, randomState } = await randomScramble();
    scramble = alg;
    scrambled = applyAlg(SOLVED, alg);
    el('scramble').textContent = alg;
    el('scramble-kind').textContent = randomState
      ? 'Random state.'
      : '25 random turns — the solver would not start, so this is close to random but not exactly it.';
    stage = 'applying';
    startedAt = 0;
    render();
  }

  function beginTracing(): void {
    stage = 'tracing';
    startedAt = performance.now();
    el('trace-panel').hidden = false;
    el<HTMLInputElement>('edges-in').value = '';
    el<HTMLInputElement>('corners-in').value = '';
    el<HTMLInputElement>('edges-in').focus();
    render();
  }

  function render(): void {
    const box = el('apply-state');
    if (stage === 'scrambling') {
      box.innerHTML = '<span class="hint">…</span>';
    } else if (stage === 'applying') {
      const matches = tracker.cubeFacelets() === scrambled;
      if (matches) {
        beginTracing();
        return;
      }
      box.innerHTML = isConnected()
        ? '<span class="chip">Apply it to your cube — this will tick when the cube matches</span>'
        : '<span class="chip bad">No cube connected</span>';
    } else {
      box.innerHTML = '<span class="chip good">Scramble applied</span>';
    }

    if (stage === 'tracing' && startedAt) {
      el('timer').textContent = `${((performance.now() - startedAt) / 1000).toFixed(0)}s`;
    }

    const streak = runningStreak(attempts);
    el('streak').textContent = attempts.length
      ? `${streak} in a row right${streak >= 5 ? ' — exit test passed' : ''}`
      : '';

    const history = el('history');
    history.innerHTML = '';
    for (const attempt of [...attempts].reverse().slice(0, 10)) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${new Date(attempt.at).toLocaleTimeString()}</td><td class="mono">${
        attempt.typed || '—'
      }</td><td>${attempt.seconds.toFixed(0)}s</td><td class="${
        attempt.correct ? 'good' : 'bad'
      }">${attempt.correct ? 'right' : 'wrong'}</td>`;
      history.appendChild(row);
    }
  }

  async function check(): Promise<void> {
    const edges = lettersIn(el<HTMLInputElement>('edges-in').value);
    const corners = lettersIn(el<HTMLInputElement>('corners-in').value);
    const seconds = startedAt ? (performance.now() - startedAt) / 1000 : 0;
    const correct = memoIsValid(scrambled, edges, corners);
    const mine = memoFor(scrambled);

    attempts = await addTracingAttempt({
      at: Date.now(),
      scramble,
      typed: `${edges.join('')} / ${corners.join('')}`,
      correct,
      seconds,
    });

    const result = el('result');
    result.innerHTML = `
      <p class="verdict ${correct ? 'good' : 'bad'}">${
        correct ? 'That memo solves it.' : 'That memo does not solve it.'
      }</p>
      <div class="detail"><span class="key">The site's edges</span><span class="value pairs" id="site-edges"></span></div>
      <div class="detail"><span class="key">The site's corners</span><span class="value pairs" id="site-corners"></span></div>
      <p class="hint">Yours can differ and still be right, as long as it solves the cube.</p>`;
    el('site-edges').innerHTML = pairsOf(mine.edges).map((pair) => pairChip(pair)).join(' ');
    el('site-corners').innerHTML = pairsOf(mine.corners).map((pair) => pairChip(pair)).join(' ');
    wirePairChips(result);
    stage = 'done';
    render();
  }

  el('new').addEventListener('click', () => void newScramble());
  el('check').addEventListener('click', () => void check());
  el('skip-cube').addEventListener('click', () => {
    if (stage === 'applying') beginTracing();
  });

  const stop = onCubeChange(render);
  const ticker = setInterval(() => {
    if (stage === 'tracing') render();
  }, 1000);

  void (async () => {
    attempts = await loadTracing();
    await loadPairPanel();
    await newScramble();
  })();

  return () => {
    stop();
    clearInterval(ticker);
  };
}

