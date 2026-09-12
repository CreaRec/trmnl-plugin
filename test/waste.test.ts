import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { getWasteInfo, WASTE_RECYCLE_ANCHOR } from "../src/waste.js";

const zone = "America/Chicago";

function atChicago(isoDate: string, hour = 12): Date {
  return DateTime.fromISO(`${isoDate}T${String(hour).padStart(2, "0")}:00:00`, {
    zone,
  })
    .toUTC()
    .toJSDate();
}

describe("waste schedule", () => {
  it("anchor Sunday is trash_recycle", () => {
    expect(WASTE_RECYCLE_ANCHOR).toBe("2026-09-13");
    const w = getWasteInfo(atChicago("2026-09-13"), zone);
    expect(w).toEqual({
      active: true,
      kind: "trash_recycle",
      label: "Trash + Recycle",
      is_sunday: true,
    });
  });

  it("next Sunday is trash only", () => {
    const w = getWasteInfo(atChicago("2026-09-20"), zone);
    expect(w.active).toBe(true);
    expect(w.kind).toBe("trash");
    expect(w.label).toBe("Trash");
    expect(w.is_sunday).toBe(true);
  });

  it("biweekly recycle Sundays: 27.09, 11.10", () => {
    expect(getWasteInfo(atChicago("2026-09-27"), zone).kind).toBe(
      "trash_recycle",
    );
    expect(getWasteInfo(atChicago("2026-10-11"), zone).kind).toBe(
      "trash_recycle",
    );
    expect(getWasteInfo(atChicago("2026-10-04"), zone).kind).toBe("trash");
  });

  it("active all day Sunday including late evening", () => {
    const late = getWasteInfo(atChicago("2026-09-13", 23), zone);
    expect(late.active).toBe(true);
    expect(late.is_sunday).toBe(true);
  });

  it("inactive on non-Sundays", () => {
    const sat = getWasteInfo(atChicago("2026-09-12"), zone);
    expect(sat).toEqual({
      active: false,
      kind: null,
      label: "",
      is_sunday: false,
    });
    const mon = getWasteInfo(atChicago("2026-09-14"), zone);
    expect(mon.active).toBe(false);
    expect(mon.is_sunday).toBe(false);
  });
});
