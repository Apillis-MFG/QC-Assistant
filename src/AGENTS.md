---
description: App-level guide for agents working inside QC Assistant's src/ folder.
alwaysApply: true
---

# AGENTS.md — src/

This file orients coding agents working inside `src/`. For product policy and engineering rules, follow the root `../AGENTS.md` first. This nested guide wins only for exact code placement, file structure, and app-specific implementation details.

## Project Summary

QC Assistant is an engineering drawing ballooning and FAI inspection report builder. All logic runs client-side with no backend dependency.

Primary goals when editing:

- keep inspection math in `exporters.js` correct and pure
- keep all application state in `App.jsx` unless a refactor is explicitly requested
- do not break the balloon placement → measurement entry → export workflow
- reference CSS tokens via `var(--token)` — never hardcode colors or spacing

## Repo Layout

```text
src/
  main.jsx        — React root mount; no logic here
  App.jsx         — all application state, layout, modes, event handlers, and rendering
  exporters.js    — inspection math (getLimits, getStatus) and PDF/Excel export
  sampleData.js   — demo characteristics used to seed the app on load
  styles.css      — all CSS variables (:root) and component styles
```

This is a flat structure. Do not create subdirectories, context files, or provider files unless asked.

## Architecture Reality

- All state is managed with `useState`, `useMemo`, and `useRef` in `App.jsx`.
- No context providers, reducers, or state management libraries.
- No routing — single-page, single-component application.
- No backend calls — no fetch, no auth, no cloud dependencies.
- CSS is global with class-based selectors — no CSS modules, no Tailwind, no styled-components.

Practical guidance:

- follow the existing patterns in the area you touch
- prefer feature-local changes over broad refactors
- do not add React context, Zustand, Redux, or other state management without explicit user request
- do not add a router — the app is intentionally single-page

## Current Architecture: App.jsx Sections

`App.jsx` is organized in this order:

1. Constants (`methods`, `types`, `emptyMetadata`)
2. `createCharacteristic` factory function
3. `App` component — state declarations
4. Derived state (`useMemo` for `selected`, `currentPageBalloons`, `projectStatus`)
5. PDF load and page render effects (`useEffect`)
6. OCR logic (Tesseract.js integration)
7. Interaction handlers (balloon placement, drag, pan, text-capture, OCR rect drawing)
8. Render — topbar, drawing panel, inspector panel, table panel

When adding new features, follow this order: new state → new derived state → new handlers → new render section.

## Key Files

### `exporters.js`

Contains all inspection math and export logic:

- `parseNumber(value)` — safely extracts a number from any string/number/null input
- `getLimits(characteristic)` — computes USL and LSL from nominal and tolerance (bilateral / MAX / MIN / null)
- `getStatus(characteristic, sampleCount)` — returns `"OPEN"`, `"OK"`, or `"NG"`
- `exportBalloonedPdf({ pdfBytes, characteristics, fileName })` — annotates PDF with balloon circles and leader lines
- `exportInspectionWorkbook({ metadata, characteristics, sampleCount })` — generates Excel FAI report

**Keep these functions pure.** Do not import React or access DOM from `exporters.js`.

When changing `getLimits` or `getStatus`, manually verify these branches:

| Input | Expected output |
| --- | --- |
| bilateral: nominal=25, tolerance=0.13 | USL=25.13, LSL=24.87 |
| MAX-only: tolerance="3 MAX" | USL=3, LSL="" |
| MIN-only: tolerance="0.5 MIN" | USL="", LSL=0.5 |
| null nominal, any tolerance | USL="", LSL="" |
| note/visual type, all "OK" samples | status="OK" |
| note/visual type, any non-"OK" sample | status="NG" |
| no samples | status="OPEN" |

### `sampleData.js`

Demo characteristics loaded on first render. Keep the shape in sync with `createCharacteristic`. If the characteristic data shape changes in `App.jsx`, update `sampleData.js` seeds to match.

### `styles.css`

All CSS variables and component styles. Rules:

- Add new semantic tokens to `:root`, not inline in component rules.
- Never hardcode hex values in component selectors.
- Status badge classes: `.status`, `.status.ok`, `.status.ng`, `.status.open`, `.status.pass`, `.status.fail`, `.status.mini`.
- Table: `table`, `th`, `td`, `.id-cell`, `.readonly`.
- Panels: `.drawing-panel`, `.inspector`, `.table-panel`.
- Toolbar: `.panel-toolbar`, `.tool-group`, `.button`, `.icon-button`, `.icon-button.active`.

## Tech Stack

- React 19 (`useState`, `useMemo`, `useRef`, `useEffect`, `useCallback`)
- Vite 6 (dev server, bundler)
- pdfjs-dist 4.x (PDF rendering, text layer extraction)
- pdf-lib (PDF annotation for balloon export)
- Tesseract.js 7 (OCR for raster drawing areas)
- SheetJS / xlsx (Excel workbook generation)
- lucide-react (icons)

## Commands

Run from the project root (`../`):

```sh
pnpm install
pnpm dev        # http://127.0.0.1:5173/
pnpm build      # output to dist/
pnpm preview
```

No test runner or linter is configured. If adding one:

- tests: `vitest` with `@testing-library/react`
- linting: `eslint` with `eslint-plugin-react` and the Vite React preset

## Generated Files

No generated files. `pdfjs-dist` worker is imported as a URL:

```js
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
```

Do not hand-edit anything inside `node_modules/`.

## Testing Expectations

No automated tests currently. When touching `getLimits` or `getStatus`:

1. Manually verify all branches listed in the `exporters.js` table above.
2. Add a `vitest` unit test file (`src/exporters.test.js`) if the logic grows in complexity.

After any change, run:

```sh
pnpm build
```

A clean build is the minimum verification bar.

## Editing Guidance

- Do not remove or rewrite large sections without being asked.
- Do not reorganize the flat `src/` structure.
- Do not add new npm packages without noting the bundle size impact.
- Keep `exporters.js` free of React imports.
- Keep `App.jsx` free of direct file system, fetch, or network calls.
- When adding a new characteristic field:
  1. Add to `createCharacteristic` factory.
  2. Add to `sampleData.js` seeds.
  3. Add to the table column layout in `App.jsx`.
  4. Add to `exportInspectionWorkbook` row in `exporters.js`.

## Known Codebase Notes

- `App.jsx` is 1000+ lines — this is intentional for a single-page tool; do not split it without user request.
- `characteristics` uses sequential `balloonNo` managed by array index. On deletion, all subsequent balloons renumber.
- Relative coordinates `(x, y)` stored as 0–1 fractions of canvas size. `exportBalloonedPdf` maps these to PDF page points using `page.getSize()`.
- OCR uses Tesseract.js with dynamic import and is loaded lazily on first OCR use.
- `pdfjs-dist` worker is loaded via Vite URL import — do not change the worker import pattern without testing the build.

## Safe Contribution Strategy

When working on a task:

1. Read the nearest handler or function before changing patterns.
2. Check whether a CSS change belongs in `:root` (new token) or in an existing selector.
3. Verify math branch coverage when touching `exporters.js`.
4. Run `pnpm build` after edits.
5. Summarize any assumptions about untested edge cases.

## File Placement Heuristics

| Work type | Where |
| --- | --- |
| Inspection math, limits, status | `src/exporters.js` |
| PDF and Excel export functions | `src/exporters.js` |
| All application state and handlers | `src/App.jsx` |
| CSS tokens and component styles | `src/styles.css` |
| Demo/seed data | `src/sampleData.js` |
| React root mount | `src/main.jsx` — do not add logic here |

## Non-Goals For Small Tasks

Do not bundle in:

- reorganizing `App.jsx` into multiple components or context providers
- adding a routing library
- adding a state management library (Zustand, Redux, Jotai)
- switching from CSS to Tailwind or CSS modules
- adding cloud storage or user accounts
- adding AI-powered auto-ballooning or auto-extraction
