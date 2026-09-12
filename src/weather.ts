import { DateTime } from "luxon";
import { createTtlCache, type TtlCache } from "./cache.js";
import { cToF, round1, wmoCondition } from "./wmo.js";

export type PrecipSlot = {
  time: string;
  label: string;
  mm: number;
  probability: number;
};

export type DayWeather = {
  temp_c: number | null;
  temp_f: number | null;
  humidity: number | null;
  cloud_cover: number | null;
  condition: string;
  low_c: number | null;
  high_c: number | null;
  low_f: number | null;
  high_f: number | null;
  precip_slots: PrecipSlot[];
  precip_summary: string;
};

export type WeatherPayload = {
  today: DayWeather;
  tomorrow: DayWeather;
};

export type WeatherFetchOptions = {
  lat: number;
  lon: number;
  tz: string;
  cacheMs: number;
  fetchImpl?: typeof fetch;
  cache?: TtlCache<WeatherPayload>;
};

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    cloud_cover?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
  };
  hourly?: {
    time?: string[];
    precipitation?: number[];
    precipitation_probability?: number[];
  };
};

const MEANINGFUL_PRECIP_MM = 0.1;
const MEANINGFUL_PRECIP_PROB = 20;

let defaultWeatherCache: TtlCache<WeatherPayload> | null = null;

function getDefaultCache(ttlMs: number): TtlCache<WeatherPayload> {
  if (!defaultWeatherCache) {
    defaultWeatherCache = createTtlCache<WeatherPayload>(ttlMs);
  }
  return defaultWeatherCache;
}

/** Reset module cache (tests). */
export function resetWeatherCache(): void {
  defaultWeatherCache?.clear();
  defaultWeatherCache = null;
}

export function buildOpenMeteoUrl(
  lat: number,
  lon: number,
  tz: string,
): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: tz,
    forecast_days: "2",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "cloud_cover",
      "weather_code",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
    ].join(","),
    hourly: ["precipitation", "precipitation_probability"].join(","),
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function precipSlotsForDay(
  hourly: OpenMeteoResponse["hourly"],
  dayKey: string,
  zone: string,
): PrecipSlot[] {
  if (!hourly?.time?.length) return [];

  const slots: PrecipSlot[] = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const timeRaw = hourly.time[i]!;
    const dt = DateTime.fromISO(timeRaw, { zone });
    if (!dt.isValid || dt.toISODate() !== dayKey) continue;

    const mm = round1(hourly.precipitation?.[i] ?? 0);
    const probability = Math.round(hourly.precipitation_probability?.[i] ?? 0);
    if (mm < MEANINGFUL_PRECIP_MM && probability < MEANINGFUL_PRECIP_PROB) {
      continue;
    }

    slots.push({
      time: dt.toISO() ?? timeRaw,
      label: dt.toFormat("h a"),
      mm,
      probability,
    });
  }
  return slots;
}

function precipSummary(slots: PrecipSlot[], dailyProb?: number | null): string {
  if (slots.length === 0) {
    if (dailyProb != null && dailyProb >= MEANINGFUL_PRECIP_PROB) {
      return `${Math.round(dailyProb)}% chance`;
    }
    return "No precip";
  }
  const peak = slots.reduce((a, b) => (b.probability > a.probability ? b : a));
  const totalMm = round1(slots.reduce((s, x) => s + x.mm, 0));
  if (totalMm >= MEANINGFUL_PRECIP_MM) {
    return `${totalMm} mm · peak ${peak.probability}% @ ${peak.label}`;
  }
  return `Peak ${peak.probability}% @ ${peak.label}`;
}

function emptyDay(condition = "Unavailable"): DayWeather {
  return {
    temp_c: null,
    temp_f: null,
    humidity: null,
    cloud_cover: null,
    condition,
    low_c: null,
    high_c: null,
    low_f: null,
    high_f: null,
    precip_slots: [],
    precip_summary: "—",
  };
}

/** Map Open-Meteo JSON → Liquid-friendly weather shape (pure; unit-tested). */
export function mapOpenMeteoToWeather(
  data: OpenMeteoResponse,
  zone: string,
  now: Date = new Date(),
): WeatherPayload {
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(zone);
  const todayKey = local.toISODate()!;
  const tomorrowKey = local.plus({ days: 1 }).toISODate()!;

  const dailyTimes = data.daily?.time ?? [];
  const todayIdx = dailyTimes.indexOf(todayKey);
  const tomorrowIdx = dailyTimes.indexOf(tomorrowKey);

  const pickDaily = (idx: number) => {
    if (idx < 0) return null;
    return {
      code: data.daily?.weather_code?.[idx],
      high: data.daily?.temperature_2m_max?.[idx],
      low: data.daily?.temperature_2m_min?.[idx],
      precipSum: data.daily?.precipitation_sum?.[idx],
      precipProb: data.daily?.precipitation_probability_max?.[idx],
    };
  };

  const todayDaily = pickDaily(todayIdx);
  const tomorrowDaily = pickDaily(tomorrowIdx);

  const todaySlots = precipSlotsForDay(data.hourly, todayKey, zone);
  const tomorrowSlots = precipSlotsForDay(data.hourly, tomorrowKey, zone);

  const currentTemp = data.current?.temperature_2m;
  const today: DayWeather = {
    temp_c: currentTemp != null ? round1(currentTemp) : null,
    temp_f: currentTemp != null ? cToF(currentTemp) : null,
    humidity:
      data.current?.relative_humidity_2m != null
        ? Math.round(data.current.relative_humidity_2m)
        : null,
    cloud_cover:
      data.current?.cloud_cover != null
        ? Math.round(data.current.cloud_cover)
        : null,
    condition: wmoCondition(
      data.current?.weather_code ?? todayDaily?.code ?? null,
    ),
    low_c: todayDaily?.low != null ? round1(todayDaily.low) : null,
    high_c: todayDaily?.high != null ? round1(todayDaily.high) : null,
    low_f: todayDaily?.low != null ? cToF(todayDaily.low) : null,
    high_f: todayDaily?.high != null ? cToF(todayDaily.high) : null,
    precip_slots: todaySlots,
    precip_summary: precipSummary(todaySlots, todayDaily?.precipProb),
  };

  const tomorrow: DayWeather = {
    temp_c: tomorrowDaily?.high != null ? round1(tomorrowDaily.high) : null,
    temp_f: tomorrowDaily?.high != null ? cToF(tomorrowDaily.high) : null,
    humidity: null,
    cloud_cover: null,
    condition: wmoCondition(tomorrowDaily?.code ?? null),
    low_c: tomorrowDaily?.low != null ? round1(tomorrowDaily.low) : null,
    high_c: tomorrowDaily?.high != null ? round1(tomorrowDaily.high) : null,
    low_f: tomorrowDaily?.low != null ? cToF(tomorrowDaily.low) : null,
    high_f: tomorrowDaily?.high != null ? cToF(tomorrowDaily.high) : null,
    precip_slots: tomorrowSlots,
    precip_summary: precipSummary(tomorrowSlots, tomorrowDaily?.precipProb),
  };

  return { today, tomorrow };
}

export async function fetchWeather(
  options: WeatherFetchOptions,
): Promise<WeatherPayload> {
  const cache = options.cache ?? getDefaultCache(options.cacheMs);
  const hit = cache.get();
  if (hit) return hit;

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildOpenMeteoUrl(options.lat, options.lon, options.tz);

  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const data = (await res.json()) as OpenMeteoResponse;
    const mapped = mapOpenMeteoToWeather(data, options.tz);
    cache.set(mapped);
    return mapped;
  } catch {
    return {
      today: emptyDay("Unavailable"),
      tomorrow: emptyDay("Unavailable"),
    };
  }
}
