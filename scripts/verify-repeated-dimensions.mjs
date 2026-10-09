import assert from "node:assert/strict";
import { normalizeOccurrence, balloonLabel, compareOccurrences, resizeOccurrences, reassignOccurrenceBase, missingOccurrences, assertCloudCompatible } from "../src/lib/occurrences.js";
import { parseDimension } from "../src/lib/utils.js";
import { nextBalloonNo, renumber, getAutoBalloonLabel } from "../src/lib/autoBalloon.js";
import { getStatus, overallStatus, exportBalloonedPdf } from "../src/lib/exporters.js";

const original = { id: "old-id", balloonNo: 5, page: 1, x: 0.6, y: 0.4, targetX: 0.5, targetY: 0.4,
  type: "dimension", unit: "MM", nominal: "10", tolerance: "±0.1", method: "DC", samples: { 0: "10" }, notes: "original" };
const legacy = normalizeOccurrence(original);
assert.equal(legacy.groupId, original.id);
assert.equal(legacy.isPlaced, true);
assert.equal(balloonLabel(legacy), "5");
assert.deepEqual(legacy.samples, original.samples);
let rows = resizeOccurrences([legacy], legacy.id, 3);
assert.deepEqual(rows.map(balloonLabel), ["5.1", "5.2", "5.3"]);
assert.equal(rows[0].id, original.id);
assert.deepEqual(rows[0].samples, original.samples);
assert.equal(rows[0].notes, "original");
assert.deepEqual(rows.slice(1).map((item) => [item.samples, item.notes, item.isPlaced]), [[{}, "", false], [{}, "", false]]);
assert.equal(nextBalloonNo(rows), 6);
assert.equal(missingOccurrences(rows), false);
assert.equal(missingOccurrences(rows.slice(0, 2)), true);
assert.equal(overallStatus(rows, 1), "OPEN");
assert.equal(overallStatus([{ ...legacy, quantity: 3 }], 1), "OPEN");
assert.equal(getStatus({ ...legacy, quantity: 3 }, 1), "OPEN");
assert.equal(getStatus({ ...legacy, quantity: 3, samples: { 0: "11" } }, 1), "NG");
const measured = rows.map((item) => ({ ...item, samples: { 0: "10" } }));
assert.equal(overallStatus(measured, 1), "PASS");
assert.equal(getStatus(measured[0], 5), "OPEN");
assert.equal(measured.length * 5, 15);
for (const [nominal, tolerance, sample, expected] of [
  [25, "3 MAX", "3", "OK"], [25, "3 MAX", "3.1", "NG"],
  [0, "0.5 MIN", "0.5", "OK"], [0, "0.5 MIN", "0.49", "NG"], ["", "±0.1", "10", "OPEN"],
]) assert.equal(getStatus({ ...legacy, nominal, tolerance, samples: { 0: sample } }, 1), expected);
for (const type of ["note", "visual"]) {
  assert.equal(getStatus({ ...legacy, type, samples: { 0: "OK" }, quantity: 3 }, 1), "OPEN");
  assert.equal(getStatus({ ...legacy, type, samples: { 0: "NG" }, quantity: 3 }, 1), "NG");
  assert.equal(getStatus({ ...legacy, type, samples: { 0: "OK" } }, 2), "OPEN");
}
assert.equal(overallStatus(measured.slice(0, 2), 1), "OPEN");
assert.equal(overallStatus([{ ...measured[0], samples: { 0: "11" } }, ...rows.slice(1)], 1), "FAIL");
rows = resizeOccurrences(rows, legacy.id, 12);
assert.equal(rows.length, 12);
assert.deepEqual([...rows].reverse().sort(compareOccurrences).slice(8).map(balloonLabel), ["5.9", "5.10", "5.11", "5.12"]);
const ids = rows.slice(0, 3).map((item) => item.id);
rows = resizeOccurrences(rows, legacy.id, 3);
assert.deepEqual(rows.map((item) => item.id), ids);
const single = resizeOccurrences(rows, legacy.id, 1);
assert.equal(single.length, 1);
assert.equal(balloonLabel(single[0]), "5");
assert.deepEqual(single[0].samples, original.samples);
const other = normalizeOccurrence({ ...original, id: "other", balloonNo: 6 });
const swapped = reassignOccurrenceBase([...rows, other], legacy.id, 6);
assert.deepEqual(swapped.map(balloonLabel), ["6.1", "6.2", "6.3", "5"]);
assert.deepEqual(renumber([...rows, other]).map(balloonLabel), ["1.1", "1.2", "1.3", "2"]);
assert.throws(() => resizeOccurrences(rows, legacy.id, 1.5));
assert.throws(() => assertCloudCompatible(rows), /local-only/);
assert.throws(() => assertCloudCompatible([{ ...legacy, quantity: 3 }]), /local-only/);
assert.doesNotThrow(() => assertCloudCompatible([legacy]));
for (const [text, quantity, nominal] of [["2x10.0", 2, "10.0"], ["3X Ø10 ±0.1", 3, "10"], ["4× R25", 4, "25"], ["12X Ø.125 +.005/-.002", 12, "0.125"]]) {
  assert.equal(parseDimension(text).quantity, quantity, text);
  assert.equal(parseDimension(text).nominal, nominal, text);
  assert.equal(getAutoBalloonLabel(text), text);
}
for (const text of ["M10x1.5", "2x10x20", "2.5X Ø10", "0X Ø10", "2X M10x1.5", "3X 10 + 2x5"]) {
  assert.equal(parseDimension(text)?.quantity || 1, 1, text);
}
await assert.rejects(exportBalloonedPdf({ pdfBytes: new Uint8Array(), characteristics: rows }), /Place every required instance/);
await assert.rejects(exportBalloonedPdf({ pdfBytes: new Uint8Array(), characteristics: [{ ...legacy, quantity: 3 }] }), /Place every required instance/);
console.log("PASS: repeated quantity parsing, legacy normalization, instance mutations, identifiers, status and PDF/cloud guards");
