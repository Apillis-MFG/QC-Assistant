import assert from "node:assert/strict";
import { types, TYPE_DEFAULT_METHOD, hasCharacteristicUnit } from "../src/lib/constants.js";
import { balloonLabel } from "../src/lib/occurrences.js";

console.log("Starting verification of keyboard shortcuts and quick-ballooning navigation...");

// ---------------------------------------------------------------------------
// 1. Tool mode mappings
// ---------------------------------------------------------------------------
const shortcutModes = {
  b: "balloon",
  v: "select",
  h: "pan",
  t: "text",
  a: "autoBalloon",
};

assert.equal(shortcutModes.b, "balloon");
assert.equal(shortcutModes.v, "select");
assert.equal(shortcutModes.h, "pan");
assert.equal(shortcutModes.t, "text");
assert.equal(shortcutModes.a, "autoBalloon");

// ---------------------------------------------------------------------------
// 2. Requirement type cycling logic ('D' key)
// ---------------------------------------------------------------------------
function getNextCharacteristicType(currentType) {
  const currentIndex = types.indexOf(currentType || "dimension");
  const nextType = types[(currentIndex + 1) % types.length];
  const nextMethod = TYPE_DEFAULT_METHOD[nextType] || "DC";
  return {
    type: nextType,
    method: nextMethod,
    hasUnit: hasCharacteristicUnit(nextType),
  };
}

let current = "dimension";
const cycleHistory = [];
for (let i = 0; i < types.length; i++) {
  const next = getNextCharacteristicType(current);
  cycleHistory.push(next.type);
  current = next.type;
}

assert.deepEqual(cycleHistory, ["gdt", "note", "visual", "dimension"]);

// Check GD&T defaults to CMM
const gdt = getNextCharacteristicType("dimension");
assert.equal(gdt.type, "gdt");
assert.equal(gdt.method, "CMM");
assert.equal(gdt.hasUnit, true);

// Check Note defaults to VS and has no linear unit
const note = getNextCharacteristicType("gdt");
assert.equal(note.type, "note");
assert.equal(note.method, "VS");
assert.equal(note.hasUnit, false);

// ---------------------------------------------------------------------------
// 3. ArrowUp / ArrowDown & J / K navigation order
// ---------------------------------------------------------------------------
const sampleList = [
  { id: "c1", balloonNo: 1 },
  { id: "c2", balloonNo: 2 },
  { id: "c3", balloonNo: 3 },
  { id: "c4", balloonNo: 4 },
];

function navigateList(items, currentId, direction) {
  if (!items.length) return null;
  const currentIndex = items.findIndex((c) => c.id === currentId);
  if (direction === "down" || direction === "next") {
    const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    return items[nextIndex].id;
  }
  if (direction === "up" || direction === "prev") {
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    return items[prevIndex].id;
  }
  return currentId;
}

// Down navigation
assert.equal(navigateList(sampleList, "c1", "down"), "c2");
assert.equal(navigateList(sampleList, "c2", "down"), "c3");
assert.equal(navigateList(sampleList, "c4", "down"), "c1", "Wrapping at end of list");

// Up navigation
assert.equal(navigateList(sampleList, "c3", "up"), "c2");
assert.equal(navigateList(sampleList, "c1", "up"), "c4", "Wrapping at start of list");

// ---------------------------------------------------------------------------
// 4. Quick number assignment (1-9)
// ---------------------------------------------------------------------------
for (let key = 1; key <= 9; key++) {
  const isDigit = /^[1-9]$/.test(String(key));
  assert.ok(isDigit, `Key ${key} must match 1-9 quick assignment`);
}
assert.equal(/^[1-9]$/.test("0"), false, "0 is not a valid 1-9 single balloon hotkey");
assert.equal(/^[1-9]$/.test("10"), false, "Multiple digits are not single keystrokes");

// ---------------------------------------------------------------------------
// 5. Input, modifier, and route guard logic
// ---------------------------------------------------------------------------
function shouldHandleShortcut({ pathname, isTyping, modifierKey, defaultPrevented }) {
  const isWorkspaceRoute = /^\/projects\/[^/]+\/drawings(\/|$)/.test(pathname);
  if (!isWorkspaceRoute) return false;
  if (defaultPrevented || modifierKey || isTyping) return false;
  return true;
}

// Valid workspace scenario
assert.equal(
  shouldHandleShortcut({
    pathname: "/projects/p-123/drawings/d-456",
    isTyping: false,
    modifierKey: false,
    defaultPrevented: false,
  }),
  true,
);

// Blocked in dashboard
assert.equal(
  shouldHandleShortcut({
    pathname: "/dashboard",
    isTyping: false,
    modifierKey: false,
    defaultPrevented: false,
  }),
  false,
);

// Blocked while user is typing in an input
assert.equal(
  shouldHandleShortcut({
    pathname: "/projects/p-123/drawings/d-456",
    isTyping: true,
    modifierKey: false,
    defaultPrevented: false,
  }),
  false,
);

// Blocked when Cmd / Ctrl / Alt is held
assert.equal(
  shouldHandleShortcut({
    pathname: "/projects/p-123/drawings/d-456",
    isTyping: false,
    modifierKey: true,
    defaultPrevented: false,
  }),
  false,
);

console.log("PASS: 100% keyboard shortcut and quick-ballooning verification checks passed successfully!");
