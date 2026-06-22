# QC Assistant

Interactive drawing ballooning and QC/FAI inspection report builder. Upload an engineering drawing PDF, place numbered balloons on each requirement, record sample measurements, and export a ballooned PDF and a filled-in Excel inspection workbook.

---

## Features

### Drawing Viewer
- Upload any engineering drawing in PDF format
- Multi-page navigation with zoom controls (65%–220%)
- Pan mode for navigating large drawings

### Ballooning
- **Balloon tool** — click the dimension target on the drawing, then click where the balloon circle should sit; a red leader line connects them automatically
- Drag balloons and leader targets independently to reposition after placement
- Balloons are numbered sequentially and renumber automatically on deletion

### Text Extraction
- **Text Select mode** — click embedded PDF text to capture it; send directly to any metadata field or QC row field
- **OCR mode** — drag a rectangle over any area of the drawing (including non-selectable raster text); Tesseract.js reads it and populates the capture buffer
- Captured text can be applied to: Drawing No, Rev, Supplier, Description, Requirement, Tolerance, or Notes

### QC / FAI Characteristics Table
Each balloon corresponds to a row with:

| Field | Options |
|-------|---------|
| Type | `dimension`, `gdt`, `note`, `visual` |
| Unit | Free text (MM, Ø, POSITION, PROFILE, …) |
| Nominal / Requirement | Numeric value or descriptive text |
| Tolerance | Numeric (e.g. `0.13`), `MAX`, or `MIN` suffix |
| USL / LSL | Calculated automatically from nominal ± tolerance |
| Measurement Method | DC, CMM, VS, VMS, HG, MIC, CG, PP, TG, PG |
| Samples | 1, 3, 5, or 10 measurements per characteristic |
| Status | `OPEN` → `OK` / `NG` — auto-evaluated against limits |

Overall package status rolls up to **PASS / OPEN / FAIL** based on all characteristics.

### Exports
- **Ballooned PDF** — original drawing with red numbered circles and leader lines burned in (via pdf-lib)
- **Excel QC/FAI Workbook** — Final Inspection Report sheet with header metadata, all characteristics, per-sample measurements, MIN/MAX columns, and a measurement equipment abbreviation legend (via SheetJS)

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

### Build

```bash
pnpm build
```

Output goes to `dist/`.

---

## Workflow

1. **Upload** a drawing PDF using the toolbar button or the drop zone.
2. Fill in **Drawing No**, **Rev**, **Supplier**, and **Description** in the header (or use Text Select to pull values directly from the PDF).
3. Select the **Balloon tool** and click each dimension target, then click where the balloon should appear. Repeat for every characteristic.
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
