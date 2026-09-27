/**
 * The cube as a solid, drawn with CSS 3D transforms and turnable with the mouse.
 *
 * A net shows all 54 stickers but it is not what you look at when you solve. This is, so the letter
 * drill asks its question on the thing you actually hold. Three faces show at a time, which is the
 * catch: point at a sticker on a face turned away and the drill is unanswerable. So the view is
 * worked out from the sticker - `viewFor` - and the cube turns to it.
 *
 * The geometry lives here as vector maths rather than as CSS I squinted at, because it is the part
 * that can be quietly wrong. `visibleFaces` turns each face's outward normal by the view's two
 * angles and keeps the ones pointing at you, which is what the browser does to draw it.
 */

import { BLANK_HEX, COLOUR_HEX } from '../cube/colours';
import { FACES, type Face } from '../cube/cube';

/** Where the camera is: yaw turns the cube about the upright axis, pitch tips it towards you. */
export interface View {
  yaw: number;
  pitch: number;
}

/**
 * Outward normals in the same coordinates CSS uses: x to the right, y DOWN the screen, z out of it
 * towards you. y being down is why up is negative here.
 */
const NORMAL: Record<Face, [number, number, number]> = {
  U: [0, -1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, 1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * How squarely a face points at you, from 1 (dead on) through 0 (edge-on) to -1 (facing away).
 * This is the z of its normal after the view's rotations, which CSS applies right to left: the yaw
 * first, then the pitch.
 */
export function facingness(face: Face, view: View): number {
  const [x, y, z] = NORMAL[face];
  const yaw = radians(view.yaw);
  const pitch = radians(view.pitch);
  // rotateY: z' = -x sin + z cos.
  const zAfterYaw = -x * Math.sin(yaw) + z * Math.cos(yaw);
  // rotateX: z' = y sin + z cos.
  return y * Math.sin(pitch) + zAfterYaw * Math.cos(pitch);
}

/** The faces you can see from here. Exactly three, except looking straight at one or two. */
export function visibleFaces(view: View): Face[] {
  return FACES.filter((face) => facingness(face, view) > 1e-9);
}

/** The yaw that brings each side face round to the front. */
const YAW_TO_FRONT: Record<Face, number> = { F: 0, R: -90, B: 180, L: 90, U: 0, D: 0 };

/** Turned this much off square, so a second face shows and the cube reads as a solid. */
const OFF_SQUARE = -20;

/**
 * The view to ask about this sticker from: its face brought to the front and tilted just off
 * square. A sticker on the white or yellow face cannot be seen without tipping the cube right over,
 * so those two are the only ones that lose "white on top" - everything else keeps the frame the
 * letters were learnt in.
 */
export function viewFor(facelet: number): View {
  const face = FACES[Math.floor(facelet / 9)];
  if (face === 'U') return { yaw: -25, pitch: -55 };
  if (face === 'D') return { yaw: -25, pitch: 55 };
  return { yaw: YAW_TO_FRONT[face] + OFF_SQUARE, pitch: -18 };
}

export const DEFAULT_VIEW: View = { yaw: -25, pitch: -18 };

// ---------------------------------------------------------------- the thing on screen

/** Each face turned out from the middle, then pushed out to the surface. */
const FACE_TRANSFORM: Record<Face, string> = {
  U: 'rotateX(90deg)',
  D: 'rotateX(-90deg)',
  F: '',
  B: 'rotateY(180deg)',
  R: 'rotateY(90deg)',
  L: 'rotateY(-90deg)',
};

export interface Cube3DOptions {
  /** The cube's side, in pixels. */
  size?: number;
  /** Whether dragging turns it. */
  turnable?: boolean;
}

export interface PaintOptions {
  highlight?: number;
  /** Every sticker grey, for when the colours would give the answer away. */
  blank?: boolean;
}

export class Cube3D {
  private readonly cube: HTMLElement;
  private readonly stickers: HTMLElement[] = [];
  private view: View = { ...DEFAULT_VIEW };
  private dragging = false;
  private readonly cleanup: Array<() => void> = [];

  constructor(container: HTMLElement, options: Cube3DOptions = {}) {
    const size = options.size ?? 180;
    container.innerHTML = '';

    const stage = document.createElement('div');
    stage.className = 'cube3d';
    stage.style.width = `${size}px`;
    stage.style.height = `${size}px`;
    stage.style.perspective = `${size * 4}px`;

    this.cube = document.createElement('div');
    this.cube.className = 'cube3d-cube';

    for (const face of FACES) {
      const plate = document.createElement('div');
      plate.className = 'cube3d-face';
      plate.dataset.face = face;
      plate.style.transform = `${FACE_TRANSFORM[face]} translateZ(${size / 2}px)`.trim();
      // Nine stickers, in the same order as the facelets: across each row, top row first, seen
      // from outside that face.
      for (let cell = 0; cell < 9; cell++) {
        const sticker = document.createElement('i');
        sticker.className = 'cube3d-sticker';
        plate.appendChild(sticker);
        this.stickers.push(sticker);
      }
      this.cube.appendChild(plate);
    }

    stage.appendChild(this.cube);
    container.appendChild(stage);
    this.apply(false);

    if (options.turnable !== false) this.makeTurnable(stage);
  }

  /** Paint the stickers from a facelet string. */
  paint(facelets: string, options: PaintOptions = {}): void {
    for (let index = 0; index < 54; index++) {
      const sticker = this.stickers[index];
      sticker.style.background = options.blank
        ? BLANK_HEX
        : COLOUR_HEX[facelets[index] as Face] ?? BLANK_HEX;
      sticker.classList.toggle('on', options.highlight === index);
    }
  }

  /** Turn to where that sticker can be seen, smoothly. */
  lookAt(facelet: number): void {
    this.view = viewFor(facelet);
    this.apply(true);
  }

  reset(): void {
    this.view = { ...DEFAULT_VIEW };
    this.apply(true);
  }

  destroy(): void {
    for (const off of this.cleanup) off();
  }

  private apply(animate: boolean): void {
    this.cube.style.transition = animate ? 'transform 420ms ease' : 'none';
    this.cube.style.transform = `rotateX(${this.view.pitch}deg) rotateY(${this.view.yaw}deg)`;
  }

  private makeTurnable(stage: HTMLElement): void {
    stage.classList.add('turnable');
    let lastX = 0;
    let lastY = 0;

    const down = (event: PointerEvent) => {
      this.dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      stage.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!this.dragging) return;
      this.view = {
        yaw: this.view.yaw + (event.clientX - lastX) * 0.6,
        // Tipped past vertical the cube reads as upside down, so it stops short of that.
        pitch: Math.max(-85, Math.min(85, this.view.pitch - (event.clientY - lastY) * 0.6)),
      };
      lastX = event.clientX;
      lastY = event.clientY;
      this.apply(false);
    };
    const up = () => {
      this.dragging = false;
    };

    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    this.cleanup.push(() => {
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
    });
  }
}
