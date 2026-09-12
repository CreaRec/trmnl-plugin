export type PresenceItem = {
  name: string;
  state: string;
};

export type RoutineItem = {
  time: string;
  title: string;
};

export type PollPayload = {
  title: string;
  plugin_label: string;
  updated_at: string;
  home_status: string;
  home_summary: string;
  presence: PresenceItem[];
  routines: RoutineItem[];
  alerts: string[];
};

/** Hardcoded fridge glanceables; only `updated_at` is dynamic. */
export function buildPollPayload(now: Date = new Date()): PollPayload {
  return {
    title: "CreaFridge",
    plugin_label: "CreaFridge",
    updated_at: now.toISOString(),
    home_status: "home",
    home_summary: "Everyone accounted for · doors locked",
    presence: [
      { name: "Nikita", state: "home" },
      { name: "Partner", state: "away" },
      { name: "Dogs", state: "home" },
    ],
    routines: [
      { time: "12:00", title: "Lunch prep" },
      { time: "18:30", title: "Walk + dinner" },
      { time: "22:00", title: "Lockup checklist" },
    ],
    alerts: ["Trash night — bins to curb"],
  };
}

export const SERVICE_NAME = "trmnl-plugin";
export const SERVICE_VERSION = "0.1.0";

export function buildHealthPayload() {
  return {
    status: "ok" as const,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
  };
}
