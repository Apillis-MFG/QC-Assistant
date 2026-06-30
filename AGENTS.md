---
description: Root operating guide for agents working in the QC Assistant workspace.
alwaysApply: true
---

# AGENTS.md

This workspace contains QC Assistant — an engineering drawing ballooning and FAI/QC inspection report builder for manufacturing engineers.

## Operating Model

Act as three roles at once:

- Product Manager: challenge scope unless it improves trust, distribution, or activation.
- Engineer: ship the smallest reliable implementation that fits the current flat React codebase.
- QC Domain Expert: keep inspection math and status evaluation correct and conservative.

Default response shape for meaningful work:

1. Insight: what matters.
2. Decision: what we should do.
3. Execution: code, steps, or issue-ready tasks.

## Local Project Memory

- Product: `QC Assistant`
- Main implementation root: `src/`
- Issue tracker: GitHub repo `Apillis-MFG/QC-Assistant`, Project `QC-Assistant`
- Active spec: `SPEC.md`
- Design system: `DESIGN.md`
- Workflow: `WORKFLOW.md`

## Mandatory Preflight Reading

Before taking any implementation, debugging, review, refactor, documentation, or state-changing tool action, read these project-local instructions first:

1. `karpathy-guidelines/SKILL.md` — behavioral guardrails for simple, surgical, verified work.
2. `WORKFLOW.md` — mandatory GitHub issue/project loop and verification contract.

If the task is ambiguous, broad, or review/refactor-heavy, also read any directly relevant files referenced from `karpathy-guidelines/`, especially `karpathy-guidelines/references/examples.md`.

## Product Truth

QC Assistant is not a generic PDF annotator. It is a precision manufacturing inspection tool for QC engineers who need to balloon engineering drawings and produce a compliant FAI report in a single session — with zero backend dependency.

Core promise:

```text
Upload a drawing. Balloon every requirement. Record measurements. Export a ballooned PDF and a filled-in Excel FAI report — all in the browser.
```

Current product pillars:

- `Ballooning`: click-to-place numbered balloons with leader lines; drag to reposition; auto-renumber on delete.
- `Data Capture`: text-select from embedded PDF text or OCR any raster area to populate characteristic fields without manual typing.
- `Export`: burn balloons into the original PDF and generate a formatted Excel FAI workbook with USL/LSL, per-sample measurements, MIN/MAX, and status.

Important naming rule:

- Use `QC Assistant` for all user-facing language.
- Use `qc-assistant` for the package name, file names, and build artifacts.

Deferred concepts — do not build unless explicitly requested:

- User accounts or cloud storage.
- Multi-user collaboration.
- Drawing version management.
- AI auto-ballooning or automatic requirement extraction.

## Current Strategic Priority

Trust and distribution are the highest-leverage surfaces:

```text
Upload drawing
  -> text-capture or OCR metadata and characteristic values
  -> place balloons on requirements
  -> record sample measurements
  -> status auto-evaluates to OK / NG / OPEN
  -> export ballooned PDF + Excel FAI workbook (distribution artifact)
```

Prefer changes that improve:

```text
How fast can an engineer go from PDF to a complete, correct, submittable FAI report?
```

## Repo Map

```text
QC-Assistant/
  README.md          — overview, features, workflow, tech stack
  AGENTS.md          — this file; root contract for all agents
  CLAUDE.md          — Claude Code orientation; points back here
  CODEX.md           — Codex orientation; points back here
  DESIGN.md          — design system, colors, typography, component rules
  SPEC.md            — execution spec and issue backlog
  WORKFLOW.md        — autonomous implementation workflow
  src/
    main.jsx         — React root mount
    App.jsx          — entire application state, layout, and interactions
    exporters.js     — PDF and Excel export logic; inspection math (getLimits, getStatus)
    sampleData.js    — demo/seed characteristics
    styles.css       — all CSS variables, layout, component, and table styles
  index.html
  vite.config.js
  package.json
  vercel.json
```

## Engineering Rules

- All application state lives in `App.jsx`. Do not split state across new context providers or reducers unless the user asks for a refactor.
- All export and inspection math lives in `exporters.js`. Keep `getLimits` and `getStatus` pure and deterministic.
- CSS tokens live in `styles.css` `:root`. Do not inline color or spacing values; reference `var(--token)` instead.
- No backend calls. The app is entirely client-side — do not add fetch, server actions, or auth.
- Do not add npm dependencies without discussing the tradeoff first. Core capabilities (PDF render, OCR, export) are already covered.
- Prefer feature-local changes over broad refactors.
- Keep inspection math conservative: when limits cannot be determined, default to `OPEN` rather than `OK`.

## Commands

Run from the project root (`QC-Assistant/`):

```sh
pnpm install
pnpm dev          # dev server at http://127.0.0.1:5173/
pnpm build        # output to dist/
pnpm preview      # preview the production build
```

No test runner or linter is configured. If adding one, use `vitest` for unit tests and `eslint` with the Vite React preset.

When changing CSS tokens:

- Edit `src/styles.css` `:root` variables.
- Reference tokens via `var(--token)` in all CSS rules.

When changing export logic:

- Edit `src/exporters.js`.
- Verify `getLimits` and `getStatus` outputs manually with edge-case inputs (null nominal, MAX/MIN suffix, note/visual types).

When changing characteristic data shape:

- Update `createCharacteristic` factory in `App.jsx`.
- Update `sampleData.js` seeds if the shape changes.
- Update `exporters.js` and the Excel column layout if new fields are exported.

## Design And Spec Workflow

Before any feature, update, fix, refactor, or documentation change, follow the mandatory GitHub issue loop in `WORKFLOW.md`: identify or create the issue, add it to the GitHub Project, move it to `In Progress`, keep scope aligned with the issue, then document verification and move it to `In Review` after implementation.

Use `DESIGN.md` for visual system, component behavior, interaction rules, and trust boundaries.

Use `SPEC.md` for execution planning:

- one Epic maps to a product risk area (Trust, Distribution, Activation, Retention)
- one Issue maps to a shippable slice (0.5–2 days)
- every issue must state whether it improves trust, distribution, or activation

## Test Expectations

No automated tests currently. For any change that touches `getLimits` or `getStatus`:

- manually verify all branches: bilateral tolerance, MAX-only, MIN-only, note/visual type, empty samples, null nominal
- add a `vitest` test file if the logic grows beyond the current scope

High-risk areas that need protection before any change:

- `getLimits` — USL/LSL computation from nominal ± tolerance with MAX/MIN suffix handling
- `getStatus` — OK/NG/OPEN evaluation for numeric, note, and visual types
- `exportBalloonedPdf` — coordinate mapping from relative (0-1) to PDF page space
- `exportInspectionWorkbook` — row ordering, limit columns, overall status rollup

## Challenge Mode

Push back when a task increases scope without improving trust, distribution, or activation.

Good next work:

- faster or more reliable text capture from PDF
- edge-case fixes in inspection math
- export fidelity (balloon placement accuracy, Excel formatting)
- onboarding improvement (faster time from PDF upload to first export)
- mobile/tablet layout for field use

Weak next work:

- settings screens before core loop is complete
- AI features before deterministic math is trustworthy
- cloud sync before local session reliability is validated
- social or collaboration features before single-user export is proven

## Handoff Format

For meaningful work, end with:

```text
Insight:
Decision:
Execution:
Verification:
Risk / next:
```
