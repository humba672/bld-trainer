# BLD Trainer

A personal site for learning 3x3 blindfolded solving with a GAN 356 i Carry smart cube.
See [SPEC.md](SPEC.md) for the full spec.

Phase P0 (this build) proves the cube link: connect, live move log, cube picture,
slice and wide move handling, protocol generation.

## Local

```
npm install
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # typecheck + production build
```

Web Bluetooth needs Chrome or Edge on desktop, over HTTPS or localhost.
