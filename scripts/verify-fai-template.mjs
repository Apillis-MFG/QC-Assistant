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

// --- 7. Hardening: Sheet Existence, Formula Guards, Merges & Dual-Dimensions (P1-8b) ---

// 7a. Missing worksheet rejection
const missingSheetTemplate = normalizeFaiTemplate({
  ...rawTemplate,
  worksheet: "NonExistentSheet",
});
const missingSheetRes = validateTemplateConfig(missingSheetTemplate, 1, 1);
assert.equal(missingSheetRes.valid, false);
assert.ok(missingSheetRes.errors.some((err) => err.includes("Target worksheet 'NonExistentSheet' was not found")));

// 7b. Formula overwrite rejection in header and table
const formulaWb = XLSX.utils.book_new();
const formulaWs = XLSX.utils.aoa_to_sheet([
  ["Title"],
  ["Header", "Val", ""],
  [],
  ["BALLOON", "STATUS"],
  ["", ""],
  ["", ""],
]);
// Add a formula in header C2 and in table cell B5
formulaWs["C2"] = { t: "s", v: "calc", f: "CONCATENATE(A1,B1)" };
formulaWs["B5"] = { t: "s", v: "calc_status", f: "IF(A5>0,\"OK\",\"NG\")" };
XLSX.utils.book_append_sheet(formulaWb, formulaWs, "Formulas");
const formulaBytes = XLSX.write(formulaWb, { type: "array", bookType: "xlsx" });

const formulaTemplate = normalizeFaiTemplate({
  name: "Formulas.xlsx",
  bytes: formulaBytes,
  worksheet: "Formulas",
  headers: { drawingNo: "C2" },
  table: {
    startRow: 5,
    endRow: 6,
    columns: { balloonNo: "A", status: "B" },
  },
});
const formulaRes = validateTemplateConfig(formulaTemplate, 1, 1);
assert.equal(formulaRes.valid, false);
assert.ok(formulaRes.errors.some((err) => err.includes("Header field 'drawingNo' target cell 'C2' contains an existing formula")));
assert.ok(formulaRes.errors.some((err) => err.includes("Mapped table cell 'B5' contains an existing formula")));

// 7c. Merged-cell collision rejection in table inspection rows
const mergeWb = XLSX.utils.book_new();
const mergeWs = XLSX.utils.aoa_to_sheet([
  ["Customer Form"],
  ["", "Header Left", "Header Mid", "Header Right"],
  [],
  ["BALLOON", "TYPE", "STATUS"],
  ["1", "Dim", "OK"],
  ["Merged row block across columns", "", ""], // Row 6
  ["3", "Dim", "OK"],
]);
// Merge row 6 columns A through C: A6:C6 (0-based: c: 0..2, r: 5..5)
mergeWs["!merges"] = [
  { s: { c: 0, r: 5 }, e: { c: 2, r: 5 } }, // A6:C6 table collision
  { s: { c: 1, r: 1 }, e: { c: 3, r: 1 } }, // B2:D2 header merge
];
XLSX.utils.book_append_sheet(mergeWb, mergeWs, "Merges");
const mergeBytes = XLSX.write(mergeWb, { type: "array", bookType: "xlsx" });

const mergeTemplate = normalizeFaiTemplate({
  name: "Merges.xlsx",
  bytes: mergeBytes,
  worksheet: "Merges",
  headers: {
    supplier: "B2", // Top-left of B2:D2 merge -> ALLOWED
    description: "C2", // Interior cell of B2:D2 merge -> REJECTED
  },
  table: {
    startRow: 5,
    endRow: 7, // Includes row 6 which is merged!
    columns: { balloonNo: "A", type: "B", status: "C" },
  },
});
const mergeRes = validateTemplateConfig(mergeTemplate, 2, 1);
assert.equal(mergeRes.valid, false);
assert.ok(mergeRes.errors.some((err) => err.includes("intersects merged range 'A6:C6'")));
assert.ok(mergeRes.errors.some((err) => err.includes("is an interior cell of merged range 'B2:D2'")));

// 7d. Repeated-dimension capacity calculation (unexpanded quantity)
const repeatedChars = [
  { id: "c1", balloonNo: 1, quantity: 4, instancesExpanded: false }, // 4 rows
  { id: "c2", balloonNo: 2, quantity: 1 }, // 1 row
];
const effectiveRowCount = repeatedChars.reduce(
  (sum, item) => sum + ((item.quantity || 1) > 1 && !item.instancesExpanded ? item.quantity : 1),
  0,
);
assert.equal(effectiveRowCount, 5); // 4 + 1 = 5

// Small template with capacity = 3 (rows 6..8)
const smallTemplate = normalizeFaiTemplate({
  ...rawTemplate,
  table: {
    ...rawTemplate.table,
    startRow: 6,
    endRow: 8, // Capacity = 3
  },
});
// Checking with effectiveRowCount (5) should fail capacity validation
const capCheckRes = validateTemplateConfig(smallTemplate, effectiveRowCount, 1);
assert.equal(capCheckRes.valid, false);
assert.ok(capCheckRes.errors.some((err) => err.includes("Template table capacity (3 rows) is insufficient for current characteristics (5)")));

// 7e. Dual dimension note preservation in custom template export
const dualCharTemplate = normalizeFaiTemplate({
  ...rawTemplate,
  table: {
    ...rawTemplate.table,
    startRow: 6,
    endRow: 7,
  },
});
const dualChars = [
  {
    id: "char-dual",
    balloonNo: 1,
    type: "dimension",
    nominal: "25.40",
    tolerance: "±0.25",
    unit: "MM",
    method: "CALIPER",
    samples: ["25.42"],
    notes: "Critical bore",
    dual: {
      nominal: "1.000",
      tolerance: "±0.010",
      unit: "IN",
    },
  },
];
const dualFilled = fillCustomTemplateWorkbook({
  template: dualCharTemplate,
  metadata: { drawingNo: "DWG-DUAL" },
  characteristics: dualChars,
  sampleCount: 1,
});
const dualSheet = dualFilled.workbook.Sheets["Customer FAI Form"];
assert.equal(dualSheet["N6"]?.v, "Critical bore [Dual: 1.000 ±0.010 IN]");

console.log("PASS: 100% uploaded Excel FAI template engine, hardening, and persistence checks passed successfully!");
