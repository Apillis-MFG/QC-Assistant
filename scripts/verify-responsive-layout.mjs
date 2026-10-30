import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

console.log("Starting verification of mobile and tablet responsive layout rules...");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, "..", "src", "styles.css");
const css = fs.readFileSync(cssPath, "utf-8");

// ---------------------------------------------------------------------------
// 1. Breakpoint coverage for screens narrower than 768px
// ---------------------------------------------------------------------------
assert.ok(
  css.includes("@media (max-width: 768px)"),
  "CSS must include responsive media query for screens <= 768px",
);

// ---------------------------------------------------------------------------
// 2. Minimum 44px touch targets on toolbar buttons on <= 768px screens
// ---------------------------------------------------------------------------
const media768Match = css.match(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\}/);
assert.ok(media768Match, "Must match @media (max-width: 768px) block");
const media768Content = media768Match[1];

assert.ok(
  media768Content.includes("min-height: 44px;"),
  "Toolbar buttons and interactive controls must enforce min-height: 44px on screens <= 768px",
);
assert.ok(
  media768Content.includes(".icon-button") && media768Content.includes("min-width: 44px;"),
  "Icon buttons must enforce min-width: 44px on screens <= 768px",
);

// ---------------------------------------------------------------------------
// 3. Table horizontal scrolling strictly contained without affecting page scroll
// ---------------------------------------------------------------------------
assert.ok(
  media768Content.includes(".table-scroll") &&
    media768Content.includes("overflow-x: auto;") &&
    media768Content.includes("overscroll-behavior-x: contain;"),
  "QC table must contain horizontal scrolling within its container and prevent scroll chaining",
);

assert.ok(
  media768Content.includes("overflow-x: hidden;") && media768Content.includes("max-width: 100vw;"),
  "Page root (.app-shell / body / html) must prevent whole-page horizontal overflow on <= 768px",
);

// ---------------------------------------------------------------------------
// 4. Inspector panel reachable without horizontal scroll on iPad-width screens
// ---------------------------------------------------------------------------
// iPad screen width (768px - 1024px) falls within the @media (max-width: 1100px) block
const media1100Match = css.match(/@media\s*\(\s*max-width:\s*1100px\s*\)\s*\{([\s\S]*?)\n\}/);
assert.ok(media1100Match, "Must match @media (max-width: 1100px) block for tablet/iPad layouts");
const media1100Content = media1100Match[1];

assert.ok(
  media1100Content.includes("grid-template-columns: 1fr;"),
  "Content area must collapse to single column (1fr) on tablet / iPad widths",
);
assert.ok(
  media1100Content.includes(".inspector") &&
    media1100Content.includes("grid-column: 1;") &&
    media1100Content.includes("grid-row: 2;"),
  "Inspector must be positioned vertically at grid-row: 2 directly below the drawing panel without horizontal scrolling",
);

console.log("PASS: 100% mobile and tablet responsive layout checks passed successfully!");

