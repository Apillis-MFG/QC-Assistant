import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { expect } from "playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import XLSX from "xlsx";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const baseUrl = process.env.QCA_BASE_URL || "http://127.0.0.1:5173";
const pdf = await PDFDocument.create();
const pdfPage = pdf.addPage([600, 800]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
pdfPage.drawText(".125 +/-.005", { x: 100, y: 500, font, size: 12 });
pdfPage.drawText("R.250", { x: 100, y: 400, font, size: 12 });
const pdfBytes = [...await pdf.save()];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
// Isolate local regression checks from configured production services.
await context.route("**/src/lib/supabaseClient.js", (route) => route.fulfill({
  contentType: "application/javascript", body: "export const supabaseEnabled = false; export const supabase = null;",
}));
const page = await context.newPage();
page.on("pageerror", (error) => { throw error; });
const readDrawing = (id) => page.evaluate(async (drawingId) => {
  const store = await import("/src/lib/projectStore.js");
  return store.loadDrawing(drawingId);
}, id);

try {
  await page.goto(baseUrl);
  await page.locator(".dashboard-shell").waitFor();
  const ids = await page.evaluate(async (bytes) => {
    const store = await import("/src/lib/projectStore.js");
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const a = crypto.randomUUID(), b = crypto.randomUUID(), legacy = crypto.randomUUID();
    await store.saveProject({ id: projectId, name: "Unit regression" });
    await store.saveProject({ id: otherProjectId, name: "Second project" });
    const row = (balloonNo, unit, nominal, tolerance = "", type = "dimension", samples = {}) => ({
      id: crypto.randomUUID(), balloonNo, unit, nominal, tolerance, type, samples,
      page: 1, x: 0.8, y: balloonNo / 10, targetX: 0.7, targetY: balloonNo / 10, method: "DC", notes: "",
    });
    const common = { pdfBytes: new Uint8Array(bytes).buffer, pdfName: "unit-drawing.pdf", pageCount: 1,
      sampleCount: 1, metadata: { drawingNo: "UNIT-TEST" },
      toleranceOverrides: { linear: { 3: "±0.005" }, angle: { 0: "±0.5" }, linearUnitSystem: "metric" } };
    await store.saveDrawing(projectId, { ...common, id: a, name: "Drawing A", characteristics: [
      row(1, "MM", "25", "±0.13", "dimension", { 0: "25" }),
      row(2, "IN", "0.125"), row(3, "MM", "0.125"), row(4, "°", "90"),
      row(5, "", "NOTE 1", "", "note", { 0: "OK" }), row(6, "PROFILE", "1 A", "1 MAX", "gdt"),
    ] });
    await store.saveDrawing(projectId, { ...common, id: b, name: "Drawing B", characteristics: [] });
    await store.saveDrawing(otherProjectId, { ...common, id: legacy, name: "Legacy drawing", characteristics: [] });
    const db = await new Promise((resolve) => { const req = indexedDB.open("qca_projects_v1"); req.onsuccess = () => resolve(req.result); });
    await new Promise((resolve) => {
      const tx = db.transaction("drawings", "readwrite"); const s = tx.objectStore("drawings");
      const req = s.get(legacy); req.onsuccess = () => { delete req.result.unitSystem; delete req.result.toleranceOverrides.linearUnitSystem; s.put(req.result); };
      tx.oncomplete = resolve;
    });
    db.close();
    return { projectId, otherProjectId, a, b, legacy };
  }, pdfBytes);
  await page.goto(`${baseUrl}/projects/${ids.projectId}/drawings/${ids.a}`);
  const units = page.getByRole("combobox", { name: "Drawing unit system" });
  await expect(units).toHaveValue("metric");
  await page.locator(".pdf-stage canvas").waitFor();
  const before = (await readDrawing(ids.a)).characteristics;
  await units.selectOption("inch");
  await expect.poll(async () => (await readDrawing(ids.a)).unitSystem).toBe("inch");
  assert.deepEqual((await readDrawing(ids.a)).characteristics, before);
  await page.getByRole("button", { name: "Add Row", exact: true }).click();
  await expect.poll(async () => (await readDrawing(ids.a)).characteristics.at(-1)?.unit).toBe("IN");
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await page.getByRole("button", { name: "Add Balloon (B)" }).click();
  const pendingStage = page.locator(".pdf-stage");
  const pendingBox = await pendingStage.boundingBox();
  await pendingStage.click({ position: { x: pendingBox.width * 0.2, y: pendingBox.height * 0.5 } });
  await expect.poll(async () => (await readDrawing(ids.a)).characteristics.at(-1)?.nominal).toBe("0.250");
  assert.equal((await readDrawing(ids.a)).characteristics.at(-1).tolerance, "");
  await page.getByRole("button", { name: "Stacked", exact: true }).click();

  await page.getByRole("button", { name: "Tolerance table", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tolerance Table" });
  await expect(dialog.getByRole("button", { name: "Confirm linear table for IN" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Apply all rows/ })).toHaveText("Apply all rows (1)");
  await dialog.getByRole("button", { name: "Confirm linear table for IN" }).click();
  await expect(dialog.getByRole("button", { name: /Apply all rows/ })).toHaveText("Apply all rows (3)");
  await dialog.getByRole("button", { name: /Apply all rows/ }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(async () => (await readDrawing(ids.a)).characteristics[1].tolerance).toBe("±0.005");
  const filled = (await readDrawing(ids.a)).characteristics;
  assert.equal(filled[2].tolerance, "");
  assert.equal(filled[3].tolerance, "±0.5");
  assert.deepEqual(filled[0], before[0]);
  assert.deepEqual(filled[4], before[4]);
  assert.deepEqual(filled[5], before[5]);

  await page.getByRole("button", { name: "Measurement", exact: true }).click();
  await expect(units).toBeDisabled();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: "Active drawing" }).selectOption(ids.b);
  await expect(units).toHaveValue("metric");
  await units.selectOption("inch");
  await units.selectOption("metric");
  await page.getByRole("combobox", { name: "Active drawing" }).selectOption(ids.a);
  await expect(units).toHaveValue("inch");
  await page.reload();
  await expect(units).toHaveValue("inch");
  await page.getByRole("button", { name: "Tolerance table", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Confirm linear table for IN" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();

  // Click capture and reviewed auto-balloon creation exercise the same PDF as the user.
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await page.getByRole("button", { name: "Add Balloon (B)" }).click();
  const stage = page.locator(".pdf-stage");
  const stageBox = await stage.boundingBox();
  await stage.click({ position: { x: stageBox.width * 0.2, y: stageBox.height * 0.375 } });
  await expect.poll(async () => (await readDrawing(ids.a)).characteristics.at(-1)?.nominal).toBe("0.125");
  assert.equal((await readDrawing(ids.a)).characteristics.at(-1).unit, "IN");
  await page.getByRole("button", { name: "Review Balloon Candidates (A)" }).click();
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.32);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: /Add .*balloon/ }).click();
  await expect.poll(async () => (await readDrawing(ids.a)).characteristics.at(-1)?.nominal).toBe("0.250");
  assert.equal((await readDrawing(ids.a)).characteristics.at(-1).unit, "IN");
  assert.equal((await readDrawing(ids.a)).characteristics.at(-1).tolerance, "±0.005");

  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const excelPath = await (await excelDownload).path();
  const sheet = XLSX.readFile(excelPath).Sheets["FAI Report"];
  const exportedRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.equal(exportedRows[7][2], "MM");
  assert.equal(exportedRows[8][2], "IN");
  assert.equal(exportedRows[8][3], "0.125");
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await (await pdfDownload).saveAs("/tmp/qca-unit-ballooned.pdf");
  const exportedPdf = await getDocument({
    data: new Uint8Array(await readFile("/tmp/qca-unit-ballooned.pdf")),
    standardFontDataUrl: new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).pathname,
  }).promise;
  const exportedText = await (await exportedPdf.getPage(1)).getTextContent();
  const firstBalloon = exportedText.items.find((item) => item.str === "1");
  assert.ok(Math.abs(firstBalloon.transform[4] - 600 * 0.8) < 5);
  assert.ok(Math.abs(firstBalloon.transform[5] - 800 * 0.9) < 5);
  await exportedPdf.destroy();
  await page.screenshot({ path: "/tmp/qca-unit-workspace.png", fullPage: true });

  await page.getByRole("combobox", { name: "Active project" }).selectOption(ids.otherProjectId);
  await expect(units).toHaveValue("metric");
  await units.selectOption("inch");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.locator(".dashboard-shell").waitFor();
  assert.equal((await readDrawing(ids.legacy)).unitSystem, "inch");
  await page.goto(`${baseUrl}/projects/${ids.projectId}/drawings/${ids.a}`);
  await expect(units).toHaveValue("inch");

  // Simulate denied local writes; failed navigation must retain the active drawing.
  await page.evaluate(() => {
    window.__originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException("Test write denied", "QuotaExceededError"); };
  });
  await units.selectOption("metric");
  await page.getByRole("combobox", { name: "Active drawing" }).selectOption(ids.b);
  await expect(page.locator(".message").last()).toContainText("quota exceeded");
  assert.ok(page.url().endsWith(ids.a));
  await expect(page.getByRole("combobox", { name: "Active drawing" })).toHaveValue(ids.a);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__originalPut; });
  await page.getByRole("button", { name: "Stacked", exact: true }).click();
  await units.selectOption("inch");
  await page.getByRole("button", { name: "Clear Drawing Data", exact: true }).click();
  await expect(units).toHaveValue("inch");
  await page.getByRole("button", { name: "Demo Rows", exact: true }).click();
  await expect.poll(async () => (await readDrawing(ids.a)).characteristics.length).toBe(7);
  assert.deepEqual((await readDrawing(ids.a)).characteristics.map((row) => row.unit), ["", "", "PROFILE", "MM", "MM", "POSITION", "Ø"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(units).toBeVisible();
  await page.screenshot({ path: "/tmp/qca-unit-mobile.png", fullPage: true });
  const unitBounds = await units.boundingBox();
  assert.ok(unitBounds.x >= 0 && unitBounds.x + unitBounds.width <= 390);
  console.log("PASS: local persistence, all creation paths, tolerance safety, legacy data, navigation failures, and exports");
} finally {
  await browser.close();
}
