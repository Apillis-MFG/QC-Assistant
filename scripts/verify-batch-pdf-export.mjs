import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { generateBatchBalloonedPdf } from "../src/lib/exporters.js";

console.log("Starting verification of multi-drawing batch PDF export (P1-6)...");

// ---------------------------------------------------------------------------
// 1. Guardrails & Input Validation
// ---------------------------------------------------------------------------
await assert.rejects(
  generateBatchBalloonedPdf({ drawings: [] }),
  /No drawings provided for batch PDF export/,
  "Must reject empty drawings array"
);

await assert.rejects(
  generateBatchBalloonedPdf({ drawings: null }),
  /No drawings provided for batch PDF export/
);

await assert.rejects(
  generateBatchBalloonedPdf({
    drawings: [
      { id: "d1", name: "Drawing 1", pdfBytes: null, characteristics: [] },
      { id: "d2", name: "Drawing 2", pdfBytes: new Uint8Array(), characteristics: [] },
    ],
  }),
  /None of the project drawings have uploaded PDF files/,
  "Must reject when none of the drawings have PDF bytes"
);

// ---------------------------------------------------------------------------
// 2. Unplaced Occurrences Guard per Drawing
// ---------------------------------------------------------------------------
const dummyDoc = await PDFDocument.create();
dummyDoc.addPage([500, 700]);
const dummyBytes = await dummyDoc.save();

await assert.rejects(
  generateBatchBalloonedPdf({
    drawings: [
      {
        id: "d1",
        name: "Cover Bracket",
        pdfBytes: dummyBytes,
        characteristics: [
          { id: "char-1", balloonNo: 1, quantity: 3, instancesExpanded: false, isPlaced: true, x: 0.5, y: 0.5 },
        ],
      },
    ],
  }),
  /Drawing "Cover Bracket" has unplaced balloon instances/,
  "Must cite specific drawing name when unplaced occurrences exist"
);

// ---------------------------------------------------------------------------
// 3. Multi-Drawing PDF Merge with Balloons & Geometry Preservation
// ---------------------------------------------------------------------------
// Create Drawing 1: 2 pages (500x700 pt)
const doc1 = await PDFDocument.create();
doc1.addPage([500, 700]);
doc1.addPage([500, 700]);
const pdf1Bytes = await doc1.save();

// Create Drawing 2: 1 page Landscape (842x595 pt)
const doc2 = await PDFDocument.create();
doc2.addPage([842, 595]);
const pdf2Bytes = await doc2.save();

// Create Drawing 3: 1 page with no balloons (600x600 pt)
const doc3 = await PDFDocument.create();
doc3.addPage([600, 600]);
const pdf3Bytes = await doc3.save();

const projectDrawings = [
  {
    id: "draw-1",
    name: "Machined Housing",
    pdfBytes: pdf1Bytes,
    characteristics: [
      { id: "c1", balloonNo: 1, page: 1, x: 0.2, y: 0.3, targetX: 0.25, targetY: 0.35, isPlaced: true },
      { id: "c2", balloonNo: 2, page: 2, x: 0.6, y: 0.7, targetX: 0.65, targetY: 0.75, isPlaced: true },
    ],
  },
  {
    id: "draw-2",
    name: "Base Flange",
    pdfBytes: pdf2Bytes,
    characteristics: [
      { id: "c3", balloonNo: 1, page: 1, x: 0.4, y: 0.5, targetX: 0.45, targetY: 0.55, isPlaced: true },
    ],
  },
  {
    id: "draw-3",
    name: "Clean Mounting Plate",
    pdfBytes: pdf3Bytes,
    characteristics: [], // No balloons yet
  },
];

const mergedBytes = await generateBatchBalloonedPdf({
  drawings: projectDrawings,
  showLeaderLine: true,
  diameter: 24,
});

assert.ok(mergedBytes instanceof Uint8Array, "Batch export must produce Uint8Array bytes");
assert.ok(mergedBytes.byteLength > 0, "Batch export bytes must not be empty");

// Load the resulting merged document
const loadedMaster = await PDFDocument.load(mergedBytes);

// 2 pages from Drawing 1 + 1 page from Drawing 2 + 1 page from Drawing 3 = 4 pages total
assert.equal(loadedMaster.getPageCount(), 4, "Merged PDF must contain exactly 4 pages");

// Verify individual page dimensions are preserved
const page1 = loadedMaster.getPage(0);
assert.equal(page1.getSize().width, 500);
assert.equal(page1.getSize().height, 700);

const page2 = loadedMaster.getPage(1);
assert.equal(page2.getSize().width, 500);
assert.equal(page2.getSize().height, 700);

const page3 = loadedMaster.getPage(2);
assert.equal(page3.getSize().width, 842);
assert.equal(page3.getSize().height, 595);

const page4 = loadedMaster.getPage(3);
assert.equal(page4.getSize().width, 600);
assert.equal(page4.getSize().height, 600);

console.log("PASS: 100% multi-drawing batch PDF export checks passed successfully!");
