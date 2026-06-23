import {
  PANEL_STORAGE_KEY,
  defaultPanelSizes,
  BALLOON_OFFSET,
  BALLOON_MARGIN,
  PROJECT_LIMITS,
} from "./constants.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function loadPanelSizes() {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      splitV: {
        inspectorWidth: Number.isFinite(saved?.splitV?.inspectorWidth)
          ? saved.splitV.inspectorWidth
          : defaultPanelSizes.splitV.inspectorWidth,
        tableHeight: Number.isFinite(saved?.splitV?.tableHeight)
          ? saved.splitV.tableHeight
          : defaultPanelSizes.splitV.tableHeight,
      },
      splitH: {
        drawingWidth: Number.isFinite(saved?.splitH?.drawingWidth)
          ? saved.splitH.drawingWidth
          : defaultPanelSizes.splitH.drawingWidth,
        inspectorHeight: Number.isFinite(saved?.splitH?.inspectorHeight)
          ? saved.splitH.inspectorHeight
          : defaultPanelSizes.splitH.inspectorHeight,
      },
    };
  } catch {
    return defaultPanelSizes;
  }
}

export function createCharacteristic({ balloonNo, x = 0.5, y = 0.5, targetX = x, targetY = y, page = 1, seed = {} }) {
  return {
    id: crypto.randomUUID(),
    balloonNo,
    page,
    x,
    y,
    targetX: seed.targetX ?? targetX,
    targetY: seed.targetY ?? targetY,
    type: seed.type ?? "dimension",
    unit: seed.unit ?? "MM",
    nominal: seed.nominal ?? "",
    tolerance: seed.tolerance ?? "",
    method: seed.method ?? "DC",
    notes: seed.notes ?? "",
    samples: seed.samples ?? {},
  };
}

export function buildDrawingSnapshot({
  drawing,
  activeDrawingId,
  activeProjectId,
  metadata,
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

export function mapTextItem(item, index, viewport, zoom) {
  const text = item.str?.trim();
  if (!text) return null;

  const [left, baselineY] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
  const rawHeight = Math.abs(item.height || item.transform[3] || 8) * zoom;
  const height = Math.max(7, rawHeight);
  const width = item.width
    ? Math.max(4, Math.abs(item.width) * zoom)
    : Math.max(4, text.length * height * 0.45);
  const fontSize = Math.max(6, height * 0.94);
  const angle = Math.atan2(item.transform[1] || 0, item.transform[0] || 1);

  return {
    id: `${index}-${item.transform.join(",")}`,
    text,
    left,
    top: baselineY - height,
    width,
    height,
    fontSize,
    angle,
  };
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

export function getDefaultBalloonPosition(target) {
  const xDirection = target.x > 1 - BALLOON_MARGIN - BALLOON_OFFSET.x ? -1 : 1;
  const yDirection = target.y < BALLOON_MARGIN + Math.abs(BALLOON_OFFSET.y) ? 1 : -1;
  return {
    x: clamp(target.x + BALLOON_OFFSET.x * xDirection, BALLOON_MARGIN, 1 - BALLOON_MARGIN),
    y: clamp(target.y + Math.abs(BALLOON_OFFSET.y) * yDirection, BALLOON_MARGIN, 1 - BALLOON_MARGIN),
  };
}

export function cropCanvasArea(canvas, rect, scale = 2) {
  const sourceX = Math.floor(rect.x * canvas.width);
  const sourceY = Math.floor(rect.y * canvas.height);
  const sourceWidth = Math.max(1, Math.floor(rect.width * canvas.width));
  const sourceHeight = Math.max(1, Math.floor(rect.height * canvas.height));
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

export function nextBalloonNo(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.balloonNo) || 0), 0) + 1;
}

export function renumber(items) {
  return items
    .slice()
    .sort((a, b) => a.balloonNo - b.balloonNo)
    .map((item, index) => ({ ...item, balloonNo: index + 1 }));
}

export function computeLeaderLine(x, y, targetX, targetY, startOffset, endGap) {
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  if (distance <= startOffset + endGap) return null;
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    startX: x + ux * startOffset,
    startY: y + uy * startOffset,
    endX: targetX - ux * endGap,
    endY: targetY - uy * endGap,
  };
}
