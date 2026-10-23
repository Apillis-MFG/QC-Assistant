import assert from "node:assert/strict";
import {
  parseDimension,
  buildDrawingSnapshot,
  convertLinearValue,
  convertToleranceString,
  isDualDimensionConsistent,
} from "../src/lib/utils.js";
import { getAutoBalloonLabel } from "../src/lib/autoBalloon.js";
import { getDefaultUnit, normalizeUnitSystem } from "../src/lib/constants.js";
import { getLimits, getDualLimits, getStatus } from "../src/lib/exporters.js";

for (const [text, nominal, tolerance] of [
  [".125 ±.005", "0.125", "±0.005"],
  ["R.125", "0.125", ""],
  ["Ø.125", "0.125", ""],
  ["∅.125", "0.125", ""],
  ["4X Ø.1250 +.005/-.002", "0.1250", "+0.005/-0.002"],
  ["2X R.125 +/-.0050", "0.125", "±0.0050"],
  ["2X .125", "0.125", ""],
  ["-.125 ±.005", "-0.125", "±0.005"],
  ["25.00 ±0.13", "25.00", "±0.13"],
  ["Ø12.00 +0.05/-0.02", "12.00", "+0.05/-0.02"],
]) {
  const parsed = parseDimension(text);
  assert.deepEqual({ nominal: parsed.nominal, tolerance: parsed.tolerance }, { nominal, tolerance }, text);
}

for (const text of [".125", "R.125", "Ø.125", "∅.125", ".125 ±.005", "-.125"])
  assert.equal(getAutoBalloonLabel(text), text);
assert.equal(parseDimension("NOTE 1"), null);
assert.equal(getDefaultUnit("inch"), "IN");
assert.equal(getDefaultUnit("metric"), "MM");
assert.equal(normalizeUnitSystem("invalid"), "metric");
assert.equal(buildDrawingSnapshot({ metadata: {}, unitSystem: "inch" }).unitSystem, "inch");
assert.equal(buildDrawingSnapshot({ metadata: {} }).unitSystem, "metric");

for (const [nominal, tolerance, limits] of [
  [25, 0.13, { usl: 25.13, lsl: 24.87 }],
  [25, "3 MAX", { usl: 3, lsl: "" }],
  [0, "0.5 MIN", { usl: "", lsl: 0.5 }],
  ["", 0.1, { usl: "", lsl: "" }],
  ["0.125", "±0.005", { usl: 0.13, lsl: 0.12 }],
]) assert.deepEqual(getLimits({ nominal, tolerance }), limits);

const numeric = { type: "dimension", nominal: "0.125", tolerance: "±0.005", samples: { 0: "0.130" } };
assert.equal(getStatus({ ...numeric, unit: "IN" }, 1), "OK");
assert.equal(getStatus({ ...numeric, unit: "MM" }, 1), "OK");
assert.equal(getStatus({ ...numeric, samples: { 0: "0.131" } }, 1), "NG");
assert.equal(getStatus({ ...numeric, samples: {} }, 1), "OPEN");
assert.equal(getStatus({ ...numeric, nominal: "" }, 1), "OPEN");
for (const type of ["note", "visual"]) {
  assert.equal(getStatus({ type, samples: { 0: "OK" } }, 1), "OK");
  assert.equal(getStatus({ type, samples: { 0: "NG" } }, 1), "NG");
  assert.equal(getStatus({ type, samples: {} }, 1), "OPEN");
}

// ---------------------------------------------------------------------------
// Dual Dimension Parsing & Validation Verification
// ---------------------------------------------------------------------------
// 1. Metric primary, Imperial bracketed dual
const dual1 = parseDimension("25.40 ±0.10 [1.000 ±.004]");
assert.equal(dual1.nominal, "25.40");
assert.equal(dual1.tolerance, "±0.10");
assert.equal(dual1.unit, "MM");
assert.ok(dual1.dual, "Dual dimension must be parsed");
assert.equal(dual1.dual.nominal, "1.000");
assert.equal(dual1.dual.tolerance, "±0.004");
assert.equal(dual1.dual.unit, "IN");

// 2. Interleaved brackets: "25.40 [1.000] ±0.10 [±.004]"
const dual2 = parseDimension("25.40 [1.000] ±0.10 [±.004]");
assert.equal(dual2.nominal, "25.40");
assert.equal(dual2.tolerance, "±0.10");
assert.equal(dual2.unit, "MM");
assert.equal(dual2.dual.nominal, "1.000");
assert.equal(dual2.dual.tolerance, "±0.004");
assert.equal(dual2.dual.unit, "IN");

// 3. Imperial primary, Metric bracketed dual
const dual3 = parseDimension("1.000 ±.004 [25.40 ±0.10]");
assert.equal(dual3.nominal, "1.000");
assert.equal(dual3.tolerance, "±0.004");
assert.equal(dual3.unit, "IN");
assert.equal(dual3.dual.nominal, "25.40");
assert.equal(dual3.dual.tolerance, "±0.10");
assert.equal(dual3.dual.unit, "MM");

// 4. Asymmetric dual with diameter prefix
const dual4 = parseDimension("Ø12.00 +0.05/-0.02 [.472 +.002/-.001]");
assert.equal(dual4.nominal, "12.00");
assert.equal(dual4.tolerance, "+0.05/-0.02");
assert.equal(dual4.unit, "MM");
assert.equal(dual4.dual.nominal, "0.472");
assert.equal(dual4.dual.tolerance, "+0.002/-0.001");
assert.equal(dual4.dual.unit, "IN");

// 5. Repeated quantity with MAX suffix
const dual5 = parseDimension("4X 50.8 [2.000] MAX");
assert.equal(dual5.quantity, 4);
assert.equal(dual5.nominal, "50.8");
assert.equal(dual5.tolerance, "MAX");
assert.equal(dual5.unit, "MM");
assert.equal(dual5.dual.nominal, "2.000");
assert.equal(dual5.dual.tolerance, "MAX");
assert.equal(dual5.dual.unit, "IN");

// 6. Unit conversion helpers
assert.equal(convertLinearValue(25.4, "MM", "IN"), 1.0);
assert.equal(convertLinearValue(1.0, "IN", "MM"), 25.4);
assert.equal(convertLinearValue(0.1, "MM", "IN"), 0.0039);
assert.equal(convertToleranceString("±0.10", "MM", "IN"), "±0.0039");
assert.equal(convertToleranceString("MAX", "MM", "IN"), "MAX");

// 7. Consistency validation
const consistentCheck = isDualDimensionConsistent(
  { nominal: "25.40", unit: "MM" },
  { nominal: "1.000", unit: "IN" },
);
assert.equal(consistentCheck.consistent, true, "25.40 mm and 1.000 in must be consistent");

const inconsistentCheck = isDualDimensionConsistent(
  { nominal: "25.40", unit: "MM" },
  { nominal: "2.000", unit: "IN" },
);
assert.equal(inconsistentCheck.consistent, false, "25.40 mm and 2.000 in must be flagged inconsistent");

// 8. getDualLimits
const dualLimits = getDualLimits({
  type: "dimension",
  unit: "MM",
  nominal: "25.40",
  tolerance: "±0.10",
  dual: {
    unit: "IN",
    nominal: "1.000",
    tolerance: "±0.004",
  },
});
assert.deepEqual(dualLimits.primary, { usl: 25.5, lsl: 25.3, unit: "MM" });
assert.deepEqual(dualLimits.dual, { usl: 1.004, lsl: 0.996, unit: "IN" });

console.log("PASS: decimal inch capture, unit defaults, snapshots, and inspection math");
