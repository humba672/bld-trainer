/**
 * Random-state scrambles, off the main thread.
 *
 * A plain worker rather than a module one: the solver is CommonJS that expects a global `this`,
 * which module bundling takes away. Loaded with importScripts it behaves as written.
 *
 * Building the solver tables takes about a second and a half, once, which is the whole reason
 * this is not on the main thread.
 */

importScripts('cubejs/cube.js', 'cubejs/solve.js');

let ready = false;

self.onmessage = (event) => {
  const { id } = event.data;
  try {
    if (!ready) {
      self.Cube.initSolver();
      ready = true;
    }
    self.postMessage({ id, scramble: self.Cube.scramble() });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
