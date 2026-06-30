---
name: karpathy-guidelines
description: Behavioral guardrails for AI coding work. Use when writing, reviewing, debugging, refactoring, or planning code changes where the agent should avoid wrong assumptions, overengineering, drive-by edits, or unverifiable completion.
---

# Karpathy Guidelines

Use this skill as a quality gate for non-trivial QC Assistant coding, debugging, refactoring, review, or architecture work. Bias toward explicit assumptions, simple code, surgical diffs, and verified outcomes.

## Operating Loop

1. Define the user outcome and success criteria.
2. Surface assumptions that affect scope, data, safety, inspection math correctness, or export fidelity.
3. Choose the smallest implementation that satisfies the outcome.
4. Change only files and lines that trace to the request.
5. Verify with the narrowest meaningful test or command.
6. Report what changed, what passed, and any residual risk.

## Simplicity First

- Do not add speculative features, extension points, configuration systems, or new packages.
- Do not introduce an abstraction for a single caller unless it removes real local complexity.
- Prefer existing project patterns before new structure.
- Keep error handling grounded in realistic failure modes for this product (PDF parsing failures, malformed tolerance strings, empty sample arrays).
- If the solution feels large relative to the request, reduce scope before editing.

## Surgical Changes

- Match surrounding style.
- Do not reformat, rename, or refactor adjacent code as a side effect.
- Remove unused code only when your change made it unused.
- Mention unrelated concerns in the final handoff instead of editing them.

## Architectural Boundaries

These are hard constraints — do not cross them without an explicit user decision:

- **State**: all application state lives in `App.jsx`. Do not move state to new context providers or reducers.
- **Math**: all inspection math (`getLimits`, `getStatus`) lives in `exporters.js`. Keep these functions pure and deterministic.
- **Styles**: reference CSS tokens via `var(--token)` from `styles.css`. Never inline color or spacing values.
- **Client-only**: no backend calls, no auth, no network requests. The app is entirely client-side.
- **Dependencies**: do not add npm packages without discussing the tradeoff first.

## Inspection Math Safety Rule

When limits are indeterminate (null nominal, ambiguous tolerance, note/visual type), default to `OPEN` — never to `OK`. A false `OK` on a manufacturing FAI is a trust failure.

## Project Fit

Prioritize work that improves one of:

- **Trust**: inspection math correctness, status evaluation accuracy, export fidelity
- **Distribution**: ballooned PDF quality, Excel FAI workbook completeness and formatting
- **Activation**: faster time from PDF upload to first export; better text/OCR capture reliability

Challenge work that does not improve one of those outcomes.

## High-Risk Areas

Extra care required before changing these — manually verify all branches after any edit:

- `getLimits` — USL/LSL from nominal ± tolerance with MAX/MIN suffix handling
- `getStatus` — OK/NG/OPEN for numeric, note, and visual types; empty samples; null nominal
- `exportBalloonedPdf` — coordinate mapping from relative (0–1) to PDF page space
- `exportInspectionWorkbook` — row ordering, limit columns, overall status rollup

## Examples

Read `references/examples.md` when a task involves ambiguous implementation, refactoring, review, or broad changes.
