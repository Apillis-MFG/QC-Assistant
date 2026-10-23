/**
 * QC Assistant - Client-side OCR Image Preprocessing & Contrast Enhancement
 * 
 * Provides deterministic, dependency-free canvas and ImageData preprocessing:
 * 1. Background inversion detection for CAD title blocks and blueprint styling
 * 2. Percentile-based contrast normalization for faint pencil markings and low-contrast scans
 * 3. Local adaptive binarization (Bradley-Roth integral image) for handling shadows and uneven lighting
 * 4. Otsu global thresholding fallback
 */

/**
 * Calculates Rec. 601 grayscale luminance from RGB values.
 * @param {number} r 0..255
 * @param {number} g 0..255
 * @param {number} b 0..255
 * @returns {number} 0..255
 */
export function calculateLuminance(r, g, b) {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * Detects whether the cropped image has a dark background (e.g. title blocks, blueprints, CAD dark mode).
 * Samples the outer perimeter border pixels, which represent the canvas/sheet background.
 * 
 * @param {Uint8Array|Uint8ClampedArray} data RGBA pixel buffer
 * @param {number} width 
 * @param {number} height 
 * @param {object} [options]
 * @param {number} [options.darkThreshold=128] Threshold below which background is considered dark
 * @returns {boolean}
 */
export function detectDarkBackground(data, width, height, options = {}) {
  const threshold = options.darkThreshold ?? 128;
  if (!data || width <= 0 || height <= 0) return false;

  let borderLumSum = 0;
  let borderCount = 0;

  // Top and bottom border rows
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    borderLumSum += calculateLuminance(data[topIdx], data[topIdx + 1], data[topIdx + 2]);
    borderCount++;

    if (height > 1) {
      const btmIdx = ((height - 1) * width + x) * 4;
      borderLumSum += calculateLuminance(data[btmIdx], data[btmIdx + 1], data[btmIdx + 2]);
      borderCount++;
    }
  }

  // Left and right border columns (excluding corners already counted)
  for (let y = 1; y < height - 1; y++) {
    const leftIdx = (y * width) * 4;
    borderLumSum += calculateLuminance(data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]);
    borderCount++;

    if (width > 1) {
      const rightIdx = (y * width + (width - 1)) * 4;
      borderLumSum += calculateLuminance(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]);
      borderCount++;
    }
  }

  const borderLuminance = borderCount > 0 ? borderLumSum / borderCount : 255;
  return borderLuminance < threshold;
}

/**
 * Inverts the RGB channels of an image buffer in-place (keeps alpha intact).
 * 
 * @param {Uint8Array|Uint8ClampedArray} data RGBA pixel buffer
 * @param {number} width 
 * @param {number} height 
 */
export function invertImageData(data, width, height) {
  const total = width * height * 4;
  for (let i = 0; i < total; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}

/**
 * Computes a 256-bin histogram of grayscale luminance.
 * 
 * @param {Uint8Array|Uint8ClampedArray} data RGBA pixel buffer
 * @param {number} width 
 * @param {number} height 
 * @returns {{ hist: Uint32Array, totalPixels: number }}
 */
export function computeLuminanceHistogram(data, width, height) {
  const hist = new Uint32Array(256);
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels * 4; i += 4) {
    const lum = calculateLuminance(data[i], data[i + 1], data[i + 2]);
    hist[lum]++;
  }
  return { hist, totalPixels };
}

/**
 * Computes lower and upper percentile luminance values from a histogram.
 * 
 * @param {Uint32Array} hist 256-bin histogram
 * @param {number} totalPixels 
 * @param {number} [lowPercent=0.02] 
 * @param {number} [highPercent=0.98] 
 * @returns {{ pLow: number, pHigh: number }}
 */
export function calculatePercentiles(hist, totalPixels, lowPercent = 0.02, highPercent = 0.98) {
  const lowCount = Math.floor(totalPixels * lowPercent);
  const highCount = Math.floor(totalPixels * highPercent);

  let pLow = 0;
  let pHigh = 255;
  let accumulated = 0;
  let foundLow = false;

  for (let i = 0; i < 256; i++) {
    accumulated += hist[i];
    if (!foundLow && accumulated >= lowCount) {
      pLow = i;
      foundLow = true;
    }
    if (accumulated >= highCount) {
      pHigh = i;
      break;
    }
  }

  return { pLow, pHigh };
}

/**
 * Normalizes contrast by stretching the luminance dynamic range between pLow and pHigh to 0..255.
 * Converts the image to stretched grayscale in-place.
 * 
 * @param {Uint8Array|Uint8ClampedArray} data RGBA pixel buffer
 * @param {number} width 
 * @param {number} height 
 * @param {number} pLow 
 * @param {number} pHigh 
 * @returns {boolean} True if stretched, false if dynamic range was too small (<= 5)
 */
export function stretchContrast(data, width, height, pLow, pHigh) {
  const range = pHigh - pLow;
  if (range <= 5) return false;

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (i <= pLow) {
      lut[i] = 0;
    } else if (i >= pHigh) {
      lut[i] = 255;
    } else {
      lut[i] = Math.round(((i - pLow) / range) * 255);
    }
  }

  const total = width * height * 4;
  for (let i = 0; i < total; i += 4) {
    const lum = calculateLuminance(data[i], data[i + 1], data[i + 2]);
    const stretched = lut[lum];
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
  return true;
}

/**
 * Applies Bradley-Roth local adaptive thresholding using a 2D integral image.
 * Runs in O(N) time and cleanly segments text even under uneven shadows and non-uniform lighting.
 * 
 * @param {Uint8Array|Uint8ClampedArray} data RGBA pixel buffer
 * @param {number} width 
 * @param {number} height 
 * @param {object} [options]
 * @param {number} [options.adaptiveWeight=0.12] Fraction below local mean to consider foreground (0.10..0.15)
 * @param {number} [options.windowSize] Window diameter in pixels (defaults to max(9, round(minDim / 8)))
 */
export function applyAdaptiveThreshold(data, width, height, options = {}) {
  const t = options.adaptiveWeight ?? 0.12;
  const minDim = Math.min(width, height);
  let windowSize = options.windowSize ?? Math.max(9, Math.round(minDim / 8));
  if (windowSize % 2 === 0) windowSize += 1;
  const radius = Math.floor(windowSize / 2);

  const intW = width + 1;
  const integral = new Float64Array(intW * (height + 1));
  const lum = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const val = data[idx];
      lum[y * width + x] = val;
      rowSum += val;
      integral[(y + 1) * intW + (x + 1)] = integral[y * intW + (x + 1)] + rowSum;
    }
  }

  const factor = 1 - t;
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(width - 1, x + radius);

      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * intW + (x2 + 1)]
                - integral[y1 * intW + (x2 + 1)]
                - integral[(y2 + 1) * intW + x1]
                + integral[y1 * intW + x1];

      const localMean = sum / count;
      const pixelVal = lum[y * width + x];
      const binaryVal = pixelVal < localMean * factor ? 0 : 255;

      const idx = (y * width + x) * 4;
      data[idx] = binaryVal;
      data[idx + 1] = binaryVal;
      data[idx + 2] = binaryVal;
      data[idx + 3] = 255;
    }
  }
}

/**
 * Calculates optimal global binarization threshold via Otsu's method.
 * 
 * @param {Uint32Array} hist 256-bin histogram
 * @param {number} totalPixels 
 * @returns {number} Threshold value 0..255
 */
export function calculateOtsuThreshold(hist, totalPixels) {
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * hist[i];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let bestThreshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVariance = wB * wF * (mB - mF) * (mB - mF);

    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

/**
 * Applies a global threshold to an image buffer.
 * 
 * @param {Uint8Array|Uint8ClampedArray} data RGBA pixel buffer
 * @param {number} width 
 * @param {number} height 
 * @param {number} threshold 0..255
 */
export function applyOtsuThreshold(data, width, height, threshold) {
  const total = width * height * 4;
  for (let i = 0; i < total; i += 4) {
    const val = data[i] < threshold ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
}

/**
 * Complete preprocessing pipeline for OCR text recognition.
 * Operates on ImageData-compatible objects ({ data, width, height }).
 * 
 * @param {{ data: Uint8Array|Uint8ClampedArray, width: number, height: number }} imageData 
 * @param {object} [options]
 * @param {boolean} [options.invertIfDark=true] Whether to invert dark-background images
 * @param {boolean} [options.normalizeContrast=true] Whether to apply percentile-based contrast stretching
 * @param {string|boolean} [options.binarize="adaptive"] "adaptive" | "otsu" | "none" | true | false
 * @param {number} [options.percentileLow=0.02]
 * @param {number} [options.percentileHigh=0.98]
 * @param {number} [options.adaptiveWeight=0.12]
 * @param {number} [options.windowSize]
 * @returns {object} Preprocessing summary stats
 */
export function preprocessImageData(imageData, options = {}) {
  const { data, width, height } = imageData;
  if (!data || width <= 0 || height <= 0) {
    return {
      inverted: false,
      contrastStretched: false,
      thresholdMethod: "none",
    };
  }

  // 1. Composite any transparency over white background
  const total = width * height * 4;
  for (let i = 0; i < total; i += 4) {
    const a = data[i + 3];
    if (a < 255) {
      const alpha = a / 255;
      data[i] = Math.round(data[i] * alpha + 255 * (1 - alpha));
      data[i + 1] = Math.round(data[i + 1] * alpha + 255 * (1 - alpha));
      data[i + 2] = Math.round(data[i + 2] * alpha + 255 * (1 - alpha));
      data[i + 3] = 255;
    }
  }

  // 2. Invert if dark background detected (title blocks, blueprints)
  let inverted = false;
  if (options.invertIfDark !== false) {
    const isDark = detectDarkBackground(data, width, height, options);
    if (isDark) {
      invertImageData(data, width, height);
      inverted = true;
    }
  }

  // 3. Luminance histogram and percentile contrast stretching
  let contrastStretched = false;
  const { hist, totalPixels } = computeLuminanceHistogram(data, width, height);
  const { pLow, pHigh } = calculatePercentiles(
    hist,
    totalPixels,
    options.percentileLow ?? 0.02,
    options.percentileHigh ?? 0.98,
  );

  if (options.normalizeContrast !== false) {
    contrastStretched = stretchContrast(data, width, height, pLow, pHigh);
  } else {
    // If not stretching contrast, convert to pure grayscale
    for (let i = 0; i < total; i += 4) {
      const lum = calculateLuminance(data[i], data[i + 1], data[i + 2]);
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
    }
  }

  // 4. Binarization / Thresholding
  let thresholdMethod = "none";
  let otsuThresholdVal = null;
  const binarizeOption = options.binarize ?? "adaptive";

  if (binarizeOption === "adaptive" || binarizeOption === true) {
    applyAdaptiveThreshold(data, width, height, options);
    thresholdMethod = "adaptive";
  } else if (binarizeOption === "otsu") {
    const stretchedHist = computeLuminanceHistogram(data, width, height);
    otsuThresholdVal = calculateOtsuThreshold(stretchedHist.hist, totalPixels);
    applyOtsuThreshold(data, width, height, otsuThresholdVal);
    thresholdMethod = "otsu";
  }

  return {
    inverted,
    contrastStretched,
    thresholdMethod,
    stats: {
      pLow,
      pHigh,
      otsuThreshold: otsuThresholdVal,
    },
  };
}
