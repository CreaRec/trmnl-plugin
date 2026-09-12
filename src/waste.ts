import { DateTime } from "luxon";

/** First recycle+trash Sunday in the biweekly series (America/Chicago). */
export const WASTE_RECYCLE_ANCHOR = "2026-09-13";

export type WasteKind = "trash" | "trash_recycle";

export type WasteInfo = {
  active: boolean;
  kind: WasteKind | null;
  label: string;
  is_sunday: boolean;
};

const ZONE = "America/Chicago";

/**
 * Waste badge schedule (America/Chicago):
 * - Every Sunday → trash (bins collected Monday)
 * - Every 2nd Sunday from 2026-09-13 (14-day step) → trash_recycle
 * - `active` is true only on Sundays (badge shown all day Sunday)
 */
export function getWasteInfo(
  now: Date = new Date(),
  zone: string = ZONE,
): WasteInfo {
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(zone);
  const isSunday = local.weekday === 7;

  if (!isSunday) {
    return {
      active: false,
      kind: null,
      label: "",
      is_sunday: false,
    };
  }

  const anchor = DateTime.fromISO(WASTE_RECYCLE_ANCHOR, { zone }).startOf(
    "day",
  );
  const today = local.startOf("day");
  const daysDiff = Math.trunc(today.diff(anchor, "days").days);
  const mod = ((daysDiff % 14) + 14) % 14;
  const isRecycleSunday = mod === 0;

  if (isRecycleSunday) {
    return {
      active: true,
      kind: "trash_recycle",
      label: "Trash + Recycle",
      is_sunday: true,
    };
  }

  return {
    active: true,
    kind: "trash",
    label: "Trash",
    is_sunday: true,
  };
}
