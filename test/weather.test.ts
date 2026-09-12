import { describe, expect, it } from "vitest";
import {
  buildOpenMeteoUrl,
  mapOpenMeteoToWeather,
} from "../src/weather.js";
import {
  cToF,
  WEATHER_ICON_BASE,
  wmoCondition,
  wmoIconSlug,
  wmoIconUrl,
} from "../src/wmo.js";

describe("weather mapping", () => {
  it("maps WMO codes and C→F", () => {
    expect(wmoCondition(0)).toBe("Clear");
    expect(wmoCondition(61)).toBe("Light rain");
    expect(wmoCondition(999)).toBe("Code 999");
    expect(cToF(0)).toBe(32);
    expect(cToF(100)).toBe(212);
  });

  it("maps WMO codes to TRMNL weather icon URLs", () => {
    expect(wmoIconSlug(0)).toBe("wi-day-sunny");
    expect(wmoIconSlug(2)).toBe("wi-day-cloudy");
    expect(wmoIconSlug(3)).toBe("wi-cloudy");
    expect(wmoIconSlug(61)).toBe("wi-day-rain");
    expect(wmoIconSlug(95)).toBe("wi-thunderstorm");
    expect(wmoIconSlug(null)).toBe("wi-na");
    expect(wmoIconSlug(999)).toBe("wi-na");
    expect(wmoIconUrl(2)).toBe(
      `${WEATHER_ICON_BASE}/wi-day-cloudy.svg`,
    );
  });

  it("builds Open-Meteo URL with lat/lon/tz", () => {
    const url = buildOpenMeteoUrl(30.4394, -97.62, "America/Chicago");
    expect(url).toContain("latitude=30.4394");
    expect(url).toContain("longitude=-97.62");
    expect(url).toContain("timezone=America%2FChicago");
    expect(url).toContain("hourly=precipitation");
  });

  it("maps Open-Meteo payload into today/tomorrow Liquid shape", () => {
    const mapped = mapOpenMeteoToWeather(
      {
        current: {
          time: "2026-09-13T12:00",
          temperature_2m: 31.22,
          relative_humidity_2m: 48.4,
          cloud_cover: 20,
          weather_code: 2,
        },
        daily: {
          time: ["2026-09-13", "2026-09-14"],
          weather_code: [2, 0],
          temperature_2m_max: [33.4, 34.0],
          temperature_2m_min: [23.1, 22.5],
          precipitation_sum: [0.4, 0],
          precipitation_probability_max: [40, 5],
        },
        hourly: {
          time: [
            "2026-09-13T10:00",
            "2026-09-13T17:00",
            "2026-09-14T09:00",
            "2026-09-14T15:00",
          ],
          precipitation: [0, 0.4, 0, 0],
          precipitation_probability: [5, 40, 10, 25],
        },
      },
      "America/Chicago",
      new Date("2026-09-13T17:00:00Z"),
    );

    expect(mapped.today.condition).toBe("Partly cloudy");
    expect(mapped.today.icon).toBe(
      `${WEATHER_ICON_BASE}/wi-day-cloudy.svg`,
    );
    expect(mapped.today.temp_c).toBe(31.2);
    expect(mapped.today.humidity).toBe(48);
    expect(mapped.today.high_f).toBe(cToF(33.4));
    expect(mapped.today.precip_slots.length).toBe(1);
    expect(mapped.today.precip_slots[0]!.probability).toBe(40);
    expect(mapped.today.precip_slots[0]!.mm).toBe(0.4);

    expect(mapped.tomorrow.condition).toBe("Clear");
    expect(mapped.tomorrow.icon).toBe(
      `${WEATHER_ICON_BASE}/wi-day-sunny.svg`,
    );
    expect(mapped.tomorrow.low_c).toBe(22.5);
    expect(mapped.tomorrow.high_c).toBe(34);
    // 25% tomorrow afternoon is meaningful even with 0 mm
    expect(mapped.tomorrow.precip_slots.some((s) => s.probability === 25)).toBe(
      true,
    );
  });
});
