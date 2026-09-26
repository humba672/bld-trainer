/**
 * The timer.
 *
 * No spacebar: the scramble is confirmed by the cube itself, the clock starts on your first turn
 * and stops the moment the cube is solved. Every turn is kept with the time it landed, which is
 * what lets the solve be read back afterwards.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { randomScramble, warmScrambler } from '../cube/scramble';
import { analyseSolve } from '../timer/cfop';
import { SolveRun, type Phase } from '../timer/run';
import { prefixStates, progressOf, type ScrambleProgress } from '../timer/scramble-progress';
import { renderScramble } from '../ui/scramble-view';
import {
  averageOf,
  bestAverage,
  bestSingle,
  effectiveMs,
  formatMs,
  type Penalty,
  type Solve,
} from '../timer/averages';
import { isConnected, onCubeChange, tracker } from '../session';
import {
  addSolve,
  loadSolves,
  loadTimerSettings,
  replaceSolves,
  saveTimerSettings,
  type TimerSettings,
} from '../store';

const INSPECTION_MS = 15000;

export function mountTimer(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head">
      <h1>Timer</h1>
      <div class="chips"><span id="phase" class="chip"></span></div>
      <div class="actions">
        <label class="inline"><input type="checkbox" id="inspection" /> Inspection</label>
        <button id="new">New scramble</button>
      </div>
    </header>

    <section class="panel timer-panel">
      <p id="scramble" class="scramble big">…</p>
      <p id="scramble-kind" class="hint"></p>
      <div id="clock" class="clock">0.00</div>
      <p id="prompt" class="prompt"></p>
    </section>

    <div class="two-up">
      <section class="panel">
        <h2>This solve</h2>
        <div id="breakdown" class="details"></div>
        <div class="table-wrap short"><table>
          <thead><tr><th>Pair</th><th>Slot</th><th>Recognition</th><th>Execution</th></tr></thead>
          <tbody id="pairs"></tbody>
        </table></div>
        <p id="unclear" class="hint"></p>
      </section>

      <section class="panel">
        <h2>Session <span id="session-count" class="count"></span></h2>
        <div id="stats" class="details"></div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Time</th><th>Cross</th><th>F2L</th><th>OLL</th><th>PLL</th><th></th></tr></thead>
          <tbody id="solves"></tbody>
        </table></div>
        <div class="controls"><button id="clear-session">Clear the session</button></div>
      </section>
    </div>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  const run = new SolveRun();
  let scramble = '';
  let scrambledState = SOLVED;
  let scrambleStates: string[] = [SOLVED];
  let progress: ScrambleProgress = { done: 0, wrong: false };
  let randomState = true;
  let pendingPenalty: Solve['penalty'] = 'none';
  let solves: Solve[] = [];
  let settings: TimerSettings = { inspection: false };
  let lastSeenTurns = 0;
  const phase = () => run.phase;

  async function nextScramble(): Promise<void> {
    run.phase = 'scrambling';
    pendingPenalty = 'none';
    el('scramble').textContent = 'Working one out…';
    render();
    const next = await randomScramble();
    scramble = next.alg;
    randomState = next.randomState;
    scrambledState = applyAlg(SOLVED, next.alg);
    scrambleStates = prefixStates(next.alg);
    progress = { done: 0, wrong: false };
    run.setScramble(scrambledState);
    render();
  }

  async function finishSolve(): Promise<void> {
    const turns = run.turns;
    const analysis = analyseSolve(scrambledState, turns);
    const solve: Solve = {
      at: Date.now(),
      scramble,
      randomState,
      timeMs: analysis.timeMs,
      penalty: pendingPenalty,
      moves: turns,
      unclear: analysis.unclear,
      stages: analysis.stages,
      pairs: analysis.pairs.map(({ slot, caseKey, recognitionMs, executionMs }) => ({
        slot,
        caseKey,
        recognitionMs,
        executionMs,
      })),
      moveCount: analysis.moveCount,
      tps: analysis.tps,
    };
    solves = await addSolve(solve);
    render();
    void nextScramble();
  }

  /** Everything that happens as you turn the cube. */
  function onCube(): void {
    const entries = tracker.entries;
    const fresh = entries.slice(lastSeenTurns).map((entry) => ({ move: entry.move, t: entry.t }));
    lastSeenTurns = entries.length;

    // While the scramble is going on, follow it move by move so a wrong turn shows up at once.
    if (run.phase === 'applying') {
      progress = progressOf(scrambleStates, tracker.cubeFacelets(), progress.done);
    }

    const now = performance.now();
    // Inspection time is spent by the time the first turn lands, so read the penalty first.
    if (run.phase === 'inspecting' && fresh.length) pendingPenalty = run.inspectionPenalty(now);

    if (run.feed(fresh, tracker.cubeFacelets(), now)) void finishSolve();
    render();
  }

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
    if (!scramble) el('scramble').textContent = '…';
    else renderScramble(el('scramble'), scramble, progress, phase() === 'applying');
    el('scramble-kind').textContent = randomState
      ? ''
      : 'Random turns — the solver would not start, so this scramble is not random state.';

    const phases: Record<Phase, string> = {
      scrambling: 'Thinking of a scramble',
      applying: 'Apply the scramble',
      ready: 'Ready — turn when you like',
      inspecting: 'Inspecting',
      solving: 'Solving',
      done: 'Done',
    };
    el('phase').textContent = phases[phase()];
    el('phase').className = `chip ${phase() === 'solving' ? 'good' : ''}`;

    el('prompt').textContent = !isConnected()
      ? 'No cube connected — the timer needs it to see the scramble go on and the solve come off.'
      : phase() === 'applying'
        ? progress.wrong
          ? 'That turn is not in the scramble — undo it and the red one will clear.'
          : `${progress.done} of ${scrambleStates.length - 1} on. Hold it white on top, green in front.`
        : phase() === 'inspecting'
          ? 'Inspection is running. Your first turn starts the clock.'
          : phase() === 'done'
            ? 'Next scramble is ready when you are.'
            : '';

    const clock = el('clock');
    if (phase() === 'solving') {
      clock.textContent = formatMs(run.elapsedMs);
      clock.className = 'clock running';
    } else if (phase() === 'inspecting') {
      const left = Math.max(0, INSPECTION_MS - (performance.now() - run.confirmedAt));
      clock.textContent = (left / 1000).toFixed(1);
      clock.className = `clock inspecting${left <= 0 ? ' over' : ''}`;
    } else {
      const last = solves[solves.length - 1];
      clock.textContent = last ? formatMs(effectiveMs(last)) : '0.00';
      clock.className = 'clock';
    }

    // This solve
    const last = solves[solves.length - 1];
    if (last && phase() === 'done') {
      rows(el('breakdown'), [
        ['Time', formatMs(effectiveMs(last))],
        ['Moves', String(last.moveCount ?? 0)],
        ['Turns per second', (last.tps ?? 0).toFixed(2)],
        ['Cross', formatMs(last.stages?.crossMs ?? 0)],
        ['F2L', formatMs(last.stages?.f2lMs ?? 0)],
        ['OLL', formatMs(last.stages?.ollMs ?? 0)],
        ['PLL', formatMs(last.stages?.pllMs ?? 0)],
      ]);
      const body = el('pairs');
      body.innerHTML = '';
      (last.pairs ?? []).forEach((pair, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${i + 1}</td><td>${pair.slot}</td><td>${formatMs(
          pair.recognitionMs,
        )}</td><td>${formatMs(pair.executionMs)}</td>`;
        body.appendChild(row);
      });
      el('unclear').textContent = last.unclear.length
        ? `Read with care: ${last.unclear.join('; ')}.`
        : '';
    }

    // Session
    el('session-count').textContent = solves.length ? `${solves.length} solves` : '';
    rows(el('stats'), [
      ['Best', formatMs(bestSingle(solves))],
      ['ao5', formatMs(averageOf(solves, 5))],
      ['ao12', formatMs(averageOf(solves, 12))],
      ['ao100', formatMs(averageOf(solves, 100))],
      ['Best ao5', formatMs(bestAverage(solves, 5))],
    ]);

    const list = el('solves');
    list.innerHTML = '';
    [...solves].reverse().forEach((solve, indexFromEnd) => {
      const number = solves.length - indexFromEnd;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${number}</td>
        <td>${formatMs(effectiveMs(solve))}</td>
        <td>${formatMs(solve.stages?.crossMs ?? null)}</td>
        <td>${formatMs(solve.stages?.f2lMs ?? null)}</td>
        <td>${formatMs(solve.stages?.ollMs ?? null)}</td>
        <td>${formatMs(solve.stages?.pllMs ?? null)}</td>
        <td class="row-actions"></td>`;
      const actions = row.querySelector('.row-actions')!;
      for (const [label, penalty] of [
        ['+2', 'plus2'],
        ['DNF', 'dnf'],
        ['OK', 'none'],
      ] as Array<[string, Penalty]>) {
        const button = document.createElement('button');
        button.textContent = label;
        button.className = solve.penalty === penalty ? 'toggle on' : 'toggle';
        button.addEventListener('click', async () => {
          solve.penalty = penalty;
          solves = await replaceSolves(solves);
          render();
        });
        actions.appendChild(button);
      }
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.title = 'Delete this solve';
      remove.addEventListener('click', async () => {
        solves = await replaceSolves(solves.filter((other) => other !== solve));
        render();
      });
      actions.appendChild(remove);
      list.appendChild(row);
    });
  }

  el('new').addEventListener('click', () => void nextScramble());
  el('clear-session').addEventListener('click', async () => {
    solves = await replaceSolves([]);
    render();
  });
  const inspectionBox = el<HTMLInputElement>('inspection');
  inspectionBox.addEventListener('change', async () => {
    settings = { ...settings, inspection: inspectionBox.checked };
    run.setInspection(settings.inspection);
    await saveTimerSettings(settings);
  });

  const stop = onCubeChange(onCube);
  const ticker = setInterval(() => {
    if (phase() === 'solving' || phase() === 'inspecting') render();
  }, 50);

  void (async () => {
    [solves, settings] = await Promise.all([loadSolves(), loadTimerSettings()]);
    inspectionBox.checked = settings.inspection;
    run.setInspection(settings.inspection);
    lastSeenTurns = tracker.entries.length;
    warmScrambler();
    await nextScramble();
  })();

  return () => {
    stop();
    clearInterval(ticker);
  };
}
