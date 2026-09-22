/**
 * Every letter pair in one grid, with your own image and the bundled ideas, so images can be
 * worked through deliberately rather than only when a drill happens to throw one up.
 */

import { LETTERS } from '../bld/speffz';
import { bundledIdeas, imageFor, loadPairPanel, openPairPanel } from '../ui/pairs-panel';

const ALL_PAIRS = LETTERS.flatMap((first) =>
  LETTERS.filter((second) => second !== first).map((second) => first + second),
);

export function mountLetterPairs(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head">
      <h1>Letter pairs</h1>
      <div class="chips"><span id="mine-count" class="chip"></span></div>
    </header>
    <div class="controls">
      <label for="filter">Show</label>
      <select id="filter">
        <option value="all">All 552</option>
        <option value="mine">Ones I have written</option>
        <option value="unwritten">Ones I have not</option>
      </select>
      <input id="search" placeholder="Jump to a pair, e.g. DF" autocomplete="off" maxlength="2" />
    </div>
    <div id="grid" class="pair-grid"></div>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  function render(): void {
    const filter = el<HTMLSelectElement>('filter').value;
    const search = el<HTMLInputElement>('search').value.toUpperCase();
    const grid = el('grid');
    grid.innerHTML = '';

    let shown = 0;
    let mineCount = 0;
    for (const pair of ALL_PAIRS) {
      const mine = imageFor(pair);
      if (mine) mineCount += 1;
      if (filter === 'mine' && !mine) continue;
      if (filter === 'unwritten' && mine) continue;
      if (search && !pair.startsWith(search)) continue;

      const card = document.createElement('button');
      card.className = `pair-card${mine ? ' has-mine' : ''}`;
      card.innerHTML = `<span class="pair-name"></span><span class="pair-image"></span>`;
      card.querySelector('.pair-name')!.textContent = pair;
      card.querySelector('.pair-image')!.textContent = mine ?? bundledIdeas[pair]?.[0] ?? '—';
      card.addEventListener('click', () => openPairPanel(pair));
      grid.appendChild(card);
      shown += 1;
    }

    el('mine-count').textContent = `${mineCount} of 552 written by you`;
    if (shown === 0) {
      grid.innerHTML = '<p class="hint">Nothing matches that.</p>';
    }
  }

  el('filter').addEventListener('change', render);
  el('search').addEventListener('input', render);
  const onSaved = () => void loadPairPanel().then(render);
  document.addEventListener('pair-image-saved', onSaved);

  void loadPairPanel().then(render);

  return () => document.removeEventListener('pair-image-saved', onSaved);
}
