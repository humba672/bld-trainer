/**
 * Phase 0: the cube link. Connect, read every turn, show the cube on screen, and prove that the
 * picture follows the cube in your hands.
 */

import { TwistyPlayer } from 'cubing/twisty';
import { del, get, set } from 'idb-keyval';

import { SOLVED, equalUpToRotation, invertAlg } from './cube/cube';
import { CubeLink, bluetoothAvailable, type CubeInfo } from './cube/gan';
import { CubeTracker, type Face, type WireTurn } from './cube/tracker';

const MAC_KEY = 'cube-mac';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const tracker = new CubeTracker({ pairWindowMs: 120 });

let info: Partial<CubeInfo> = {};
let macSource: 'saved' | 'read from the cube' | 'typed in' | null = null;
let savedMac: string | null = null;
let adoptedCubeState = false;
let lastCheck: { at: number; matched: boolean; reported: string } | null = null;
let note = '';
let view: '3D' | '2D' = '3D';
let frame: 'holder' | 'cube' = 'holder';

// ---------------------------------------------------------------- the picture

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

function renderPicture(): void {
  const alg = tracker.alg();
  const correction = frame === 'cube' ? invertAlg(tracker.coreRotation()) : '';
  player.visualization = view;
  player.backView = view === '3D' ? 'top-right' : 'none';
  player.experimentalSetupAlg = `${alg} ${correction}`.trim();
}

// ---------------------------------------------------------------- the link

const link = new CubeLink({
  onTurn: (turn) => {
    tracker.onWire(turn);
    render();
  },
  onInfo: (update) => {
    info = { ...info, ...update };
    render();
  },
  onFacelets: (facelets) => {
    if (!adoptedCubeState) {
      // Start from the cube as it really is, not from a hopeful solved state.
      adoptedCubeState = true;
      tracker.reset(facelets);
      setNote(
        facelets === SOLVED
          ? 'Connected. The cube says it is solved — hold it white top, green front.'
          : 'Connected. Adopted the state the cube reports; hold it white top, green front.',
      );
    } else {
      lastCheck = {
        at: Date.now(),
        matched: facelets === tracker.cubeFacelets(),
        reported: facelets,
      };
    }
    render();
  },
  onDisconnect: () => {
    info = {};
    macSource = null;
    adoptedCubeState = false;
    setNote('The cube disconnected.');
    render();
  },
  onNote: setNote,
});

async function askForMac(deviceName: string): Promise<string | null> {
  const dialog = el<HTMLDialogElement>('mac-dialog');
  const input = el<HTMLInputElement>('mac-input');
  const error = el('mac-error');
  input.value = savedMac ?? '';
  error.hidden = true;
  dialog.querySelector('h2')!.textContent = `MAC address for ${deviceName}`;

  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      if (dialog.returnValue !== 'save') return resolve(null);
      const cleaned = input.value.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
      if (cleaned.length !== 12) {
        error.hidden = false;
        dialog.showModal();
        dialog.addEventListener('close', onClose);
        return;
      }
      resolve(cleaned.match(/.{2}/g)!.join(':'));
    };
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

async function connect(): Promise<void> {
  if (!bluetoothAvailable()) {
    setNote('This browser has no Web Bluetooth. Use Chrome or Edge on the desktop.');
    return render();
  }
  setNote('Pick your cube in the browser’s device list…');
  render();
  try {
    await link.connect(async (device, isFallback) => {
      savedMac = (await get<string>(MAC_KEY)) ?? null;
      if (savedMac) {
        macSource = 'saved';
        return savedMac;
      }
      if (!isFallback) return null; // let the library try to read it from the advertisement
      const typed = await askForMac(device.name ?? 'the cube');
      if (typed) {
        await set(MAC_KEY, typed);
        savedMac = typed;
        macSource = 'typed in';
      }
      return typed;
    });
    if (!macSource) macSource = 'read from the cube';
  } catch (error) {
    setNote(`Could not connect: ${(error as Error).message ?? String(error)}`);
  }
  render();
}

// ---------------------------------------------------------------- controls

el('connect').addEventListener('click', connect);
el('disconnect').addEventListener('click', () => void link.disconnect());

el('solved').addEventListener('click', async () => {
  tracker.reset(SOLVED);
  lastCheck = null;
  adoptedCubeState = true;
  if (link.connected) await link.declareSolved();
  setNote('Tracking restarted from a solved cube, white top and green front.');
  render();
});

el('check').addEventListener('click', async () => {
  if (!link.connected) return;
  setNote('Asked the cube for its own state…');
  render();
  await link.requestFacelets();
  await link.requestBattery();
});

el('clear-log').addEventListener('click', () => {
  tracker.reset(SOLVED);
  lastCheck = null;
  render();
});

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

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (event.key === 'w') el('wide').click();
  if (event.key === 'W') el('unwide').click();
});

const windowInput = el<HTMLInputElement>('window');
windowInput.addEventListener('input', () => {
  tracker.pairWindowMs = Number(windowInput.value);
  el('window-out').textContent = `${windowInput.value} ms`;
});

for (const [id, set_] of [
  ['view-3d', () => (view = '3D')],
  ['view-2d', () => (view = '2D')],
  ['frame-holder', () => (frame = 'holder')],
  ['frame-cube', () => (frame = 'cube')],
] as const) {
  el(id).addEventListener('click', () => {
    set_();
    render();
  });
}

// ---------------------------------------------------------------- demo panel

const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

const demoButtons: Array<{ label: string; title: string; turns: Array<[Face, 1 | -1]> }> = [
  ...FACES.flatMap((face) => [
    { label: face, title: `The cube reports ${face}`, turns: [[face, 1] as [Face, 1 | -1]] },
    { label: `${face}'`, title: `The cube reports ${face}'`, turns: [[face, -1] as [Face, 1 | -1]] },
  ]),
  { label: 'M', title: "Reaches the cube as R and L'", turns: [['R', 1], ['L', -1]] },
  { label: "M'", title: "Reaches the cube as R' and L", turns: [['R', -1], ['L', 1]] },
  { label: 'E', title: "Reaches the cube as U and D'", turns: [['U', 1], ['D', -1]] },
  { label: 'S', title: "Reaches the cube as B and F'", turns: [['B', 1], ['F', -1]] },
];

const demoRow = el('demo-buttons');
for (const { label, title, turns } of demoButtons) {
  const button = document.createElement('button');
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', () => {
    const now = performance.now();
    turns.forEach(([face, dir], i) => {
      const turn: WireTurn = { face, dir, t: now + i * 8 };
      tracker.onWire(turn);
    });
    render();
  });
  demoRow.appendChild(button);
}

// ---------------------------------------------------------------- rendering

function setNote(text: string): void {
  note = text;
}

function chip(id: string, text: string | null, kind = ''): void {
  const node = el(id);
  node.hidden = text === null;
  node.textContent = text ?? '';
  node.className = `chip ${kind}`.trim();
}

function renderHeader(): void {
  const state = el('link-state');
  state.textContent = link.connected ? `Connected · ${info.deviceName ?? 'cube'}` : 'Disconnected';
  state.className = `chip ${link.connected ? 'on' : 'off'}`;

  chip('battery', info.battery === undefined ? null : `Battery ${info.battery}%`,
    info.battery !== undefined && info.battery < 20 ? 'bad' : '');
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
  chip('drift', lastCheck && !lastCheck.matched ? 'Tracking has drifted' : null, 'bad');

  el('connect').hidden = link.connected;
  el('disconnect').hidden = !link.connected;
  el<HTMLButtonElement>('check').disabled = !link.connected;

  const noteNode = el('note');
  noteNode.hidden = note === '';
  noteNode.textContent = note;
}

function renderDetails(): void {
  const rows: Array<[string, string]> = [];
  if (info.deviceName) rows.push(['Cube', info.deviceName]);
  if (info.generation) rows.push(['Protocol generation', info.generation]);
  if (info.hardwareName) rows.push(['Hardware', info.hardwareName]);
  if (info.hardwareVersion) rows.push(['Hardware version', info.hardwareVersion]);
  if (info.softwareVersion) rows.push(['Firmware', info.softwareVersion]);
  if (info.productDate) rows.push(['Made', info.productDate]);
  if (info.gyroSupported !== undefined) {
    rows.push(['Gyroscope', info.gyroSupported ? 'reported as supported' : 'not supported']);
  }
  if (savedMac) rows.push(['MAC address', `${savedMac} (${macSource ?? 'saved'})`]);
  if (lastCheck) {
    rows.push([
      'Last check against the cube',
      lastCheck.matched
        ? `every turn read correctly, ${new Date(lastCheck.at).toLocaleTimeString()}`
        : `MISMATCH at ${new Date(lastCheck.at).toLocaleTimeString()}`,
    ]);
  }

  const details = el('details');
  details.innerHTML = '';
  for (const [key, value] of rows) {
    const item = document.createElement('div');
    item.className = 'detail';
    item.innerHTML = `<span class="key"></span><span class="value"></span>`;
    item.querySelector('.key')!.textContent = key;
    item.querySelector('.value')!.textContent = value;
    details.appendChild(item);
  }

  if (savedMac) {
    const clear = document.createElement('button');
    clear.textContent = 'Forget the MAC address';
    clear.addEventListener('click', async () => {
      await del(MAC_KEY);
      savedMac = null;
      macSource = null;
      setNote('MAC address forgotten. You will be asked for it next time.');
      render();
    });
    details.appendChild(clear);
  }

  if (lastCheck && !lastCheck.matched) {
    const warning = document.createElement('div');
    warning.className = 'mismatch';
    warning.innerHTML =
      '<p>The cube reports a different state from the one tracked here, so a turn was missed or misread.</p>';
    const tracked = document.createElement('code');
    tracked.textContent = `tracked ${tracker.cubeFacelets()}`;
    const reported = document.createElement('code');
    reported.textContent = `cube    ${lastCheck.reported}`;
    const adopt = document.createElement('button');
    adopt.textContent = "Start again from the cube's state";
    adopt.addEventListener('click', () => {
      tracker.reset(lastCheck!.reported);
      lastCheck = null;
      setNote("Restarted from the cube's own state. Hold it white top, green front.");
      render();
    });
    warning.append(tracked, reported, adopt);
    details.appendChild(warning);
  }

  details.hidden = details.childElementCount === 0;
}

function renderLog(): void {
  const body = el('log-body');
  const entries = tracker.entries;
  body.innerHTML = '';
  let previous: number | null = null;
  for (const entry of entries) {
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
  const wrap = document.querySelector('.table-wrap')!;
  wrap.scrollTop = wrap.scrollHeight;

  el('move-count').textContent = entries.length ? `${entries.length} read` : '';

  const pending = el('pending');
  pending.hidden = tracker.pending.length === 0;
  pending.textContent = tracker.pending.length
    ? `Holding ${tracker.pending
        .map((turn) => turn.face + (turn.dir === -1 ? "'" : ''))
        .join(' ')} for a moment, in case it is half of a slice…`
    : '';

  const last = entries[entries.length - 1];
  el('wide-hint').textContent = !last
    ? ''
    : last.kind === 'slice'
      ? `${last.move} is a slice — it cannot be a wide move.`
      : last.kind === 'wide'
        ? `${last.move} — press ⇧W to read it as a plain turn again.`
        : `${last.move} would be ${wideNameFor(last.move)} if it was wide.`;
}

function wideNameFor(move: string): string {
  const opposite: Record<string, string> = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
  const face = move[0];
  if (move.includes('w')) return move;
  return `${opposite[face] ?? face}w${move.endsWith("'") ? "'" : ''}`;
}

function renderToggles(): void {
  el('view-3d').classList.toggle('on', view === '3D');
  el('view-2d').classList.toggle('on', view === '2D');
  el('frame-holder').classList.toggle('on', frame === 'holder');
  el('frame-cube').classList.toggle('on', frame === 'cube');
}

function render(): void {
  renderHeader();
  renderDetails();
  renderLog();
  renderToggles();
  renderPicture();
}

// A lone turn is only certain once its pairing window has passed.
setInterval(() => {
  if (tracker.pending.length && tracker.flushBefore(performance.now()).length) render();
}, 40);

if (!bluetoothAvailable()) {
  setNote('This browser has no Web Bluetooth — the demo buttons below still work. Use Chrome or Edge on the desktop to connect a cube.');
}
render();

// Handy in the console while testing, but nothing here is only reachable that way.
Object.assign(window as unknown as Record<string, unknown>, {
  bld: { tracker, link, equalUpToRotation },
});
