import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/server.js";
import { buildHealthPayload } from "../src/payload.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    ),
  );
});

async function listen(): Promise<string> {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("trmnl-plugin HTTP", () => {
  it("GET /health returns ok payload", async () => {
    const base = await listen();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual(buildHealthPayload());
  });

  it("GET / returns fridge dashboard JSON with live updated_at", async () => {
    const before = Date.now();
    const base = await listen();
    const res = await fetch(`${base}/`);
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.title).toBe("CreaFridge");
    expect(body.plugin_label).toBe("CreaFridge");
    expect(body.weather).toBeTypeOf("object");
    expect(body.waste).toBeTypeOf("object");
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.days)).toBe(true);
    expect((body.days as unknown[]).length).toBe(7);
    expect(body).not.toHaveProperty("presence");
    expect(body).not.toHaveProperty("routines");
    expect(body).not.toHaveProperty("alerts");
    const updatedMs = Date.parse(body.updated_at as string);
    expect(Number.isNaN(updatedMs)).toBe(false);
    expect(updatedMs).toBeGreaterThanOrEqual(before - 1000);
    expect(updatedMs).toBeLessThanOrEqual(after + 1000);

    const weather = body.weather as {
      today: { condition: string; icon: string; precip_slots: unknown[] };
      tomorrow: { condition: string; icon: string };
    };
    expect(weather.today.condition).toBeTypeOf("string");
    expect(weather.today.icon).toMatch(
      /^https:\/\/trmnl\.com\/images\/plugins\/weather\/wi-.+\.svg$/,
    );
    expect(Array.isArray(weather.today.precip_slots)).toBe(true);
    expect(weather.tomorrow.condition).toBeTypeOf("string");
    expect(weather.tomorrow.icon).toMatch(
      /^https:\/\/trmnl\.com\/images\/plugins\/weather\/wi-.+\.svg$/,
    );
  });

  it("GET /poll matches GET / shape", async () => {
    const base = await listen();
    const [root, poll] = await Promise.all([
      fetch(`${base}/`).then((r) => r.json()),
      fetch(`${base}/poll`).then((r) => r.json()),
    ]);
    const { updated_at: _a, ...rootRest } = root as Record<string, unknown>;
    const { updated_at: _b, ...pollRest } = poll as Record<string, unknown>;
    expect(pollRest).toEqual(rootRest);
  });

  it("OPTIONS allows GET from anywhere", async () => {
    const base = await listen();
    const res = await fetch(`${base}/`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toMatch(/GET/);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/PUT/);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/POST/);
  });

  it("refreshes updated_at between requests", async () => {
    const base = await listen();
    const first = (await (await fetch(`${base}/`)).json()) as {
      updated_at: string;
    };
    await new Promise((r) => setTimeout(r, 5));
    const second = (await (await fetch(`${base}/`)).json()) as {
      updated_at: string;
    };
    expect(second.updated_at).not.toBe(first.updated_at);
  });
});
