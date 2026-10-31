# QC Assistant — User's Guide

*Drawing ballooning and inspection report builder. Version covered: v0.9.5.*

QC Assistant turns an engineering drawing PDF into a submittable First Article Inspection (FAI) package: you balloon the dimensions on the drawing, enter measured samples, and export a ballooned PDF plus an Excel FAI workbook. Everything runs locally in your browser — there is no server, no account, and no upload of your drawing anywhere.

## The golden path

```mermaid
flowchart LR
    A[Create / open a Project] --> B[Add a Drawing PDF]
    B --> C[Balloon requirements]
    C --> D[Set tolerances]
    D --> E[Enter measurements]
    E --> F[Export PDF + Excel]

    C -.->|manual, one click per dimension| C1[Balloon tool]
    C -.->|drag a box, review, commit| C2[Auto Balloon / Review]
    C1 --> D
    C2 --> D
```

Jump to a section:

1. [Projects & Drawings](#1-projects--drawings)
2. [Uploading & Viewing a Drawing](#2-uploading--viewing-a-drawing)
3. [Capturing Text & OCR](#3-capturing-text--ocr)
4. [Ballooning](#4-ballooning)
5. [Auto Balloon (Review tool)](#5-auto-balloon-review-tool)
6. [Characteristics Table](#6-characteristics-table)
7. [Tolerance Table](#7-tolerance-table)
8. [Measurements & Status Logic](#8-measurements--status-logic)
9. [Settings](#9-settings)
10. [Exporting](#10-exporting)
11. [Keyboard Shortcuts](#11-keyboard-shortcuts)
12. [Troubleshooting / FAQ](#12-troubleshooting--faq)
13. [Appendix: Version History](#13-appendix-version-history)

---

## 1. Projects & Drawings

Everything is stored locally in your browser (IndexedDB) under **Projects**. A project holds one or more **Drawings**; each drawing keeps its own PDF, metadata, balloons, tolerances, and measurements.

![Dashboard, no projects yet](./assets/screenshots/01-dashboard-empty.png)

Click **New Project**, name it, and QC Assistant creates the project and drops you straight into the workspace with an empty drawing slot.

![New Project dialog](./assets/screenshots/03-new-project-dialog-filled.png)

To manage a project's drawings without opening the workspace, go back to **Projects** and click **Manage** on a project card. From here you can edit the **Project Name**, **Project Code**, **Project Owner**, **Estimated Delivery Date**, and **Notes**, and add, rename, or delete drawings.

![Project Detail page with one drawing added](./assets/screenshots/06-project-detail-with-drawing.png)

- **Add Drawing** accepts any PDF; it becomes a new drawing entry in the project.
- Each drawing card's **Open** button loads it into the workspace; **Rename** / **Delete** work with a confirmation.
- Deleting a project or drawing removes its balloons, measurements, and stored PDF bytes — this cannot be undone.

**Storage limits:** a project can hold up to **25 drawings**. You'll see a warning if a single PDF exceeds ~25 MB, or if a project's total storage exceeds ~500 MB. If your browser's storage quota is nearly full, saving will fail with a clear "Local storage quota exceeded" message — free up space by deleting old drawings/projects.

**Autosave:** while working in a drawing, changes save automatically (debounced ~800ms) to IndexedDB. The last project/drawing you had open is remembered and reopened automatically next time.

---

## 2. Uploading & Viewing a Drawing

If a drawing has no PDF yet, the workspace shows an upload prompt:

![Upload a drawing PDF prompt](./assets/screenshots/04-workspace-upload-prompt.png)

Once a PDF is loaded, use the drawing toolbar to page through multi-page drawings, zoom from 65% to 220% in 10% steps, and rotate the canvas in 90° clockwise increments (or press `R`). Any placed balloons stay anchored to their physical drawing features across rotations.

![Drawing-only layout, PDF loaded, no balloons yet](./assets/screenshots/07-workspace-drawing-layout.png)

### Edit mode vs. Measurement mode

The **Mode** toggle switches the whole workspace:

- **Edit** — full toolset: balloon placement, auto-balloon, text/OCR capture, tolerance table, metadata editing.
- **Measurement** — a locked-down, view-only version of the drawing plus an editable measurement table. Balloon positions and requirement definitions can't be changed here — only sample values and notes. Use this mode for the actual inspection data-entry step so nobody accidentally moves a balloon while measuring.

### Layout modes

Under **Layout** (Edit mode only), choose how the drawing canvas, characteristics table, and inspector panel are arranged:

| Layout | Shows |
|---|---|
| **Drawing** | Canvas + inspector only, no table — best for placing/adjusting balloons |
| **Table** | Characteristics table only, full width — best for bulk-editing requirements |
| **Side by Side** | Canvas and table side by side, inspector below | 
| **Stacked** (default) | Canvas and inspector on top, table below |

Panel sizes are resizable by dragging the divider between them, and your sizing is remembered.

---

## 3. Capturing Text & OCR

Rather than retyping values from the drawing, use the **Text Select** tool (`T`) to pull text straight off the PDF into the "Selected PDF Text" box in the right-hand inspector:

![Text Select tool active](./assets/screenshots/11-text-select-active.png)

- Click any **embedded PDF text** item (real text, not a raster scan) to capture it.
- If the text isn't selectable (e.g. a scanned/rasterized drawing), **drag a rectangle** over it instead — QC Assistant runs on-device OCR (Tesseract.js) with adaptive contrast enhancement and perimeter-based inversion (handling faint scans and dark CAD title blocks) on that cropped region and drops the recognized text into the same box.
- Once text is captured, click one of the buttons below it — **Description**, **Drawing No**, **Rev**, **Requirement**, **Tolerance**, or **Notes** — to push it into that field, or into the currently-selected balloon's requirement/tolerance/notes.
- **Dual dimensions**: Dimensions containing bracketed secondary units (e.g. `25.40 [1.000] ±0.10 [±.004]`) automatically parse both primary and secondary values with units inferred from the $25.4$ metric/inch ratio.
- **DMS angular callouts**: Angles in Degrees-Minutes-Seconds (e.g. `45° 30' ±15'`, `45° 30' 36"`) parse accurately into decimal degree limit envelopes while preserving DMS display.

---

## 4. Ballooning

Ballooning is how you turn a dimension on the drawing into a tracked inspection requirement.

1. Select the **Balloon** tool (`B`).
2. Click on (or near) a dimension callout. QC Assistant snaps the balloon's leader target to the nearest recognized dimension text and pre-fills the nominal value and tolerance from it when it can parse them (e.g. `42.50 ±0.10`, `Ø12.00 +0.05/-0.02`, `90° ±0.5°`).
3. The balloon is placed with a default offset, leader line, and a solid vector arrowhead pointing directly at the feature target; **drag the numbered circle or the leader target** independently to fine-tune placement.
4. Balloons number sequentially as you place them (1, 2, 3, …).

### Repeated Dimensions & Sub-Balloons

When a drawing specifies repeated requirements (e.g. `4X Ø8.00`):

1. QC Assistant detects the quantity prefix and sets **Quantity** to `4` in the inspector for Balloon `3`.
2. Click **Create instances** to expand the requirement into linked occurrences `3.1`, `3.2`, `3.3`, and `3.4`.
3. The app enters guided placement: click the physical location for `3.2`, then `3.3` and `3.4`. Pressing `Escape` pauses placement; unplaced instances show a **Resume placement** action.
4. All instances share the requirement definition (nominal, tolerance, unit, method), but keep independent sample measurements, notes, and balloon coordinates.
5. In Excel exports, each occurrence occupies its own numbered row (`3.1`, `3.2`, `3.3`, `3.4`).

![Repeated dimensions: expanding 4X Ø8.00 creates linked sub-balloons 3.1–3.4 with guided placement](./assets/screenshots/18-repeated-dimensions.png)

- **Single-click** a balloon to select it (its details appear in "Selected Balloon" on the right).
- **Double-click**, or press `E` while selected, opens a small popover to **reassign its number** or **delete** it.
- **Add Row** (in the "Build Controls" section of the inspector) creates a characteristic with no balloon yet placed on the drawing — useful for notes/visual checks that don't map to a specific dimension.
- **Demo Rows** seeds 7 example characteristics for exploring the app without a real drawing.
- **Clear Drawing Data** wipes metadata + all characteristics for the active drawing; **Clear All Balloons** (in the table panel) clears just the characteristics table. Both ask for confirmation first.

---

## 5. Auto Balloon (Review tool)

For drawings with many dimensions, the **Review** tool (`A`) detects and pre-numbers several balloons at once instead of clicking each one individually.

1. Select **Review** and drag a rectangle around a cluster of dimension callouts.
2. QC Assistant first tries to detect dimension-shaped text from the PDF's **embedded text layer**. If nothing usable is found in that region (common on scanned/rasterized drawings), it automatically falls back to running **OCR** on the cropped area.
3. Detected candidates are de-duplicated, filtered for obvious noise (like page numbers), positioned along the nearest edge of your selection box, and numbered in clockwise order.
4. Review the candidate list in the inspector, remove any you don't want, then click **Add balloons** to commit them — each one is parsed for a nominal value and tolerance just like a manually placed balloon.

```mermaid
flowchart TD
    A[Drag selection box] --> B{Embedded PDF text found?}
    B -- yes --> C[Use embedded text candidates]
    B -- no --> D[Run OCR on cropped region]
    D --> E[Filter by confidence >= 45%]
    C --> F[Dedupe + filter page-number noise]
    E --> F
    F --> G[Position along nearest selection edge, order clockwise]
    G --> H[Show in Review Candidates panel]
    H -->|remove unwanted| H
    H -->|Add balloons| I[Commit as real, numbered balloons]
    H -->|Cancel| J[Discard candidates]
```

![Auto Balloon: selection box drawn, 3 candidates detected and shown for review](./assets/screenshots/09-auto-balloon-review-candidates.png)

![All six balloons placed — 3 manual, 3 from Auto Balloon](./assets/screenshots/10-balloons-and-table.png)

---

## 6. Characteristics Table

Every balloon has a matching row in the **QC / FAI Characteristics** table. Columns:

| Column | Notes |
|---|---|
| **ID #** | Balloon number; editable — reassigning it here also renumbers the balloon on the drawing |
| **Type** | `dimension`, `gdt`, `note`, or `visual`. Changing Type auto-fills a sensible default **Method** (`dimension`→DC, `gdt`→CMM, `note`/`visual`→VS) unless you've already set one |
| **Unit** | Free text (e.g. `MM`, `IN`) |
| **Nominal / Requirement** | The target value, or free text for notes/visual checks |
| **+Tol / −Tol** | Split tolerance inputs — supports symmetric (`±0.1`), asymmetric (`+0.1/-0.05`), and `MAX`/`MIN`-only tolerances |
| **USL / LSL** | Computed automatically from nominal + tolerance — read-only |
| **#1…#N** | One column per sample, count controlled by **Samples** in Build Controls (1, 3, 5, or 10 — or a custom number) |
| **Method** | Measurement method abbreviation (DC, CMM, VS, VMS, HG, MIC, CG, PP, TG, PG) |
| **Status** | Computed — see [Measurements & Status Logic](#8-measurements--status-logic) |
| **Notes** | Free text (editable in Measurement mode too) |

The table stays sorted by balloon number, and clicking a row selects that balloon on the drawing (and vice versa). In **Measurement mode** the same table renders read-only except for the sample columns and Notes — so the requirement definition can't drift while someone is taking measurements.

### Batch Sample Auto-Fill & Clipboard Pasting

To accelerate high-throughput data entry:

- **Clipboard Pasting**: Copy any 1D row, 1D column, or 2D matrix of numbers from Excel, Google Sheets, or CSV, click any sample cell, and press `Ctrl+V` (or `Cmd+V`). QC Assistant automatically maps cells across rows and sample columns.
- **Fill Nominals**: One-click action in the table header to populate empty sample cells with their nominal dimension values (and "OK" for visual/note requirements).
- **Fill Visuals OK**: Sets "OK" for all visual and note requirements in one pass without altering numeric dimension measurements.
- **Clear Samples**: Resets all recorded inspection measurements to empty while preserving drawing balloons and requirement definitions.

![Characteristics table batch sample actions](./assets/screenshots/21-batch-sample-actions.png)

---

## 7. Tolerance Table

Rather than typing the same general tolerance into every dimension, QC Assistant reads the drawing's title-block tolerance note (e.g. *"X.XX = ±0.05"*, *".X ±0.1"*, *"X° = ±0.5°"*) and offers to apply it in bulk.

Open it from the toolbar's **Tolerance** button.

![Tolerance table with auto-detected linear and angular tolerances](./assets/screenshots/12-tolerance-table.png)

- Each row is keyed by **decimal-place count** (e.g. 1, 2, or 3 places after the decimal) for linear dimensions, and by decimal places for angles (only matched against dimensions whose Unit contains `°` or `deg`).
- A badge shows whether the value was **Auto**-detected, **Manual** (you overrode it), or **Not detected**.
- **Fill N blank dimensions** applies that bucket's tolerance to every matching dimension that doesn't already have one — it never overwrites a tolerance you've already entered.
- **Apply all rows** does the same across every bucket at once.
- Override any row manually, or hit **Reset** to go back to the auto-detected value.

---

## 8. Measurements & Status Logic

Switch to **Measurement** mode to enter sample values against each requirement, in a locked, view-only version of the drawing plus an editable table.

![Measurement mode: table of 6 requirements with samples entered](./assets/screenshots/14-measurement-mode.png)

Each requirement's **Status** is computed conservatively — QC Assistant prefers to say "not finished" over incorrectly saying "passed":

```mermaid
flowchart TD
    Start[Evaluate one requirement] --> Empty{All samples empty?}
    Empty -- yes --> OPEN[Status: OPEN]
    Empty -- no --> TypeCheck{Type is note or visual?}
    TypeCheck -- yes --> AllOK{Every non-empty sample is 'OK'?}
    AllOK -- yes --> OK1[Status: OK]
    AllOK -- no --> NG1[Status: NG]
    TypeCheck -- no --> Limits{USL/LSL resolvable?}
    Limits -- no --> OPEN2[Status: OPEN — conservative default]
    Limits -- yes --> OutOfRange{Any sample non-numeric or outside LSL..USL?}
    OutOfRange -- yes --> NG2[Status: NG]
    OutOfRange -- no --> AllFilled{Every sample filled in?}
    AllFilled -- yes --> OK2[Status: OK]
    AllFilled -- no --> OPEN3[Status: OPEN]
```

The overall **project/drawing status** rolls this up the same way everywhere it's shown (dashboard, drawing selector, workspace header):

- Any requirement **NG** → overall **FAIL**
- Else any requirement **OPEN** → overall **OPEN**
- Else → overall **PASS**

![Requirement in progress — status stays OPEN until every sample is filled](./assets/screenshots/15-measurement-mode-status.png)

This means a half-filled inspection never silently reads as passing — it always reads as **OPEN** until it's actually complete, and any out-of-tolerance or non-numeric sample immediately fails it.

---

## 9. Settings

Open **Settings** (gear icon, top right) to adjust the toolbar and balloon appearance:

![Settings dialog with live balloon preview](./assets/screenshots/13-settings-dialog.png)

- **Button style**: Icon + Text or Icon Only for the toolbar buttons.
- **Balloon diameter** (16–48px) and **Number font size** (8–18px).
- **Balloon font color & family**: Choose font color (default Black) and font family (`Times New Roman`, `Arial`, or `Courier`).
- **Leader line visibility**: Show or Hide leader lines. When hidden, balloons snap directly onto features without connecting lines.
- **Leader line length**: Scales the default offset used when placing a new balloon (0.25× – 3×).
- **Arrowheads**: Terminations render as solid vector arrowheads pointing directly at the dimension target across both the editor canvas and exported PDFs.

Changes apply live (see the preview) and are saved automatically to your browser, independent of any project — they follow you across all projects and drawings.

---

## 10. Exporting

Once your characteristics table has at least one row, export actions in the toolbar and project detail page are enabled:

![Export buttons enabled in the toolbar](./assets/screenshots/16-export-toolbar.png)

### Single-Drawing Exports
- **PDF** — downloads a copy of the drawing with red numbered circles, leader lines, and solid arrowheads burned in on the correct pages. Filename: `<drawing-file-name>_ballooned.pdf`.
- **Excel (Default AS9102 Rev C)** — downloads an audit-ready AS9102 Rev C workbook containing:
  - **FAI Report (Form 3)**: Header metadata, characteristic rows sorted by balloon number, individual sample columns, MIN/MAX calculations, measurement methods, and equipment legend.
  - **AS9102 Form 1**: Part Number Accountability block, part index, and disposition summary.
  - **AS9102 Form 2**: Product Process Accountability covering raw material, special processes, general note workmanship, and characteristic verification conformance.

### Customer Blank Excel Templates (.xlsx)
When a customer requires their proprietary FAI form format:
1. Click **Template** in the workspace toolbar or Project Details.
2. Upload a blank customer `.xlsx` workbook.
3. Select the target inspection worksheet from the dropdown.
4. Map header cell addresses (e.g. `C2` for Part No, `E2` for Rev, `G2` for Status) in standard A1 notation.
5. Define table start/end rows with live capacity validation.
6. Map characteristic columns (Balloon #, Nominal, Tolerance, USL, LSL, Status, Samples #1..#N).
7. Save the template. The export button dynamically displays `Excel (<Template Name>)`. Clicking it fills a fresh copy of the customer's original form with all limits and statuses. A secondary **Default** button remains available to export the standard AS9102 workbook at any time.

![Customer Excel FAI Template dialog](./assets/screenshots/19-customer-template-dialog.png)

**Template Validation & Protection (v0.9.3):**
- **Formula Overwrite Protection**: The engine detects pre-existing Excel formulas (`=CONCATENATE(...)`, `=IF(...)`, etc.) in target header and table cells and blocks mapping to prevent clobbering customer workbook logic.
- **Merged-Cell Collision Guards**: Inspection table rows cannot intersect merged cell ranges. Header targets that intersect merged areas must map directly to the top-left cell of the merge.
- **Repeated-Dimension Capacity Checks**: Capacity validation calculates total required rows including expanded occurrences (`quantity > 1`), ensuring a `3X` dimension properly reserves 3 rows in the customer form.
- **Dual-Dimension Notes Parity**: Exports into custom templates preserve bracketed secondary dimension callouts (`[Dual: ...]`) in the mapped notes column, matching standard Form 3 behavior.

![Export controls: customer template export with Default fallback](./assets/screenshots/20-template-export-toolbar.png)

### Multi-Drawing Project Rollup Exports
For projects containing multiple drawings:
- **All PDFs (N)** — merges every ballooned drawing in the project into a single consolidated multi-page PDF package.
- **All Excel (N)** — exports a master project workbook containing a Project Form 1 summary tab, Form 2 process tab, a consolidated **All Characteristics** sheet merging all parts, and dedicated standalone Form 3 sheets for each drawing.

---

## 11. Keyboard Shortcuts

Shortcuts are disabled while typing in any text field, and in Measurement mode (where there's nothing to switch tools for).

| Key | Action |
|---|---|
| `B` | Balloon tool |
| `A` | Review / Auto Balloon tool |
| `V` | Select tool |
| `H` | Pan tool |
| `T` | Text Select / OCR tool |
| `E` | Open edit/reassign/delete popover for the selected balloon |
| `Enter` | Confirm Auto-Balloon candidates or finish editing selected balloon |
| `Del` / `Backspace` | Delete selected characteristic from drawing and table |
| `D` | Rapidly cycle requirement type (`dimension` → `gdt` → `note` → `visual`) |
| `↑` / `↓` (or `K` / `J`) | Navigate characteristic rows in the table with selection wrapping |
| `1`–`9` | Quick-assign balloon number to selected requirement |
| `+` / `−` | Zoom drawing in and out |
| `R` | Rotate drawing canvas 90° clockwise |
| `Esc` | Close the topmost open element — Settings/Tolerance dialog, candidate review, or pending balloon target |

![Help dialog — quick workflow and shortcut reference](./assets/screenshots/17-help-dialog.png)

You can always reopen this reference in the app itself via the **Help** button (or `?`).

---

## 12. Troubleshooting / FAQ

**"Local storage quota exceeded" when saving.** Your browser's storage for this site is full. Delete unused drawings or projects, or use a smaller PDF, then try again.

**A requirement shows OPEN and I don't understand why.** OPEN means either: not every sample has been entered yet, or QC Assistant couldn't resolve a usable tolerance (no nominal, no tolerance, or a tolerance format it couldn't parse) — check the Tolerance Table and the requirement's +Tol/−Tol fields. QC Assistant intentionally never guesses OK when it isn't sure.

**Auto Balloon found nothing, or found garbage.** It only searches inside the rectangle you drag — try a tighter or looser box around just the numbers you want. Very low-confidence OCR words are already filtered out (below 45% confidence), and obvious page-number-style text is filtered too, but OCR on noisy scans can still miss or misread values — remove bad candidates before clicking **Add balloons**, or place that one manually with the Balloon tool instead.

**I can't edit a balloon's requirement in Measurement mode.** That's by design — Measurement mode locks the requirement definition (type, unit, nominal, tolerance, method) so measurement entry can't accidentally change what's being measured. Switch to Edit mode to change the requirement itself.

**My drawing has text I can't click with Text Select.** That means it's raster (scanned) rather than embedded PDF text. Drag a rectangle over it instead — Text Select automatically falls back to on-device OCR for that region.

---

## 13. Appendix: Version History

Sourced from the in-app Help dialog's changelog.

**v0.9.5** — Drawing canvas 90° rotation: rotate drawing canvas in 90° clockwise increments (button or `R` shortcut) with synchronized coordinate transformation so placed balloons stay anchored to drawing features. Exported ballooned PDFs automatically apply drawing orientation with precisely aligned balloon coordinates. Preserved project details: project code, owner, delivery date, notes, and custom FAI templates are fully preserved across project saves, updates, and active project switching.

**v0.9.3** — Hardened customer Excel FAI template validation: automated verification of target worksheet existence, prevention of pre-existing formula cell overwrite, and detection of merged-cell collisions in inspection rows. Repeated-dimension capacity checks against expanded occurrence counts for multi-instance requirements. Dual-dimension note preservation (`[Dual: ...]`) in custom exports. Modal keyboard and cloud boundary persistence safeguards.

**v0.9.2** — Added support for uploaded customer-specific blank Excel FAI templates (`.xlsx`). Interactive mapping dialog for header cells (A1 notation) and table column bounds with real-time validation and project persistence in IndexedDB. Added default export fallback action.

**v0.9.1** — AS9102 Rev C Multi-Sheet FAI Excel Workbook export with Form 1 (Part Accountability), Form 2 (Product Process Accountability), and Form 3 (Characteristic Accountability). Multi-drawing project rollup for merged PDF packages and consolidated master Excel workbooks. Adaptive client-side OCR contrast enhancement. High-throughput keyboard navigation shortcuts. Batch sample auto-fill and 2D clipboard grid pasting. Dual dimensioning (`MM [IN]`) and Degrees-Minutes-Seconds (`45° 30' ±15'`) angle notation. Solid vector arrowhead terminations on balloon leader lines.

**v0.8.1** — Added Settings controls for the balloon number's font color (default Black) and font family (Times New Roman, Arial, or Courier) applied across the canvas and exported PDFs.

**v0.8.0** — Added Settings toggle to show or hide balloon leader lines.

**v0.7.0** — Improved project management with React Router-based navigation and new dedicated project pages.

**v0.6.0** — Improved the UI overall. Icon buttons now support a text label alongside the icon, with a setting to choose Icon only or Icon + Text.

**v0.5.0** — Tolerance inputs now preserve common leading-decimal drawing values like `.005`, `+.005`, and `-.002`. The tolerance table can fill every blank dimension matching a drawing pattern in one pass without overwriting entered tolerances.

**v0.4.0** — Added settings to customize balloon appearance and behavior.

**v0.3.1** — Changing a balloon's type from the table now keeps the selected-balloon editor in sync. Type changes update the inspection method through one shared rule.

**v0.3.0** — Toolbar reorganized into project controls and drawing controls. Auto Balloon became a dedicated panel (detect → review → confirm). Added an Edit/Measurement mode toggle. Drawings open at a better default zoom. Unsaved changes are indicated on the workspace. Rows with incomplete or indeterminate limits always show OPEN.

**v0.2.0** — Project management with local projects and up to 25 drawings per project (with storage warnings past 25 MB/drawing or 500 MB/project). Auto Balloon support. Keyboard shortcuts added (B/A/V/H/T/E/Esc).

---

*This guide, its diagrams, and its screenshots reflect the current app behavior, captured against a synthetic sample drawing.*
