import { defineConfig } from 'vite';

// Served from https://<user>.github.io/bld-trainer/
export default defineConfig({
  base: '/bld-trainer/',
  // cubing.js runs its random-state scrambler in an ES-module worker; Vite's default build format
  // for workers is iife, which leaves that worker referencing `document` and failing to start.
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['cubing'] },
});
