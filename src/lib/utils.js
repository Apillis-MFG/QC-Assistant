import { BALLOON_OFFSET, BALLOON_MARGIN, normalizeUnitSystem } from "./constants.js";
import { PROJECT_LIMITS } from "./projectStore.js";
import { isValidOccurrenceQuantity, MAX_OCCURRENCE_QUANTITY } from "./occurrences.js";
import {
  preprocessImageData,
  calculateLuminance,
  detectDarkBackground,
  invertImageData,
  computeLuminanceHistogram,
  calculatePercentiles,
  stretchContrast,
  applyAdaptiveThreshold,
  calculateOtsuThreshold,
  applyOtsuThreshold,
} from "./ocrPreprocessing.js";

export {
  preprocessImageData,
  calculateLuminance,
  detectDarkBackground,
  invertImageData,
  computeLuminanceHistogram,
  calculatePercentiles,
  stretchContrast,
  applyAdaptiveThreshold,
  calculateOtsuThreshold,
  applyOtsuThreshold,
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundCoord(val) {
  return Math.round(val * 1e6) / 1e6;
}

/**
 * Rotate normalized coordinates (0..1 fractions) by degrees clockwise.
 * Supports orthogonal steps: 0, 90, 180, 270.
 */
export function rotateNormalizedPoint({ x, y }, degrees = 90) {
  const rot = ((degrees % 360) + 360) % 360;
  const nx = clamp(Number(x) || 0, 0, 1);
  const ny = clamp(Number(y) || 0, 0, 1);

  switch (rot) {
    case 90:
      return { x: roundCoord(1 - ny), y: roundCoord(nx) };
    case 180:
      return { x: roundCoord(1 - nx), y: roundCoord(1 - ny) };
    case 270:
      return { x: roundCoord(ny), y: roundCoord(1 - nx) };
    case 0:
    default:
      return { x: roundCoord(nx), y: roundCoord(ny) };
  }
}

/**
 * Rotate all placed characteristic coordinates and leader targets by degrees clockwise.
 */
export function rotateCharacteristicCoordinates(characteristics = [], degrees = 90) {
  if (!Array.isArray(characteristics) || !characteristics.length) return [];
  const rot = ((degrees % 360) + 360) % 360;
  if (rot === 0) return characteristics;

  return characteristics.map((item) => {
    if (item.isPlaced === false || item.x === undefined || item.y === undefined) {
      return item;
    }
    const pt = rotateNormalizedPoint({ x: item.x, y: item.y }, rot);
    const target =
      item.targetX !== undefined && item.targetY !== undefined
        ? rotateNormalizedPoint({ x: item.targetX, y: item.targetY }, rot)
        : null;

    return {
      ...item,
      x: pt.x,
      y: pt.y,
      ...(target ? { targetX: target.x, targetY: target.y } : {}),
    };
  });
}

export function buildDrawingSnapshot({
  drawing,
  activeDrawingId,
  activeProjectId,
  metadata,
  unitSystem,
  toleranceOverrides,
  sampleCount,
  pdfBytes,
  pdfName,
  pageCount,
  pageNumber,
  zoom,
  rotation = 0,
  characteristics,
  status,
  now,
}) {
  const baseName = pdfName ? pdfName.replace(/\.[^/.]+$/, "") : "Untitled Drawing";
  return {
    id: activeDrawingId,
    projectId: activeProjectId,
    name: drawing?.name || metadata.drawingNo || baseName,
    pdfName,
    pdfBytes,
    pdfByteLength: pdfBytes?.byteLength || drawing?.pdfByteLength || 0,
    pageCount,
    metadata,
    unitSystem: normalizeUnitSystem(unitSystem),
    toleranceOverrides,
    sampleCount,
    characteristics,
    pageNumber,
    zoom,
    rotation: ((rotation % 360) + 360) % 360,
    status,
    createdAt: drawing?.createdAt || now,
    updatedAt: now,
  };
}

export function updateDrawingSummary(drawings, drawing) {
  const summary = {
    ...drawing,
    pdfBytes: undefined,
  };
  const existing = drawings.some((item) => item.id === drawing.id);
  const next = existing
    ? drawings.map((item) => (item.id === drawing.id ? summary : item))
    : [summary, ...drawings];
  return next.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function getStorageWarning({ drawingBytes, projectBytes, estimate }) {
  if (projectBytes > PROJECT_LIMITS.projectWarningBytes) {
    return `Storage warning: project is ${formatBytes(projectBytes)}`;
  }
  if (drawingBytes > PROJECT_LIMITS.largePdfBytes) {
    return `Large PDF saved: ${formatBytes(drawingBytes)}`;
  }
  if (estimate?.quota && estimate?.usage) {
    const freeBytes = estimate.quota - estimate.usage;
    if (freeBytes < PROJECT_LIMITS.largePdfBytes) {
      return `Storage low: ${formatBytes(freeBytes)} free`;
    }
  }
  return "";
}

export function getStorageErrorMessage(error) {
  if (error?.name === "QuotaExceededError") {
    return "Local storage quota exceeded. Delete drawings or use a smaller PDF before saving.";
  }
  return `Local project save failed: ${error?.message || "unknown storage error"}`;
}

export function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function setMetadataValue(setMetadata, key, value) {
  setMetadata((current) => ({ ...current, [key]: value }));
}

function multiplyTransforms(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function normalizedVector(x, y, fallbackX, fallbackY) {
  const length = Math.hypot(x, y);
  if (!length) return [fallbackX, fallbackY];
  return [x / length, y / length];
}

function getTransformedTextBounds(transform, width, height) {
  const [advanceX, advanceY] = normalizedVector(transform[0], transform[1], 1, 0);
  const [heightX, heightY] = normalizedVector(transform[2], transform[3], advanceY, -advanceX);
  const baseline = [transform[4], transform[5]];
  const advance = [advanceX * width, advanceY * width];
  const ascent = [heightX * height, heightY * height];
  const corners = [
    baseline,
    [baseline[0] + advance[0], baseline[1] + advance[1]],
    [baseline[0] + advance[0] + ascent[0], baseline[1] + advance[1] + ascent[1]],
    [baseline[0] + ascent[0], baseline[1] + ascent[1]],
  ];

  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return {
    left: minX,
    top: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

export function mapTextItem(item, index, viewport, zoom) {
  const text = item.str?.trim();
  if (!text) return null;

  const transform = multiplyTransforms(viewport.transform, item.transform);
  const left = transform[4];
  const baselineY = transform[5];
  const rawHeight = Math.abs(item.height || item.transform[3] || 8) * zoom;
  const height = Math.max(7, rawHeight);
  const width = item.width
    ? Math.max(4, Math.abs(item.width) * zoom)
    : Math.max(4, text.length * height * 0.45);
  const fontSize = Math.max(6, height * 0.94);
  const angle = Math.atan2(transform[1] ?? 0, transform[0] ?? 1);
  const bounds = getTransformedTextBounds(transform, width, height);

  return {
    id: `${index}-${text}-${Math.round(left)}-${Math.round(baselineY)}`,
    text,
    left,
    top: baselineY - height,
    width,
    height,
    fontSize,
    angle,
    bounds,
  };
}

/**
 * Axis-aligned screen bounds for a (possibly rotated) text item.
 * `left/top/width/height` describe the item's box before rotation, pivoting
 * around its bottom-left corner (matching CSS `transform-origin: left bottom`).
 * Used to size an upright highlight/hit-target that still fully encloses
 * rotated dimension text, without rotating the box itself.
 */
export function getAxisAlignedBounds({ left, top, width, height, angle }) {
  if (!angle) return { left, top, width, height };

  const pivotX = left;
  const pivotY = top + height;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [0, 0],
    [width, 0],
    [width, -height],
    [0, -height],
  ].map(([dx, dy]) => [pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos]);

  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return {
    left: minX,
    top: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

export function getTextItemBounds(item) {
  return item?.bounds || getAxisAlignedBounds(item);
}

export function metadataLabel(key) {
  const labels = {
    drawingNo: "Drawing No",
    revision: "Rev",
    supplier: "Supplier",
    description: "Description",
  };
  return labels[key] || key;
}

export function fieldLabel(key) {
  const labels = {
    nominal: "Requirement",
    tolerance: "Tolerance",
    notes: "Notes",
  };
  return labels[key] || key;
}

export function getNormalizedPoint(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

export function normalizeRect(startX, startY, endX, endY) {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function getDefaultBalloonPosition(target, leaderScale = 1) {
  const xDirection = target.x > 1 - BALLOON_MARGIN - BALLOON_OFFSET.x ? -1 : 1;
  const yDirection = target.y < BALLOON_MARGIN + Math.abs(BALLOON_OFFSET.y) ? 1 : -1;
  return {
    x: clamp(target.x + BALLOON_OFFSET.x * leaderScale * xDirection, BALLOON_MARGIN, 1 - BALLOON_MARGIN),
    y: clamp(target.y + Math.abs(BALLOON_OFFSET.y) * leaderScale * yDirection, BALLOON_MARGIN, 1 - BALLOON_MARGIN),
  };
}

export function getLeaderLine({
  x,
  y,
  targetX,
  targetY,
  radius = 13,
  arrowLength = 7,
  arrowWidth = 2.8,
}) {
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  if (distance < radius + arrowLength + 1) {
    return {
      startX: x,
      startY: y,
      endX: targetX,
      endY: targetY,
      arrow: null,
    };
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const nx = -uy;
  const ny = ux;

  const tipX = targetX;
  const tipY = targetY;

  const baseX = tipX - ux * arrowLength;
  const baseY = tipY - uy * arrowLength;

  const leftX = baseX + nx * arrowWidth;
  const leftY = baseY + ny * arrowWidth;
  const rightX = baseX - nx * arrowWidth;
  const rightY = baseY - ny * arrowWidth;

  return {
    startX: x + ux * radius,
    startY: y + uy * radius,
    endX: baseX,
    endY: baseY,
    arrow: {
      tip: { x: tipX, y: tipY },
      base: { x: baseX, y: baseY },
      left: { x: leftX, y: leftY },
      right: { x: rightX, y: rightY },
      polygonPoints: `${tipX.toFixed(1)},${tipY.toFixed(1)} ${leftX.toFixed(1)},${leftY.toFixed(1)} ${rightX.toFixed(1)},${rightY.toFixed(1)}`,
    },
  };
}

const REPEAT_PREFIX = /^(\d+(?:[.,]\d+)?|[.,]\d+)\s*[xX×]/;

export function getDimensionCaptureError(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const prefix = value.match(REPEAT_PREFIX);
  if (!prefix) return "";
  if (!isValidOccurrenceQuantity(Number(prefix[1].replace(",", ".")))) {
    return `Quantity must be a whole number from 1 to ${MAX_OCCURRENCE_QUANTITY}. Enter the requirement and quantity manually.`;
  }
  return parseDimension(value) ? "" : "Unsupported repeated dimension. Enter the requirement and quantity manually; the repeat count was not captured as nominal.";
}

export const MM_PER_INCH = 25.4;

export function convertLinearValue(value, fromUnit, toUnit, decimals = null) {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(num)) return null;

  const from = String(fromUnit || "").toUpperCase();
  const to = String(toUnit || "").toUpperCase();
  if (from === to) return num;

  let converted;
  let defaultDecimals;
  if (from === "MM" && to === "IN") {
    converted = num / MM_PER_INCH;
    defaultDecimals = 4;
  } else if (from === "IN" && to === "MM") {
    converted = num * MM_PER_INCH;
    defaultDecimals = 3;
  } else {
    return num;
  }

  const dec = decimals ?? defaultDecimals;
  return Number(converted.toFixed(dec));
}

export function convertToleranceString(toleranceStr, fromUnit, toUnit) {
  const tol = String(toleranceStr || "").trim();
  if (!tol || tol === "MAX" || tol === "MIN") return tol;

  const from = String(fromUnit || "").toUpperCase();
  const to = String(toUnit || "").toUpperCase();
  if (from === to) return tol;

  const decimals = to === "IN" ? 4 : 3;

  if (tol.startsWith("±")) {
    const val = parseFloat(tol.slice(1));
    if (!Number.isFinite(val)) return tol;
    const conv = convertLinearValue(val, from, to, decimals);
    return `±${conv}`;
  }

  const parts = tol.split("/");
  if (parts.length === 2) {
    const p1 = parseFloat(parts[0]);
    const p2 = parseFloat(parts[1]);
    if (Number.isFinite(p1) && Number.isFinite(p2)) {
      const c1 = convertLinearValue(p1, from, to, decimals);
      const c2 = convertLinearValue(p2, from, to, decimals);
      const sign1 = c1 >= 0 ? `+${c1}` : `${c1}`;
      const sign2 = c2 > 0 ? `-${c2}` : `${c2}`;
      return `${sign1}/${sign2}`;
    }
  }

  const single = parseFloat(tol);
  if (Number.isFinite(single)) {
    const conv = convertLinearValue(single, from, to, decimals);
    return conv >= 0 ? `+${conv}` : `${conv}`;
  }

  return tol;
}

export function isDualDimensionConsistent(primary, secondary, epsilon = 0.02) {
  if (!primary || !secondary) return { consistent: true };
  const pNom = parseFloat(primary.nominal);
  const sNom = parseFloat(secondary.nominal);
  if (!Number.isFinite(pNom) || !Number.isFinite(sNom)) return { consistent: true };

  const pUnit = String(primary.unit || "MM").toUpperCase();
  const sUnit = String(secondary.unit || (pUnit === "MM" ? "IN" : "MM")).toUpperCase();

  const expectedSecNom = convertLinearValue(pNom, pUnit, sUnit);
  const diff = Math.abs(expectedSecNom - sNom);
  const consistent = diff <= epsilon;

  return {
    consistent,
    expectedSecondaryNominal: expectedSecNom,
    difference: Number(diff.toFixed(4)),
  };
}

/**
 * Convert an angular callout string (degrees, minutes, seconds) to decimal degrees.
 * Handles:
 *  - "45° 30' 36\"" -> 45.51
 *  - "45° 30'" -> 45.5
 *  - "45°" -> 45
 *  - "30'" -> 0.5
 *  - "30\"" -> 0.008333...
 *  - "45.5°" or "45.5" -> 45.5
 *  - "±15'" -> 0.25
 *  - "+15'" -> 0.25
 *  - "-15'" -> -0.25
 *  - "45° 30' MAX" -> 45.5
 *
 * @param {string|number} value
 * @returns {number|null} Decimal degrees, or null if unparseable
 */
export function parseAngleToDecimal(value) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;

  const clean = s
    .replace(/[′']/g, "'")
    .replace(/[″“”]|''/g, '"')
    .replace(/,/g, ".");

  let sign = 1;
  let text = clean;
  if (text.startsWith("±") || text.startsWith("+/-") || text.startsWith("+/ -")) {
    text = text.replace(/^(?:±|\+\s*[/\\-]\s*-|\+\s*-\s*)/, "").trim();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trim();
  } else if (text.startsWith("-")) {
    sign = -1;
    text = text.slice(1).trim();
  }

  text = text.replace(/\s*(?:MAX|MIN)$/i, "").trim();

  const hasDms = /[°'"]|deg|min|sec/i.test(text);
  if (!hasDms) {
    const numMatch = text.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)/);
    if (!numMatch) return null;
    return sign * Number(numMatch[0]);
  }

  let deg = 0;
  let min = 0;
  let sec = 0;
  let matched = false;

  const degMatch = text.match(/(\d+(?:\.\d+)?|\.\d+)\s*(?:°|deg)/i);
  if (degMatch) {
    deg = parseFloat(degMatch[1]);
    matched = true;
  }

  const minMatch = text.match(/(\d+(?:\.\d+)?|\.\d+)\s*(?:'|min)/i);
  if (minMatch) {
    min = parseFloat(minMatch[1]);
    matched = true;
  }

  const secMatch = text.match(/(\d+(?:\.\d+)?|\.\d+)\s*(?:"|sec)/i);
  if (secMatch) {
    sec = parseFloat(secMatch[1]);
    matched = true;
  }

  if (!matched) {
    const numMatch = text.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)/);
    if (!numMatch) return null;
    return sign * Number(numMatch[0]);
  }

  const result = deg + min / 60 + sec / 3600;
  return sign * result;
}

/**
 * Format decimal degrees into standard Degrees-Minutes-Seconds (DMS) notation.
 * e.g.
 *  - 45.5 -> "45° 30'"
 *  - 45.51, true -> "45° 30' 36\""
 *  - 45.0 -> "45°"
 *
 * @param {number|string} decimalDeg
 * @param {boolean} includeSeconds
 * @returns {string}
 */
export function formatDecimalToDms(decimalDeg, includeSeconds = false) {
  if (decimalDeg === null || decimalDeg === undefined || !Number.isFinite(Number(decimalDeg))) {
    return "";
  }
  const val = Number(decimalDeg);
  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const remMinutes = (abs - deg) * 60;

  if (!includeSeconds) {
    const min = Math.round(remMinutes);
    if (min === 60) {
      return `${sign}${deg + 1}°`;
    }
    return min === 0 ? `${sign}${deg}°` : `${sign}${deg}° ${min}'`;
  }

  const min = Math.floor(remMinutes);
  const sec = Math.round((remMinutes - min) * 60);
  let finalMin = min;
  let finalDeg = deg;
  let finalSec = sec;
  if (finalSec === 60) {
    finalSec = 0;
    finalMin += 1;
  }
  if (finalMin === 60) {
    finalMin = 0;
    finalDeg += 1;
  }

  const parts = [`${sign}${finalDeg}°`];
  if (finalMin > 0 || finalSec > 0) {
    parts.push(`${finalMin}'`);
  }
  if (finalSec > 0) {
    parts.push(`${finalSec}"`);
  }
  return parts.join(" ");
}

function normalizeDecimal(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/^([+-]?)\./, "$10.");
}

function isValidAngleTolerancePart(str) {
  if (!str) return false;
  const s = str.trim();
  return (
    /^(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:\s*°)?(?:\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*')?(?:\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*")?$/.test(s) ||
    /^(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*'(?:\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*")?$/.test(s) ||
    /^(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*"$/.test(s)
  );
}

function parseSingleDimensionCore(coreText) {
  if (!coreText) return null;
  const s = coreText.trim();

  // Strip common dimension prefixes: ø/Ø/∅ (diameter), R/r (radius), M/m (metric thread)
  const core = s
    .replace(/^[øØ∅]\s*/, "")
    .replace(/^[Rr](?=\d|\.\d)/, "")
    .replace(/^[Mm](?=\d)/, "")
    .trim();

  // Check for DMS angle dimension:
  // e.g. "45° 30' 36" ±18"", "45° 30' ±15'", "45° 30' MAX", "45° 30'", "45° ±15'", "30' ±5'"
  const normalizedCore = core
    .replace(/[′']/g, "'")
    .replace(/[″“”]|''/g, '"');

  const dmsMatch = normalizedCore.match(
    /^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*°(?:\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*')?(?:\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*")?|[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*'(?:\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*")?)/
  );

  if (dmsMatch) {
    const rawNominal = dmsMatch[0].trim();
    const after = normalizedCore.slice(dmsMatch[0].length).trim();
    const hasMinOrSec = /['"]/.test(rawNominal);
    const nominal = hasMinOrSec
      ? rawNominal.replace(/\s+/g, " ")
      : normalizeDecimal(rawNominal.replace(/°\s*$/, "").trim());

    const res = { nominal, unit: "°" };

    if (!after) return { ...res, tolerance: "" };

    // MAX / MIN suffix
    if (/^max$/i.test(after)) return { ...res, tolerance: "MAX" };
    if (/^min$/i.test(after)) return { ...res, tolerance: "MIN" };

    // Symmetric tolerance: ±15', ±0° 15', ±30", ±0.5°, +/- 15'
    const symMatch = after.match(/^(?:[±]|\+\s*[/\\-]\s*-|\+\s*-\s*)(.+)$/);
    if (symMatch) {
      const tolPart = symMatch[1].trim();
      if (isValidAngleTolerancePart(tolPart)) {
        return { ...res, tolerance: `±${tolPart.replace(/\s+/g, " ")}` };
      }
      return null;
    }

    // Asymmetric tolerance: +15'/-5', +0° 30' / -0° 15', +10'/-5', +0.5°/-0.2°
    const asymMatch = after.match(/^(\+\s*.+?)\s*[/]\s*(-\s*.+)$/);
    if (asymMatch) {
      const p1 = asymMatch[1].replace(/^\+\s*/, "").trim();
      const p2 = asymMatch[2].replace(/^-\s*/, "").trim();
      if (isValidAngleTolerancePart(p1) && isValidAngleTolerancePart(p2)) {
        return { ...res, tolerance: `+${p1.replace(/\s+/g, " ")}/-${p2.replace(/\s+/g, " ")}` };
      }
      return null;
    }

    // Dual signed: +15'/+5', -5'/-15'
    const dualSignMatch = after.match(/^([+-]\s*.+?)\s*[/]\s*([+-]\s*.+)$/);
    if (dualSignMatch) {
      const s1 = dualSignMatch[1].trim().charAt(0);
      const s2 = dualSignMatch[2].trim().charAt(0);
      const p1 = dualSignMatch[1].slice(1).trim();
      const p2 = dualSignMatch[2].slice(1).trim();
      if (isValidAngleTolerancePart(p1) && isValidAngleTolerancePart(p2)) {
        return { ...res, tolerance: `${s1}${p1.replace(/\s+/g, " ")}/${s2}${p2.replace(/\s+/g, " ")}` };
      }
      return null;
    }

    // Unilateral tolerance: +15', -10'
    const uniMatch = after.match(/^([+-])\s*(.+)$/);
    if (uniMatch) {
      const sign = uniMatch[1];
      const p = uniMatch[2].trim();
      if (isValidAngleTolerancePart(p)) {
        return { ...res, tolerance: `${sign}${p.replace(/\s+/g, " ")}` };
      }
      return null;
    }

    return null;
  }

  // Must start with a number (possibly signed)
  const nominalMatch = core.match(/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))/);
  if (!nominalMatch) return null;

  const nominal = normalizeDecimal(nominalMatch[1]);
  const suffix = core.slice(nominalMatch[0].length).trim();
  const res = { nominal, ...(suffix.startsWith("°") ? { unit: "°" } : {}) };
  const after = suffix.replace(/^°\s*/, "").trim();

  // MAX / MIN suffix
  if (/^max$/i.test(after)) return { ...res, tolerance: "MAX" };
  if (/^min$/i.test(after)) return { ...res, tolerance: "MIN" };

  // Symmetric: ±0.5 or +/-0.5 or +/- 0.5 or +-0.5
  const symMatch = after.match(/^(?:[±]|\+\s*[/\\]\s*-\s*|\+\s*-\s*)((?:\d+(?:[.,]\d+)?|[.,]\d+))$/);
  if (symMatch) return { ...res, tolerance: `±${normalizeDecimal(symMatch[1])}` };

  // Asymmetric: +0.5/-0.2 or +0.5 / -0.2 or +0.5-0.2
  const asymMatch = after.match(/^(\+\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*[/]?\s*(-\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))$/);
  if (asymMatch) {
    const pos = normalizeDecimal(asymMatch[1]);
    const neg = normalizeDecimal(asymMatch[2]);
    return { ...res, tolerance: `${pos}/${neg}` };
  }

  // Dual signed: +0.05/+0.01 or -0.01/-0.05
  const dualSignMatch = after.match(/^([+-]\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*[/]\s*([+-]\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))$/);
  if (dualSignMatch) {
    const v1 = normalizeDecimal(dualSignMatch[1]);
    const v2 = normalizeDecimal(dualSignMatch[2]);
    return { ...res, tolerance: `${v1}/${v2}` };
  }

  // Unilateral: +0.05 or -0.05
  const uniMatch = after.match(/^([+-]\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))$/);
  if (uniMatch) {
    return { ...res, tolerance: normalizeDecimal(uniMatch[1]) };
  }

  // If there is any leftover unparsed text, it is not a valid dimension
  if (after.length > 0) return null;

  return { ...res, tolerance: "" };
}

export function parseDimension(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  // Only an entire leading quantity + dimension is a suggestion. Products and
  // thread-pitch expressions remain ambiguous and require manual quantity.
  let repeat = s.match(
    /^(\d+)\s*[xX×]\s*((?:[øØ∅Rr]\s*)?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:\s*\[.*?\])?(?:\s*°)?(?:\s*(?:MAX|MIN|(?:±|\+\s*[/\\]?\s*-)\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)|\+\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*\/?\s*-\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)))?(?:\s*\[.*?\])?)$/i,
  );
  if (!repeat) {
    const dmsRepeat = s.match(/^(\d+)\s*[xX×]\s*(.+[°'′].*)$/i);
    if (dmsRepeat) {
      repeat = dmsRepeat;
    }
  }
  // Never fall through to reading a rejected repeat count as the nominal value.
  if (REPEAT_PREFIX.test(s) && (!repeat || !isValidOccurrenceQuantity(Number(repeat[1])))) return null;
  const quantity = repeat ? Number(repeat[1]) : 1;
  const withoutRepeat = (repeat ? repeat[2] : s).trim();

  // Check for bracketed dual dimensions: "[...]"
  const bracketMatches = [...withoutRepeat.matchAll(/\[(.*?)\]/g)];
  if (bracketMatches.length > 0) {
    const bracketParts = bracketMatches.map((m) => m[1].trim()).filter(Boolean);
    const primaryClean = withoutRepeat.replace(/\[.*?\]/g, " ").replace(/\s+/g, " ").trim();
    const primaryParsed = parseSingleDimensionCore(primaryClean);

    if (primaryParsed) {
      const secondaryCombined = bracketParts.join(" ").trim();
      const secondaryParsed = parseSingleDimensionCore(secondaryCombined);

      let secTol = secondaryParsed?.tolerance || "";
      if (!secTol && (primaryParsed.tolerance === "MAX" || primaryParsed.tolerance === "MIN")) {
        secTol = primaryParsed.tolerance;
      }

      let primaryUnit = primaryParsed.unit;
      let secondaryUnit = secondaryParsed?.unit;

      if (!primaryUnit && !secondaryUnit && secondaryParsed?.nominal) {
        const vPrim = Math.abs(parseFloat(primaryParsed.nominal));
        const vSec = Math.abs(parseFloat(secondaryParsed.nominal));
        if (vPrim > 0 && vSec > 0) {
          const ratio = vPrim / vSec;
          if (ratio >= 15 && ratio <= 35) {
            primaryUnit = "MM";
            secondaryUnit = "IN";
          } else if (ratio >= 0.025 && ratio <= 0.065) {
            primaryUnit = "IN";
            secondaryUnit = "MM";
          }
        }
      }

      return {
        nominal: primaryParsed.nominal,
        tolerance: primaryParsed.tolerance,
        quantity,
        ...(primaryUnit ? { unit: primaryUnit } : {}),
        dual: secondaryParsed
          ? {
              nominal: secondaryParsed.nominal,
              tolerance: secTol,
              ...(secondaryUnit ? { unit: secondaryUnit } : {}),
            }
          : null,
      };
    }
    return null;
  }

  // Single dimension
  const single = parseSingleDimensionCore(withoutRepeat);
  if (!single) return null;
  return {
    ...single,
    quantity,
    dual: null,
  };
}

export function findNearestTextDimension(point, textItems, canvasSize, radius = 0.075) {
  if (!textItems.length || !canvasSize.width || !canvasSize.height) return null;

  const nearby = textItems
    .map((item) => {
      const bounds = getTextItemBounds(item);
      const cx = (bounds.left + bounds.width / 2) / canvasSize.width;
      const cy = (bounds.top + bounds.height / 2) / canvasSize.height;
      return { item, dist: Math.hypot(cx - point.x, cy - point.y) };
    })
    .filter(({ dist }) => dist <= radius)
    .sort((a, b) => a.dist - b.dist);

  let nominalOnly = null;
  for (const { item } of nearby) {
    const captureError = getDimensionCaptureError(item.text);
    if (captureError) return { captureError };
    const parsed = parseDimension(item.text);
    if (!parsed) continue;
    if (parsed.tolerance) return parsed;
    if (!nominalOnly) nominalOnly = parsed;
  }
  return nominalOnly;
}

/**
 * Find the first dimension candidate whose bounding box contains the given
 * normalized point (0–1 fractions of canvasSize).
 * `padding` is in canvas pixels to make border-clicking easier.
 */
export function findDimensionAtPoint(point, candidates, canvasSize, padding = 6) {
  if (!canvasSize.width || !canvasSize.height || !candidates?.length) return null;
  const px = point.x * canvasSize.width;
  const py = point.y * canvasSize.height;
  return (
    candidates.find((c) => {
      const bounds = getTextItemBounds(c);
      return (
        px >= bounds.left - padding &&
        px <= bounds.left + bounds.width + padding &&
        py >= bounds.top - padding &&
        py <= bounds.top + bounds.height + padding
      );
    }) ?? null
  );
}

/**
 * Find the nearest text item whose bounding box contains (or is closest to)
 * the given normalized point in Text Select mode.
 */
export function findTextItemAtPoint(point, textItems, canvasSize, padding = 8) {
  if (!canvasSize.width || !canvasSize.height || !textItems?.length) return null;
  const px = point.x * canvasSize.width;
  const py = point.y * canvasSize.height;

  const hits = textItems
    .map((item) => {
      const bounds = getTextItemBounds(item);
      const contains =
        px >= bounds.left - padding &&
        px <= bounds.left + bounds.width + padding &&
        py >= bounds.top - padding &&
        py <= bounds.top + bounds.height + padding;
      if (!contains) return null;
      const cx = bounds.left + bounds.width / 2;
      const cy = bounds.top + bounds.height / 2;
      const dist = Math.hypot(cx - px, cy - py);
      return { item, dist };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist);

  return hits[0]?.item ?? null;
}

export function cropCanvasArea(canvas, rect, options = {}) {
  const sourceX = Math.floor(rect.x * canvas.width);
  const sourceY = Math.floor(rect.y * canvas.height);
  const sourceWidth = Math.max(1, Math.floor(rect.width * canvas.width));
  const sourceHeight = Math.max(1, Math.floor(rect.height * canvas.height));
  const scale = options.scale ?? 2;
  const output = document.createElement("canvas");
  output.width = sourceWidth * scale;
  output.height = sourceHeight * scale;
  const context = output.getContext("2d", { willReadFrequently: true });

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    canvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    output.width,
    output.height,
  );

  let preprocessResult = null;
  if (options.preprocess !== false) {
    try {
      const imgData = context.getImageData(0, 0, output.width, output.height);
      preprocessResult = preprocessImageData(imgData, options);
      context.putImageData(imgData, 0, 0);
    } catch {
      // Fallback gracefully if getImageData is not supported in the environment
    }
  }

  return {
    dataUrl: output.toDataURL("image/png"),
    width: output.width,
    height: output.height,
    preprocessResult,
  };
}

/**
 * Parse clipboard text into a 2D matrix of strings.
 * Handles Excel TSV, CSV, and multi-line text.
 *
 * @param {string} text Raw clipboard text
 * @returns {string[][]} 2D array of trimmed cell values
 */
export function parseClipboardGrid(text) {
  if (!text || typeof text !== "string") return [];
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) return [];

  const lines = raw.split("\n");
  const hasTabs = lines.some((line) => line.includes("\t"));
  const hasCommas = !hasTabs && lines.some((line) => line.includes(","));

  const rows = lines.map((line) => {
    let cells;
    if (hasTabs) {
      cells = line.split("\t");
    } else if (hasCommas) {
      cells = line.split(",");
    } else {
      cells = [line];
    }
    return cells.map((cell) => {
      let s = cell.trim();
      if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
        s = s.slice(1, -1).trim();
      }
      return s;
    });
  });

  // Filter out trailing empty rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }

  return rows;
}

/**
 * Compute the batch sample updates from pasting a 2D grid of values into the table.
 *
 * @param {Array} sortedCharacteristics List of characteristics in current display order
 * @param {string} startCharacteristicId ID of the characteristic cell where paste occurred
 * @param {number} startSampleIndex Sample column index (0-based) where paste occurred
 * @param {number} sampleCount Maximum visible sample count in the table
 * @param {string[][]} grid 2D array of values
 * @returns {Record<string, Record<number, string>>} Updates map: { [id]: { [sampleIndex]: value } }
 */
export function computePastedSampleUpdates(
  sortedCharacteristics,
  startCharacteristicId,
  startSampleIndex,
  sampleCount,
  grid,
) {
  if (!Array.isArray(sortedCharacteristics) || !sortedCharacteristics.length) return {};
  if (!Array.isArray(grid) || !grid.length) return {};

  const startIndex = sortedCharacteristics.findIndex((c) => c.id === startCharacteristicId);
  if (startIndex === -1) return {};

  const maxCols = Math.max(1, Number(sampleCount) || 1);
  const updates = {};

  for (let r = 0; r < grid.length; r++) {
    const charIndex = startIndex + r;
    if (charIndex >= sortedCharacteristics.length) break;

    const char = sortedCharacteristics[charIndex];
    const rowValues = grid[r];

    for (let c = 0; c < rowValues.length; c++) {
      const sampleIdx = startSampleIndex + c;
      if (sampleIdx >= maxCols) break;

      const val = rowValues[c];
      if (val !== undefined) {
        if (!updates[char.id]) updates[char.id] = {};
        updates[char.id][sampleIdx] = val;
      }
    }
  }

  return updates;
}

/**
 * Generate sample updates to auto-fill characteristics.
 * If mode is "nominal", fills dimension/GDT with nominal and note/visual with "OK".
 * If mode is "visuals-ok", fills only note/visual characteristics with "OK".
 *
 * @param {Array} characteristics
 * @param {number} sampleCount
 * @param {string} [targetId] Optional ID to fill only one characteristic
 * @param {"nominal" | "visuals-ok"} [mode="nominal"]
 * @param {boolean} [overwrite=false] Whether to overwrite existing measurements
 * @returns {Record<string, Record<number, string>>}
 */
export function computeAutoFillSampleUpdates(
  characteristics,
  sampleCount,
  targetId = null,
  mode = "nominal",
  overwrite = false,
) {
  if (!Array.isArray(characteristics) || !characteristics.length) return {};
  const validCount = Math.max(1, Number(sampleCount) || 1);

  const updates = {};
  const targets = targetId
    ? characteristics.filter((c) => c.id === targetId)
    : characteristics;

  targets.forEach((char) => {
    const isVisualOrNote = char.type === "note" || char.type === "visual";
    if (mode === "visuals-ok" && !isVisualOrNote) return;

    let fillVal;
    if (isVisualOrNote) {
      fillVal = "OK";
    } else {
      fillVal = char.nominal !== null && char.nominal !== undefined && String(char.nominal).trim() !== ""
        ? String(char.nominal).trim()
        : "";
    }
    if (!fillVal) return;

    for (let s = 0; s < validCount; s++) {
      const existing = char.samples?.[s];
      if (overwrite || existing === undefined || existing === "") {
        if (!updates[char.id]) updates[char.id] = {};
        updates[char.id][s] = fillVal;
      }
    }
  });

  return updates;
}
