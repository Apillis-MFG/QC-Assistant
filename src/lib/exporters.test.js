import { describe, it, expect } from "vitest";
import { parseNumber, getLimits, getStatus } from "./exporters.js";

function char(overrides = {}) {
  return { type: "dimension", nominal: "", tolerance: "", samples: {}, ...overrides };
}

describe("parseNumber", () => {
  it("returns null for empty string", () => expect(parseNumber("")).toBeNull());
  it("returns null for null", () => expect(parseNumber(null)).toBeNull());
  it("parses integer", () => expect(parseNumber("25")).toBe(25));
  it("parses decimal", () => expect(parseNumber("25.13")).toBe(25.13));
  it("parses negative", () => expect(parseNumber("-0.1")).toBe(-0.1));
  it("parses comma decimal", () => expect(parseNumber("25,13")).toBe(25.13));
  it("returns null for non-numeric string", () => expect(parseNumber("abc")).toBeNull());
});

describe("getLimits", () => {
  it("returns empty for null nominal", () => {
    expect(getLimits(char({ nominal: "", tolerance: "0.13" }))).toEqual({ usl: "", lsl: "" });
  });
  it("returns empty for null tolerance", () => {
    expect(getLimits(char({ nominal: "25", tolerance: "" }))).toEqual({ usl: "", lsl: "" });
  });
  it("bilateral: nominal=25 ±0.13", () => {
    expect(getLimits(char({ nominal: "25", tolerance: "0.13" }))).toEqual({ usl: 25.13, lsl: 24.87 });
  });
  it("negative bilateral treated as positive", () => {
    expect(getLimits(char({ nominal: "25", tolerance: "-0.13" }))).toEqual({ usl: 25.13, lsl: 24.87 });
  });
  it("MAX-only: usl=tolerance, lsl=empty", () => {
    expect(getLimits(char({ nominal: "25", tolerance: "3 MAX" }))).toEqual({ usl: 3, lsl: "" });
  });
  it("MIN-only: usl=empty, lsl=tolerance", () => {
    expect(getLimits(char({ nominal: "25", tolerance: "0.5 MIN" }))).toEqual({ usl: "", lsl: 0.5 });
  });
});

describe("getStatus — dimensional", () => {
  it("OPEN when all samples empty", () => {
    expect(getStatus(char({ nominal: "25", tolerance: "0.5" }), 3)).toBe("OPEN");
  });
  it("OPEN when partially filled and all measured values in-spec", () => {
    expect(getStatus(char({ nominal: "25", tolerance: "0.5", samples: { 0: "25.1" } }), 3)).toBe("OPEN");
  });
  it("NG when one sample out-of-spec even with empty slots remaining", () => {
    expect(getStatus(char({ nominal: "25", tolerance: "0.5", samples: { 0: "26" } }), 3)).toBe("NG");
  });
  it("OK when all samples filled and in-spec", () => {
    const samples = { 0: "25.1", 1: "24.9", 2: "25.0" };
    expect(getStatus(char({ nominal: "25", tolerance: "0.5", samples }), 3)).toBe("OK");
  });
  it("NG when all samples filled and one out-of-spec", () => {
    const samples = { 0: "25.1", 1: "25.6", 2: "25.0" };
    expect(getStatus(char({ nominal: "25", tolerance: "0.5", samples }), 3)).toBe("NG");
  });
  it("OPEN when no numeric limits (null nominal)", () => {
    expect(getStatus(char(), 3)).toBe("OPEN");
  });
  it("OK when all samples filled with no numeric limits", () => {
    const samples = { 0: "anything", 1: "anything", 2: "anything" };
    expect(getStatus(char({ samples }), 3)).toBe("OK");
  });
});

describe("getStatus — note / visual", () => {
  it("OPEN when all empty", () => {
    expect(getStatus(char({ type: "note" }), 3)).toBe("OPEN");
  });
  it("OPEN when partially filled with OK", () => {
    expect(getStatus(char({ type: "note", samples: { 0: "OK" } }), 3)).toBe("OPEN");
  });
  it("OK when all filled with OK (case-insensitive)", () => {
    const samples = { 0: "OK", 1: "ok", 2: "Ok" };
    expect(getStatus(char({ type: "note", samples }), 3)).toBe("OK");
  });
  it("NG when one non-OK entry", () => {
    const samples = { 0: "OK", 1: "NG", 2: "OK" };
    expect(getStatus(char({ type: "note", samples }), 3)).toBe("NG");
  });
  it("visual type follows same rules", () => {
    const samples = { 0: "OK", 1: "OK", 2: "OK" };
    expect(getStatus(char({ type: "visual", samples }), 3)).toBe("OK");
  });
});
