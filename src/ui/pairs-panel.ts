/**
 * The letter-pair panel: click a pair anywhere it appears and this opens, your own image first,
 * then the bundled ideas, with a box to write or change your own.
 *
 * It is disabled from scramble confirmation until the end of a timed full solve, which is why
 * opening it goes through `setPairPanelEnabled`.
 */

import ideas from '../data/letter-pairs.json';
import { loadPairImages, savePairImage, type PairImages } from '../store';

const BUNDLED = ideas as Record<string, string[]>;

let enabled = true;
let mine: PairImages = {};
let panel: HTMLDialogElement | null = null;

export function setPairPanelEnabled(on: boolean): void {
  enabled = on;
}

export async function loadPairPanel(): Promise<void> {
  mine = await loadPairImages();
}

export const imageFor = (pair: string): string | undefined => mine[pair];

/** Turn a letter pair into a clickable chip. */
export function pairChip(pair: string, extraClass = ''): string {
  return `<button class="pair-chip ${extraClass}" data-pair="${pair}">${pair}</button>`;
}

/** Wire up every pair chip inside a container. */
export function wirePairChips(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('.pair-chip').forEach((chip) => {
    chip.addEventListener('click', () => openPairPanel(chip.dataset.pair!));
  });
}

function panelElement(): HTMLDialogElement {
  if (panel) return panel;
  const dialog = document.createElement('dialog');
  dialog.className = 'pair-panel';
  dialog.innerHTML = `
    <h2 id="pair-title"></h2>
    <label for="pair-mine">Your image</label>
    <input id="pair-mine" placeholder="Whatever you actually see" autocomplete="off" />
    <p class="hint">Yours always shows first, here and everywhere else.</p>
    <h3>Ideas</h3>
    <ul id="pair-ideas"></ul>
    <menu>
      <button id="pair-save" class="primary">Save</button>
      <button id="pair-close">Close</button>
    </menu>`;
  document.body.appendChild(dialog);
  panel = dialog;

  dialog.querySelector('#pair-close')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('#pair-save')!.addEventListener('click', async () => {
    const pair = dialog.dataset.pair!;
    const input = dialog.querySelector<HTMLInputElement>('#pair-mine')!;
    mine = await savePairImage(pair, input.value);
    dialog.close();
    document.dispatchEvent(new CustomEvent('pair-image-saved', { detail: { pair } }));
  });
  return dialog;
}

export function openPairPanel(pair: string): void {
  if (!enabled) return;
  const dialog = panelElement();
  dialog.dataset.pair = pair;
  dialog.querySelector('#pair-title')!.textContent = pair;
  dialog.querySelector<HTMLInputElement>('#pair-mine')!.value = mine[pair] ?? '';

  const list = dialog.querySelector('#pair-ideas')!;
  list.innerHTML = '';
  for (const idea of BUNDLED[pair] ?? []) {
    const item = document.createElement('li');
    item.textContent = idea;
    list.appendChild(item);
  }
  if (!BUNDLED[pair]) {
    const item = document.createElement('li');
    item.className = 'hint';
    item.textContent = 'No bundled ideas for this pair.';
    list.appendChild(item);
  }
  dialog.showModal();
}

export const bundledIdeas = BUNDLED;
