import fs from "node:fs/promises";
import path from "node:path";

/** Layout schema version: cell rects `{ id, x, y, w, h }` on a fine grid. */
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
  "status",
  "calendar",
] as const;

export type BlockId = (typeof BLOCK_IDS)[number];

/** Per-block mins — status is icon-only and fits a single cell. */
export function minSizeFor(id: BlockId): { w: number; h: number } {
  if (id === "status") return { w: 1, h: 1 };
  return { w: MIN_BLOCK_W, h: MIN_BLOCK_H };
}

/** v2 cell rectangle (0-based column/row, inclusive span). */
export type LayoutBlock = {
  id: BlockId;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type StudioLayout = {
  version: number;
  updated_at: string;
  grid: { cols: number; rows: number };
  blocks: LayoutBlock[];
};

const BLOCK_ID_SET = new Set<string>(BLOCK_IDS);

/** Default v2 placement: weather top halves, status thin strip, calendar rest. */
export function defaultBlockRects(): LayoutBlock[] {
  return [
    { id: "weather_today", x: 0, y: 0, w: 6, h: 3 },
    { id: "weather_tomorrow", x: 6, y: 0, w: 6, h: 3 },
    { id: "status", x: 0, y: 3, w: 12, h: 1 },
    { id: "calendar", x: 0, y: 4, w: 12, h: 4 },
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
 * Map legacy v1 `{ id, width: half|full }` order into default v2 cell rects.
 * Weather halves stay top row; status thin full width; calendar fills the rest.
 * Order from v1 is preserved only for tie-breaking when ids match defaults.
 */
export function migrateV1BlocksToV2(
  v1Blocks: Array<{ id: string; width?: string }>,
): LayoutBlock[] {
  const defaults = defaultBlockRects();
  const byId = new Map<BlockId, LayoutBlock>(
    defaults.map((b) => [b.id, { ...b }]),
  );
  // Keep known ids; ignore unknown. Default rects already encode half/full geometry.
  const ordered: LayoutBlock[] = [];
  const seen = new Set<BlockId>();
  for (const b of v1Blocks) {
    if (BLOCK_ID_SET.has(b.id) && !seen.has(b.id as BlockId)) {
      const id = b.id as BlockId;
      ordered.push(byId.get(id)!);
      seen.add(id);
    }
  }
  for (const id of BLOCK_IDS) {
    if (!seen.has(id)) ordered.push(byId.get(id)!);
  }
  return ordered;
}

function parseCellBlock(
  block: Record<string, unknown>,
  id: BlockId,
): LayoutBlock {
  const hasCells =
    isInt(block.x) || isInt(block.y) || isInt(block.w) || isInt(block.h);
  if (!hasCells) {
    // Legacy width-only block — take default rect for this id
    const def = defaultBlockRects().find((b) => b.id === id)!;
    return { ...def };
  }
  if (!isInt(block.x) || !isInt(block.y) || !isInt(block.w) || !isInt(block.h)) {
    throw new Error(`block ${id} requires integer x,y,w,h`);
  }
  const mins = minSizeFor(id);
  const clamped = clampBlockRect(
    {
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h,
    },
    GRID_COLS,
    GRID_ROWS,
    mins.w,
    mins.h,
  );
  return { id, ...clamped };
}

function assertNoOverlap(blocks: LayoutBlock[]): void {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (rectsOverlap(blocks[i]!, blocks[j]!)) {
        throw new Error(
          `blocks overlap: ${blocks[i]!.id} and ${blocks[j]!.id}`,
        );
      }
    }
  }
}

/**
 * Validate and normalize layout to v2.
 * Accepts v1 half/full payloads and upgrades them to cell rects.
 * Writes always use version 2 + grid metadata.
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

  const incomingVersion =
    typeof obj.version === "number" && Number.isFinite(obj.version)
      ? Math.trunc(obj.version)
      : 1;

  const looksLikeV1 = obj.blocks.every((item) => {
    if (item == null || typeof item !== "object") return false;
    const b = item as Record<string, unknown>;
    const hasCells =
      isInt(b.x) || isInt(b.y) || isInt(b.w) || isInt(b.h);
    return !hasCells;
  });

  let blocks: LayoutBlock[];

  if (incomingVersion <= 1 || looksLikeV1) {
    const v1: Array<{ id: string; width?: string }> = [];
    const seen = new Set<string>();
    for (const item of obj.blocks) {
      if (item == null || typeof item !== "object") {
        throw new Error("each block must be an object");
      }
      const block = item as Record<string, unknown>;
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
      v1.push({ id, width });
    }
    for (const id of BLOCK_IDS) {
      if (!seen.has(id)) {
        throw new Error(`missing block id: ${id}`);
      }
    }
    blocks = migrateV1BlocksToV2(v1);
  } else {
    const seen = new Set<string>();
    blocks = [];
    for (const item of obj.blocks) {
      if (item == null || typeof item !== "object") {
        throw new Error("each block must be an object");
      }
      const block = item as Record<string, unknown>;
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
    for (const id of BLOCK_IDS) {
      if (!seen.has(id)) {
        throw new Error(`missing block id: ${id}`);
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
