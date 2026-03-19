# AGENTS.md

## Cursor Cloud specific instructions

This is a single-page React + TypeScript app (Vite 7, React 19, pnpm). No backend, no database — all data lives in browser `localStorage`.

### Services

| Service | Command | Notes |
|---|---|---|
| Dev server | `pnpm dev` | Vite dev server at `http://localhost:5173/did-you-take-your-creatine-today/` |

### Key commands

See `README.md` "Getting started" section. Standard scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm preview`.

### Non-obvious notes

- The Vite `base` path is `/did-you-take-your-creatine-today/` (configured in `vite.config.ts`), so the dev URL includes that path segment.
- `pnpm lint` currently reports 2 pre-existing `react-hooks/set-state-in-effect` errors in `src/App.tsx`. These are in the existing codebase and are not caused by environment setup.
- `pnpm build` runs `tsc -b` before `vite build`, so TypeScript errors will block the build.
- No automated test suite exists — there is no test runner or test files. Verification is manual only (lint + build + browser).
