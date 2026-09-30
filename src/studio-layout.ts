import fs from "node:fs/promises";
import path from "node:path";

/** Layout schema version: cell rects `{ id, x, y, w, h, enabled? }` on a fine grid. */
export const STUDIO_LAYOUT_VERSION = 2;

/** Screen size the Studio preview and device Full view target (TRMNL OG). */
export const SCREEN_WIDTH_PX = 800;
export const SCREEN_HEIGHT_PX = 480;

/**
 * Fine grid over the content area (~800×480).
 * Cell ≈ 66.7×60 px before gaps/padding — fine enough for freeform blocks.
 */
export const GRID_COLS = 12;
export const GRID_ROWS = 8;

/** Default minimum block size in cell units (inclusive). */
export const MIN_BLOCK_W = 2;
export const MIN_BLOCK_H = 2;

export const BLOCK_IDS = [
  "weather_today",
  "weather_tomorrow",
  "battery",
  "trash",
  "watering",
  "calendar",
  "shopping",
] as const;

export type BlockId = (typeof BLOCK_IDS)[number];

/** Legacy single status strip — migrated to battery + trash. */
const LEGACY_STATUS_ID = "status";

/** Per-block mins — battery/trash/watering are fixed 1×1 icon cells. */
export function minSizeFor(id: BlockId): { w: number; h: number } {
  if (id === "battery" || id === "trash" || id === "watering") {
    return { w: 1, h: 1 };
  }
  return { w: MIN_BLOCK_W, h: MIN_BLOCK_H };
}

/** Fixed size lock (no free resize). */
export function fixedSizeFor(id: BlockId): { w: number; h: number } | null {
  if (id === "battery" || id === "trash" || id === "watering") {
    return { w: 1, h: 1 };
  }
  return null;
}

/**
 * Default visibility. Shopping and watering are off so existing fridge layouts
 * stay unchanged until the user enables them in Studio.
 */
export function defaultEnabledFor(id: BlockId): boolean {
  return id !== "shopping" && id !== "watering";
}

export function isBlockEnabled(block: Pick<LayoutBlock, "enabled">): boolean {
  return block.enabled !== false;
}

/** v2 cell rectangle (0-based column/row, inclusive span). */
export type LayoutBlock = {
  id: BlockId;
  x: number;
  y: number;
  w: number;
  h: number;
  /** When false, block is omitted from Full Liquid / fridge render. Default true except shopping/watering. */
  enabled: boolean;
};

export type StudioLayout = {
  version: number;
  updated_at: string;
  grid: { cols: number; rows: number };
  blocks: LayoutBlock[];
};

const BLOCK_ID_SET = new Set<string>(BLOCK_IDS);

/** Default v2 placement: weather 4×3 pair, trash+battery top-right 1×1, calendar rest; shopping/watering off. */
export function defaultBlockRects(): LayoutBlock[] {
  return [
    { id: "weather_today", x: 0, y: 0, w: 4, h: 3, enabled: true },
    { id: "weather_tomorrow", x: 4, y: 0, w: 4, h: 3, enabled: true },
    { id: "battery", x: 11, y: 0, w: 1, h: 1, enabled: true },
    { id: "trash", x: 10, y: 0, w: 1, h: 1, enabled: true },
    { id: "calendar", x: 0, y: 4, w: 12, h: 4, enabled: true },
    { id: "shopping", x: 8, y: 0, w: 2, h: 3, enabled: false },
    // Below battery — free cell; disabled until user enables in Studio
    { id: "watering", x: 11, y: 1, w: 1, h: 1, enabled: false },
  ];
}

export function defaultStudioLayout(now: Date = new Date()): StudioLayout {
  return {
    version: STUDIO_LAYOUT_VERSION,
    updated_at: now.toISOString(),
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    blocks: defaultBlockRects(),
  };
}

export function resolveStudioLayoutPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const fromEnv = env.STUDIO_LAYOUT_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(cwd, "data", "studio-layout.json");
}

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Axis-aligned cell rects overlap (inclusive cells). */
export function rectsOverlap(
  a: Pick<LayoutBlock, "x" | "y" | "w" | "h">,
  b: Pick<LayoutBlock, "x" | "y" | "w" | "h">,
): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

export function clampBlockRect(
  raw: Pick<LayoutBlock, "x" | "y" | "w" | "h">,
  cols: number = GRID_COLS,
  rows: number = GRID_ROWS,
  minW: number = MIN_BLOCK_W,
  minH: number = MIN_BLOCK_H,
): Pick<LayoutBlock, "x" | "y" | "w" | "h"> {
  const w = clampInt(raw.w, minW, cols);
  const h = clampInt(raw.h, minH, rows);
  const x = clampInt(raw.x, 0, Math.max(0, cols - w));
  const y = clampInt(raw.y, 0, Math.max(0, rows - h));
  return { x, y, w, h };
}

/**
 * Replace legacy `status` with `battery` + `trash` at sensible 1×1 positions.
 * If battery/trash already exist, status is dropped.
 */
export function expandLegacyStatusBlocks(
  blocks: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const hasBattery = blocks.some((b) => b.id === "battery");
  const hasTrash = blocks.some((b) => b.id === "trash");
  const out: Array<Record<string, unknown>> = [];

  for (const block of blocks) {
    if (block.id !== LEGACY_STATUS_ID) {
      out.push(block);
      continue;
    }
    if (hasBattery && hasTrash) continue;

    const hasCells =
      isInt(block.x) || isInt(block.y) || isInt(block.w) || isInt(block.h);
    if (hasCells && isInt(block.x) && isInt(block.y)) {
      const bx = clampInt(block.x, 0, GRID_COLS - 1);
      const by = clampInt(block.y, 0, GRID_ROWS - 1);
      let tx = bx + 1;
      if (tx >= GRID_COLS) tx = Math.max(0, bx - 1);
      if (!hasBattery) {
        out.push({ id: "battery", x: bx, y: by, w: 1, h: 1, enabled: true });
      }
      if (!hasTrash) {
        out.push({ id: "trash", x: tx, y: by, w: 1, h: 1, enabled: true });
      }
    } else {
      // v1 width-only — defaults fill geometry later
      if (!hasBattery) {
        out.push({
          id: "battery",
          enabled: true,
          ...(block.width != null ? { width: block.width } : {}),
        });
      }
      if (!hasTrash) {
        out.push({
          id: "trash",
          enabled: true,
          ...(block.width != null ? { width: block.width } : {}),
        });
      }
    }
  }
  return out;
}

/**
 * Map legacy v1 `{ id, width: half|full }` order into default v2 cell rects.
 * Weather halves stay top row; battery+trash 1×1; calendar fills the rest.
 */
export function migrateV1BlocksToV2(
  v1Blocks: Array<{ id: string; width?: string; enabled?: boolean }>,
): LayoutBlock[] {
  const defaults = defaultBlockRects();
  const byId = new Map<BlockId, LayoutBlock>(
    defaults.map((b) => [b.id, { ...b }]),
  );
  const ordered: LayoutBlock[] = [];
  const seen = new Set<BlockId>();
  for (const b of v1Blocks) {
    if (BLOCK_ID_SET.has(b.id) && !seen.has(b.id as BlockId)) {
      const id = b.id as BlockId;
      const base = byId.get(id)!;
      ordered.push({
        ...base,
        enabled: b.enabled ?? defaultEnabledFor(id),
      });
      seen.add(id);
    }
  }
  for (const id of BLOCK_IDS) {
    if (!seen.has(id)) ordered.push(byId.get(id)!);
  }
  return ordered;
}

function parseEnabled(
  block: Record<string, unknown>,
  id: BlockId,
): boolean {
  if (typeof block.enabled === "boolean") return block.enabled;
  return defaultEnabledFor(id);
}

function parseCellBlock(
  block: Record<string, unknown>,
  id: BlockId,
): LayoutBlock {
  const enabled = parseEnabled(block, id);
  const hasCells =
    isInt(block.x) || isInt(block.y) || isInt(block.w) || isInt(block.h);
  if (!hasCells) {
    const def = defaultBlockRects().find((b) => b.id === id)!;
    return { ...def, enabled };
  }
  if (!isInt(block.x) || !isInt(block.y) || !isInt(block.w) || !isInt(block.h)) {
    throw new Error(`block ${id} requires integer x,y,w,h`);
  }
  const fixed = fixedSizeFor(id);
  const mins = minSizeFor(id);
  const clamped = clampBlockRect(
    {
      x: block.x,
      y: block.y,
      w: fixed ? fixed.w : block.w,
      h: fixed ? fixed.h : block.h,
    },
    GRID_COLS,
    GRID_ROWS,
    mins.w,
    mins.h,
  );
  return { id, ...clamped, enabled };
}

/** Overlap only among enabled blocks — disabled widgets keep a saved rect but do not reserve screen space. */
export function assertNoOverlap(blocks: LayoutBlock[]): void {
  const active = blocks.filter(isBlockEnabled);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (rectsOverlap(active[i]!, active[j]!)) {
        throw new Error(
          `blocks overlap: ${active[i]!.id} and ${active[j]!.id}`,
        );
      }
    }
  }
}

/**
 * True when `candidate` overlaps any currently enabled sibling (skipping `skipId`).
 * Disabled siblings do not reserve space.
 */
export function wouldOverlap(
  blocks: Array<Pick<LayoutBlock, "id" | "x" | "y" | "w" | "h" | "enabled">>,
  candidate: Pick<LayoutBlock, "x" | "y" | "w" | "h" | "enabled">,
  skipId?: string,
): boolean {
  if (!isBlockEnabled(candidate)) return false;
  return blocks.some(
    (b) =>
      b.id !== skipId &&
      isBlockEnabled(b) &&
      rectsOverlap(candidate, b),
  );
}

/**
 * Scan the grid left-to-right, top-to-bottom for the first cell origin where a
 * `w`×`h` rect fits without overlapping enabled blocks (excluding `skipId`).
 * Returns null when the grid has no free placement of that size.
 */
export function findFreePlacement(
  blocks: Array<Pick<LayoutBlock, "id" | "x" | "y" | "w" | "h" | "enabled">>,
  size: { w: number; h: number },
  skipId?: string,
  cols: number = GRID_COLS,
  rows: number = GRID_ROWS,
): { x: number; y: number } | null {
  const w = Math.trunc(size.w);
  const h = Math.trunc(size.h);
  if (w < 1 || h < 1 || w > cols || h > rows) return null;
  for (let y = 0; y <= rows - h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const candidate = { x, y, w, h, enabled: true };
      if (!wouldOverlap(blocks, candidate, skipId)) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Resolve geometry for enabling a block: keep current rect when free, otherwise
 * relocate to the first free slot that fits fixed/current size. Returns null
 * when no free placement exists among currently enabled siblings.
 */
export function resolveEnablePlacement(
  blocks: Array<Pick<LayoutBlock, "id" | "x" | "y" | "w" | "h" | "enabled">>,
  block: Pick<LayoutBlock, "id" | "x" | "y" | "w" | "h">,
): Pick<LayoutBlock, "x" | "y" | "w" | "h"> | null {
  const id = block.id as BlockId;
  const fixed = fixedSizeFor(id);
  const mins = minSizeFor(id);
  const size = fixed
    ? fixed
    : {
        w: Math.max(mins.w, Math.trunc(block.w)),
        h: Math.max(mins.h, Math.trunc(block.h)),
      };
  const clamped = clampBlockRect(
    { x: block.x, y: block.y, w: size.w, h: size.h },
    GRID_COLS,
    GRID_ROWS,
    mins.w,
    mins.h,
  );
  const inPlace = { ...clamped, enabled: true as const };
  if (!wouldOverlap(blocks, inPlace, block.id)) {
    return clamped;
  }
  const free = findFreePlacement(blocks, { w: clamped.w, h: clamped.h }, block.id);
  if (!free) return null;
  return { x: free.x, y: free.y, w: clamped.w, h: clamped.h };
}

/**
 * Validate and normalize layout to v2.
 * Accepts v1 half/full payloads and upgrades them to cell rects.
 * Migrates legacy `status` → `battery` + `trash`.
 * Missing known block ids (e.g. new `shopping` / `watering`) are filled from defaults.
 * Writes always use version 2 + grid metadata + explicit `enabled`.
 */
export function validateStudioLayout(raw: unknown): StudioLayout {
  if (raw == null || typeof raw !== "object") {
    throw new Error("layout must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.blocks)) {
    throw new Error("layout.blocks must be an array");
  }
  if (obj.blocks.length === 0) {
    throw new Error("layout.blocks must not be empty");
  }

  const expanded = expandLegacyStatusBlocks(
    obj.blocks.map((item) => {
      if (item == null || typeof item !== "object") {
        throw new Error("each block must be an object");
      }
      return item as Record<string, unknown>;
    }),
  );

  const incomingVersion =
    typeof obj.version === "number" && Number.isFinite(obj.version)
      ? Math.trunc(obj.version)
      : 1;

  const looksLikeV1 = expanded.every((b) => {
    const hasCells =
      isInt(b.x) || isInt(b.y) || isInt(b.w) || isInt(b.h);
    return !hasCells;
  });

  let blocks: LayoutBlock[];

  if (incomingVersion <= 1 || looksLikeV1) {
    const v1: Array<{ id: string; width?: string; enabled?: boolean }> = [];
    const seen = new Set<string>();
    for (const block of expanded) {
      const id = block.id;
      if (typeof id !== "string" || !BLOCK_ID_SET.has(id)) {
        throw new Error(`invalid block id: ${String(id)}`);
      }
      if (seen.has(id)) {
        throw new Error(`duplicate block id: ${id}`);
      }
      seen.add(id);
      let width: string | undefined;
      if (block.width === "full" || block.width === "half") {
        width = block.width;
      } else if (block.width != null) {
        throw new Error(`invalid width for ${id}`);
      }
      const enabled =
        typeof block.enabled === "boolean" ? block.enabled : undefined;
      v1.push({ id, width, enabled });
    }
    // Fill any newly added block ids (e.g. shopping, watering) from defaults
    blocks = migrateV1BlocksToV2(v1);
  } else {
    const seen = new Set<string>();
    blocks = [];
    for (const block of expanded) {
      const id = block.id;
      if (typeof id !== "string" || !BLOCK_ID_SET.has(id)) {
        throw new Error(`invalid block id: ${String(id)}`);
      }
      if (seen.has(id)) {
        throw new Error(`duplicate block id: ${id}`);
      }
      seen.add(id);
      blocks.push(parseCellBlock(block, id as BlockId));
    }
    // Auto-fill missing ids so older saved layouts gain shopping/watering (disabled)
    const defaults = defaultBlockRects();
    for (const id of BLOCK_IDS) {
      if (!seen.has(id)) {
        blocks.push({ ...defaults.find((b) => b.id === id)! });
      }
    }
    assertNoOverlap(blocks);
  }

  const updated_at =
    typeof obj.updated_at === "string" && obj.updated_at.trim()
      ? obj.updated_at
      : new Date().toISOString();

  return {
    version: STUDIO_LAYOUT_VERSION,
    updated_at,
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    blocks,
  };
}

export async function readStudioLayout(
  filePath: string,
): Promise<StudioLayout> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    return validateStudioLayout(parsed);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return defaultStudioLayout();
    }
    if (err instanceof SyntaxError) {
      return defaultStudioLayout();
    }
    // Validation errors on corrupt file → fall back to default
    if (err instanceof Error && /block|layout|overlap/i.test(err.message)) {
      return defaultStudioLayout();
    }
    throw err;
  }
}

export async function writeStudioLayout(
  filePath: string,
  layout: StudioLayout,
): Promise<StudioLayout> {
  const validated = validateStudioLayout({
    ...layout,
    version: STUDIO_LAYOUT_VERSION,
    updated_at: new Date().toISOString(),
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const body = `${JSON.stringify(validated, null, 2)}\n`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
  return validated;
}
