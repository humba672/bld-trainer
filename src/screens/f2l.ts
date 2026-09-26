/**
 * F2L: where your time goes, and drilling the cases that take it.
 *
 * A case is set up by turns you make, from wherever the cube already is - every case has a setup
 * that leaves the cross and the other three slots alone. Once it is on, the clock starts on your
 * first turn and stops the moment the first two layers are whole again.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import {
  enumerateF2LCases,
  f2lCaseOf,
  f2lComplete,
  openSlot,
  type SlotName,
} from '../timer/cfop';
import { ENOUGH_SAMPLES, f2lStats, nextToDrill, type CaseStat } from '../timer/f2l-stats';
import { formatMs } from '../timer/averages';
import { ScrambleTracker } from '../timer/scramble-tracker';
import type { ScrambleProgress } from '../timer/scramble-progress';
import { renderScramble } from '../ui/scramble-view';
import { netSvg } from '../ui/net';
import { declareSolved, isConnected, onCubeChange, tracker } from '../session';
import { addDrill, loadDrills, loadSolves, replaceDrills } from '../store';
import type { DrillAttempt } from '../timer/f2l-stats';
import type { Solve } from '../timer/averages';

type Phase = 'waiting' | 'setting-up' | 'ready' | 'drilling' | 'done';

const CASES = enumerateF2LCases();
const DRILLABLE = [...CASES.values()].filter((entry) => !entry.solved);

/** The cube as this case looks, for the picture. */
const stateOfCase = (key: string): string => applyAlg(SOLVED, CASES.get(key)?.setup ?? '');

export function mountF2L(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head">
      <h1>F2L</h1>
      <div class="chips"><span id="phase" class="chip"></span></div>
      <div class="actions">
        <label class="inline">Drill
          <select id="mode">
            <option value="weakest">what costs me most</option>
            <option value="random">anything at all</option>
          </select>
        </label>
        <button id="skip">Skip this one</button>
      </div>
    </header>

    <section class="panel drill-panel">
      <div class="drill-case">
        <div id="case-picture"></div>
        <div class="drill-what">
          <p id="setup" class="scramble"></p>
          <div id="drill-clock" class="clock">0.00</div>
          <p id="drill-prompt" class="prompt"></p>
          <div class="controls">
            <button id="solved" hidden>My cube is solved</button>
          </div>
        </div>
      </div>
      <div id="drill-recent" class="details"></div>
    </section>

    <section class="panel">
      <h2>Your cases <span id="case-count" class="count"></span></h2>
      <p class="hint">
        Cost is what a case takes off you every solve: how much slower than a typical case of
        yours, times how often it turns up. Nothing is ranked under ${ENOUGH_SAMPLES} reps, because
        one fumble would put it top.
      </p>
      <div class="table-wrap"><table>
        <thead><tr>
          <th></th><th>Cost / solve</th><th>Execution</th><th>Best</th>
          <th>Recognition</th><th>Per solve</th><th>Reps</th><th></th>
        </tr></thead>
        <tbody id="cases"></tbody>
      </table></div>
      <div class="controls">
        <button id="clear-drills">Forget drill history</button>
        <span class="hint">Solves are kept; only the drill reps are cleared.</span>
      </div>
    </section>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  let phase: Phase = 'waiting';
  let targetKey = DRILLABLE[0].key;
  let setupTracker = new ScrambleTracker('');
  let progress: ScrambleProgress = { done: 0, wrong: false };
  let liveCase: { key: string; slot: SlotName } | null = null;
  let turnsAtStart = 0;
  let startedAt = 0;
  let endedAt = 0;
  let lastSeenTurns = tracker.entries.length;
  let solves: Solve[] = [];
  let drills: DrillAttempt[] = [];
  let stats: CaseStat[] = [];

  function chooseNext(): void {
    const mode = el<HTMLSelectElement>('mode').value;
    targetKey =
      mode === 'random'
        ? DRILLABLE[Math.floor(Math.random() * DRILLABLE.length)].key
        : nextToDrill(stats, DRILLABLE.map((entry) => entry.key));
    beginSetup();
  }

  function beginSetup(): void {
    const from = tracker.cubeFacelets();
    if (!f2lComplete(from)) {
      phase = 'waiting';
      render();
      return;
    }
    const setup = CASES.get(targetKey)!.setup;
    setupTracker = new ScrambleTracker(setup, from);
    progress = { done: 0, wrong: false };
    liveCase = null;
    phase = 'setting-up';
    render();
  }

  async function finishRep(): Promise<void> {
    phase = 'done';
    endedAt = tracker.entries[tracker.entries.length - 1]?.t ?? performance.now();
    const attempt: DrillAttempt = {
      at: Date.now(),
      caseKey: liveCase?.key ?? targetKey,
      slot: liveCase?.slot ?? 'FR',
      timeMs: Math.max(0, endedAt - startedAt),
      moveCount: tracker.entries.length - turnsAtStart,
      solved: true,
    };
    drills = await addDrill(attempt);
    stats = f2lStats(solves, drills);
    render();
    // Straight on to the next one.
    chooseNext();
  }

  function onCube(): void {
    const entries = tracker.entries;
    const fresh = entries.slice(lastSeenTurns);
    lastSeenTurns = entries.length;
    const state = tracker.cubeFacelets();

    if (phase === 'waiting') {
      if (f2lComplete(state)) beginSetup();
      else render();
      return;
    }

    if (phase === 'setting-up') {
      progress = setupTracker.update(state);
      if (setupTracker.complete) {
        const slot = openSlot(state);
        liveCase = slot ? { key: f2lCaseOf(state, slot).key, slot } : null;
        phase = 'ready';
      }
      render();
      return;
    }

    if (phase === 'ready' && fresh.length) {
      phase = 'drilling';
      startedAt = fresh[0].t;
      turnsAtStart = lastSeenTurns - fresh.length;
    }

    if (phase === 'drilling') {
      endedAt = entries[entries.length - 1]?.t ?? startedAt;
      if (f2lComplete(state)) {
        void finishRep();
        return;
      }
    }
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
    const phases: Record<Phase, string> = {
      waiting: 'Waiting for the first two layers',
      'setting-up': 'Setting the case up',
      ready: 'Ready — turn when you like',
      drilling: 'Drilling',
      done: 'Done',
    };
    el('phase').textContent = phases[phase];
    el('phase').className = `chip ${phase === 'drilling' ? 'good' : ''}`;

    el('case-picture').innerHTML = netSvg(stateOfCase(targetKey), { size: 16 });

    const setup = CASES.get(targetKey)!.setup;
    if (phase === 'setting-up') renderScramble(el('setup'), setup, progress, true);
    else renderScramble(el('setup'), setup, progress, false);

    el('drill-prompt').textContent = !isConnected()
      ? 'No cube connected — the driller needs it to see the case go on and come off.'
      : phase === 'waiting'
        ? 'Finish the first two layers on your cube, and the case will go on from there.'
        : phase === 'setting-up'
          ? progress.wrong
            ? 'That turn is not in the setup — undo it.'
            : `${progress.done} of ${setupTracker.moveCount} on.`
          : phase === 'ready'
            ? 'Solve the pair. The clock stops when the first two layers are whole.'
            : '';

    // Somewhere to say so when the cube is not where the driller needs it to be.
    el('solved').hidden = phase !== 'waiting';

    const clock = el('drill-clock');
    if (phase === 'drilling') {
      clock.textContent = formatMs(Math.max(0, endedAt - startedAt));
      clock.className = 'clock running';
    } else if (phase === 'done') {
      clock.textContent = formatMs(drills[drills.length - 1]?.timeMs ?? 0);
      clock.className = 'clock';
    } else {
      clock.textContent = '0.00';
      clock.className = 'clock';
    }

    const recent = drills.slice(-5).reverse();
    const forCase = stats.find((stat) => stat.caseKey === targetKey);
    rows(el('drill-recent'), [
      ['This case', forCase ? `${forCase.samples} reps, ${formatMs(forCase.meanExecutionMs)} average` : 'never done'],
      ['Best', forCase ? formatMs(forCase.bestExecutionMs) : '—'],
      ['Last five', recent.map((rep) => formatMs(rep.timeMs)).join('  ') || '—'],
    ]);

    // The table
    el('case-count').textContent = `${stats.length} seen of ${DRILLABLE.length}`;
    const body = el('cases');
    body.innerHTML = '';
    for (const stat of stats) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="case-cell"></td>
        <td>${stat.ranked ? formatMs(stat.lossPerSolveMs) : '—'}</td>
        <td>${formatMs(stat.meanExecutionMs)}</td>
        <td>${formatMs(stat.bestExecutionMs)}</td>
        <td>${stat.meanRecognitionMs === null ? '—' : formatMs(stat.meanRecognitionMs)}</td>
        <td>${stat.perSolve.toFixed(2)}</td>
        <td>${stat.samples}${stat.ranked ? '' : ` of ${ENOUGH_SAMPLES}`}</td>
        <td class="row-actions"></td>`;
      row.querySelector('.case-cell')!.innerHTML = netSvg(stateOfCase(stat.caseKey), { size: 7 });
      const drillThis = document.createElement('button');
      drillThis.textContent = 'Drill';
      drillThis.addEventListener('click', () => {
        targetKey = stat.caseKey;
        beginSetup();
      });
      row.querySelector('.row-actions')!.appendChild(drillThis);
      body.appendChild(row);
    }
    if (!stats.length) {
      body.innerHTML =
        '<tr><td colspan="8" class="hint">Nothing yet. Do some solves, or drill a few cases.</td></tr>';
    }
  }

  el('skip').addEventListener('click', () => chooseNext());
  el('mode').addEventListener('change', () => chooseNext());
  el('clear-drills').addEventListener('click', async () => {
    drills = await replaceDrills([]);
    stats = f2lStats(solves, drills);
    render();
  });
  el('solved').addEventListener('click', () => void declareSolved());

  const stop = onCubeChange(onCube);
  const ticker = setInterval(() => {
    if (phase === 'drilling') render();
  }, 50);

  void (async () => {
    [solves, drills] = await Promise.all([loadSolves(), loadDrills()]);
    stats = f2lStats(solves, drills);
    chooseNext();
  })();

  return () => {
    stop();
    clearInterval(ticker);
  };
}
