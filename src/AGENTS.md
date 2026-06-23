---
description: App-level guide for agents working inside QC Assistant's src/ folder.
alwaysApply: true
---

# AGENTS.md — src/

This file orients coding agents working inside `src/`. For product policy and engineering rules, follow the root `../AGENTS.md` first. This nested guide wins only for exact code placement, file structure, and app-specific implementation details.

## Project Summary

QC Assistant is an engineering drawing ballooning and FAI inspection report builder. All logic runs client-side with no backend dependency.

Primary goals when editing:

- before any code or documentation edit, follow the mandatory GitHub issue loop in `../WORKFLOW.md`
- keep inspection math in `exporters.js` correct and pure
- keep all application state in `App.jsx` unless a refactor is explicitly requested
- do not break the balloon placement → measurement entry → export workflow
- reference CSS tokens via `var(--token)` — never hardcode colors or spacing

## Repo Layout

```text
src/
  main.jsx               — React root mount; no logic here
  App.jsx                — application state, layout, modes, callbacks, and render (~1,850 lines)
  styles.css             — all CSS variables (:root) and component styles
  lib/
    constants.js         — shared constants: methods, types, geometry offsets, defaultPanelSizes, emptyMetadata
    utils.js             — pure utilities: snapshot helpers, storage warnings, geometry, text mapping, createCharacteristic
    autoBalloon.js       — auto-balloon detection pipeline (embedded PDF text + Tesseract OCR)
    exporters.js         — inspection math (getLimits, getStatus) and PDF/Excel export
    projectStore.js      — IndexedDB persistence: projects and drawings
    sampleData.js        — demo characteristics used to seed the app on load
  components/
    ErrorBoundary.jsx    — top-level React error boundary
    Field.jsx            — metadata input label wrapper
    ToolButton.jsx       — toolbar icon button
    ResizeHandle.jsx     — draggable / keyboard panel separator
    CanvasOverlay.jsx    — TextLayer, LeaderLayer, AutoBalloonPreview overlays
    AutoBalloonReview.jsx — candidate review panel (remove / commit)
    BalloonEditor.jsx    — inspector panel for editing a single balloon's fields
    CharacteristicTable.jsx — QC/FAI table with inline editing and row delete
    MeasurementWorkspace.jsx — measurement-mode layout: view-only drawing + MeasurementTable
    ProjectDashboard.jsx — project list management (create, rename, delete, open)
    HelpDialog.jsx       — keyboard shortcuts and release notes modal
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

1. Imports — React hooks, lucide icons, pdfjs-dist, and all project modules
2. `App` component — state declarations (`useState`, `useRef`)
3. Derived state (`useMemo` for `selected`, `currentPageBalloons`, `projectStatus`)
4. Effects — workspace restore, PDF page render, shortcut keys, autosave timer
5. Callbacks — project/drawing CRUD, balloon placement, drag, pan, text-capture, OCR, export
6. Render — dashboard branch, topbar, layout-bar, edit-mode layout, measurement-mode layout

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

Demo characteristics loaded on first render. Keep the shape in sync with `createCharacteristic` in `utils.js`. If the characteristic data shape changes, update `sampleData.js` seeds to match.

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
  1. Add to `createCharacteristic` factory in `lib/utils.js`.
  2. Add to `lib/sampleData.js` seeds.
  3. Add to the table column layout in `components/CharacteristicTable.jsx` and `components/MeasurementWorkspace.jsx`.
  4. Add to `components/BalloonEditor.jsx` if it should be editable in the inspector.
  5. Add to `exportInspectionWorkbook` row in `lib/exporters.js`.

## Known Codebase Notes

- `App.jsx` is ~1,850 lines — it holds all state and callbacks; components and utilities are now in separate files.
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
| Inspection math, limits, status | `src/lib/exporters.js` |
| PDF and Excel export functions | `src/lib/exporters.js` |
| Application state and callbacks | `src/App.jsx` |
| Shared constants (no logic) | `src/lib/constants.js` |
| Pure utility functions | `src/lib/utils.js` |
| Auto-balloon detection logic | `src/lib/autoBalloon.js` |
| IndexedDB project storage | `src/lib/projectStore.js` |
| UI components | `src/components/<ComponentName>.jsx` |
| CSS tokens and component styles | `src/styles.css` |
| Demo/seed data | `src/lib/sampleData.js` |
| React root mount | `src/main.jsx` — do not add logic here |

## Non-Goals For Small Tasks

Do not bundle in:

- reorganizing `App.jsx` into multiple components or context providers
- adding a routing library
- adding a state management library (Zustand, Redux, Jotai)
- switching from CSS to Tailwind or CSS modules
- adding cloud storage or user accounts
- adding AI-powered auto-ballooning or auto-extraction
