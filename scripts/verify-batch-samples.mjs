import assert from "node:assert/strict";
import {
  parseClipboardGrid,
  computePastedSampleUpdates,
  computeAutoFillSampleUpdates,
} from "../src/lib/utils.js";
import { getStatus, overallStatus } from "../src/lib/exporters.js";

console.log("Starting verification of batch sample auto-fill & clipboard pasting (P1-5)...");

// ---------------------------------------------------------------------------
// 1. parseClipboardGrid verification
// ---------------------------------------------------------------------------
assert.deepEqual(parseClipboardGrid(null), []);
assert.deepEqual(parseClipboardGrid(undefined), []);
assert.deepEqual(parseClipboardGrid(""), []);
assert.deepEqual(parseClipboardGrid("   "), []);

// Single cell
assert.deepEqual(parseClipboardGrid("10.05"), [["10.05"]]);

// Excel / Sheets tab-separated values (horizontal row)
assert.deepEqual(
  parseClipboardGrid("10.01\t10.02\t10.03\t10.04\t10.05"),
  [["10.01", "10.02", "10.03", "10.04", "10.05"]],
  "Horizontal TSV row must be parsed into 1 row of 5 cells"
);

// Excel / Sheets newline-separated column (vertical column)
assert.deepEqual(
  parseClipboardGrid("10.01\r\n20.02\r\n30.03\r\n"),
  [["10.01"], ["20.02"], ["30.03"]],
  "Vertical column copied from Excel must be parsed into 3 rows of 1 cell"
);

// Excel 2D grid matrix with trailing \r\n
const excelMatrix = "10.01\t10.02\t10.03\r\n20.01\t20.02\t20.03\r\n30.01\t30.02\t30.03\r\n";
assert.deepEqual(
  parseClipboardGrid(excelMatrix),
  [
    ["10.01", "10.02", "10.03"],
    ["20.01", "20.02", "20.03"],
    ["30.01", "30.02", "30.03"],
  ],
  "2D Excel matrix must be parsed cleanly without phantom trailing rows"
);

// CSV comma-separated values
assert.deepEqual(
  parseClipboardGrid("10.01, 10.02, 10.03\n20.01, 20.02, 20.03"),
  [
    ["10.01", "10.02", "10.03"],
    ["20.01", "20.02", "20.03"],
  ],
  "Comma-separated CSV must parse cells and trim cell whitespace"
);

// Quoted CSV cells (e.g. strings or angles with internal formatting)
assert.deepEqual(
  parseClipboardGrid('"10.01", "20.02", "45° 30\'"'),
  [["10.01", "20.02", "45° 30'"]],
  "Quoted cells must have surrounding quotes cleanly stripped"
);

// ---------------------------------------------------------------------------
// 2. computePastedSampleUpdates verification
// ---------------------------------------------------------------------------
const characteristics = [
  { id: "char-1", balloonNo: 1, type: "dimension", nominal: "10.00", tolerance: "±0.1", samples: {} },
  { id: "char-2", balloonNo: 2, type: "dimension", nominal: "20.00", tolerance: "±0.1", samples: {} },
  { id: "char-3", balloonNo: 3, type: "visual", nominal: "BURR FREE", tolerance: "", samples: {} },
  { id: "char-4", balloonNo: 4, type: "dimension", nominal: "40.00", tolerance: "±0.2", samples: {} },
];

// Paste 2D grid from top-left (char-1, sampleIndex 0, sampleCount 5)
const paste2D = [
  ["10.01", "10.02", "10.03"],
  ["20.01", "20.02", "20.03"],
];
const updates1 = computePastedSampleUpdates(characteristics, "char-1", 0, 5, paste2D);
assert.deepEqual(updates1, {
  "char-1": { 0: "10.01", 1: "10.02", 2: "10.03" },
  "char-2": { 0: "20.01", 1: "20.02", 2: "20.03" },
});

// Paste at offset row and column (start at char-2, sample #3 / index 2)
const pasteOffset = [
  ["20.05", "20.06"],
  ["OK", "OK"],
];
const updates2 = computePastedSampleUpdates(characteristics, "char-2", 2, 5, pasteOffset);
assert.deepEqual(updates2, {
  "char-2": { 2: "20.05", 3: "20.06" },
  "char-3": { 2: "OK", 3: "OK" },
});

// Column boundary clipping (sampleCount = 3, pasting 5 columns starting at index 1)
const widePaste = [["1.1", "1.2", "1.3", "1.4", "1.5"]];
const updatesClippedCols = computePastedSampleUpdates(characteristics, "char-1", 1, 3, widePaste);
assert.deepEqual(
  updatesClippedCols,
  { "char-1": { 1: "1.1", 2: "1.2" } },
  "Must truncate columns exceeding visible sampleCount (3)"
);

// Row boundary clipping (starting at char-3 with 3 rows of data when only char-3 and char-4 exist)
const tallPaste = [["A"], ["B"], ["C"], ["D"]];
const updatesClippedRows = computePastedSampleUpdates(characteristics, "char-3", 0, 5, tallPaste);
assert.deepEqual(
  updatesClippedRows,
  { "char-3": { 0: "A" }, "char-4": { 0: "B" } },
  "Must truncate rows exceeding available characteristics list"
);

// Invalid start ID or empty inputs
assert.deepEqual(computePastedSampleUpdates(characteristics, "non-existent", 0, 5, paste2D), {});
assert.deepEqual(computePastedSampleUpdates([], "char-1", 0, 5, paste2D), {});
assert.deepEqual(computePastedSampleUpdates(characteristics, "char-1", 0, 5, []), {});

// ---------------------------------------------------------------------------
// 3. computeAutoFillSampleUpdates verification
// ---------------------------------------------------------------------------
// A. mode = "nominal": fills dimensions with nominal, visual/notes with "OK"
const autoNominal = computeAutoFillSampleUpdates(characteristics, 3, null, "nominal");
assert.deepEqual(autoNominal, {
  "char-1": { 0: "10.00", 1: "10.00", 2: "10.00" },
  "char-2": { 0: "20.00", 1: "20.00", 2: "20.00" },
  "char-3": { 0: "OK", 1: "OK", 2: "OK" },
  "char-4": { 0: "40.00", 1: "40.00", 2: "40.00" },
});

// B. mode = "visuals-ok": only fills note/visual characteristics
const autoVisuals = computeAutoFillSampleUpdates(characteristics, 3, null, "visuals-ok");
assert.deepEqual(autoVisuals, {
  "char-3": { 0: "OK", 1: "OK", 2: "OK" },
});

// C. Target single characteristic
const singleCharAuto = computeAutoFillSampleUpdates(characteristics, 2, "char-1", "nominal");
assert.deepEqual(singleCharAuto, {
  "char-1": { 0: "10.00", 1: "10.00" },
});

// D. Non-overwrite preservation: does not overwrite existing measurements
const withExisting = [
  { id: "char-1", type: "dimension", nominal: "10.00", samples: { 0: "10.05" } },
  { id: "char-2", type: "visual", nominal: "BURR FREE", samples: { 1: "NG" } },
];
const nonOverwrite = computeAutoFillSampleUpdates(withExisting, 2, null, "nominal", false);
assert.deepEqual(
  nonOverwrite,
  {
    "char-1": { 1: "10.00" }, // slot 0 preserved
    "char-2": { 0: "OK" },    // slot 1 preserved
  },
  "Auto-fill must not overwrite existing recorded measurements by default"
);

// E. Overwrite flag
const overwrite = computeAutoFillSampleUpdates(withExisting, 2, null, "nominal", true);
assert.deepEqual(overwrite, {
  "char-1": { 0: "10.00", 1: "10.00" },
  "char-2": { 0: "OK", 1: "OK" },
});

// ---------------------------------------------------------------------------
// 4. State updates and Inspection Status Transitions
// ---------------------------------------------------------------------------
// Initially with empty samples, status is OPEN
assert.equal(overallStatus(characteristics, 3), "OPEN");

// Apply auto-filled nominal updates across all characteristics
let updatedState = characteristics.map((item) => {
  const patch = autoNominal[item.id] || {};
  return { ...item, samples: { ...item.samples, ...patch } };
});

// All nominals and OKs match limits -> overall status transitions to PASS!
assert.equal(getStatus(updatedState[0], 3), "OK");
assert.equal(getStatus(updatedState[1], 3), "OK");
assert.equal(getStatus(updatedState[2], 3), "OK");
assert.equal(getStatus(updatedState[3], 3), "OK");
assert.equal(overallStatus(updatedState, 3), "PASS");

// Paste an out-of-spec measurement into char-1 sample #2 (nominal 10.00 ±0.1, paste 10.5)
const ngPaste = [["10.50"]];
const ngUpdates = computePastedSampleUpdates(updatedState, "char-1", 1, 3, ngPaste);
updatedState = updatedState.map((item) => {
  const patch = ngUpdates[item.id] || {};
  return { ...item, samples: { ...item.samples, ...patch } };
});

assert.equal(getStatus(updatedState[0], 3), "NG", "10.50 exceeds USL 10.10 -> status is NG");
assert.equal(overallStatus(updatedState, 3), "FAIL", "Overall status must reflect FAIL when any characteristic is NG");

console.log("PASS: 100% batch sample auto-fill & clipboard pasting checks passed successfully!");
