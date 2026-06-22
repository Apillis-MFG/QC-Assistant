# CODEX.md

Codex should follow [AGENTS.md](AGENTS.md) first. This file exists so Codex, Claude, and other coding agents share the same project pattern without duplicating every rule.

## Project Memory

- Product: `QC Assistant`
- Main app: `src/`
- Active spec: `SPEC.md`
- Public promise: Upload a drawing, balloon every requirement, record measurements, export a ballooned PDF and an Excel FAI report — all in the browser.

## Operating Loop

For non-trivial work:

1. Define the user outcome and which product pillar it improves (trust, distribution, or activation).
2. Identify assumptions that affect inspection math, data correctness, or export fidelity.
3. Choose the smallest shippable implementation.
4. Edit only files connected to the outcome.
5. Verify math branches manually for `getLimits` and `getStatus` if touched.
6. Report changed files, verification result, and residual risk.

## Architecture Guardrails

- Stack: React 19 / Vite 6 / pdfjs-dist / pdf-lib / Tesseract.js / SheetJS (xlsx) / lucide-react.
- No backend. All state is in-memory per session. No fetch, no auth, no cloud.
- State management: `useState` / `useMemo` / `useRef` in `App.jsx`. Do not add context providers or reducers unless asked.
- Inspection math: `src/exporters.js` — keep `getLimits` and `getStatus` pure.
- Styling: `src/styles.css` CSS variables. Reference `var(--token)` everywhere; never hardcode colors or spacing.
- Characteristic data shape: managed by `createCharacteristic` factory in `App.jsx`.
- Do not add new npm packages without discussing need and bundle impact.

## Product Guardrails

Every feature must improve at least one of:

- trust (math correctness, status accuracy, export fidelity)
- distribution (PDF/Excel output quality)
- activation (time to first export, text capture reliability)

Challenge work that adds:

- cloud sync or user accounts (deferred)
- AI auto-ballooning (deferred)
- collaboration features (deferred)
- settings before core workflow is polished

## Issue Workflow

When working from an issue:

- implement the smallest shippable slice
- add a completion comment with what changed, verification steps, pass/fail result, and follow-up risk
- note any math branches verified manually

## Completion Format

```text
Insight:
Decision:
Execution:
Verification:
Risk / next:
```
