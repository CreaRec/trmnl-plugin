import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { getWateringInfo } from "../src/watering.js";

const zone = "America/Chicago";

function atChicago(isoDate: string, hour = 12): Date {
  return DateTime.fromISO(`${isoDate}T${String(hour).padStart(2, "0")}:00:00`, {
    zone,
  })
    .toUTC()
    .toJSDate();
}

describe("watering schedule", () => {
  it("active all day Tuesday", () => {
    // 2026-09-29 is a Tuesday
    const mid = getWateringInfo(atChicago("2026-09-29"), zone);
    expect(mid).toEqual({
      active: true,
      label: "Watering",
      is_watering_day: true,
    });
    const late = getWateringInfo(atChicago("2026-09-29", 23), zone);
    expect(late.active).toBe(true);
    expect(late.is_watering_day).toBe(true);
  });

  it("active all day Friday", () => {
    // 2026-10-02 is a Friday
    const mid = getWateringInfo(atChicago("2026-10-02"), zone);
    expect(mid).toEqual({
      active: true,
      label: "Watering",
      is_watering_day: true,
    });
    const early = getWateringInfo(atChicago("2026-10-02", 0), zone);
    expect(early.active).toBe(true);
  });

  it("inactive on other weekdays", () => {
    // Mon 2026-09-28, Wed 2026-09-30, Thu 2026-10-01, Sat 2026-10-03, Sun 2026-10-04
    for (const day of [
      "2026-09-28",
      "2026-09-30",
      "2026-10-01",
      "2026-10-03",
      "2026-10-04",
    ]) {
      const w = getWateringInfo(atChicago(day), zone);
      expect(w).toEqual({
        active: false,
        label: "",
        is_watering_day: false,
      });
    }
  });

  it("uses America/Chicago weekday across UTC midnight", () => {
    // Late Tuesday Chicago is still Tuesday even when UTC has rolled to Wednesday
    const lateTue = DateTime.fromISO("2026-09-29T23:30:00", { zone })
      .toUTC()
      .toJSDate();
    expect(getWateringInfo(lateTue, zone).active).toBe(true);

    // Early Wednesday Chicago (UTC still Tuesday evening in some seasons — use local)
    const earlyWed = atChicago("2026-09-30", 1);
    expect(getWateringInfo(earlyWed, zone).active).toBe(false);
  });
});
