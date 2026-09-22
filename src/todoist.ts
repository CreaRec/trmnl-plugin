import { createTtlCache, type TtlCache } from "./cache.js";

/** Default Todoist project «Покупки» (shopping). */
export const DEFAULT_TODOIST_PROJECT_ID = "6hc3F4VwmP24XJCM";

/** Todoist unified API v1 (REST v2 was shut down; returns HTTP 410). */
const TODOIST_TASKS_URL = "https://api.todoist.com/api/v1/tasks";

export type ShoppingItem = {
  id: string;
  content: string;
  order: number;
};

export type ShoppingPayload = {
  project_id: string | null;
  label: string;
  items: ShoppingItem[];
  configured: boolean;
  error: string | null;
};

export type ShoppingFetchOptions = {
  token: string | null;
  projectId?: string | null;
  cacheMs: number;
  fetchImpl?: typeof fetch;
  cache?: TtlCache<ShoppingPayload>;
};

let defaultShoppingCache: TtlCache<ShoppingPayload> | null = null;

function getDefaultShoppingCache(ttlMs: number): TtlCache<ShoppingPayload> {
  if (!defaultShoppingCache) {
    defaultShoppingCache = createTtlCache<ShoppingPayload>(ttlMs);
  }
  return defaultShoppingCache;
}

export function resetShoppingCache(): void {
  defaultShoppingCache?.clear();
  defaultShoppingCache = null;
}

type TodoistTask = {
  id?: unknown;
  content?: unknown;
  order?: unknown;
  is_completed?: unknown;
};

function emptyShopping(
  projectId: string | null,
  error: string | null,
  configured: boolean,
): ShoppingPayload {
  return {
    project_id: projectId,
    label: "Shopping",
    items: [],
    configured,
    error,
  };
}

/** Normalize a bare task array or v1 `{ results }` list payload. */
export function normalizeTodoistTaskList(tasks: unknown): unknown[] {
  if (Array.isArray(tasks)) return tasks;
  if (tasks != null && typeof tasks === "object") {
    const results = (tasks as { results?: unknown }).results;
    if (Array.isArray(results)) return results;
  }
  return [];
}

/** Map Todoist tasks into a simple shopping list (active/incomplete only). */
export function mapTodoistTasksToShopping(
  tasks: unknown,
  projectId: string,
): ShoppingPayload {
  const list = normalizeTodoistTaskList(tasks);
  const items: ShoppingItem[] = [];

  for (const raw of list) {
    if (raw == null || typeof raw !== "object") continue;
    const task = raw as TodoistTask;
    if (task.is_completed === true) continue;
    const id = task.id == null ? "" : String(task.id).trim();
    const content =
      typeof task.content === "string" ? task.content.trim() : "";
    if (!id || !content) continue;
    const order =
      typeof task.order === "number" && Number.isFinite(task.order)
        ? task.order
        : items.length;
    items.push({ id, content, order });
  }

  items.sort((a, b) => a.order - b.order || a.content.localeCompare(b.content));

  return {
    project_id: projectId,
    label: "Shopping",
    items,
    configured: true,
    error: null,
  };
}

/** Fetch active tasks from a Todoist project (API v1). */
export async function fetchShopping(
  options: ShoppingFetchOptions,
): Promise<ShoppingPayload> {
  const token = options.token?.trim() || null;
  const projectId =
    options.projectId?.trim() || DEFAULT_TODOIST_PROJECT_ID;
  const cache = options.cache ?? getDefaultShoppingCache(options.cacheMs);

  if (!token) {
    return emptyShopping(projectId, null, false);
  }

  const cached = cache.get();
  if (cached) return cached;

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(TODOIST_TASKS_URL);
  url.searchParams.set("project_id", projectId);

  try {
    const res = await fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const payload = emptyShopping(
        projectId,
        `todoist_http_${res.status}`,
        true,
      );
      // Cache brief failures so a bad token does not hammer Todoist every poll
      cache.set(payload);
      return payload;
    }
    const json: unknown = await res.json();
    const payload = mapTodoistTasksToShopping(json, projectId);
    cache.set(payload);
    return payload;
  } catch {
    const payload = emptyShopping(projectId, "todoist_fetch_failed", true);
    cache.set(payload);
    return payload;
  }
}

export type CompleteShoppingOptions = {
  token: string | null;
  taskId: string;
  fetchImpl?: typeof fetch;
};

/** Mark a Todoist task complete (bought). Clears shopping cache on success. */
export async function completeShoppingItem(
  options: CompleteShoppingOptions,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const token = options.token?.trim() || null;
  const taskId = options.taskId?.trim() || "";
  if (!token) {
    return { ok: false, error: "todoist_not_configured" };
  }
  if (!taskId || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
    return { ok: false, error: "invalid_task_id" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${TODOIST_TASKS_URL}/${encodeURIComponent(taskId)}/close`;

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok && res.status !== 204) {
      return {
        ok: false,
        error: `todoist_http_${res.status}`,
        status: res.status,
      };
    }
    resetShoppingCache();
    return { ok: true };
  } catch {
    return { ok: false, error: "todoist_complete_failed" };
  }
}
