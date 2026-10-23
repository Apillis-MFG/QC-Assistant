import * as XLSX from "xlsx";
import { balloonLabel, compareOccurrences, resizeOccurrences } from "./occurrences.js";
import { getLimits, getStatus, overallStatus, parseNumber } from "./exporters.js";

/**
 * Standard data schema for an uploaded customer FAI Excel template.
 */
export function normalizeFaiTemplate(template) {
  if (!template) return null;
  const now = new Date().toISOString();

  // If bytes are provided as ArrayBuffer or Uint8Array, preserve them
  let bytes = null;
  let byteLength = 0;
  if (template.bytes) {
    if (template.bytes instanceof Uint8Array) {
      bytes = template.bytes;
      byteLength = template.bytes.byteLength;
    } else if (template.bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(template.bytes);
      byteLength = template.bytes.byteLength;
    } else if (Array.isArray(template.bytes)) {
      bytes = new Uint8Array(template.bytes);
      byteLength = bytes.byteLength;
    }
  } else if (typeof template.byteLength === "number") {
    byteLength = template.byteLength;
  }

  const rawHeaders = template.headers || {};
  const rawTable = template.table || {};
  const rawCols = rawTable.columns || {};

  return {
    schemaVersion: 1,
    name: template.name?.trim() || "Customer_Template.xlsx",
    byteLength,
    bytes,
    worksheet: template.worksheet?.trim() || "",
    headers: {
      drawingNo: cleanCellAddr(rawHeaders.drawingNo),
      revision: cleanCellAddr(rawHeaders.revision),
      supplier: cleanCellAddr(rawHeaders.supplier),
      description: cleanCellAddr(rawHeaders.description),
      sampleCount: cleanCellAddr(rawHeaders.sampleCount),
      overallStatus: cleanCellAddr(rawHeaders.overallStatus),
    },
    table: {
      startRow: Math.max(0, parseInt(rawTable.startRow, 10) || 0),
      endRow: Math.max(0, parseInt(rawTable.endRow, 10) || 0),
      columns: {
        balloonNo: cleanColLetter(rawCols.balloonNo),
        nominal: cleanColLetter(rawCols.nominal),
        tolerance: cleanColLetter(rawCols.tolerance),
        usl: cleanColLetter(rawCols.usl),
        lsl: cleanColLetter(rawCols.lsl),
        type: cleanColLetter(rawCols.type),
        unit: cleanColLetter(rawCols.unit),
        method: cleanColLetter(rawCols.method),
        min: cleanColLetter(rawCols.min),
        max: cleanColLetter(rawCols.max),
        status: cleanColLetter(rawCols.status),
        notes: cleanColLetter(rawCols.notes),
        samples: Array.isArray(rawCols.samples)
          ? rawCols.samples.map(cleanColLetter).filter(Boolean)
          : [],
      },
    },
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || now,
  };
}

function cleanCellAddr(addr) {
  if (typeof addr !== "string") return "";
  return addr.trim().toUpperCase();
}

function cleanColLetter(col) {
  if (typeof col !== "string") return "";
  return col.trim().toUpperCase();
}

export function isValidCellAddress(address) {
  if (typeof address !== "string") return false;
  const clean = address.trim().toUpperCase();
  if (!/^[A-Z]{1,3}[1-9][0-9]*$/.test(clean)) return false;
  const decoded = XLSX.utils.decode_cell(clean);
  return decoded.c >= 0 && decoded.r >= 0;
}

export function isValidColumnLetter(col) {
  if (typeof col !== "string") return false;
  const clean = col.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(clean)) return false;
  const decoded = XLSX.utils.decode_col(clean);
  return decoded >= 0;
}

/**
 * Inspect an uploaded template workbook and extract worksheet details and sample grid.
 */
export function inspectTemplateWorkbook(arrayBufferOrUint8Array) {
  if (!arrayBufferOrUint8Array) {
    throw new Error("No workbook bytes provided for template inspection.");
  }

  const workbook = XLSX.read(arrayBufferOrUint8Array, {
    type: "array",
    cellStyles: true,
    cellFormula: true,
  });

  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) {
    throw new Error("Uploaded workbook contains no worksheets.");
  }

  const sheets = {};
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    const ref = sheet?.["!ref"] || "A1:A1";
    const range = XLSX.utils.decode_range(ref);
    sheets[name] = {
      name,
      ref,
      rowCount: range.e.r + 1,
      colCount: range.e.c + 1,
      startCell: XLSX.utils.encode_cell(range.s),
      endCell: XLSX.utils.encode_cell(range.e),
      merges: (sheet["!merges"] || []).map((m) => XLSX.utils.encode_range(m)),
    };
  }

  return {
    workbook,
    sheetNames,
    sheets,
  };
}

/**
 * Validates a template configuration against the active drawing characteristics and sample count.
 */
export function validateTemplateConfig(template, currentCharacteristicCount = 0, currentSampleCount = 1) {
  const errors = [];
  const warnings = [];

  if (!template) {
    return { valid: false, errors: ["No template configuration provided."], warnings, capacity: 0 };
  }

  if (!template.bytes && !template.byteLength) {
    errors.push("Template workbook file data is missing.");
  }

  if (!template.worksheet) {
    errors.push("No target inspection worksheet selected.");
  }

  const startRow = Number(template.table?.startRow) || 0;
  const endRow = Number(template.table?.endRow) || 0;

  if (startRow <= 0) {
    errors.push("Table start row must be a positive integer (>= 1).");
  }
  if (endRow < startRow) {
    errors.push("Table end row must be greater than or equal to start row.");
  }

  const capacity = startRow > 0 && endRow >= startRow ? endRow - startRow + 1 : 0;
  if (capacity > 0 && currentCharacteristicCount > capacity) {
    errors.push(
      `Template table capacity (${capacity} rows) is insufficient for current characteristics (${currentCharacteristicCount}). Increase end row or reduce characteristics.`,
    );
  }

  const cols = template.table?.columns || {};
  if (!cols.balloonNo || !isValidColumnLetter(cols.balloonNo)) {
    errors.push("Balloon Number column mapping is required and must be a valid column letter (e.g. 'A').");
  }
  if (!cols.status || !isValidColumnLetter(cols.status)) {
    errors.push("Characteristic Status result column mapping is required and must be a valid column letter.");
  }

  // Sample columns validation
  const sampleCols = Array.isArray(cols.samples) ? cols.samples : [];
  if (currentSampleCount > 0) {
    for (let s = 0; s < currentSampleCount; s++) {
      const colLetter = sampleCols[s];
      if (!colLetter || !isValidColumnLetter(colLetter)) {
        errors.push(`Sample #${s + 1} column mapping is required (missing or invalid column letter).`);
      }
    }
  }

  // Column duplicate / collision checks
  const mappedCols = new Map();
  const registerCol = (field, letter) => {
    if (!letter) return;
    const clean = letter.toUpperCase();
    if (mappedCols.has(clean)) {
      errors.push(`Duplicate column collision: '${clean}' is mapped to both '${mappedCols.get(clean)}' and '${field}'.`);
    } else {
      mappedCols.set(clean, field);
    }
  };

  registerCol("Balloon #", cols.balloonNo);
  registerCol("Nominal", cols.nominal);
  registerCol("Tolerance", cols.tolerance);
  registerCol("USL", cols.usl);
  registerCol("LSL", cols.lsl);
  registerCol("Type", cols.type);
  registerCol("Unit", cols.unit);
  registerCol("Method", cols.method);
  registerCol("Min", cols.min);
  registerCol("Max", cols.max);
  registerCol("Status", cols.status);
  registerCol("Notes", cols.notes);
  sampleCols.forEach((letter, idx) => registerCol(`Sample #${idx + 1}`, letter));

  // Header cells validation and overlap with table rows
  const headerMap = new Map();
  const headers = template.headers || {};
  for (const [key, addr] of Object.entries(headers)) {
    if (!addr) continue;
    if (!isValidCellAddress(addr)) {
      errors.push(`Header mapping '${key}' has invalid cell address '${addr}'.`);
      continue;
    }
    const cleanAddr = addr.toUpperCase();
    if (headerMap.has(cleanAddr)) {
      errors.push(`Duplicate header target: cell '${cleanAddr}' is mapped to both '${headerMap.get(cleanAddr)}' and '${key}'.`);
    } else {
      headerMap.set(cleanAddr, key);
    }

    // Check overlap with table row range
    const decoded = XLSX.utils.decode_cell(cleanAddr);
    const rowNum = decoded.r + 1; // 1-based row
    if (startRow > 0 && endRow >= startRow && rowNum >= startRow && rowNum <= endRow) {
      errors.push(
        `Header field '${key}' at cell '${cleanAddr}' overlaps with table inspection rows (${startRow}–${endRow}).`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    capacity,
  };
}

/**
 * Clears declared writable cells in the target table range before writing fresh export data.
 */
export function clearMappedTableCells(worksheet, template) {
  const startRow = template.table.startRow;
  const endRow = template.table.endRow;
  if (!startRow || !endRow || endRow < startRow) return;

  const cols = template.table.columns || {};
  const activeColLetters = [
    cols.balloonNo,
    cols.nominal,
    cols.tolerance,
    cols.usl,
    cols.lsl,
    cols.type,
    cols.unit,
    cols.method,
    cols.min,
    cols.max,
    cols.status,
    cols.notes,
    ...(cols.samples || []),
  ].filter((col) => col && isValidColumnLetter(col));

  for (let r = startRow; r <= endRow; r++) {
    for (const colLetter of activeColLetters) {
      const cellRef = `${colLetter}${r}`;
      delete worksheet[cellRef];
    }
  }
}

/**
 * Fills a fresh copy of the customer's original template workbook with active inspection data.
 */
export function fillCustomTemplateWorkbook({ template, metadata = {}, characteristics = [], sampleCount = 1, options = {} }) {
  if (!template || !template.bytes) {
    throw new Error("No template bytes available to fill.");
  }

  const expandedChars = characteristics.reduce(
    (items, item) =>
      (item.quantity || 1) > 1 && !item.instancesExpanded
        ? resizeOccurrences(items, item.id, item.quantity)
        : items,
    characteristics,
  );

  const sortedChars = expandedChars.slice().sort(compareOccurrences);
  const validation = validateTemplateConfig(template, sortedChars.length, sampleCount);

  if (!validation.valid) {
    throw new Error(`Cannot export with invalid template configuration:\n- ${validation.errors.join("\n- ")}`);
  }

  // Clone workbook from original bytes so original remains immutable
  const freshBytes = template.bytes.slice(0);
  const workbook = XLSX.read(freshBytes, {
    type: "array",
    cellStyles: true,
    cellFormula: true,
  });

  const sheet = workbook.Sheets[template.worksheet];
  if (!sheet) {
    throw new Error(`Worksheet '${template.worksheet}' was not found in template workbook.`);
  }

  // 1. Clear mapped table range
  clearMappedTableCells(sheet, template);

  // 2. Write mapped headers
  const setCell = (ref, value, forceNumeric = false) => {
    if (!ref || !isValidCellAddress(ref)) return;
    if (value === undefined || value === null || value === "") {
      delete sheet[ref];
      return;
    }

    if (forceNumeric) {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        sheet[ref] = { t: "n", v: num };
        return;
      }
    }

    const strVal = String(value);
    if (forceNumeric && /^[-+]?[0-9]*\.?[0-9]+$/.test(strVal.trim())) {
      sheet[ref] = { t: "n", v: Number(strVal) };
    } else {
      sheet[ref] = { t: "s", v: strVal };
    }
  };

  const headers = template.headers || {};
  if (headers.drawingNo) setCell(headers.drawingNo, metadata.drawingNo || "");
  if (headers.revision) setCell(headers.revision, metadata.revision || "");
  if (headers.supplier) setCell(headers.supplier, metadata.supplier || "");
  if (headers.description) setCell(headers.description, metadata.description || "");
  if (headers.sampleCount) setCell(headers.sampleCount, sampleCount, true);
  if (headers.overallStatus) {
    setCell(headers.overallStatus, overallStatus(sortedChars, sampleCount));
  }

  // 3. Write characteristics row by row
  const startRow = template.table.startRow;
  const cols = template.table.columns || {};
  const validSampleCount = Math.max(1, parseInt(sampleCount, 10) || 1);

  sortedChars.forEach((item, idx) => {
    const rowNum = startRow + idx;
    const { usl, lsl } = getLimits(item);
    const itemStatus = getStatus(item, validSampleCount);
    const label = balloonLabel(item);
    const safeBalloon = label !== "undefined" && label !== "null" && label !== "" ? label : String(idx + 1);

    if (cols.balloonNo) setCell(`${cols.balloonNo}${rowNum}`, safeBalloon);
    if (cols.nominal) setCell(`${cols.nominal}${rowNum}`, item.nominal);
    if (cols.tolerance) setCell(`${cols.tolerance}${rowNum}`, item.tolerance);
    if (cols.usl) setCell(`${cols.usl}${rowNum}`, usl, typeof usl === "number");
    if (cols.lsl) setCell(`${cols.lsl}${rowNum}`, lsl, typeof lsl === "number");
    if (cols.type) setCell(`${cols.type}${rowNum}`, item.type);
    if (cols.unit) setCell(`${cols.unit}${rowNum}`, item.unit);
    if (cols.method) setCell(`${cols.method}${rowNum}`, item.method);
    if (cols.status) setCell(`${cols.status}${rowNum}`, itemStatus);
    if (cols.notes) setCell(`${cols.notes}${rowNum}`, item.notes || "");

    // Numeric sample values for min/max
    const sampleValues = Array.from({ length: validSampleCount }, (_, sIdx) => item.samples?.[sIdx] ?? "");
    const numericValues = sampleValues
      .map((val) => parseNumber(val, item.unit))
      .filter((val) => val !== null && !isNaN(val));

    if (cols.min) setCell(`${cols.min}${rowNum}`, numericValues.length ? Math.min(...numericValues) : "", true);
    if (cols.max) setCell(`${cols.max}${rowNum}`, numericValues.length ? Math.max(...numericValues) : "", true);

    // Samples: write as number if purely numeric, otherwise text
    if (Array.isArray(cols.samples)) {
      for (let sIdx = 0; sIdx < validSampleCount; sIdx++) {
        const colLetter = cols.samples[sIdx];
        if (colLetter) {
          const sVal = item.samples?.[sIdx] ?? "";
          const isNum = sVal !== "" && /^[-+]?[0-9]*\.?[0-9]+$/.test(String(sVal).trim());
          setCell(`${colLetter}${rowNum}`, sVal, isNum);
        }
      }
    }
  });

  return {
    workbook,
    templateName: template.name,
    sheetName: template.worksheet,
    rowCount: sortedChars.length,
    capacity: template.table.endRow - template.table.startRow + 1,
  };
}

/**
 * Browser export helper for custom template workbook.
 */
export function exportCustomInspectionWorkbook({ template, metadata, characteristics, sampleCount, fileName = null }) {
  const { workbook } = fillCustomTemplateWorkbook({ template, metadata, characteristics, sampleCount });
  const defaultFileName = fileName || `${metadata?.drawingNo || "inspection"}_Custom_FAI_Report.xlsx`;
  XLSX.writeFile(workbook, defaultFileName);
}
