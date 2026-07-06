#!/usr/bin/env node
// Throwaway Playwright script that drives a running QC Assistant dev server
// and captures screenshots for docs/USER_GUIDE.md. Not a test suite — no
// assertions, just navigation + page.screenshot(). Requires `pnpm dev`
// running at BASE_URL first (or pass QCA_BASE_URL to point elsewhere).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.QCA_BASE_URL || "http://127.0.0.1:5173/";
const OUT_DIR = path.join(__dirname, "..", "docs", "assets", "screenshots");
const SAMPLE_PDF = path.join(__dirname, "..", "docs", "assets", "sample-drawing.pdf");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let shotIndex = 0;
  const shot = async (name) => {
    shotIndex += 1;
    const file = path.join(OUT_DIR, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`captured ${path.basename(file)}`);
  };

  await page.goto(BASE_URL);
  await page.waitForSelector(".dashboard-shell");
  await shot("dashboard-empty");

  // --- New project ---
  await page.getByRole("button", { name: "New Project" }).first().click();
  await page.waitForSelector(".project-dialog");
  await shot("new-project-dialog");
  await page.locator(".project-dialog input").fill("Demo Bracket Project");
  await shot("new-project-dialog-filled");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.waitForSelector(".app-shell");

  // Creating a project opens the workspace directly with no drawing yet.
  await shot("workspace-upload-prompt");

  // --- Back to dashboard, view Project Detail (drawings management) ---
  await page.getByRole("button", { name: "Projects" }).click();
  await page.waitForSelector(".project-card");
  await page.getByRole("button", { name: "Manage" }).click();
  await page.waitForSelector(".project-detail-form");
  await shot("project-detail-empty");

  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  await page.waitForSelector(".project-card:has-text(\"sample-drawing\")", { timeout: 15000 }).catch(() => {});
  await shot("project-detail-with-drawing");

  await page.getByRole("button", { name: "Open" }).click();
  await page.waitForSelector(".app-shell");
  await page.waitForSelector(".pdf-stage canvas", { timeout: 15000 });
  await page.waitForTimeout(500);

  // --- Drawing-only layout, clean PDF view ---
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await shot("workspace-drawing-layout");

  // Back to default Stacked layout (drawing + inspector + table all visible)
  await page.getByRole("button", { name: "Stacked" }).click();

  const overlay = page.locator(".pdf-stage");
  const box = await overlay.boundingBox();
  const clickAt = async (nx, ny) => {
    await overlay.click({ position: { x: box.width * nx, y: box.height * ny } });
  };

  // --- Place balloons on the lower-page dimension callouts ---
  await page.getByRole("button", { name: "Add Balloon (B)" }).click();
  await clickAt(0.555, 0.51); // "90° ±0.5°"
  await clickAt(0.2146, 0.575); // "2X R8.00 MAX"
  await clickAt(0.486, 0.59); // "4X Ø8.00"
  await shot("balloons-placed");

  // --- Auto Balloon / Review tool: drag around the upper dimension cluster ---
  await page.getByRole("button", { name: "Review Balloon Candidates (A)" }).click();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await shot("auto-balloon-review-candidates");

  const addBalloonsButton = page.getByRole("button", { name: "Add balloons" });
  if (await addBalloonsButton.isVisible().catch(() => false)) {
    await addBalloonsButton.click();
  }
  await shot("balloons-and-table");

  // --- Text Select / OCR capture ---
  await page.getByRole("button", { name: "Text Select (T)" }).click();
  await shot("text-select-active");

  // --- Tolerance table ---
  await page.getByRole("button", { name: "Tolerance table" }).click();
  await page.waitForSelector(".tolerance-table-dialog, .dialog-backdrop");
  await shot("tolerance-table");
  await page.keyboard.press("Escape");

  // --- Settings dialog ---
  await page.getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(200);
  await shot("settings-dialog");
  await page.keyboard.press("Escape");

  // --- Measurement mode ---
  await page.getByRole("button", { name: "Measurement" }).click();
  await page.waitForTimeout(300);
  await shot("measurement-mode");

  const firstSampleInput = page.locator('input[placeholder="0.000"], input[placeholder="OK"]').first();
  if (await firstSampleInput.isVisible().catch(() => false)) {
    await firstSampleInput.fill("12.5");
    await firstSampleInput.blur();
    await shot("measurement-mode-status");
  }

  // --- Back to Edit mode, export toolbar ---
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForTimeout(200);
  await shot("export-toolbar");

  // --- Help dialog ---
  await page.getByRole("button", { name: "Help and shortcuts", exact: false }).first().click();
  await page.waitForTimeout(200);
  await shot("help-dialog");

  await browser.close();
  console.log(`Done. ${shotIndex} screenshots written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
