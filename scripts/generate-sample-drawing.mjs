#!/usr/bin/env node
// Throwaway generator for a synthetic mechanical-part drawing PDF, used only
// to produce realistic User's Guide screenshots (ballooning, auto-balloon,
// tolerance-table auto-detection). Not part of the app runtime.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "docs", "assets");
const outFile = path.join(outDir, "sample-drawing.pdf");

const PAGE_W = 792; // 11in landscape
const PAGE_H = 612; // 8.5in

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const draw = (text, x, y, size = 9, f = font) =>
    page.drawText(text, { x, y, size, font: f, color: black });

  // Border
  page.drawRectangle({
    x: 24,
    y: 24,
    width: PAGE_W - 48,
    height: PAGE_H - 48,
    borderColor: black,
    borderWidth: 1.2,
  });

  draw("BRACKET, MOUNTING - LH", 60, 560, 14, bold);

  // Part outline (simple bracket silhouette)
  page.drawRectangle({ x: 120, y: 300, width: 260, height: 160, borderColor: black, borderWidth: 1.2 });
  page.drawRectangle({ x: 120, y: 460, width: 90, height: 60, borderColor: black, borderWidth: 1.2 });
  page.drawCircle({ x: 165, y: 490, size: 12, borderColor: black, borderWidth: 1 });
  page.drawCircle({ x: 165, y: 340, size: 8, borderColor: black, borderWidth: 1 });
  page.drawCircle({ x: 355, y: 340, size: 8, borderColor: black, borderWidth: 1 });

  // Dimension callouts (each drawText() call is one embedded text item,
  // matching how a real CAD-exported PDF places discrete text runs)
  draw("42.50 ±0.10", 200, 470, 9);
  draw("Ø12.00 +0.05/-0.02", 380, 486, 9);
  draw("25.0", 240, 400, 9);
  draw("90° ±0.5°", 420, 300, 9);
  draw("2X R8.00 MAX", 130, 260, 9);
  draw("4X Ø8.00", 355, 250, 9);
  draw("12.500", 260, 340, 9);
  draw("NOTE 1: BREAK ALL SHARP EDGES .010-.020", 60, 130, 8);
  draw("NOTE 2: SURFACE FINISH 125 Ra UNLESS NOTED", 60, 116, 8);

  // General tolerance block (title-block style, parsed by dimensionExtractor.js)
  draw("UNLESS OTHERWISE SPECIFIED:", 480, 130, 8, bold);
  draw("DIMENSIONS ARE IN INCHES", 480, 118, 8);
  draw("X.XX = ±0.05", 480, 106, 8);
  draw("X.XXX = ±0.005", 480, 94, 8);
  draw("X.X = ±0.1", 480, 82, 8);
  draw("X° = ±0.5°", 480, 70, 8);

  // Title block
  draw("PART NO: BRK-1042", 480, 200, 9, bold);
  draw("REV: B", 480, 188, 9);
  draw("MATERIAL: 6061-T6 ALUMINUM", 480, 176, 9);
  draw("DESCRIPTION: MOUNTING BRACKET, LH", 480, 164, 9);
  draw("SCALE: 1:1   SHEET 1 OF 1", 480, 152, 9);

  const bytes = await doc.save();
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, bytes);
  console.log(`Wrote ${outFile} (${bytes.byteLength} bytes)`);
}

main();
