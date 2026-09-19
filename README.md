# BLD Trainer

A personal site for learning 3x3 blindfolded solving with a GAN 356 i Carry smart cube.
[SPEC.md](SPEC.md) is the source of truth.

**Live:** https://humba672.github.io/bld-trainer/

Phase P0, this build, proves the cube link: connect over Web Bluetooth, read every turn, show
the cube on screen, handle slice and wide moves, and report which GAN protocol generation the
cube speaks. Nothing from later phases is here yet.

## Local

```
npm install
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # typecheck, then the production build
```

Web Bluetooth needs Chrome or Edge on the desktop, over HTTPS or localhost. Everything except
the cube itself can be exercised from the "Try it without the cube" panel, which sends exactly
what the cube would put on the wire.

## What is where

| File | What it holds |
| --- | --- |
| `src/cube/cube.ts` | The 54 stickers, every move generated from the geometry, and comparison that ignores which way the cube is facing |
| `src/cube/tracker.ts` | Wire turns to moves: slice pairing, the hidden core turn, wide moves |
| `src/cube/gan.ts` | The Bluetooth link, MAC handling, protocol generation |
| `src/app.ts` | The screen |

## Why a slice looks like two turns

The cube has no gyroscope. Each face axle only reports how far that layer has turned relative to
the core, so:

- **M** arrives as **R** and **L'**, and the core turns under your hands by `x'`. That hidden
  turn is tracked, so every later report is read in your frame.
- **Rw** arrives as a single **L**, with the same kind of hidden core turn. Nothing on the wire
  separates `Rw` from a plain `L`, so a lone turn is read as the plain face turn until you press
  <kbd>W</kbd>.
- A real `R L'` and an `M` are identical on the wire. Only the display depends on the guess;
  every state comparison ignores orientation.

## The P0 test

1. Open the live site in Chrome or Edge and press **Connect cube**. Pick the cube in the browser
   dialog. If the MAC address cannot be read, type it once when asked; it is saved.
2. Check the header: connection state, battery, and the protocol generation.
3. Solve the cube, hold it white top and green front, and press **Cube is solved**.
4. Do 100 mixed turns, including M moves and wide moves. Press <kbd>W</kbd> after each wide move
   (twice after a wide double).
5. Press **Check against cube**: it asks the cube for its own state and compares. A match means
   every turn was read correctly.
6. Compare the picture with the cube in your hands. They should match face for face, including
   which way the cube is pointing.
