import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";

const red = rgb(1, 0, 0);
const black = rgb(0.08, 0.09, 0.11);

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function getLimits(characteristic) {
  const nominal = parseNumber(characteristic.nominal);
  const tolerance = parseNumber(characteristic.tolerance);
  const text = String(characteristic.tolerance || "").toUpperCase();

  if (nominal === null || tolerance === null) {
    return { usl: "", lsl: "" };
  }

  if (text.includes("MAX")) return { usl: tolerance, lsl: "" };
  if (text.includes("MIN")) return { usl: "", lsl: tolerance };
  return {
    usl: round(nominal + tolerance),
    lsl: round(nominal - tolerance),
  };
}

export function getStatus(characteristic, sampleCount) {
  const values = Array.from({ length: sampleCount }, (_, index) => characteristic.samples[index] ?? "");
  if (values.every((value) => value === "")) return "OPEN";
  if (characteristic.type === "note" || characteristic.type === "visual") {
    if (values.some((v) => v !== "" && String(v).toUpperCase() !== "OK")) return "NG";
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
    if (usl !== "" && n > Number(usl)) return true;
    if (lsl !== "" && n < Number(lsl)) return true;
    return false;
  });

  if (failed) return "NG";
  return values.every((value) => value !== "") ? "OK" : "OPEN";
}

export async function exportBalloonedPdf({ pdfBytes, characteristics, fileName }) {
  if (!pdfBytes) throw new Error("Upload a PDF before exporting.");

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  characteristics.forEach((item) => {
    const pageIndex = Math.max(0, Math.min((item.page || 1) - 1, pdfDoc.getPageCount() - 1));
    const page = pdfDoc.getPage(pageIndex);
    const { width, height } = page.getSize();
    const x = item.x * width;
    const y = height - item.y * height;
    const targetX = (item.targetX ?? item.x) * width;
    const targetY = height - (item.targetY ?? item.y) * height;
    const radius = item.balloonNo > 99 ? 12 : 10;
    const label = String(item.balloonNo);
    const fontSize = item.balloonNo > 99 ? 7.5 : 8.5;
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    const leader = getLeaderGeometry({ x, y, targetX, targetY, radius });

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
    page.drawText(label, {
      x: x - textWidth / 2,
      y: y - fontSize / 2 + 1.5,
      size: fontSize,
      font,
      color: red,
    });
  });

  const bytes = await pdfDoc.save();
  const base = withoutExtension(fileName || "drawing") || "drawing";
  downloadBlob(bytes, "application/pdf", `${base}_ballooned.pdf`);
}

export function exportInspectionWorkbook({ metadata, characteristics, sampleCount }) {
  const rows = [];
  rows.push(["", "", "", "", "FINAL INSPECTION REPORT"]);
  rows.push([]);
  rows.push(["Drawing Name:", metadata.drawingNo, "", "", "", "Description:", metadata.description]);
  rows.push(["Rev", metadata.revision, "", "", "", "Supplier", metadata.supplier]);
  rows.push(["Number of Sample:", sampleCount, "", "", "", "Pass/Fail", overallStatus(characteristics, sampleCount)]);
  rows.push([]);

  const sampleHeaders = Array.from({ length: sampleCount }, (_, index) => `#${index + 1}`);
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

  characteristics
    .slice()
    .sort((a, b) => a.balloonNo - b.balloonNo)
    .forEach((item) => {
      const { usl, lsl } = getLimits(item);
      const values = Array.from({ length: sampleCount }, (_, index) => item.samples[index] ?? "");
      const numericValues = values.map(parseNumber).filter((value) => value !== null);
      rows.push([
        item.balloonNo,
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
        getStatus(item, sampleCount),
        item.notes,
      ]);
    });

  rows.push([]);
  rows.push([
    "Measurement Equipments Abbreviation:",
    "CMM = Coordinate Measuring Machine, VMS = Vision Measuring System, HG = Height Gauge, MIC = Micrometer, DC = Digital Caliper, CG = Checking Gauge, PP = Profile Projector, TG = Thickness Gauge, THR = Thread Gauge, PG = Pin Gauge, AG = Angle Gauge, RG = Radius Gauge, VS = Visual Inspection",
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    ...Array.from({ length: sampleCount }, () => ({ wch: 10 })),
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 38 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "QC FAI");
  XLSX.writeFile(workbook, `${metadata.drawingNo || "inspection"}_QC_FAI.xlsx`);
}

function overallStatus(characteristics, sampleCount) {
  if (!characteristics.length) return "OPEN";
  const statuses = characteristics.map((item) => getStatus(item, sampleCount));
  if (statuses.includes("NG")) return "FAIL";
  if (statuses.includes("OPEN")) return "OPEN";
  return "PASS";
}

function round(value) {
  return Math.round(value * 10000) / 10000;
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
