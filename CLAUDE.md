# CLAUDE.md

Claude Code should use this file for tool-specific orientation, then follow [AGENTS.md](AGENTS.md) as the project contract.

## Project

- Product: `QC Assistant`
- Main app: `src/`
- Issue tracker: none yet
- Deploy target: Vercel (see `vercel.json`)

## Claude Operating Rules

- Start from the user outcome, not the requested implementation detail.
- Keep changes small, local, and verifiable.
- All state is in `App.jsx`; all math is in `exporters.js` — respect that boundary.
- Reference CSS tokens via `var(--token)` from `styles.css`; never inline color or spacing values.
- Do not add backend dependencies, auth, or network calls. The app is entirely client-side.
- Keep inspection math conservative: default to `OPEN` when limits are indeterminate, not `OK`.

## Commands

Run from the project root:

```sh
pnpm install
pnpm dev        # http://127.0.0.1:5173/
pnpm build
pnpm preview
```

No linter or test runner is configured. Prefer `vitest` if one is needed.

## Highest-Leverage Work

Prefer work that improves one of:

- **Trust**: inspection math correctness, status evaluation accuracy, export fidelity
- **Distribution**: ballooned PDF quality, Excel FAI workbook completeness and formatting
- **Activation**: faster time from PDF upload to first export; better text/OCR capture reliability

Current product priority:

```text
Upload drawing -> capture values from PDF -> balloon all requirements -> enter measurements -> export PDF + Excel
```

## Handoff Format

For meaningful work, end with:

```text
Insight:
Decision:
Execution:
Verification:
Risk / next:
```
