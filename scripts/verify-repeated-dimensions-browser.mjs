import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { expect } from "playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import XLSX from "xlsx";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const baseUrl = process.env.QCA_BASE_URL || "http://127.0.0.1:5173";
const artifacts = "/tmp/qca-repeated-dimensions";
await mkdir(artifacts, { recursive: true });
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let index = 0; index < 2; index++) {
  const sheet = pdf.addPage([600, 800]);
  sheet.drawText(`Repeated features, page ${index + 1}`, { x: 40, y: 740, size: 18, font });
  sheet.drawText("3X Ø10 +/-0.1", { x: 80, y: 500, size: 12, font });
  for (const x of [120, 300, 480]) sheet.drawCircle({ x, y: 360, size: 30, borderWidth: 1, borderColor: rgb(0, 0, 0), color: rgb(1, 1, 1) });
}
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
await context.route("**/src/lib/supabaseClient.js", (route) => route.fulfill({ contentType: "application/javascript", body: "export const supabaseEnabled = false; export const supabase = null;" }));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(baseUrl);
  await page.locator(".dashboard-shell").waitFor();
  const ids = await page.evaluate(async (bytes) => {
    const store = await import("/src/lib/projectStore.js");
    const projectId = crypto.randomUUID(), drawingId = crypto.randomUUID();
    const row = (balloonNo, samples = {}) => ({ id: crypto.randomUUID(), balloonNo, page: 1, x: 0.7, y: balloonNo === 5 ? 0.4 : 0.7,
      targetX: 0.5, targetY: 0.5, type: "dimension", unit: "MM", nominal: "10", tolerance: "±0.1", method: "DC", notes: "", samples });
    const original = row(5, { 0: "10" });
    await store.saveProject({ id: projectId, name: "Repeated dimensions regression" });
    await store.saveDrawing(projectId, { id: drawingId, name: "Repeated feature fixture", pdfBytes: new Uint8Array(bytes).buffer,
      pdfName: "repeated-fixture.pdf", pageCount: 2, sampleCount: 1, metadata: { drawingNo: "REPEAT-TEST" }, characteristics: [original, row(6)] });
    return { projectId, drawingId, originalId: original.id };
  }, [...await pdf.save()]);
  const read = () => page.evaluate(async (id) => (await import("/src/lib/projectStore.js")).loadDrawing(id), ids.drawingId);
  const rows = async () => (await read()).characteristics;
  const select = (label) => page.locator(`button.balloon[title="Balloon ${label}"]`).click();
  const qty = page.locator('.editor-grid input[name="quantity"]');
  const stage = page.locator(".pdf-stage");
  const place = async (x, y) => {
    const box = await stage.boundingBox();
    await stage.click({ position: { x: box.width * x, y: box.height * y } });
  };
  await page.goto(`${baseUrl}/projects/${ids.projectId}/drawings/${ids.drawingId}`);
  await page.getByRole("button", { name: "Stacked", exact: true }).click();
  await select("5");
  await page.getByLabel("Nominal / Requirement", { exact: true }).fill("3X Ø10 ±0.1");
  await qty.click();
  await expect(qty).toHaveValue("3");
  await expect.poll(async () => (await rows()).find((r) => r.id === ids.originalId).quantity).toBe(3);
  assert.equal((await rows()).length, 2);
  assert.equal((await read()).status, "OPEN");
  // Excel includes every required location even before expansion.
  const suggestedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const suggestedPath = await (await suggestedDownload).path();
  const suggested = XLSX.utils.sheet_to_json(XLSX.read(await readFile(suggestedPath), { type: "buffer" }).Sheets["FAI Report"], { header: 1 });
  assert.deepEqual(suggested.slice(7, 11).map((r) => r[0]), ["5.1", "5.2", "5.3", "6"]);
  assert.equal(suggested[4][6], "OPEN");
  await page.getByRole("button", { name: "Create instances", exact: true }).click();
  await expect.poll(async () => (await rows()).length).toBe(4);
  let group = (await rows()).filter((r) => r.balloonNo === 5);
  assert.deepEqual(group.map((r) => r.occurrenceIndex), [1, 2, 3]);
  assert.equal(group[0].id, ids.originalId);
  assert.deepEqual(group.map((r) => r.samples), [{ 0: "10" }, {}, {}]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.locator(".message").last()).toContainText("Place every required instance");
  await page.reload();
  await select("5.1");
  await page.getByRole("button", { name: "Resume placement", exact: true }).click();
  await place(0.2, 0.55);
  await expect.poll(async () => (await rows()).find((r) => r.occurrenceIndex === 2)?.isPlaced).toBe(true);
  await page.keyboard.press("Escape");
  await page.reload();
  await select("5.1");
  await page.getByRole("button", { name: "Resume placement", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".page-control")).toContainText("Page 2 / 2");
  await place(0.8, 0.55);
  await expect.poll(async () => (await rows()).find((r) => r.occurrenceIndex === 3)?.page).toBe(2);
  await page.getByLabel("Nominal / Requirement", { exact: true }).fill("20");
  await qty.click();
  await expect.poll(async () => (await rows()).filter((r) => r.balloonNo === 5).every((r) => r.nominal === "20")).toBe(true);
  await page.getByLabel("Notes", { exact: true }).fill("third occurrence only");
  await page.locator(".sample-stack input").fill("20.2");
  await expect.poll(async () => (await rows()).find((r) => r.occurrenceIndex === 3)?.notes).toBe("third occurrence only");
  await expect.poll(async () => (await rows()).find((r) => r.occurrenceIndex === 3)?.samples[0]).toBe("20.2");
  await expect.poll(async () => (await read()).status).toBe("FAIL");
  group = (await rows()).filter((r) => r.balloonNo === 5);
  assert.equal(group[0].notes, "");
  assert.equal(group[0].samples[0], "10");
  assert.equal(group[2].notes, "third occurrence only");
  // Reassigning an occupied base swaps complete groups.
  await page.getByLabel("Balloon #", { exact: true }).fill("6");
  await expect.poll(async () => (await rows()).find((r) => r.id === ids.originalId).balloonNo).toBe(6);
  assert.equal((await rows()).filter((r) => r.balloonNo === 6).length, 3);
  assert.equal((await rows()).find((r) => r.id !== ids.originalId && !r.instancesExpanded).balloonNo, 5);
  await page.getByLabel("Balloon #", { exact: true }).fill("105");
  await qty.fill("12");
  await page.getByRole("button", { name: "Update instance count", exact: true }).click();
  await expect.poll(async () => (await rows()).filter((r) => r.balloonNo === 105).length).toBe(12);
  for (let i = 4; i <= 12; i++) await place(0.1 + ((i - 4) % 3) * 0.35, 0.2 + Math.floor((i - 4) / 3) * 0.22);
  await expect.poll(async () => (await rows()).every((r) => r.isPlaced)).toBe(true);
  // Cancelling destructive reduction preserves all rows and IDs.
  const before = await rows();
  await qty.fill("1");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Update instance count", exact: true }).click();
  assert.equal((await rows()).length, 13);
  await qty.fill("12");
  await page.screenshot({ path: `${artifacts}/workspace.png`, fullPage: true });
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const excel = await excelDownload;
  await excel.saveAs(`${artifacts}/report.xlsx`);
  const workbook = XLSX.read(await readFile(await excel.path()), { type: "buffer" });
  const sheet = workbook.Sheets["FAI Report"];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.deepEqual(data.slice(7, 20).map((r) => r[0]), ["5", ...Array.from({ length: 12 }, (_, i) => `105.${i + 1}`)]);
  assert.equal(sheet.A18.t, "s");
  assert.equal(data[4][6], "FAIL");
  assert.deepEqual(data[7].slice(5, 7), [10.1, 9.9]);
  assert.deepEqual(data[10].slice(7, 10), ["20.2", 20.2, 20.2]);
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const result = await pdfDownload;
  await result.saveAs(`${artifacts}/ballooned.pdf`);
  const exported = await getDocument({ data: new Uint8Array(await readFile(await result.path())), standardFontDataUrl: new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).pathname }).promise;
  for (let pageNo = 1; pageNo <= 2; pageNo++) {
    const text = await (await exported.getPage(pageNo)).getTextContent();
    for (const row of before.filter((r) => r.page === pageNo)) {
      const label = row.instancesExpanded ? `${row.balloonNo}.${row.occurrenceIndex}` : String(row.balloonNo);
      const item = text.items.find((t) => t.str === label);
      assert.ok(item, `${label} on page ${pageNo}`);
      assert.ok(Math.abs(item.transform[4] + item.width / 2 - row.x * 600) < 1, label);
      assert.ok(Math.abs(item.transform[5] - (800 - row.y * 800)) < 8, label);
    }
  }
  await exported.destroy();
  const rendered = await page.evaluate(async (bytes) => {
    const lib = await import("/node_modules/pdfjs-dist/build/pdf.mjs");
    lib.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const document = await lib.getDocument({ data: new Uint8Array(bytes) }).promise;
    const images = [];
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const sheet = await document.getPage(pageNo);
      const viewport = sheet.getViewport({ scale: 1.5 });
      const canvas = window.document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await sheet.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      images.push(canvas.toDataURL("image/png").split(",")[1]);
    }
    await document.destroy();
    return images;
  }, [...await readFile(await result.path())]);
  for (let i = 0; i < rendered.length; i++) await writeFile(`${artifacts}/pdf-page-${i + 1}.png`, Buffer.from(rendered[i], "base64"));
  const workbookView = await context.newPage();
  await workbookView.setContent('<style>body{font:14px Arial}table{border-collapse:collapse}td{padding:7px;border:1px solid #ccc;white-space:nowrap}tr:nth-child(7){font-weight:bold;background:#eee}</style><table></table>');
  await workbookView.evaluate((rows) => {
    const table = document.querySelector("table");
    for (const values of rows) {
      const row = table.insertRow();
      for (const value of values) row.insertCell().textContent = String(value ?? "");
    }
  }, data.slice(0, 20));
  await workbookView.screenshot({ path: `${artifacts}/workbook.png`, fullPage: true });
  await workbookView.close();
  await page.getByRole("button", { name: "Measurement", exact: true }).click();
  await expect(page.locator(".locked-id").filter({ hasText: "105.12" })).toBeVisible();
  await page.screenshot({ path: `${artifacts}/measurement.png`, fullPage: true });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await select("105.12");
  await qty.fill("3");
  await page.getByRole("button", { name: "Update instance count", exact: true }).click();
  await expect.poll(async () => (await rows()).filter((r) => r.balloonNo === 105).length).toBe(3);
  const retained = (await rows()).filter((r) => r.balloonNo === 105);
  assert.deepEqual(retained.map((r) => r.id), before.filter((r) => r.balloonNo === 105).slice(0, 3).map((r) => r.id));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await expect.poll(async () => (await rows()).length).toBe(1);
  assert.equal((await rows())[0].balloonNo, 5);
  await page.getByRole("button", { name: "Add Balloon (B)" }).click();
  await place(0.2, 0.375);
  await expect.poll(async () => (await rows()).at(-1)?.quantity).toBe(3);
  assert.equal((await rows()).at(-1).instancesExpanded, false);
  assert.equal((await rows()).at(-1).nominal, "10");
  assert.equal((await rows()).at(-1).balloonNo, 6);
  const captures = await page.evaluate(async () => {
    const { getEmbeddedAutoBalloonCandidates } = await import("/src/lib/autoBalloon.js");
    return getEmbeddedAutoBalloonCandidates({ textItems: [{ text: "3X Ø10 ±0.1", left: 80, top: 290, width: 120, height: 12 }], canvasSize: { width: 600, height: 800 }, selectionRect: { x: 0, y: 0, width: 1, height: 1 } });
  });
  assert.equal(captures[0].label, "3X Ø10 ±0.1");
  assert.deepEqual(errors, []);
  console.log(`PASS: browser expansion, shared/independent edits, interrupted placement/reload, group swaps/deletion, count safety, Excel and multi-page PDF. Artifacts: ${artifacts}`);
} finally {
  await browser.close();
}
