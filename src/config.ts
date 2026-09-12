export type AppConfig = {
  calendarIcsUrl: string | null;
  weatherLat: number;
  weatherLon: number;
  weatherTz: string;
  calendarCacheMs: number;
  weatherCacheMs: number;
};

const DEFAULT_LAT = 30.4394;
const DEFAULT_LON = -97.62;
const DEFAULT_TZ = "America/Chicago";

/** Normalize webcal:// → https://; require https. Empty → null. */
export function normalizeIcsUrl(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url = trimmed;
  if (/^webcal:\/\//i.test(url)) {
    url = `https://${url.slice("webcal://".length)}`;
  }

  if (!/^https:\/\//i.test(url)) {
    throw new Error(
      "CALENDAR_ICS_URL must be an https URL (webcal:// is rewritten to https://)",
    );
  }
  return url;
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number: ${raw}`);
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    calendarIcsUrl: normalizeIcsUrl(env.CALENDAR_ICS_URL),
    weatherLat: parseNumber(env.WEATHER_LAT, DEFAULT_LAT),
    weatherLon: parseNumber(env.WEATHER_LON, DEFAULT_LON),
    weatherTz: env.WEATHER_TZ?.trim() || DEFAULT_TZ,
    // ~10 min ICS / ~20 min weather — within the product cache windows
    calendarCacheMs: 10 * 60 * 1000,
    weatherCacheMs: 20 * 60 * 1000,
  };
}
