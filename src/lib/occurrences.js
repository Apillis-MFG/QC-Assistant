// Occurrences share a requirement, but retain independent inspection and placement data.
export const MAX_OCCURRENCE_QUANTITY = 1000;

export function isValidOccurrenceQuantity(quantity) {
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_OCCURRENCE_QUANTITY;
}

export function assertOccurrenceQuantity(quantity) {
  if (!isValidOccurrenceQuantity(quantity)) {
    throw new Error(`Quantity must be a whole number from 1 to ${MAX_OCCURRENCE_QUANTITY}. Correct the requirement quantity before exporting.`);
  }
}

export const SHARED_REQUIREMENT_FIELDS = [
  "balloonNo", "quantity", "instancesExpanded", "type", "unit", "nominal", "tolerance", "method",
];

export function normalizeOccurrence(item) {
  return {
    ...item,
    groupId: item.groupId || item.id,
    quantity: Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
    occurrenceIndex: Number.isSafeInteger(item.occurrenceIndex) && item.occurrenceIndex > 0 ? item.occurrenceIndex : 1,
    instancesExpanded: item.instancesExpanded === true,
    isPlaced: item.isPlaced !== false,
    samples: item.samples || {},
    notes: item.notes || "",
  };
}

export function balloonLabel(item) {
  return item.instancesExpanded ? `${item.balloonNo}.${item.occurrenceIndex}` : String(item.balloonNo);
}

export function compareOccurrences(a, b) {
  return a.balloonNo - b.balloonNo || (a.occurrenceIndex || 1) - (b.occurrenceIndex || 1);
}

export function sameRequirement(a, b) {
  return (a.groupId || a.id) === (b.groupId || b.id);
}

export function hasInspectionData(item) {
  return Boolean(String(item.notes || "").trim()) || Object.values(item.samples || {}).some((value) => value !== "" && value != null);
}

export function resizeOccurrences(items, id, quantity) {
  assertOccurrenceQuantity(quantity);
  const selected = items.find((item) => item.id === id);
  if (!selected) return items;
  const group = items.filter((item) => sameRequirement(item, selected)).sort(compareOccurrences);
  const first = normalizeOccurrence(group[0]);
  const retained = group.filter((item) => (item.occurrenceIndex || 1) <= quantity)
    .map((item) => ({ ...normalizeOccurrence(item), quantity, instancesExpanded: quantity > 1 }));
  for (let index = retained.length + 1; index <= quantity; index += 1) {
    retained.push({ ...first, id: crypto.randomUUID(), quantity, occurrenceIndex: index,
      instancesExpanded: true, isPlaced: false, samples: {}, notes: "" });
  }
  return [...items.filter((item) => !sameRequirement(item, selected)), ...retained].sort(compareOccurrences);
}

export function reassignOccurrenceBase(items, id, nextNo) {
  const current = items.find((item) => item.id === id);
  if (!current) return items;
  return items.map((item) => {
    if (sameRequirement(item, current)) return { ...item, balloonNo: nextNo };
    if (item.balloonNo === nextNo) return { ...item, balloonNo: current.balloonNo };
    return item;
  });
}

export function missingOccurrences(items) {
  return items.some((item) => {
    const quantity = item.quantity ?? 1;
    if (!isValidOccurrenceQuantity(quantity)) return true;
    if (quantity === 1) return false;
    if (!item.instancesExpanded) return true;
    const group = items.filter((other) => sameRequirement(item, other));
    return group.length !== quantity || Array.from({ length: quantity }, (_, i) => i + 1)
      .some((index) => !group.some((other) => other.occurrenceIndex === index));
  });
}

export function assertCloudCompatible(items) {
  if (items.some((item) => item.instancesExpanded || (item.quantity || 1) > 1)) {
    throw new Error("Repeated dimensions are local-only. Cloud sharing requires occurrence support; keep this project local.");
  }
}
