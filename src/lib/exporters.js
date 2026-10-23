import { balloonLabel, compareOccurrences, missingOccurrences, resizeOccurrences, assertOccurrenceQuantity } from "./occurrences.js";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import * as XLSX from "xlsx";

const red = rgb(1, 0, 0);
const black = rgb(0.08, 0.09, 0.11);

const BALLOON_STANDARD_FONTS = {
  "Times New Roman": StandardFonts.TimesRomanBold,
  Arial: StandardFonts.HelveticaBold,
  Courier: StandardFonts.CourierBold,
};

function hexToRgbColor(hex) {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex || "");
  if (!match) return black;
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
  return rgb(r, g, b);
}

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).replace(",", ".").match(/-?(?:\d+(?:\.\d+)?|\.\d+)/);
  return match ? Number(match[0]) : null;
}

export function getLimits(characteristic) {
  if (!characteristic) return { usl: "", lsl: "" };
  if (characteristic.type === "note" || characteristic.type === "visual") {
    return { usl: "", lsl: "" };
  }

  const nomStr = String(characteristic.nominal ?? "").trim();
  const tolStr = String(characteristic.tolerance ?? "").trim();
  const nomUpper = nomStr.toUpperCase();
  const tolUpper = tolStr.toUpperCase();

  const nominalNum = parseNumber(characteristic.nominal);
  const tolNum = parseNumber(characteristic.tolerance);

  // 1. Single limit MAX (e.g. "25 MAX" in nominal, "MAX" in tolerance, or "3 MAX" in tolerance)
  if (tolUpper.includes("MAX") || nomUpper.includes("MAX")) {
    if (tolUpper.includes("MAX") && tolNum !== null) {
      return { usl: tolNum, lsl: "" };
    }
    if (nominalNum !== null) {
      return { usl: nominalNum, lsl: "" };
    }
    return { usl: "", lsl: "" };
  }

  // 2. Single limit MIN (e.g. "0.5 MIN" in nominal, "MIN" in tolerance, or "0.5 MIN" in tolerance)
  if (tolUpper.includes("MIN") || nomUpper.includes("MIN")) {
    if (tolUpper.includes("MIN") && tolNum !== null) {
      return { usl: "", lsl: tolNum };
    }
    if (nominalNum !== null) {
      return { usl: "", lsl: nominalNum };
    }
    return { usl: "", lsl: "" };
  }

  // Without a valid nominal number, symmetric or offset tolerances cannot compute limits.
  if (nominalNum === null) {
    return { usl: "", lsl: "" };
  }

  // 3. Two signed offsets (asymmetric bilateral): e.g. "+0.5/-0.2", "+0.05 / -0", "-0.02/+0.05", "+0.05/+0.01", "-0.01/-0.05"
  const dualMatch = tolStr.match(
    /^([+-]\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*[/,\s]\s*([+-]?\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))$/,
  ) || tolStr.match(
    /^([+-]?\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*[/,\s]\s*([+-]\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))$/,
  );

  if (dualMatch) {
    const parseSigned = (str) => {
      const clean = str.replace(/\s+/g, "").replace(",", ".");
      return parseFloat(clean);
    };
    const offset1 = parseSigned(dualMatch[1]);
    const offset2 = parseSigned(dualMatch[2]);
    if (!Number.isNaN(offset1) && !Number.isNaN(offset2)) {
      const upperOffset = Math.max(offset1, offset2);
      const lowerOffset = Math.min(offset1, offset2);
      return {
        usl: round(nominalNum + upperOffset),
        lsl: round(nominalNum + lowerOffset),
      };
    }
  }

  // 4. Unilateral single signed offset without slash (e.g. "+0.05" or "-0.02")
  const isExplicitSymmetric = /^(?:[±]|\+\s*[/\\-]\s*-|\+\s*-\s*)/.test(tolStr);
  const unilateralPlus = !isExplicitSymmetric && /^\+\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(tolStr);
  const unilateralMinus = !isExplicitSymmetric && /^-\s*(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(tolStr);

  if (unilateralPlus && tolNum !== null) {
    return {
      usl: round(nominalNum + Math.abs(tolNum)),
      lsl: nominalNum,
    };
  }
  if (unilateralMinus && tolNum !== null) {
    return {
      usl: nominalNum,
      lsl: round(nominalNum - Math.abs(tolNum)),
    };
  }

  // 5. Symmetric tolerance (e.g. "±0.13", "+/-0.13", or numeric "0.13")
  if (tolNum === null) {
    return { usl: "", lsl: "" };
  }

  const absTol = Math.abs(tolNum);
  return {
    usl: round(nominalNum + absTol),
    lsl: round(nominalNum - absTol),
  };
}

export function getStatus(characteristic, sampleCount) {
  if (!characteristic || !sampleCount || sampleCount <= 0) return "OPEN";
  const samples = characteristic.samples || {};
  const values = Array.from({ length: sampleCount }, (_, index) => samples[index] ?? "");
  if (values.every((value) => value === "")) return "OPEN";

  if (characteristic.type === "note" || characteristic.type === "visual") {
    if (values.some((v) => v !== "" && String(v).toUpperCase() !== "OK")) return "NG";
    if ((characteristic.quantity || 1) > 1 && !characteristic.instancesExpanded) return "OPEN";
    if (values.every((v) => String(v).toUpperCase() === "OK")) return "OK";
    return "OPEN";
  }

  const { usl, lsl } = getLimits(characteristic);
  const hasNumericLimits = usl !== "" || lsl !== "";
  if (!hasNumericLimits) return "OPEN";

  const failed = values.some((value) => {
    if (value === "") return false;
    const n = parseNumber(value);
    if (n === null) return true;
    if (usl !== "" && n > Number(usl) + 1e-9) return true;
    if (lsl !== "" && n < Number(lsl) - 1e-9) return true;
    return false;
  });

  if (failed) return "NG";
  if ((characteristic.quantity || 1) > 1 && !characteristic.instancesExpanded) return "OPEN";
  return values.every((value) => value !== "") ? "OK" : "OPEN";
}

export function mapRelativeCoordinatesToPdf({ x, y, width, height, rotation = 0 }) {
  const rot = ((rotation % 360) + 360) % 360;
  const u = Math.min(1, Math.max(0, Number(x) || 0));
  const v = Math.min(1, Math.max(0, Number(y) || 0));

  let pdfX;
  let pdfY;

  switch (rot) {
    case 90:
      pdfX = v * width;
      pdfY = u * height;
      break;
    case 180:
      pdfX = (1 - u) * width;
      pdfY = v * height;
      break;
    case 270:
      pdfX = (1 - v) * width;
      pdfY = (1 - u) * height;
      break;
    case 0:
    default:
      pdfX = u * width;
      pdfY = height - v * height;
      break;
  }

  const textAngle = (360 - rot) % 360;
  return { x: pdfX, y: pdfY, rotation: rot, textAngle };
}

export async function generateBalloonedPdf({
  pdfBytes,
  characteristics,
  showLeaderLine = true,
  fontColor = "#000000",
  fontFamily = "Times New Roman",
  fontSize = 11,
  diameter = 24,
}) {
  if (!pdfBytes) throw new Error("Upload a PDF before exporting.");
  characteristics.forEach((item) => assertOccurrenceQuantity(item.quantity ?? 1));

  if (missingOccurrences(characteristics) || characteristics.some((item) => item.isPlaced === false)) {
    throw new Error("Place every required instance before exporting PDF. Create instances or resume placement in the inspector.");
  }

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(BALLOON_STANDARD_FONTS[fontFamily] || StandardFonts.TimesRomanBold);
  const textColor = hexToRgbColor(fontColor);
  const baseRadius = diameter / 2;

  characteristics.forEach((item) => {
    const pageIndex = Math.max(0, Math.min((item.page || 1) - 1, pdfDoc.getPageCount() - 1));
    const page = pdfDoc.getPage(pageIndex);
    const { width, height } = page.getSize();
    const pageRotation = page.getRotation()?.angle || 0;

    const balloonCoords = mapRelativeCoordinatesToPdf({
      x: item.x,
      y: item.y,
      width,
      height,
      rotation: pageRotation,
    });
    const targetCoords = mapRelativeCoordinatesToPdf({
      x: item.targetX ?? item.x,
      y: item.targetY ?? item.y,
      width,
      height,
      rotation: pageRotation,
    });

    const x = balloonCoords.x;
    const y = balloonCoords.y;
    const targetX = targetCoords.x;
    const targetY = targetCoords.y;

    const label = balloonLabel(item);
    const radius = label.length > 3 ? baseRadius * 1.5 : baseRadius;
    const itemFontSize = Math.min(fontSize, (radius * 1.6) / font.widthOfTextAtSize(label, 1));
    const textWidth = font.widthOfTextAtSize(label, itemFontSize);
    const leader = showLeaderLine ? getLeaderGeometry({ x, y, targetX, targetY, radius }) : null;

    if (leader) {
      page.drawLine({
        start: { x: leader.startX, y: leader.startY },
        end: { x: leader.endX, y: leader.endY },
        thickness: 0.7,
        color: red,
      });
    }

    page.drawCircle({
      x,
      y,
      size: radius,
      borderColor: red,
      borderWidth: 1.2,
      color: undefined,
    });

    const textAngle = balloonCoords.textAngle;
    const dx = -textWidth / 2;
    const dy = -itemFontSize / 2 + 1.5;
    const rad = (textAngle * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    page.drawText(label, {
      x: x + rx,
      y: y + ry,
      size: itemFontSize,
      font,
      color: textColor,
      ...(textAngle !== 0 ? { rotate: degrees(textAngle) } : {}),
    });
  });

  return await pdfDoc.save();
}

export async function exportBalloonedPdf({
  pdfBytes,
  characteristics,
  fileName,
  ...options
}) {
  const bytes = await generateBalloonedPdf({ pdfBytes, characteristics, ...options });
  const base = withoutExtension(fileName || "drawing") || "drawing";
  downloadBlob(bytes, "application/pdf", `${base}_ballooned.pdf`);
}

export function buildInspectionWorkbook({ metadata, characteristics = [], sampleCount = 1 }) {
  characteristics.forEach((item) => assertOccurrenceQuantity(item.quantity ?? 1));
  const validSampleCount = Math.max(1, Number.isSafeInteger(sampleCount) && sampleCount > 0 ? sampleCount : 1);
  const meta = metadata || {};
  const rows = [];

  rows.push(["FIRST ARTICLE INSPECTION REPORT"]);
  rows.push([]);
  rows.push(["Part / Drawing No.:", meta.drawingNo || "-", "", "", "Part Description:", meta.description || "-"]);
  rows.push(["Revision:", meta.revision || "-", "", "", "Supplier:", meta.supplier || "-"]);
  rows.push(["Sample Size:", validSampleCount, "", "", "Overall Result:", overallStatus(characteristics, validSampleCount)]);
  rows.push([]);

  const sampleHeaders = Array.from({ length: validSampleCount }, (_, index) => `#${index + 1}`);
  rows.push([
    "ID #",
    "Type",
    "Unit",
    "Nominal",
    "Tolerance",
    "USL",
    "LSL",
    ...sampleHeaders,
    "MIN",
    "MAX",
    "Method",
    "Status",
    "Notes",
  ]);

  // An unconfirmed repeat count still needs every required measurement row.
  const exportRows = characteristics.reduce(
    (items, item) =>
      (item.quantity || 1) > 1 && !item.instancesExpanded
        ? resizeOccurrences(items, item.id, item.quantity)
        : items,
    characteristics,
  );

  exportRows
    .slice()
    .sort(compareOccurrences)
    .forEach((item) => {
      const { usl, lsl } = getLimits(item);
      const values = Array.from({ length: validSampleCount }, (_, index) => item.samples?.[index] ?? "");
      const numericValues = values.map(parseNumber).filter((value) => value !== null);
      rows.push([
        balloonLabel(item),
        item.type,
        item.unit,
        item.nominal,
        item.tolerance,
        usl,
        lsl,
        ...values,
        numericValues.length ? Math.min(...numericValues) : "",
        numericValues.length ? Math.max(...numericValues) : "",
        item.method,
        getStatus(item, validSampleCount),
        item.notes,
      ]);
    });

  rows.push([]);
  rows.push([
    "Measurement Equipments Abbreviation:",
    "CMM = Coordinate Measuring Machine, VMS = Vision Measuring System, HG = Height Gauge, MIC = Micrometer, DC = Digital Caliper, CG = Checking Gauge, PP = Profile Projector, TG = Thickness Gauge, THR = Thread Gauge, PG = Pin Gauge, AG = Angle Gauge, RG = Radius Gauge, VS = Visual Inspection",
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  const totalCols = 7 + validSampleCount + 5;
  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    ...Array.from({ length: validSampleCount }, () => ({ wch: 10 })),
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 36 },
  ];

  const lastCol = Math.max(6, totalCols - 1);
  const legendRowIndex = rows.length - 1;
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } },
    { s: { r: 2, c: 5 }, e: { r: 2, c: lastCol } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },
    { s: { r: 3, c: 5 }, e: { r: 3, c: lastCol } },
    { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } },
    { s: { r: 4, c: 5 }, e: { r: 4, c: lastCol } },
    { s: { r: legendRowIndex, c: 1 }, e: { r: legendRowIndex, c: lastCol } },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "FAI Report");

  return { workbook, worksheet, rows };
}

export function exportInspectionWorkbook({ metadata, characteristics, sampleCount }) {
  const { workbook } = buildInspectionWorkbook({ metadata, characteristics, sampleCount });
  const fileName = `${metadata?.drawingNo || "inspection"}_FAI_Report.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

export function overallStatus(characteristics, sampleCount) {
  if (!characteristics.length) return "OPEN";
  const statuses = characteristics.map((item) => getStatus(item, sampleCount));
  if (statuses.includes("NG")) return "FAIL";
  if (statuses.includes("OPEN") || missingOccurrences(characteristics)) return "OPEN";
  return "PASS";
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function withoutExtension(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function getLeaderGeometry({ x, y, targetX, targetY, radius }) {
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  if (distance < radius + 4) return null;

  const targetGap = 2.4;
  const ux = dx / distance;
  const uy = dy / distance;

  return {
    startX: x + ux * (radius + 1.5),
    startY: y + uy * (radius + 1.5),
    endX: targetX - ux * targetGap,
    endY: targetY - uy * targetGap,
  };
}

function downloadBlob(bytes, type, name) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
