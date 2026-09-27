/**
 * Every F2L case at once: the picture, how it is set up, the shortest way out of it, and how you
 * are doing on it.
 *
 * The driller shows you one case at a time and decides which. This is the other half: the whole
 * forty-one laid out, coloured by what each one costs you, so you can see the shape of your F2L
 * rather than being handed cases one at a time.
 *
 * Every picture is drawn in the grip the algorithms are written for, so the picture is the
 * instruction - hold the cube to match it and the moves underneath are the moves to make. That
 * grip is read out of the notation itself rather than written down here.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { enumerateF2LCases } from '../timer/cfop';
import { DISPLAY_ROTATION, gripSentence, inSolverNotation } from '../timer/f2l-solve';
import {
  ENOUGH_SAMPLES,
  f2lStatsWithTypical,
  speedBand,
  type CaseStat,
  type SpeedBand,
} from '../timer/f2l-stats';
import { formatMs } from '../timer/averages';
import { isoSvg } from '../ui/iso';
import { loadDrills, loadSolves } from '../store';
import solutionData from '../data/f2l-solutions.json';

const CASES = [...enumerateF2LCases().values()].filter((entry) => !entry.solved);
const SOLUTIONS = solutionData as Record<string, { alg: string; length: number }>;

/** The case as you would be looking at it with the cube held the way the algorithm assumes. */
const pictureOf = (setup: string): string =>
  isoSvg(applyAlg(applyAlg(SOLVED, setup), DISPLAY_ROTATION), { cell: 19 });

const BAND_LABEL: Record<SpeedBand, string> = {
  unseen: 'never had it',
  thin: `under ${ENOUGH_SAMPLES} reps`,
  quick: 'quick',
  fine: 'fine',
  middling: 'middling',
  slow: 'slow',
  worst: 'worst',
};

type Sort = 'cost' | 'slowest' | 'length' | 'reps';

export function mountF2LCases(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head">
      <h1>F2L cases</h1>
      <div class="actions">
        <label class="inline">Order by
          <select id="sort">
            <option value="cost">what it costs me</option>
            <option value="slowest">how slow I am at it</option>
            <option value="length">how long the algorithm is</option>
            <option value="reps">how little I have done it</option>
          </select>
        </label>
        <label class="inline"><input type="checkbox" id="only-known" /> only ones I have reps for</label>
      </div>
    </header>

    <section class="panel">
      <p class="hint" id="grip"></p>
      <div id="legend" class="legend"></div>
    </section>

    <div id="cards" class="case-grid"></div>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  let stats = new Map<string, CaseStat>();
  let typicalMs = 0;

  el('grip').textContent =
    `Every case below is drawn as you would be looking at it, and every algorithm is written for ` +
    `that same grip: ${gripSentence()}. The cross colour is underneath and the pair goes into the ` +
    `slot on your right. Hold the cube to match the picture and the moves are the moves to make.`;

  el('legend').innerHTML = (['quick', 'fine', 'middling', 'slow', 'worst', 'thin', 'unseen'] as
    SpeedBand[])
    .map((band) => `<span class="legend-key band-${band}">${BAND_LABEL[band]}</span>`)
    .join('');

  function sorted(): typeof CASES {
    const sort = el<HTMLSelectElement>('sort').value as Sort;
    const onlyKnown = el<HTMLInputElement>('only-known').checked;
    const list = onlyKnown ? CASES.filter((entry) => stats.get(entry.key)?.samples) : [...CASES];

    // A case you have no evidence about cannot be ranked against one you have, so it goes last
    // whatever the ordering, rather than pretending to be the best or the worst.
    const known = (key: string) => stats.get(key)?.samples ?? 0;
    return list.sort((a, b) => {
      if (sort === 'length') {
        return (SOLUTIONS[a.key]?.length ?? 99) - (SOLUTIONS[b.key]?.length ?? 99);
      }
      if (sort === 'reps') return known(a.key) - known(b.key);
      if (!known(a.key) !== !known(b.key)) return known(a.key) ? -1 : 1;
      const statA = stats.get(a.key);
      const statB = stats.get(b.key);
      if (sort === 'slowest') return (statB?.meanExecutionMs ?? 0) - (statA?.meanExecutionMs ?? 0);
      // What a case costs counts how often it turns up, which only real solves can say. Drill it
      // all you like and the cost stays nil, so the slower one goes first among equals rather than
      // leaving the order to chance.
      const cost = (statB?.lossPerSolveMs ?? 0) - (statA?.lossPerSolveMs ?? 0);
      return cost || (statB?.meanExecutionMs ?? 0) - (statA?.meanExecutionMs ?? 0);
    });
  }

  function render(): void {
    const cards = sorted().map((entry) => {
      const stat = stats.get(entry.key);
      const band = speedBand(stat, typicalMs);
      const solution = SOLUTIONS[entry.key];

      const numbers = stat?.samples
        ? `<span class="key">yours</span><span class="value">${formatMs(
            stat.meanExecutionMs,
          )} over ${stat.samples} rep${stat.samples === 1 ? '' : 's'}</span>`
        : `<span class="key">yours</span><span class="value dim">no reps yet</span>`;

      return `
        <article class="case-card band-${band}">
          <div class="case-art">${pictureOf(entry.setup)}</div>
          <div class="case-body">
            <p class="case-alg">${solution?.alg ?? '—'}</p>
            <p class="case-meta">
              <span class="case-band">${BAND_LABEL[band]}</span>
              <span class="dim">${solution?.length ?? '?'} moves</span>
            </p>
            <div class="detail">${numbers}</div>
            <p class="case-setup"><span class="dim">from solved, held as pictured:</span>
              ${inSolverNotation(entry.setup)}</p>
            <a class="case-drill" href="#f2l?case=${encodeURIComponent(entry.key)}">drill this</a>
          </div>
        </article>`;
    });

    el('cards').innerHTML = cards.join('');
    if (!cards.length) {
      el('cards').innerHTML =
        '<p class="hint">Nothing to show: no case has a rep against it yet. Untick the box above.</p>';
    }
  }

  el('sort').addEventListener('change', render);
  el('only-known').addEventListener('change', render);

  void (async () => {
    const [solves, drills] = await Promise.all([loadSolves(), loadDrills()]);
    const worked = f2lStatsWithTypical(solves, drills);
    stats = new Map(worked.cases.map((stat) => [stat.caseKey, stat]));
    typicalMs = worked.typicalMs;
    render();
  })();

  render();
  return () => {};
}
