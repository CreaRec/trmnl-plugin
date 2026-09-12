import type { LayoutBlock, StudioLayout } from "./studio-layout.js";
import {
  GRID_COLS,
  GRID_ROWS,
  SCREEN_HEIGHT_PX,
  SCREEN_WIDTH_PX,
} from "./studio-layout.js";

/**
 * Layout variant from cell span — baked into Liquid class names at export.
 * Studio JS mirrors the same thresholds.
 */
export function weatherLayoutVariant(
  w: number,
  h: number,
): "compact" | "wide" | "tall" | "balanced" {
  if (w <= 2 || (w <= 3 && h <= 2)) return "compact";
  if (w > h && w >= 4) return "wide";
  if (h > w) return "tall";
  return "balanced";
}

/**
 * Font/icon metrics from cell span — keeps icon + temp from colliding/clipping.
 * Studio JS mirrors the same formula; values are baked as CSS variables.
 */
export function weatherSizeMetrics(
  w: number,
  h: number,
): { iconPx: number; tempEm: number; gapPx: number; metaEm: number } {
  const ww = Math.max(1, Math.trunc(w));
  const hh = Math.max(1, Math.trunc(h));
  const short = Math.min(ww, hh);
  // Cell ≈ 66.7×60; subtract outline padding + title row when tall enough
  const contentW = Math.max(20, ww * 66.7 - 20);
  const titleReserve = hh <= 2 || ww <= 2 ? 0 : 18;
  const contentH = Math.max(18, hh * 60 - 16 - titleReserve);

  // Icon: grow with span but never claim more than ~28% of content width / 55% height
  let iconPx = Math.round(10 + short * 5 + Math.min(ww, 5) * 1.25);
  iconPx = Math.min(iconPx, Math.floor(contentW * 0.28), Math.floor(contentH * 0.55));
  iconPx = Math.max(12, iconPx);

  const gapPx = Math.round(Math.min(8, Math.max(2, 1 + short)));
  const remaining = Math.max(14, contentW - iconPx - gapPx);
  // "34°C" ≈ 4 glyphs; display fonts are wide — ~18px per em-width unit
  const tempFromWidth = remaining / (4 * 18);
  const tempFromSpan = 0.62 + (ww - 1) * 0.12 + (hh - 1) * 0.06;
  const tempEm =
    Math.round(
      Math.min(1.75, Math.max(0.72, Math.min(tempFromWidth, tempFromSpan))) * 100,
    ) / 100;
  const metaEm =
    Math.round(Math.min(0.9, Math.max(0.55, 0.5 + short * 0.06)) * 100) / 100;
  return { iconPx, tempEm, gapPx, metaEm };
}

export function weatherSizeStyleAttr(w: number, h: number): string {
  const m = weatherSizeMetrics(w, h);
  return `--cf-icon:${m.iconPx}px;--cf-temp:${m.tempEm}em;--cf-gap:${m.gapPx}px;--cf-meta:${m.metaEm}em`;
}

function weatherSnippet(
  dayKey: "today" | "tomorrow",
  label: string,
  w: number,
  h: number,
  preferHigh: boolean,
): string {
  const variant = weatherLayoutVariant(w, h);
  const sizeStyle = weatherSizeStyleAttr(w, h);
  const prefix = `weather.${dayKey}`;
  const altDefault = dayKey === "today" ? "Weather" : "Tomorrow";

  const tempLiquid = preferHigh
    ? `{% if ${prefix}.temp_c %}{{ ${prefix}.temp_c | round }}°C{% elsif ${prefix}.high_c %}{{ ${prefix}.high_c | round }}°C{% else %}—{% endif %}`
    : `{% if ${prefix}.temp_c %}{{ ${prefix}.temp_c | round }}°C{% else %}—{% endif %}`;

  return `<div class="outline rounded--medium p--2 flex flex--col gap--small creafridge-weather creafridge-weather--${variant}" style="height:100%;box-sizing:border-box;overflow:hidden;${sizeStyle}" data-w="${w}" data-h="${h}">
  <span class="label creafridge-weather__title">${label}</span>
  <div class="creafridge-weather__body flex flex--center-y">
    <img
      class="image--adaptive creafridge-weather__icon"
      alt="{{ ${prefix}.condition | default: '${altDefault}' }}"
      src="{{ ${prefix}.icon | default: 'https://trmnl.com/images/plugins/weather/wi-na.svg' }}"
    >
    <div class="creafridge-weather__text flex flex--col gap--xsmall grow">
      <span class="value creafridge-weather__temp">
        ${tempLiquid}
      </span>
      <span class="label creafridge-weather__meta">
        {{ ${prefix}.condition | default: "—" }}{% if ${prefix}.low_c and ${prefix}.high_c %} · {{ ${prefix}.low_c | round }}° / {{ ${prefix}.high_c | round }}°{% endif %}
      </span>
    </div>
  </div>
</div>`;
}

/** Always-on 4-segment battery icon for a fixed 1×1 cell. */
function batterySnippet(): string {
  return `<div class="outline rounded--medium creafridge-battery-cell" style="height:100%;box-sizing:border-box;overflow:hidden;">
  {% assign cf_batt_pct = trmnl.device.percent_charged | default: 0 | round %}
  {% if cf_batt_pct <= 0 %}{% assign cf_batt_segs = 1 %}{% elsif cf_batt_pct <= 25 %}{% assign cf_batt_segs = 1 %}{% elsif cf_batt_pct <= 50 %}{% assign cf_batt_segs = 2 %}{% elsif cf_batt_pct <= 75 %}{% assign cf_batt_segs = 3 %}{% else %}{% assign cf_batt_segs = 4 %}{% endif %}
  {% if cf_batt_pct < 25 %}{% assign cf_batt_low = true %}{% else %}{% assign cf_batt_low = false %}{% endif %}
  <svg class="creafridge-battery{% if cf_batt_low %} creafridge-battery--low{% endif %}" viewBox="0 0 28 14" width="28" height="14" aria-label="Battery {{ cf_batt_pct }}%" role="img">
    <rect x="0.5" y="2.5" width="23" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/>
    <rect x="23.5" y="4.5" width="3" height="5" rx="0.75" fill="currentColor"/>
    <rect class="creafridge-battery__seg{% if cf_batt_segs >= 1 %} is-filled{% endif %}" x="2.5" y="4.25" width="4" height="5.5" rx="0.5"/>
    <rect class="creafridge-battery__seg{% if cf_batt_segs >= 2 %} is-filled{% endif %}" x="7.5" y="4.25" width="4" height="5.5" rx="0.5"/>
    <rect class="creafridge-battery__seg{% if cf_batt_segs >= 3 %} is-filled{% endif %}" x="12.5" y="4.25" width="4" height="5.5" rx="0.5"/>
    <rect class="creafridge-battery__seg{% if cf_batt_segs >= 4 %} is-filled{% endif %}" x="17.5" y="4.25" width="4" height="5.5" rx="0.5"/>
  </svg>
</div>`;
}

/** Red trash when waste.active; otherwise empty outlined 1×1 cell. */
function trashSnippet(): string {
  return `<div class="outline rounded--medium creafridge-trash-cell" style="height:100%;box-sizing:border-box;overflow:hidden;">
  {% if waste.active %}
    <svg class="creafridge-trash text--red" viewBox="0 0 16 16" width="16" height="16" aria-label="{{ waste.label | default: 'Waste' }}" role="img">
      <path fill="currentColor" d="M6 1h4l.5 1.5H14v1.5H2V2.5h3.5L6 1zm1 4h1.5v7H7V5zm3 0H11.5v7H10V5zM4.5 5H6v7H4.5V5zM3 13.5h10V15H3v-1.5z"/>
    </svg>
  {% endif %}
</div>`;
}

function calendarSnippet(): string {
  return `<div class="outline rounded--medium p--2 flex flex--col gap--small creafridge-calendar" style="height:100%;box-sizing:border-box;overflow:hidden;">
  {% if days and days.size > 0 %}
    <div class="flex flex--col gap--xsmall creafridge-calendar__list">
      {% for day in days %}
        <div class="creafridge-calendar__row flex flex--row gap--xsmall">
          <span class="label creafridge-calendar__day {% if day.is_today %}text--red{% endif %}">{{ day.label }}</span>
          <div class="creafridge-calendar__events flex flex--col gap--xsmall grow">
            {% if day.events and day.events.size > 0 %}
              {% for event in day.events %}
                <span class="title title--small">{{ event.time_label }} {{ event.title }}</span>
              {% endfor %}
            {% else %}
              <span class="description">—</span>
            {% endif %}
          </div>
        </div>
      {% endfor %}
    </div>
  {% elsif events and events.size > 0 %}
    <div class="flex flex--col gap--xsmall creafridge-calendar__list">
      {% for event in events %}
        <div class="creafridge-calendar__row flex flex--row gap--xsmall">
          <span class="label creafridge-calendar__day">{{ event.day_label }}</span>
          <div class="creafridge-calendar__events grow">
            <span class="title title--small">{{ event.time_label }} {{ event.title }}</span>
          </div>
        </div>
      {% endfor %}
    </div>
  {% else %}
    <span class="description">—</span>
  {% endif %}
</div>`;
}

function blockSnippet(block: LayoutBlock): string {
  switch (block.id) {
    case "weather_today":
      return weatherSnippet("today", "Weather · Today", block.w, block.h, false);
    case "weather_tomorrow":
      return weatherSnippet(
        "tomorrow",
        "Weather · Tomorrow",
        block.w,
        block.h,
        true,
      );
    case "battery":
      return batterySnippet();
    case "trash":
      return trashSnippet();
    case "calendar":
      return calendarSnippet();
    default:
      return "";
  }
}

function gridPlacement(block: LayoutBlock): string {
  // CSS grid lines are 1-based; cell (x,y) starts at line x+1 / y+1
  const colStart = block.x + 1;
  const rowStart = block.y + 1;
  return `grid-column: ${colStart} / span ${block.w}; grid-row: ${rowStart} / span ${block.h};`;
}

/** Shared device + Studio styles for weather variants, battery, trash, calendar. */
export const CREAFRIDGE_BLOCK_CSS = `
  .creafridge-weather { min-width: 0; min-height: 0; container-type: size; }
  .creafridge-weather__body {
    display: flex;
    flex-direction: row;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
    gap: var(--cf-gap, 8px);
    overflow: hidden;
  }
  .creafridge-weather__icon {
    width: min(var(--cf-icon, 28px), 28cqmin);
    height: min(var(--cf-icon, 28px), 28cqmin);
    max-width: 32%;
    flex-shrink: 0;
    object-fit: contain;
  }
  .creafridge-weather__text {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  .creafridge-weather__temp {
    font-size: min(var(--cf-temp, 1.4em), 22cqw) !important;
    line-height: 1.05 !important;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .creafridge-weather .creafridge-weather__temp.value,
  .creafridge-weather span.creafridge-weather__temp {
    font-size: min(var(--cf-temp, 1.4em), 22cqw) !important;
  }
  .creafridge-weather img.creafridge-weather__icon {
    width: min(var(--cf-icon, 28px), 28cqmin) !important;
    height: min(var(--cf-icon, 28px), 28cqmin) !important;
    max-width: 32% !important;
  }
  .creafridge-weather__meta {
    font-size: var(--cf-meta, 0.85em);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .creafridge-weather--tall .creafridge-weather__body { flex-direction: column; align-items: center; text-align: center; }
  .creafridge-weather--tall .creafridge-weather__text { align-items: center; }
  .creafridge-weather--wide .creafridge-weather__body { flex-direction: row; align-items: center; }
  .creafridge-weather--compact .creafridge-weather__title,
  .creafridge-weather--compact .creafridge-weather__meta { display: none; }
  .creafridge-weather--compact .creafridge-weather__body { justify-content: center; }
  .creafridge-battery-cell,
  .creafridge-trash-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px 4px;
    min-width: 0;
    min-height: 0;
  }
  .creafridge-battery { color: #000; flex-shrink: 0; display: block; }
  .creafridge-battery__seg { fill: none; stroke: currentColor; stroke-width: 1; }
  .creafridge-battery__seg.is-filled { fill: currentColor; stroke: none; }
  .creafridge-battery--low { color: #c0392b; }
  .creafridge-battery--low .creafridge-battery__seg.is-filled { fill: #c0392b; }
  .creafridge-trash { flex-shrink: 0; display: block; color: #c0392b; }
  .creafridge-calendar { text-align: left; align-items: stretch; min-width: 0; }
  .creafridge-calendar__list { width: 100%; text-align: left; }
  .creafridge-calendar__row { align-items: flex-start; width: 100%; text-align: left; }
  .creafridge-calendar__day {
    flex: 0 0 auto;
    min-width: 5.5em;
    text-align: left;
  }
  .creafridge-calendar__events {
    min-width: 0;
    text-align: left;
  }
`.trim();

/**
 * Paste-ready Full markup: CSS grid placements from Studio layout.
 * No studio-* classes. Includes a short comment that layout came from Studio.
 */
export function renderStudioLiquid(layout: StudioLayout): string {
  const cols = layout.grid?.cols ?? GRID_COLS;
  const rows = layout.grid?.rows ?? GRID_ROWS;
  const cells = layout.blocks
    .map((block) => {
      const snippet = blockSnippet(block);
      if (!snippet) return "";
      const indented = snippet
        .split("\n")
        .map((line) => (line ? `    ${line}` : line))
        .join("\n");
      return `  <div class="creafridge-cell" style="${gridPlacement(block)}">
${indented}
  </div>`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `{% comment %}
  Full markup generated by CreaFridge Studio (${cols}×${rows} cell grid over ${SCREEN_WIDTH_PX}×${SCREEN_HEIGHT_PX}).
  Paste into Private Plugin → Markup → Full, then Force Refresh on the device.
  Studio preview may differ slightly from device render; this Liquid is the device source of truth.
  Collision rule in Studio: prevent overlap (blocks cannot share cells).
{% endcomment %}

<style>
  .creafridge-grid {
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    grid-template-rows: repeat(${rows}, 1fr);
    gap: 6px;
    width: 100%;
    height: 100%;
    min-height: 420px;
    box-sizing: border-box;
  }
  .creafridge-cell {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  ${CREAFRIDGE_BLOCK_CSS}
</style>

<div class="creafridge-grid">
${cells}
</div>

<div class="title_bar">
  <img class="image image--adaptive" alt="" src="https://trmnl.com/images/plugins/weather--render.svg">
  <span class="title">{{ plugin_label | default: "CreaFridge" }}</span>
  <span class="instance">{{ trmnl.plugin_settings.instance_name }}</span>
</div>
`;
}
