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

### Backlog Status Summary

| ID | Title | Epic | Status | Shipped / Target |
| --- | --- | --- | --- | --- |
| P0-1 | Verify all `getLimits` branches against known manufacturing values | Trust: Inspection Math | Done | v0.9.1 |
| P0-2 | Excel FAI workbook submission compliance check | Trust: Export Fidelity | Done | v0.9.1 |
| P0-3 | Balloon coordinate accuracy for multi-page and zoomed PDFs | Trust: Export Fidelity | Done | v0.9.1 |
| P0-4 | AS9102 Rev C Multi-Sheet FAI Workbook Export (Forms 1, 2, 3) | Trust: Export Fidelity | Done | v0.9.1 |
| P0-5 | Metric & Imperial Dual Dimensioning & Tolerance Conversion | Trust: Inspection Math | Done | v0.9.1 |
| P0-6 | Non-Standard Angle Unit Conversions (Degrees-Minutes-Seconds) | Trust: Inspection Math | Done | v0.9.1 |
| P1-1 | Text capture reliability for rotated and small PDF text | Activation: First Session | Done | v0.9.1 |
| P1-2 | Mobile and tablet layout for field inspection use | Activation: First Session | Done | v0.9.1 |
| P1-3 | OCR Preprocessing & Contrast Enhancement | Activation: First Session | Done | v0.9.1 |
| P1-4 | Keyboard Shortcuts & High-Throughput Quick-Ballooning | Activation: First Session | Done | v0.9.1 |
| P1-5 | Batch Sample Auto-Fill & Clipboard Pasting | Activation: First Session | Done | v0.9.1 |
| P1-6 | Multi-Drawing Batch PDF Export | Distribution: Report Quality | Done | v0.9.1 |
| P1-7 | Multi-Drawing FAI Report Rollup (Combined AS9102 Multi-Part Package) | Distribution: Report Quality | Done | v0.9.1 |
| P1-8 | Uploaded Excel FAI Templates (Custom Customer Form Ingestion & UI Mapping) | Distribution: Report Quality | Done | v0.9.2 |
| P2-1 | Solid Arrowhead Terminations on Balloon Leader Lines | Distribution: Report Quality | Done | v0.9.1 |
| P1-8b | Custom Excel FAI Template Validation Hardening & Dual-Dimension Parity | Trust: Export Fidelity | Done | v0.9.3 |

---

### P1-8b: Custom Excel FAI Template Validation Hardening & Dual-Dimension Parity

Status:

```text
Done (shipped in v0.9.3)
Verification: scripts/verify-fai-template.mjs (100% PASS)
```

Epic:

```text
Trust: Export Fidelity
```

Outcome:

```text
Custom Excel FAI template mapping prevents accidental formula overwrite and merged-cell collisions,
accurately validates capacity against expanded occurrence counts for repeated dimensions,
preserves dual-dimension notes on customer exports, and safely handles modal keyboard/cloud persistence boundaries.
```

Scope:

- In `src/lib/faiTemplate.js`:
  - Enhance `validateTemplateConfig` to verify target worksheet exists in workbook bytes.
  - Detect and reject mapped table column/row ranges that intersect merged cell ranges (`!merges`) in the target sheet.
  - Detect and reject mapped header or table cells that contain pre-existing formulas (`cell.f`), preventing formula clobbering.
  - In `fillCustomTemplateWorkbook`, append `[Dual: ...]` reference to row notes when `item.dual` is present, matching standard Form 3 export behavior.
- In `src/components/panels.jsx`:
  - Update `FaiTemplateDialog` capacity validation to compute total row count including expanded occurrences (`quantity > 1`) across all drawing characteristics.
- In `src/App.jsx`:
  - Add `templateDialogOpen` to the keyboard shortcut handler so `Escape` dismisses the template dialog and background shortcuts are suppressed while open.
  - Guard `handleSaveProjectTemplate` and `handleRemoveProjectTemplate` so cloud-backed projects do not inadvertently save shadow local projects into IndexedDB.
- Verification tests in `scripts/verify-fai-template.mjs`:
  - Deterministic checks for merged-cell rejection, formula-cell conflict rejection, unexpanded occurrence capacity checking, and dual-dimension note preservation.

Out:

- No external/npm dependencies.
- No automatic cell-mapping heuristics or dynamic row expansion.

Likely files:

- `src/lib/faiTemplate.js`
- `src/components/panels.jsx`
- `src/App.jsx`
- `scripts/verify-fai-template.mjs`

Acceptance:

- [x] Templates with merged cells in the mapped inspection range are rejected with an actionable error message.
- [x] Templates with pre-existing formulas in mapped target cells are rejected before writing.
- [x] Characteristics with unexpanded repeated quantities (e.g. `3X Ø10`) count all 3 instances against template capacity in `FaiTemplateDialog`.
- [x] Exported custom templates include dual-dimension bracketed notes when dual callouts exist.
- [x] `Escape` cleanly closes `FaiTemplateDialog` without firing underlying canvas shortcuts.
- [x] 100% of offline verification tests and `pnpm build` pass cleanly.

---

### P1-8: Uploaded Excel FAI Templates (Custom Customer Form Ingestion & UI Mapping)

Status:

```text
Done (shipped in v0.9.2)
Verification: scripts/verify-fai-template.mjs (100% PASS)
```

Epic:

```text
Distribution: Report Quality
```

Outcome:

```text
Engineers can upload customer-specific blank .xlsx FAI templates, map header cell addresses
and table column targets, validate row capacity, persist the template locally with the project,
and export completed inspection workbooks into the customer's exact format with one click.
```

Scope:

- Add `src/lib/faiTemplate.js` implementing:
  - `normalizeFaiTemplate` data schema.
  - `isValidCellAddress` and `isValidColumnLetter` A1 notation validation.
  - `inspectTemplateWorkbook` extracting worksheet names, dimensions, and ranges.
  - `validateTemplateConfig` enforcing required columns, capacity bounds, duplicate column guards, and header/table overlap checks.
  - `clearMappedTableCells` clearing only declared writable cells prior to export.
  - `fillCustomTemplateWorkbook` generating a fresh copy of the customer's workbook with mapped headers and sorted characteristic rows.
  - `exportCustomInspectionWorkbook` client-side Excel download.
- Add `FaiTemplateDialog` in `src/components/panels.jsx`:
  - Upload blank `.xlsx` template.
  - Worksheet selection dropdown.
  - Header cell mapping inputs (A1 notation).
  - Table start/end row inputs with live capacity badge.
  - Characteristic column mappings (Balloon #, Nominal, Tolerance, USL, LSL, Min, Max, Method, Status, Notes).
  - Dynamic sample column inputs matching active sample count.
  - Real-time validation feedback and error list.
  - "Save Template" and "Use Default Report" actions.
- Workspace Topbar and Project Details integration in `src/App.jsx`:
  - Primary button dynamically displays active template name `Excel (<Name>)`.
  - Secondary "Default" button allows fallback to standard AS9102 export without removing template.
  - Quick access "Template" / settings button opening the configuration dialog.
  - Project Info panel displays configured template status.
- Extend `src/lib/projectStore.js` to persist `faiTemplate` with the local project and track byte length in storage estimates.
- Re-export template engine utilities from `src/lib/exporters.js`.
- Deterministic verification tests in `scripts/verify-fai-template.mjs`.

Out:

- No dynamic row insertion, macros, or server-side Excel generation.
- No cloud synchronization of template bytes in MVP (remains local to project in IndexedDB).

Likely files:

- `src/lib/faiTemplate.js`
- `src/lib/projectStore.js`
- `src/lib/exporters.js`
- `src/components/panels.jsx`
- `src/App.jsx`
- `src/styles.css`
- `scripts/verify-fai-template.mjs`

Acceptance:

- Valid templates accept mapping and export to the customer's layout with correct limits and statuses.
- Insufficient table row capacity is rejected with clear error message.
- Duplicate column mappings and overlapping header targets are rejected.
- Unused rows and sample columns within declared bounds remain blank.
- Original template bytes remain immutable.
- Topbar shows active template name and default fallback action.
- 100% of offline verification test suites and production build pass cleanly.

### P0-1: Verify all `getLimits` branches against known manufacturing values

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-inspection-math.mjs (100% PASS)
```

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

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-excel-export.mjs (100% PASS)
```

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

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-pdf-export.mjs (100% PASS)
```

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

### P0-4: AS9102 Rev C Multi-Sheet FAI Workbook Export (Forms 1, 2, and 3)

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-excel-export.mjs (100% PASS)
```

Epic:

```text
Trust: Export Fidelity
```

Outcome:

```text
Excel export generates an audit-ready AS9102 Rev C compliant workbook containing Form 1 (Part Number Accountability),
Form 2 (Product Process Accountability), and Form 3 (Characteristic Accountability) without requiring manual data re-entry.
```

Scope:

- Implement `buildAs9102Form1` with part number, revision, description, FAI report number, process reference, and disposition blocks.
- Implement `buildAs9102Form2` with raw material, special processing/finishes, general note workmanship, and characteristic verification conformance rows.
- Retain primary `FAI Report` (Form 3) sheet and table structure with full backward compatibility.
- Multi-sheet workbook builder and export option toggle (`includeAs9102Forms`).
- Deterministic verification suite covering Form 1, Form 2, and multi-sheet structure in `scripts/verify-excel-export.mjs`.

Out:

- No external/npm dependencies (pure SheetJS `xlsx` structure).
- No manual template file requirements.

Likely files:

- `src/lib/exporters.js`
- `scripts/verify-excel-export.mjs`

Acceptance:

- Exported workbook includes `FAI Report`, `AS9102 Form 1`, and `AS9102 Form 2` sheets.
- Form 1 accurately populates part number, revision, supplier, FAI report number, and overall disposition.
- Form 2 populates standard material, finish, workmanship, and characteristic compliance rows.
- 100% of Excel verification tests and full build pass cleanly.

### P0-5: Metric & Imperial Dual Dimensioning & Tolerance Conversion

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-unit-parsing.mjs (100% PASS)
```

Epic:

```text
Trust: Inspection Math
```

Outcome:

```text
Drawings with dual dimension callouts (e.g. `25.40 [1.000] ±0.10 [±.004]`) automatically parse both primary
and bracketed secondary values, infer units accurately from mathematical scale, and preserve dual traceability in FAI reports.
```

Scope:

- Upgrade `parseDimension` to recognize bracketed secondary dimensions (`[secondary]`) across all standard layouts.
- Auto-infer `MM` vs `IN` unit assignment based on the $25.4$ metric/imperial scale ratio.
- Pure conversion helpers `convertLinearValue`, `convertToleranceString`, and `isDualDimensionConsistent`.
- Compute dual limit envelopes via `getDualLimits({ primary, dual })` in `src/lib/exporters.js`.
- Export bracketed dual references in Excel FAI notes column for customer compliance auditability.
- Deterministic unit tests covering dual dimension syntax and conversions in `scripts/verify-unit-parsing.mjs`.

Out:

- No changes to single-dimension parsing contracts.
- No unit conversion of recorded physical sample measurements.

Likely files:

- `src/lib/utils.js`
- `src/lib/exporters.js`
- `src/App.jsx`
- `scripts/verify-unit-parsing.mjs`

Acceptance:

- Dual dimensions with brackets (`25.4 [1.000]`, `25.4 ±0.1 [1.000 ±.004]`, `Ø12.00 +0.05/-0.02 [.472 +.002/-.001]`) parse both nominals and tolerances.
- Inferred units assign `MM` to the millimeter value and `IN` to the inch value.
- Rejection guards for products (`2x10x20`) and threads (`2X M10`) remain intact.
- 100% of offline verification tests and production build pass.

### P0-6: Non-Standard Angle Unit Conversions (Degrees-Minutes-Seconds)

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-inspection-math.mjs (100% PASS)
```

Epic:

```text
Trust: Inspection Math
```

Outcome:

```text
Drawings with angular callouts in Degrees-Minutes-Seconds (DMS) notation (e.g. `45° 30' ±15'`,
`45° 30' 36" ±18"`, `30° 15' +10'/-5'`, `45° 30' MAX`) parse reliably, compute decimal degree
tolerance limit envelopes in `getLimits`, and correctly evaluate inspection sample measurements entered
in either DMS or decimal degrees.
```

Scope:

- Add `parseAngleToDecimal(str)` to parse DMS callouts (`°`, `'`, `"`, unicode primes) to decimal degrees.
- Add `formatDecimalToDms(val, includeSeconds)` for standard DMS formatting.
- Update `parseSingleDimensionCore` and `parseDimension` to capture DMS nominals and tolerances with unit `°`.
- Update `parseNumber(value, unit)` to safely disambiguate linear inch quotes from angular arcseconds.
- Update `getLimits` to compute accurate decimal degree limit envelopes for bilateral, asymmetric, unilateral, and single-limit MAX/MIN angular callouts.
- Update `getStatus` so sample measurements entered as DMS or decimal degrees evaluate accurately against angular limits.
- Update `exportInspectionWorkbook` to preserve angular sample parsing in Excel FAI statistics.
- Comprehensive test coverage in `scripts/verify-inspection-math.mjs`.

Out:

- No conversion between radians and degrees (engineering drawings use degrees / DMS).
- No new external npm dependencies.

Likely files:

- `src/lib/utils.js`
- `src/lib/exporters.js`
- `src/lib/constants.js`
- `scripts/verify-inspection-math.mjs`

Acceptance:

- Angular callouts in DMS notation (`45° 30' ±15'`, `45° 30' 36" ±18"`, `30° 15' +10'/-5'`) parse with unit `°`.
- `getLimits` computes decimal degree bounds without truncating minutes or seconds (e.g. $45^\circ\ 30' \pm 15' \to [45.25^\circ, 45.75^\circ]$).
- Measurements entered in DMS or decimal degrees evaluate accurately in `getStatus`.
- 100% of offline verification test suites and production build pass cleanly.

### P1-1: Text capture reliability for rotated and small PDF text

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-text-capture.mjs (100% PASS)
```

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

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-responsive-layout.mjs (100% PASS)
```

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

### P1-3: OCR Preprocessing & Contrast Enhancement for Faint Scans and Inverted Title Blocks

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-ocr-preprocessing.mjs (100% PASS)
```

Epic:

```text
Activation: First Session
```

Outcome:

```text
OCR text capture and Auto Balloon detection reliably extract dimensions and metadata
from faint pencil markings, low-contrast scans, and inverted (white-on-dark) CAD title blocks.
```

Scope:

- Client-side canvas preprocessing: perimeter-based dark background detection and RGB inversion.
- Percentile-based contrast normalization (stretching p2..p98 luminance to full 0..255 dynamic range).
- Local adaptive binarization (Bradley-Roth integral image) to eliminate shadows and lighting gradients.
- Automated pipeline integrated into `cropCanvasArea` in `src/lib/utils.js` and `src/App.jsx`.
- Comprehensive offline test suite in `scripts/verify-ocr-preprocessing.mjs`.

Out:

- No new external/npm dependencies.
- No remote OCR or cloud services.

Likely files:

- `src/lib/ocrPreprocessing.js`
- `src/lib/utils.js`
- `scripts/verify-ocr-preprocessing.mjs`

Acceptance:

- Title blocks with dark backgrounds are accurately detected and inverted to black text on white.
- Faint pencil markings (narrow dynamic range) are contrast-stretched to deep black on pure white.
- Uneven shadows and lighting gradients are eliminated via Bradley-Roth local adaptive thresholding.
- Node offline verification suite and production build pass with 100% success.

### P1-4: Keyboard Shortcuts & High-Throughput Quick-Ballooning

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-keyboard-shortcuts.mjs (100% PASS)
```

Epic:

```text
Activation: First Session
```

Outcome:

```text
QC inspectors can rapidly navigate, balloon, classify, and edit characteristics entirely from the keyboard
without repetitive mouse round-trips to the toolbar or inspector dropdowns.
```

Scope:

- `Enter`: Confirm Auto-Balloon candidates or finish editing selected balloon.
- `Delete` / `Backspace`: Remove selected characteristic from drawing and table.
- `D`: Rapidly cycle requirement type (`dimension` -> `gdt` -> `note` -> `visual`) with automatic default method.
- `ArrowUp` / `ArrowDown` (and `K` / `J`): Navigate characteristic selection row by row in the table.
- `1`–`9`: Quick-assign balloon number to selected requirement.
- `+` / `-`: Zoom drawing in and out.
- Guards suppressing shortcuts during text entry (`input`, `textarea`, `select`) and when modifier keys are held.
- Updated shortcut documentation in Help panel (`src/components/panels.jsx`).
- Verification test suite in `scripts/verify-keyboard-shortcuts.mjs`.

Out:

- No changes to default mouse interaction.
- No third-party keybinding libraries.

Likely files:

- `src/App.jsx`
- `src/components/panels.jsx`
- `scripts/verify-keyboard-shortcuts.mjs`

Acceptance:

- Pressing `D` cycles requirement types and assigns matching default methods.
- Arrow keys traverse characteristic rows with selection wrapping.
- `Enter` confirms auto-balloon candidate reviews.
- `Delete` removes selected requirements.
- 100% of offline verification tests and production build pass.

### P1-5: Batch Sample Auto-Fill & Clipboard Pasting

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-batch-samples.mjs (100% PASS)
```

Epic:

```text
Activation: First Session
```

Outcome:

```text
QC inspectors can paste multi-cell measurement grids directly from Excel, Google Sheets, or CSV
into any sample cell in the characteristic table or balloon inspector, and use one-click auto-fill
actions for nominal baseline initialization and visual requirement sign-off.
```

Scope:

- Add `parseClipboardGrid(text)` in `src/lib/utils.js` supporting TSV (Excel/Sheets), CSV, and multi-line matrices.
- Add `computePastedSampleUpdates(sorted, charId, sampleIdx, count, grid)` with 2D row/column boundary clipping.
- Add `computeAutoFillSampleUpdates(characteristics, sampleCount, targetId, mode, overwrite)` supporting `nominal` and `visuals-ok` modes.
- Support multi-cell pasting across table rows/columns in `CharacteristicRow` and `CharacteristicTable`.
- Support multi-cell pasting across sample slots in `BalloonEditor`.
- Add quick action buttons in `table-header` and `MeasurementWorkspace`: "Fill Nominals", "Fill Visuals OK", and "Clear Samples".
- Add "Fill Nominal / OK" quick action in `BalloonEditor`.
- Atomic state batch updates in `src/App.jsx` (`updateBatchSamples`).
- Deterministic verification tests in `scripts/verify-batch-samples.mjs`.

Out:

- No native clipboard reading APIs requiring elevated browser permissions (`navigator.clipboard.readText`); uses standard `paste` event data.
- No third-party spreadsheet or grid libraries.

Likely files:

- `src/lib/utils.js`
- `src/App.jsx`
- `src/components/panels.jsx`
- `src/styles.css`
- `scripts/verify-batch-samples.mjs`

Acceptance:

- Pasting 1D horizontal, 1D vertical, or 2D matrix clipboard data into any table sample cell maps sequentially across rows and columns.
- Single-cell clipboard values paste normally without interception.
- "Fill Nominals" populates empty sample cells with nominal values for dimensions and "OK" for visual/note requirements.
- "Fill Visuals OK" sets "OK" for all visual and note requirements without altering dimension values.
- "Clear Samples" resets recorded measurements while preserving balloon geometry and requirements.
- 100% of offline verification test suites and production build pass cleanly.

### P1-6: Multi-Drawing Batch PDF Export

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-batch-pdf-export.mjs (100% PASS)
```

Epic:

```text
Distribution: Report Quality
```

Outcome:

```text
Inspectors and quality managers can export all ballooned drawings in a project into a single merged
multi-drawing PDF package with one click, eliminating repetitive manual exports across multi-part projects.
```

Scope:

- Implement `generateBatchBalloonedPdf({ drawings, ...options })` and `exportBatchBalloonedPdf` in `src/lib/exporters.js`.
- Sequentially merge all ballooned project drawings into a single master document via `pdf-lib`.
- Preserve individual page dimensions, aspect ratios, orientations, balloon coordinates, leader lines, and solid arrowheads.
- Add "Export All PDFs" button in `ProjectDetail` drawings list.
- Add "All PDFs (N)" button in workspace toolbar when a project contains more than one drawing.
- Robust guardrails validating PDF byte presence and reporting specific drawing names when unplaced instances exist.
- Deterministic verification tests in `scripts/verify-batch-pdf-export.mjs`.

Out:

- No external PDF conversion binaries or cloud microservices.
- No zip packaging (single merged PDF package satisfies standard customer submission audits).

Likely files:

- `src/lib/exporters.js`
- `src/App.jsx`
- `src/components/panels.jsx`
- `src/styles.css`
- `scripts/verify-batch-pdf-export.mjs`

Acceptance:

- Export merges all project drawings with uploaded PDFs into a single downloadable PDF package.
- Balloon annotations, leader lines, arrowheads, and page orientations are preserved on every page.
- Drawings without balloons are included cleanly without errors.
- Drawings with unplaced balloon instances are prevented with drawing-specific error messaging.
- 100% of offline verification test suites and production build pass cleanly.

### P1-7: Multi-Drawing FAI Report Rollup (Combined AS9102 Multi-Part Package)

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-batch-excel-export.mjs (100% PASS)
```

Epic:

```text
Distribution: Report Quality
```

Outcome:

```text
Inspectors and quality managers can export a consolidated AS9102 Rev C multi-drawing FAI report
rollup across all drawings in a project into a single master Excel workbook (.xlsx), complete with
Form 1 part index, Form 2 process accountability, Form 3 per-drawing sheets, and a unified characteristics tab.
```

Scope:

- Implement `overallProjectStatus(drawings, sampleCount)` conservative status rollup.
- Implement `sanitizeSheetName(name, existingNames)` enforcing 31-character Excel worksheet limits and deduplication.
- Implement `buildBatchInspectionWorkbook({ project, drawings, sampleCount, options })` and `exportBatchInspectionWorkbook` in `src/lib/exporters.js`.
- AS9102 Form 1 Master Project Index tab listing sub-assemblies/parts with counts, statuses, and FAI references.
- AS9102 Form 2 Master Process Accountability tab covering processes and specifications per part.
- Consolidated Master "All Characteristics" tab merging all requirements across all drawings with part labels.
- Dedicated standalone Form 3 characteristic sheets per drawing.
- Add "Export All Excel" button in `ProjectDetail` drawings list.
- Add "All Excel (N)" button in workspace toolbar when a project contains more than one drawing.
- Deterministic verification tests in `scripts/verify-batch-excel-export.mjs`.

Out:

- No server-side Excel generation or cloud dependencies.
- No third-party zip generation or multi-file downloads.

Likely files:

- `src/lib/exporters.js`
- `src/App.jsx`
- `src/components/panels.jsx`
- `scripts/verify-batch-excel-export.mjs`

Acceptance:

- Master workbook includes Form 1, Form 2, All Characteristics, and per-drawing Form 3 tabs.
- Sheet names conform strictly to Excel constraints (<= 31 characters, no invalid chars `[]*?/\:`, unique).
- Overall project status is conservative: FAIL if any part fails, OPEN if incomplete, PASS only when all pass.
- Single-click export triggers from project detail page and workspace toolbar.
- 100% of offline verification test suites and production build pass cleanly.

### P2-1: Solid Arrowhead Terminations on Balloon Leader Lines

Status:

```text
Done (shipped in v0.9.1)
Verification: scripts/verify-pdf-export.mjs (100% PASS)
```

Epic:

```text
Distribution: Report Quality
```

Outcome:

```text
Balloon leader lines terminate with solid arrowheads pointing directly at the dimension or feature
in both the interactive drawing canvas and the exported PDF, conforming to standard engineering drawing practices.
```

Scope:

- Implement deterministic directional vector math in `getLeaderGeometry` (`src/lib/exporters.js`) and `getLeaderLine` (`src/lib/utils.js`).
- Arrowhead tip touches target feature while base connects seamlessly to leader line terminus.
- SVG `<polygon>` with CSS tokens for interactive editor canvas and auto-balloon preview.
- Vector SVG path rendering (`page.drawSvgPath`) for crisp vector PDF export.
- Distance threshold omitting leader line when balloon sits directly on target.
- Verification tests in `scripts/verify-pdf-export.mjs`.

Out:

- No new external/npm dependencies.
- No curved or spline leader lines.

Likely files:

- `src/lib/exporters.js`
- `src/lib/utils.js`
- `src/components/widgets.jsx`
- `src/styles.css`
- `scripts/verify-pdf-export.mjs`

Acceptance:

- Leader line points to target feature with solid filled arrowhead.
- Arrowhead rotates cleanly to any 360-degree orientation.
- Arrowhead renders consistently across interactive canvas editor and exported PDF.
- 100% of offline verification tests and production build pass.

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
