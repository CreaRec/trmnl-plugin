import { DateTime } from "luxon";

export type WateringInfo = {
  active: boolean;
  label: string;
  is_watering_day: boolean;
};

const ZONE = "America/Chicago";

/**
 * Plant watering badge schedule (America/Chicago):
 * - Tuesday and Friday → active (green icon shown all day)
 * - Other weekdays → inactive (empty 1×1 cell)
 */
export function getWateringInfo(
  now: Date = new Date(),
  zone: string = ZONE,
): WateringInfo {
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(zone);
  // Luxon: Monday=1 … Sunday=7
  const isWateringDay = local.weekday === 2 || local.weekday === 5;

  if (!isWateringDay) {
    return {
      active: false,
      label: "",
      is_watering_day: false,
    };
  }

  return {
    active: true,
    label: "Watering",
    is_watering_day: true,
  };
}
