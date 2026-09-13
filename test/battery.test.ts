import { describe, expect, it } from "vitest";
import { batteryFilledIndexes, batterySegments } from "../src/battery.js";
import {
  weatherLayoutVariant,
  weatherSizeMetrics,
  renderStudioLiquid,
} from "../src/studio-liquid.js";
import { defaultStudioLayout, minSizeFor } from "../src/studio-layout.js";

describe("batterySegments", () => {
  it("maps percent to 1..4 filled bars with ceil(/25)", () => {
    expect(batterySegments(0)).toEqual({ filled: 1, low: true });
    expect(batterySegments(1)).toEqual({ filled: 1, low: true });
    expect(batterySegments(24)).toEqual({ filled: 1, low: true });
    expect(batterySegments(25)).toEqual({ filled: 1, low: false });
    expect(batterySegments(26)).toEqual({ filled: 2, low: false });
    expect(batterySegments(50)).toEqual({ filled: 2, low: false });
    expect(batterySegments(51)).toEqual({ filled: 3, low: false });
    expect(batterySegments(75)).toEqual({ filled: 3, low: false });
    expect(batterySegments(76)).toEqual({ filled: 4, low: false });
    expect(batterySegments(100)).toEqual({ filled: 4, low: false });
  });

  it("clamps out-of-range values", () => {
    expect(batterySegments(-10)).toEqual({ filled: 1, low: true });
    expect(batterySegments(150)).toEqual({ filled: 4, low: false });
  });

  it("lists filled segment indexes", () => {
    expect(batteryFilledIndexes(10)).toEqual([1]);
    expect(batteryFilledIndexes(40)).toEqual([1, 2]);
    expect(batteryFilledIndexes(100)).toEqual([1, 2, 3, 4]);
  });
});

describe("weatherLayoutVariant", () => {
  it("picks compact / wide / tall / balanced from w×h", () => {
    expect(weatherLayoutVariant(2, 2)).toBe("compact");
    expect(weatherLayoutVariant(3, 2)).toBe("compact");
    expect(weatherLayoutVariant(6, 3)).toBe("wide");
    expect(weatherLayoutVariant(4, 2)).toBe("wide");
    expect(weatherLayoutVariant(3, 5)).toBe("tall");
    expect(weatherLayoutVariant(4, 4)).toBe("balanced");
  });
});

describe("weatherSizeMetrics", () => {
  it("fills tall cells and keeps mid/narrow spans compact", () => {
    const mid = weatherSizeMetrics(4, 2);
    const large = weatherSizeMetrics(6, 3);
    const square = weatherSizeMetrics(4, 4);
    const tiny = weatherSizeMetrics(2, 2);
    expect(mid.tempEm).toBeLessThan(large.tempEm);
    expect(mid.tempEm).toBeLessThan(square.tempEm);
    expect(tiny.iconPx).toBeLessThanOrEqual(mid.iconPx);
    expect(mid.iconPx).toBeLessThan(square.iconPx);
    expect(mid.tempEm).toBeGreaterThanOrEqual(0.72);
    expect(large.tempEm).toBeLessThanOrEqual(1.9);
    expect(square.tempEm).toBeGreaterThan(1.4);
    expect(square.tempEm).toBeLessThanOrEqual(3.1);
    expect(square.iconPx).toBeGreaterThanOrEqual(70);
    // Mid width must leave room for icon + "36°C" without huge type
    expect(mid.tempEm).toBeLessThanOrEqual(1.35);
    expect(tiny.tempEm).toBeLessThanOrEqual(1.05);
  });
});

describe("battery/trash min size", () => {
  it("locks icon blocks to a single cell", () => {
    expect(minSizeFor("battery")).toEqual({ w: 1, h: 1 });
    expect(minSizeFor("trash")).toEqual({ w: 1, h: 1 });
  });
});

describe("renderStudioLiquid weather + battery/trash", () => {
  it("exports °C weather with size vars and separate icon cells", () => {
    const liquid = renderStudioLiquid(defaultStudioLayout());
    expect(liquid).toMatch(/temp_c/);
    expect(liquid).toMatch(/°C/);
    expect(liquid).not.toMatch(/temp_f/);
    expect(liquid).not.toMatch(/°F/);
    expect(liquid).toMatch(/creafridge-weather--wide/);
    expect(liquid).toMatch(/data-w="4"/);
    expect(liquid).toMatch(/--cf-icon:/);
    expect(liquid).toMatch(/--cf-temp:/);
    expect(liquid).toMatch(/creafridge-battery/);
    expect(liquid).toMatch(/creafridge-battery__seg/);
    expect(liquid).toMatch(/creafridge-battery-cell/);
    expect(liquid).toMatch(/creafridge-trash-cell/);
    expect(liquid).toMatch(/cf_batt_segs/);
    expect(liquid).not.toMatch(/Status · Battery \+ Waste/);
    expect(liquid).not.toMatch(/value--xsmall">Battery/);
    expect(liquid).not.toMatch(/creafridge-status/);
    expect(liquid).toMatch(/creafridge-calendar/);
    expect(liquid).toMatch(/grid-template-columns:\s*auto 1fr/);
    expect(liquid).not.toMatch(/Calendar · 7 days/);
    expect(liquid).not.toMatch(/grid--cols-4/);
    expect(liquid).not.toMatch(/col--span-3/);
    expect(liquid).toMatch(/--cf-cols:/);
    // Condition/range (title meta) above °C (value temp) for e-ink readability
    expect(liquid).toMatch(
      /title creafridge-weather__meta[\s\S]*?value creafridge-weather__temp/,
    );
    expect(liquid).not.toMatch(
      /label creafridge-weather__meta/,
    );
  });

  it("bakes tall/compact weather classes and metrics from cell spans", () => {
    const layout = defaultStudioLayout();
    layout.blocks = [
      { id: "weather_today", x: 0, y: 0, w: 3, h: 5 },
      { id: "weather_tomorrow", x: 3, y: 0, w: 2, h: 2 },
      { id: "battery", x: 5, y: 0, w: 1, h: 1 },
      { id: "trash", x: 6, y: 0, w: 1, h: 1 },
      { id: "calendar", x: 0, y: 5, w: 12, h: 3 },
    ];
    const liquid = renderStudioLiquid(layout);
    expect(liquid).toMatch(/creafridge-weather--tall/);
    expect(liquid).toMatch(/creafridge-weather--compact/);
    expect(liquid).toMatch(/grid-column: 6 \/ span 1/);
    expect(liquid).toMatch(/--cf-temp:/);
  });
});
