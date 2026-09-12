import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildHealthPayload, buildPollPayload } from "./payload.js";
import {
  isAuthorizedPollRequest,
  resolvePollToken,
} from "./poll-auth.js";
import {
  defaultStudioLayout,
  readStudioLayout,
  resolveStudioLayoutPath,
  validateStudioLayout,
  writeStudioLayout,
} from "./studio-layout.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
} as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
} as const;

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    ...JSON_HEADERS,
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function normalizePath(url: string | undefined): string {
  if (!url) return "/";
  const pathOnly = url.split("?")[0] ?? "/";
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }
  return pathOnly || "/";
}

async function readRequestBody(
  req: IncomingMessage,
  limitBytes = 256_000,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limitBytes) {
      throw new Error("body_too_large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function findStudioDir(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "studio"),
    path.join(moduleDir, "..", "studio"),
  ];
  for (const dir of candidates) {
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) return dir;
    } catch {
      // try next
    }
  }
  return candidates[0]!;
}

function safeStudioAsset(relPath: string): string | null {
  const cleaned = relPath.replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("\0")) return null;
  if (cleaned.split("/").some((p) => p === ".." || p === "")) return null;
  return cleaned;
}

async function serveStudioAsset(
  res: ServerResponse,
  method: string,
  relPath: string,
): Promise<boolean> {
  const safe = safeStudioAsset(relPath);
  if (!safe) {
    sendJson(res, 400, { error: "bad_path" });
    return true;
  }

  const studioDir = await findStudioDir();
  const filePath = path.join(studioDir, safe);
  const resolved = path.resolve(filePath);
  if (
    resolved !== path.resolve(studioDir) &&
    !resolved.startsWith(`${path.resolve(studioDir)}${path.sep}`)
  ) {
    sendJson(res, 400, { error: "bad_path" });
    return true;
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      "Content-Length": data.length,
    });
    if (method === "HEAD") {
      res.end();
    } else {
      res.end(data);
    }
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    throw err;
  }
}

async function handleStudioLayout(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
): Promise<void> {
  const layoutPath = resolveStudioLayoutPath();

  if (method === "GET" || method === "HEAD") {
    const layout = await readStudioLayout(layoutPath);
    if (method === "HEAD") {
      res.writeHead(200, JSON_HEADERS);
      res.end();
      return;
    }
    sendJson(res, 200, layout);
    return;
  }

  if (method === "PUT" || method === "POST") {
    let rawText: string;
    try {
      rawText = await readRequestBody(req);
    } catch (err) {
      if (err instanceof Error && err.message === "body_too_large") {
        sendJson(res, 413, { error: "body_too_large" });
        return;
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }

    try {
      const validated = validateStudioLayout(parsed);
      const saved = await writeStudioLayout(layoutPath, validated);
      sendJson(res, 200, saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid_layout";
      sendJson(res, 400, { error: "invalid_layout", message });
    }
    return;
  }

  sendJson(res, 405, { error: "method_not_allowed" });
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method?.toUpperCase() ?? "GET";
  const rawUrl = req.url ?? "/";
  const pathOnly = rawUrl.split("?")[0] ?? "/";
  const path = normalizePath(rawUrl);

  if (method === "OPTIONS") {
    res.writeHead(204, {
      ...CORS_HEADERS,
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  // Studio layout API
  if (path === "/studio/layout") {
    await handleStudioLayout(req, res, method);
    return;
  }

  // Studio-only poll preview (Tailscale/network-gated; no TRMNL_POLL_TOKEN)
  if (path === "/studio/poll") {
    if (method !== "GET" && method !== "HEAD") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }
    if (method === "HEAD") {
      res.writeHead(200, JSON_HEADERS);
      res.end();
      return;
    }
    try {
      const body = await buildPollPayload();
      sendJson(res, 200, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      sendJson(res, 500, { error: "poll_failed", message });
    }
    return;
  }

  // Studio HTML + static assets (redirect bare /studio → /studio/ for relative URLs)
  if (pathOnly === "/studio") {
    if (method !== "GET" && method !== "HEAD") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }
    res.writeHead(302, {
      Location: "/studio/",
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (pathOnly === "/studio/" || pathOnly.startsWith("/studio/")) {
    if (method !== "GET" && method !== "HEAD") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }
    const rel =
      pathOnly === "/studio/" ? "index.html" : pathOnly.slice("/studio/".length);
    await serveStudioAsset(res, method, rel || "index.html");
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  if (path === "/health") {
    if (method === "HEAD") {
      res.writeHead(200, JSON_HEADERS);
      res.end();
      return;
    }
    sendJson(res, 200, buildHealthPayload());
    return;
  }

  // Poll endpoints require TRMNL_POLL_TOKEN (path or ?token=)
  const isPollPath =
    path === "/" ||
    path === "/poll" ||
    path.startsWith("/poll/") ||
    path.startsWith("/t/");

  if (isPollPath) {
    let expected: string;
    try {
      expected = resolvePollToken();
    } catch {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    if (!isAuthorizedPollRequest(rawUrl, path, expected)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    if (method === "HEAD") {
      res.writeHead(200, JSON_HEADERS);
      res.end();
      return;
    }
    try {
      const body = await buildPollPayload();
      sendJson(res, 200, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      sendJson(res, 500, { error: "poll_failed", message });
    }
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: "internal_error",
          message: err instanceof Error ? err.message : "unknown_error",
        });
      } else {
        res.end();
      }
    });
  });
}

export type ListenOptions = {
  host?: string;
  port?: number;
};

export function resolveListenOptions(
  env: NodeJS.ProcessEnv = process.env,
): Required<ListenOptions> {
  const host = env.HOST?.trim() || "0.0.0.0";
  const rawPort = env.PORT?.trim() || "8799";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }
  return { host, port };
}

// Re-export for tests / tooling
export { defaultStudioLayout, resolveStudioLayoutPath };
