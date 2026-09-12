// Layout playground. Screen body mirrors markup/full.liquid (TRMNL framework
// classes). DnD chrome lives in the side rail — never inside the 800×480 cards.
const STORAGE_KEY = "trmnl-studio-layout-v1";
const BLOCK_IDS = [
  "weather_today",
  "weather_tomorrow",
  "status",
  "calendar",
];

const LABELS = {
  weather_today: "Weather · Today",
  weather_tomorrow: "Weather · Tomorrow",
  status: "Status · Battery + Waste",
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
  return `${studioRootPath()}/poll`;
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

/**
 * Weather card — matches markup/full.liquid weather col.
 * @param {{ preferHigh?: boolean }} opts preferHigh mirrors Liquid tomorrow fallbacks
 */
function weatherCardHtml(day, label, opts = {}) {
  const preferHigh = Boolean(opts.preferHigh);
  const condition = day?.condition || "—";
  const icon =
    day?.icon || "https://trmnl.com/images/plugins/weather/wi-na.svg";
  let temp = "—";
  if (day?.temp_f != null) temp = `${Math.round(day.temp_f)}°F`;
  else if (preferHigh && day?.high_f != null)
    temp = `${Math.round(day.high_f)}°F`;
  else if (day?.temp_c != null) temp = `${Math.round(day.temp_c)}°C`;
  else if (preferHigh && day?.high_c != null)
    temp = `${Math.round(day.high_c)}°C`;

  const range =
    day?.low_f != null && day?.high_f != null
      ? ` · ${Math.round(day.low_f)}° / ${Math.round(day.high_f)}°`
      : "";

  return `
    <div class="col outline rounded--medium p--2 flex flex--col gap--small">
      <span class="label">${esc(label)}</span>
      <div class="flex flex--row flex--center-y gap--medium">
        <img
          class="image--adaptive image--small"
          alt="${esc(condition)}"
          src="${esc(icon)}"
        >
        <div class="flex flex--col gap--xsmall grow">
          <span class="value value--xlarge" data-fit-value="true">${esc(temp)}</span>
          <span class="label">${esc(condition)}${esc(range)}</span>
        </div>
      </div>
    </div>`;
}

/**
 * Status card — Liquid parity:
 * battery pill only when trmnl.device.percent_charged is present;
 * waste pill only when waste.active (omit inactive waste).
 */
function statusCardHtml(poll) {
  const waste = poll?.waste;
  const battery = poll?.trmnl?.device?.percent_charged;
  const pills = [];

  if (battery != null && battery !== "") {
    const pct =
      typeof battery === "number" ? Math.round(battery) : esc(battery);
    pills.push(`
      <div class="outline rounded--medium px--2 py--1">
        <span class="value value--xsmall">Battery ${pct}%</span>
      </div>`);
  }

  if (waste?.active) {
    const colorCls =
      waste.kind === "trash_recycle" ? "text--yellow" : "text--red";
    const label = waste.label || "Bins out";
    pills.push(`
      <div class="outline rounded--medium px--2 py--1">
        <span class="value value--xsmall ${colorCls}">${esc(label)}</span>
      </div>`);
  }

  return `
    <div class="outline rounded--medium p--2 flex flex--col gap--small">
      <span class="label">${esc(LABELS.status)}</span>
      <div class="flex flex--row gap--small flex--center-y flex--wrap">
        ${pills.join("")}
      </div>
    </div>`;
}

/** Calendar card — every day in days[]; events or "—". */
function calendarCardHtml(poll) {
  const days = Array.isArray(poll?.days) ? poll.days : [];
  const events = Array.isArray(poll?.events) ? poll.events : [];

  let rows = "";
  if (days.length > 0) {
    rows = days
      .map((day) => {
        const dayEvents = Array.isArray(day.events) ? day.events : [];
        const labelCls = day.is_today ? "label text--yellow" : "label";
        let body;
        if (dayEvents.length > 0) {
          body = dayEvents
            .map(
              (e) =>
                `<span class="title title--small">${esc(e.time_label || "")} ${esc(e.title || "")}</span>`,
            )
            .join("");
        } else {
          body = `<span class="description">—</span>`;
        }
        return `
          <div class="grid grid--cols-4 gap--xsmall">
            <div class="col">
              <span class="${labelCls}">${esc(day.label || day.key || "")}</span>
            </div>
            <div class="col col--span-3 flex flex--col gap--xsmall">
              ${body}
            </div>
          </div>`;
      })
      .join("");
  } else if (events.length > 0) {
    rows = events
      .map(
        (event) => `
          <div class="grid grid--cols-4 gap--xsmall">
            <div class="col">
              <span class="label">${esc(event.day_label || "")}</span>
            </div>
            <div class="col col--span-3">
              <span class="title title--small">${esc(event.time_label || "")} ${esc(event.title || "")}</span>
            </div>
          </div>`,
      )
      .join("");
  } else {
    rows = `<span class="description">—</span>`;
  }

  return `
    <div class="outline rounded--medium p--2 flex flex--col gap--small">
      <span class="label">${esc(LABELS.calendar)}</span>
      <div class="flex flex--col gap--xsmall">
        ${rows}
      </div>
    </div>`;
}

function blockCardHtml(block, poll) {
  switch (block.id) {
    case "weather_today":
      return weatherCardHtml(poll?.weather?.today, LABELS.weather_today);
    case "weather_tomorrow":
      return weatherCardHtml(poll?.weather?.tomorrow, LABELS.weather_tomorrow, {
        preferHigh: true,
      });
    case "status":
      return statusCardHtml(poll);
    case "calendar":
      return calendarCardHtml(poll);
    default:
      return "";
  }
}

/** Group consecutive half-width blocks into grid--cols-2 like Liquid. */
function screenBodyHtml(blocks, poll) {
  const parts = [];
  let i = 0;
  while (i < blocks.length) {
    const cur = blocks[i];
    const next = blocks[i + 1];
    if (cur.width === "half" && next && next.width === "half") {
      parts.push(`
        <div class="grid grid--cols-2 gap--small">
          ${blockCardHtml(cur, poll)}
          ${blockCardHtml(next, poll)}
        </div>`);
      i += 2;
    } else {
      parts.push(blockCardHtml(cur, poll));
      i += 1;
    }
  }
  return parts.join("");
}

function railItemElement(block, index, total) {
  const el = document.createElement("div");
  el.className = "studio-rail__item";
  el.dataset.blockId = block.id;
  el.draggable = true;
  el.innerHTML = `
    <span class="studio-rail__label">${esc(LABELS[block.id] || block.id)}</span>
    <div class="studio-rail__controls">
      <button type="button" data-move="up" aria-label="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
      <button type="button" data-move="down" aria-label="Move down" ${index === total - 1 ? "disabled" : ""}>↓</button>
      <span class="studio-rail__handle" aria-hidden="true">⠿</span>
    </div>
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
  render();
  setStatus("Saved locally (auto)", "ok");
  scheduleAutoSync();
}

function renderTitleBar() {
  const titleEl = document.getElementById("title-bar-title");
  const instanceEl = document.getElementById("title-bar-instance");
  const poll = state.poll;
  if (titleEl) {
    titleEl.textContent =
      poll?.plugin_label || poll?.title || "CreaFridge";
  }
  if (instanceEl) {
    instanceEl.textContent =
      poll?.trmnl?.plugin_settings?.instance_name || "My Plugin";
  }
}

function render() {
  const body = document.getElementById("screen-body");
  if (body) {
    body.innerHTML = screenBodyHtml(state.layout.blocks, state.poll);
  }

  const rail = document.getElementById("block-rail");
  if (rail) {
    rail.innerHTML = "";
    const blocks = state.layout.blocks;
    blocks.forEach((b, i) => {
      rail.appendChild(railItemElement(b, i, blocks.length));
    });
  }

  renderTitleBar();

  const screen = document.getElementById("screen");
  if (screen && !document.documentElement.classList.contains("has-trmnl-css")) {
    screen.classList.add("studio-fallback");
  }

  const updated = document.getElementById("updated-label");
  if (updated) {
    updated.textContent = state.poll?.updated_at
      ? `CreaFridge updated ${state.poll.updated_at}`
      : "loading…";
  }
}

function onDragStart(ev) {
  const el = /** @type {HTMLElement} */ (ev.currentTarget);
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
  render();
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
  render();
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
  render();
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
  render();
  setStatus(`Loaded from server · ${layout.updated_at}`, "ok");
}

function resetDefault() {
  state.layout = saveLocal(defaultLayout());
  render();
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
  if (!location.pathname.endsWith("/") && !location.pathname.endsWith(".html")) {
    const next = `${location.pathname}/${location.search}${location.hash}`;
    history.replaceState(null, "", next);
  }
}

async function boot() {
  ensureTrailingSlash();
  wireActions();
  state.layout = loadLocal();
  render();
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
  setInterval(() => {
    void fetchPoll().catch(() => {});
  }, 60_000);
}

boot();
