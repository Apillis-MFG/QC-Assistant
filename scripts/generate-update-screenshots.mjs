import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "docs", "assets", "screenshots");
const PUBLIC_DIR = path.join(__dirname, "..", "public", "guide");
const SAMPLE_PDF = path.join(__dirname, "..", "docs", "assets", "sample-drawing.pdf");

function createSyntheticCustomerTemplate() {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["CUSTOMER FIRST ARTICLE INSPECTION REPORT"],
    ["", "Drawing No:", "", "Rev:", "", "Sample Size:", ""],
    ["", "Supplier:", "", "Description:", "", "Overall:", ""],
    [],
    ["BALLOON", "TYPE", "NOMINAL", "TOLERANCE", "USL", "LSL", "SMP 1", "SMP 2", "SMP 3", "SMP 4", "SMP 5", "MIN", "MAX", "METHOD", "STATUS", "NOTES"],
    ...Array.from({ length: 45 }, () => Array(16).fill("")),
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

  const regFont = await readFile(path.join(__dirname, "..", "node_modules", ".pnpm", "pdfjs-dist@4.10.38", "node_modules", "pdfjs-dist", "standard_fonts", "LiberationSans-Regular.ttf"));
  const boldFont = await readFile(path.join(__dirname, "..", "node_modules", ".pnpm", "pdfjs-dist@4.10.38", "node_modules", "pdfjs-dist", "standard_fonts", "LiberationSans-Bold.ttf"));
  
  const fontCss = `
    @font-face {
      font-family: "LiberationSans";
      font-weight: normal;
      font-style: normal;
      src: url(data:font/truetype;charset=utf-8;base64,${regFont.toString("base64")}) format("truetype");
    }
    @font-face {
      font-family: "LiberationSans";
      font-weight: bold;
      font-style: normal;
      src: url(data:font/truetype;charset=utf-8;base64,${boldFont.toString("base64")}) format("truetype");
    }
    *, input, button, select, textarea {
      font-family: "LiberationSans", sans-serif !important;
    }
  `;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.route("https://local-app/**", async (route) => {
    const url = new URL(route.request().url());
    let relPath = url.pathname;
    if (relPath === "/" || relPath === "") relPath = "/index.html";
    const filePath = path.join(process.cwd(), "dist", relPath.replace(/^\//, ""));
    try {
      const body = await readFile(filePath);
      const ext = path.extname(filePath);
      const type =
        ext === ".html" ? "text/html"
        : ext === ".js" || ext === ".mjs" ? "application/javascript"
        : ext === ".css" ? "text/css"
        : ext === ".svg" ? "image/svg+xml"
        : ext === ".png" ? "image/png"
        : ext === ".pdf" ? "application/pdf"
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
  await page.addStyleTag({ content: fontCss });
  await page.waitForSelector(".dashboard-shell");

  // Create project
  await page.getByRole("button", { name: "New Project" }).first().click();
  await page.waitForSelector(".project-detail-form");
  await page.addStyleTag({ content: fontCss });
  await page.locator(".project-detail-form input").fill("Production Inspection Project");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.waitForSelector(".app-shell");
  await page.addStyleTag({ content: fontCss });

  // Upload sample PDF
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  await page.waitForSelector(".pdf-stage canvas", { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: fontCss });

  // Switch to Stacked layout
  await page.getByRole("button", { name: "Stacked" }).click();
  await page.waitForTimeout(300);

  const overlay = page.locator(".pdf-stage");
  const box = await overlay.boundingBox();
  const clickAt = async (nx, ny) => {
    await overlay.click({ position: { x: box.width * nx, y: box.height * ny } });
  };

  // Place initial balloons
  await page.getByRole("button", { name: "Add Balloon (B)" }).click();
  await clickAt(0.555, 0.51); // 1: "90° ±0.5°"
  await page.waitForTimeout(300);
  await clickAt(0.2146, 0.575); // 2: "2X R8.00 MAX"
  await page.waitForTimeout(300);
  await clickAt(0.486, 0.59); // 3: "4X Ø8.00"
  await page.waitForTimeout(400);

  // Set quantity to 4 and expand instances
  const qtyInput = page.locator('input[name="quantity"]');
  if (await qtyInput.isVisible().catch(() => false)) {
    await qtyInput.fill("4");
    const createBtn = page.getByRole("button", { name: "Create instances" });
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(400);
      // Place 3.2 on second hole
      await clickAt(0.45, 0.54);
      await page.waitForTimeout(300);
    }
  }

  await page.addStyleTag({ content: fontCss });
  // Shot 18: Repeated dimensions
  await saveShot("18-repeated-dimensions");

  // Place remaining occurrences 3.3 and 3.4 so all occurrences are placed
  await clickAt(0.208, 0.555); // 3.3
  await page.waitForTimeout(300);
  await clickAt(0.45, 0.44); // 3.4
  await page.waitForTimeout(300);

  // Open Template Dialog
  const templateBtn = page.getByRole("button", { name: "Template" });
  await templateBtn.click();
  await page.waitForSelector(".template-dialog", { timeout: 5000 });
  await page.addStyleTag({ content: fontCss });

  // Upload synthetic customer template directly to file input
  await page.locator('input[accept=".xlsx"]').setInputFiles(templatePath);
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: fontCss });

  // Map header fields
  const drawingInput = page.locator('.template-field-group:has-text("Drawing Number") input');
  if (await drawingInput.isVisible().catch(() => false)) await drawingInput.fill("C2");
  const revInput = page.locator('.template-field-group:has-text("Revision") input');
  if (await revInput.isVisible().catch(() => false)) await revInput.fill("E2");
  const suppInput = page.locator('.template-field-group:has-text("Supplier") input');
  if (await suppInput.isVisible().catch(() => false)) await suppInput.fill("C3");
  const descInput = page.locator('.template-field-group:has-text("Description") input');
  if (await descInput.isVisible().catch(() => false)) await descInput.fill("E3");
  const sizeInput = page.locator('.template-field-group:has-text("Sample Size") input');
  if (await sizeInput.isVisible().catch(() => false)) await sizeInput.fill("G2");
  const statusInput = page.locator('.template-field-group:has-text("Overall Status") input');
  if (await statusInput.isVisible().catch(() => false)) await statusInput.fill("G3");

  // Map characteristic columns
  const nomInput = page.locator('.template-field-group:has-text("Nominal Value") input');
  if (await nomInput.isVisible().catch(() => false)) await nomInput.fill("C");
  const tolInput = page.locator('.template-field-group:has-text("Tolerance") input');
  if (await tolInput.isVisible().catch(() => false)) await tolInput.fill("D");
  const uslInput = page.locator('.template-field-group:has-text("USL") input');
  if (await uslInput.isVisible().catch(() => false)) await uslInput.fill("E");
  const lslInput = page.locator('.template-field-group:has-text("LSL") input');
  if (await lslInput.isVisible().catch(() => false)) await lslInput.fill("F");
  
  // Fill sample columns 1..5
  const sampleInputs = page.locator('.template-field-group:has-text("Sample #") input');
  const sampleLetters = ["G", "H", "I", "J", "K"];
  const sampleCount = await sampleInputs.count();
  for (let i = 0; i < sampleCount; i++) {
    await sampleInputs.nth(i).fill(sampleLetters[i]);
  }

  await page.waitForTimeout(400);
  await page.addStyleTag({ content: fontCss });

  // Shot 19: Customer template dialog with live capacity validation
  await saveShot("19-customer-template-dialog");

  // Save template
  const saveBtn = page.getByRole("button", { name: "Save Template" });
  await saveBtn.click();
  await page.waitForTimeout(600);

  await page.addStyleTag({ content: fontCss });
  // Shot 20: Workspace toolbar showing Excel (Customer FAI Form) & Default buttons
  await saveShot("20-template-export-toolbar");

  // Switch to Table layout to showcase Characteristics table with batch actions
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.waitForTimeout(400);

  // Click "Fill Nominals" to populate sample values
  const fillNominalsBtn = page.getByRole("button", { name: "Fill Nominals" });
  if (await fillNominalsBtn.isVisible().catch(() => false)) {
    await fillNominalsBtn.click();
    await page.waitForTimeout(400);
  }

  await page.addStyleTag({ content: fontCss });
  // Shot 21: Table view with batch sample actions and populated measurements
  await saveShot("21-batch-sample-actions");

  await browser.close();
  console.log("All 4 screenshots (18-21) generated successfully!");
}

main().catch((err) => {
  console.error("Screenshot generation error:", err);
  process.exit(1);
});
