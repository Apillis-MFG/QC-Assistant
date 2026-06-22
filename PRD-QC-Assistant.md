# PRD: QC Assistant v1

Created: 2026-06-22

## 1. Summary

QC Assistant is a browser-only tool for manufacturing quality engineers who need to balloon engineering drawing PDFs, capture inspection characteristics, record measurements, and export a submittable FAI/QC package in one session.

The v1 goal is not to become a full QMS. The v1 goal is to make the manual Acrobat plus Excel workflow faster, safer, and easier to trust, without requiring accounts, cloud upload, or a long implementation cycle.

## 2. Contacts

| Name | Role | Comment |
| --- | --- | --- |
| Dantong | Founder / Product Owner | Owns product direction, shipping priority, pricing, and customer discovery. |
| Codex or Claude Code | AI Engineering Partner | Supports code review, implementation planning, specs, and release readiness. |
| Target customer | Manufacturing QC engineer / quality manager | Validates whether exported PDF and Excel files are acceptable for real FAI submission. |

## 3. Background

### Current Product

QC Assistant currently supports the core inspection workflow:

1. Upload a PDF drawing.
2. Place numbered balloons with leader lines.
3. Capture embedded PDF text or OCR a selected raster area.
4. Fill metadata and characteristic fields.
5. Record sample measurements.
6. Auto-evaluate status as `OPEN`, `OK`, or `NG`.
7. Export a ballooned PDF and Excel QC/FAI workbook.

This is implemented as a flat React/Vite app with no backend. Most product state lives in `src/App.jsx`. Inspection math and export logic live in `src/exporters.js`. Styling is global CSS in `src/styles.css`.

### Codebase Review Snapshot

What is strong:

- The app already has the right single-session shape: upload, balloon, capture, measure, export.
- The architecture is simple enough for a solo developer to maintain.
- PDF text extraction and OCR are both present, which helps activation because engineers do not need to type every value.
- Export exists for both customer-facing artifacts: ballooned PDF and Excel workbook.
- The UI matches the tool category: dense, direct, and engineering-native.

What needs protection before v1:

- Inspection math must be tested. `getLimits` and `getStatus` drive customer trust.
- `MAX` / `MIN` tolerance handling must not depend on a filled nominal value. A limit-only requirement should still produce a limit.
- Excel output should be checked against at least one real customer FAI template.
- Balloon export must be visually checked across multi-page PDFs, rotated drawings, and common drawing sizes.
- No automated test runner exists today, so math regressions are easy to miss.

### Market Reference

Balloonist positions around speed and affordability. Its public site emphasizes auto-ballooning, dimension and GD&T extraction, AS9102/custom-template export, browser privacy, and pricing around $30 to $39 per user per month. It also claims teams can cut ballooning time by 50-80% in the first week.

1Factory is a much larger quality platform. Its public pages frame FAI and ballooning as part of a broader system: control plans, CMM import, gage calibration, PPAP, supplier quality, QMS, revision comparison, audit readiness, and compliance hosting. It sells the bigger promise of connected quality operations, not just fast ballooning.

### Strategic Takeaway

QC Assistant should not fight 1Factory on enterprise workflow. It also should not chase full auto-ballooning before deterministic trust is proven.

The wedge is:

> A local-first, no-login FAI artifact builder for small shops, suppliers, and fast-moving engineers who need clean ballooned drawings and Excel reports today.

## 4. Objective

### Product Objective

Help a manufacturing QC engineer go from drawing upload to complete ballooned PDF plus Excel FAI workbook in under 15 minutes, with inspection math they can verify and trust.

### Business Objective

Create a focused paid tool that can sell as direct utility. The buyer should understand the value in one demo: fewer manual steps, fewer transcription errors, and faster customer submission.

### Customer Objective

The customer wants to avoid:

- manually numbering balloons in Acrobat,
- retyping drawing values into Excel,
- missing a requirement,
- sending a report with bad limits or wrong pass/fail status,
- learning a large QMS just to finish one FAI.

### Key Results

| Key Result | Target |
| --- | --- |
| First export speed | New user exports first PDF and Excel package within 15 minutes. |
| First balloon speed | New user places first balloon within 60 seconds after PDF upload. |
| Math confidence | `getLimits` and `getStatus` pass tests for bilateral, MAX, MIN, note, visual, empty sample, and null nominal cases. |
| Export confidence | Exported Excel workbook is accepted by at least 3 real or representative FAI review samples without manual restructuring. |
| Activation | At least 60% of trial users who upload a PDF create 5+ characteristics in the same session. |
| Revenue signal | At least 5 target users say they would pay for the current workflow if export fidelity is reliable. |

## 5. Market Segments

### Primary Segment

Small and mid-size precision manufacturers that create FAIs manually.

Their job:

- receive a customer drawing,
- identify all inspection requirements,
- balloon the drawing,
- record measured values,
- send a report package back to the customer.

Why they care:

- FAI work is repetitive and time-sensitive.
- Mistakes are costly because they delay shipment or damage customer trust.
- Full QMS tools can be too expensive, too slow to deploy, or too broad for the immediate job.

### Secondary Segment

Suppliers and manufacturing engineers who need a clean one-off inspection package before moving data into another system.

Their job:

- make a professional first-pass report quickly,
- avoid uploading sensitive drawings,
- preserve traceability between balloon numbers and report rows.

### Not Targeted In v1

- Large enterprises needing full QMS, CAPA, supplier portals, audit workflows, or role-based permissions.
- Teams needing cloud record retention across years.
- Customers requiring automated CMM import in the first version.
- Customers expecting AI auto-ballooning before manual workflow reliability is proven.

## 6. Value Propositions

### Core Value

QC Assistant turns a drawing PDF into a ballooned drawing and filled inspection workbook without leaving the browser.

### Gains

- Faster first FAI package.
- Less duplicate data entry.
- Clear one-to-one mapping between balloon numbers and report rows.
- No account or backend setup.
- Sensitive drawings stay local to the browser session.
- Export artifacts are easy to share with customers.

### Pains Removed

- Manual balloon numbering.
- Manual row setup in Excel.
- Manual USL/LSL calculation.
- Manual pass/fail status checking.
- Copying text from PDFs by hand.
- Switching between unrelated tools.

### Competitive Position

Against manual Acrobat plus Excel:

- QC Assistant wins on speed, linked data, and status calculation.

Against Balloonist:

- QC Assistant should win on privacy, simplicity, and direct local utility for users who do not yet need auto-ballooning or cloud workflow.

Against 1Factory:

- QC Assistant should win on setup time, focus, and price for users who only need FAI artifact creation.

## 7. Solution

### 7.1 UX / User Flow

```text
Open QC Assistant
  -> Upload drawing PDF
  -> Capture drawing metadata from text or OCR
  -> Select Balloon tool
  -> Click requirement target
  -> Click balloon location
  -> Fill requirement, tolerance, method, notes
  -> Enter sample measurements
  -> Status evaluates automatically
  -> Repeat for all requirements
  -> Export ballooned PDF
  -> Export Excel FAI workbook
```

### 7.2 Key Features

#### PDF Upload And Viewing

User can upload a PDF drawing and view it in the browser.

Requirements:

- Support multi-page PDFs.
- Support zoom in/out.
- Support pan mode.
- Preserve current page state while editing.

Acceptance:

- User can upload a PDF and see page 1.
- User can move between pages.
- User can zoom from 65% to 220%.
- User can pan large drawings without placing accidental balloons.

#### Manual Ballooning

User can place numbered balloons with leader lines.

Requirements:

- Balloon placement is a two-click flow: target point, then balloon location.
- Balloons are sequentially numbered.
- Balloons and target handles can be dragged after placement.
- Deleting a balloon renumbers the remaining rows.
- Balloons store page number and relative coordinates.

Acceptance:

- A balloon appears where the user clicks.
- A leader line connects the balloon to the requirement target.
- Moving the balloon or target updates the drawing view and export data.
- Deleting a balloon updates table numbering and exported numbering.

#### Text And OCR Capture

User can capture values from embedded PDF text or raster text.

Requirements:

- Text Select mode captures embedded text items.
- OCR mode allows drawing a rectangle around raster text.
- Captured text can fill drawing metadata or selected characteristic fields.
- OCR loads lazily so the app does not pay that cost before use.

Acceptance:

- Captured text appears in the selected-text panel.
- User can send captured text to Drawing No, Rev, Supplier, Description, Requirement, Tolerance, or Notes.
- OCR failure shows a clear message and does not break the session.

#### Characteristic Table

User can edit all inspection rows linked to balloons.

Requirements:

- Fields: ID, type, unit, nominal/requirement, tolerance, USL, LSL, samples, method, status, notes.
- Types: dimension, GD&T, note, visual.
- Sample counts: 1, 3, 5, 10.
- Methods include common inspection equipment abbreviations.

Acceptance:

- Table rows sort by balloon number.
- Editing a row updates the selected balloon inspector.
- Sample entries update status immediately.
- Empty samples show `OPEN`.

#### Inspection Math

The app calculates limits and status conservatively.

Requirements:

- Bilateral tolerance: nominal plus/minus tolerance.
- MAX-only tolerance: USL only.
- MIN-only tolerance: LSL only.
- Note and visual checks require explicit `OK`.
- Unknown or incomplete numeric limits should not create false confidence.

Acceptance:

- `25` with `0.13` gives USL `25.13` and LSL `24.87`.
- `3 MAX` gives USL `3` and blank LSL.
- `0.5 MIN` gives blank USL and LSL `0.5`.
- Empty samples return `OPEN`.
- Out-of-limit sample returns `NG`.
- All in-limit samples return `OK`.
- Note/visual rows return `OK` only when required samples are `OK`.

#### Export Ballooned PDF

User can export the original PDF with balloons and leader lines burned in.

Requirements:

- Export uses original PDF bytes.
- Balloons are drawn on the correct page.
- Relative screen coordinates map correctly to PDF page coordinates.
- Balloon labels remain readable for 1-999.

Acceptance:

- Exported PDF opens in a normal PDF viewer.
- Balloons appear on the same requirements shown in the browser.
- Leader lines connect to the expected target points.
- Multi-page drawings export balloons on the correct pages.

#### Export Excel FAI Workbook

User can export a filled workbook.

Requirements:

- Include Drawing No, Rev, Supplier, Description, sample count, and overall status.
- Include all characteristic rows in balloon order.
- Include sample columns, MIN, MAX, method, status, and notes.
- Include measurement equipment abbreviation legend.

Acceptance:

- Workbook opens in Excel.
- Rows match balloon numbers.
- Status rollup is `FAIL` if any row is `NG`, `OPEN` if any row is `OPEN`, otherwise `PASS`.
- Workbook needs no manual restructuring for a representative FAI submission.

### 7.3 Technology

Current stack:

| Area | Technology |
| --- | --- |
| UI | React 19 |
| Build | Vite 6 |
| PDF render and text | pdfjs-dist |
| PDF export | pdf-lib |
| OCR | Tesseract.js |
| Excel export | SheetJS / xlsx |
| Icons | lucide-react |

Architecture rules:

- Keep the app client-side.
- Do not add auth or backend in v1.
- Keep state in `App.jsx` unless a future refactor is explicitly chosen.
- Keep export and inspection math in `exporters.js`.
- Add tests before expanding math behavior.
- Do not add dependencies unless they directly improve trust, export fidelity, or activation.

### 7.4 Assumptions

- Small manufacturers will accept a local-first tool if the export package is clean.
- Buyers care more about trusted PDF/Excel output than AI auto-ballooning at this stage.
- The first paid wedge can be direct utility, not enterprise workflow.
- A simple one-user workflow can validate demand before cloud storage or collaboration.
- Browser OCR quality is good enough for selected drawing regions, but not for full automated extraction.

### 7.5 Non-Goals

Do not build these in v1:

- user accounts,
- cloud storage,
- collaboration,
- drawing revision management,
- automatic full-drawing ballooning,
- CMM import,
- gage calibration management,
- supplier portals,
- QMS workflows,
- AS9102 Forms 1 and 2 unless a customer explicitly requires them for payment.

## 8. Release

### Release Strategy

Ship v1 as a trust-first point solution.

The release should prove:

1. The math is correct.
2. The exports are usable.
3. A real engineer can complete the workflow quickly.
4. The product can be sold without enterprise setup.

### MVP Scope

MVP includes:

- PDF upload and viewing.
- Manual balloon placement with leader lines.
- Text select and OCR capture.
- Metadata fields.
- Characteristic table.
- Conservative status evaluation.
- Ballooned PDF export.
- Excel FAI workbook export.
- Demo rows for onboarding.
- Math tests for `getLimits` and `getStatus`.

### P0 Release Work

| Priority | Work | Why It Matters |
| --- | --- | --- |
| P0 | Add `vitest` coverage for `getLimits` and `getStatus` | Trust. Prevents bad pass/fail outputs. |
| P0 | Fix MAX/MIN limit handling when nominal is blank | Trust. Limit-only requirements are common. |
| P0 | Verify exported PDF coordinate mapping on multi-page and large-format drawings | Trust and distribution. |
| P0 | Validate Excel workbook against a real FAI template | Distribution. Export must be submittable. |
| P0 | Add an in-app export readiness check | Activation and trust. User sees what is still open before export. |

### P1 Release Work

| Priority | Work | Why It Matters |
| --- | --- | --- |
| P1 | Improve text selection for rotated and small text | Activation. Faster row entry. |
| P1 | Add drawing sheet/zone field per characteristic | Traceability. Common in professional FAI tools. |
| P1 | Add PDF rotation control | Activation. Some drawings upload rotated. |
| P1 | Add unit conversion helper | Speed. Common competitor expectation. |
| P1 | Add local project save/load file | Retention. Allows resuming work without cloud. |

### P2 Future Work

| Priority | Work | Why It Matters |
| --- | --- | --- |
| P2 | Custom Excel template mapping | Revenue. Helps paid users match customer formats. |
| P2 | AS9102 Form 3 export mode | Distribution. Aerospace buyers expect it. |
| P2 | Partial FAI support | Retention. Useful after drawing changes. |
| P2 | Assisted characteristic extraction | Activation. Only after manual workflow is trusted. |
| P2 | CMM CSV import | Expansion. Useful for larger shops but not needed for MVP. |

### Suggested 2-Week Build Plan

Week 1:

- Add math tests.
- Fix discovered math issues.
- Add export readiness state.
- Manually test PDF exports across at least 3 PDFs.

Week 2:

- Improve Excel layout.
- Add sheet/zone field if validation shows customers expect it.
- Create a short demo drawing package.
- Run 3 customer-style workflow tests from blank upload to export.

## Appendix A: Review Findings

### Finding 1: Math Trust Is The Release Gate

The app already computes limits and status in `src/exporters.js`, but the repo has no test runner. This is the highest-risk area because a wrong `OK` can make the whole product untrustworthy.

Decision:

- Add `vitest`.
- Add focused unit tests before expanding feature scope.
- Keep status behavior conservative.

### Finding 2: Export Is The Distribution Artifact

The exported PDF and Excel workbook are the product’s sales asset. If they look professional and pass customer review, QC Assistant can spread through supplier/customer handoff.

Decision:

- Prioritize export fidelity over new screens.
- Validate workbook layout against real FAI examples.
- Do not build account features before export acceptance is proven.

### Finding 3: Local-First Is A Real Differentiator

Balloonist and 1Factory both highlight security and privacy in different ways. QC Assistant can make a sharper promise for small shops: no login and no upload required.

Decision:

- Keep all v1 data local.
- Add local save/load before cloud accounts.
- Use privacy as a conversion message.

### Finding 4: Auto-Ballooning Is Not The Next Best Step

Competitors advertise auto-ballooning and extraction. That is attractive, but it adds complexity before the deterministic workflow is trusted.

Decision:

- Defer auto-ballooning.
- Improve text/OCR capture and manual placement first.
- Use assisted extraction only after tests and export validation are complete.

## Appendix B: Source References

- Balloonist: https://balloonist.io/
- 1Factory home: https://www.1factory.com/home.html
- 1Factory FAI and ballooning: https://www.1factory.com/fai-ballooning-software.html
- Local project docs: `README.md`, `SPEC.md`, `DESIGN.md`, `WORKFLOW.md`, `AGENTS.md`
- Local source review: `src/App.jsx`, `src/exporters.js`, `src/sampleData.js`, `src/styles.css`
