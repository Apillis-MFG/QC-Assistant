import { BALLOON_OFFSET, BALLOON_MARGIN } from "./constants.js";
import { PROJECT_LIMITS } from "./projectStore.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function buildDrawingSnapshot({
  drawing,
  activeDrawingId,
  activeProjectId,
  metadata,
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
  const angle = Math.atan2(transform[1] || 0, transform[0] || 1);
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

export function parseDimension(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  // Strip "Nx" quantity prefix before a value: "2x10.0" → "10.0", "4xR25" → "R25"
  // Matches an integer followed by x/X/× and then a digit or type prefix.
  const withoutRepeat = s.replace(/^\d+\s*[xX×]\s*(?=[øØ∅RrMm\d])/i, "");

  // Strip common dimension prefixes: ø/Ø/∅ (diameter), R/r (radius), M/m (metric thread)
  const core = withoutRepeat
    .replace(/^[øØ∅]\s*/, "")
    .replace(/^[Rr](?=\d)/, "")
    .replace(/^[Mm](?=\d)/, "");

  // Must start with a number (possibly signed)
  const nominalMatch = core.match(/^([+-]?\d+(?:[.,]\d+)?)/);
  if (!nominalMatch) return null;

  const nominal = nominalMatch[1].replace(",", ".");
  const after = core.slice(nominalMatch[0].length).trim();

  // MAX / MIN suffix
  if (/^max\b/i.test(after)) return { nominal, tolerance: "MAX" };
  if (/^min\b/i.test(after)) return { nominal, tolerance: "MIN" };

  // Symmetric: ±0.5  or  +/-0.5  or  +/- 0.5  or  +-0.5
  const symMatch = after.match(/^(?:[±]|\+\s*[/\\]\s*-\s*|\+\s*-\s*)(\d+(?:[.,]\d+)?)/);
  if (symMatch) return { nominal, tolerance: `±${symMatch[1].replace(",", ".")}` };

  // Asymmetric: +0.5/-0.2  or  +0.5 / -0.2  or  +0.5-0.2
  const asymMatch = after.match(/^(\+\s*\d+(?:[.,]\d+)?)\s*[/]?\s*(-\s*\d+(?:[.,]\d+)?)/);
  if (asymMatch) {
    const pos = asymMatch[1].replace(/\s+/g, "").replace(",", ".");
    const neg = asymMatch[2].replace(/\s+/g, "").replace(",", ".");
    return { nominal, tolerance: `${pos}/${neg}` };
  }

  return { nominal, tolerance: "" };
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
  return candidates.find(
    (c) =>
      px >= c.left - padding &&
      px <= c.left + c.width + padding &&
      py >= c.top - padding &&
      py <= c.top + c.height + padding,
  ) ?? null;
}

export function cropCanvasArea(canvas, rect) {
  const sourceX = Math.floor(rect.x * canvas.width);
  const sourceY = Math.floor(rect.y * canvas.height);
  const sourceWidth = Math.max(1, Math.floor(rect.width * canvas.width));
  const sourceHeight = Math.max(1, Math.floor(rect.height * canvas.height));
  const scale = 2;
  const output = document.createElement("canvas");
  output.width = sourceWidth * scale;
  output.height = sourceHeight * scale;
  const context = output.getContext("2d");

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

  return {
    dataUrl: output.toDataURL("image/png"),
    width: output.width,
    height: output.height,
  };
}
