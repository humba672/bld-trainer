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
const { solveF2LCase, cheapestF2L, inSolverNotation } = await import('../src/timer/f2l-solve.ts');

/**
 * An F move needs a regrip, so it is worth about two ordinary turns. Which face that is depends on
 * how the cube is held: as the algorithms are printed it is the cube's R face, and rotated so the
 * slot goes round to the back right it is the cube's F face instead. Both are searched, and the
 * screens pick between them knowing how you are holding the cube.
 */
const HOLDS = [
  { costs: { D: 1, R: 2, F: 1 }, budget: 14 },
  { costs: { D: 1, R: 1, F: 2 }, budget: 14 },
  // And the shortest that never touches the awkward face at all. Pricing it out of reach rather
  // than forbidding it keeps one search doing the work. Plenty of cases have no such answer - a
  // pair can need both of the faces beside its slot - and the budget is what stops those hunting
  // to the bitter end: an eleven-move algorithm that avoids two regrips has already lost to a
  // seven-move one that does not, so there is nothing down there worth finding.
  { costs: { D: 1, R: 99, F: 1 }, budget: 11 },
  { costs: { D: 1, R: 1, F: 99 }, budget: 11 },
];

const started = Date.now();
const solutions = {};
const cases = [...enumerateF2LCases().values()].filter((entry) => !entry.solved);

for (const [index, entry] of cases.entries()) {
  const state = applyAlg(SOLVED, entry.setup);
  const at = Date.now();
  const cubeFrame = solveF2LCase(state, 13);
  if (cubeFrame === null) throw new Error(`no solution for ${entry.key}`);

  // The shortest, plus the cheapest for each way of holding it. Often all three are the same
  // algorithm; where they differ it is the shortest that has the regrip in it.
  const options = [cubeFrame];
  for (const { costs, budget } of HOLDS) {
    const cheap = cheapestF2L(state, costs, budget);
    if (cheap !== null && !options.includes(cheap)) options.push(cheap);
  }

  solutions[entry.key] = {
    setup: entry.setup,
    cubeFrame,
    alg: inSolverNotation(cubeFrame),
    length: cubeFrame.split(' ').filter(Boolean).length,
    options,
  };
  console.log(
    `${String(index + 1).padStart(2)}/41  ${entry.key.padEnd(12)} ${String(
      solutions[entry.key].length,
    ).padStart(2)} moves  ${solutions[entry.key].alg.padEnd(34)} ${
      solutions[entry.key].options.length
    } option(s)  ${Date.now() - at}ms`,
  );
}

await writeFile(
  join(root, 'src', 'data', 'f2l-solutions.json'),
  `${JSON.stringify(solutions, null, 1)}\n`,
);
console.log(`\nwritten in ${((Date.now() - started) / 1000).toFixed(1)}s`);
