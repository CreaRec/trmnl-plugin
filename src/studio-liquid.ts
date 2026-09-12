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

function weatherSnippet(
  dayKey: "today" | "tomorrow",
  label: string,
  w: number,
  h: number,
  preferHigh: boolean,
): string {
  const variant = weatherLayoutVariant(w, h);
  const prefix = `weather.${dayKey}`;
  const altDefault = dayKey === "today" ? "Weather" : "Tomorrow";

  const tempLiquid = preferHigh
    ? `{% if ${prefix}.temp_c %}{{ ${prefix}.temp_c | round }}°C{% elsif ${prefix}.high_c %}{{ ${prefix}.high_c | round }}°C{% else %}—{% endif %}`
    : `{% if ${prefix}.temp_c %}{{ ${prefix}.temp_c | round }}°C{% else %}—{% endif %}`;

  return `<div class="outline rounded--medium p--2 flex flex--col gap--small creafridge-weather creafridge-weather--${variant}" style="height:100%;box-sizing:border-box;overflow:hidden;" data-w="${w}" data-h="${h}">
  <span class="label creafridge-weather__title">${label}</span>
  <div class="creafridge-weather__body flex flex--center-y gap--medium">
    <img
      class="image--adaptive image--small creafridge-weather__icon"
      alt="{{ ${prefix}.condition | default: '${altDefault}' }}"
      src="{{ ${prefix}.icon | default: 'https://trmnl.com/images/plugins/weather/wi-na.svg' }}"
    >
    <div class="creafridge-weather__text flex flex--col gap--xsmall grow">
      <span class="value value--xlarge creafridge-weather__temp" data-fit-value="true">
        ${tempLiquid}
      </span>
      <span class="label creafridge-weather__meta">
        {{ ${prefix}.condition | default: "—" }}{% if ${prefix}.low_c and ${prefix}.high_c %} · {{ ${prefix}.low_c | round }}° / {{ ${prefix}.high_c | round }}°{% endif %}
      </span>
    </div>
  </div>
</div>`;
}

/**
 * Icon-only status: 4-segment battery from percent_charged + red trash when waste.active.
 * No header. Sized for a single grid cell.
 */
function statusSnippet(): string {
  return `<div class="outline rounded--medium creafridge-status" style="height:100%;box-sizing:border-box;overflow:hidden;">
  <div class="creafridge-status__row flex flex--row flex--center-y gap--small">
    {% if trmnl.device.percent_charged %}
      {% assign cf_batt_pct = trmnl.device.percent_charged | round %}
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
    {% endif %}
    {% if waste.active %}
      <svg class="creafridge-trash text--red" viewBox="0 0 16 16" width="16" height="16" aria-label="{{ waste.label | default: 'Waste' }}" role="img">
        <path fill="currentColor" d="M6 1h4l.5 1.5H14v1.5H2V2.5h3.5L6 1zm1 4h1.5v7H7V5zm3 0H11.5v7H10V5zM4.5 5H6v7H4.5V5zM3 13.5h10V15H3v-1.5z"/>
      </svg>
    {% endif %}
  </div>
</div>`;
}

function calendarSnippet(): string {
  return `<div class="outline rounded--medium p--2 flex flex--col gap--small" style="height:100%;box-sizing:border-box;overflow:hidden;">
  <span class="label">Calendar · 7 days</span>
  {% if days and days.size > 0 %}
    <div class="flex flex--col gap--xsmall">
      {% for day in days %}
        <div class="grid grid--cols-4 gap--xsmall">
          <div class="col">
            <span class="label {% if day.is_today %}text--yellow{% endif %}">{{ day.label }}</span>
          </div>
          <div class="col col--span-3 flex flex--col gap--xsmall">
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
    <div class="flex flex--col gap--xsmall">
      {% for event in events %}
        <div class="grid grid--cols-4 gap--xsmall">
          <div class="col">
            <span class="label">{{ event.day_label }}</span>
          </div>
          <div class="col col--span-3">
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
    case "status":
      return statusSnippet();
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

/** Shared device + Studio styles for weather variants and status icons. */
export const CREAFRIDGE_BLOCK_CSS = `
  .creafridge-weather { min-width: 0; min-height: 0; }
  .creafridge-weather__body { display: flex; flex-direction: row; align-items: center; min-width: 0; flex: 1 1 auto; }
  .creafridge-weather--tall .creafridge-weather__body { flex-direction: column; align-items: center; text-align: center; }
  .creafridge-weather--tall .creafridge-weather__text { align-items: center; }
  .creafridge-weather--wide .creafridge-weather__body { flex-direction: row; align-items: center; }
  .creafridge-weather--compact .creafridge-weather__title,
  .creafridge-weather--compact .creafridge-weather__meta { display: none; }
  .creafridge-weather--compact .creafridge-weather__body { justify-content: center; gap: 4px; }
  .creafridge-weather--compact .creafridge-weather__icon { width: 22px; height: 22px; }
  .creafridge-weather--compact .creafridge-weather__temp { font-size: 1.1em; }
  .creafridge-status {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px 4px;
  }
  .creafridge-status__row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  .creafridge-battery { color: #000; flex-shrink: 0; display: block; }
  .creafridge-battery__seg { fill: none; stroke: currentColor; stroke-width: 1; }
  .creafridge-battery__seg.is-filled { fill: currentColor; stroke: none; }
  .creafridge-battery--low { color: #c0392b; }
  .creafridge-battery--low .creafridge-battery__seg.is-filled { fill: #c0392b; }
  .creafridge-trash { flex-shrink: 0; display: block; color: #c0392b; }
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
