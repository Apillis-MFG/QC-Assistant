import assert from "node:assert/strict";
import { parseNumber, getLimits, getStatus, overallStatus } from "../src/lib/exporters.js";

console.log("Starting verification of inspection math and status evaluation...");

// ---------------------------------------------------------------------------
// 1. parseNumber verification
// ---------------------------------------------------------------------------
assert.equal(parseNumber(null), null);
assert.equal(parseNumber(undefined), null);
assert.equal(parseNumber(""), null);
assert.equal(parseNumber("   "), null);
assert.equal(parseNumber("abc"), null);
assert.equal(parseNumber(0), 0);
assert.equal(parseNumber("0"), 0);
assert.equal(parseNumber(25.4), 25.4);
assert.equal(parseNumber("25.4"), 25.4);
assert.equal(parseNumber("25,4"), 25.4);
assert.equal(parseNumber(".125"), 0.125);
assert.equal(parseNumber("-.125"), -0.125);
assert.equal(parseNumber("+0.05"), 0.05);
assert.equal(parseNumber("-0.05"), -0.05);
assert.equal(parseNumber("25 MAX"), 25);
assert.equal(parseNumber("0.5 MIN"), 0.5);

// ---------------------------------------------------------------------------
// 2. getLimits: Bilateral symmetric
// ---------------------------------------------------------------------------
for (const [nominal, tolerance, limits] of [
  [25, 0.13, { usl: 25.13, lsl: 24.87 }],
  ["25.00", "±0.13", { usl: 25.13, lsl: 24.87 }],
  ["25.00", "+/-0.13", { usl: 25.13, lsl: 24.87 }],
  ["25.00", "+/- 0.13", { usl: 25.13, lsl: 24.87 }],
  ["0.125", "±0.005", { usl: 0.13, lsl: 0.12 }],
  ["0.12500", "±0.00025", { usl: 0.12525, lsl: 0.12475 }], // 5-decimal precision
  [-10, 0.5, { usl: -9.5, lsl: -10.5 }],
  [0, 0.1, { usl: 0.1, lsl: -0.1 }],
]) {
  assert.deepEqual(getLimits({ nominal, tolerance }), limits, `Bilateral: ${nominal} ${tolerance}`);
}

// ---------------------------------------------------------------------------
// 3. getLimits: Asymmetric bilateral (dual offsets)
// ---------------------------------------------------------------------------
for (const [nominal, tolerance, limits] of [
  ["12.00", "+0.05/-0.02", { usl: 12.05, lsl: 11.98 }],
  ["12.00", "+0.05 / -0.02", { usl: 12.05, lsl: 11.98 }],
  ["12.00", "+0.05 -0.02", { usl: 12.05, lsl: 11.98 }],
  ["12.00", "-0.02/+0.05", { usl: 12.05, lsl: 11.98 }],
  ["12.00", "+0.05/-0", { usl: 12.05, lsl: 12 }],
  ["12.00", "+0.05/0", { usl: 12.05, lsl: 12 }],
  ["12.00", "+0/-0.05", { usl: 12, lsl: 11.95 }],
  ["12.00", "0/-0.05", { usl: 12, lsl: 11.95 }],
  ["50.00", "+0.05/+0.01", { usl: 50.05, lsl: 50.01 }], // both positive offsets
  ["50.00", "-0.01/-0.05", { usl: 49.99, lsl: 49.95 }], // both negative offsets
]) {
  assert.deepEqual(getLimits({ nominal, tolerance }), limits, `Asymmetric: ${nominal} ${tolerance}`);
}

// ---------------------------------------------------------------------------
// 4. getLimits: Unilateral single signed offsets
// ---------------------------------------------------------------------------
for (const [nominal, tolerance, limits] of [
  ["10.00", "+0.05", { usl: 10.05, lsl: 10 }],
  ["10.00", "-0.05", { usl: 10, lsl: 9.95 }],
]) {
  assert.deepEqual(getLimits({ nominal, tolerance }), limits, `Unilateral: ${nominal} ${tolerance}`);
}

// ---------------------------------------------------------------------------
// 5. getLimits: Single limit MAX & MIN
// ---------------------------------------------------------------------------
for (const [nominal, tolerance, limits] of [
  // Tolerance specifies number with MAX/MIN
  [25, "3 MAX", { usl: 3, lsl: "" }],
  [0, "0.5 MIN", { usl: "", lsl: 0.5 }],
  ["", "3 MAX", { usl: 3, lsl: "" }],
  ["", "0.5 MIN", { usl: "", lsl: 0.5 }],
  // Nominal specifies dimension, tolerance is pure "MAX" or "MIN"
  ["25", "MAX", { usl: 25, lsl: "" }],
  ["0.5", "MIN", { usl: "", lsl: 0.5 }],
  // Suffix in nominal field
  ["25 MAX", "", { usl: 25, lsl: "" }],
  ["0.5 MIN", "", { usl: "", lsl: 0.5 }],
  ["R0.5 MAX", "", { usl: 0.5, lsl: "" }],
]) {
  assert.deepEqual(getLimits({ nominal, tolerance }), limits, `Single limit: ${nominal} ${tolerance}`);
}

// ---------------------------------------------------------------------------
// 6. getLimits: Null, missing, note, and non-numeric
// ---------------------------------------------------------------------------
assert.deepEqual(getLimits(null), { usl: "", lsl: "" });
assert.deepEqual(getLimits({}), { usl: "", lsl: "" });
assert.deepEqual(getLimits({ nominal: "", tolerance: "0.1" }), { usl: "", lsl: "" });
assert.deepEqual(getLimits({ nominal: "25", tolerance: "" }), { usl: "", lsl: "" });
assert.deepEqual(getLimits({ nominal: "ABC", tolerance: "±0.1" }), { usl: "", lsl: "" });
assert.deepEqual(getLimits({ type: "note", nominal: "NOTE 1", tolerance: "0.1" }), { usl: "", lsl: "" });
assert.deepEqual(getLimits({ type: "visual", nominal: "BURR FREE", tolerance: "0.1" }), { usl: "", lsl: "" });

// ---------------------------------------------------------------------------
// 7. getStatus: Numeric evaluation
// ---------------------------------------------------------------------------
const baseChar = { type: "dimension", nominal: "25.00", tolerance: "±0.10" };

// Empty samples -> OPEN
assert.equal(getStatus(baseChar, 1), "OPEN");
assert.equal(getStatus({ ...baseChar, samples: {} }, 1), "OPEN");
assert.equal(getStatus({ ...baseChar, samples: { 0: "" } }, 1), "OPEN");

// SampleCount <= 0 -> OPEN
assert.equal(getStatus(baseChar, 0), "OPEN");
assert.equal(getStatus(baseChar, -1), "OPEN");

// Exact bounds -> OK
assert.equal(getStatus({ ...baseChar, samples: { 0: "25.10" } }, 1), "OK");
assert.equal(getStatus({ ...baseChar, samples: { 0: "24.90" } }, 1), "OK");
assert.equal(getStatus({ ...baseChar, samples: { 0: "25.00" } }, 1), "OK");

// Outside bounds -> NG
assert.equal(getStatus({ ...baseChar, samples: { 0: "25.101" } }, 1), "NG");
assert.equal(getStatus({ ...baseChar, samples: { 0: "24.899" } }, 1), "NG");

// Invalid text sample for numeric characteristic -> NG
assert.equal(getStatus({ ...baseChar, samples: { 0: "BAD_DATA" } }, 1), "NG");

// Multi-sample: partial entered -> OPEN if in-spec, NG immediately if out-of-spec
assert.equal(getStatus({ ...baseChar, samples: { 0: "25.00" } }, 3), "OPEN");
assert.equal(getStatus({ ...baseChar, samples: { 0: "25.00", 1: "25.05" } }, 3), "OPEN");
assert.equal(getStatus({ ...baseChar, samples: { 0: "25.00", 1: "25.05", 2: "24.95" } }, 3), "OK");
assert.equal(getStatus({ ...baseChar, samples: { 0: "25.00", 1: "25.50" } }, 3), "NG"); // fails early on NG

// Single limit MAX evaluation
const maxChar = { type: "dimension", nominal: "3", tolerance: "MAX" };
assert.equal(getStatus({ ...maxChar, samples: { 0: "2.99" } }, 1), "OK");
assert.equal(getStatus({ ...maxChar, samples: { 0: "3.00" } }, 1), "OK");
assert.equal(getStatus({ ...maxChar, samples: { 0: "3.01" } }, 1), "NG");

// Single limit MIN evaluation
const minChar = { type: "dimension", nominal: "0.5", tolerance: "MIN" };
assert.equal(getStatus({ ...minChar, samples: { 0: "0.50" } }, 1), "OK");
assert.equal(getStatus({ ...minChar, samples: { 0: "1.00" } }, 1), "OK");
assert.equal(getStatus({ ...minChar, samples: { 0: "0.49" } }, 1), "NG");

// ---------------------------------------------------------------------------
// 8. getStatus: Note and Visual evaluation
// ---------------------------------------------------------------------------
for (const type of ["note", "visual"]) {
  const noteChar = { type, nominal: "Requirement", tolerance: "" };
  assert.equal(getStatus({ ...noteChar, samples: {} }, 1), "OPEN");
  assert.equal(getStatus({ ...noteChar, samples: { 0: "OK" } }, 1), "OK");
  assert.equal(getStatus({ ...noteChar, samples: { 0: "ok" } }, 1), "OK");
  assert.equal(getStatus({ ...noteChar, samples: { 0: "NG" } }, 1), "NG");
  assert.equal(getStatus({ ...noteChar, samples: { 0: "OTHER" } }, 1), "NG");
  assert.equal(getStatus({ ...noteChar, samples: { 0: "OK" } }, 2), "OPEN");
  assert.equal(getStatus({ ...noteChar, samples: { 0: "OK", 1: "OK" } }, 2), "OK");
  assert.equal(getStatus({ ...noteChar, samples: { 0: "OK", 1: "NG" } }, 2), "NG");
}

// ---------------------------------------------------------------------------
// 9. getStatus: Repeated dimensions / occurrence handling
// ---------------------------------------------------------------------------
assert.equal(getStatus({ ...baseChar, quantity: 3, instancesExpanded: false, samples: { 0: "25.00" } }, 1), "OPEN");
assert.equal(getStatus({ ...baseChar, quantity: 3, instancesExpanded: true, samples: { 0: "25.00" } }, 1), "OK");
assert.equal(getStatus({ ...baseChar, quantity: 3, instancesExpanded: false, samples: { 0: "26.00" } }, 1), "NG");

// ---------------------------------------------------------------------------
// 10. overallStatus: Aggregate status rollup
// ---------------------------------------------------------------------------
assert.equal(overallStatus([], 1), "OPEN");
assert.equal(overallStatus([{ ...baseChar, samples: { 0: "25.00" } }], 1), "PASS");
assert.equal(overallStatus([
  { ...baseChar, samples: { 0: "25.00" } },
  { ...baseChar, samples: { 0: "25.05" } },
], 1), "PASS");
assert.equal(overallStatus([
  { ...baseChar, samples: { 0: "25.00" } },
  { ...baseChar, samples: {} },
], 1), "OPEN");
assert.equal(overallStatus([
  { ...baseChar, samples: { 0: "25.00" } },
  { ...baseChar, samples: { 0: "26.00" } },
], 1), "FAIL");

console.log("PASS: 100% inspection math and status verification checks passed successfully!");

