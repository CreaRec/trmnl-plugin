// Freeform 12×8 cell grid playground. Block bodies use TRMNL framework classes;
// position/size come from layout v2 cell rects. Collision: prevent overlap.
const STORAGE_KEY = "trmnl-studio-layout-v2";
const STORAGE_KEY_V1 = "trmnl-studio-layout-v1";

const GRID_COLS = 12;
const GRID_ROWS = 8;
const MIN_W = 2;
const MIN_H = 2;

const BLOCK_IDS = [
  "weather_today",
  "weather_tomorrow",
  "battery",
  "trash",
  "calendar",
];

const LABELS = {
  weather_today: "Weather · Today",
  weather_tomorrow: "Weather · Tomorrow",
  battery: "Battery",
  trash: "Waste",
  calendar: "Calendar",
};

/** @typedef {{ id: string, x: number, y: number, w: number, h: number }} LayoutBlock */
/** @typedef {{ version: number, updated_at: string, grid: { cols: number, rows: number }, blocks: LayoutBlock[] }} StudioLayout */

function minSizeFor(id) {
  if (id === "battery" || id === "trash") return { w: 1, h: 1 };
  return { w: MIN_W, h: MIN_H };
}

function fixedSizeFor(id) {
  if (id === "battery" || id === "trash") return { w: 1, h: 1 };
  return null;
}

function defaultBlockRects() {
  return [
    { id: "weather_today", x: 0, y: 0, w: 6, h: 3 },
    { id: "weather_tomorrow", x: 6, y: 0, w: 6, h: 3 },
    { id: "battery", x: 0, y: 3, w: 1, h: 1 },
    { id: "trash", x: 1, y: 3, w: 1, h: 1 },
    { id: "calendar", x: 0, y: 4, w: 12, h: 4 },
  ];
}

function defaultLayout() {
  return {
    version: 2,
    updated_at: new Date().toISOString(),
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    blocks: defaultBlockRects(),
  };
}

function clampInt(n, min, max) {
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function clampRect(raw, id) {
  const fixed = fixedSizeFor(id);
  const mins = minSizeFor(id);
  const w = clampInt(fixed ? fixed.w : raw.w, mins.w, GRID_COLS);
  const h = clampInt(fixed ? fixed.h : raw.h, mins.h, GRID_ROWS);
  const x = clampInt(raw.x, 0, Math.max(0, GRID_COLS - w));
  const y = clampInt(raw.y, 0, Math.max(0, GRID_ROWS - h));
  return { x, y, w, h };
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function wouldOverlap(blocks, candidate, skipId) {
  return blocks.some(
    (b) => b.id !== skipId && rectsOverlap(candidate, b),
  );
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

function liquidUrl() {
  return `${studioRootPath()}/liquid`;
}

function setStatus(message, tone = "") {
  const el = document.getElementById("studio-status");
  if (!el) return;
  el.textContent = message;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

function expandLegacyStatusBlocks(blocks) {
  const hasBattery = blocks.some((b) => b && b.id === "battery");
  const hasTrash = blocks.some((b) => b && b.id === "trash");
  const out = [];
  for (const block of blocks) {
    if (!block || block.id !== "status") {
      if (block) out.push(block);
      continue;
    }
    if (hasBattery && hasTrash) continue;
    const hasCells =
      block.x != null || block.y != null || block.w != null || block.h != null;
    if (hasCells && Number.isFinite(Number(block.x)) && Number.isFinite(Number(block.y))) {
      const bx = clampInt(Number(block.x), 0, GRID_COLS - 1);
      const by = clampInt(Number(block.y), 0, GRID_ROWS - 1);
      let tx = bx + 1;
      if (tx >= GRID_COLS) tx = Math.max(0, bx - 1);
      if (!hasBattery) out.push({ id: "battery", x: bx, y: by, w: 1, h: 1 });
      if (!hasTrash) out.push({ id: "trash", x: tx, y: by, w: 1, h: 1 });
    } else {
      if (!hasBattery) out.push({ id: "battery", width: block.width });
      if (!hasTrash) out.push({ id: "trash", width: block.width });
    }
  }
  return out;
}

function migrateV1Blocks(v1Blocks) {
  const defaults = defaultBlockRects();
  const byId = new Map(defaults.map((b) => [b.id, { ...b }]));
  const ordered = [];
  const seen = new Set();
  for (const b of v1Blocks) {
    if (b && BLOCK_IDS.includes(b.id) && !seen.has(b.id)) {
      ordered.push(byId.get(b.id));
      seen.add(b.id);
    }
  }
  for (const id of BLOCK_IDS) {
    if (!seen.has(id)) ordered.push(byId.get(id));
  }
  return ordered;
}

function normalizeLayout(raw) {
  const base = defaultLayout();
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return base;
  }

  const expanded = expandLegacyStatusBlocks(raw.blocks);

  const looksLikeV1 = expanded.every((b) => {
    if (!b || typeof b !== "object") return true;
    return b.x == null && b.y == null && b.w == null && b.h == null;
  });

  let blocks;
  if (raw.version <= 1 || looksLikeV1) {
    blocks = migrateV1Blocks(expanded);
  } else {
    const byId = new Map();
    for (const id of BLOCK_IDS) {
      byId.set(id, { ...defaultBlockRects().find((b) => b.id === id) });
    }
    for (const b of expanded) {
      if (b && typeof b.id === "string" && BLOCK_IDS.includes(b.id)) {
        const rect = clampRect(
          {
            x: Number(b.x) || 0,
            y: Number(b.y) || 0,
            w: Number(b.w) || MIN_W,
            h: Number(b.h) || MIN_H,
          },
          b.id,
        );
        byId.set(b.id, { id: b.id, ...rect });
      }
    }
    blocks = BLOCK_IDS.map((id) => byId.get(id));
    // If overlaps after clamp, fall back to defaults
    let overlap = false;
    for (let i = 0; i < blocks.length && !overlap; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (rectsOverlap(blocks[i], blocks[j])) {
          overlap = true;
          break;
        }
      }
    }
    if (overlap) blocks = defaultBlockRects();
  }

  return {
    version: 2,
    updated_at:
      typeof raw.updated_at === "string"
        ? raw.updated_at
        : new Date().toISOString(),
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    blocks,
  };
}

function loadLocal() {
  try {
    let text = localStorage.getItem(STORAGE_KEY);
    if (!text) {
      text = localStorage.getItem(STORAGE_KEY_V1);
    }
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

/** @type {{ layout: StudioLayout, poll: any, selectedId: string | null, interaction: any }} */
const state = {
  layout: loadLocal(),
  poll: null,
  selectedId: null,
  interaction: null,
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Mirror src/studio-liquid.ts weatherLayoutVariant thresholds. */
function weatherLayoutVariant(w, h) {
  if (w <= 2 || (w <= 3 && h <= 2)) return "compact";
  if (w > h && w >= 4) return "wide";
  if (h > w) return "tall";
  return "balanced";
}

/** Mirror src/studio-liquid.ts weatherSizeMetrics. */
function weatherSizeMetrics(w, h) {
  const ww = Math.max(1, Math.trunc(w));
  const hh = Math.max(1, Math.trunc(h));
  const short = Math.min(ww, hh);
  const contentW = Math.max(20, ww * 66.7 - 12);
  const titleReserve = hh <= 2 || ww <= 2 ? 0 : 14;
  const contentH = Math.max(18, hh * 60 - 8 - titleReserve);

  let iconPx = Math.round(10 + short * 5 + Math.min(ww, 5) * 1.25);
  if (hh >= 3) iconPx = Math.round(Math.max(iconPx, contentH * (hh >= 4 ? 0.58 : 0.45)));
  const iconWCap = hh >= 4 ? 0.48 : hh >= 3 ? 0.4 : 0.3;
  const iconHCap = hh >= 4 ? 0.72 : hh >= 3 ? 0.62 : 0.5;
  iconPx = Math.min(
    iconPx,
    Math.floor(contentW * iconWCap),
    Math.floor(contentH * iconHCap),
  );
  iconPx = Math.max(12, iconPx);

  const gapPx = Math.round(Math.min(10, Math.max(2, short)));
  const remaining = Math.max(14, contentW - iconPx - gapPx);
  const tempFromWidth = remaining / (4 * 15);
  const tempFromSpan = 0.55 + (ww - 1) * 0.14 + (hh - 1) * 0.22;
  const tempFromHeight = contentH / (hh >= 4 ? 40 : 52);
  const tempCap =
    ww <= 2 || (ww <= 3 && hh <= 2)
      ? 1.05
      : hh <= 2
        ? 1.35
        : hh <= 3
          ? 1.9
          : 3.1;
  const desired = Math.min(
    tempCap,
    Math.max(0.72, (tempFromSpan + tempFromHeight) / 2),
  );
  const tempEm = Math.round(Math.min(desired, tempFromWidth) * 100) / 100;
  const metaEm =
    Math.round(
      Math.min(
        1.1,
        Math.max(0.55, 0.5 + short * 0.07 + Math.max(0, hh - 2) * 0.05),
      ) * 100,
    ) / 100;
  return { iconPx, tempEm, gapPx, metaEm };
}

function weatherSizeStyle(w, h) {
  const m = weatherSizeMetrics(w, h);
  const ww = Math.max(1, Math.trunc(w));
  const hh = Math.max(1, Math.trunc(h));
  return `--cf-cols:${ww};--cf-rows:${hh};--cf-icon:${m.iconPx}px;--cf-temp:${m.tempEm}em;--cf-gap:${m.gapPx}px;--cf-meta:${m.metaEm}em`;
}

function applyWeatherSizeVars(card, w, h) {
  const m = weatherSizeMetrics(w, h);
  const ww = Math.max(1, Math.trunc(w));
  const hh = Math.max(1, Math.trunc(h));
  card.style.setProperty("--cf-cols", String(ww));
  card.style.setProperty("--cf-rows", String(hh));
  card.style.setProperty("--cf-icon", `${m.iconPx}px`);
  card.style.setProperty("--cf-temp", `${m.tempEm}em`);
  card.style.setProperty("--cf-gap", `${m.gapPx}px`);
  card.style.setProperty("--cf-meta", `${m.metaEm}em`);
}

/** Mirror src/battery.ts — ceil(pct/25) clamped to 1..4; <25% is low/red. */
function batterySegments(percent) {
  const pct = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, percent))
    : 0;
  const filled = Math.min(4, Math.max(1, Math.ceil(pct / 25)));
  return { filled, low: pct < 25, pct: Math.round(pct) };
}

function weatherCardHtml(day, label, opts = {}) {
  const preferHigh = Boolean(opts.preferHigh);
  const w = Number(opts.w) || MIN_W;
  const h = Number(opts.h) || MIN_H;
  const variant = weatherLayoutVariant(w, h);
  const sizeStyle = weatherSizeStyle(w, h);
  const condition = day?.condition || "—";
  const icon =
    day?.icon || "https://trmnl.com/images/plugins/weather/wi-na.svg";

  let temp = "—";
  if (day?.temp_c != null) temp = `${Math.round(day.temp_c)}°C`;
  else if (preferHigh && day?.high_c != null)
    temp = `${Math.round(day.high_c)}°C`;

  const range =
    day?.low_c != null && day?.high_c != null
      ? ` · ${Math.round(day.low_c)}° / ${Math.round(day.high_c)}°`
      : "";

  return `
    <div class="outline rounded--medium studio-block__card creafridge-weather creafridge-weather--${variant}" style="${sizeStyle}" data-w="${w}" data-h="${h}">
      <span class="label creafridge-weather__title">${esc(label)}</span>
      <div class="creafridge-weather__body">
        <img
          class="image--adaptive creafridge-weather__icon"
          alt="${esc(condition)}"
          src="${esc(icon)}"
        >
        <div class="creafridge-weather__text">
          <span class="value creafridge-weather__temp">${esc(temp)}</span>
          <span class="label creafridge-weather__meta">${esc(condition)}${esc(range)}</span>
        </div>
      </div>
    </div>`;
}

function batteryIconHtml(percent) {
  const { filled, low, pct } = batterySegments(percent);
  const segs = [1, 2, 3, 4]
    .map((i) => {
      const filledCls = i <= filled ? " is-filled" : "";
      const x = 2.5 + (i - 1) * 5;
      return `<rect class="creafridge-battery__seg${filledCls}" x="${x}" y="4.25" width="4" height="5.5" rx="0.5"/>`;
    })
    .join("");
  const lowCls = low ? " creafridge-battery--low" : "";
  return `<svg class="creafridge-battery${lowCls}" viewBox="0 0 28 14" width="28" height="14" aria-label="Battery ${pct}%" role="img">
        <rect x="0.5" y="2.5" width="23" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/>
        <rect x="23.5" y="4.5" width="3" height="5" rx="0.75" fill="currentColor"/>
        ${segs}
      </svg>`;
}

function trashIconHtml(label) {
  return `<svg class="creafridge-trash text--red" viewBox="0 0 16 16" width="16" height="16" aria-label="${esc(label)}" role="img">
        <path fill="currentColor" d="M6 1h4l.5 1.5H14v1.5H2V2.5h3.5L6 1zm1 4h1.5v7H7V5zm3 0H11.5v7H10V5zM4.5 5H6v7H4.5V5zM3 13.5h10V15H3v-1.5z"/>
      </svg>`;
}

function batteryCardHtml(poll) {
  const raw = poll?.trmnl?.device?.percent_charged;
  let pct = 0;
  if (raw != null && raw !== "") {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) pct = n;
  }
  return `
    <div class="outline rounded--medium studio-block__card creafridge-battery-cell">
      ${batteryIconHtml(pct)}
    </div>`;
}

function trashCardHtml(poll) {
  const waste = poll?.waste;
  const icon = waste?.active
    ? trashIconHtml(waste.label || "Waste")
    : "";
  return `
    <div class="outline rounded--medium studio-block__card creafridge-trash-cell">
      ${icon}
    </div>`;
}

function calendarCardHtml(poll) {
  const days = Array.isArray(poll?.days) ? poll.days : [];
  const events = Array.isArray(poll?.events) ? poll.events : [];

  let rows = "";
  if (days.length > 0) {
    rows = days
      .map((day) => {
        const dayEvents = Array.isArray(day.events) ? day.events : [];
        const labelCls = day.is_today
          ? "label creafridge-calendar__day text--red"
          : "label creafridge-calendar__day";
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
            <span class="${labelCls}">${esc(day.label || day.key || "")}</span>
            <div class="creafridge-calendar__events">
              ${body}
            </div>`;
      })
      .join("");
  } else if (events.length > 0) {
    rows = events
      .map(
        (event) => `
            <span class="label creafridge-calendar__day">${esc(event.day_label || "")}</span>
            <div class="creafridge-calendar__events">
              <span class="title title--small">${esc(event.time_label || "")} ${esc(event.title || "")}</span>
            </div>`,
      )
      .join("");
  } else {
    rows = `<span class="description">—</span>`;
  }

  return `
    <div class="outline rounded--medium studio-block__card creafridge-calendar">
      <div class="creafridge-calendar__list">
        ${rows}
      </div>
    </div>`;
}

function blockCardHtml(block, poll) {
  switch (block.id) {
    case "weather_today":
      return weatherCardHtml(poll?.weather?.today, LABELS.weather_today, {
        w: block.w,
        h: block.h,
      });
    case "weather_tomorrow":
      return weatherCardHtml(poll?.weather?.tomorrow, LABELS.weather_tomorrow, {
        preferHigh: true,
        w: block.w,
        h: block.h,
      });
    case "battery":
      return batteryCardHtml(poll);
    case "trash":
      return trashCardHtml(poll);
    case "calendar":
      return calendarCardHtml(poll);
    default:
      return "";
  }
}

function applyBlockPlacement(el, block) {
  el.style.gridColumn = `${block.x + 1} / span ${block.w}`;
  el.style.gridRow = `${block.y + 1} / span ${block.h}`;
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
    body.innerHTML = "";
    body.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;
    body.style.gridTemplateRows = `repeat(${GRID_ROWS}, 1fr)`;

    for (const block of state.layout.blocks) {
      const wrap = document.createElement("div");
      wrap.className = "studio-block";
      wrap.dataset.blockId = block.id;
      if (state.selectedId === block.id) wrap.classList.add("is-selected");
      applyBlockPlacement(wrap, block);
      const resizeLocked = Boolean(fixedSizeFor(block.id));
      wrap.innerHTML = `
        ${blockCardHtml(block, state.poll)}
        ${
          resizeLocked
            ? ""
            : `<button type="button" class="studio-block__resize" data-resize="se" aria-label="Resize ${esc(LABELS[block.id] || block.id)}"></button>`
        }
      `;
      wrap.addEventListener("pointerdown", onBlockPointerDown);
      wrap
        .querySelector("[data-resize]")
        ?.addEventListener("pointerdown", onResizePointerDown);
      body.appendChild(wrap);
    }
  }

  renderTitleBar();

  const screen = document.getElementById("screen");
  const hasCss = document.documentElement.classList.contains("has-trmnl-css");
  if (screen) {
    if (hasCss) screen.classList.remove("studio-fallback");
    else screen.classList.add("studio-fallback");
  }

  const updated = document.getElementById("updated-label");
  if (updated) {
    updated.textContent = state.poll?.updated_at
      ? `CreaFridge updated ${state.poll.updated_at}`
      : "loading…";
  }
}

function cellFromPoint(clientX, clientY) {
  const body = document.getElementById("screen-body");
  if (!body) return { x: 0, y: 0 };
  const rect = body.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const cellW = rect.width / GRID_COLS;
  const cellH = rect.height / GRID_ROWS;
  return {
    x: clampInt(Math.floor(relX / cellW), 0, GRID_COLS - 1),
    y: clampInt(Math.floor(relY / cellH), 0, GRID_ROWS - 1),
  };
}

function updateBlockRect(id, nextRect, { commit = false } = {}) {
  const blocks = state.layout.blocks.map((b) => ({ ...b }));
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) return false;
  const clamped = { id, ...clampRect(nextRect, id) };
  if (wouldOverlap(blocks, clamped, id)) {
    return false;
  }
  blocks[idx] = clamped;
  state.layout = { ...state.layout, blocks };
  if (commit) {
    state.layout = saveLocal(state.layout);
    scheduleAutoSync();
    setStatus("Saved locally (auto)", "ok");
  }
  // Live update placement without full re-render (preserve pointer capture)
  const el = document.querySelector(
    `.studio-block[data-block-id="${CSS.escape(id)}"]`,
  );
  if (el) {
    applyBlockPlacement(el, clamped);
    const card = el.querySelector(".creafridge-weather");
    if (card instanceof HTMLElement) {
      const variant = weatherLayoutVariant(clamped.w, clamped.h);
      card.classList.remove(
        "creafridge-weather--compact",
        "creafridge-weather--wide",
        "creafridge-weather--tall",
        "creafridge-weather--balanced",
      );
      card.classList.add(`creafridge-weather--${variant}`);
      card.dataset.w = String(clamped.w);
      card.dataset.h = String(clamped.h);
      applyWeatherSizeVars(card, clamped.w, clamped.h);
    }
  }
  return true;
}

function onBlockPointerDown(ev) {
  if (!(ev.currentTarget instanceof HTMLElement)) return;
  if (ev.target instanceof HTMLElement && ev.target.closest("[data-resize]")) {
    return;
  }
  // Ignore text selection inside cards; still allow drag from card chrome
  ev.preventDefault();
  const id = ev.currentTarget.dataset.blockId;
  if (!id) return;
  const block = state.layout.blocks.find((b) => b.id === id);
  if (!block) return;

  state.selectedId = id;
  document
    .querySelectorAll(".studio-block.is-selected")
    .forEach((n) => n.classList.remove("is-selected"));
  ev.currentTarget.classList.add("is-selected");

  const startCell = cellFromPoint(ev.clientX, ev.clientY);
  state.interaction = {
    mode: "move",
    id,
    pointerId: ev.pointerId,
    origin: { ...block },
    grabOffset: {
      x: startCell.x - block.x,
      y: startCell.y - block.y,
    },
  };
  ev.currentTarget.setPointerCapture(ev.pointerId);
  ev.currentTarget.classList.add("is-dragging");
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onResizePointerDown(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const wrap = ev.currentTarget.closest(".studio-block");
  if (!(wrap instanceof HTMLElement)) return;
  const id = wrap.dataset.blockId;
  if (!id) return;
  if (fixedSizeFor(id)) return;
  const block = state.layout.blocks.find((b) => b.id === id);
  if (!block) return;

  state.selectedId = id;
  document
    .querySelectorAll(".studio-block.is-selected")
    .forEach((n) => n.classList.remove("is-selected"));
  wrap.classList.add("is-selected");

  state.interaction = {
    mode: "resize",
    id,
    pointerId: ev.pointerId,
    origin: { ...block },
  };
  wrap.setPointerCapture(ev.pointerId);
  wrap.classList.add("is-resizing");
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(ev) {
  const ix = state.interaction;
  if (!ix || ev.pointerId !== ix.pointerId) return;
  const cell = cellFromPoint(ev.clientX, ev.clientY);
  if (ix.mode === "move") {
    const next = {
      x: cell.x - ix.grabOffset.x,
      y: cell.y - ix.grabOffset.y,
      w: ix.origin.w,
      h: ix.origin.h,
    };
    updateBlockRect(ix.id, next);
  } else if (ix.mode === "resize") {
    const next = {
      x: ix.origin.x,
      y: ix.origin.y,
      w: cell.x - ix.origin.x + 1,
      h: cell.y - ix.origin.y + 1,
    };
    updateBlockRect(ix.id, next);
  }
}

function onPointerUp(ev) {
  const ix = state.interaction;
  if (!ix || ev.pointerId !== ix.pointerId) return;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);

  const el = document.querySelector(
    `.studio-block[data-block-id="${CSS.escape(ix.id)}"]`,
  );
  if (el instanceof HTMLElement) {
    el.classList.remove("is-dragging", "is-resizing");
    try {
      el.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  // Commit final layout
  state.layout = saveLocal(state.layout);
  scheduleAutoSync();
  setStatus("Saved locally (auto)", "ok");
  state.interaction = null;
  render();
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

async function exportLiquid() {
  // Prefer server layout after sync so export matches what agents/device use
  try {
    await syncToServer({ quiet: true });
  } catch {
    /* still try export from server file / defaults */
  }
  const res = await fetch(liquidUrl(), {
    headers: { Accept: "text/plain" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`liquid HTTP ${res.status}`);
  const text = await res.text();
  try {
    await navigator.clipboard.writeText(text);
    setStatus(
      "Liquid copied — paste into TRMNL Markup → Full, then Force Refresh",
      "ok",
    );
  } catch {
    // Fallback: downloadable blob if clipboard blocked
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "creafridge-full.liquid";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Liquid downloaded (clipboard blocked)", "ok");
  }
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
  document.getElementById("btn-export-liquid")?.addEventListener("click", () => {
    void exportLiquid().catch((e) =>
      setStatus(e instanceof Error ? e.message : "export failed", "err"),
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
