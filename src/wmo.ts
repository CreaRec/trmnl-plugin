/** WMO Weather interpretation codes → short English label (Open-Meteo). */
const WMO_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm + hail",
  99: "Thunderstorm + hail",
};

/** WMO code → Erik Flowers / TRMNL weather icon slug (without .svg). */
const WMO_ICON_SLUGS: Record<number, string> = {
  0: "wi-day-sunny",
  1: "wi-day-sunny-overcast",
  2: "wi-day-cloudy",
  3: "wi-cloudy",
  45: "wi-fog",
  48: "wi-fog",
  51: "wi-sprinkle",
  53: "wi-sprinkle",
  55: "wi-rain",
  56: "wi-sleet",
  57: "wi-sleet",
  61: "wi-day-rain",
  63: "wi-rain",
  65: "wi-rain",
  66: "wi-sleet",
  67: "wi-sleet",
  71: "wi-day-snow",
  73: "wi-snow",
  75: "wi-snow",
  77: "wi-snow",
  80: "wi-day-showers",
  81: "wi-showers",
  82: "wi-showers",
  85: "wi-day-snow",
  86: "wi-snow",
  95: "wi-thunderstorm",
  96: "wi-hail",
  99: "wi-hail",
};

export const WEATHER_ICON_BASE =
  "https://trmnl.com/images/plugins/weather";

const FALLBACK_ICON_SLUG = "wi-na";

export function wmoCondition(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return "Unknown";
  const rounded = Math.trunc(code);
  return WMO_LABELS[rounded] ?? `Code ${rounded}`;
}

/** Icon slug for TRMNL hosted weather SVGs, e.g. `wi-day-sunny`. */
export function wmoIconSlug(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return FALLBACK_ICON_SLUG;
  const rounded = Math.trunc(code);
  return WMO_ICON_SLUGS[rounded] ?? FALLBACK_ICON_SLUG;
}

/** Full URL for adaptive `<img src>` in Liquid. */
export function wmoIconUrl(code: number | null | undefined): string {
  return `${WEATHER_ICON_BASE}/${wmoIconSlug(code)}.svg`;
}

export function cToF(c: number): number {
  return Math.round(((c * 9) / 5 + 32) * 10) / 10;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
