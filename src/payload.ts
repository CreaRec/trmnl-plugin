import { loadConfig, type AppConfig } from "./config.js";
import { fetchCalendar, type CalendarDay, type CalendarEvent } from "./calendar.js";
import { fetchWeather, type WeatherPayload } from "./weather.js";
import { getWasteInfo, type WasteInfo } from "./waste.js";
import { getWateringInfo, type WateringInfo } from "./watering.js";
import {
  fetchShopping,
  type ShoppingPayload,
} from "./todoist.js";

export type PollPayload = {
  title: string;
  plugin_label: string;
  updated_at: string;
  weather: WeatherPayload;
  waste: WasteInfo;
  watering: WateringInfo;
  events: CalendarEvent[];
  days: CalendarDay[];
  shopping: ShoppingPayload;
};

export const SERVICE_NAME = "trmnl-plugin";
export const SERVICE_VERSION = "0.2.0";

export type BuildPollOptions = {
  config?: AppConfig;
  now?: Date;
  /** Test hooks */
  icsText?: string;
  weatherFetch?: typeof fetch;
  calendarFetch?: typeof fetch;
  shoppingFetch?: typeof fetch;
};

/** Live fridge dashboard JSON for TRMNL Private Plugin Liquid. */
export async function buildPollPayload(
  options: BuildPollOptions = {},
): Promise<PollPayload> {
  const config = options.config ?? loadConfig();
  const now = options.now ?? new Date();

  const [weather, calendar, shopping] = await Promise.all([
    fetchWeather({
      lat: config.weatherLat,
      lon: config.weatherLon,
      tz: config.weatherTz,
      cacheMs: config.weatherCacheMs,
      fetchImpl: options.weatherFetch,
    }),
    fetchCalendar({
      icsUrl: config.calendarIcsUrl,
      zone: config.weatherTz,
      days: 7,
      cacheMs: config.calendarCacheMs,
      now,
      icsText: options.icsText,
      fetchImpl: options.calendarFetch,
    }),
    fetchShopping({
      token: config.todoistApiToken,
      projectId: config.todoistProjectId,
      cacheMs: config.shoppingCacheMs,
      fetchImpl: options.shoppingFetch,
    }),
  ]);

  return {
    title: "CreaFridge",
    plugin_label: "CreaFridge",
    updated_at: now.toISOString(),
    weather,
    waste: getWasteInfo(now, config.weatherTz),
    watering: getWateringInfo(now, config.weatherTz),
    events: calendar.events,
    days: calendar.days,
    shopping,
  };
}

export function buildHealthPayload() {
  return {
    status: "ok" as const,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
  };
}
