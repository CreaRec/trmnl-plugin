import fs from "node:fs/promises";
import path from "node:path";

export const STUDIO_LAYOUT_VERSION = 1;

export const BLOCK_IDS = [
  "weather_today",
  "weather_tomorrow",
  "status",
  "calendar",
] as const;

export type BlockId = (typeof BLOCK_IDS)[number];

export type LayoutBlock = {
  id: BlockId;
  /** half = share a 2-col row with an adjacent half block (weather pair). */
  width?: "full" | "half";
};

export type StudioLayout = {
  version: number;
  updated_at: string;
  blocks: LayoutBlock[];
};

const BLOCK_ID_SET = new Set<string>(BLOCK_IDS);

export function defaultStudioLayout(
  now: Date = new Date(),
): StudioLayout {
  return {
    version: STUDIO_LAYOUT_VERSION,
    updated_at: now.toISOString(),
    blocks: [
      { id: "weather_today", width: "half" },
      { id: "weather_tomorrow", width: "half" },
      { id: "status", width: "full" },
      { id: "calendar", width: "full" },
    ],
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

  const seen = new Set<string>();
  const blocks: LayoutBlock[] = [];

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

    let width: "full" | "half" | undefined;
    if (block.width === "full" || block.width === "half") {
      width = block.width;
    } else if (block.width != null) {
      throw new Error(`invalid width for ${id}`);
    } else if (id === "weather_today" || id === "weather_tomorrow") {
      width = "half";
    } else {
      width = "full";
    }

    blocks.push({ id: id as BlockId, width });
  }

  for (const id of BLOCK_IDS) {
    if (!seen.has(id)) {
      throw new Error(`missing block id: ${id}`);
    }
  }

  const version =
    typeof obj.version === "number" && Number.isFinite(obj.version)
      ? Math.trunc(obj.version)
      : STUDIO_LAYOUT_VERSION;

  const updated_at =
    typeof obj.updated_at === "string" && obj.updated_at.trim()
      ? obj.updated_at
      : new Date().toISOString();

  return {
    version,
    updated_at,
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
    if (err instanceof Error && /block|layout/i.test(err.message)) {
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
    updated_at: new Date().toISOString(),
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const body = `${JSON.stringify(validated, null, 2)}\n`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
  return validated;
}
