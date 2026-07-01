/**
 * General tolerance detection and application for engineering drawings.
 *
 * Title blocks declare tolerances with placeholder X notation:
 *   .X ±0.1   (1 decimal place)
 *   X.XX ±0.05  (2 decimal places)
 *   .XXX ±0.005 (3 decimal places)
 *
 * These functions scan all text items on a page, detect those declarations,
 * and apply the matching tolerance to dimensions that have no explicit tolerance.
 */

/**
 * Count decimal places in a nominal string. "13.20" → 2, "25" → 0.
 */
export function getDecimalPlaces(nominalStr) {
  const s = String(nominalStr || "");
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * Scan text items (from a pdfjs page or OCR) for general tolerance declarations
 * typically found in the drawing title block.
 *
 * Returns an object keyed by decimal-place count, e.g.:
 *   { 1: "±0.1", 2: "±0.05", 3: "±0.005" }
 *
 * Handles both single-item lines ("X.X ±0.1") and split items
 * by also scanning the full concatenated page text in reading order.
 */
export function parseGeneralTolerances(textItems) {
  if (!Array.isArray(textItems) || !textItems.length) return {};

  const result = {};

  // Concatenate all items in reading order for cross-item matching
  const sorted = [...textItems].sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const pageText = sorted.map((item) => item.text).join(" ");

  // Scan individual items first, then the concatenated page text
  const targets = [...textItems.map((item) => String(item.text || "")), pageText];

  for (const text of targets) {
    // Pattern 1: "X.X ±0.1" / ".XX ±0.05" / "X.XX: +/-0.05"
    // X-placeholder characters indicate the decimal precision level.
    const xPattern = /[Xx]*\.([Xx]+)\s*[:=]?\s*((?:[±]|\+\s*[/\\-]\s*)[\d.,]+)/gi;
    let m;
    while ((m = xPattern.exec(text)) !== null) {
      const places = m[1].length;
      const tol = normalizeTolStr(m[2]);
      if (tol && result[places] === undefined) result[places] = tol;
    }

    // Pattern 2: "2-PLACE DECIMAL ±0.01" / "TWO PLACE ±0.01"
    const placePattern =
      /\b(one|two|three|four|\d)\s*[-–]?\s*place\s+(?:decimal\s*)?((?:[±]|\+\s*[/\\-]\s*)[\d.,]+)/gi;
    while ((m = placePattern.exec(text)) !== null) {
      const places = wordToInt(m[1]);
      const tol = normalizeTolStr(m[2]);
      if (places && tol && result[places] === undefined) result[places] = tol;
    }
  }

  return result;
}

/**
 * Scan text items for ANGULAR general tolerance declarations, e.g.:
 *   X° = ±.5°     (0 decimal places)
 *   X.X° = ±.1°   (1 decimal place)
 *
 * Same shape as parseGeneralTolerances(): { 0: "±0.5", 1: "±0.1" }
 * (values are stored without the trailing ° so they stay compatible with
 * the shared tolerance-string format used elsewhere in the app).
 *
 * Kept separate from parseGeneralTolerances rather than merged into it: the
 * trailing ° on the tolerance value is what disambiguates an angular
 * declaration from a linear one, so the two patterns never need to compete
 * against the same match.
 */
export function parseAngleTolerances(textItems) {
  if (!Array.isArray(textItems) || !textItems.length) return {};

  const result = {};
  const sorted = [...textItems].sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const pageText = sorted.map((item) => item.text).join(" ");
  const targets = [...textItems.map((item) => String(item.text || "")), pageText];

  // "X° = ±.5°" / "X.X° = ±.1°" — the trailing ° on the tolerance side is
  // required, so this never matches a plain linear pattern like "X.XX ±0.13".
  const anglePattern =
    /[Xx]+(?:\.([Xx]+))?\s*°\s*[:=]?\s*((?:[±]|\+\s*[/\\-]\s*)[\d.,]+)\s*°/gi;

  for (const text of targets) {
    let m;
    while ((m = anglePattern.exec(text)) !== null) {
      const places = m[1] ? m[1].length : 0;
      const tol = normalizeTolStr(m[2]);
      if (tol && result[places] === undefined) result[places] = tol;
    }
  }

  return result;
}

/**
 * Return the tolerance to use for a dimension.
 * If the dimension already has an explicit tolerance, return it unchanged.
 * Otherwise look up the general tolerance table by decimal-place count.
 *
 * @param {string} nominal  - Nominal value string, e.g. "13.20"
 * @param {string} tolerance - Existing tolerance string (may be empty)
 * @param {Object} generalTolerances - Result of parseGeneralTolerances()
 * @returns {string} Resolved tolerance string
 */
export function applyGeneralTolerance(nominal, tolerance, generalTolerances) {
  if (tolerance) return tolerance;
  if (!nominal || !generalTolerances || !Object.keys(generalTolerances).length) return tolerance;
  const places = getDecimalPlaces(nominal);
  return generalTolerances[places] ?? "";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTolStr(raw) {
  const s = raw.replace(/\s+/g, "").replace(/,/g, ".");
  let result;
  if (s.startsWith("±")) result = s;
  // "+/-0.1" or "+\-0.1"
  else if (/^\+[/\\-]/.test(s)) result = `±${s.slice(3)}`;
  // "+0.1"
  else if (s.startsWith("+")) result = `±${s.slice(1)}`;
  else result = s;
  // ".5" → "0.5" — title blocks sometimes omit the leading zero, but the
  // characteristic tolerance-input UI expects at least one digit before the dot.
  return result.replace(/(^|[^\d])\.(\d)/g, "$10.$2");
}

function wordToInt(word) {
  const map = { one: 1, two: 2, three: 3, four: 4, "1": 1, "2": 2, "3": 3, "4": 4 };
  return map[word.toLowerCase()] ?? null;
}
