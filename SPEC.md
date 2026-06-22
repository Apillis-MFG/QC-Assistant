# QC Assistant SPEC

## Insight

QC Assistant is a precision manufacturing inspection tool. The highest-leverage work is not more features — it is ensuring that the inspection math is correct, the export artifacts are complete and submittable, and the time from drawing upload to finished report is as short as possible.

The current strategic bottleneck is **trust**: engineers will only rely on the tool if USL/LSL calculations, status evaluation, and export output are provably correct for every edge case.

## Decision

Use this spec as the execution bridge between product decisions and the issue tracker (when one is adopted).

Issue hierarchy:

```text
QC Assistant v1
  -> Epics: Trust, Distribution, Activation, Release Readiness
  -> Issues: shippable slices sized 0.5–2 days
```

Do not create issues larger than one independently verifiable product slice.

## Sync Model

### Project

```text
QC Assistant v1 — Drawing Ballooning and FAI Report Export
```

Project outcome:

```text
A manufacturing QC engineer can upload any engineering drawing PDF, balloon all requirements,
record sample measurements, and export a ballooned PDF and complete Excel FAI report
without leaving the browser or entering data twice.
```

Project success metrics:

- Engineer completes first export within 15 minutes of opening the tool for the first time.
- All USL/LSL and status evaluations match manual calculations for bilateral, MAX, MIN, note, and visual types.
- Exported Excel workbook passes customer FAI submission without manual edits.
- Ballooned PDF balloon positions match drawing requirements within visual tolerance.

### Epic Types

| Epic | Outcome | Owner Surface |
| --- | --- | --- |
| Trust: Inspection Math | Calculations and status are always correct | `exporters.js` — `getLimits`, `getStatus` |
| Trust: Export Fidelity | PDF and Excel outputs are submission-ready | `exporters.js` — `exportBalloonedPdf`, `exportInspectionWorkbook` |
| Activation: First Session | Engineer reaches first export faster | toolbar, upload flow, text capture, OCR |
| Distribution: Report Quality | Exported artifacts are professional and complete | Excel layout, PDF annotation rendering |
| Release: QA Gate | Build is stable and deployable | Vercel deploy, cross-browser check |

### Labels

Recommended labels:

- `trust`
- `distribution`
- `activation`
- `math`
- `export`
- `pdf`
- `excel`
- `ocr`
- `release-blocker`

## Issue Template

```markdown
## Outcome

What user or engineering behavior changes?

## Scope

- In:
- Out:

## Product Rule

Trust, distribution, or activation reason.

## Implementation Notes

Likely files: `src/exporters.js`, `src/App.jsx`, `src/styles.css`.

## Acceptance Criteria

- [ ] User-visible behavior works
- [ ] Edge or empty state handled
- [ ] Math branches verified manually if `getLimits` or `getStatus` touched
- [ ] Build passes (`pnpm build`)

## Risks

What could break inspection correctness, export fidelity, or drawing integrity?
```

## Current Execution Backlog

### P0-1: Verify all `getLimits` branches against known manufacturing values

Epic:

```text
Trust: Inspection Math
```

Outcome:

```text
USL/LSL computation is verified correct for bilateral (nominal ± tolerance),
MAX-only, MIN-only, note, visual, and null-nominal edge cases.
```

Scope:

- Audit `getLimits` and `getStatus` in `src/exporters.js` for all branch paths.
- Add `vitest` unit tests covering all branches with real manufacturing examples.
- Fix any incorrect output discovered.

Out:

- No UI changes in this slice.
- No changes to Excel or PDF export layout.

Likely files:

- `src/exporters.js`
- `src/exporters.test.js` (new)

Acceptance:

- All branches of `getLimits` return correct values for bilateral, MAX, MIN, null, and note/visual types.
- `getStatus` correctly returns `OPEN`, `OK`, and `NG` for all sample and limit combinations.
- `pnpm build` passes.

### P0-2: Excel FAI workbook submission compliance check

Epic:

```text
Trust: Export Fidelity
```

Outcome:

```text
The exported Excel workbook matches a real customer FAI format well enough
to submit without manual post-processing.
```

Scope:

- Review the current `exportInspectionWorkbook` output against a real FAI template.
- Fix column widths, header labels, and row ordering issues.
- Add overall PASS/FAIL/OPEN label to the correct cell.

Out:

- No changes to PDF export in this slice.
- No new metadata fields.

Likely files:

- `src/exporters.js`

Acceptance:

- Excel header rows contain Drawing No, Rev, Supplier, Description, and overall status.
- Characteristic rows are sorted by balloon number.
- Sample columns are labeled `#1` through `#N`.
- MIN, MAX, and Status columns are present and correct.
- Measurement equipment abbreviation legend is included.

### P0-3: Balloon coordinate accuracy for multi-page and zoomed PDFs

Epic:

```text
Trust: Export Fidelity
```

Outcome:

```text
Balloon circles and leader lines appear at the correct positions on the exported PDF
regardless of page size, zoom level, or page number.
```

Scope:

- Audit `exportBalloonedPdf` coordinate mapping from `(x, y)` relative fractions to PDF page points.
- Test with A3, A1, and landscape drawings.
- Fix any offset or scale errors.

Out:

- No changes to Excel export in this slice.

Likely files:

- `src/exporters.js`

Acceptance:

- Balloon appears at the correct location on the exported PDF for pages of varying sizes.
- Leader line connects balloon circle to target point within 2px visual tolerance.
- Multi-page drawings export balloons on the correct page.

### P1-1: Text capture reliability for rotated and small PDF text

Epic:

```text
Activation: First Session
```

Outcome:

```text
Text Select mode reliably captures dimension values from PDF text items
that are rotated, small, or tightly spaced.
```

Scope:

- Review `textItems` extraction and the click-to-capture logic in `App.jsx`.
- Improve hit area for small font sizes.
- Preserve rotation transform for rotated text items.

Out:

- No changes to OCR mode in this slice.

Likely files:

- `src/App.jsx`

Acceptance:

- Clicking a text item with font size ≤ 9px captures the correct value.
- Rotated text items can be selected and captured.
- Non-selectable raster text is not affected (OCR mode covers that path).

### P1-2: Mobile and tablet layout for field inspection use

Epic:

```text
Activation: First Session
```

Outcome:

```text
QC engineers can use the tool on a tablet in the field without horizontal scrolling
or inaccessible touch targets.
```

Scope:

- Fix touch targets for toolbar buttons (minimum 44px).
- Make the table scroll horizontally within its container on narrow screens.
- Ensure inspector panel is accessible below the drawing panel on single-column layout.

Out:

- No changes to export logic.
- No native app or PWA features.

Likely files:

- `src/styles.css`
- `src/App.jsx` (touch event handling)

Acceptance:

- All toolbar buttons are at least 44px tall on screens narrower than 768px.
- QC table scrolls horizontally without affecting page scroll.
- Inspector panel is reachable without horizontal scroll on iPad-width screens.

## Status Rules

- Backlog: not selected for current sprint
- Ready: clear scope and acceptance criteria
- In Progress: actively being implemented
- In Review: code complete, verification notes added
- Done: acceptance criteria met, verified, and merged
- Parked: valid but intentionally deferred

Do not move an issue to Done unless the acceptance criteria are satisfied or the remaining gap is documented in the issue.

## Definition Of Ready

An issue is ready when it has:

- clear user outcome
- one owner surface (math, export, UI)
- explicit non-goals
- acceptance criteria
- likely file areas
- trust/distribution/activation rationale

## Definition Of Done

An issue is done when:

- user-visible or math behavior works as specified
- edge and empty states are handled
- math branches manually verified if `getLimits` or `getStatus` was touched
- build passes (`pnpm build`)

## Release Gate

Before calling v1 complete, verify:

- engineer can go from PDF upload to first export with no blocking UX errors
- all inspection math branches return correct values
- exported Excel matches a real customer FAI submission format
- exported PDF balloon positions are visually accurate
- tool works in Chrome, Firefox, and Safari without layout breaks
