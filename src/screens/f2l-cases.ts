/**
 * Every F2L case at once: how to hold it, what to turn, and how you are doing on it.
 *
 * The driller hands you one case at a time and decides which. This is the other half - all
 * forty-one laid out, gathered under how much they are costing you, so you can see the shape of
 * your F2L rather than being fed it.
 *
 * What is printed is not the shortest algorithm but the quickest to turn: a face you cannot reach
 * without letting go of the cube is worth about two you can, so a longer way round often wins, and
 * so does turning the cube a quarter first. The picture is drawn in the grip the moves are written
 * for, which makes the picture half the instruction.
 */

import { SOLVED, applyAlg } from '../cube/cube';
import { enumerateF2LCases } from '../timer/cfop';
import { DISPLAY_ROTATION, gripSentence, inSolverNotation } from '../timer/f2l-solve';
import { bestExecution, type Execution } from '../timer/execution';
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
const SOLUTIONS = solutionData as Record<
  string,
  { alg: string; length: number; options: string[] }
>;

/** Worked out once: the same answer every time the screen is opened. */
const EXECUTION = new Map<string, Execution>(
  CASES.map((entry) => [
    entry.key,
    bestExecution(SOLUTIONS[entry.key]?.options ?? [], DISPLAY_ROTATION),
  ]),
);

/** The case as you would be looking at it with the cube held the way the moves are written. */
const pictureOf = (setup: string): string =>
  isoSvg(applyAlg(applyAlg(SOLVED, setup), DISPLAY_ROTATION), { cell: 14 });

/** Worst first: the order they are worth your attention in. */
const BANDS: SpeedBand[] = ['worst', 'slow', 'middling', 'fine', 'quick', 'thin', 'unseen'];

const BAND_TITLE: Record<SpeedBand, string> = {
  worst: 'Costing you most',
  slow: 'Slow',
  middling: 'Middling',
  fine: 'Fine',
  quick: 'Quick',
  thin: `Fewer than ${ENOUGH_SAMPLES} reps`,
  unseen: 'Never come up',
};

type Sort = 'cost' | 'slowest' | 'length';

export function mountF2LCases(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head">
      <h1>F2L cases</h1>
      <div class="actions">
        <label class="inline">Order
          <select id="sort">
            <option value="cost">by what it costs me</option>
            <option value="slowest">by how slow I am</option>
            <option value="length">by how quick it is to turn</option>
          </select>
        </label>
        <label class="inline"><input type="checkbox" id="details" /> setups</label>
        <label class="inline"><input type="checkbox" id="only-known" /> only ones I have done</label>
      </div>
    </header>

    <p class="lede" id="grip"></p>
    <div id="groups"></div>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  let stats = new Map<string, CaseStat>();
  let typicalMs = 0;

  el('grip').textContent =
    `Hold the cube to match the pictures — ${gripSentence()} — and the moves beside them are the ` +
    `moves to make. Where turning the cube a quarter first saves a regrip, the turn is written in.`;

  function ordered(entries: typeof CASES): typeof CASES {
    const sort = el<HTMLSelectElement>('sort').value as Sort;
    return [...entries].sort((a, b) => {
      if (sort === 'length') return EXECUTION.get(a.key)!.cost - EXECUTION.get(b.key)!.cost;
      const statA = stats.get(a.key);
      const statB = stats.get(b.key);
      if (sort === 'slowest') return (statB?.meanExecutionMs ?? 0) - (statA?.meanExecutionMs ?? 0);
      // Cost counts how often a case turns up, which only real solves can say. Among cases that
      // have never cost anything measurable, the slower one still goes first.
      const cost = (statB?.lossPerSolveMs ?? 0) - (statA?.lossPerSolveMs ?? 0);
      return cost || (statB?.meanExecutionMs ?? 0) - (statA?.meanExecutionMs ?? 0);
    });
  }

  function cardFor(entry: (typeof CASES)[number]): string {
    const stat = stats.get(entry.key);
    const execution = EXECUTION.get(entry.key)!;
    const shortest = SOLUTIONS[entry.key];

    const turn = execution.rotation ? `<i class="turn">${execution.rotation}</i> ` : '';
    const facts = [
      stat?.samples ? `${formatMs(stat.meanExecutionMs)} over ${stat.samples} reps` : 'no reps yet',
      `${execution.length} moves`,
    ];
    if (execution.regrips) facts.push(`<span class="warn">regrip</span>`);

    // The shortest algorithm is worth knowing when it is not the one printed: it is the one every
    // alg sheet will show you, and seeing both is how the trade makes sense.
    const alsoShortest =
      shortest && shortest.alg !== execution.alg
        ? `<p class="case-aside">shortest ${shortest.alg}</p>`
        : '';

    return `
      <article class="case">
        <div class="case-art">${pictureOf(entry.setup)}</div>
        <div class="case-body">
          <p class="case-alg">${turn}${execution.alg}</p>
          <p class="case-facts">${facts.join(' &middot; ')}</p>
          <div class="case-extra">
            ${alsoShortest}
            <p class="case-aside">from solved ${inSolverNotation(entry.setup)}</p>
          </div>
        </div>
        <a class="case-drill" href="#f2l?case=${encodeURIComponent(entry.key)}">drill</a>
      </article>`;
  }

  function render(): void {
    const onlyKnown = el<HTMLInputElement>('only-known').checked;
    const shown = onlyKnown ? CASES.filter((entry) => stats.get(entry.key)?.samples) : CASES;

    const sections = BANDS.map((band) => {
      const inBand = ordered(
        shown.filter((entry) => speedBand(stats.get(entry.key), typicalMs) === band),
      );
      if (!inBand.length) return '';
      return `
        <section class="case-group band-${band}">
          <h2>${BAND_TITLE[band]}<span class="count">${inBand.length}</span></h2>
          <div class="case-grid">${inBand.map(cardFor).join('')}</div>
        </section>`;
    }).filter(Boolean);

    el('groups').innerHTML =
      sections.join('') ||
      '<p class="lede">Nothing here yet — untick "only ones I have done" to see all forty-one.</p>';
  }

  el('sort').addEventListener('change', render);
  el('only-known').addEventListener('change', render);
  el('details').addEventListener('change', () => {
    container.classList.toggle('with-details', el<HTMLInputElement>('details').checked);
  });

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
