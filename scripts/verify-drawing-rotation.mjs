#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import {
  rotateNormalizedPoint,
  rotateCharacteristicCoordinates,
  buildDrawingSnapshot,
} from "../src/lib/utils.js";
import {
  generateBalloonedPdf,
  generateBatchBalloonedPdf,
} from "../src/lib/exporters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePdfPath = path.join(__dirname, "..", "docs", "assets", "sample-drawing.pdf");

async function run() {
  console.log("Starting verification of drawing rotation and coordinate transformation...");

  // 1. rotateNormalizedPoint corner and quadrant tests
  assert.deepEqual(rotateNormalizedPoint({ x: 0.2, y: 0.3 }, 0), { x: 0.2, y: 0.3 });
  assert.deepEqual(rotateNormalizedPoint({ x: 0.2, y: 0.3 }, 90), { x: 0.7, y: 0.2 });
  assert.deepEqual(rotateNormalizedPoint({ x: 0.2, y: 0.3 }, 180), { x: 0.8, y: 0.7 });
  assert.deepEqual(rotateNormalizedPoint({ x: 0.2, y: 0.3 }, 270), { x: 0.3, y: 0.8 });
  assert.deepEqual(rotateNormalizedPoint({ x: 0.2, y: 0.3 }, 360), { x: 0.2, y: 0.3 });
  assert.deepEqual(rotateNormalizedPoint({ x: 0.2, y: 0.3 }, -90), { x: 0.3, y: 0.8 });

  // Four corners cycle test (0,0) -> (1,0) -> (1,1) -> (0,1) -> (0,0)
  const corner0 = { x: 0, y: 0 };
  const corner90 = rotateNormalizedPoint(corner0, 90);
  assert.deepEqual(corner90, { x: 1, y: 0 });
  const corner180 = rotateNormalizedPoint(corner90, 90);
  assert.deepEqual(corner180, { x: 1, y: 1 });
  const corner270 = rotateNormalizedPoint(corner180, 90);
  assert.deepEqual(corner270, { x: 0, y: 1 });
  const corner360 = rotateNormalizedPoint(corner270, 90);
  assert.deepEqual(corner360, { x: 0, y: 0 });

  // 2. rotateCharacteristicCoordinates tests
  const testChars = [
    {
      id: "char-1",
      balloonNo: 1,
      isPlaced: true,
      x: 0.25,
      y: 0.40,
      targetX: 0.30,
      targetY: 0.45,
      nominal: "25.0",
      tolerance: "±0.1",
    },
    {
      id: "char-unplaced",
      balloonNo: 2,
      isPlaced: false,
      nominal: "NOTE",
    },
  ];

  const rotated90 = rotateCharacteristicCoordinates(testChars, 90);
  assert.equal(rotated90[0].x, 0.6); // 1 - 0.4
  assert.equal(rotated90[0].y, 0.25);
  assert.equal(rotated90[0].targetX, 0.55); // 1 - 0.45
  assert.equal(rotated90[0].targetY, 0.30);
  assert.equal(rotated90[0].nominal, "25.0");
  assert.equal(rotated90[1].isPlaced, false);
  assert.equal(rotated90[1].x, undefined);

  // 4 sequential 90° rotations must restore original coordinates exactly
  let cycle = testChars;
  for (let i = 0; i < 4; i++) {
    cycle = rotateCharacteristicCoordinates(cycle, 90);
  }
  assert.equal(cycle[0].x, 0.25);
  assert.equal(cycle[0].y, 0.40);
  assert.equal(cycle[0].targetX, 0.30);
  assert.equal(cycle[0].targetY, 0.45);

  // 3. buildDrawingSnapshot includes rotation
  const snapshot = buildDrawingSnapshot({
    drawing: { rotation: 90 },
    activeDrawingId: "draw-1",
    activeProjectId: "proj-1",
    metadata: { drawingNo: "DWG-100" },
    unitSystem: "metric",
    toleranceOverrides: {},
    sampleCount: 3,
    pdfBytes: null,
    pdfName: "test.pdf",
    pageCount: 1,
    pageNumber: 1,
    zoom: 1.15,
    rotation: 90,
    characteristics: [],
    status: "OPEN",
    now: new Date().toISOString(),
  });
  assert.equal(snapshot.rotation, 90);

  // 4. PDF export with rotation verification
  const samplePdfBytes = await fs.readFile(samplePdfPath);
  const charsForPdf = [
    {
      id: "c1",
      balloonNo: 1,
      page: 1,
      isPlaced: true,
      x: 0.5,
      y: 0.5,
      targetX: 0.52,
      targetY: 0.52,
      nominal: "10.0",
      tolerance: "±0.05",
      type: "dimension",
    },
  ];

  // Default export (rotation 0)
  const defaultPdfBytes = await generateBalloonedPdf({
    pdfBytes: samplePdfBytes,
    characteristics: charsForPdf,
    rotation: 0,
  });
  const defaultDoc = await PDFDocument.load(defaultPdfBytes);
  assert.equal(defaultDoc.getPage(0).getRotation().angle, 0);

  // Rotated 90° export
  const rot90PdfBytes = await generateBalloonedPdf({
    pdfBytes: samplePdfBytes,
    characteristics: charsForPdf,
    rotation: 90,
  });
  const rot90Doc = await PDFDocument.load(rot90PdfBytes);
  assert.equal(rot90Doc.getPage(0).getRotation().angle, 90);

  // Rotated 270° export
  const rot270PdfBytes = await generateBalloonedPdf({
    pdfBytes: samplePdfBytes,
    characteristics: charsForPdf,
    rotation: 270,
  });
  const rot270Doc = await PDFDocument.load(rot270PdfBytes);
  assert.equal(rot270Doc.getPage(0).getRotation().angle, 270);

  // Batch export with rotated drawing
  const batchPdfBytes = await generateBatchBalloonedPdf({
    drawings: [
      {
        name: "Drawing 1 (Rotated)",
        pdfBytes: samplePdfBytes,
        characteristics: charsForPdf,
        rotation: 90,
      },
    ],
  });
  const batchDoc = await PDFDocument.load(batchPdfBytes);
  assert.equal(batchDoc.getPage(0).getRotation().angle, 90);

  console.log("PASS: 100% drawing rotation and coordinate transformation checks passed successfully!");
}

run().catch((err) => {
  console.error("FAIL: Drawing rotation verification failed:", err);
  process.exit(1);
});
