---
tracker:
  kind: github
  repo: Apillis-MFG/QC-Assistant
  project:
    owner: Apillis-MFG
    number: 1
    title: QC-Assistant
    url: https://github.com/orgs/Apillis-MFG/projects/1
polling:
  interval_ms: 30000
workspace:
  root: ".symphony/workspaces"
hooks:
  after_create: |
    git status --short || true
  before_run: |
    git status --short
  after_run: |
    true
  before_remove: |
    true
  timeout_ms: 120000
agent:
  max_concurrent_agents: 1
  max_turns: 8
  max_retry_backoff_ms: 300000
---
# QC Assistant Autonomous Workflow

You are an autonomous implementation agent working on `QC Assistant` from an issue or task description.

## Mandatory GitHub Issue Loop

Before doing any implementation, fix, debug, refactor, or documentation change:

1. Identify the relevant GitHub issue in `Apillis-MFG/QC-Assistant`, or create one if no suitable issue exists.
2. Add or update the issue so it has a clear user outcome, scope, non-goals, acceptance criteria, and trust/distribution/activation rationale.
3. Add the issue to the GitHub Project `QC-Assistant` at `https://github.com/orgs/Apillis-MFG/projects/1`.
4. Move the project item to `In Progress` before editing files or running implementation work.

While working:

- Keep the issue as the source of truth for scope and acceptance criteria.
- If implementation changes direction, update the issue description or add a comment before continuing.
- If the task does not clearly improve trust, distribution, or activation, add a comment explaining the concern and wait for confirmation before building it.

After implementation:

1. Add a completion comment to the issue with:
   - what changed
   - verification performed
   - pass/fail result
   - math branches checked, when relevant
   - remaining risk or follow-up
2. Move the project item to `In Review` when that status exists.
3. If the project does not have `In Review`, keep the item in `In Progress` and state in the completion comment that it is ready for review.
4. Do not move the item to `Done` unless acceptance criteria are satisfied, verification is documented, and the work has been merged or explicitly accepted.

## Product North Star

QC Assistant helps manufacturing QC engineers produce a complete, correct, and submittable FAI inspection report from any engineering drawing PDF — entirely in the browser, with no backend dependency.

Every task must improve at least one of:

- **Trust**: inspection math correctness, status evaluation accuracy, export fidelity.
- **Distribution**: ballooned PDF quality, Excel FAI workbook completeness.
- **Activation**: faster time from PDF upload to first export; better text/OCR capture.

If the task does not clearly improve one of those, add a comment explaining the concern before proceeding.

## Current Ship Path

```text
Upload drawing PDF
  -> fill in header metadata (Drawing No, Rev, Supplier, Description)
  -> text-capture or OCR values from drawing
  -> place numbered balloons on all requirements
  -> set type, unit, nominal, tolerance, measurement method per balloon
  -> enter sample measurements; status auto-evaluates (OK / NG / OPEN)
  -> export ballooned PDF + Excel FAI workbook
```

Do not build cloud sync, user accounts, AI auto-ballooning, or collaboration features on this path.

## Engineering Rules

- Work from `src/` for all application code.
- All state is in `App.jsx` — preserve the flat component structure unless a refactor is explicitly requested.
- All inspection math (`getLimits`, `getStatus`) lives in `exporters.js` — keep it pure and deterministic.
- CSS tokens live in `styles.css` `:root`. Reference `var(--token)`; never inline values.
- No backend calls. Do not add fetch, auth, or network dependencies.
- Do not add npm packages without documenting the bundle size impact.
- Verify math branches manually when touching `getLimits` or `getStatus`.

## Verification Ladder

Default build check:

```sh
pnpm build
```

Math verification (when `exporters.js` is touched):

- bilateral: nominal=25, tolerance=0.13 → USL=25.13, LSL=24.87
- MAX-only: nominal=25, tolerance="3 MAX" → USL=3, LSL=""
- MIN-only: nominal=0, tolerance="0.5 MIN" → USL="", LSL=0.5
- null nominal: nominal="", tolerance=0.1 → USL="", LSL=""
- note/visual type: all samples "OK" → status=OK; any other value → NG
- empty samples → status=OPEN

Export verification (when `exporters.js` export functions are touched):

- generate a test PDF export and visually confirm balloon positions
- generate a test Excel export and confirm header rows, characteristic rows, MIN/MAX columns, and status

Targeted math examples:

```sh
# Run after adding vitest:
pnpm vitest run src/exporters.test.js
```

## Review Standard

A task is review-ready only when:

- Acceptance criteria from the issue are implemented.
- The user-visible path is verified (build passes, export checked manually).
- Math branches are verified if `getLimits` or `getStatus` was touched.
- No new hardcoded colors or spacing values were introduced.
- No backend dependencies were added.

## Handoff Format

End every run with:

```text
Insight:
Decision:
Execution:
Verification:
Risk / next:
```
