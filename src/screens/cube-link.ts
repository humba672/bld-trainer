/**
 * The cube link screen from phase 0: connect, watch every turn being read, and see the cube on
 * screen. It is still the place to prove the link is behaving before a solve.
 */

import { TwistyPlayer } from 'cubing/twisty';

import { invertAlg } from '../cube/cube';
import { type Face, type WireTurn } from '../cube/tracker';
import {
  applyMissingTurns,
  bluetoothSupported,
  connect,
  declareSolved,
  disconnect,
  feedTurn,
  onCubeChange,
  reconnect,
  rememberSupported,
  restart,
  setAutoConnect,
  setNote,
  state,
  tracker,
  verify,
  isConnected,
} from '../session';
import { forgetMac } from '../store';

const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

const DEMO: Array<{ label: string; title: string; turns: Array<[Face, 1 | -1]> }> = [
  ...FACES.flatMap((face) => [
    { label: face, title: `The cube reports ${face}`, turns: [[face, 1] as [Face, 1 | -1]] },
    { label: `${face}'`, title: `The cube reports ${face}'`, turns: [[face, -1] as [Face, 1 | -1]] },
  ]),
  { label: 'M', title: "Reaches the cube as R and L'", turns: [['R', 1], ['L', -1]] },
  { label: "M'", title: "Reaches the cube as R' and L", turns: [['R', -1], ['L', 1]] },
  { label: 'E', title: "Reaches the cube as U and D'", turns: [['U', 1], ['D', -1]] },
  { label: 'S', title: "Reaches the cube as B and F'", turns: [['B', 1], ['F', -1]] },
];

export function mountCubeLink(container: HTMLElement): () => void {
  container.innerHTML = `
    <header class="screen-head">
      <h1>Cube link</h1>
      <div class="chips">
        <span id="generation" class="chip" hidden></span>
        <span id="gyro" class="chip" hidden></span>
        <span id="verified" class="chip good" hidden></span>
        <span id="drift" class="chip bad" hidden></span>
      </div>
      <div class="actions">
        <button id="reconnect" class="primary" hidden>Reconnect</button>
        <button id="connect" class="primary">Connect cube</button>
        <button id="disconnect" hidden>Disconnect</button>
        <button id="solved">Cube is solved</button>
        <button id="check" disabled>Check against cube</button>
      </div>
    </header>

    <p id="note" class="note" hidden></p>

    <section id="connect-help" class="details">
      <label id="auto-connect-row" hidden>
        <input type="checkbox" id="auto-connect" /> Connect to this cube by itself when the page opens
      </label>
      <span class="hint">Turn a face to wake the cube before connecting, or it can take ten seconds to appear.</span>
      <span id="remember-hint" class="hint" hidden></span>
    </section>

    <section id="details" class="details"></section>

    <div class="two-up">
      <section class="panel picture">
        <h2>Your cube</h2>
        <div id="player-slot" class="player-slot"></div>
        <div class="controls">
          <span class="label">Picture</span>
          <button id="view-3d" class="toggle on">3D</button>
          <button id="view-2d" class="toggle">Flat net</button>
          <span class="label">Frame</span>
          <button id="frame-holder" class="toggle on">In your hands</button>
          <button id="frame-cube" class="toggle">Cube's own</button>
        </div>
        <div class="controls">
          <span class="label">Last move</span>
          <button id="wide">Was wide (W)</button>
          <button id="unwide">Was not wide (⇧W)</button>
          <span id="wide-hint" class="hint"></span>
        </div>
      </section>

      <section class="panel log">
        <h2>Moves <span id="move-count" class="count"></span></h2>
        <div class="controls">
          <label for="window">Slice pairing window</label>
          <input id="window" type="range" min="40" max="400" step="10" value="120" />
          <output id="window-out">120 ms</output>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Gap</th><th>Cube reported</th><th>You turned</th><th>Read as</th></tr></thead>
            <tbody id="log-body"></tbody>
          </table>
        </div>
        <div id="pending" class="pending" hidden></div>
        <div class="controls">
          <button id="clear-log">Clear the log</button>
        </div>
      </section>
    </div>

    <section class="panel demo">
      <h2>Try it without the cube</h2>
      <p class="hint">These send exactly what the cube would report, so the reading path can be checked with no cube in your hands.</p>
      <div id="demo-buttons" class="demo-buttons"></div>
    </section>`;

  const el = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

  let view: '3D' | '2D' = '3D';
  let frame: 'holder' | 'cube' = 'holder';

  const player = new TwistyPlayer({
    puzzle: '3x3x3',
    visualization: '3D',
    background: 'none',
    controlPanel: 'none',
    hintFacelets: 'none',
    backView: 'top-right',
    alg: '',
  });
  el('player-slot').appendChild(player);

  el('connect').addEventListener('click', () => void connect());
  el('reconnect').addEventListener('click', () => void reconnect());
  el('disconnect').addEventListener('click', () => void disconnect());
  el('solved').addEventListener('click', () => void declareSolved());
  el('check').addEventListener('click', () => void verify(true));
  el('clear-log').addEventListener('click', () => restart());

  const autoBox = el<HTMLInputElement>('auto-connect');
  autoBox.addEventListener('change', () => void setAutoConnect(autoBox.checked));

  el('wide').addEventListener('click', () => {
    const marked = tracker.markWide();
    setNote(marked ? `Read as ${marked.move}.` : 'The last move was a slice, so it cannot be wide.');
    render();
  });
  el('unwide').addEventListener('click', () => {
    const plain = tracker.unmarkWide();
    setNote(plain ? `Read as ${plain.move} again.` : 'No wide move to take back.');
    render();
  });

  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (event.key === 'w') el('wide').click();
    if (event.key === 'W') el('unwide').click();
  };
  document.addEventListener('keydown', onKey);

  const windowInput = el<HTMLInputElement>('window');
  windowInput.value = String(tracker.pairWindowMs);
  el('window-out').textContent = `${tracker.pairWindowMs} ms`;
  windowInput.addEventListener('input', () => {
    tracker.pairWindowMs = Number(windowInput.value);
    el('window-out').textContent = `${windowInput.value} ms`;
  });

  for (const [id, apply] of [
    ['view-3d', () => (view = '3D')],
    ['view-2d', () => (view = '2D')],
    ['frame-holder', () => (frame = 'holder')],
    ['frame-cube', () => (frame = 'cube')],
  ] as const) {
    el(id).addEventListener('click', () => {
      apply();
      render();
    });
  }

  const demoRow = el('demo-buttons');
  for (const { label, title, turns } of DEMO) {
    const button = document.createElement('button');
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', () => {
      const now = performance.now();
      turns.forEach(([face, dir], i) => feedTurn({ face, dir, t: now + i * 8 } as WireTurn));
    });
    demoRow.appendChild(button);
  }

  function chip(id: string, text: string | null, kind = ''): void {
    const node = el(id);
    node.hidden = text === null;
    node.textContent = text ?? '';
    node.className = `chip ${kind}`.trim();
  }

  function render(): void {
    const { info, lastCheck, missing, note, savedMac, macSource } = state;

    chip('generation', info.generation ? `Protocol ${info.generation}` : null);
    chip(
      'gyro',
      info.gyroSupported === undefined
        ? null
        : info.gyroSeen
          ? 'Gyroscope: sending data'
          : info.gyroSupported
            ? 'Gyroscope: reported, none seen'
            : 'No gyroscope',
      info.gyroSeen ? 'good' : '',
    );
    chip(
      'verified',
      lastCheck?.matched
        ? `Matches the cube · ${Math.max(0, Math.round((Date.now() - lastCheck.at) / 1000))}s ago`
        : null,
      'good',
    );
    chip('drift', lastCheck && !lastCheck.matched ? 'Tracking has drifted' : null, 'bad');

    el('connect').hidden = isConnected();
    el('disconnect').hidden = !isConnected();
    el<HTMLButtonElement>('check').disabled = !isConnected();

    const noteNode = el('note');
    noteNode.hidden = note === '';
    noteNode.textContent = note;

    // Connecting help
    const offerReconnect = !!state.remembered && !isConnected() && !state.connecting;
    const reconnectButton = el<HTMLButtonElement>('reconnect');
    reconnectButton.hidden = !offerReconnect;
    reconnectButton.textContent = `Reconnect to ${state.remembered?.name ?? 'your cube'}`;
    el('connect').classList.toggle('primary', !offerReconnect);
    el('connect').textContent = offerReconnect ? 'Pick a different cube' : 'Connect cube';
    el('auto-connect-row').hidden = !state.remembered;
    autoBox.checked = state.autoConnect;
    const needsFlag = bluetoothSupported() && !rememberSupported();
    const rememberHint = el('remember-hint');
    rememberHint.hidden = !needsFlag;
    rememberHint.textContent = needsFlag
      ? 'To skip the device dialog for good: open chrome://flags/#enable-web-bluetooth-new-permissions-backend, turn it on, restart Chrome, and connect once more.'
      : '';
    el('connect-help').hidden = isConnected();

    // Details
    const rows: Array<[string, string]> = [];
    if (info.deviceName) rows.push(['Cube', info.deviceName]);
    if (info.generation) rows.push(['Protocol generation', info.generation]);
    if (info.hardwareName) rows.push(['Hardware', info.hardwareName]);
    if (info.softwareVersion) rows.push(['Firmware', info.softwareVersion]);
    if (savedMac) rows.push(['MAC address', `${savedMac} (${macSource ?? 'saved'})`]);
    if (isConnected()) rows.push(['Checking', 'automatically every 2s']);
    if (state.lostSinceCheck) rows.push(['Turns Bluetooth dropped', String(state.lostSinceCheck)]);
    if (state.garbledReadings) rows.push(['Garbled readings ignored', String(state.garbledReadings)]);

    const details = el('details');
    details.innerHTML = '';
    for (const [key, value] of rows) {
      const item = document.createElement('div');
      item.className = 'detail';
      item.innerHTML = '<span class="key"></span><span class="value"></span>';
      item.querySelector('.key')!.textContent = key;
      item.querySelector('.value')!.textContent = value;
      details.appendChild(item);
    }
    if (savedMac) {
      const clear = document.createElement('button');
      clear.textContent = 'Forget the MAC address';
      clear.addEventListener('click', async () => {
        await forgetMac();
        state.savedMac = null;
        state.macSource = null;
        setNote('MAC address forgotten. You will be asked for it next time.');
        render();
      });
      details.appendChild(clear);
    }
    if (lastCheck && !lastCheck.matched) {
      const warning = document.createElement('div');
      warning.className = 'mismatch';
      const headline = document.createElement('p');
      headline.textContent =
        missing && missing.turns.length
          ? `The cube has turns the picture never got: ${missing.notation}.`
          : 'The cube reports a different state, and too much is missing to work out what.';
      warning.appendChild(headline);
      if (missing && missing.turns.length) {
        const repair = document.createElement('button');
        repair.className = 'primary';
        repair.textContent = `Add the missing ${missing.notation}`;
        repair.addEventListener('click', () => applyMissingTurns(missing));
        warning.appendChild(repair);
      }
      const adopt = document.createElement('button');
      adopt.textContent = "Start again from the cube's state";
      adopt.addEventListener('click', () => restart(lastCheck.reported));
      warning.appendChild(adopt);
      details.appendChild(warning);
    }
    details.hidden = details.childElementCount === 0;

    // Log
    const body = el('log-body');
    body.innerHTML = '';
    let previous: number | null = null;
    for (const entry of tracker.entries) {
      const row = document.createElement('tr');
      row.className = entry.kind;
      const gap = previous === null ? '' : `${Math.round(entry.t - previous)} ms`;
      previous = entry.t;
      for (const text of [
        String(entry.n),
        gap,
        entry.wire.join(' '),
        entry.move,
        entry.kind === 'face' ? 'face turn' : entry.kind === 'slice' ? 'slice' : 'wide move',
      ]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
    const wrap = container.querySelector('.table-wrap')!;
    wrap.scrollTop = wrap.scrollHeight;
    el('move-count').textContent = tracker.entries.length ? `${tracker.entries.length} read` : '';

    const pending = el('pending');
    pending.hidden = tracker.pending.length === 0;
    pending.textContent = tracker.pending.length
      ? `Holding ${tracker.pending.map((t) => t.face + (t.dir === -1 ? "'" : '')).join(' ')} for a moment…`
      : '';

    const last = tracker.entries[tracker.entries.length - 1];
    el('wide-hint').textContent = !last
      ? ''
      : last.kind === 'slice'
        ? `${last.move} is a slice — it cannot be a wide move.`
        : last.kind === 'wide'
          ? `${last.move} — press ⇧W to read it as a plain turn again.`
          : `${last.move} would be ${wideNameFor(last.move)} if it was wide.`;

    el('view-3d').classList.toggle('on', view === '3D');
    el('view-2d').classList.toggle('on', view === '2D');
    el('frame-holder').classList.toggle('on', frame === 'holder');
    el('frame-cube').classList.toggle('on', frame === 'cube');

    player.visualization = view;
    player.backView = view === '3D' ? 'top-right' : 'none';
    const correction = frame === 'cube' ? invertAlg(tracker.coreRotation()) : '';
    player.experimentalSetupAlg = `${tracker.alg()} ${correction}`.trim();
  }

  const stop = onCubeChange(render);
  render();

  return () => {
    stop();
    document.removeEventListener('keydown', onKey);
  };
}

function wideNameFor(move: string): string {
  const opposite: Record<string, string> = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
  if (move.includes('w')) return move;
  return `${opposite[move[0]] ?? move[0]}w${move.endsWith("'") ? "'" : ''}`;
}
