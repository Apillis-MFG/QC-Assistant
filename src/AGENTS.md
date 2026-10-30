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
  main.jsx            — React root mount and router provider
  App.jsx             — routes, application state coordination, and drawing-to-table event handlers
  styles.css          — CSS design tokens (:root) and component styles
  components/
    panels.jsx        — Dashboard, Detail, Table, Inspector, Settings, Tolerance, and Template dialogs
    widgets.jsx       — drawing toolbar, canvas overlays, text layer, and leader line rendering
    AuthScreens.jsx   — optional cloud login and invite acceptance screens
    OnboardingScreen.jsx — optional company onboarding
    ErrorBoundary.jsx — error boundary wrapper
  context/
    AuthContext.jsx   — opt-in cloud authentication context
  lib/
    exporters.js      — pure inspection math (getLimits, getStatus) and PDF/Excel export builders
    faiTemplate.js    — custom Excel FAI template validation, inspection, and filling
    occurrences.js    — repeated-dimension occurrence math and stable identifier grouping
    projectStore.js   — IndexedDB local project/drawing/PDF persistence
    supabaseStore.js  — opt-in Supabase cloud collaboration integration
    supabaseClient.js — Supabase SDK client initialization
    ocrPreprocessing.js — contrast normalization and adaptive binarization
    dimensionExtractor.js — title block tolerance parser and decimal-place matcher
    autoBalloon.js    — embedded text and OCR balloon candidate detectors
    utils.js          — geometric math, clipboard grid parsing, dimension parsing
    constants.js      — shared constants, unit system definitions, default panel sizes
    sampleData.js     — demo characteristics used to seed the app on load
```

## Architecture Reality

- Application state is coordinated in `src/App.jsx` with routes provided via `react-router-dom`.
- Inspection math in `src/lib/exporters.js` is strictly pure and deterministic (free of DOM/React dependencies).
- Local persistence runs client-side via IndexedDB (`qca_projects_v1`).
- Cloud synchronization (`supabaseStore.js`, `AuthContext.jsx`) is strictly opt-in per project; the default local workflow requires no network or login.
- CSS is global with class-based tokens in `src/styles.css` — no CSS modules, no Tailwind, no styled-components.

Practical guidance:

- follow the existing patterns in the area you touch
- prefer feature-local changes over broad refactors
- keep inspection math deterministic and conservative (default to `OPEN` when indeterminate)
- use design tokens from `styles.css` (`var(--token)`)

## Current Architecture: App.jsx Sections

`App.jsx` coordinates workspace interaction and project routing:

1. Imports, constants, and panel size loaders
2. `createCharacteristic` factory function
3. `App` component — state declarations (projects, drawings, active drawing state)
4. Derived state (`useMemo` for `selected`, `currentPageBalloons`, `resolvedTolerances`, `projectStatus`)
5. PDF load and page render effects (`useEffect`)
6. Text capture & OCR logic
7. Interaction handlers (balloon placement, dragging, pan, auto-balloon review)
8. Export handlers (PDF, Excel AS9102, custom template, batch rollups)
9. Route definitions (Dashboard, Project Detail, Workspace, Settings, Help/Guides)

## Key Files

### `src/lib/exporters.js`

Contains all inspection math and export logic:

- `parseNumber(value, unit)` — safely extracts numeric value (including DMS angles and fractions)
- `getLimits(characteristic)` — computes USL and LSL from nominal and tolerance (bilateral, unilateral, MAX, MIN, DMS, null)
- `getStatus(characteristic, sampleCount)` — returns `"OPEN"`, `"OK"`, or `"NG"`
- `exportBalloonedPdf(...)` — annotates PDF with numbered circles, leader lines, and solid arrowheads
- `buildInspectionWorkbook(...)` / `exportInspectionWorkbook(...)` — generates AS9102 Rev C compliant Excel FAI workbooks (Forms 1, 2, 3)
- `buildBatchInspectionWorkbook(...)` / `exportBatchInspectionWorkbook(...)` — multi-drawing project rollup workbook
- `generateBatchBalloonedPdf(...)` / `exportBatchBalloonedPdf(...)` — multi-drawing merged ballooned PDF package

**Keep these functions pure.** Do not import React or access DOM from `src/lib/exporters.js`.

### `src/lib/faiTemplate.js`

Uploaded customer blank `.xlsx` template mapping engine:
- `inspectTemplateWorkbook(bytes)` — inspects worksheets, dimensions, and ranges
- `validateTemplateConfig(template, charCount, sampleCount)` — validates cell addresses, columns, and capacity
- `fillCustomTemplateWorkbook(...)` — populates mapped headers and characteristics into the customer's exact format
- `exportCustomInspectionWorkbook(...)` — downloads filled custom workbook

### `src/lib/occurrences.js`

Manages repeated-dimension occurrences (e.g. `3X Ø10 ±0.1` -> `5.1`, `5.2`, `5.3`):
- `resizeOccurrences(items, id, quantity)`
- `compareOccurrences(a, b)`
- `balloonLabel(item)`
- `missingOccurrences(items)`

### `src/styles.css`

All CSS variables and component styles. Rules:

- Add new semantic tokens to `:root`, not inline in component rules.
- Never hardcode hex values in component selectors.
- Status badge classes: `.status`, `.status.ok`, `.status.ng`, `.status.open`, `.status.pass`, `.status.fail`, `.status.mini`.

## Commands

Run from the project root (`../`):

```sh
pnpm install
pnpm dev        # http://127.0.0.1:5173/
pnpm test       # runs all 13 deterministic verification suites
pnpm build      # production build (Vite)
pnpm preview
```

## Testing Expectations

The project maintains 13 deterministic verification suites executed via `pnpm test`:

- `verify-inspection-math.mjs` — limits, DMS angles, status evaluation
- `verify-unit-parsing.mjs` — dual dimension parsing, imperial/metric conversions
- `verify-repeated-dimensions.mjs` — occurrence resizing, sorting, base swaps
- `verify-excel-export.mjs` — AS9102 Form 1, Form 2, and Form 3 structure
- `verify-pdf-export.mjs` — coordinate transformation, leader arrowheads, multi-page export
- `verify-text-capture.mjs` — rotated text, small fonts, hit detection
- `verify-responsive-layout.mjs` — mobile/tablet breakpoints, touch targets
- `verify-ocr-preprocessing.mjs` — contrast stretching, adaptive binarization
- `verify-keyboard-shortcuts.mjs` — high-throughput shortcuts, modal guards
- `verify-batch-samples.mjs` — auto-fill modes, clipboard matrix pasting
- `verify-batch-pdf-export.mjs` — multi-drawing PDF package merging
- `verify-batch-excel-export.mjs` — multi-drawing master workbook rollup
- `verify-fai-template.mjs` — uploaded customer Excel template mapping & export

After any change, run:

```sh
pnpm test && pnpm build
```

A 100% test pass and clean build is the minimum verification bar.

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
