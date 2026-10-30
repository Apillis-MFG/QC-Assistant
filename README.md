# QC Assistant

Interactive drawing ballooning and QC/FAI inspection report builder. Upload an engineering drawing PDF, place numbered balloons on each requirement, record sample measurements, and export a ballooned PDF and a filled-in Excel inspection workbook.

---

## Features

### Drawing Viewer
- Upload any engineering drawing in PDF format
- Multi-page navigation with zoom controls (65%–220%)
- Pan mode for navigating large drawings

### Ballooning
- **Balloon tool** — click a dimension target once; QC Assistant places the next numbered balloon with a default red leader line
- Drag balloons and leader targets independently to reposition after placement
- Single-click selects a balloon; double-click or press `E` to open edit/delete actions
- **Repeated dimensions** — support for `3X Ø10 ±0.1` expanding into linked sub-balloons (`5.1`, `5.2`, `5.3`) with guided target placement
- Customizable balloon diameter, font family, font color, leader scale, and solid arrowhead terminations

### Text Extraction
- **Text Select mode** — click embedded PDF text to capture it; send directly to any metadata field or QC row field
- **OCR mode** — drag a rectangle over any area of the drawing (including non-selectable raster text); on-device Tesseract.js with adaptive binarization and contrast stretching
- Automatic dual dimension parsing (`MM [IN]`) and Degrees-Minutes-Seconds (`45° 30' ±15'`) angle notation
- Captured text can be applied to: Drawing No, Rev, Supplier, Description, Requirement, Tolerance, or Notes

### QC / FAI Characteristics Table
Each balloon corresponds to a row with:

| Field | Options |
|-------|---------|
| Type | `dimension`, `gdt`, `note`, `visual` |
| Unit | Free text (`MM`, `IN`, `°`, `Ø`, `POSITION`, `PROFILE`, …) |
| Nominal / Requirement | Numeric value, angle, or descriptive text |
| Tolerance | Numeric (e.g. `0.13`), bilateral `+0.1/-0.05`, `MAX`, `MIN`, or DMS |
| USL / LSL | Calculated automatically from nominal ± tolerance |
| Measurement Method | DC, CMM, VS, VMS, HG, MIC, CG, PP, TG, PG, etc. |
| Samples | 1, 3, 5, 10, or custom measurements per characteristic |
| Batch Auto-Fill | Fill Nominals, Fill Visuals OK, or paste 2D grids directly from Excel/Sheets |
| Status | `OPEN` → `OK` / `NG` — auto-evaluated conservatively against limits |

Overall package status rolls up to **PASS / OPEN / FAIL** based on all characteristics.

### Exports
- **Ballooned PDF** — original drawing with red numbered circles, leader lines, and solid arrowheads burned in (via `pdf-lib`)
- **AS9102 Rev C Excel FAI Workbook** — multi-sheet workbook with Form 1 (Part Number Accountability), Form 2 (Product Process Accountability), and Form 3 (Characteristic Accountability)
- **Customer Excel FAI Templates** — upload any blank customer `.xlsx` form, map header cells and table columns, and export directly into the customer's exact submission layout
- **Multi-Drawing Project Rollup** — one-click export for all drawings in a project into a merged multi-page PDF package or consolidated master Excel workbook with part index

### Help And Shortcuts
- In-app Help explains the upload → balloon → capture → measure → export workflow
- Keyboard shortcuts accessible via the in-app Help menu or `/guide`:
  - `B`: Balloon tool
  - `A`: Review / Auto-Balloon tool
  - `V`: Select tool
  - `H`: Pan tool
  - `T`: Text Select / OCR tool
  - `E`: Edit selected balloon
  - `Enter`: Confirm candidate review or finish edit
  - `Del` / `Backspace`: Delete selected requirement
  - `D`: Cycle requirement type
  - `↑` / `↓` (`J` / `K`): Navigate characteristic table rows
  - `1`–`9`: Quick-set balloon number
  - `+` / `−`: Zoom in / out
  - `Esc`: Cancel active tool, review, or dialog

---

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm

### Install and Run

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/`.

### Run Verification Test Suite

```bash
pnpm test
```

Runs all 13 deterministic verification suites covering math, parsing, occurrences, exports, and layout.

### Build

```bash
pnpm build
```

Output goes to `dist/`.

---

## Workflow

1. **Upload** a drawing PDF using the toolbar button or the drop zone.
2. Fill in **Drawing No**, **Rev**, **Supplier**, and **Description** in the header (or use Text Select to pull values directly from the PDF).
3. Select the **Balloon tool** and click each dimension target once. Repeat for every characteristic, then drag balloons or targets to adjust leader placement.
4. For each balloon row in the table, set the type, unit, nominal, tolerance, and measurement method. Use the **Text Select** tool to copy values from the drawing rather than typing them.
5. Set the **Samples** count and enter measured values in the table or the inspector panel. Status updates automatically.
6. Export the **Ballooned PDF** and the **Excel** workbook when all characteristics are complete.

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 19 | UI |
| Vite 6 | Dev server and bundler |
| pdfjs-dist | PDF rendering and text extraction |
| pdf-lib | Balloon/leader annotation on exported PDFs |
| Tesseract.js | OCR for raster drawing text |
| SheetJS (xlsx) | Excel workbook generation |
| lucide-react | Icons |

---

## Deployment

The project is Vercel-ready via `vercel.json`.

| Setting | Value |
|---------|-------|
| Framework | Vite |
| Build command | `pnpm build` |
| Output directory | `dist` |

Set the Vercel **Project Root** to `QC-Assistant` if deploying from a monorepo.

---

## Measurement Method Abbreviations

| Code | Instrument |
|------|-----------|
| DC | Digital Caliper |
| CMM | Coordinate Measuring Machine |
| VS | Visual Inspection |
| VMS | Vision Measuring System |
| HG | Height Gauge |
| MIC | Micrometer |
| CG | Checking Gauge |
| PP | Profile Projector |
| TG | Thickness Gauge |
| PG | Pin Gauge |
