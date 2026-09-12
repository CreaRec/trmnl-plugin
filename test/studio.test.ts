import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../src/server.js";
import { defaultStudioLayout } from "../src/studio-layout.js";

const servers: ReturnType<typeof createServer>[] = [];
const prevLayoutPath = process.env.STUDIO_LAYOUT_PATH;

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    ),
  );
  if (prevLayoutPath === undefined) {
    delete process.env.STUDIO_LAYOUT_PATH;
  } else {
    process.env.STUDIO_LAYOUT_PATH = prevLayoutPath;
  }
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

async function withTempLayoutPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trmnl-studio-"));
  const file = path.join(dir, "studio-layout.json");
  process.env.STUDIO_LAYOUT_PATH = file;
  return file;
}

describe("studio routes", () => {
  it("GET /studio redirects to /studio/", async () => {
    const base = await listen();
    const res = await fetch(`${base}/studio`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/studio/");
  });

  it("GET /studio/ returns HTML 200", async () => {
    const base = await listen();
    const res = await fetch(`${base}/studio/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toMatch(/CreaFridge/);
    expect(html).toMatch(/Studio/);
  });

  it("GET /studio/studio.js and studio.css are served", async () => {
    const base = await listen();
    const js = await fetch(`${base}/studio/studio.js`);
    const css = await fetch(`${base}/studio/studio.css`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toMatch(/css/);
    const jsText = await js.text();
    expect(jsText).toContain("${studioRootPath()}/poll");
    expect(jsText).not.toContain('return "/poll"');
    expect(jsText).not.toContain('return "/trmnl"');
  });

  it("GET /studio/poll returns poll JSON without token", async () => {
    process.env.TRMNL_POLL_TOKEN = "11111111-2222-4333-8444-555555555555";
    try {
      const base = await listen();
      const denied = await fetch(`${base}/poll`);
      expect(denied.status).toBe(401);

      const res = await fetch(`${base}/studio/poll`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.title).toBe("CreaFridge");
      expect(body.plugin_label).toBe("CreaFridge");
      expect(body.weather).toBeTypeOf("object");
      expect(body.waste).toBeTypeOf("object");
      expect(Array.isArray(body.events)).toBe(true);
      expect(Array.isArray(body.days)).toBe(true);
      // Preview-only TRMNL device vars (not on authorized /poll)
      expect(body.trmnl).toEqual({
        device: { percent_charged: 100 },
        plugin_settings: { instance_name: "My Plugin" },
      });

      const authorized = await fetch(
        `${base}/poll/11111111-2222-4333-8444-555555555555`,
      );
      expect(authorized.status).toBe(200);
      const authBody = (await authorized.json()) as Record<string, unknown>;
      expect(authBody).not.toHaveProperty("trmnl");
      const {
        updated_at: _a,
        trmnl: _preview,
        ...studioRest
      } = body;
      const { updated_at: _b, ...authRest } = authBody;
      expect(studioRest).toEqual(authRest);
    } finally {
      delete process.env.TRMNL_POLL_TOKEN;
    }
  });

  it("Studio HTML uses freeform grid and framework screen structure", async () => {
    const base = await listen();
    const html = await (await fetch(`${base}/studio/`)).text();
    expect(html).toMatch(/id="screen-body"/);
    expect(html).toMatch(/creafridge-studio-grid/);
    expect(html).toMatch(/class="title_bar"/);
    expect(html).toMatch(/class="trmnl"/);
    expect(html).toMatch(/screen--og/);
    expect(html).toMatch(/view view--full/);
    expect(html).toMatch(/btn-export-liquid/);
    expect(html).not.toMatch(/id="block-rail"/);
    expect(html).not.toMatch(/id="block-list"/);

    const js = await (await fetch(`${base}/studio/studio.js`)).text();
    expect(js).toContain("GRID_COLS = 12");
    expect(js).toContain("GRID_ROWS = 8");
    expect(js).toContain("creafridge-weather__temp");
    expect(js).toContain("weatherSizeMetrics");
    expect(js).toContain("renderTitleBar");
    expect(js).toContain("title-bar-instance");
    expect(js).toContain("creafridge-battery");
    expect(js).toContain("creafridge-battery-cell");
    expect(js).toContain("creafridge-trash-cell");
    expect(js).toContain("creafridge-calendar");
    expect(js).toContain("text--red");
    expect(js).toContain("fixedSizeFor");
    expect(js).toContain('"battery"');
    expect(js).toContain('"trash"');
    expect(js).toContain("expandLegacyStatusBlocks");
    expect(js).not.toMatch(/BLOCK_IDS = \[[^\]]*"status"/s);
    expect(js).not.toContain("Status · Battery + Waste");
    expect(js).toContain("creafridge-weather");
    expect(js).toContain("°C");
    expect(js).not.toContain("°F");
    expect(js).not.toContain('value--xsmall">Battery');
    expect(js).toContain("data-resize");
    expect(js).toContain("/liquid");
    expect(js).not.toContain("No waste today");
    expect(js).not.toContain("Battery (device var)");
    expect(js).not.toContain("studio-weather");
    expect(js).not.toContain("studio-cal-list");
    expect(js).not.toContain("studio-rail");
    expect(js).not.toContain("Calendar · 7 days");
    expect(js).not.toContain("text--yellow");
    expect(js).not.toContain("value--xlarge");
  });

  it("GET /studio/layout returns default when file missing", async () => {
    await withTempLayoutPath();
    const base = await listen();
    const res = await fetch(`${base}/studio/layout`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: number;
      grid: { cols: number; rows: number };
      blocks: { id: string; x: number; y: number; w: number; h: number }[];
    };
    const def = defaultStudioLayout();
    expect(body.version).toBe(def.version);
    expect(body.grid).toEqual({ cols: 12, rows: 8 });
    expect(body.blocks.map((b) => b.id)).toEqual(def.blocks.map((b) => b.id));
    expect(body.blocks[0]).toMatchObject({ x: 0, y: 0, w: 6, h: 3 });
  });

  it("PUT v1 layout migrates status to battery+trash on write", async () => {
    const file = await withTempLayoutPath();
    const base = await listen();
    const payload = {
      version: 1,
      blocks: [
        { id: "calendar", width: "full" },
        { id: "status", width: "full" },
        { id: "weather_today", width: "half" },
        { id: "weather_tomorrow", width: "half" },
      ],
    };
    const put = await fetch(`${base}/studio/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);
    const saved = (await put.json()) as {
      version: number;
      updated_at: string;
      blocks: { id: string; x: number; w: number }[];
    };
    expect(saved.version).toBe(2);
    expect(saved.blocks.map((b) => b.id)).toEqual([
      "calendar",
      "battery",
      "trash",
      "weather_today",
      "weather_tomorrow",
    ]);
    expect(saved.blocks.find((b) => b.id === "weather_today")).toMatchObject({
      x: 0,
      w: 6,
    });
    expect(saved.blocks.find((b) => b.id === "battery")).toMatchObject({
      w: 1,
      h: 1,
    });
    expect(saved.updated_at).toBeTypeOf("string");

    const get = await fetch(`${base}/studio/layout`);
    expect(get.status).toBe(200);
    const again = (await get.json()) as { version: number; blocks: { id: string }[] };
    expect(again.version).toBe(2);
    expect(again.blocks.map((b) => b.id)).toEqual(saved.blocks.map((b) => b.id));

    const onDisk = JSON.parse(await fs.readFile(file, "utf8")) as {
      version: number;
      blocks: { id: string }[];
    };
    expect(onDisk.version).toBe(2);
    expect(onDisk.blocks.map((b) => b.id)).toEqual(saved.blocks.map((b) => b.id));
  });

  it("PUT /studio/layout then GET roundtrips v2 cells", async () => {
    const file = await withTempLayoutPath();
    const base = await listen();
    const payload = {
      version: 2,
      blocks: [
        { id: "weather_today", x: 0, y: 0, w: 4, h: 3 },
        { id: "weather_tomorrow", x: 4, y: 0, w: 4, h: 3 },
        { id: "battery", x: 8, y: 0, w: 1, h: 1 },
        { id: "trash", x: 9, y: 0, w: 1, h: 1 },
        { id: "calendar", x: 0, y: 3, w: 12, h: 5 },
      ],
    };
    const put = await fetch(`${base}/studio/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);
    const saved = (await put.json()) as {
      blocks: { id: string; x: number; w: number }[];
    };
    expect(saved.blocks.find((b) => b.id === "battery")).toMatchObject({
      x: 8,
      w: 1,
    });
    expect(saved.blocks.find((b) => b.id === "trash")).toMatchObject({
      x: 9,
      w: 1,
    });

    const get = await fetch(`${base}/studio/layout`);
    expect(get.status).toBe(200);
    const again = (await get.json()) as {
      blocks: { id: string; x: number }[];
    };
    expect(again.blocks.find((b) => b.id === "calendar")).toMatchObject({
      x: 0,
    });

    const onDisk = JSON.parse(await fs.readFile(file, "utf8")) as {
      version: number;
    };
    expect(onDisk.version).toBe(2);
  });

  it("POST /studio/layout migrates legacy status strip", async () => {
    await withTempLayoutPath();
    const base = await listen();
    const res = await fetch(`${base}/studio/layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 2,
        blocks: [
          { id: "status", x: 0, y: 0, w: 12, h: 1 },
          { id: "calendar", x: 0, y: 1, w: 12, h: 4 },
          { id: "weather_today", x: 0, y: 5, w: 6, h: 3 },
          { id: "weather_tomorrow", x: 6, y: 5, w: 6, h: 3 },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { blocks: { id: string; w: number }[] };
    expect(body.blocks.map((b) => b.id)).toContain("battery");
    expect(body.blocks.map((b) => b.id)).toContain("trash");
    expect(body.blocks.map((b) => b.id)).not.toContain("status");
    expect(body.blocks.find((b) => b.id === "battery")).toMatchObject({
      w: 1,
      h: 1,
    });
  });

  it("GET /studio/liquid returns paste-ready Full with grid markers", async () => {
    await withTempLayoutPath();
    const base = await listen();
    const res = await fetch(`${base}/studio/liquid`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const text = await res.text();
    expect(text).toMatch(/creafridge-grid/);
    expect(text).toMatch(/grid-template-columns:\s*repeat\(12/);
    expect(text).toMatch(/grid-column:/);
    expect(text).toMatch(/CreaFridge Studio/);
    expect(text).not.toMatch(/studio-/);
    expect(text).toMatch(/title_bar/);
    expect(text).toMatch(/temp_c/);
    expect(text).toMatch(/creafridge-battery/);
    expect(text).not.toMatch(/Status · Battery \+ Waste/);
  });

  it("rejects invalid layout body", async () => {
    await withTempLayoutPath();
    const base = await listen();
    const res = await fetch(`${base}/studio/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, blocks: [{ id: "nope" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects overlapping v2 layout", async () => {
    await withTempLayoutPath();
    const base = await listen();
    const res = await fetch(`${base}/studio/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 2,
        blocks: [
          { id: "weather_today", x: 0, y: 0, w: 8, h: 3 },
          { id: "weather_tomorrow", x: 4, y: 0, w: 6, h: 3 },
          { id: "battery", x: 0, y: 3, w: 1, h: 1 },
          { id: "trash", x: 1, y: 3, w: 1, h: 1 },
          { id: "calendar", x: 0, y: 4, w: 12, h: 4 },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("OPTIONS allows PUT/POST for studio layout", async () => {
    const base = await listen();
    const res = await fetch(`${base}/studio/layout`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const methods = res.headers.get("access-control-allow-methods") ?? "";
    expect(methods).toMatch(/PUT/);
    expect(methods).toMatch(/POST/);
    expect(methods).toMatch(/GET/);
  });

  it("does not break GET /health", async () => {
    const base = await listen();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });
});
