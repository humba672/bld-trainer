/**
 * The frame every screen sits in: a thin bar across the top, and the screen itself below it with
 * the whole width to work in.
 */

import { onCubeChange, state, isConnected } from './session';

export interface Screen {
  id: string;
  title: string;
  /** Shown in the menu as a reminder that this one needs the cube in your hands. */
  needsCube?: boolean;
  /** Screens with the same section are grouped after a divider. */
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
    <header class="topbar">
      <span class="brand">bld trainer</span>
      <nav class="nav"></nav>
      <span class="status">
        <span id="link-state" class="state"></span>
        <span id="link-battery" class="state" hidden></span>
      </span>
    </header>
    <section class="screen" id="screen"></section>`;

  const nav = root.querySelector<HTMLElement>('.nav')!;
  let section: string | undefined;
  for (const screen of screens) {
    if (screen.section !== section) {
      section = screen.section;
      if (section) nav.appendChild(document.createElement('hr'));
    }
    const link = document.createElement('a');
    link.href = `#${screen.id}`;
    link.dataset.screen = screen.id;
    link.textContent = screen.title;
    if (screen.section) link.classList.add('secondary');
    nav.appendChild(link);
  }

  const show = () => {
    const id = currentId();
    if (typeof unmountCurrent === 'function') unmountCurrent();
    const container = root.querySelector<HTMLElement>('#screen')!;
    container.innerHTML = '';
    container.dataset.screen = id;
    nav.querySelectorAll('a').forEach((link) => {
      link.classList.toggle('on', link.dataset.screen === id);
    });
    unmountCurrent = screens.find((screen) => screen.id === id)!.mount(container);
  };

  window.addEventListener('hashchange', show);
  show();

  const renderStatus = () => {
    const link = root.querySelector<HTMLElement>('#link-state')!;
    link.innerHTML = '<i></i>';
    link.append(isConnected() ? state.info.deviceName ?? 'connected' : 'no cube');
    link.className = `state ${isConnected() ? 'live' : 'off'}`;

    const battery = root.querySelector<HTMLElement>('#link-battery')!;
    battery.hidden = state.info.battery === undefined;
    battery.textContent = `${state.info.battery}%`;
  };
  onCubeChange(renderStatus);
  renderStatus();
}
