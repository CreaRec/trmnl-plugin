const STORAGE_KEY = "trmnl-studio-layout-v1";
const BLOCK_IDS = [
  "weather_today",
  "weather_tomorrow",
  "status",
  "calendar",
];

const LABELS = {
  weather_today: "Weather · today",
  weather_tomorrow: "Weather · tomorrow",
  status: "Status · battery + waste",
  calendar: "Calendar · 7 days",
};

/** @typedef {{ id: string, width?: "full" | "half" }} LayoutBlock */
/** @typedef {{ version: number, updated_at: string, blocks: LayoutBlock[] }} StudioLayout */

function defaultLayout() {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    blocks: [
      { id: "weather_today", width: "half" },
      { id: "weather_tomorrow", width: "half" },
      { id: "status", width: "full" },
      { id: "calendar", width: "full" },
    ],
  };
}

function studioRootPath() {
  const path = location.pathname.replace(/\/+$/, "") || "/studio";
  const idx = path.lastIndexOf("/studio");
  if (idx >= 0) return path.slice(0, idx + "/studio".length);
  return "/studio";
}

function pollUrl() {
  const root = studioRootPath();
  if (root.startsWith("/trmnl")) return "/trmnl";
  return "/poll";
}

function layoutUrl() {
  return `${studioRootPath()}/layout`;
}

function setStatus(message, tone = "") {
  const el = document.getElementById("studio-status");
  if (!el) return;
  el.textContent = message;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

function normalizeLayout(raw) {
  const base = defaultLayout();
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return base;
  }
  const byId = new Map();
  for (const id of BLOCK_IDS) {
    byId.set(id, {
      id,
      width: id.startsWith("weather_") ? "half" : "full",
    });
  }
  for (const b of raw.blocks) {
    if (b && typeof b.id === "string" && BLOCK_IDS.includes(b.id)) {
      byId.set(b.id, {
        id: b.id,
        width:
          b.width === "half" || b.width === "full"
            ? b.width
            : b.id.startsWith("weather_")
              ? "half"
              : "full",
      });
    }
  }
  // Preserve saved order for known ids
  const ordered = [];
  const seen = new Set();
  for (const b of raw.blocks) {
    if (b && BLOCK_IDS.includes(b.id) && !seen.has(b.id)) {
      ordered.push(byId.get(b.id));
      seen.add(b.id);
    }
  }
  for (const id of BLOCK_IDS) {
    if (!seen.has(id)) ordered.push(byId.get(id));
  }
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    updated_at: new Date().toISOString(),
    blocks: ordered,
  };
}

function loadLocal() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return defaultLayout();
    return normalizeLayout(JSON.parse(text));
  } catch {
    return defaultLayout();
  }
}

function saveLocal(layout) {
  const next = {
    ...normalizeLayout(layout),
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  state.layout = next;
  return next;
}

/** @type {{ layout: StudioLayout, poll: any, dragId: string | null }} */
const state = {
  layout: loadLocal(),
  poll: null,
  dragId: null,
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function weatherHtml(day, title) {
  if (!day) {
    return `<div class="muted">No weather data</div>`;
  }
  const temp =
    day.temp_f != null
      ? `${Math.round(day.temp_f)}°F`
      : day.temp_c != null
        ? `${Math.round(day.temp_c)}°C`
        : "—";
  const range =
    day.low_f != null && day.high_f != null
      ? `${Math.round(day.low_f)}° / ${Math.round(day.high_f)}°`
      : "";
  const icon = day.icon || "https://trmnl.com/images/plugins/weather/wi-na.svg";
  return `
    <div class="studio-weather">
      <img alt="${esc(day.condition || title)}" src="${esc(icon)}" width="40" height="40" />
      <div class="temps">
        <strong>${esc(temp)}</strong>
        <span>${esc(day.condition || "—")}${range ? ` · ${esc(range)}` : ""}</span>
        ${day.precip_summary && day.precip_summary !== "No precip" && day.precip_summary !== "—"
          ? `<span class="text-yellow">${esc(day.precip_summary)}</span>`
          : ""}
      </div>
    </div>`;
}

function statusHtml(poll) {
  const waste = poll?.waste;
  const battery = poll?.trmnl?.device?.percent_charged;
  const parts = [];
  if (battery != null) {
    parts.push(`<span class="badge">Battery ${esc(battery)}%</span>`);
  } else {
    parts.push(`<span class="badge muted">Battery (device var)</span>`);
  }
  if (waste?.active && waste.label) {
    const cls =
      waste.kind === "trash_recycle" ? "badge badge--waste-recycle" : "badge badge--waste";
    parts.push(`<span class="${cls}">${esc(waste.label)}</span>`);
  } else {
    parts.push(`<span class="badge muted">No waste today</span>`);
  }
  return `<div class="studio-status-row">${parts.join("")}</div>`;
}

function calendarHtml(poll) {
  const days = Array.isArray(poll?.days) ? poll.days : [];
  if (!days.length) {
    return `<div class="muted">No calendar days</div>`;
  }
  const items = days
    .map((day) => {
      const events = Array.isArray(day.events) ? day.events : [];
      const text =
        events.length === 0
          ? `<span class="muted">—</span>`
          : events
              .slice(0, 4)
              .map(
                (e) =>
                  `${esc(e.time_label || "")} ${esc(e.title || "")}`.trim(),
              )
              .join("<br>");
      return `<li class="studio-cal-day">
        <span class="studio-cal-day__label">${esc(day.label || day.key)}</span>
        <span class="studio-cal-day__events">${text}</span>
      </li>`;
    })
    .join("");
  return `<ul class="studio-cal-list">${items}</ul>`;
}

function blockBody(id, poll) {
  switch (id) {
    case "weather_today":
      return weatherHtml(poll?.weather?.today, "Today");
    case "weather_tomorrow":
      return weatherHtml(poll?.weather?.tomorrow, "Tomorrow");
    case "status":
      return statusHtml(poll);
    case "calendar":
      return calendarHtml(poll);
    default:
      return "";
  }
}

function blockElement(block, index, total) {
  const el = document.createElement("div");
  el.className = "studio-block outline rounded--medium p--2";
  el.dataset.blockId = block.id;
  el.dataset.width = block.width || "full";
  el.draggable = true;
  el.innerHTML = `
    <div class="studio-block__chrome">
      <span class="studio-block__label">${esc(LABELS[block.id] || block.id)}</span>
      <div class="studio-block__controls">
        <button type="button" data-move="up" aria-label="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-move="down" aria-label="Move down" ${index === total - 1 ? "disabled" : ""}>↓</button>
        <span class="studio-block__handle" aria-hidden="true">⠿</span>
      </div>
    </div>
    <div class="studio-block__body">${blockBody(block.id, state.poll)}</div>
  `;
  el.addEventListener("dragstart", onDragStart);
  el.addEventListener("dragend", onDragEnd);
  el.addEventListener("dragover", onDragOver);
  el.addEventListener("dragleave", onDragLeave);
  el.addEventListener("drop", onDrop);
  el.querySelectorAll("[data-move]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      moveBlock(block.id, btn.getAttribute("data-move"));
    });
    // Prevent drag from starting on buttons
    btn.addEventListener("mousedown", (ev) => ev.stopPropagation());
  });
  return el;
}

function moveBlock(id, direction) {
  const blocks = [...state.layout.blocks];
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) return;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= blocks.length) return;
  const [moved] = blocks.splice(idx, 1);
  blocks.splice(target, 0, moved);
  state.layout = saveLocal({ ...state.layout, blocks });
  renderBlocks();
  setStatus("Saved locally (auto)", "ok");
  scheduleAutoSync();
}

function renderBlocks() {
  const list = document.getElementById("block-list");
  if (!list) return;
  list.innerHTML = "";
  const blocks = state.layout.blocks;
  blocks.forEach((b, i) => {
    list.appendChild(blockElement(b, i, blocks.length));
  });

  const screen = document.getElementById("screen");
  if (screen && !document.documentElement.classList.contains("has-trmnl-css")) {
    screen.classList.add("studio-fallback");
  }

  const updated = document.getElementById("updated-label");
  if (updated) {
    updated.textContent = state.poll?.updated_at
      ? `updated ${state.poll.updated_at}`
      : "loading…";
  }
}

function onDragStart(ev) {
  const el = /** @type {HTMLElement} */ (ev.currentTarget);
  // Don't start drag from control buttons
  if (ev.target instanceof HTMLElement && ev.target.closest("[data-move]")) {
    ev.preventDefault();
    return;
  }
  state.dragId = el.dataset.blockId ?? null;
  el.classList.add("is-dragging");
  ev.dataTransfer.effectAllowed = "move";
  if (state.dragId) {
    ev.dataTransfer.setData("text/plain", state.dragId);
  }
  // Transparent drag image reduces nested-content ghosts
  try {
    const ghost = document.createElement("div");
    ghost.style.width = "1px";
    ghost.style.height = "1px";
    ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    ev.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => ghost.remove());
  } catch {
    /* ignore */
  }
}

function onDragEnd(ev) {
  ev.currentTarget.classList.remove("is-dragging");
  state.dragId = null;
  document
    .querySelectorAll(".is-drag-over")
    .forEach((n) => n.classList.remove("is-drag-over"));
}

function onDragOver(ev) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "move";
  const el = ev.currentTarget;
  if (el.dataset.blockId !== state.dragId) {
    el.classList.add("is-drag-over");
  }
}

function onDragLeave(ev) {
  ev.currentTarget.classList.remove("is-drag-over");
}

function onDrop(ev) {
  ev.preventDefault();
  const target = ev.currentTarget;
  target.classList.remove("is-drag-over");
  const fromId = state.dragId || ev.dataTransfer.getData("text/plain");
  const toId = target.dataset.blockId;
  if (!fromId || !toId || fromId === toId) return;

  const blocks = [...state.layout.blocks];
  const fromIdx = blocks.findIndex((b) => b.id === fromId);
  const toIdx = blocks.findIndex((b) => b.id === toId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = blocks.splice(fromIdx, 1);
  blocks.splice(toIdx, 0, moved);
  state.layout = saveLocal({ ...state.layout, blocks });
  renderBlocks();
  setStatus("Saved locally (auto)", "ok");
  scheduleAutoSync();
}

let autoSyncTimer = null;
function scheduleAutoSync() {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    void syncToServer({ quiet: true });
  }, 2500);
}

async function fetchPoll() {
  const res = await fetch(pollUrl(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`poll HTTP ${res.status}`);
  state.poll = await res.json();
  renderBlocks();
  setStatus(`Poll loaded · ${state.poll.updated_at || "ok"}`, "ok");
}

async function syncToServer({ quiet = false } = {}) {
  const body = saveLocal(state.layout);
  const res = await fetch(layoutUrl(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `sync HTTP ${res.status}`);
  }
  const saved = await res.json();
  state.layout = normalizeLayout(saved);
  saveLocal(state.layout);
  renderBlocks();
  if (!quiet) setStatus(`Synced to server · ${saved.updated_at}`, "ok");
  else setStatus(`Auto-synced · ${saved.updated_at}`, "ok");
}

async function loadFromServer() {
  const res = await fetch(layoutUrl(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`load HTTP ${res.status}`);
  const layout = normalizeLayout(await res.json());
  state.layout = saveLocal(layout);
  renderBlocks();
  setStatus(`Loaded from server · ${layout.updated_at}`, "ok");
}

function resetDefault() {
  state.layout = saveLocal(defaultLayout());
  renderBlocks();
  setStatus("Reset to default (local)", "ok");
}

function wireActions() {
  document.getElementById("btn-save-local")?.addEventListener("click", () => {
    saveLocal(state.layout);
    setStatus("Saved to localStorage", "ok");
  });
  document.getElementById("btn-sync-server")?.addEventListener("click", () => {
    void syncToServer().catch((e) =>
      setStatus(e instanceof Error ? e.message : "sync failed", "err"),
    );
  });
  document.getElementById("btn-load-server")?.addEventListener("click", () => {
    void loadFromServer().catch((e) =>
      setStatus(e instanceof Error ? e.message : "load failed", "err"),
    );
  });
  document.getElementById("btn-reset")?.addEventListener("click", () => {
    resetDefault();
  });
  document.getElementById("btn-refresh-poll")?.addEventListener("click", () => {
    void fetchPoll().catch((e) =>
      setStatus(e instanceof Error ? e.message : "poll failed", "err"),
    );
  });
}

function ensureTrailingSlash() {
  // Relative CSS/JS resolve correctly with a trailing slash.
  if (!location.pathname.endsWith("/") && !location.pathname.endsWith(".html")) {
    const next = `${location.pathname}/${location.search}${location.hash}`;
    history.replaceState(null, "", next);
  }
}

async function boot() {
  ensureTrailingSlash();
  wireActions();
  state.layout = loadLocal();
  renderBlocks();
  // Mark fallback until CDN onload adds has-trmnl-css
  setTimeout(() => {
    if (!document.documentElement.classList.contains("has-trmnl-css")) {
      document.documentElement.classList.add("no-trmnl-css");
      document.getElementById("screen")?.classList.add("studio-fallback");
    }
  }, 1500);
  try {
    await fetchPoll();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "poll failed", "err");
  }
  // Refresh poll periodically
  setInterval(() => {
    void fetchPoll().catch(() => {});
  }, 60_000);
}

boot();
