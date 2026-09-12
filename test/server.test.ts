import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/server.js";
import { buildHealthPayload } from "../src/payload.js";
import { TEST_DEFAULT_POLL_TOKEN } from "../src/poll-auth.js";

const servers: ReturnType<typeof createServer>[] = [];
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  process.env.TRMNL_POLL_TOKEN = TOKEN;
});

afterEach(async () => {
  delete process.env.TRMNL_POLL_TOKEN;
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
  it("GET /health returns ok payload without token", async () => {
    const base = await listen();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual(buildHealthPayload());
  });

  it("GET / without token returns 401 unauthorized", async () => {
    const base = await listen();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /poll without token returns 401 unauthorized", async () => {
    const base = await listen();
    const res = await fetch(`${base}/poll`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /studio/poll does not require token; adds preview-only trmnl vars", async () => {
    const base = await listen();
    const [studio, authorized] = await Promise.all([
      fetch(`${base}/studio/poll`),
      fetch(`${base}/poll/${TOKEN}`),
    ]);
    expect(studio.status).toBe(200);
    expect(authorized.status).toBe(200);
    const studioBody = (await studio.json()) as Record<string, unknown>;
    const authBody = (await authorized.json()) as Record<string, unknown>;
    expect(studioBody.title).toBe("CreaFridge");
    expect(studioBody.trmnl).toEqual({
      device: { percent_charged: 100 },
      plugin_settings: { instance_name: "My Plugin" },
    });
    expect(authBody).not.toHaveProperty("trmnl");
    const {
      updated_at: _a,
      trmnl: _preview,
      ...studioRest
    } = studioBody;
    const { updated_at: _b, ...authRest } = authBody;
    expect(studioRest).toEqual(authRest);
  });

  it("GET / with wrong token returns 401", async () => {
    const base = await listen();
    const res = await fetch(`${base}/?token=00000000-0000-4000-8000-000000000099`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /?token= correct returns fridge dashboard JSON", async () => {
    const before = Date.now();
    const base = await listen();
    const res = await fetch(`${base}/?token=${TOKEN}`);
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

  it("authorized path and query forms return matching payload shape", async () => {
    const base = await listen();
    const urls = [
      `${base}/?token=${TOKEN}`,
      `${base}/poll?token=${TOKEN}`,
      `${base}/poll/${TOKEN}`,
      `${base}/t/${TOKEN}`,
    ];
    const bodies = await Promise.all(
      urls.map(async (url) => {
        const res = await fetch(url);
        expect(res.status).toBe(200);
        return res.json() as Promise<Record<string, unknown>>;
      }),
    );
    const shapes = bodies.map(({ updated_at: _, ...rest }) => rest);
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i]).toEqual(shapes[0]);
    }
  });

  it("OPTIONS allows GET from anywhere without token", async () => {
    const base = await listen();
    const res = await fetch(`${base}/`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toMatch(/GET/);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/PUT/);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/POST/);
  });

  it("refreshes updated_at between authorized requests", async () => {
    const base = await listen();
    const first = (await (
      await fetch(`${base}/poll/${TOKEN}`)
    ).json()) as {
      updated_at: string;
    };
    await new Promise((r) => setTimeout(r, 5));
    const second = (await (
      await fetch(`${base}/t/${TOKEN}`)
    ).json()) as {
      updated_at: string;
    };
    expect(second.updated_at).not.toBe(first.updated_at);
  });

  it("uses test default token when TRMNL_POLL_TOKEN is unset (non-production)", async () => {
    delete process.env.TRMNL_POLL_TOKEN;
    const base = await listen();
    const denied = await fetch(`${base}/`);
    expect(denied.status).toBe(401);
    const ok = await fetch(`${base}/poll/${TEST_DEFAULT_POLL_TOKEN}`);
    expect(ok.status).toBe(200);
  });
});
