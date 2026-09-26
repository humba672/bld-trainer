/**
 * The frame every screen sits in: the left-hand menu, the screen itself, and a connection chip
 * that is visible wherever you are.
 */

import { onCubeChange, state, isConnected } from './session';

export interface Screen {
  id: string;
  title: string;
  /** Shown in the menu as a reminder that this one needs the cube in your hands. */
  needsCube?: boolean;
  /** Screens with the same section are grouped under a heading. */
  section?: string;
  mount(container: HTMLElement): void | (() => void);
}

const screens: Screen[] = [];
let unmountCurrent: (() => void) | void;

export function registerScreens(list: Screen[]): void {
  screens.push(...list);
}

function currentId(): string {
  const wanted = location.hash.replace('#', '');
  return screens.some((screen) => screen.id === wanted) ? wanted : screens[0].id;
}

export function startShell(root: HTMLElement): void {
  root.innerHTML = `
    <nav class="menu">
      <div class="brand">BLD Trainer</div>
      <div class="menu-items"></div>
      <div class="menu-foot">
        <span id="menu-link" class="chip off">Disconnected</span>
        <span id="menu-battery" class="chip" hidden></span>
      </div>
    </nav>
    <section class="screen" id="screen"></section>`;

  const items = root.querySelector<HTMLElement>('.menu-items')!;
  let section: string | undefined;
  for (const screen of screens) {
    if (screen.section !== section) {
      section = screen.section;
      if (section) {
        const heading = document.createElement('div');
        heading.className = 'menu-section';
        heading.textContent = section;
        items.appendChild(heading);
      }
    }
    const link = document.createElement('a');
    link.href = `#${screen.id}`;
    link.dataset.screen = screen.id;
    link.innerHTML = `${screen.title}${
      screen.needsCube ? '<span class="needs-cube" title="Needs the cube">•</span>' : ''
    }`;
    items.appendChild(link);
  }

  const show = () => {
    const id = currentId();
    if (typeof unmountCurrent === 'function') unmountCurrent();
    const container = root.querySelector<HTMLElement>('#screen')!;
    container.innerHTML = '';
    container.dataset.screen = id;
    items.querySelectorAll('a').forEach((link) => {
      link.classList.toggle('on', link.dataset.screen === id);
    });
    unmountCurrent = screens.find((screen) => screen.id === id)!.mount(container);
  };

  window.addEventListener('hashchange', show);
  show();

  const renderChips = () => {
    const chip = root.querySelector<HTMLElement>('#menu-link')!;
    chip.textContent = isConnected() ? `Connected · ${state.info.deviceName ?? 'cube'}` : 'Disconnected';
    chip.className = `chip ${isConnected() ? 'on' : 'off'}`;
    const battery = root.querySelector<HTMLElement>('#menu-battery')!;
    battery.hidden = state.info.battery === undefined;
    battery.textContent = `Battery ${state.info.battery}%`;
  };
  onCubeChange(renderChips);
  renderChips();
}
