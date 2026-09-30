import { describe, expect, it } from "vitest";
import {
  STUDIO_LAYOUT_VERSION,
  GRID_COLS,
  GRID_ROWS,
  clampBlockRect,
  defaultStudioLayout,
  expandLegacyStatusBlocks,
  findFreePlacement,
  fixedSizeFor,
  isBlockEnabled,
  migrateV1BlocksToV2,
  minSizeFor,
  rectsOverlap,
  resolveEnablePlacement,
  validateStudioLayout,
  wouldOverlap,
} from "../src/studio-layout.js";
import { renderStudioLiquid } from "../src/studio-liquid.js";

describe("studio-layout v2", () => {
  it("default layout is v2 with shopping and watering disabled by default", () => {
    const layout = defaultStudioLayout();
    expect(layout.version).toBe(STUDIO_LAYOUT_VERSION);
    expect(layout.version).toBe(2);
    expect(layout.grid).toEqual({ cols: GRID_COLS, rows: GRID_ROWS });
    expect(layout.blocks).toEqual([
      { id: "weather_today", x: 0, y: 0, w: 4, h: 3, enabled: true },
      { id: "weather_tomorrow", x: 4, y: 0, w: 4, h: 3, enabled: true },
      { id: "battery", x: 11, y: 0, w: 1, h: 1, enabled: true },
      { id: "trash", x: 10, y: 0, w: 1, h: 1, enabled: true },
      { id: "calendar", x: 0, y: 4, w: 12, h: 4, enabled: true },
      { id: "shopping", x: 8, y: 0, w: 2, h: 3, enabled: false },
      { id: "watering", x: 11, y: 1, w: 1, h: 1, enabled: false },
    ]);
    expect(isBlockEnabled(layout.blocks.find((b) => b.id === "shopping")!)).toBe(
      false,
    );
    expect(isBlockEnabled(layout.blocks.find((b) => b.id === "watering")!)).toBe(
      false,
    );
  });

  it("migrates v1 half/full to default cell rects and fills shopping/watering", () => {
    const migrated = migrateV1BlocksToV2([
      { id: "calendar", width: "full" },
      { id: "battery", width: "full" },
      { id: "trash", width: "full" },
      { id: "weather_today", width: "half" },
      { id: "weather_tomorrow", width: "half" },
    ]);
    expect(migrated.map((b) => b.id)).toEqual([
      "calendar",
      "battery",
      "trash",
      "weather_today",
      "weather_tomorrow",
      "watering",
      "shopping",
    ]);
    expect(migrated.find((b) => b.id === "weather_today")).toMatchObject({
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      enabled: true,
    });
    expect(migrated.find((b) => b.id === "shopping")).toMatchObject({
      enabled: false,
    });
    expect(migrated.find((b) => b.id === "watering")).toMatchObject({
      enabled: false,
      w: 1,
      h: 1,
    });
  });

  it("expands legacy status into battery + trash", () => {
    const expanded = expandLegacyStatusBlocks([
      { id: "weather_today", x: 0, y: 0, w: 6, h: 3 },
      { id: "status", x: 0, y: 3, w: 12, h: 1 },
      { id: "calendar", x: 0, y: 4, w: 12, h: 4 },
      { id: "weather_tomorrow", x: 6, y: 0, w: 6, h: 3 },
    ]);
    expect(expanded.map((b) => b.id)).toEqual([
      "weather_today",
      "battery",
      "trash",
      "calendar",
      "weather_tomorrow",
    ]);
    expect(expanded.find((b) => b.id === "battery")).toMatchObject({
      x: 0,
      y: 3,
      w: 1,
      h: 1,
    });
    expect(expanded.find((b) => b.id === "trash")).toMatchObject({
      x: 1,
      y: 3,
      w: 1,
      h: 1,
    });
  });

  it("validateStudioLayout upgrades v1 status payload to battery+trash+shopping+watering", () => {
    const layout = validateStudioLayout({
      version: 1,
      blocks: [
        { id: "weather_today", width: "half" },
        { id: "weather_tomorrow", width: "half" },
        { id: "status", width: "full" },
        { id: "calendar", width: "full" },
      ],
    });
    expect(layout.version).toBe(2);
    expect(layout.grid.cols).toBe(12);
    expect(layout.grid.rows).toBe(8);
    expect(layout.blocks.map((b) => b.id)).toEqual([
      "weather_today",
      "weather_tomorrow",
      "battery",
      "trash",
      "calendar",
      "watering",
      "shopping",
    ]);
    expect(layout.blocks.every((b) => "x" in b && "w" in b && "enabled" in b)).toBe(
      true,
    );
    expect(layout.blocks.find((b) => b.id === "shopping")?.enabled).toBe(false);
    expect(layout.blocks.find((b) => b.id === "watering")?.enabled).toBe(false);
  });

  it("auto-fills missing shopping and watering on older v2 layouts", () => {
    const layout = validateStudioLayout({
      version: 2,
      blocks: [
        { id: "weather_today", x: 0, y: 0, w: 4, h: 3 },
        { id: "weather_tomorrow", x: 4, y: 0, w: 4, h: 3 },
        { id: "battery", x: 11, y: 0, w: 1, h: 1 },
        { id: "trash", x: 10, y: 0, w: 1, h: 1 },
        { id: "calendar", x: 0, y: 4, w: 12, h: 4 },
      ],
    });
    expect(layout.blocks.map((b) => b.id)).toContain("shopping");
    expect(layout.blocks.find((b) => b.id === "shopping")).toMatchObject({
      enabled: false,
      x: 8,
      y: 0,
      w: 2,
      h: 3,
    });
    expect(layout.blocks.map((b) => b.id)).toContain("watering");
    expect(layout.blocks.find((b) => b.id === "watering")).toMatchObject({
      enabled: false,
      x: 11,
      y: 1,
      w: 1,
      h: 1,
    });
  });

  it("locks battery/trash/watering to 1×1 when larger rects are submitted", () => {
    const layout = validateStudioLayout({
      version: 2,
      blocks: [
        { id: "weather_today", x: 0, y: 0, w: 6, h: 3 },
        { id: "weather_tomorrow", x: 6, y: 0, w: 6, h: 3 },
        { id: "battery", x: 0, y: 3, w: 4, h: 2 },
        { id: "trash", x: 1, y: 3, w: 3, h: 2 },
        { id: "watering", x: 2, y: 3, w: 3, h: 2 },
        { id: "calendar", x: 0, y: 4, w: 12, h: 4 },
      ],
    });
    expect(layout.blocks.find((b) => b.id === "battery")).toMatchObject({
      w: 1,
      h: 1,
    });
    expect(layout.blocks.find((b) => b.id === "trash")).toMatchObject({
      w: 1,
      h: 1,
    });
    expect(layout.blocks.find((b) => b.id === "watering")).toMatchObject({
      w: 1,
      h: 1,
    });
  });

  it("fixedSizeFor / minSizeFor lock icon blocks", () => {
    expect(fixedSizeFor("battery")).toEqual({ w: 1, h: 1 });
    expect(fixedSizeFor("trash")).toEqual({ w: 1, h: 1 });
    expect(fixedSizeFor("watering")).toEqual({ w: 1, h: 1 });
    expect(fixedSizeFor("calendar")).toBeNull();
    expect(minSizeFor("battery")).toEqual({ w: 1, h: 1 });
    expect(minSizeFor("trash")).toEqual({ w: 1, h: 1 });
    expect(minSizeFor("watering")).toEqual({ w: 1, h: 1 });
  });

  it("clamps blocks to grid bounds and min size", () => {
    expect(clampBlockRect({ x: -2, y: 99, w: 1, h: 1 })).toEqual({
      x: 0,
      y: 6,
      w: 2,
      h: 2,
    });
    expect(clampBlockRect({ x: 10, y: 0, w: 8, h: 3 })).toEqual({
      x: 4,
      y: 0,
      w: 8,
      h: 3,
    });
  });

  it("rejects overlapping enabled v2 blocks", () => {
    expect(() =>
      validateStudioLayout({
        version: 2,
        blocks: [
          { id: "weather_today", x: 0, y: 0, w: 6, h: 3, enabled: true },
          { id: "weather_tomorrow", x: 4, y: 0, w: 6, h: 3, enabled: true },
          { id: "battery", x: 0, y: 3, w: 1, h: 1, enabled: true },
          { id: "trash", x: 1, y: 3, w: 1, h: 1, enabled: true },
          { id: "calendar", x: 0, y: 4, w: 12, h: 4, enabled: true },
          { id: "shopping", x: 8, y: 0, w: 2, h: 3, enabled: false },
        ],
      }),
    ).toThrow(/overlap/);
  });

  it("allows disabled blocks to share cells with enabled ones", () => {
    const layout = validateStudioLayout({
      version: 2,
      blocks: [
        { id: "weather_today", x: 0, y: 0, w: 4, h: 3, enabled: true },
        { id: "weather_tomorrow", x: 4, y: 0, w: 4, h: 3, enabled: true },
        { id: "battery", x: 11, y: 0, w: 1, h: 1, enabled: true },
        { id: "trash", x: 10, y: 0, w: 1, h: 1, enabled: true },
        { id: "calendar", x: 0, y: 4, w: 12, h: 4, enabled: true },
        // Overlaps weather_today but disabled — OK
        { id: "shopping", x: 0, y: 0, w: 2, h: 3, enabled: false },
      ],
    });
    expect(layout.blocks.find((b) => b.id === "shopping")?.enabled).toBe(false);
  });

  it("rectsOverlap detects shared cells", () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, w: 6, h: 3 },
        { x: 6, y: 0, w: 6, h: 3 },
      ),
    ).toBe(false);
    expect(
      rectsOverlap(
        { x: 0, y: 0, w: 6, h: 3 },
        { x: 5, y: 0, w: 6, h: 3 },
      ),
    ).toBe(true);
  });

  it("findFreePlacement scans left-to-right, top-to-bottom", () => {
    const blocks = [
      { id: "weather_today", x: 0, y: 0, w: 4, h: 3, enabled: true },
      { id: "weather_tomorrow", x: 4, y: 0, w: 4, h: 3, enabled: true },
      { id: "battery", x: 11, y: 0, w: 1, h: 1, enabled: true },
      { id: "trash", x: 10, y: 0, w: 1, h: 1, enabled: true },
      { id: "calendar", x: 0, y: 4, w: 12, h: 4, enabled: true },
      { id: "shopping", x: 8, y: 0, w: 2, h: 3, enabled: true },
      { id: "watering", x: 11, y: 1, w: 1, h: 1, enabled: false },
    ];
    // First free 1×1 with shopping on: under trash at (10,1)
    expect(findFreePlacement(blocks, { w: 1, h: 1 }, "watering")).toEqual({
      x: 10,
      y: 1,
    });
    // With shopping disabled, first free 1×1 is shopping's saved seat (8,0)
    const shoppingOff = blocks.map((b) =>
      b.id === "shopping" ? { ...b, enabled: false } : b,
    );
    expect(findFreePlacement(shoppingOff, { w: 1, h: 1 }, "watering")).toEqual({
      x: 8,
      y: 0,
    });
  });

  it("findFreePlacement returns null when grid has no free slot of that size", () => {
    // Fill entire 12×8 with two halves
    const blocks = [
      { id: "weather_today", x: 0, y: 0, w: 6, h: 8, enabled: true },
      { id: "weather_tomorrow", x: 6, y: 0, w: 6, h: 8, enabled: true },
      { id: "watering", x: 0, y: 0, w: 1, h: 1, enabled: false },
    ];
    expect(findFreePlacement(blocks, { w: 1, h: 1 }, "watering")).toBeNull();
    expect(findFreePlacement(blocks, { w: 2, h: 3 }, "shopping")).toBeNull();
  });

  it("resolveEnablePlacement keeps free default watering seat", () => {
    const layout = defaultStudioLayout();
    const watering = layout.blocks.find((b) => b.id === "watering")!;
    expect(resolveEnablePlacement(layout.blocks, watering)).toEqual({
      x: 11,
      y: 1,
      w: 1,
      h: 1,
    });
  });

  it("resolveEnablePlacement relocates watering when default seat is covered", () => {
    // Crowded layout like the Studio screenshot: shopping tall on the right,
    // watering's default (11,1) overlaps shopping, but free 1×1 cells remain.
    const blocks = [
      { id: "weather_today", x: 0, y: 1, w: 4, h: 3, enabled: true },
      { id: "weather_tomorrow", x: 4, y: 1, w: 4, h: 3, enabled: true },
      { id: "battery", x: 0, y: 0, w: 1, h: 1, enabled: true },
      { id: "trash", x: 3, y: 0, w: 1, h: 1, enabled: true },
      { id: "calendar", x: 0, y: 4, w: 12, h: 4, enabled: true },
      { id: "shopping", x: 8, y: 0, w: 4, h: 4, enabled: true },
      { id: "watering", x: 11, y: 1, w: 1, h: 1, enabled: false },
    ];
    expect(wouldOverlap(blocks, { ...blocks[6]!, enabled: true }, "watering")).toBe(
      true,
    );
    const placed = resolveEnablePlacement(blocks, blocks[6]!);
    expect(placed).toEqual({ x: 1, y: 0, w: 1, h: 1 });
    expect(
      wouldOverlap(blocks, { ...placed!, enabled: true }, "watering"),
    ).toBe(false);
  });

  it("resolveEnablePlacement relocates shopping when default gap is taken", () => {
    const blocks = [
      { id: "weather_today", x: 0, y: 0, w: 5, h: 3, enabled: true },
      { id: "weather_tomorrow", x: 5, y: 0, w: 5, h: 3, enabled: true },
      { id: "battery", x: 11, y: 0, w: 1, h: 1, enabled: true },
      { id: "trash", x: 10, y: 0, w: 1, h: 1, enabled: true },
      { id: "calendar", x: 0, y: 5, w: 12, h: 3, enabled: true },
      // Default shopping (8,0 2×3) overlaps expanded weather — but row y=3 is free
      { id: "shopping", x: 8, y: 0, w: 2, h: 3, enabled: false },
      { id: "watering", x: 11, y: 1, w: 1, h: 1, enabled: false },
    ];
    const shopping = blocks.find((b) => b.id === "shopping")!;
    const placed = resolveEnablePlacement(blocks, shopping);
    // First free 2×3 is beside the icons under trash/battery, not the default gap
    expect(placed).toEqual({ x: 10, y: 1, w: 2, h: 3 });
    expect(
      wouldOverlap(blocks, { ...placed!, enabled: true }, "shopping"),
    ).toBe(false);
  });

  it("resolveEnablePlacement returns null when no free placement exists", () => {
    const blocks = [
      { id: "weather_today", x: 0, y: 0, w: 6, h: 8, enabled: true },
      { id: "weather_tomorrow", x: 6, y: 0, w: 6, h: 8, enabled: true },
      { id: "watering", x: 11, y: 1, w: 1, h: 1, enabled: false },
    ];
    expect(resolveEnablePlacement(blocks, blocks[2]!)).toBeNull();
  });

  it("renderStudioLiquid omits disabled shopping/watering and includes grid markers", () => {
    const liquid = renderStudioLiquid(defaultStudioLayout());
    expect(liquid).toMatch(/creafridge-grid/);
    expect(liquid).toMatch(/grid-template-columns:\s*repeat\(12/);
    expect(liquid).toMatch(/grid-template-rows:\s*repeat\(8/);
    expect(liquid).toMatch(/grid-column:\s*1 \/ span 4/);
    expect(liquid).toMatch(/CreaFridge Studio/);
    expect(liquid).not.toMatch(/studio-/);
    expect(liquid).toMatch(/title_bar/);
    expect(liquid).toMatch(/creafridge-weather--wide/);
    expect(liquid).toMatch(/creafridge-battery-cell/);
    expect(liquid).toMatch(/creafridge-trash-cell/);
    expect(liquid).toMatch(/waste\.kind == "trash_recycle"/);
    expect(liquid).toMatch(/creafridge-calendar/);
    expect(liquid).toMatch(/grid-template-columns:\s*auto 1fr/);
    expect(liquid).not.toMatch(/Calendar · 7 days/);
    expect(liquid).not.toMatch(/grid--cols-4/);
    expect(liquid).toMatch(/text--red/);
    expect(liquid).not.toMatch(/creafridge-status/);
    // Shopping/watering disabled by default → no Liquid bindings in the grid
    expect(liquid).not.toMatch(/shopping\.items/);
    expect(liquid).not.toMatch(/shopping\.label/);
    expect(liquid).not.toMatch(/Set TODOIST_API_TOKEN/);
    expect(liquid).not.toMatch(/watering\.active/);
    expect(liquid).not.toMatch(/watering\.label/);
  });

  it("renderStudioLiquid includes shopping when enabled", () => {
    const layout = defaultStudioLayout();
    const shopping = layout.blocks.find((b) => b.id === "shopping")!;
    shopping.enabled = true;
    const liquid = renderStudioLiquid(layout);
    expect(liquid).toMatch(/shopping\.items/);
    expect(liquid).toMatch(/shopping\.label/);
    expect(liquid).toContain("creafridge-shopping__item");
    expect(liquid).toContain("• {{ item.content }}");
    expect(liquid).not.toContain("creafridge-shopping__buy");
    expect(liquid).not.toContain("✓");
    expect(liquid).not.toContain("checkbox");
    expect(liquid).not.toContain("data-shopping-id");
  });

  it("renderStudioLiquid includes watering when enabled", () => {
    const layout = defaultStudioLayout();
    const watering = layout.blocks.find((b) => b.id === "watering")!;
    watering.enabled = true;
    const liquid = renderStudioLiquid(layout);
    expect(liquid).toMatch(/creafridge-watering-cell/);
    expect(liquid).toMatch(/watering\.active/);
    expect(liquid).toMatch(/text--green/);
    expect(liquid).toMatch(/creafridge-watering/);
    expect(liquid).toMatch(/color: #27ae60/);
  });
});
