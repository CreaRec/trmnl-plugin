import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TODOIST_PROJECT_ID,
  completeShoppingItem,
  fetchShopping,
  mapTodoistTasksToShopping,
  resetShoppingCache,
} from "../src/todoist.js";

afterEach(() => {
  resetShoppingCache();
});

describe("todoist shopping", () => {
  it("maps active tasks and skips completed / empty", () => {
    const payload = mapTodoistTasksToShopping(
      [
        { id: "b", content: "Bread", order: 2, is_completed: false },
        { id: "a", content: "Milk", order: 1 },
        { id: "c", content: "Done", order: 0, is_completed: true },
        { id: "", content: "Nope" },
        { id: "d", content: "  " },
      ],
      DEFAULT_TODOIST_PROJECT_ID,
    );
    expect(payload.configured).toBe(true);
    expect(payload.error).toBeNull();
    expect(payload.label).toBe("Shopping");
    expect(payload.items).toEqual([
      { id: "a", content: "Milk", order: 1 },
      { id: "b", content: "Bread", order: 2 },
    ]);
  });

  it("maps API v1 { results } list payloads", () => {
    const payload = mapTodoistTasksToShopping(
      {
        results: [
          { id: "1", content: "Eggs", order: 1 },
          { id: "2", content: "Butter", order: 2 },
        ],
        next_cursor: null,
      },
      "proj1",
    );
    expect(payload.items.map((i) => i.content)).toEqual(["Eggs", "Butter"]);
  });

  it("returns unconfigured empty list without token", async () => {
    const payload = await fetchShopping({
      token: null,
      cacheMs: 60_000,
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    });
    expect(payload.configured).toBe(false);
    expect(payload.items).toEqual([]);
    expect(payload.project_id).toBe(DEFAULT_TODOIST_PROJECT_ID);
  });

  it("fetches Todoist API v1 tasks with Bearer token", async () => {
    const calls: { url: string; headers: HeadersInit | undefined }[] = [];
    const payload = await fetchShopping({
      token: "test-token",
      projectId: "proj1",
      cacheMs: 60_000,
      fetchImpl: async (input, init) => {
        calls.push({
          url: String(input),
          headers: init?.headers,
        });
        return new Response(
          JSON.stringify({
            results: [
              { id: "1", content: "Eggs", order: 1 },
              { id: "2", content: "Butter", order: 2 },
            ],
            next_cursor: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("project_id=proj1");
    expect(calls[0]!.url).toContain("api.todoist.com/api/v1/tasks");
    expect(calls[0]!.url).not.toContain("rest/v2");
    const auth = new Headers(calls[0]!.headers).get("Authorization");
    expect(auth).toBe("Bearer test-token");
    expect(payload.items.map((i) => i.content)).toEqual(["Eggs", "Butter"]);
  });

  it("caches successful fetches", async () => {
    let hits = 0;
    const fetchImpl: typeof fetch = async () => {
      hits += 1;
      return new Response(
        JSON.stringify({
          results: [{ id: "1", content: "Milk", order: 1 }],
        }),
        { status: 200 },
      );
    };
    const a = await fetchShopping({
      token: "t",
      cacheMs: 60_000,
      fetchImpl,
    });
    const b = await fetchShopping({
      token: "t",
      cacheMs: 60_000,
      fetchImpl,
    });
    expect(hits).toBe(1);
    expect(a.items).toEqual(b.items);
  });

  it("closes a task via API v1 and clears cache", async () => {
    let hits = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      hits += 1;
      const url = String(input);
      if (url.includes("/close")) {
        expect(url).toBe("https://api.todoist.com/api/v1/tasks/abc123/close");
        expect(init?.method).toBe("POST");
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify({
          results: [{ id: "1", content: "Milk", order: 1 }],
        }),
        { status: 200 },
      );
    };
    await fetchShopping({ token: "t", cacheMs: 60_000, fetchImpl });
    expect(hits).toBe(1);
    const closed = await completeShoppingItem({
      token: "t",
      taskId: "abc123",
      fetchImpl,
    });
    expect(closed).toEqual({ ok: true });
    await fetchShopping({ token: "t", cacheMs: 60_000, fetchImpl });
    expect(hits).toBe(3);
  });

  it("rejects invalid task ids", async () => {
    const result = await completeShoppingItem({
      token: "t",
      taskId: "../evil",
    });
    expect(result).toEqual({ ok: false, error: "invalid_task_id" });
  });
});
