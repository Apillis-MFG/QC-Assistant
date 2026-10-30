import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "docs", "assets", "screenshots");
const PUBLIC_DIR = path.join(__dirname, "..", "public", "guide");
const SAMPLE_PDF = path.join(__dirname, "..", "docs", "assets", "sample-drawing.pdf");

// Create synthetic customer template for screenshot
function createSyntheticCustomerTemplate() {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["CUSTOMER FIRST ARTICLE INSPECTION REPORT"],
    ["", "Drawing No:", "", "Rev:", "", "Sample Size:", ""],
    ["", "Supplier:", "", "Description:", "", "Overall:", ""],
    [],
    ["BALLOON", "TYPE", "NOMINAL", "TOLERANCE", "USL", "LSL", "SMP 1", "SMP 2", "SMP 3", "MIN", "MAX", "METHOD", "STATUS", "NOTES"],
    ...Array.from({ length: 25 }, () => Array(14).fill("")),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Customer FAI Form");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function main() {
  await mkdir(DOCS_DIR, { recursive: true });
  await mkdir(PUBLIC_DIR, { recursive: true });

  const templateBuffer = createSyntheticCustomerTemplate();
  const templatePath = path.join("/tmp", "Customer_Inspection_Template.xlsx");
  await writeFile(templatePath, templateBuffer);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Route interception to serve dist/ directly inside the sandbox
  await page.route("https://local-app/**", async (route) => {
    const url = new URL(route.request().url());
    let relPath = url.pathname;
    if (relPath === "/" || relPath === "") relPath = "/index.html";
    const filePath = path.join(process.cwd(), "dist", relPath.replace(/^\//, ""));
    try {
      const body = await readFile(filePath);
      const ext = path.extname(filePath);
      const type =
        ext === ".html"
          ? "text/html"
          : ext === ".js" || ext === ".mjs"
          ? "application/javascript"
          : ext === ".css"
          ? "text/css"
          : ext === ".svg"
          ? "image/svg+xml"
          : ext === ".png"
          ? "image/png"
          : ext === ".pdf"
          ? "application/pdf"
          : "application/octet-stream";
      await route.fulfill({ status: 200, contentType: type, body });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });

  const saveShot = async (name) => {
    const docFile = path.join(DOCS_DIR, `${name}.png`);
    const pubFile = path.join(PUBLIC_DIR, `${name}.png`);
    await page.screenshot({ path: docFile });
    await writeFile(pubFile, await readFile(docFile));
    console.log(`Saved screenshot: ${name}.png`);
  };

  await page.goto("https://local-app/");
  await page.waitForSelector(".dashboard-shell");

  // Create project
  await page.getByRole("button", { name: "New Project" }).first().click();
  await page.waitForSelector(".project-detail-form");
  await page.locator(".project-detail-form input").fill("Production Inspection Project");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.waitForSelector(".app-shell");

  // Upload sample PDF
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  await page.waitForSelector(".pdf-stage canvas", { timeout: 15000 });
  await page.waitForTimeout(600);

  const overlay = page.locator(".pdf-stage");
  const box = await overlay.boundingBox();
  const clickAt = async (nx, ny) => {
    await overlay.click({ position: { x: box.width * nx, y: box.height * ny } });
  };

  // Place repeated dimension balloon on "4X Ø8.00" (near x=0.486, y=0.59)
  await page.getByRole("button", { name: "Add Balloon (B)" }).click();
  await clickAt(0.486, 0.59);
  await page.waitForTimeout(400);

  // In the inspector, expand the instances if "Create 4 instances" button exists
  const expandBtn = page.getByRole("button", { name: /Create \d+ instances/i });
  if (await expandBtn.isVisible().catch(() => false)) {
    await expandBtn.click();
    await page.waitForTimeout(400);
    // Click next target for 1.2
    await clickAt(0.2146, 0.575);
    await page.waitForTimeout(400);
  }

  // 1. Capture repeated dimensions view
  await saveShot("18-repeated-dimensions");

  // Open Template Dialog from toolbar
  const templateBtn = page.getByRole("button", { name: /Template/i });
  if (await templateBtn.isVisible().catch(() => false)) {
    await templateBtn.click();
  } else {
    // Or from topbar
    await page.locator('button:has-text("Template")').first().click();
  }
  await page.waitForSelector(".template-dialog", { timeout: 5000 });

  // Upload synthetic customer template
  await page.locator('.template-dialog input[type="file"]').setInputFiles(templatePath);
  await page.waitForTimeout(600);

  // Fill in mapping cells to look realistic
  const drawingInput = page.locator('.template-field-group:has-text("Drawing Number") input');
  if (await drawingInput.isVisible().catch(() => false)) {
    await drawingInput.fill("C2");
  }
  const revInput = page.locator('.template-field-group:has-text("Revision") input');
  if (await revInput.isVisible().catch(() => false)) {
    await revInput.fill("E2");
  }
  const suppInput = page.locator('.template-field-group:has-text("Supplier") input');
  if (await suppInput.isVisible().catch(() => false)) {
    await suppInput.fill("C3");
  }
  const descInput = page.locator('.template-field-group:has-text("Description") input');
  if (await descInput.isVisible().catch(() => false)) {
    await descInput.fill("E3");
  }
  const sizeInput = page.locator('.template-field-group:has-text("Sample Size") input');
  if (await sizeInput.isVisible().catch(() => false)) {
    await sizeInput.fill("G2");
  }
  const statusInput = page.locator('.template-field-group:has-text("Overall Status") input');
  if (await statusInput.isVisible().catch(() => false)) {
    await statusInput.fill("G3");
  }

  // Map some columns
  const nomInput = page.locator('.template-field-group:has-text("Nominal Value") input');
  if (await nomInput.isVisible().catch(() => false)) {
    await nomInput.fill("C");
  }
  const tolInput = page.locator('.template-field-group:has-text("Tolerance") input');
  if (await tolInput.isVisible().catch(() => false)) {
    await tolInput.fill("D");
  }
  const uslInput = page.locator('.template-field-group:has-text("USL") input');
  if (await uslInput.isVisible().catch(() => false)) {
    await uslInput.fill("E");
  }
  const lslInput = page.locator('.template-field-group:has-text("LSL") input');
  if (await lslInput.isVisible().catch(() => false)) {
    await lslInput.fill("F");
  }

  const sample1Input = page.locator('.template-field-group:has-text("Sample #1 Column") input');
  if (await sample1Input.isVisible().catch(() => false)) {
    await sample1Input.fill("G");
  }

  // 2. Capture Customer Template Dialog with live capacity badge and mappings
  await page.waitForTimeout(400);
  await saveShot("19-customer-template-dialog");

  // Save template or close dialog
  const saveBtn = page.getByRole("button", { name: "Save Template" });
  if (await saveBtn.isEnabled().catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(600);
  }
  // Ensure dialog is closed
  const closeBtn = page.locator('button[aria-label="Close template dialog"]');
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(600);
  }

  // 3. Capture Workspace Toolbar showing Excel (<Template Name>) and Default buttons
  await saveShot("20-template-export-toolbar");

  // Switch to Measurement mode or enter samples to show batch sample actions
  const fillNominalsBtn = page.getByRole("button", { name: "Fill Nominals" });
  if (await fillNominalsBtn.isVisible().catch(() => false)) {
    await fillNominalsBtn.click();
    await page.waitForTimeout(400);
  }

  // 4. Capture table with batch sample actions
  await saveShot("21-batch-sample-actions");

  await browser.close();
  console.log("All update screenshots generated successfully!");
}

main().catch((err) => {
  console.error("Screenshot generation error:", err);
  process.exit(1);
});

