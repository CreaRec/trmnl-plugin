import ical, { type VEvent } from "node-ical";
import { DateTime } from "luxon";
import { createTtlCache, type TtlCache } from "./cache.js";

export type CalendarEvent = {
  start: string;
  end: string;
  title: string;
  all_day: boolean;
  day_key: string;
  day_label: string;
  time_label: string;
};

export type CalendarDay = {
  key: string;
  label: string;
  is_today: boolean;
  is_tomorrow: boolean;
  events: CalendarEvent[];
};

export type CalendarPayload = {
  events: CalendarEvent[];
  days: CalendarDay[];
};

export type CalendarFetchOptions = {
  icsUrl: string | null;
  zone?: string;
  days?: number;
  cacheMs: number;
  now?: Date;
  /** Inject parsed ICS text (tests) instead of fetching. */
  icsText?: string;
  fetchImpl?: typeof fetch;
  cache?: TtlCache<string>;
};

const DEFAULT_ZONE = "America/Chicago";
const DEFAULT_DAYS = 7;

let defaultIcsCache: TtlCache<string> | null = null;

function getDefaultIcsCache(ttlMs: number): TtlCache<string> {
  if (!defaultIcsCache) {
    defaultIcsCache = createTtlCache<string>(ttlMs);
  }
  return defaultIcsCache;
}

export function resetCalendarCache(): void {
  defaultIcsCache?.clear();
  defaultIcsCache = null;
}

function summaryText(summary: VEvent["summary"]): string {
  if (summary == null) return "(No title)";
  if (typeof summary === "string") return summary || "(No title)";
  if (typeof summary === "object" && "val" in summary) {
    return String(summary.val || "(No title)");
  }
  return String(summary);
}

function dayLabelFor(
  dayKey: string,
  todayKey: string,
  tomorrowKey: string,
  zone: string,
): string {
  const dt = DateTime.fromISO(dayKey, { zone });
  const datePart = dt.toFormat("M/d");
  if (dayKey === todayKey) return `Today · ${datePart}`;
  if (dayKey === tomorrowKey) return `Tomorrow · ${datePart}`;
  return dt.toFormat("ccc M/d");
}

function timeLabelFor(
  start: DateTime,
  end: DateTime,
  allDay: boolean,
): string {
  if (allDay) return "All day";
  const startFmt = start.toFormat("h:mm a");
  if (!end.isValid || end.equals(start)) return startFmt;
  const endFmt = end.toFormat("h:mm a");
  return `${startFmt}–${endFmt}`;
}

function toLocal(date: Date, zone: string, allDay: boolean): DateTime {
  if (allDay) {
    // All-day ICS dates are date-only; interpret in calendar zone.
    return DateTime.fromJSDate(date, { zone: "utc" }).setZone(zone, {
      keepLocalTime: true,
    });
  }
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(zone);
}

/** Parse ICS text into next-N-days events (America/Chicago by default). */
export function parseCalendarEvents(
  icsText: string,
  options: {
    zone?: string;
    days?: number;
    now?: Date;
  } = {},
): CalendarPayload {
  const zone = options.zone ?? DEFAULT_ZONE;
  const dayCount = options.days ?? DEFAULT_DAYS;
  const now = options.now ?? new Date();

  const localNow = DateTime.fromJSDate(now, { zone: "utc" }).setZone(zone);
  const rangeStart = localNow.startOf("day");
  const rangeEnd = rangeStart.plus({ days: dayCount }); // exclusive end of window
  const todayKey = rangeStart.toISODate()!;
  const tomorrowKey = rangeStart.plus({ days: 1 }).toISODate()!;

  const parsed = ical.sync.parseICS(icsText);
  const events: CalendarEvent[] = [];

  for (const item of Object.values(parsed)) {
    if (!item || typeof item !== "object") continue;
    if (!("type" in item) || item.type !== "VEVENT") continue;
    const vevent = item as VEvent;

    if (vevent.status === "CANCELLED") continue;

    const from = rangeStart.toJSDate();
    const to = rangeEnd.minus({ milliseconds: 1 }).toJSDate();

    let instances: ReturnType<typeof ical.expandRecurringEvent>;
    try {
      instances = ical.expandRecurringEvent(vevent, {
        from,
        to,
        expandOngoing: true,
      });
    } catch {
      // Non-recurring / malformed rrule — fall back to single instance
      if (!vevent.start) continue;
      const allDay = vevent.datetype === "date";
      const startDt = toLocal(vevent.start, zone, allDay);
      const endRaw = vevent.end ?? vevent.start;
      const endDt = toLocal(endRaw, zone, allDay);
      if (endDt < rangeStart || startDt >= rangeEnd) continue;
      instances = [
        {
          start: vevent.start,
          end: endRaw,
          summary: vevent.summary,
          isFullDay: allDay,
          isRecurring: false,
          isOverride: false,
          event: vevent,
        },
      ];
    }

    for (const inst of instances) {
      if (inst.event?.status === "CANCELLED") continue;

      const allDay = inst.isFullDay || vevent.datetype === "date";
      const startDt = toLocal(inst.start, zone, allDay);
      let endDt = toLocal(inst.end, zone, allDay);

      // All-day DTEND is exclusive next day in ICS; show on start day.
      if (allDay && endDt > startDt) {
        endDt = endDt.minus({ days: 1 }).endOf("day");
      }

      if (endDt < rangeStart || startDt >= rangeEnd) continue;

      // Multi-day all-day: emit one entry per overlapping day in window
      if (allDay) {
        let cursor = startDt.startOf("day");
        const last = endDt.startOf("day");
        while (cursor <= last && cursor < rangeEnd) {
          if (cursor >= rangeStart) {
            const dayKey = cursor.toISODate()!;
            events.push({
              start: cursor.toISO() ?? inst.start.toISOString(),
              end: cursor.endOf("day").toISO() ?? inst.end.toISOString(),
              title: summaryText(inst.summary),
              all_day: true,
              day_key: dayKey,
              day_label: dayLabelFor(dayKey, todayKey, tomorrowKey, zone),
              time_label: "All day",
            });
          }
          cursor = cursor.plus({ days: 1 });
        }
        continue;
      }

      const dayKey = startDt.toISODate()!;
      if (dayKey < todayKey || startDt >= rangeEnd) continue;

      events.push({
        start: startDt.toISO() ?? inst.start.toISOString(),
        end: endDt.toISO() ?? inst.end.toISOString(),
        title: summaryText(inst.summary),
        all_day: false,
        day_key: dayKey,
        day_label: dayLabelFor(dayKey, todayKey, tomorrowKey, zone),
        time_label: timeLabelFor(startDt, endDt, false),
      });
    }
  }

  events.sort((a, b) => {
    if (a.day_key !== b.day_key) return a.day_key.localeCompare(b.day_key);
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    return a.start.localeCompare(b.start);
  });

  const days: CalendarDay[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = rangeStart.plus({ days: i });
    const key = d.toISODate()!;
    days.push({
      key,
      label: dayLabelFor(key, todayKey, tomorrowKey, zone),
      is_today: key === todayKey,
      is_tomorrow: key === tomorrowKey,
      events: events.filter((e) => e.day_key === key),
    });
  }

  return { events, days };
}

async function loadIcsText(options: CalendarFetchOptions): Promise<string> {
  if (options.icsText != null) return options.icsText;
  if (!options.icsUrl) return "";

  const cache = options.cache ?? getDefaultIcsCache(options.cacheMs);
  const hit = cache.get();
  if (hit != null) return hit;

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(options.icsUrl, {
    headers: {
      Accept: "text/calendar, text/plain, */*",
      "User-Agent": "trmnl-plugin/0.1",
    },
  });
  if (!res.ok) {
    throw new Error(`ICS fetch HTTP ${res.status}`);
  }
  const text = await res.text();
  cache.set(text);
  return text;
}

export async function fetchCalendar(
  options: CalendarFetchOptions,
): Promise<CalendarPayload> {
  const zone = options.zone ?? DEFAULT_ZONE;
  const days = options.days ?? DEFAULT_DAYS;
  const now = options.now ?? new Date();

  if (!options.icsUrl && options.icsText == null) {
    return emptyCalendar(zone, days, now);
  }

  try {
    const text = await loadIcsText(options);
    if (!text.trim()) return emptyCalendar(zone, days, now);
    return parseCalendarEvents(text, { zone, days, now });
  } catch {
    return emptyCalendar(zone, days, now);
  }
}

function emptyCalendar(
  zone: string,
  dayCount: number,
  now: Date,
): CalendarPayload {
  const localNow = DateTime.fromJSDate(now, { zone: "utc" }).setZone(zone);
  const rangeStart = localNow.startOf("day");
  const todayKey = rangeStart.toISODate()!;
  const tomorrowKey = rangeStart.plus({ days: 1 }).toISODate()!;
  const days: CalendarDay[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = rangeStart.plus({ days: i });
    const key = d.toISODate()!;
    days.push({
      key,
      label: dayLabelFor(key, todayKey, tomorrowKey, zone),
      is_today: key === todayKey,
      is_tomorrow: key === tomorrowKey,
      events: [],
    });
  }
  return { events: [], days };
}
