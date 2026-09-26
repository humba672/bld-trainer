/**
 * The timer, laid out the way a speedcubing timer is: scramble across the top, the clock in the
 * middle with the running averages under it, the session down the left, and a picture of the
 * scramble beside it.
 *
 * No spacebar: the scramble is confirmed by the cube reaching that state, the clock starts on your
 * first turn and stops the moment the cube is solved. Every turn is kept with the time it landed,
 * which is what lets the solve be read back afterwards.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { randomScramble, warmScrambler } from '../cube/scramble';
import { analyseSolve } from '../timer/cfop';
import { SolveRun } from '../timer/run';
import { type ScrambleProgress } from '../timer/scramble-progress';
import { ScrambleTracker } from '../timer/scramble-tracker';
import { renderScramble } from '../ui/scramble-view';
import { netSvg } from '../ui/net';
import {
  averageOf,
  bestAverage,
  bestSingle,
  effectiveMs,
  formatMs,
  meanOf,
  type Penalty,
  type Solve,
} from '../timer/averages';
import { isConnected, onCubeChange, requestCubeState, state as session, tracker } from '../session';
import {
  addSolve,
  loadSolves,
  loadTimerSettings,
  replaceSolves,
  saveTimerSettings,
  type TimerSettings,
} from '../store';

const INSPECTION_MS = 15000;

/** The stats column, current against best, as every timer shows it. */
const STATS: Array<{
  label: string;
  of: (solves: Solve[]) => number | null;
  best: (solves: Solve[]) => number | null;
}> = [
  { label: 'single', of: (s) => (s.length ? effectiveMs(s[s.length - 1]) : null), best: bestSingle },
  { label: 'mo3', of: (s) => meanOf(s, 3), best: (s) => bestAverage(s, 3) },
  { label: 'ao5', of: (s) => averageOf(s, 5), best: (s) => bestAverage(s, 5) },
  { label: 'ao12', of: (s) => averageOf(s, 12), best: (s) => bestAverage(s, 12) },
  { label: 'ao50', of: (s) => averageOf(s, 50), best: (s) => bestAverage(s, 50) },
  { label: 'ao100', of: (s) => averageOf(s, 100), best: (s) => bestAverage(s, 100) },
];

export function mountTimer(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="cs">
      <aside class="cs-side">
        <table class="cs-stats">
          <thead><tr><th></th><th>current</th><th>best</th></tr></thead>
          <tbody id="stats"></tbody>
        </table>
        <div class="cs-times-head">
          <span id="session-count">0 solves</span>
          <button id="clear-session">clear</button>
        </div>
        <div class="table-wrap cs-times">
          <table><tbody id="solves"></tbody></table>
        </div>
      </aside>

      <main class="cs-main">
        <p id="scramble" class="scramble cs-scramble">…</p>
        <p id="scramble-kind" class="hint cs-kind"></p>

        <div class="cs-middle">
          <div class="cs-clock-area">
            <div id="clock" class="clock cs-clock">0.00</div>
            <div id="running" class="cs-running"></div>
            <p id="prompt" class="prompt"></p>
          </div>
          <div class="cs-preview">
            <div id="preview"></div>
            <div class="controls cs-controls">
              <label class="inline"><input type="checkbox" id="inspection" /> inspection</label>
              <button id="new">new scramble</button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <div class="two-up" id="detail" hidden>
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
        <h2>Stages</h2>
        <div id="stages" class="stage-bars"></div>
        <p class="hint">Measured from the turns you made, not from anything you pressed.</p>
      </section>
    </div>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  const run = new SolveRun();
  let scramble = '';
  let scrambledState = SOLVED;
  let scrambleTracker = new ScrambleTracker('');
  let progress: ScrambleProgress = { done: 0, wrong: false };
  let physicalMoves = 0;
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
    scrambleTracker = new ScrambleTracker(next.alg);
    progress = { done: 0, wrong: false };
    physicalMoves = 0;
    run.setScramble(scrambledState);
    render();
  }

  async function finishSolve(): Promise<void> {
    const turns = run.turns;
    const analysis = analyseSolve(scrambledState, turns);

    // Check the whole solve against the cube itself: do the turns recorded actually add up to the
    // state the cube says it is in? If Bluetooth lost anything, this is where it shows.
    const turnsAtFinish = session.turnsSeen;
    const replayed = applyAlg(scrambledState, turns.map((turn) => turn.move).join(' '));
    const reported = await requestCubeState();
    const verified =
      reported === null || session.turnsSeen !== turnsAtFinish ? null : reported === replayed;
    const unclear = [...analysis.unclear];
    if (verified === false) {
      unclear.push('the cube does not agree with the turns recorded, so turns went missing');
    }

    const solve: Solve = {
      at: Date.now(),
      scramble,
      randomState,
      timeMs: analysis.timeMs,
      penalty: pendingPenalty,
      moves: turns,
      unclear,
      verified,
      stages: analysis.stages,
      pairs: analysis.pairs.map(({ slot, caseKey, recognitionMs, executionMs }) => ({
        slot,
        caseKey,
        recognitionMs,
        executionMs,
      })),
      // Counted as you turned them: a slice is one move, not the two the cube reports.
      moveCount: physicalMoves,
      tps: analysis.timeMs > 0 ? (physicalMoves * 1000) / analysis.timeMs : 0,
    };
    solves = await addSolve(solve);
    render();
    void nextScramble();
  }

  /** Everything that happens as you turn the cube. */
  function onCube(): void {
    const entries = tracker.entries;
    const newEntries = entries.slice(lastSeenTurns);
    lastSeenTurns = entries.length;

    // The solve is read in the cube's own frame, so it is fed what the cube reported - not the
    // tracker's reading of it in your hands. A slice arrives as the two face turns it really is.
    const fresh = newEntries.flatMap((entry) => entry.wire.map((move) => ({ move, t: entry.t })));

    // While the scramble is going on, follow it move by move so a wrong turn shows up at once.
    if (run.phase === 'applying') {
      progress = scrambleTracker.update(tracker.cubeFacelets());
      if (scrambleTracker.complete) {
        // Whatever way you were holding it, this is the state it is really in.
        scrambledState = tracker.cubeFacelets();
        run.setScramble(scrambledState);
      }
    }

    const now = performance.now();
    // Inspection time is spent by the time the first turn lands, so read the penalty first.
    if (run.phase === 'inspecting' && fresh.length) pendingPenalty = run.inspectionPenalty(now);

    const ended = run.feed(fresh, tracker.cubeFacelets(), now);
    if (run.phase === 'solving' || ended) physicalMoves += newEntries.length;
    if (ended) void finishSolve();
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

  function renderStats(): void {
    const body = el('stats');
    body.innerHTML = '';
    for (const { label, of, best } of STATS) {
      const row = document.createElement('tr');
      row.innerHTML = `<td class="stat-name">${label}</td><td>${formatMs(
        of(solves),
      )}</td><td>${formatMs(best(solves))}</td>`;
      body.appendChild(row);
    }
  }

  function renderTimes(): void {
    el('session-count').textContent = `${solves.length} solve${solves.length === 1 ? '' : 's'}`;
    const list = el('solves');
    list.innerHTML = '';
    container.querySelector('.cs-times')!.classList.toggle('empty', solves.length === 0);
    [...solves].reverse().forEach((solve, indexFromEnd) => {
      const number = solves.length - indexFromEnd;
      const row = document.createElement('tr');
      row.className = 'time-row';
      row.innerHTML = `
        <td class="time-index">${number}.</td>
        <td class="time-value">${formatMs(effectiveMs(solve))}</td>
        <td class="time-flag">${
          solve.verified === false ? '<span class="bad" title="turns went missing">!</span>' : ''
        }</td>
        <td class="row-actions"></td>`;
      const actions = row.querySelector('.row-actions')!;
      for (const [text, penalty] of [
        ['+2', 'plus2'],
        ['DNF', 'dnf'],
        ['ok', 'none'],
      ] as Array<[string, Penalty]>) {
        const button = document.createElement('button');
        button.textContent = text;
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
      remove.title = 'Delete';
      remove.addEventListener('click', async () => {
        solves = await replaceSolves(solves.filter((other) => other !== solve));
        render();
      });
      actions.appendChild(remove);
      list.appendChild(row);
    });
  }

  function renderStages(last: Solve): void {
    const box = el('stages');
    box.innerHTML = '';
    if (!last.stages) return;
    const parts: Array<[string, number]> = [
      ['Cross', last.stages.crossMs],
      ['F2L', last.stages.f2lMs],
      ['OLL', last.stages.ollMs],
      ['PLL', last.stages.pllMs],
    ];
    const total = parts.reduce((sum, [, ms]) => sum + ms, 0) || 1;
    for (const [name, ms] of parts) {
      const row = document.createElement('div');
      row.className = 'stage-row';
      row.innerHTML = `
        <span class="stage-name"></span>
        <span class="stage-bar"><span style="width:${Math.max(1, (ms / total) * 100)}%"></span></span>
        <span class="stage-time"></span>
        <span class="stage-share"></span>`;
      row.querySelector('.stage-name')!.textContent = name;
      row.querySelector('.stage-time')!.textContent = formatMs(ms);
      row.querySelector('.stage-share')!.textContent = `${Math.round((ms / total) * 100)}%`;
      box.appendChild(row);
    }
  }

  function render(): void {
    if (!scramble) el('scramble').textContent = '…';
    else renderScramble(el('scramble'), scramble, progress, phase() === 'applying');

    el('scramble-kind').textContent = randomState
      ? ''
      : 'random turns — the solver would not start, so this is not random state';

    el('preview').innerHTML = scramble ? netSvg(applyAlg(SOLVED, scramble), { size: 13 }) : '';

    el('prompt').textContent = !isConnected()
      ? 'no cube connected — the timer needs it to see the scramble go on and the solve come off'
      : phase() === 'applying'
        ? progress.wrong
          ? 'that turn is not in the scramble — undo it and the red one will clear'
          : `${progress.done} of ${scrambleTracker.moveCount} on`
        : phase() === 'inspecting'
          ? 'inspection running — your first turn starts the clock'
          : phase() === 'ready'
            ? 'turn when you like'
            : '';

    const clock = el('clock');
    if (phase() === 'solving') {
      clock.textContent = formatMs(run.runningMs(performance.now()));
      clock.className = 'clock cs-clock running';
    } else if (phase() === 'inspecting') {
      const left = Math.max(0, INSPECTION_MS - (performance.now() - run.confirmedAt));
      clock.textContent = (left / 1000).toFixed(1);
      clock.className = `clock cs-clock inspecting${left <= 0 ? ' over' : ''}`;
    } else {
      const last = solves[solves.length - 1];
      clock.textContent = last ? formatMs(effectiveMs(last)) : '0.00';
      clock.className = 'clock cs-clock';
    }

    // The two running averages under the clock, the way a timer shows them.
    el('running').textContent = solves.length
      ? `ao5 ${formatMs(averageOf(solves, 5))}     ao12 ${formatMs(averageOf(solves, 12))}`
      : '';

    // Everything but the clock steps back while you are actually solving.
    container.querySelector('.cs')!.classList.toggle('solving', phase() === 'solving');

    renderStats();
    renderTimes();

    const last = solves[solves.length - 1];
    el('detail').hidden = !last;
    if (last) {
      rows(el('breakdown'), [
        ['Time', formatMs(effectiveMs(last))],
        [
          'Checked against the cube',
          last.verified === true
            ? 'every turn accounted for'
            : last.verified === false
              ? 'DISAGREES — turns went missing'
              : 'could not ask the cube',
        ],
        ['Moves', String(last.moveCount ?? 0)],
        ['Turns per second', (last.tps ?? 0).toFixed(2)],
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
      renderStages(last);
    }
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

  /**
   * The clock alone is redrawn every frame while it is running. Re-rendering the whole screen at
   * that rate would rebuild the times list sixty times a second for nothing, and stutter.
   */
  let frame = 0;
  const clockEl = el('clock');
  const tick = () => {
    if (phase() === 'solving') {
      clockEl.textContent = formatMs(run.runningMs(performance.now()));
    } else if (phase() === 'inspecting') {
      const left = Math.max(0, INSPECTION_MS - (performance.now() - run.confirmedAt));
      clockEl.textContent = (left / 1000).toFixed(1);
      clockEl.className = `clock cs-clock inspecting${left <= 0 ? ' over' : ''}`;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

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
    cancelAnimationFrame(frame);
  };
}
