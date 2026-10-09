import assert from "node:assert/strict";
import { parseDimension, buildDrawingSnapshot } from "../src/lib/utils.js";
import { getAutoBalloonLabel } from "../src/lib/autoBalloon.js";
import { getDefaultUnit, normalizeUnitSystem } from "../src/lib/constants.js";
import { getLimits, getStatus } from "../src/lib/exporters.js";

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
console.log("PASS: decimal inch capture, unit defaults, snapshots, and inspection math");
