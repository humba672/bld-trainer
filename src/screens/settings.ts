/**
 * Settings: the cube's MAC, and getting your data out of this browser and back in again.
 *
 * Everything lives in this browser's IndexedDB, so it goes if you clear site data or change
 * browser. The export is the only way back.
 */

import { onCubeChange, setAutoConnect, setNote, state, tracker } from '../session';
import { eraseAll, exportAll, forgetMac, importAll, loadTracing } from '../store';

export function mountSettings(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head"><h1>Settings</h1></header>

    <section class="panel">
      <h2>Cube</h2>
      <div id="cube-rows" class="details"></div>
      <div class="controls">
        <label><input type="checkbox" id="auto" /> Connect by itself when the page opens</label>
      </div>
      <div class="controls">
        <label for="window">Slice pairing window</label>
        <input id="window" type="range" min="40" max="400" step="10" />
        <output id="window-out"></output>
        <button id="forget-mac">Forget the MAC address</button>
      </div>
      <p class="hint">
        Two opposite face turns closer together than this are read as one slice move. 120 ms was
        confirmed against the cube.
      </p>
    </section>

    <section class="panel">
      <h2>Your data</h2>
      <div id="data-rows" class="details"></div>
      <div class="controls">
        <button id="export" class="primary">Export to a file</button>
        <button id="import">Import from a file</button>
        <input id="file" type="file" accept="application/json" hidden />
      </div>
      <p class="hint">
        Everything is kept in this browser and nowhere else. Export after every 50 solves, or
        before clearing site data.
      </p>
      <div class="controls">
        <button id="erase" class="danger">Erase everything</button>
        <span id="erase-confirm" class="hint" hidden>Press again within five seconds to erase.</span>
      </div>
      <p id="data-note" class="note" hidden></p>
    </section>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  const windowInput = el<HTMLInputElement>('window');
  windowInput.value = String(tracker.pairWindowMs);
  el('window-out').textContent = `${tracker.pairWindowMs} ms`;
  windowInput.addEventListener('input', () => {
    tracker.pairWindowMs = Number(windowInput.value);
    el('window-out').textContent = `${windowInput.value} ms`;
  });

  const autoBox = el<HTMLInputElement>('auto');
  autoBox.addEventListener('change', () => void setAutoConnect(autoBox.checked));

  el('forget-mac').addEventListener('click', async () => {
    await forgetMac();
    state.savedMac = null;
    state.macSource = null;
    setNote('MAC address forgotten.');
    render();
  });

  function say(text: string): void {
    const note = el('data-note');
    note.hidden = false;
    note.textContent = text;
  }

  el('export').addEventListener('click', async () => {
    const backup = await exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bld-trainer-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    say(`Exported ${Object.keys(backup.data).length} records.`);
  });

  el('import').addEventListener('click', () => el<HTMLInputElement>('file').click());
  el<HTMLInputElement>('file').addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const restored = await importAll(JSON.parse(await file.text()));
      say(`Restored ${restored} records. Reload to see them everywhere.`);
      render();
    } catch (error) {
      say(`Could not import that: ${(error as Error).message}`);
    }
  });

  let eraseArmed = 0;
  el('erase').addEventListener('click', async () => {
    const now = Date.now();
    if (now - eraseArmed > 5000) {
      eraseArmed = now;
      el('erase-confirm').hidden = false;
      setTimeout(() => (el('erase-confirm').hidden = true), 5000);
      return;
    }
    await eraseAll();
    eraseArmed = 0;
    el('erase-confirm').hidden = true;
    say('Everything erased. Reload the page to start clean.');
  });

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

  async function render(): Promise<void> {
    autoBox.checked = state.autoConnect;
    rows(el('cube-rows'), [
      ['MAC address', state.savedMac ? `${state.savedMac} (${state.macSource ?? 'saved'})` : 'not known yet'],
      ['Cube', state.info.deviceName ?? 'not connected'],
      ['Protocol', state.info.generation ?? 'unknown'],
    ]);

    const backup = await exportAll();
    const tracing = await loadTracing();
    rows(el('data-rows'), [
      ['Records stored', String(Object.keys(backup.data).length)],
      ['Tracing attempts', String(tracing.length)],
      ['Kept in', "this browser's IndexedDB"],
    ]);
  }

  void render();
  return onCubeChange(() => void render());
}
