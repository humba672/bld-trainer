/**
 * The Bluetooth link to the cube, wrapped so the rest of the site only ever sees plain turns.
 *
 * gan-web-bluetooth picks a protocol driver by which BLE service the cube exposes; it does not
 * tell you which one it picked, so the generation is read back off the device here.
 */

import { connectGanCube, type GanCubeConnection, type GanCubeEvent } from 'gan-web-bluetooth';
import type { Face, WireTurn } from './tracker';

export type Generation = 'Gen2' | 'Gen3' | 'Gen4' | 'unknown';

const GENERATION_SERVICES: Array<[string, Generation]> = [
  ['6e400001-b5a3-f393-e0a9-e50e24dc4179', 'Gen2'],
  ['8653000a-43e6-47b7-9cb0-5fc21d4ae340', 'Gen3'],
  ['00000010-0000-fff7-fff6-fff5fff4fff0', 'Gen4'],
];

/** The cube numbers its faces U R F D L B. */
const WIRE_FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export interface CubeInfo {
  deviceName: string;
  deviceMAC: string;
  generation: Generation;
  hardwareName?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  productDate?: string;
  gyroSupported?: boolean;
  gyroSeen?: boolean;
  battery?: number;
}

export type MacProvider = (device: BluetoothDevice, isFallback?: boolean) => Promise<string | null>;

export interface CubeLinkHandlers {
  onTurn(turn: WireTurn, raw: string): void;
  onInfo(info: Partial<CubeInfo>): void;
  onFacelets(facelets: string, serial: number): void;
  /** The cube numbers its turns; this fires when that count skips, so turns never reached us. */
  onTurnsLost(count: number): void;
  onDisconnect(): void;
  onNote(text: string): void;
}

export const bluetoothAvailable = (): boolean =>
  typeof navigator !== 'undefined' && !!(navigator as Navigator).bluetooth;

type BluetoothWithMemory = Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };

/** Can this browser remember a cube you have already allowed, so the picker can be skipped? */
export const canRememberCubes = (): boolean =>
  bluetoothAvailable() && typeof (navigator.bluetooth as BluetoothWithMemory).getDevices === 'function';

/**
 * Cubes this browser already has permission for. Chrome only answers this with the new Web
 * Bluetooth permissions backend enabled, so an empty list means "ask the usual way".
 */
export async function rememberedCubes(): Promise<BluetoothDevice[]> {
  if (!canRememberCubes()) return [];
  try {
    const devices = await (navigator.bluetooth as BluetoothWithMemory).getDevices!();
    return devices.filter((device) => /^(GAN|MG|AiCube)/i.test(device.name ?? ''));
  } catch {
    return [];
  }
}

export class CubeLink {
  private connection: GanCubeConnection | null = null;
  private subscription: { unsubscribe(): void } | null = null;
  /** The cube's own turn counter, as last seen. */
  private lastSerial: number | null = null;

  constructor(private handlers: CubeLinkHandlers) {}

  get connected(): boolean {
    return this.connection !== null;
  }

  async connect(macProvider: MacProvider): Promise<CubeInfo> {
    const connection = await connectGanCube(macProvider);
    this.connection = connection;
    this.subscription = connection.events$.subscribe((event: GanCubeEvent) =>
      this.handle(event),
    );

    const info: CubeInfo = {
      deviceName: connection.deviceName,
      deviceMAC: connection.deviceMAC,
      generation: await this.readGeneration(connection),
    };
    this.handlers.onInfo(info);

    await connection.sendCubeCommand({ type: 'REQUEST_HARDWARE' });
    await connection.sendCubeCommand({ type: 'REQUEST_BATTERY' });
    await connection.sendCubeCommand({ type: 'REQUEST_FACELETS' });
    return info;
  }

  /**
   * Connect to a cube this browser already knows, with no device picker.
   *
   * connectGanCube always opens the picker itself and the library does not export the parts needed
   * to go around it, so for the length of that one call the picker is stood in for and handed the
   * remembered device. The real one is put back immediately afterwards, whatever happens.
   */
  async connectRemembered(device: BluetoothDevice, macProvider: MacProvider): Promise<CubeInfo> {
    const bluetooth = navigator.bluetooth;
    const picker = bluetooth.requestDevice;
    bluetooth.requestDevice = (async () => device) as typeof picker;
    try {
      return await this.connect(macProvider);
    } finally {
      bluetooth.requestDevice = picker;
    }
  }

  /**
   * Which protocol generation the cube speaks, from the BLE service it exposes.
   *
   * This is for the record only, never for talking to the cube, so a failure here is worth a
   * quiet "unknown" rather than an alarm about the connection - which is reported on its own.
   */
  private async readGeneration(connection: GanCubeConnection): Promise<Generation> {
    const device = (connection as unknown as { device?: BluetoothDevice }).device;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const services = await device?.gatt?.getPrimaryServices();
        for (const service of services ?? []) {
          const match = GENERATION_SERVICES.find(([uuid]) => uuid === service.uuid.toLowerCase());
          if (match) return match[1];
        }
        return 'unknown';
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    return 'unknown';
  }

  async requestFacelets(): Promise<void> {
    await this.connection?.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  async requestBattery(): Promise<void> {
    await this.connection?.sendCubeCommand({ type: 'REQUEST_BATTERY' });
  }

  /** Tell the cube its own state is solved, for when tracking has drifted. */
  async declareSolved(): Promise<void> {
    await this.connection?.sendCubeCommand({ type: 'REQUEST_RESET' });
  }

  async disconnect(): Promise<void> {
    this.subscription?.unsubscribe();
    this.subscription = null;
    const connection = this.connection;
    this.connection = null;
    this.lastSerial = null;
    await connection?.disconnect();
    this.handlers.onDisconnect();
  }

  private handle(event: GanCubeEvent): void {
    switch (event.type) {
      case 'MOVE': {
        // The Gen2 protocol replays at most seven missed turns and drops the rest in silence, so
        // the cube's own serial number is the only warning that anything went astray.
        if (this.lastSerial !== null) {
          const skipped = ((event.serial - this.lastSerial) & 0xff) - 1;
          if (skipped > 0 && skipped < 200) this.handlers.onTurnsLost(skipped);
        }
        this.lastSerial = event.serial;

        const turn: WireTurn = {
          face: WIRE_FACES[event.face],
          dir: event.direction === 0 ? 1 : -1,
          t: event.localTimestamp ?? event.timestamp,
          ct: event.cubeTimestamp ?? undefined,
        };
        this.handlers.onTurn(turn, event.move);
        break;
      }
      case 'FACELETS':
        this.lastSerial = event.serial;
        this.handlers.onFacelets(event.facelets, event.serial);
        break;
      case 'BATTERY':
        this.handlers.onInfo({ battery: event.batteryLevel });
        break;
      case 'HARDWARE':
        this.handlers.onInfo({
          hardwareName: event.hardwareName,
          softwareVersion: event.softwareVersion,
          hardwareVersion: event.hardwareVersion,
          productDate: event.productDate,
          gyroSupported: event.gyroSupported,
        });
        break;
      case 'GYRO':
        this.handlers.onInfo({ gyroSeen: true });
        break;
      case 'DISCONNECT':
        this.subscription?.unsubscribe();
        this.subscription = null;
        this.connection = null;
        this.lastSerial = null;
        this.handlers.onDisconnect();
        break;
    }
  }
}
