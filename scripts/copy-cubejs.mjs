/**
 * Copy the solver into `public/` so a plain worker can load it with `importScripts`.
 *
 * cubejs is CommonJS written by CoffeeScript, and reads `this.Cube` at the top level. Module
 * bundling makes top-level `this` undefined, so the library throws before it can fall back to
 * `require`. Loaded as a plain script, as it was meant to be, it works exactly as intended.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'cubejs', 'lib');
const to = join(root, 'public', 'cubejs');

await mkdir(to, { recursive: true });
for (const file of ['cube.js', 'solve.js']) {
  await copyFile(join(from, file), join(to, file));
}
console.log(`cubejs solver copied into ${to}`);
