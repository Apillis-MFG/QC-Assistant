import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  isValidCellAddress,
  isValidColumnLetter,
  normalizeFaiTemplate,
  inspectTemplateWorkbook,
  validateTemplateConfig,
  fillCustomTemplateWorkbook,
  clearMappedTableCells,
} from "../src/lib/faiTemplate.js";

console.log("Starting verification of uploaded Excel FAI template engine and persistence (Issue #27 / Phase 1)...");

// --- 1. Address & Column Validation ---
assert.equal(isValidCellAddress("A1"), true);
assert.equal(isValidCellAddress("B5"), true);
assert.equal(isValidCellAddress("Z100"), true);
assert.equal(isValidCellAddress("AA25"), true);
assert.equal(isValidCellAddress(""), false);
assert.equal(isValidCellAddress("A0"), false);
assert.equal(isValidCellAddress("1A"), false);
assert.equal(isValidCellAddress("A-1"), false);
assert.equal(isValidCellAddress("B 5"), false);
assert.equal(isValidCellAddress(null), false);

assert.equal(isValidColumnLetter("A"), true);
assert.equal(isValidColumnLetter("Z"), true);
assert.equal(isValidColumnLetter("AA"), true);
assert.equal(isValidColumnLetter("XFD"), true);
assert.equal(isValidColumnLetter(""), false);
assert.equal(isValidColumnLetter("1"), false);
assert.equal(isValidColumnLetter("A1"), false);
assert.equal(isValidColumnLetter(null), false);

// --- 2. Synthetic Customer Template Construction ---
const wb = XLSX.utils.book_new();
const wsData = [
  ["CUSTOMER FIRST ARTICLE INSPECTION REPORT"],
  ["", "Drawing No:", "PART-12345", "Rev:", "C", "Sample Size:", "3"],
  ["", "Supplier:", "Apillis Mfg", "Description:", "Bracket Housing", "Overall:", "PASS"],
  [],
  ["BALLOON", "TYPE", "NOMINAL", "TOLERANCE", "USL", "LSL", "SMP 1", "SMP 2", "SMP 3", "MIN", "MAX", "METHOD", "STATUS", "NOTES"],
  // Empty inspection table rows 6 through 15 (10 rows capacity)
  ...Array.from({ length: 10 }, () => Array(14).fill("")),
];

const ws = XLSX.utils.aoa_to_sheet(wsData);
XLSX.utils.book_append_sheet(wb, ws, "Customer FAI Form");
const templateBytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });

// --- 3. inspectTemplateWorkbook ---
const inspection = inspectTemplateWorkbook(templateBytes);
assert.equal(inspection.sheetNames.length, 1);
assert.equal(inspection.sheetNames[0], "Customer FAI Form");
assert.equal(inspection.sheets["Customer FAI Form"].rowCount >= 15, true);

// --- 4. normalizeFaiTemplate ---
assert.equal(normalizeFaiTemplate(null), null);
assert.equal(normalizeFaiTemplate(undefined), null);

const rawTemplate = {
  name: "Vendor_FAI_Template.xlsx",
  bytes: templateBytes,
  worksheet: "Customer FAI Form",
  headers: {
    drawingNo: "c2",
    revision: "e2",
    supplier: "c3",
    description: "e3",
    sampleCount: "g2",
    overallStatus: "g3",
  },
  table: {
    startRow: 6,
    endRow: 15, // capacity = 10 rows
    columns: {
      balloonNo: "a",
      type: "b",
      nominal: "c",
      tolerance: "d",
      usl: "e",
      lsl: "f",
      samples: ["g", "h", "i"],
      min: "j",
      max: "k",
      method: "l",
      status: "m",
      notes: "n",
    },
  },
};

const normalized = normalizeFaiTemplate(rawTemplate);
assert.equal(normalized.name, "Vendor_FAI_Template.xlsx");
assert.equal(normalized.worksheet, "Customer FAI Form");
assert.equal(normalized.headers.drawingNo, "C2");
assert.equal(normalized.headers.revision, "E2");
assert.equal(normalized.table.startRow, 6);
assert.equal(normalized.table.endRow, 15);
assert.equal(normalized.table.columns.balloonNo, "A");
assert.deepEqual(normalized.table.columns.samples, ["G", "H", "I"]);

// --- 5. validateTemplateConfig ---
// 5a. Valid template
const validRes = validateTemplateConfig(normalized, 5, 3);
assert.equal(validRes.valid, true);
assert.equal(validRes.capacity, 10);
assert.equal(validRes.errors.length, 0);

// 5b. Insufficient capacity error
const overflowRes = validateTemplateConfig(normalized, 12, 3);
assert.equal(overflowRes.valid, false);
assert.ok(overflowRes.errors.some((err) => err.includes("insufficient for current characteristics")));

// 5c. Missing required balloonNo or status column
const missingBalloon = normalizeFaiTemplate({
  ...rawTemplate,
  table: { ...rawTemplate.table, columns: { ...rawTemplate.table.columns, balloonNo: "" } },
});
const noBalloonRes = validateTemplateConfig(missingBalloon, 3, 3);
assert.equal(noBalloonRes.valid, false);
assert.ok(noBalloonRes.errors.some((err) => err.includes("Balloon Number column mapping is required")));

// 5d. Missing sample column
const missingSampleCol = normalizeFaiTemplate({
  ...rawTemplate,
  table: { ...rawTemplate.table, columns: { ...rawTemplate.table.columns, samples: ["G", "H"] } }, // only 2 for 3 samples
});
const noSampleColRes = validateTemplateConfig(missingSampleCol, 3, 3);
assert.equal(noSampleColRes.valid, false);
assert.ok(noSampleColRes.errors.some((err) => err.includes("Sample #3 column mapping is required")));

// 5e. Column collision (e.g. nominal and usl both mapped to "C")
const colCollision = normalizeFaiTemplate({
  ...rawTemplate,
  table: {
    ...rawTemplate.table,
    columns: { ...rawTemplate.table.columns, nominal: "C", usl: "C" },
  },
});
const colCollisionRes = validateTemplateConfig(colCollision, 3, 3);
assert.equal(colCollisionRes.valid, false);
assert.ok(colCollisionRes.errors.some((err) => err.includes("Duplicate column collision")));

// 5f. Header cell overlap with table rows
const headerOverlap = normalizeFaiTemplate({
  ...rawTemplate,
  headers: { ...rawTemplate.headers, drawingNo: "B8" }, // Row 8 is inside 6..15
});
const headerOverlapRes = validateTemplateConfig(headerOverlap, 3, 3);
assert.equal(headerOverlapRes.valid, false);
assert.ok(headerOverlapRes.errors.some((err) => err.includes("overlaps with table inspection rows")));

// 5g. Duplicate header cell target
const dupHeader = normalizeFaiTemplate({
  ...rawTemplate,
  headers: { ...rawTemplate.headers, drawingNo: "C2", revision: "C2" },
});
const dupHeaderRes = validateTemplateConfig(dupHeader, 3, 3);
assert.equal(dupHeaderRes.valid, false);
assert.ok(dupHeaderRes.errors.some((err) => err.includes("Duplicate header target")));

// --- 6. fillCustomTemplateWorkbook ---
const testMetadata = {
  drawingNo: "DWG-9988",
  revision: "D",
  supplier: "Aerospace Precision",
  description: "Machined Flange",
};

const testCharacteristics = [
  {
    id: "char-1",
    balloonNo: 1,
    type: "dimension",
    nominal: "25.00",
    tolerance: "±0.10",
    unit: "MM",
    method: "DC",
    samples: ["25.02", "25.05", "24.98"],
    notes: "Bore diameter",
  },
  {
    id: "char-2",
    balloonNo: 2,
    type: "dimension",
    nominal: "10.00",
    tolerance: "+0.05/-0.00",
    unit: "MM",
    method: "MIC",
    samples: ["10.02", "10.08", "10.01"], // 10.08 is out of limits -> NG
    notes: "Flange thickness",
  },
  {
    id: "char-3",
    balloonNo: 3,
    type: "visual",
    nominal: "Deburred",
    tolerance: "",
    unit: "",
    method: "VS",
    samples: ["OK", "OK", "OK"],
    notes: "No burrs",
  },
];

const filled = fillCustomTemplateWorkbook({
  template: normalized,
  metadata: testMetadata,
  characteristics: testCharacteristics,
  sampleCount: 3,
});

assert.ok(filled.workbook);
assert.equal(filled.rowCount, 3);
assert.equal(filled.capacity, 10);

const filledSheet = filled.workbook.Sheets["Customer FAI Form"];
// Check headers
assert.equal(filledSheet["C2"]?.v, "DWG-9988");
assert.equal(filledSheet["E2"]?.v, "D");
assert.equal(filledSheet["C3"]?.v, "Aerospace Precision");
assert.equal(filledSheet["E3"]?.v, "Machined Flange");
assert.equal(filledSheet["G2"]?.v, 3);
assert.equal(filledSheet["G3"]?.v, "FAIL"); // char-2 has sample 10.08 (out of limits)

// Check row 6 (Balloon 1)
assert.equal(filledSheet["A6"]?.v, "1");
assert.equal(filledSheet["C6"]?.v, "25.00");
assert.equal(filledSheet["D6"]?.v, "±0.10");
assert.equal(filledSheet["E6"]?.v, 25.1);
assert.equal(filledSheet["F6"]?.v, 24.9);
assert.equal(filledSheet["G6"]?.v, 25.02);
assert.equal(filledSheet["H6"]?.v, 25.05);
assert.equal(filledSheet["I6"]?.v, 24.98);
assert.equal(filledSheet["J6"]?.v, 24.98); // Min
assert.equal(filledSheet["K6"]?.v, 25.05); // Max
assert.equal(filledSheet["L6"]?.v, "DC");
assert.equal(filledSheet["M6"]?.v, "OK");

// Check row 7 (Balloon 2)
assert.equal(filledSheet["A7"]?.v, "2");
assert.equal(filledSheet["G7"]?.v, 10.02);
assert.equal(filledSheet["H7"]?.v, 10.08);
assert.equal(filledSheet["I7"]?.v, 10.01);
assert.equal(filledSheet["M7"]?.v, "NG");

// Check row 8 (Balloon 3 - Visual)
assert.equal(filledSheet["A8"]?.v, "3");
assert.equal(filledSheet["B8"]?.v, "visual");
assert.equal(filledSheet["G8"]?.v, "OK");
assert.equal(filledSheet["M8"]?.v, "OK");

// Check unwritten rows 9..15 remain undefined/empty
for (let r = 9; r <= 15; r++) {
  assert.equal(filledSheet[`A${r}`], undefined);
  assert.equal(filledSheet[`G${r}`], undefined);
  assert.equal(filledSheet[`M${r}`], undefined);
}

// Check original template bytes were not mutated
const originalWb = XLSX.read(templateBytes, { type: "array" });
const originalSheet = originalWb.Sheets["Customer FAI Form"];
assert.equal(originalSheet["C2"]?.v, "PART-12345"); // Original value intact
assert.equal(originalSheet["A6"]?.v || "", ""); // Empty in original

console.log("PASS: 100% uploaded Excel FAI template engine and persistence checks passed successfully!");
