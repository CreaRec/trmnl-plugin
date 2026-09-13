import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { parseCalendarEvents } from "../src/calendar.js";
import { normalizeIcsUrl } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, "fixtures/sample.ics"), "utf8");

describe("calendar ICS parsing", () => {
  it("normalizes webcal→https and rejects non-https", () => {
    expect(normalizeIcsUrl("webcal://cal.example/x.ics")).toBe(
      "https://cal.example/x.ics",
    );
    expect(normalizeIcsUrl("https://cal.example/x.ics")).toBe(
      "https://cal.example/x.ics",
    );
    expect(normalizeIcsUrl("")).toBeNull();
    expect(() => normalizeIcsUrl("http://insecure.example/x.ics")).toThrow(
      /https/,
    );
  });

  it("parses fixture ICS for next 7 days in America/Chicago", () => {
    const now = DateTime.fromISO("2026-09-13T15:00:00", {
      zone: "America/Chicago",
    })
      .toUTC()
      .toJSDate();

    const { events, days } = parseCalendarEvents(fixture, {
      zone: "America/Chicago",
      days: 7,
      now,
    });

    expect(days).toHaveLength(7);
    expect(days[0]!.is_today).toBe(true);
    expect(days[0]!.label).toBe("9/13 · Today");
    expect(days[1]!.is_tomorrow).toBe(true);
    expect(days[1]!.label).toBe("9/14 · Tomorrow");

    const titles = events.map((e) => e.title);
    expect(titles).toContain("Farmers market");
    expect(titles).toContain("Team sync");
    expect(titles).toContain("Weekly standup");
    expect(titles).not.toContain("Cancelled party");
    expect(titles).not.toContain("Far future");

    const market = events.find((e) => e.title === "Farmers market")!;
    expect(market.all_day).toBe(true);
    expect(market.day_key).toBe("2026-09-13");
    expect(market.time_label).toBe("All day");

    const sync = events.find((e) => e.title === "Team sync")!;
    expect(sync.all_day).toBe(false);
    expect(sync.day_key).toBe("2026-09-14");
    expect(sync.time_label).toMatch(/6:00 PM/);

    // RRULE weekly Monday → Sep 14 (Mon) within window starting Sep 13
    const standup = events.filter((e) => e.title === "Weekly standup");
    expect(standup.length).toBeGreaterThanOrEqual(1);
    expect(standup.every((e) => e.day_key >= "2026-09-13")).toBe(true);

    const todayEvents = days[0]!.events.map((e) => e.title);
    expect(todayEvents).toContain("Farmers market");

    // Weekdays after tomorrow are date-first: "9/15 · Mon"
    expect(days[2]!.label).toMatch(/^\d{1,2}\/\d{1,2} · \w{3}$/);
  });
});
