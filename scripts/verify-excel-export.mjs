import assert from "node:assert/strict";
import {
  buildInspectionWorkbook,
  buildAs9102Form1,
  buildAs9102Form2,
} from "../src/lib/exporters.js";

console.log("Starting verification of Excel FAI export structure and compliance...");

const sampleMetadata = {
  drawingNo: "DWG-10023",
  revision: "B",
  supplier: "Acme Precision Mfg",
  description: "Housing Bracket",
};

const sampleCharacteristics = [
  {
    id: "char-1",
    balloonNo: 2,
    type: "dimension",
    unit: "MM",
    nominal: "25.00",
    tolerance: "±0.10",
    method: "DC",
    samples: { 0: "25.05", 1: "25.02", 2: "24.98" },
    notes: "Critical bore",
  },
  {
    id: "char-2",
    balloonNo: 1,
    type: "dimension",
    unit: "MM",
    nominal: "10.00",
    tolerance: "MAX",
    method: "MIC",
    samples: { 0: "9.80", 1: "9.85", 2: "9.90" },
    notes: "Outer step",
  },
  {
    id: "char-3",
    balloonNo: 10,
    type: "visual",
    unit: "",
    nominal: "Burr free",
    tolerance: "",
    method: "VS",
    samples: { 0: "OK", 1: "OK", 2: "OK" },
    notes: "Deburr 100%",
  },
  {
    id: "char-4",
    groupId: "group-5",
    balloonNo: 5,
    quantity: 2,
    instancesExpanded: true,
    occurrenceIndex: 1,
    type: "dimension",
    unit: "MM",
    nominal: "4.00",
    tolerance: "±0.05",
    method: "PG",
    samples: { 0: "4.01", 1: "4.02", 2: "4.00" },
    notes: "Pin hole 1",
  },
  {
    id: "char-5",
    groupId: "group-5",
    balloonNo: 5,
    quantity: 2,
    instancesExpanded: true,
    occurrenceIndex: 2,
    type: "dimension",
    unit: "MM",
    nominal: "4.00",
    tolerance: "±0.05",
    method: "PG",
    samples: { 0: "4.02", 1: "4.01", 2: "4.03" },
    notes: "Pin hole 2",
  },
];

const sampleCount = 3;
const { workbook, worksheet, rows } = buildInspectionWorkbook({
  metadata: sampleMetadata,
  characteristics: sampleCharacteristics,
  sampleCount,
});

// 1. Workbook and Sheet exists
assert.ok(workbook.SheetNames.includes("FAI Report"), "Sheet 'FAI Report' must exist");
assert.ok(worksheet, "Worksheet object must be created");

// 2. Header Structure
assert.equal(rows[0][0], "FIRST ARTICLE INSPECTION REPORT", "Title row must be present");
assert.equal(rows[2][0], "Part / Drawing No.:");
assert.equal(rows[2][1], "DWG-10023");
assert.equal(rows[2][4], "Part Description:");
assert.equal(rows[2][5], "Housing Bracket");

assert.equal(rows[3][0], "Revision:");
assert.equal(rows[3][1], "B");
assert.equal(rows[3][4], "Supplier:");
assert.equal(rows[3][5], "Acme Precision Mfg");

assert.equal(rows[4][0], "Sample Size:");
assert.equal(rows[4][1], 3);
assert.equal(rows[4][4], "Overall Result:");
assert.equal(rows[4][5], "PASS", "All samples are passing, overall result should be PASS");

// 3. Characteristic Table Header (Row 6)
const tableHeader = rows[6];
assert.deepEqual(tableHeader.slice(0, 7), [
  "ID #", "Type", "Unit", "Nominal", "Tolerance", "USL", "LSL"
]);
assert.deepEqual(tableHeader.slice(7, 7 + sampleCount), ["#1", "#2", "#3"], "Sample columns must be labeled #1 through #N");
assert.deepEqual(tableHeader.slice(7 + sampleCount), [
  "MIN", "MAX", "Method", "Status", "Notes"
]);

// 4. Characteristic Row Sorting (Row 7+)
// Expected order: balloon 1, balloon 2, balloon 5.1, balloon 5.2, balloon 10
const charRows = rows.slice(7, 7 + 5);
const ids = charRows.map((r) => r[0]);
assert.deepEqual(ids, ["1", "2", "5.1", "5.2", "10"], "Characteristic rows must be sorted by balloon number and occurrence index");

// Check Balloon 1 (nominal 10, MAX)
const balloon1 = charRows[0];
assert.equal(balloon1[0], "1");
assert.equal(balloon1[1], "dimension");
assert.equal(balloon1[3], "10.00");
assert.equal(balloon1[4], "MAX");
assert.equal(balloon1[5], 10, "USL should be 10");
assert.equal(balloon1[6], "", "LSL should be empty");
assert.equal(balloon1[7], "9.80"); // sample 1
assert.equal(balloon1[8], "9.85"); // sample 2
assert.equal(balloon1[9], "9.90"); // sample 3
assert.equal(balloon1[10], 9.8);   // MIN
assert.equal(balloon1[11], 9.9);   // MAX
assert.equal(balloon1[12], "MIC"); // Method
assert.equal(balloon1[13], "OK");  // Status
assert.equal(balloon1[14], "Outer step"); // Notes

// Check Balloon 2 (nominal 25.00, ±0.10)
const balloon2 = charRows[1];
assert.equal(balloon2[0], "2");
assert.equal(balloon2[5], 25.1);  // USL
assert.equal(balloon2[6], 24.9);  // LSL
assert.equal(balloon2[10], 24.98); // MIN
assert.equal(balloon2[11], 25.05); // MAX
assert.equal(balloon2[13], "OK");  // Status

// Check Balloon 10 (visual note)
const balloon10 = charRows[4];
assert.equal(balloon10[0], "10");
assert.equal(balloon10[1], "visual");
assert.equal(balloon10[5], "", "USL for visual should be empty");
assert.equal(balloon10[6], "", "LSL for visual should be empty");
assert.equal(balloon10[10], "", "MIN for non-numeric samples should be empty string");
assert.equal(balloon10[11], "", "MAX for non-numeric samples should be empty string");
assert.equal(balloon10[13], "OK");

// 5. Abbreviation legend in footer
const footerRow = rows[rows.length - 1];
assert.equal(footerRow[0], "Measurement Equipments Abbreviation:");
assert.ok(footerRow[1].includes("CMM = Coordinate Measuring Machine"));
assert.ok(footerRow[1].includes("DC = Digital Caliper"));
assert.ok(footerRow[1].includes("VS = Visual Inspection"));

// 6. Cell merges and column widths
assert.ok(Array.isArray(worksheet["!merges"]), "Merges array must be defined");
assert.ok(worksheet["!merges"].length >= 7, "Header and footer merges must be set");
assert.ok(Array.isArray(worksheet["!cols"]), "Cols array must be defined");
assert.equal(worksheet["!cols"].length, 7 + sampleCount + 5, "Cols array must match total column count");

// 7. Test missing / empty metadata edge case
const emptyMetaExport = buildInspectionWorkbook({
  metadata: null,
  characteristics: [],
  sampleCount: 1,
});
assert.equal(emptyMetaExport.rows[2][1], "-", "Missing drawing number defaults to '-'");
assert.equal(emptyMetaExport.rows[4][5], "OPEN", "Empty characteristics result is 'OPEN'");

// 8. Test unexpanded repeated dimensions expansion
const unexpanded = [
  {
    id: "rep-1",
    balloonNo: 3,
    quantity: 3,
    instancesExpanded: false,
    type: "dimension",
    unit: "MM",
    nominal: "15.00",
    tolerance: "±0.10",
    method: "DC",
    samples: { 0: "15.00" },
  },
];
const expandedResult = buildInspectionWorkbook({
  metadata: {},
  characteristics: unexpanded,
  sampleCount: 1,
});
const expandedCharRows = expandedResult.rows.slice(7, 7 + 3);
assert.deepEqual(
  expandedCharRows.map((r) => r[0]),
  ["3.1", "3.2", "3.3"],
  "Unexpanded quantity=3 must expand into 3 occurrence rows in export",
);

// 9. AS9102 Rev C Multi-Sheet Workbook Verification
assert.ok(workbook.SheetNames.includes("AS9102 Form 1"), "Workbook must include 'AS9102 Form 1'");
assert.ok(workbook.SheetNames.includes("AS9102 Form 2"), "Workbook must include 'AS9102 Form 2'");
assert.equal(workbook.SheetNames.length, 3, "Multi-sheet workbook must have exactly 3 sheets");

// Verify Form 1 (Part Number Accountability)
const form1Rows = buildInspectionWorkbook({
  metadata: sampleMetadata,
  characteristics: sampleCharacteristics,
  sampleCount,
}).form1Rows;

assert.equal(form1Rows[0][0], "AS9102 REV C - FORM 1: PART NUMBER ACCOUNTABILITY");
assert.equal(form1Rows[2][0], "1. Part Number:");
assert.equal(form1Rows[2][1], "DWG-10023");
assert.equal(form1Rows[2][3], "2. Part Name / Description:");
assert.equal(form1Rows[2][4], "Housing Bracket");
assert.equal(form1Rows[3][3], "4. FAI Report Number:");
assert.equal(form1Rows[3][4], "DWG-10023-FAI-01");
assert.equal(form1Rows[4][1], "B"); // Part Revision
assert.equal(form1Rows[6][4], "Acme Precision Mfg"); // Supplier
assert.equal(form1Rows[16][0], "FAI Overall Disposition:");
assert.equal(form1Rows[16][1], "PASS");
assert.equal(form1Rows[17][3], "Customer Conformance Status:");
assert.equal(form1Rows[17][4], "ACCEPTED");

// Verify Form 2 (Product Process Accountability)
const form2Rows = buildInspectionWorkbook({
  metadata: sampleMetadata,
  characteristics: sampleCharacteristics,
  sampleCount,
}).form2Rows;

assert.equal(form2Rows[0][0], "AS9102 REV C - FORM 2: PRODUCT PROCESS ACCOUNTABILITY, SPECIAL PROCESSES & FUNCTIONAL TESTING");
assert.equal(form2Rows[2][0], "Part / Drawing No.:");
assert.equal(form2Rows[2][1], "DWG-10023");
assert.equal(form2Rows[5][0], "Item #");
assert.equal(form2Rows[5][1], "Process / Material Name");
assert.equal(form2Rows[5][6], "Compliance Status");
assert.equal(form2Rows[6][1], "Raw Material (Base Alloy / Stock)");
assert.equal(form2Rows[6][6], "CONFORMING");
assert.equal(form2Rows[7][1], "Surface Finish / Coating Treatment");
assert.equal(form2Rows[7][6], "CONFORMING");
assert.equal(form2Rows[9][1], "Dimensional & Characteristic Verification");
assert.equal(form2Rows[9][6], "CONFORMING");

// 10. Standalone builders and options toggle
const standaloneForm1 = buildAs9102Form1({ metadata: sampleMetadata, characteristics: sampleCharacteristics });
assert.ok(standaloneForm1.worksheet, "Standalone buildAs9102Form1 must return worksheet");
assert.ok(Array.isArray(standaloneForm1.worksheet["!merges"]), "Form 1 merges must be present");

const standaloneForm2 = buildAs9102Form2({ metadata: sampleMetadata, characteristics: sampleCharacteristics });
assert.ok(standaloneForm2.worksheet, "Standalone buildAs9102Form2 must return worksheet");
assert.ok(Array.isArray(standaloneForm2.worksheet["!merges"]), "Form 2 merges must be present");

const singleSheetWorkbook = buildInspectionWorkbook({
  metadata: sampleMetadata,
  characteristics: sampleCharacteristics,
  options: { includeAs9102Forms: false },
});
assert.equal(singleSheetWorkbook.workbook.SheetNames.length, 1);
assert.equal(singleSheetWorkbook.workbook.SheetNames[0], "FAI Report");

console.log("PASS: 100% Excel FAI export compliance checks passed successfully!");
