import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import {
  mapTextItem,
  getTextItemBounds,
  findDimensionAtPoint,
  findTextItemAtPoint,
  parseDimension,
} from "../src/lib/utils.js";

console.log("Starting verification of rotated and small text capture...");

// ---------------------------------------------------------------------------
// 1. mapTextItem with small font sizes (<= 9px) and rotations
// ---------------------------------------------------------------------------
// Synthetic viewport: 800 x 600, zoom = 1
const viewport = {
  width: 800,
  height: 600,
  transform: [1, 0, 0, -1, 0, 600],
};

// Test small text: 8px font size
const smallTextPdfItem = {
  str: "42.50 ±0.10",
  dir: "ltr",
  width: 50,
  height: 8,
  transform: [8, 0, 0, 8, 100, 300], // 8pt font at (100, 300) in PDF
};

const smallMapped = mapTextItem(smallTextPdfItem, 0, viewport, 1);
assert.ok(smallMapped, "Small text item must be mapped");
assert.equal(smallMapped.text, "42.50 ±0.10");
assert.ok(smallMapped.fontSize <= 9, `Font size ${smallMapped.fontSize} must be <= 9px`);
assert.equal(smallMapped.angle, 0);

// Test rotated text: 90 degrees counter-clockwise (vertical dimension on drawing)
// In PDF transform: a=0, b=10, c=-10, d=0 (rotation by 90 deg counter-clockwise)
const rotatedPdfItem = {
  str: "Ø12.00 +0.05/-0.02",
  dir: "ltr",
  width: 65,
  height: 9,
  transform: [0, 9, -9, 0, 200, 350],
};

const rotatedMapped = mapTextItem(rotatedPdfItem, 1, viewport, 1);
assert.ok(rotatedMapped, "Rotated text item must be mapped");
assert.equal(rotatedMapped.text, "Ø12.00 +0.05/-0.02");
assert.ok(Math.abs(Math.abs(rotatedMapped.angle) - Math.PI / 2) < 1e-4, "Angle must be approximately ±90 deg");

const rotatedBounds = getTextItemBounds(rotatedMapped);
assert.ok(rotatedBounds.width > 0, "Bounds width must be positive");
assert.ok(rotatedBounds.height > 0, "Bounds height must be positive");
assert.ok(
  rotatedBounds.height > rotatedBounds.width,
  "For 90 deg vertical text, height on screen must exceed width",
);

// ---------------------------------------------------------------------------
// 2. findDimensionAtPoint with rotated and small dimensions
// ---------------------------------------------------------------------------
const canvasSize = { width: 800, height: 600 };
const candidates = [
  { ...smallMapped, ...getTextItemBounds(smallMapped), ...parseDimension(smallMapped.text) },
  { ...rotatedMapped, ...getTextItemBounds(rotatedMapped), ...parseDimension(rotatedMapped.text) },
];

// Click on small horizontal dimension
const smallBounds = getTextItemBounds(smallMapped);
const smallClickPoint = {
  x: (smallBounds.left + smallBounds.width / 2) / canvasSize.width,
  y: (smallBounds.top + smallBounds.height / 2) / canvasSize.height,
};

const foundSmall = findDimensionAtPoint(smallClickPoint, candidates, canvasSize);
assert.ok(foundSmall, "Must find small dimension candidate at point");
assert.equal(foundSmall.text, "42.50 ±0.10");

// Click on rotated vertical dimension
const rotClickPoint = {
  x: (rotatedBounds.left + rotatedBounds.width / 2) / canvasSize.width,
  y: (rotatedBounds.top + rotatedBounds.height / 2) / canvasSize.height,
};

const foundRotated = findDimensionAtPoint(rotClickPoint, candidates, canvasSize);
assert.ok(foundRotated, "Must find rotated vertical dimension candidate at point");
assert.equal(foundRotated.text, "Ø12.00 +0.05/-0.02");

// Click on rotated dimension near boundary (with padding)
const rotNearBorderPoint = {
  x: (rotatedBounds.left - 3) / canvasSize.width,
  y: (rotatedBounds.top + rotatedBounds.height / 2) / canvasSize.height,
};
const foundNearBorder = findDimensionAtPoint(rotNearBorderPoint, candidates, canvasSize, 6);
assert.ok(foundNearBorder, "Must find rotated dimension within padding margin");
assert.equal(foundNearBorder.text, "Ø12.00 +0.05/-0.02");

// Click far outside
const outsidePoint = { x: 0.95, y: 0.95 };
assert.equal(findDimensionAtPoint(outsidePoint, candidates, canvasSize), null);

// ---------------------------------------------------------------------------
// 3. findTextItemAtPoint in Text Select mode
// ---------------------------------------------------------------------------
const textItems = [smallMapped, rotatedMapped];

// Find small text
const foundTextSmall = findTextItemAtPoint(smallClickPoint, textItems, canvasSize);
assert.ok(foundTextSmall, "Must find small text item");
assert.equal(foundTextSmall.text, "42.50 ±0.10");

// Find rotated text
const foundTextRotated = findTextItemAtPoint(rotClickPoint, textItems, canvasSize);
assert.ok(foundTextRotated, "Must find rotated text item");
assert.equal(foundTextRotated.text, "Ø12.00 +0.05/-0.02");

// Click slightly off-center (within 8px padding) on a 7px/8px small font item
const offCenterSmallPoint = {
  x: (smallBounds.left - 5) / canvasSize.width,
  y: (smallBounds.top + smallBounds.height / 2) / canvasSize.height,
};
const foundOffCenter = findTextItemAtPoint(offCenterSmallPoint, textItems, canvasSize, 8);
assert.ok(foundOffCenter, "Must find small text even when clicked slightly off-center");
assert.equal(foundOffCenter.text, "42.50 ±0.10");

// ---------------------------------------------------------------------------
// 4. End-to-end PDF extraction and hit testing with pdfjs-dist
// ---------------------------------------------------------------------------
const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
const page = pdfDoc.addPage([600, 600]);

// Add small font dimension text (8pt <= 9px)
page.drawText("8.00 ±0.05", { x: 100, y: 450, font, size: 8 });

// Add rotated vertical dimension text (90 degrees, 9pt)
page.drawText("Ø25.00 +0.1/-0", { x: 300, y: 200, font, size: 9, rotate: degrees(90) });

const testBytes = await pdfDoc.save();

// Load with pdfjs-dist
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const loading = pdfjs.getDocument({ data: testBytes });
const loaded = await loading.promise;
const p1 = await loaded.getPage(1);
const textContent = await p1.getTextContent();
const realVp = p1.getViewport({ scale: 1 });

const realItems = textContent.items
  .map((item, i) => mapTextItem(item, i, realVp, 1))
  .filter(Boolean);

assert.equal(realItems.length, 2, "Must extract both text items from PDF");

// Verify small item
const realSmall = realItems.find((item) => item.text === "8.00 ±0.05");
assert.ok(realSmall, "Must extract 8pt small text item");
assert.ok(realSmall.fontSize <= 9, `Expected font size <= 9px, got ${realSmall.fontSize}`);

const realSmallBounds = getTextItemBounds(realSmall);
const realSmallClick = {
  x: (realSmallBounds.left + realSmallBounds.width / 2) / realVp.width,
  y: (realSmallBounds.top + realSmallBounds.height / 2) / realVp.height,
};
assert.equal(findTextItemAtPoint(realSmallClick, realItems, realVp)?.text, "8.00 ±0.05");

// Verify rotated item
const realRotated = realItems.find((item) => item.text.includes("Ø25.00"));
assert.ok(realRotated, "Must extract rotated vertical text item");
assert.ok(Math.abs(Math.abs(realRotated.angle) - Math.PI / 2) < 0.1, "Angle must be ~90 deg");

const realRotBounds = getTextItemBounds(realRotated);
const realRotClick = {
  x: (realRotBounds.left + realRotBounds.width / 2) / realVp.width,
  y: (realRotBounds.top + realRotBounds.height / 2) / realVp.height,
};
assert.equal(findTextItemAtPoint(realRotClick, realItems, realVp)?.text, "Ø25.00 +0.1/-0");

console.log("PASS: 100% rotated and small text capture checks passed successfully!");

