import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import {
  mapRelativeCoordinatesToPdf,
  generateBalloonedPdf,
  exportBalloonedPdf,
  getLeaderGeometry,
} from "../src/lib/exporters.js";
import { getLeaderLine } from "../src/lib/utils.js";

console.log("Starting verification of PDF coordinate accuracy and multi-page balloon export...");

// ---------------------------------------------------------------------------
// 1. mapRelativeCoordinatesToPdf verification
// ---------------------------------------------------------------------------
// Standard page: 400 pt wide x 600 pt tall
const W = 400;
const H = 600;

// Rotation 0: (x=0, y=0) is top-left -> PDF (0, 600); (x=1, y=1) is bottom-right -> PDF (400, 0)
assert.deepEqual(mapRelativeCoordinatesToPdf({ x: 0, y: 0, width: W, height: H, rotation: 0 }), {
  x: 0,
  y: 600,
  rotation: 0,
  textAngle: 0,
});
assert.deepEqual(mapRelativeCoordinatesToPdf({ x: 1, y: 1, width: W, height: H, rotation: 0 }), {
  x: 400,
  y: 0,
  rotation: 0,
  textAngle: 0,
});
assert.deepEqual(mapRelativeCoordinatesToPdf({ x: 0.5, y: 0.5, width: W, height: H, rotation: 0 }), {
  x: 200,
  y: 300,
  rotation: 0,
  textAngle: 0,
});

// Rotation 90: (x=0.2, y=0.3) -> PDF (0.3*W, 0.2*H) = (120, 120), textAngle = 270
assert.deepEqual(mapRelativeCoordinatesToPdf({ x: 0.2, y: 0.3, width: W, height: H, rotation: 90 }), {
  x: 120,
  y: 120,
  rotation: 90,
  textAngle: 270,
});

// Rotation 180: (x=0.2, y=0.3) -> PDF ((1-0.2)*W, 0.3*H) = (320, 180), textAngle = 180
assert.deepEqual(mapRelativeCoordinatesToPdf({ x: 0.2, y: 0.3, width: W, height: H, rotation: 180 }), {
  x: 320,
  y: 180,
  rotation: 180,
  textAngle: 180,
});

// Rotation 270: (x=0.2, y=0.3) -> PDF ((1-0.3)*W, (1-0.2)*H) = (280, 480), textAngle = 90
assert.deepEqual(mapRelativeCoordinatesToPdf({ x: 0.2, y: 0.3, width: W, height: H, rotation: 270 }), {
  x: 280,
  y: 480,
  rotation: 270,
  textAngle: 90,
});

// Clamping bounds
assert.equal(mapRelativeCoordinatesToPdf({ x: -0.5, y: 1.5, width: W, height: H }).x, 0);
assert.equal(mapRelativeCoordinatesToPdf({ x: -0.5, y: 1.5, width: W, height: H }).y, 0);

// Large engineering page sizes: A1 Landscape (2384 x 1684 pt)
const a1Width = 2384;
const a1Height = 1684;
const a1Coord = mapRelativeCoordinatesToPdf({ x: 0.25, y: 0.75, width: a1Width, height: a1Height, rotation: 0 });
assert.equal(a1Coord.x, 0.25 * a1Width);
assert.equal(a1Coord.y, a1Height - 0.75 * a1Height);

// ---------------------------------------------------------------------------
// 2. Multi-page and multi-size PDF export verification
// ---------------------------------------------------------------------------
// Create a synthetic 3-page PDF:
// Page 1: Letter portrait (612 x 792)
// Page 2: Tabloid landscape (1224 x 792)
// Page 3: Letter with 90 deg rotation (612 x 792, rot 90)
const doc = await PDFDocument.create();
const p1 = doc.addPage([612, 792]);
const p2 = doc.addPage([1224, 792]);
const p3 = doc.addPage([612, 792]);
p3.setRotation(degrees(90));
const basePdfBytes = await doc.save();

const testCharacteristics = [
  {
    id: "char-p1",
    balloonNo: 1,
    page: 1,
    x: 0.2,
    y: 0.3,
    targetX: 0.25,
    targetY: 0.35,
    isPlaced: true,
  },
  {
    id: "char-p2",
    balloonNo: 2,
    page: 2,
    x: 0.8,
    y: 0.5,
    targetX: 0.75,
    targetY: 0.5,
    isPlaced: true,
  },
  {
    id: "char-p3",
    balloonNo: 3,
    page: 3,
    x: 0.5,
    y: 0.5,
    targetX: 0.6,
    targetY: 0.5,
    isPlaced: true,
  },
];

const exportedPdfBytes = await generateBalloonedPdf({
  pdfBytes: basePdfBytes,
  characteristics: testCharacteristics,
  showLeaderLine: true,
});

assert.ok(exportedPdfBytes instanceof Uint8Array, "Must return Uint8Array");
assert.ok(exportedPdfBytes.byteLength > basePdfBytes.byteLength, "Annotated PDF must be larger than original");

// Re-load annotated document and verify structure
const reloaded = await PDFDocument.load(exportedPdfBytes);
assert.equal(reloaded.getPageCount(), 3, "Page count must be preserved");

// Check page sizes and rotations
const relPage1 = reloaded.getPage(0);
const relPage2 = reloaded.getPage(1);
const relPage3 = reloaded.getPage(2);

assert.deepEqual(relPage1.getSize(), { width: 612, height: 792 });
assert.deepEqual(relPage2.getSize(), { width: 1224, height: 792 });
assert.deepEqual(relPage3.getSize(), { width: 612, height: 792 });
assert.equal(relPage3.getRotation().angle, 90, "Page 3 rotation must be preserved");

// ---------------------------------------------------------------------------
// 3. Error guard verification
// ---------------------------------------------------------------------------
await assert.rejects(
  async () => generateBalloonedPdf({ pdfBytes: null, characteristics: [] }),
  /Upload a PDF before exporting/,
);

await assert.rejects(
  async () =>
    generateBalloonedPdf({
      pdfBytes: basePdfBytes,
      characteristics: [{ id: "c1", balloonNo: 1, isPlaced: false }],
    }),
  /Place every required instance before exporting PDF/,
);

// ---------------------------------------------------------------------------
// 4. Leader line arrowhead geometry verification
// ---------------------------------------------------------------------------
// Test A: Horizontal right pointing leader line
const horizLeader = getLeaderGeometry({
  x: 100,
  y: 100,
  targetX: 200,
  targetY: 100,
  radius: 12,
  arrowLength: 5.5,
  arrowWidth: 2.2,
});

assert.ok(horizLeader, "Horizontal leader geometry must be generated");
assert.equal(horizLeader.startX, 100 + 13.5, "Line should start at balloon perimeter + offset");
assert.equal(horizLeader.startY, 100);
assert.equal(horizLeader.endX, 200 - 5.5, "Line should terminate at base of arrowhead");
assert.equal(horizLeader.endY, 100);

assert.ok(horizLeader.arrow, "Arrowhead geometry must be present");
assert.deepEqual(horizLeader.arrow.tip, { x: 200, y: 100 }, "Arrowhead tip must touch target");
assert.deepEqual(horizLeader.arrow.base, { x: 194.5, y: 100 }, "Arrowhead base must be arrowLength back from tip");
assert.deepEqual(horizLeader.arrow.left, { x: 194.5, y: 102.2 });
assert.deepEqual(horizLeader.arrow.right, { x: 194.5, y: 97.8 });
assert.equal(horizLeader.arrow.svgPath, "M 200 100 L 194.5 102.2 L 194.5 97.8 Z");

// Test B: Vertical downward pointing leader line
const vertLeader = getLeaderGeometry({
  x: 100,
  y: 100,
  targetX: 100,
  targetY: 200,
  radius: 12,
  arrowLength: 6,
  arrowWidth: 2.5,
});

assert.ok(vertLeader, "Vertical leader geometry must be generated");
assert.equal(vertLeader.startX, 100);
assert.equal(vertLeader.startY, 100 + 13.5);
assert.equal(vertLeader.endX, 100);
assert.equal(vertLeader.endY, 200 - 6);
assert.deepEqual(vertLeader.arrow.tip, { x: 100, y: 200 });
assert.deepEqual(vertLeader.arrow.base, { x: 100, y: 194 });

// Test C: Distance threshold (too close to feature -> leader line omitted)
const tooCloseLeader = getLeaderGeometry({
  x: 100,
  y: 100,
  targetX: 110,
  targetY: 100,
  radius: 12,
  arrowLength: 5.5,
});
assert.equal(tooCloseLeader, null, "Leader line must return null when balloon is too close to feature");

// Test D: Canvas getLeaderLine
const canvasLeader = getLeaderLine({
  x: 50,
  y: 50,
  targetX: 150,
  targetY: 50,
  radius: 13,
  arrowLength: 7,
  arrowWidth: 2.8,
});
assert.ok(canvasLeader.arrow, "Canvas leader must compute arrowhead points");
assert.equal(canvasLeader.arrow.tip.x, 150);
assert.equal(canvasLeader.arrow.tip.y, 50);
assert.equal(canvasLeader.arrow.base.x, 143);
assert.equal(canvasLeader.arrow.polygonPoints, "150.0,50.0 143.0,52.8 143.0,47.2");

console.log("PASS: 100% PDF coordinate accuracy and multi-page export checks passed successfully!");

