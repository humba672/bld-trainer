/**
 * The one live connection to the cube, shared by every screen.
 *
 * Screens read the state here and subscribe to changes; nothing else talks to the Bluetooth layer.
 */

import { SOLVED, looksLikeACube } from './cube/cube';
import {
  CubeLink,
  bluetoothAvailable,
  canRememberCubes,
  rememberedCubes,
  type CubeInfo,
} from './cube/gan';
import { findMissingTurns, type MissingTurns } from './cube/repair';
import { CubeTracker, type WireTurn } from './cube/tracker';
import { loadAutoConnect, loadMac, saveAutoConnect, saveMac } from './store';

export type MacSource = 'saved' | 'read from the cube' | 'typed in';

/** How often to ask the cube for its own state while your hands are still. */
const VERIFY_EVERY_MS = 2000;
const SETTLE_MS = 800;

export const tracker = new CubeTracker({ pairWindowMs: 120 });

export const state = {
  info: {} as Partial<CubeInfo>,
  macSource: null as MacSource | null,
  savedMac: null as string | null,
  autoConnect: true,
  remembered: null as BluetoothDevice | null,
  connecting: false,
  adopted: false,
  note: '',
  lastCheck: null as { at: number; matched: boolean; reported: string } | null,
  missing: null as MissingTurns | null,
  lostSinceCheck: 0,
  garbledReadings: 0,
  /** Bumped on every turn, so a screen can tell something happened. */
  turnsSeen: 0,
};

const listeners = new Set<() => void>();
export function onCubeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function changed(): void {
  for (const listener of listeners) listener();
}

export function setNote(text: string): void {
  state.note = text;
}

let lastTurnAt = 0;
let checkInFlight: { turnsSeen: number; at: number } | null = null;
let unconfirmedMismatch: string | null = null;

export const link = new CubeLink({
  onTurn: (turn) => {
    state.turnsSeen += 1;
    lastTurnAt = performance.now();
    tracker.onWire(turn);
    changed();
  },
  onTurnsLost: (count) => {
    state.lostSinceCheck += count;
    state.turnsSeen += count;
    setNote(
      `Bluetooth dropped ${count} turn${count === 1 ? '' : 's'} — asking the cube what it really looks like…`,
    );
    changed();
  },
  onInfo: (update) => {
    state.info = { ...state.info, ...update };
    if (update.deviceMAC && update.deviceMAC !== state.savedMac) {
      state.savedMac = update.deviceMAC;
      state.macSource = state.macSource ?? 'read from the cube';
      void saveMac(update.deviceMAC);
    }
    changed();
  },
  onFacelets: (facelets) => {
    if (!state.adopted) {
      state.adopted = true;
      tracker.reset(facelets);
      setNote(
        facelets === SOLVED
          ? 'Connected. The cube says it is solved — hold it white top, green front.'
          : 'Connected. Adopted the state the cube reports; hold it white top, green front.',
      );
      changed();
      return;
    }

    const overtaken = checkInFlight !== null && checkInFlight.turnsSeen !== state.turnsSeen;
    checkInFlight = null;
    if (overtaken) return;

    if (!looksLikeACube(facelets)) {
      state.garbledReadings += 1;
      changed();
      return;
    }

    if (facelets === tracker.cubeFacelets()) {
      state.lastCheck = { at: Date.now(), matched: true, reported: facelets };
      state.missing = null;
      unconfirmedMismatch = null;
      state.lostSinceCheck = 0;
      if (state.note.startsWith('Bluetooth dropped')) setNote('');
      changed();
      return;
    }

    if (!state.lostSinceCheck && unconfirmedMismatch !== facelets) {
      unconfirmedMismatch = facelets;
      return;
    }
    unconfirmedMismatch = null;

    state.lastCheck = { at: Date.now(), matched: false, reported: facelets };
    state.missing = findMissingTurns(tracker.cubeFacelets(), facelets);
    setNote(
      state.missing && state.missing.turns.length
        ? `The cube is ${state.missing.notation} ahead of the picture.`
        : 'The cube and the picture disagree by more than a few turns.',
    );
    changed();
  },
  onDisconnect: () => {
    state.info = {};
    state.macSource = null;
    state.adopted = false;
    setNote('The cube disconnected.');
    changed();
  },
  onNote: (text) => {
    setNote(text);
    changed();
  },
});

export const isConnected = (): boolean => link.connected;

// ---------------------------------------------------------------- connecting

let macDialog: HTMLDialogElement | null = null;

function macDialogElement(): HTMLDialogElement {
  if (macDialog) return macDialog;
  const dialog = document.createElement('dialog');
  dialog.id = 'mac-dialog';
  dialog.innerHTML = `
    <form method="dialog">
      <h2>Cube MAC address</h2>
      <p class="hint">
        The browser could not read the cube's MAC address, and the decryption key depends on it.
        Find it in the GAN app, or in Windows Settings under Bluetooth. It is saved here, so you
        are only asked once.
      </p>
      <input id="mac-input" placeholder="AB:CD:EF:12:34:56" autocomplete="off" />
      <p id="mac-error" class="error" hidden>That is not a MAC address.</p>
      <menu>
        <button value="cancel">Cancel</button>
        <button value="save" class="primary">Save and connect</button>
      </menu>
    </form>`;
  document.body.appendChild(dialog);
  macDialog = dialog;
  return dialog;
}

async function askForMac(deviceName: string): Promise<string | null> {
  const dialog = macDialogElement();
  const input = dialog.querySelector<HTMLInputElement>('#mac-input')!;
  const error = dialog.querySelector<HTMLElement>('#mac-error')!;
  input.value = state.savedMac ?? '';
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

const macProvider = async (device: BluetoothDevice, isFallback?: boolean) => {
  state.savedMac = (await loadMac()) ?? null;
  if (state.savedMac) {
    state.macSource = 'saved';
    return state.savedMac;
  }
  if (!isFallback) return null;
  const typed = await askForMac(device.name ?? 'the cube');
  if (typed) {
    await saveMac(typed);
    state.savedMac = typed;
    state.macSource = 'typed in';
  }
  return typed;
};

export async function connect(): Promise<void> {
  if (!bluetoothAvailable()) {
    setNote('This browser has no Web Bluetooth. Use Chrome or Edge on the desktop.');
    return changed();
  }
  if (state.connecting || link.connected) return;
  state.connecting = true;
  setNote('Pick your cube in the browser’s device list…');
  changed();
  try {
    await link.connect(macProvider);
    if (!state.macSource) state.macSource = 'read from the cube';
    state.remembered = (await rememberedCubes())[0] ?? null;
  } catch (error) {
    setNote(`Could not connect: ${(error as Error).message ?? String(error)}`);
  }
  state.connecting = false;
  changed();
}

export async function reconnect(automatic = false): Promise<void> {
  if (!state.remembered || state.connecting || link.connected) return;
  state.connecting = true;
  setNote(`Connecting to ${state.remembered.name ?? 'your cube'}…`);
  changed();
  try {
    await link.connectRemembered(
      state.remembered,
      automatic ? async () => state.savedMac : macProvider,
    );
    if (!state.macSource) state.macSource = 'read from the cube';
  } catch (error) {
    setNote(
      automatic
        ? `${state.remembered.name ?? 'The cube'} did not answer. Turn a face to wake it, then press Reconnect.`
        : `Could not reach the cube: ${(error as Error).message ?? String(error)}`,
    );
  }
  state.connecting = false;
  changed();
}

export async function disconnect(): Promise<void> {
  await link.disconnect();
}

export async function setAutoConnect(on: boolean): Promise<void> {
  state.autoConnect = on;
  await saveAutoConnect(on);
  changed();
}

// ---------------------------------------------------------------- checking

export async function verify(manual = false): Promise<void> {
  if (!link.connected || !state.adopted || checkInFlight) return;
  checkInFlight = { turnsSeen: state.turnsSeen, at: performance.now() };
  if (manual) {
    setNote('Asked the cube for its own state…');
    changed();
  }
  try {
    await link.requestFacelets();
    if (manual) await link.requestBattery();
  } catch (error) {
    checkInFlight = null;
    setNote(`Could not reach the cube: ${String(error)}`);
    changed();
  }
}

/** Start again from a cube you are holding solved, telling the cube itself as well. */
export async function declareSolved(): Promise<void> {
  restart(SOLVED);
  if (link.connected) await link.declareSolved();
  setNote('Tracking restarted from a solved cube, white top and green front.');
  changed();
}

export function restart(facelets: string = SOLVED): void {
  tracker.reset(facelets);
  state.lastCheck = null;
  state.missing = null;
  state.lostSinceCheck = 0;
  state.adopted = true;
  unconfirmedMismatch = null;
  changed();
}

/** Feed back the turns the cube saw but the browser never received. */
export function applyMissingTurns(found: MissingTurns): void {
  tracker.flushAll();
  const base = performance.now();
  const gap = tracker.pairWindowMs * 3 + 50;
  found.turns.forEach((turn, i) => tracker.onWire({ ...turn, t: base + i * gap }));
  tracker.flushAll();
  setNote(`Added the ${found.notation} the browser had missed.`);
  state.missing = null;
  state.lastCheck = null;
  state.lostSinceCheck = 0;
  unconfirmedMismatch = null;
  changed();
  void verify();
}

export function feedTurn(turn: WireTurn): void {
  tracker.onWire(turn);
  changed();
}

export const rememberSupported = canRememberCubes;
export const bluetoothSupported = bluetoothAvailable;

// ---------------------------------------------------------------- timers

setInterval(() => {
  if (tracker.pending.length && tracker.flushBefore(performance.now()).length) changed();
}, 40);

setInterval(() => {
  const now = performance.now();
  if (checkInFlight && now - checkInFlight.at > 2000) checkInFlight = null;
  if (now - lastTurnAt < SETTLE_MS) return;
  void verify();
}, VERIFY_EVERY_MS);

/** Pick up what the browser already knows, and reconnect on its own if it knows the cube. */
export async function startSession(): Promise<void> {
  state.savedMac = (await loadMac()) ?? null;
  state.autoConnect = await loadAutoConnect();
  state.remembered = (await rememberedCubes())[0] ?? null;
  changed();
  if (state.remembered && state.autoConnect && state.savedMac) await reconnect(true);
}
