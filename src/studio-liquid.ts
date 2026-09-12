import type { LayoutBlock, StudioLayout } from "./studio-layout.js";
import {
  GRID_COLS,
  GRID_ROWS,
  SCREEN_HEIGHT_PX,
  SCREEN_WIDTH_PX,
} from "./studio-layout.js";

/**
 * Liquid snippet bodies aligned with markup/full.liquid card content.
 * No studio-* classes — paste-safe for TRMNL Markup → Full.
 */
const BLOCK_SNIPPETS: Record<string, string> = {
  weather_today: `<div class="outline rounded--medium p--2 flex flex--col gap--small" style="height:100%;box-sizing:border-box;overflow:hidden;">
  <span class="label">Weather · Today</span>
  <div class="flex flex--row flex--center-y gap--medium">
    <img
      class="image--adaptive image--small"
      alt="{{ weather.today.condition | default: 'Weather' }}"
      src="{{ weather.today.icon | default: 'https://trmnl.com/images/plugins/weather/wi-na.svg' }}"
    >
    <div class="flex flex--col gap--xsmall grow">
      <span class="value value--xlarge" data-fit-value="true">
        {% if weather.today.temp_f %}{{ weather.today.temp_f | round }}°F{% elsif weather.today.temp_c %}{{ weather.today.temp_c | round }}°C{% else %}—{% endif %}
      </span>
      <span class="label">
        {{ weather.today.condition | default: "—" }}{% if weather.today.low_f and weather.today.high_f %} · {{ weather.today.low_f | round }}° / {{ weather.today.high_f | round }}°{% endif %}
      </span>
    </div>
  </div>
</div>`,

  weather_tomorrow: `<div class="outline rounded--medium p--2 flex flex--col gap--small" style="height:100%;box-sizing:border-box;overflow:hidden;">
  <span class="label">Weather · Tomorrow</span>
  <div class="flex flex--row flex--center-y gap--medium">
    <img
      class="image--adaptive image--small"
      alt="{{ weather.tomorrow.condition | default: 'Tomorrow' }}"
      src="{{ weather.tomorrow.icon | default: 'https://trmnl.com/images/plugins/weather/wi-na.svg' }}"
    >
    <div class="flex flex--col gap--xsmall grow">
      <span class="value value--xlarge" data-fit-value="true">
        {% if weather.tomorrow.temp_f %}{{ weather.tomorrow.temp_f | round }}°F{% elsif weather.tomorrow.high_f %}{{ weather.tomorrow.high_f | round }}°F{% elsif weather.tomorrow.temp_c %}{{ weather.tomorrow.temp_c | round }}°C{% elsif weather.tomorrow.high_c %}{{ weather.tomorrow.high_c | round }}°C{% else %}—{% endif %}
      </span>
      <span class="label">
        {{ weather.tomorrow.condition | default: "—" }}{% if weather.tomorrow.low_f and weather.tomorrow.high_f %} · {{ weather.tomorrow.low_f | round }}° / {{ weather.tomorrow.high_f | round }}°{% endif %}
      </span>
    </div>
  </div>
</div>`,

  status: `<div class="outline rounded--medium p--2 flex flex--col gap--small" style="height:100%;box-sizing:border-box;overflow:hidden;">
  <span class="label">Status · Battery + Waste</span>
  <div class="flex flex--row gap--small flex--center-y flex--wrap">
    {% if trmnl.device.percent_charged %}
      <div class="outline rounded--medium px--2 py--1">
        <span class="value value--xsmall">Battery {{ trmnl.device.percent_charged | round }}%</span>
      </div>
    {% endif %}
    {% if waste.active %}
      <div class="outline rounded--medium px--2 py--1">
        <span class="value value--xsmall {% if waste.kind == 'trash_recycle' %}text--yellow{% else %}text--red{% endif %}">
          {{ waste.label | default: "Bins out" }}
        </span>
      </div>
    {% endif %}
  </div>
</div>`,

  calendar: `<div class="outline rounded--medium p--2 flex flex--col gap--small" style="height:100%;box-sizing:border-box;overflow:hidden;">
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
</div>`,
};

function gridPlacement(block: LayoutBlock): string {
  // CSS grid lines are 1-based; cell (x,y) starts at line x+1 / y+1
  const colStart = block.x + 1;
  const rowStart = block.y + 1;
  return `grid-column: ${colStart} / span ${block.w}; grid-row: ${rowStart} / span ${block.h};`;
}

/**
 * Paste-ready Full markup: CSS grid placements from Studio layout.
 * No studio-* classes. Includes a short comment that layout came from Studio.
 */
export function renderStudioLiquid(layout: StudioLayout): string {
  const cols = layout.grid?.cols ?? GRID_COLS;
  const rows = layout.grid?.rows ?? GRID_ROWS;
  const cells = layout.blocks
    .map((block) => {
      const snippet = BLOCK_SNIPPETS[block.id];
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
