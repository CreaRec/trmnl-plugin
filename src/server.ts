import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildHealthPayload, buildPollPayload } from "./payload.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
} as const;

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

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const method = req.method?.toUpperCase() ?? "GET";
  const path = normalizePath(req.url);

  if (method === "OPTIONS") {
    res.writeHead(204, {
      ...JSON_HEADERS,
      "Access-Control-Max-Age": "86400",
    });
    res.end();
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

  if (path === "/" || path === "/poll") {
    if (method === "HEAD") {
      res.writeHead(200, JSON_HEADERS);
      res.end();
      return;
    }
    sendJson(res, 200, buildPollPayload());
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

export function createServer(): http.Server {
  return http.createServer(handleRequest);
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
