/**
 * Phase 1: the site proper. Every screen is reached from the left-hand menu, and they all share
 * one connection to the cube.
 */

import { mountCubeLink } from './screens/cube-link';
import { mountHome } from './screens/home';
import { mountLetterDrill } from './screens/letter-drill';
import { mountLetterPairs } from './screens/letter-pairs';
import { mountSettings } from './screens/settings';
import { mountTracingDrill } from './screens/tracing-drill';
import { bluetoothSupported, setNote, startSession } from './session';
import { registerScreens, startShell } from './shell';

registerScreens([
  { id: 'home', title: 'Home', mount: mountHome },
  { id: 'letter-drill', title: 'Letter drill', mount: mountLetterDrill },
  { id: 'tracing-drill', title: 'Tracing drill', needsCube: true, mount: mountTracingDrill },
  { id: 'letter-pairs', title: 'Letter pairs', mount: mountLetterPairs },
  { id: 'cube-link', title: 'Cube link', needsCube: true, mount: mountCubeLink },
  { id: 'settings', title: 'Settings', mount: mountSettings },
]);

if (!bluetoothSupported()) {
  setNote('This browser has no Web Bluetooth. Use Chrome or Edge on the desktop to connect a cube.');
}

startShell(document.querySelector<HTMLElement>('#app')!);
void startSession();
