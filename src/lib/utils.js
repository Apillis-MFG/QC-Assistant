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

function normalizeDecimal(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/^([+-]?)\./, "$10.");
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
  const repeat = s.match(
    /^(\d+)\s*[xX×]\s*((?:[øØ∅Rr]\s*)?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:\s*\[.*?\])?(?:\s*°)?(?:\s*(?:MAX|MIN|(?:±|\+\s*[/\\]?\s*-)\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)|\+\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*\/?\s*-\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)))?(?:\s*\[.*?\])?)$/i,
  );
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
