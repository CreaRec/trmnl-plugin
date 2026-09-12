import { describe, expect, it } from "vitest";
import { batteryFilledIndexes, batterySegments } from "../src/battery.js";
import { weatherLayoutVariant, renderStudioLiquid } from "../src/studio-liquid.js";
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

describe("status min size", () => {
  it("allows a single cell", () => {
    expect(minSizeFor("status")).toEqual({ w: 1, h: 1 });
  });
});

describe("renderStudioLiquid weather + status", () => {
  it("exports °C weather with layout classes and icon-only status", () => {
    const liquid = renderStudioLiquid(defaultStudioLayout());
    expect(liquid).toMatch(/temp_c/);
    expect(liquid).toMatch(/°C/);
    expect(liquid).not.toMatch(/temp_f/);
    expect(liquid).not.toMatch(/°F/);
    expect(liquid).toMatch(/creafridge-weather--wide/);
    expect(liquid).toMatch(/data-w="6"/);
    expect(liquid).toMatch(/creafridge-battery/);
    expect(liquid).toMatch(/creafridge-battery__seg/);
    expect(liquid).toMatch(/creafridge-trash/);
    expect(liquid).toMatch(/cf_batt_segs/);
    expect(liquid).not.toMatch(/Status · Battery \+ Waste/);
    expect(liquid).not.toMatch(/value--xsmall">Battery/);
  });

  it("bakes tall/compact weather classes from cell spans", () => {
    const layout = defaultStudioLayout();
    layout.blocks = [
      { id: "weather_today", x: 0, y: 0, w: 3, h: 5 },
      { id: "weather_tomorrow", x: 3, y: 0, w: 2, h: 2 },
      { id: "status", x: 5, y: 0, w: 1, h: 1 },
      { id: "calendar", x: 0, y: 5, w: 12, h: 3 },
    ];
    const liquid = renderStudioLiquid(layout);
    expect(liquid).toMatch(/creafridge-weather--tall/);
    expect(liquid).toMatch(/creafridge-weather--compact/);
    expect(liquid).toMatch(/grid-column: 6 \/ span 1/);
  });
});
