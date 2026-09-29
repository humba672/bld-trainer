/**
 * Tracing drill: a scramble is shown, the site watches you apply it, and then you type the memo
 * you traced. The memo is checked by simulating it, so any valid order of cycle breaks passes.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { memoFor, pairsOf } from '../bld/op';
import type { Letter } from '../bld/speffz';
import {
  checkMemo,
  faultSoFar,
  lettersIn,
  memoIsValid,
  runningStreak,
  type MemoCheck,
  type MemoFault,
} from '../bld/drills';
import { Cube3D } from '../ui/cube3d';
import { randomScramble } from '../cube/scramble';
import { type ScrambleProgress } from '../timer/scramble-progress';
import { ScrambleTracker } from '../timer/scramble-tracker';
import { renderScramble } from '../ui/scramble-view';
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
      <div class="trace-cube">
        <p id="scramble-kind" class="hint"></p>
        <div id="cube" class="cube-stage"></div>
        <p class="hint">Drag the cube to look round it.</p>
        <div id="apply-state" class="apply-state"></div>
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
      <p id="edges-live" class="live"></p>
      <label for="corners-in">Corners</label>
      <input id="corners-in" autocomplete="off" spellcheck="false" />
      <p id="corners-live" class="live"></p>
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

  const cube = new Cube3D(el('cube'), { size: 172 });

  let stage: Stage = 'scrambling';
  let scramble = '';
  let scrambled = SOLVED;
  let scrambleTracker = new ScrambleTracker('');
  let progress: ScrambleProgress = { done: 0, wrong: false };
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
    scrambleTracker = new ScrambleTracker(alg);
    progress = { done: 0, wrong: false };
    renderScramble(el('scramble'), alg, progress, true);
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
    liveCheck('edge');
    liveCheck('corner');
    render();
  }

  function render(): void {
    // While the scramble is going on, the cube shows what is really in your hands; after that it
    // holds the state you are tracing, so it stays there to look at while you type.
    cube.paint(stage === 'applying' && isConnected() ? tracker.cubeFacelets() : scrambled);

    const box = el('apply-state');
    if (stage === 'scrambling') {
      box.innerHTML = '<span class="hint">…</span>';
    } else if (stage === 'applying') {
      progress = scrambleTracker.update(tracker.cubeFacelets());
      renderScramble(el('scramble'), scramble, progress, true);
      if (scrambleTracker.complete) {
        scrambled = tracker.cubeFacelets();
        beginTracing();
        return;
      }
      box.innerHTML = isConnected()
        ? progress.wrong
          ? '<span class="chip bad">That turn is not in the scramble — undo it</span>'
          : `<span class="chip">${progress.done} of ${scrambleTracker.moveCount} on</span>`
        : '<span class="chip bad">No cube connected</span>';
    } else {
      renderScramble(el('scramble'), scramble, progress, false);
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
      }">${verdictOf(attempt)}</td>`;
      history.appendChild(row);
    }
  }

  async function check(): Promise<void> {
    const edges = lettersIn(el<HTMLInputElement>('edges-in').value);
    const corners = lettersIn(el<HTMLInputElement>('corners-in').value);
    const seconds = startedAt ? (performance.now() - startedAt) / 1000 : 0;
    const edgeCheck = checkMemo(scrambled, edges, 'edge');
    const cornerCheck = checkMemo(scrambled, corners, 'corner');
    const correct = memoIsValid(scrambled, edges, corners);
    const mine = memoFor(scrambled);

    attempts = await addTracingAttempt({
      at: Date.now(),
      scramble,
      typed: `${edges.join('')} / ${corners.join('')}`,
      correct,
      seconds,
      edgesOk: edgeCheck.ok,
      cornersOk: cornerCheck.ok,
    });

    const result = el('result');
    result.innerHTML = `
      <p class="verdict ${correct ? 'good' : 'bad'}">${
        correct ? 'That memo solves it.' : 'That memo does not solve it.'
      }</p>
      ${halfHtml('Edges', edges, edgeCheck)}
      ${halfHtml('Corners', corners, cornerCheck)}
      <div class="detail"><span class="key">The site's edges</span><span class="value pairs" id="site-edges"></span></div>
      <div class="detail"><span class="key">The site's corners</span><span class="value pairs" id="site-corners"></span></div>
      <p class="hint">Yours can differ and still be right, as long as it solves the cube.</p>`;
    el('site-edges').innerHTML = pairsOf(mine.edges).map((pair) => pairChip(pair)).join(' ');
    el('site-corners').innerHTML = pairsOf(mine.corners).map((pair) => pairChip(pair)).join(' ');
    wirePairChips(result);
    stage = 'done';
    render();
  }

  /**
   * Checked on every keystroke. A memo you have not finished is not a mistake, so nothing is said
   * until a letter is typed that cannot be followed - and then it is said at once, while you can
   * still see what you were looking at. What it should have been is kept back for the check: being
   * told the answer for each wrong letter would turn tracing into guessing.
   */
  function liveCheck(kind: 'edge' | 'corner'): void {
    const box = el<HTMLInputElement>(kind === 'edge' ? 'edges-in' : 'corners-in');
    const say = el(kind === 'edge' ? 'edges-live' : 'corners-live');
    const letters = lettersIn(box.value);
    const fault = stage === 'tracing' ? faultSoFar(scrambled, letters, kind) : null;

    box.classList.toggle('wrong', fault !== null);
    say.className = `live ${fault ? 'bad' : 'good'}`;
    say.textContent = fault
      ? liveWords(fault)
      : letters.length
        ? `${letters.length} target${letters.length === 1 ? '' : 's'}, still good`
        : '';
  }

  el('edges-in').addEventListener('input', () => liveCheck('edge'));
  el('corners-in').addEventListener('input', () => liveCheck('corner'));

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
    cube.destroy();
    clearInterval(ticker);
  };
}

/**
 * Where a memo broke, in the words a tracer would use. Only the first mistake is described:
 * everything after a wrong target is wrong because of it, not on its own account.
 */
function faultInWords(check: MemoCheck, total: number): string {
  const fault = check.fault;
  if (!fault) return `all ${total} targets, right through.`;
  const said = fault.letter ? `you wrote ${fault.letter}` : '';

  switch (fault.reason) {
    case 'wrong-target':
      return `${said}, and from there it had to be ${fault.expected}.`;
    case 'wrong-sticker':
      return `${said} — the right piece, but the wrong sticker of it, so it would arrive turned.
        It had to be ${fault.expected}.`;
    case 'buffer-sticker':
      return `${fault.letter} is on the buffer piece itself, which can never be a target.`;
    case 'already-solved':
      return `you broke into ${fault.letter}, but that piece was already where it belongs — a new
        cycle has to start on a piece that is out of place.`;
    case 'stopped-early':
      return fault.expected
        ? `it ran out after ${check.good} targets with pieces still out of place. ${fault.expected}
          should have come next.`
        : `it ran out after ${check.good} targets with pieces still out of place — there was
          another cycle to break into.`;
    case 'kept-going':
      return `everything was already solved after ${check.good} targets, so ${fault.letter} is one
        too many.`;
  }
}

/** The memo as typed, with the first wrong target picked out and the rest greyed. */
function typedHtml(letters: Letter[], check: MemoCheck): string {
  if (!letters.length) return '<span class="memo-empty">nothing typed</span>';
  return letters
    .map((letter, index) => {
      const state = check.ok || index < check.good ? 'ok' : index === check.good ? 'wrong' : 'after';
      return `<span class="t ${state}${index % 2 ? ' pair-end' : ''}">${letter}</span>`;
    })
    .join('');
}

/** The short form, beside the memo. A memo that simply stops has no wrong target to point at. */
function verdictFor(check: MemoCheck): string {
  if (check.ok) return 'right';
  if (check.fault?.reason === 'stopped-early') return 'stops short';
  if (check.fault?.reason === 'kept-going') return 'runs on';
  return `wrong at target ${check.fault?.at}`;
}

function halfHtml(name: string, letters: Letter[], check: MemoCheck): string {
  return `
    <div class="memo-half">
      <span class="key">${name}</span>
      <span class="memo-typed">${typedHtml(letters, check)}</span>
      <span class="memo-verdict ${check.ok ? 'good' : 'bad'}">${verdictFor(check)}</span>
      <p class="memo-why">${faultInWords(check, letters.length)}</p>
    </div>`;
}

/**
 * What went wrong, at a glance, down the history. Attempts recorded before the two halves were
 * told apart know only that something was wrong, so they still say just that.
 */
function verdictOf(attempt: TracingAttempt): string {
  if (attempt.correct) return 'right';
  if (attempt.edgesOk === false && attempt.cornersOk === false) return 'both';
  if (attempt.edgesOk === false) return 'edges';
  if (attempt.cornersOk === false) return 'corners';
  return 'wrong';
}

/**
 * What to say the instant a target goes wrong. It names the mistake but not the answer: knowing
 * which letter it should have been is the whole exercise, and the check at the end tells you.
 */
function liveWords(fault: MemoFault): string {
  switch (fault.reason) {
    case 'wrong-sticker':
      return `Target ${fault.at} is the right piece, but the wrong sticker of it.`;
    case 'buffer-sticker':
      return `Target ${fault.at} is on the buffer piece, which is never a target.`;
    case 'already-solved':
      return `Target ${fault.at} is a piece that is already where it belongs.`;
    case 'kept-going':
      return `Everything was solved after ${fault.at - 1} targets — target ${fault.at} is one too many.`;
    default:
      return `Target ${fault.at} cannot follow from there.`;
  }
}
