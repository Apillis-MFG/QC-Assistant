# QC Assistant: uploaded Excel FAI template implementation plan

Status: planned; feature implementation deferred.
Prepared: 2026-10-08.
Documentation tracking: [GitHub issue #27](https://github.com/Apillis-MFG/QC-Assistant/issues/27).

## Insight

Engineers need to submit inspection results in customer-specific Excel formats. Optional template support can reduce copying after export and improve distribution. The main risks are incorrect field placement and loss of formatting or workbook content.

Uploading a workbook does not tell the app where to write each field. The MVP requires a one-time manual mapping and a verified template contract. A customer form also does not establish compliance or supply information the app does not collect.

## Decision

Support an optional blank `.xlsx` template with manual cell/column mapping, fixed inspection row capacity, and local project persistence. Keep the current default exporter when no template is selected. Use app calculations for limits and inspection results.

Evaluate ExcelJS for the custom-template path before selecting it. Retain the existing default exporter initially. Do not install dependencies until real-template fidelity and production bundle impact have been reviewed.

## Current implementation

| Surface | Current behavior | Planned change |
| --- | --- | --- |
| `src/lib/exporters.js` | `exportInspectionWorkbook` creates a fresh SheetJS workbook with a fixed layout | Add a custom-template branch; preserve the default branch |
| `src/App.jsx` | Holds metadata, characteristics, samples, and synchronous `exportExcel` handler | Add template configuration state, mapping interaction, and asynchronous export handling |
| `src/lib/constants.js` | Metadata contains drawing number, revision, supplier, description | Reuse these fields; do not add customer-specific metadata in MVP |
| `src/lib/projectStore.js` | IndexedDB persists projects, drawings, and PDF bytes | Persist template bytes and configuration with the local project |
| `src/styles.css` | Shared design tokens | Style template controls with existing tokens |
| `src/components/panels.jsx` | Existing panel components | Use existing component patterns if the mapping UI belongs here; state remains in `App.jsx` |

The installed Excel dependency is `xlsx` declared as `^0.18.5`. The exporter sorts by balloon number and writes samples, MIN/MAX, limits, method, notes, and characteristic/overall status. No customer workbook fixtures were available during feasibility review.

Some project documentation references `src/exporters.js`; the actual exporter is `src/lib/exporters.js`. Follow the current code structure without a broad refactor.

## Supported template contract

- Blank, unencrypted `.xlsx` workbook; `.xls`, `.xlsm`, `.xltx`, and password-protected files are outside MVP.
- One selected worksheet contains the inspection table and mapped header fields.
- One characteristic occupies one row in a contiguous, preformatted inspection region.
- User declares the first and last writable inspection rows. No row insertion, pagination, or automatic sheet duplication.
- Each sample has its own explicitly mapped column. No combined sample cells or repeated row blocks.
- Merged header targets must point to the top-left cell. Merged cells within mapped inspection regions are unsupported.
- Mapped output cells must be blank writable cells, without formulas or prefilled results. Reject formula/conflicting content targets before saving or exporting.
- Protected target sheets and workbook structures outside the verified library contract are unsupported.
- Other sheets, logos, formatting, print settings, and unmapped content must pass the fidelity gate. Do not promise arbitrary workbook preservation.
- Unmapped fields remain as supplied. Inspector, lot, approvals, signatures, material/process certification, and similar missing data require manual completion.

Initially support one active template per local project, shared across its drawings. Different projects can use different templates. No template gallery or organization-wide registry.

## User flow

1. Excel export uses the default report until the user configures a template.
2. A secondary “Report template” action near Excel export opens the configuration dialog.
3. User uploads the workbook and selects its inspection worksheet.
4. User maps header cell addresses, table row bounds, characteristic columns, and sample columns. Show worksheet names and a limited read-only cell grid to help identify addresses; no full Excel editor.
5. Validate the mapping and display a preview of mapped app values, required manual fields, and row/sample capacity. The preview verifies data placement, not Excel print fidelity.
6. Save the template locally with the active project. Display the active template name near export.
7. Export fills a fresh copy of the original workbook and downloads a new file. Never mutate the stored original.
8. User can replace the template or choose “Use default report.” Keep an existing valid template active until its replacement is validated and saved.

An invalid configured template blocks custom export. Offer an explicit default-report action; do not silently switch formats.

## Mapping and data rules

| Mapping | Source | Requirement |
| --- | --- | --- |
| Drawing number, revision, supplier, description | `metadata` | Optional header mappings |
| Sample size | `sampleCount` | Optional header mapping |
| Overall result | Existing overall status rollup | Optional; PASS / FAIL / OPEN |
| Balloon number | `balloonNo` | Required column |
| Nominal and tolerance | Characteristic fields | Optional; both required for dimensional templates under the MVP contract |
| Type, unit, method, notes | Characteristic fields | Optional columns |
| USL and LSL | `getLimits` | Optional columns |
| Sample 1 through N | `samples` up to `sampleCount` | Required for every active sample |
| MIN and MAX | Existing export calculation | Optional columns |
| Characteristic result | `getStatus` | Required column; OK / NG / OPEN |

Reject a template that cannot represent the project's characteristics accurately. MVP does not compose combined “requirement” text or customer-specific result codes. Templates requiring those need a later explicit adaptation.

Validation must reject invalid addresses, missing sheets, duplicate columns, overlapping header/table targets, reversed row bounds, merged inspection targets, and formula/content conflicts. Validate again at export because sample count and characteristic count can change.

Write numeric samples as numbers only when the whole input is a valid numeric value; preserve note/visual results and qualified strings as text. Never turn user strings into formulas. Keep existing inspection calculations unchanged and document any existing parsing limitations separately.

Clear mapped output cells across the declared writable region in each fresh export before writing results, so unused rows and sample columns stay blank. Never clear unmapped cells or write beyond declared bounds. Do not truncate characteristics or samples.

Template formulas outside mapped cells are not authoritative for app status. Preserve supported formulas, but do not depend on browser formula calculation. Formula-heavy templates require separate validation of recalculation in Excel.

## Local persistence and export architecture

Keep state and orchestration in `App.jsx`; keep export and inspection logic in `src/lib/exporters.js`. No new context providers, backend calls, or cloud migrations.

Proposed project-level template record:

- Schema version and template name.
- Original workbook bytes, byte length, and selected worksheet name.
- Header field-to-cell mappings.
- Inspection start/end rows, field-to-column mappings, and ordered sample columns.
- Configuration timestamp.

Implement persistence through the existing project store. `normalizeProject` currently explicitly selects properties: extend both normalization and save/load paths so the template is not dropped. Preserve template fields during project metadata edits. Avoid duplicating bytes in every drawing or frequently rewriting them during drawing autosave. Include template byte length in local storage estimates.

Reload restores the project's template. Legacy projects without a template load normally and use the default export. If persistence fails, report that the configuration was not saved; retain the valid in-memory configuration for session export.

Cloud sharing does not upload or synchronize template bytes/configuration in this MVP. The UI must identify templates as local to this browser; collaborators use the default report until they configure their own local template. Verify existing shared-project flows remain intact.

Export sequence:

1. Resolve default versus configured-template export.
2. Validate workbook, mapping, current row/sample capacity, and content conflicts.
3. Load a fresh workbook from stored original bytes.
4. Fill mapped metadata and characteristic rows sorted by balloon number, using existing limits/status calculations.
5. Serialize and download using the existing drawing-based FAI filename convention.

Change the UI handler to await serialization, prevent duplicate export clicks while busy, and show success only after generation/download initiation. Failures leave app measurements and stored templates untouched.

## Library and fidelity gate

SheetJS Community Edition focuses on data handling; additional styling and image features are described as Pro capabilities. Reading and writing a workbook with the installed library is not proof of template fidelity. See [SheetJS parsing documentation](https://docs.sheetjs.com/docs/api/parse-options/).

ExcelJS supports XLSX data/styles, merged cells, images, print setup, and browser document workbooks. It is the recommended evaluation candidate, not a guarantee of arbitrary workbook preservation. See [ExcelJS documentation](https://github.com/exceljs/exceljs#readme).

Before feature implementation:

1. Obtain one or two representative blank customer templates, including a logo/merged-header/print-layout example if relevant.
2. Perform a no-edit read/write round trip and a small mapped-data export in the browser using the candidate library.
3. Open originals and outputs in desktop Excel; inspect all sheets, fonts, borders, merges, logos, formulas, page setup, print areas, and page breaks. Confirm no workbook repair warning.
4. Measure added production JavaScript size and export time on agreed representative row/sample counts. Prefer lazy loading the custom exporter library.
5. Record supported/unsupported workbook features and fixture results. Agree on limits before shipping; file-size and expanded-workbook limits remain to be determined by the spike.

If representative templates lose important content, stop and reassess the export engine or supported contract. Do not compensate by silently rebuilding the customer's form.

## Implementation backlog

Create separate GitHub issues when development starts. Every slice follows `WORKFLOW.md`; this documentation issue does not authorize feature implementation.

| Slice | Outcome and scope | Acceptance gate | Estimate |
| --- | --- | --- | --- |
| 1. Validate Excel engine | Fidelity spike with real templates; dependency/size decision | Round-trip and filled export pass desktop Excel inspection; supported contract recorded | 0.5–1 day |
| 2. Template configuration | Upload, worksheet selection, manual mapping, capacity/content validation, read-only preview | Valid setup accepted; invalid mappings rejected; replacement does not discard prior setup | 1–2 days |
| 3. Template export | Fresh-copy filling, original/default routing, async handler, busy/error states | Complete data in mapped cells; unmapped content preserved; no truncation or silent fallback | 1–2 days |
| 4. Local reuse | Project persistence, restore/remove/replace, legacy and shared-project behavior | Refresh and project switching restore correct configuration without cross-project leakage | 0.5–1 day |
| 5. Release verification | Fixture checks, targeted tests, UI checks, user guide update | Verification matrix passes and production build succeeds | 0.5–1 day |

Planning estimate: roughly 3.5–7 development days after representative templates are available. Revise after the fidelity spike; arbitrary forms or pagination would materially expand scope.

## Acceptance and verification matrix

| Scenario | Expected result |
| --- | --- |
| No template selected; legacy project | Existing default workbook layout and values |
| Valid custom template | Mapped headers/results correct; balloon order matches default export |
| Empty/partially measured characteristic | Existing OPEN/NG behavior preserved; never synthesize a pass |
| Bilateral, asymmetric, MAX, MIN, null nominal | Same limits and status as app/default exporter |
| Note/visual, empty samples, invalid numeric input | Same status evaluation as existing code; appropriate text retained |
| Exactly full row/sample capacity | Complete successful export |
| One more row or sample than capacity | Clear error; no truncated workbook downloaded |
| Sample count decreases; repeated export | Unused mapped cells blank; original template unchanged |
| Invalid address, duplicate/overlapping mapping, missing sheet | Save/export blocked with actionable error |
| Merged inspection cells, formula or populated target cells | Rejected before writing |
| Invalid/encrypted/unsupported or oversized workbook | Actionable rejection; existing valid configuration retained |
| Multi-sheet template, logos, borders, print layout | Fidelity verified in desktop Excel against approved fixtures |
| Refresh, project switch, template removal/replacement | Correct local configuration; default restored on removal |
| Storage failure or serialization failure | Honest error; measurements/template original preserved |
| Shared project on another browser | Template is not implied to sync; default works locally |
| PDF export regression | Ballooned PDF behavior unchanged; visually confirm positions per workflow |

Run `pnpm build` after implementation. Use targeted tests for mapping validation, capacity, field placement, preservation boundaries, and persistence compatibility. Follow the repository test/dependency policy before introducing a runner. Compare both export branches on the same characteristic data and manually verify all inspection math branches if the exporter changes.

## Deferred scope

Automatic mapping, AI template interpretation, Excel editing, dynamic row insertion, repeated page blocks, multi-sheet result routing, full AS9102 Forms 1/2/3 population, new certification/signature fields, customer status translations, macro support, cloud template sync, and template galleries.

## Risk / next

The next development action is to collect representative blank templates and run the fidelity spike. The feature remains planned until that evidence supports a library and a concrete supported contract. Success means an engineer exports into an approved customer layout with correct complete inspection data, while the default local export continues to work.
