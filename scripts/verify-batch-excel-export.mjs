import assert from "node:assert/strict";
import {
  overallProjectStatus,
  sanitizeSheetName,
  buildBatchInspectionWorkbook,
} from "../src/lib/exporters.js";

console.log("Starting verification of multi-drawing FAI report rollup (P1-7)...");

// ---------------------------------------------------------------------------
// 1. sanitizeSheetName verification
// ---------------------------------------------------------------------------
const names = new Set();
assert.equal(sanitizeSheetName("Drawing 1", names), "Drawing 1");
assert.equal(sanitizeSheetName("Drawing 1", names), "Drawing 1 (2)");
assert.equal(sanitizeSheetName("Drawing 1", names), "Drawing 1 (3)");

// Illegal characters: / \ ? * : [ ]
const illegalNames = new Set();
assert.equal(
  sanitizeSheetName("Part [A]/Rev:1*?", illegalNames),
  "Part _A__Rev_1__"
);

// Truncation to 31 chars max
const longNames = new Set();
const longTitle = "Very Long Engineering Drawing Name With Many Words 123456789";
const sanitizedLong = sanitizeSheetName(longTitle, longNames);
assert.ok(sanitizedLong.length <= 31, `Sheet name length must be <= 31, got ${sanitizedLong.length}`);

// ---------------------------------------------------------------------------
// 2. overallProjectStatus verification
// ---------------------------------------------------------------------------
assert.equal(overallProjectStatus([], 3), "OPEN", "Empty drawings list must return OPEN");
assert.equal(overallProjectStatus(null, 3), "OPEN");

const passDrawing1 = {
  id: "d1",
  name: "Shaft",
  characteristics: [
    { type: "dimension", nominal: "10.00", tolerance: "±0.1", samples: { 0: "10.05", 1: "10.02" } },
  ],
};

const passDrawing2 = {
  id: "d2",
  name: "Bushing",
  characteristics: [
    { type: "dimension", nominal: "20.00", tolerance: "±0.1", samples: { 0: "20.01", 1: "20.04" } },
    { type: "visual", nominal: "BURR FREE", samples: { 0: "OK", 1: "OK" } },
  ],
};

const failDrawing = {
  id: "d3",
  name: "Flange",
  characteristics: [
    { type: "dimension", nominal: "50.00", tolerance: "±0.1", samples: { 0: "50.50", 1: "50.02" } }, // 50.50 is NG
  ],
};

const openDrawing = {
  id: "d4",
  name: "Cover",
  characteristics: [
    { type: "dimension", nominal: "15.00", tolerance: "±0.1", samples: {} }, // Incomplete
  ],
};

// All PASS -> Project PASS
assert.equal(
  overallProjectStatus([passDrawing1, passDrawing2], 2),
  "PASS",
  "Project must evaluate to PASS when all drawings PASS"
);

// Any FAIL -> Project FAIL
assert.equal(
  overallProjectStatus([passDrawing1, passDrawing2, failDrawing], 2),
  "FAIL",
  "Project must evaluate to FAIL when any drawing fails"
);

// Incomplete / OPEN -> Project OPEN
assert.equal(
  overallProjectStatus([passDrawing1, passDrawing2, openDrawing], 2),
  "OPEN",
  "Project must evaluate to OPEN when any drawing has incomplete samples"
);

// ---------------------------------------------------------------------------
// 3. buildBatchInspectionWorkbook structure & sheet content
// ---------------------------------------------------------------------------
const project = {
  name: "Turbine Engine Mount Assembly",
  code: "PRJ-9042",
  owner: "Lead QA Engineer",
  estimatedDeliveryDate: "2026-11-15",
  notes: "Full AS9102 Rev C Multi-Part FAI Package",
};

const projectDrawings = [
  {
    id: "draw-1",
    name: "Machined Housing",
    metadata: {
      drawingNo: "DWG-101",
      description: "Cast Housing",
      revision: "C",
      supplier: "Apex Aerospace",
      faiReportNo: "DWG-101-FAI-01",
    },
    characteristics: [
      { id: "c1", balloonNo: 1, type: "dimension", unit: "MM", nominal: "50.00", tolerance: "±0.10", method: "CMM", samples: { 0: "50.05", 1: "50.02" } },
      { id: "c2", balloonNo: 2, type: "visual", nominal: "BURR FREE", tolerance: "", method: "VS", samples: { 0: "OK", 1: "OK" } },
    ],
  },
  {
    id: "draw-2",
    name: "Support Bracket",
    metadata: {
      drawingNo: "DWG-102",
      description: "Mounting Bracket",
      revision: "A",
      supplier: "Apex Aerospace",
      faiReportNo: "DWG-102-FAI-01",
    },
    characteristics: [
      { id: "c3", balloonNo: 1, type: "dimension", unit: "MM", nominal: "12.00", tolerance: "+0.05/-0.02", method: "DC", samples: { 0: "12.02", 1: "12.01" } },
    ],
  },
  {
    id: "draw-3",
    name: "Hardware Bushing",
    metadata: {
      drawingNo: "DWG-103",
      description: "Steel Bushing",
      revision: "B",
      supplier: "Apex Aerospace",
      faiReportNo: "DWG-103-FAI-01",
    },
    characteristics: [], // Empty drawing
  },
];

const { workbook, form1Rows, form2Rows, allCharsRows, projectStatus } = buildBatchInspectionWorkbook({
  project,
  drawings: projectDrawings,
  sampleCount: 2,
});

// Verify project status
assert.equal(projectStatus, "OPEN", "Empty drawing DWG-103 keeps project status OPEN");

// Verify sheet names in workbook
const sheetNames = workbook.SheetNames;
assert.ok(sheetNames.includes("AS9102 Form 1"), "Must include AS9102 Form 1 sheet");
assert.ok(sheetNames.includes("AS9102 Form 2"), "Must include AS9102 Form 2 sheet");
assert.ok(sheetNames.includes("All Characteristics"), "Must include All Characteristics sheet");
assert.ok(sheetNames.includes("Form 3 - DWG-101"), "Must include Form 3 sheet for DWG-101");
assert.ok(sheetNames.includes("Form 3 - DWG-102"), "Must include Form 3 sheet for DWG-102");
assert.ok(sheetNames.includes("Form 3 - DWG-103"), "Must include Form 3 sheet for DWG-103");
assert.equal(sheetNames.length, 6, "Total sheets must be 3 top-level + 3 drawing sheets");

// Verify Form 1 contents
assert.equal(form1Rows[0][0], "AS9102 REV C - FORM 1: PART NUMBER ACCOUNTABILITY (PROJECT ROLLUP)");
assert.equal(form1Rows[2][1], "Turbine Engine Mount Assembly");
assert.equal(form1Rows[2][4], "PRJ-9042");
assert.equal(form1Rows[4][1], 3, "Total drawings count must be 3");

// Verify Sub-Assembly Index Table in Form 1
// Rows after index header: DWG-101, DWG-102, DWG-103
const indexHeaderIdx = form1Rows.findIndex((r) => r[0] === "INDEX OF SUB-ASSEMBLIES & DETAIL PARTS");
assert.ok(indexHeaderIdx > 0, "Index table header must exist in Form 1");

const item1 = form1Rows[indexHeaderIdx + 2];
assert.equal(item1[0], 1);
assert.equal(item1[1], "DWG-101");
assert.equal(item1[2], "Cast Housing");
assert.equal(item1[4], 2, "Char count for DWG-101 must be 2");
assert.equal(item1[5], "PASS", "DWG-101 status must be PASS");

const item2 = form1Rows[indexHeaderIdx + 3];
assert.equal(item2[0], 2);
assert.equal(item2[1], "DWG-102");
assert.equal(item2[4], 1, "Char count for DWG-102 must be 1");
assert.equal(item2[5], "PASS", "DWG-102 status must be PASS");

const item3 = form1Rows[indexHeaderIdx + 4];
assert.equal(item3[0], 3);
assert.equal(item3[1], "DWG-103");
assert.equal(item3[4], 0, "Char count for DWG-103 must be 0");
assert.equal(item3[5], "OPEN", "DWG-103 status must be OPEN");

// Verify All Characteristics Sheet
assert.equal(allCharsRows[0][0], "CONSOLIDATED PROJECT CHARACTERISTICS (ALL DRAWINGS)");
const allHeader = allCharsRows[5];
assert.deepEqual(allHeader.slice(0, 8), [
  "Drawing / Part",
  "ID #",
  "Type",
  "Unit",
  "Nominal",
  "Tolerance",
  "USL",
  "LSL",
]);
// Check row counts: 2 from DWG-101 + 1 from DWG-102 = 3 characteristic rows
const dataRows = allCharsRows.slice(6);
assert.equal(dataRows.length, 3, "All Characteristics must contain exactly 3 rows");
assert.equal(dataRows[0][0], "DWG-101");
assert.equal(dataRows[0][1], "1");
assert.equal(dataRows[1][0], "DWG-101");
assert.equal(dataRows[1][1], "2");
assert.equal(dataRows[2][0], "DWG-102");
assert.equal(dataRows[2][1], "1");

// ---------------------------------------------------------------------------
// 4. Duplicate Drawing Names Disambiguation
// ---------------------------------------------------------------------------
const dupDrawings = [
  { id: "1", name: "Flange", metadata: { drawingNo: "FLANGE" }, characteristics: [] },
  { id: "2", name: "Flange", metadata: { drawingNo: "FLANGE" }, characteristics: [] },
  { id: "3", name: "Flange", metadata: { drawingNo: "FLANGE" }, characteristics: [] },
];

const dupWorkbook = buildBatchInspectionWorkbook({
  project: { name: "Test" },
  drawings: dupDrawings,
}).workbook;

assert.ok(dupWorkbook.SheetNames.includes("Form 3 - FLANGE"));
assert.ok(dupWorkbook.SheetNames.includes("Form 3 - FLANGE (2)"));
assert.ok(dupWorkbook.SheetNames.includes("Form 3 - FLANGE (3)"));

console.log("PASS: 100% multi-drawing FAI report rollup checks passed successfully!");
