import assert from "node:assert/strict";
import {
  calculateLuminance,
  detectDarkBackground,
  invertImageData,
  computeLuminanceHistogram,
  calculatePercentiles,
  stretchContrast,
  applyAdaptiveThreshold,
  calculateOtsuThreshold,
  applyOtsuThreshold,
  preprocessImageData,
} from "../src/lib/ocrPreprocessing.js";

console.log("Starting verification of OCR preprocessing & contrast enhancement...");

// ---------------------------------------------------------------------------
// 1. Luminance calculations (Rec. 601)
// ---------------------------------------------------------------------------
assert.equal(calculateLuminance(0, 0, 0), 0, "Black luminance must be 0");
assert.equal(calculateLuminance(255, 255, 255), 255, "White luminance must be 255");

const redLum = calculateLuminance(255, 0, 0);
const greenLum = calculateLuminance(0, 255, 0);
const blueLum = calculateLuminance(0, 0, 255);

assert.ok(greenLum > redLum, "Green luminance (~150) must exceed Red (~76)");
assert.ok(redLum > blueLum, "Red luminance (~76) must exceed Blue (~29)");
assert.equal(redLum, 76);
assert.equal(greenLum, 150);
assert.equal(blueLum, 29);

// ---------------------------------------------------------------------------
// 2. Dark background detection (Title blocks & blueprints)
// ---------------------------------------------------------------------------
// Helper to create an RGBA buffer
function createRgbaBuffer(width, height, fillRgba = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillRgba[0];
    data[i + 1] = fillRgba[1];
    data[i + 2] = fillRgba[2];
    data[i + 3] = fillRgba[3];
  }
  return data;
}

// Case A: Standard white drawing sheet
const whiteSheet = createRgbaBuffer(20, 20, [250, 250, 250, 255]);
assert.equal(
  detectDarkBackground(whiteSheet, 20, 20),
  false,
  "White drawing sheet should not be detected as dark background",
);

// Case B: Inverted CAD title block (solid black with white text in center)
const darkTitleBlock = createRgbaBuffer(20, 20, [15, 20, 25, 255]);
// Add bright text in the center
for (let y = 8; y <= 12; y++) {
  for (let x = 8; x <= 12; x++) {
    const idx = (y * 20 + x) * 4;
    darkTitleBlock[idx] = 240;
    darkTitleBlock[idx + 1] = 240;
    darkTitleBlock[idx + 2] = 240;
  }
}
assert.equal(
  detectDarkBackground(darkTitleBlock, 20, 20),
  true,
  "Title block with dark border must be detected as dark background",
);

// Case C: Blueprint blue background (R=20, G=45, B=110)
const blueprintSheet = createRgbaBuffer(15, 15, [20, 45, 110, 255]);
assert.equal(
  detectDarkBackground(blueprintSheet, 15, 15),
  true,
  "Blueprint blue background must be detected as dark background",
);

// ---------------------------------------------------------------------------
// 3. Image inversion
// ---------------------------------------------------------------------------
const invertTest = new Uint8ClampedArray([
  0, 10, 200, 255,
  255, 255, 255, 255,
]);
invertImageData(invertTest, 2, 1);
assert.equal(invertTest[0], 255);
assert.equal(invertTest[1], 245);
assert.equal(invertTest[2], 55);
assert.equal(invertTest[3], 255, "Alpha must remain unchanged");
assert.equal(invertTest[4], 0);
assert.equal(invertTest[5], 0);
assert.equal(invertTest[6], 0);
assert.equal(invertTest[7], 255);

// ---------------------------------------------------------------------------
// 4. Contrast normalization for faint pencil markings
// ---------------------------------------------------------------------------
// Create a faint pencil scan: 95% paper at gray 210, 5% faint pencil marks at gray 170
const faintPencilImg = createRgbaBuffer(20, 20, [210, 210, 210, 255]);
// Draw pencil strokes (20 pixels) at gray 170
for (let i = 0; i < 20; i++) {
  faintPencilImg[i * 4] = 170;
  faintPencilImg[i * 4 + 1] = 170;
  faintPencilImg[i * 4 + 2] = 170;
}

const { hist, totalPixels } = computeLuminanceHistogram(faintPencilImg, 20, 20);
assert.equal(totalPixels, 400);
assert.equal(hist[170], 20, "20 pencil pixels at luminance 170");
assert.equal(hist[210], 380, "380 paper pixels at luminance 210");

const { pLow, pHigh } = calculatePercentiles(hist, totalPixels, 0.02, 0.98);
assert.equal(pLow, 170, "Lower percentile should capture pencil stroke level");
assert.equal(pHigh, 210, "Upper percentile should capture paper background level");

// Apply contrast stretch
const stretched = stretchContrast(faintPencilImg, 20, 20, pLow, pHigh);
assert.ok(stretched, "Contrast stretch should succeed on faint scan");

// Pencil strokes at 170 should now be mapped to 0 (pure black)
assert.equal(faintPencilImg[0], 0, "Pencil stroke must be stretched to deep black (0)");
assert.equal(faintPencilImg[1], 0);
assert.equal(faintPencilImg[2], 0);

// Paper background at 210 should now be mapped to 255 (pure white)
const paperIdx = 25 * 4;
assert.equal(faintPencilImg[paperIdx], 255, "Paper background must be stretched to pure white (255)");
assert.equal(faintPencilImg[paperIdx + 1], 255);
assert.equal(faintPencilImg[paperIdx + 2], 255);

// ---------------------------------------------------------------------------
// 5. Bradley-Roth local adaptive thresholding under shadows
// ---------------------------------------------------------------------------
// 40 x 20 image:
// Left half (x < 20): Well-lit: paper = 240, text at (5, 10) = 50
// Right half (x >= 20): Deep shadow: paper = 140, text at (30, 10) = 30
const shadowImg = new Uint8ClampedArray(40 * 20 * 4);
for (let y = 0; y < 20; y++) {
  for (let x = 0; x < 40; x++) {
    const idx = (y * 40 + x) * 4;
    const isText = (x === 5 && y === 10) || (x === 30 && y === 10);
    let val;
    if (x < 20) {
      val = isText ? 50 : 240;
    } else {
      val = isText ? 30 : 140; // in deep shadow
    }
    shadowImg[idx] = val;
    shadowImg[idx + 1] = val;
    shadowImg[idx + 2] = val;
    shadowImg[idx + 3] = 255;
  }
}

applyAdaptiveThreshold(shadowImg, 40, 20, { windowSize: 11, adaptiveWeight: 0.12 });

// Left side:
const leftTextIdx = (10 * 40 + 5) * 4;
const leftPaperIdx = (10 * 40 + 6) * 4;
assert.equal(shadowImg[leftTextIdx], 0, "Well-lit text must be segmented as black (0)");
assert.equal(shadowImg[leftPaperIdx], 255, "Well-lit paper must be segmented as white (255)");

// Right side (in shadow):
const rightTextIdx = (10 * 40 + 30) * 4;
const rightPaperIdx = (10 * 40 + 31) * 4;
assert.equal(shadowImg[rightTextIdx], 0, "Shadowed text must be segmented as black (0)");
assert.equal(shadowImg[rightPaperIdx], 255, "Shadowed paper background must be segmented as white (255)");

// ---------------------------------------------------------------------------
// 6. Otsu's optimal global binarization
// ---------------------------------------------------------------------------
// Bimodal histogram with modes around 50 (text) and 220 (background)
const bimodalHist = new Uint32Array(256);
bimodalHist[50] = 100;
bimodalHist[220] = 900;
const otsuThresh = calculateOtsuThreshold(bimodalHist, 1000);
assert.ok(
  otsuThresh >= 50 && otsuThresh <= 220,
  `Otsu threshold (${otsuThresh}) must separate the two modes (50 and 220)`,
);

// ---------------------------------------------------------------------------
// 7. Full pipeline integration (preprocessImageData)
// ---------------------------------------------------------------------------
// Title block test: dark background with faint light text
const titleBlockCrop = createRgbaBuffer(30, 30, [20, 25, 30, 255]);
// Draw text at (15, 15) with light gray (190, 190, 190)
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    const idx = ((15 + dy) * 30 + (15 + dx)) * 4;
    titleBlockCrop[idx] = 190;
    titleBlockCrop[idx + 1] = 190;
    titleBlockCrop[idx + 2] = 190;
  }
}

const summary = preprocessImageData(
  { data: titleBlockCrop, width: 30, height: 30 },
  { invertIfDark: true, normalizeContrast: true, binarize: "adaptive" },
);

assert.equal(summary.inverted, true, "Title block should be inverted");
assert.equal(summary.thresholdMethod, "adaptive", "Adaptive threshold should be applied");

// Check resulting pixels: text should be 0 (black), background 255 (white)
const textCenterIdx = (15 * 30 + 15) * 4;
const borderPixelIdx = 0;
assert.equal(titleBlockCrop[textCenterIdx], 0, "Inverted title block text must become black (0)");
assert.equal(titleBlockCrop[borderPixelIdx], 255, "Inverted title block background must become white (255)");

// Alpha composite test: semi-transparent image over white
const transparentImg = new Uint8ClampedArray([
  0, 0, 0, 0, // fully transparent
  0, 0, 0, 128, // 50% black
  0, 0, 0, 255, // 100% black
  255, 255, 255, 255, // 100% white
]);
preprocessImageData(
  { data: transparentImg, width: 2, height: 2 },
  { invertIfDark: false, normalizeContrast: false, binarize: "none" },
);
// Pixel 0 (transparent) should be blended to white (255)
assert.equal(transparentImg[0], 255);
assert.equal(transparentImg[3], 255);
// Pixel 1 (50% black on white) should be ~128
assert.ok(Math.abs(transparentImg[4] - 128) <= 2);

console.log("PASS: 100% OCR preprocessing and contrast enhancement verification checks passed successfully!");
