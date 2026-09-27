/**
 * Work out the shortest algorithm for every F2L case, once, and write them out.
 *
 * The search is iterative deepening over three faces and the deepest cases take a while, which is
 * no good in a browser. There are only 41 of them and they never change, so they are computed here
 * and committed. `npm test` checks every one of them still solves its case.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('tsx/cjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { SOLVED, applyAlg } = await import('../src/cube/cube.ts');
const { enumerateF2LCases } = await import('../src/timer/cfop.ts');
const { solveF2LCase, inSolverNotation } = await import('../src/timer/f2l-solve.ts');

const started = Date.now();
const solutions = {};
const cases = [...enumerateF2LCases().values()].filter((entry) => !entry.solved);

for (const [index, entry] of cases.entries()) {
  const state = applyAlg(SOLVED, entry.setup);
  const at = Date.now();
  const cubeFrame = solveF2LCase(state, 13);
  if (cubeFrame === null) throw new Error(`no solution for ${entry.key}`);
  solutions[entry.key] = {
    setup: entry.setup,
    cubeFrame,
    alg: inSolverNotation(cubeFrame),
    length: cubeFrame.split(' ').filter(Boolean).length,
  };
  console.log(
    `${String(index + 1).padStart(2)}/41  ${entry.key.padEnd(12)} ${String(
      solutions[entry.key].length,
    ).padStart(2)} moves  ${solutions[entry.key].alg.padEnd(34)} ${Date.now() - at}ms`,
  );
}

await writeFile(
  join(root, 'src', 'data', 'f2l-solutions.json'),
  `${JSON.stringify(solutions, null, 1)}\n`,
);
console.log(`\nwritten in ${((Date.now() - started) / 1000).toFixed(1)}s`);
