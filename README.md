# trmnl-plugin

Private Plugin markup + live JSON poller for a fridge-mounted **TRMNL BWRY** (black / white / red / yellow) e-ink display.

Dashboard: weather cards (today / tomorrow) in °C, icon-only device battery + Sunday waste, and a **full 7-day calendar list** with `—` for empty days (published iCloud ICS).

## Polling URL (TRMNL)

After deploy behind nginx on crearec.app, set `TRMNL_POLL_TOKEN` (a UUID) in the host `.env`. Polling URL:

```text
https://crearec.app/trmnl/<uuid>
```

Use that as the Private Plugin **Polling** URL (`GET`). Bare `https://crearec.app/trmnl` returns **401** without the token. Each response refreshes `updated_at` to now (ISO UTC). Health (no token):

```text
https://crearec.app/trmnl/health
```

### Studio (layout playground) — Tailscale only

Web UI to place dashboard blocks on a fine **12×8 cell grid** over the fridge screen (~800×480 BWRY). Drag to move, SE corner to resize (snap to cells). **Collision rule:** prevent overlap — blocks cannot share cells. **Not** exposed on crearec.app; use Tailscale:

```text
http://100.118.169.52:8799/studio/
```

Public poll is tokenized at `https://crearec.app/trmnl/<uuid>` (TRMNL Polling). Studio APIs stay on the same Tailscale host:

| Endpoint | Purpose |
| --- | --- |
| `GET`/`PUT`/`POST` `/studio/layout` | Layout JSON (v2 cell rects) under `STUDIO_LAYOUT_PATH` |
| `GET` `/studio/liquid` | Paste-ready Full Liquid (CSS grid placements) |
| `GET` `/studio/poll` | Preview poll JSON (no token; Tailscale-gated) |

**Layout schema v2** (writes always upgrade to this):

```json
{
  "version": 2,
  "updated_at": "…",
  "grid": { "cols": 12, "rows": 8 },
  "blocks": [
    { "id": "weather_today", "x": 0, "y": 0, "w": 6, "h": 3 },
    { "id": "weather_tomorrow", "x": 6, "y": 0, "w": 6, "h": 3 },
    { "id": "battery", "x": 0, "y": 3, "w": 1, "h": 1 },
    { "id": "trash", "x": 1, "y": 3, "w": 1, "h": 1 },
    { "id": "calendar", "x": 0, "y": 4, "w": 12, "h": 4 }
  ]
}
```

- Cell units are integers; `x`/`y` are 0-based; `w`/`h` are spans (min `w≥2`, `h≥2` except **battery** and **trash** are fixed `1×1`).
- Weather blocks show **°C** (condition/range on one line, degrees on the next), rearrange by span (`creafridge-weather--wide` / `--tall` / `--compact`), and scale icon/temp/meta via `--cf-*` vars from cell `w`/`h` so content fills larger blocks without overlapping when small.
- **Battery** always shows the 4-segment icon (`trmnl.device.percent_charged`). **Trash** shows the red icon only when `waste.active`; otherwise an empty outlined cell.
- Calendar has **no header**; **Today** uses `text--red`; day labels are date-first (e.g. `9/12 · Today`, `9/15 · Mon`); tight **2-column** grid (`auto` + `1fr`), both columns left-aligned; events column fills remaining width.
- Legacy `status` block (and v1 `{ id, width: "half"|"full" }`) is accepted on read and migrated to `battery` + `trash` at 1×1.
- **localStorage** (`trmnl-studio-layout-v2`) — instant client-side persistence while editing (v1 key is migrated on load).
- **Server sync** — browser localStorage alone is not readable by agents; sync so Senior Pomidor (or any agent) can `GET` the layout or `/studio/liquid`.
- **Export flow (device):** Studio → arrange blocks → Sync → **Export Liquid** → paste into TRMNL Markup → **Full** → Force Refresh. Markup Editor / Studio preview may differ from the device; exported Liquid (CSS `grid-template` + `grid-column`/`grid-row`, no `studio-*` classes) is the device source of truth. Repo `markup/full.liquid` remains the default checked-in Full layout.
- **Preview-only device vars** — `GET /studio/poll` merges `trmnl.device.percent_charged: 100` and `trmnl.plugin_settings.instance_name: "My Plugin"` so Studio can show the battery icon and title_bar instance like the Markup Editor. Authorized `/poll` never includes these (TRMNL injects them on device).

Buttons: Save locally · Sync to server · Load from server · Export Liquid · Reset default · Refresh poll. Drag/resize auto-saves locally; optional debounced auto-sync to the server.

Local (without Tailscale bind): `http://127.0.0.1:8799/studio/`.

Local / Docker defaults: `HOST=0.0.0.0` `PORT=8799`. Authorized poll forms (any one):

- `GET /poll/<token>`
- `GET /t/<token>`
- `GET /?token=<token>` and `GET /poll?token=<token>`

Without a valid token, poll endpoints return `401` `{"error":"unauthorized"}`. Health stays open.

## Folder layout

```text
.
├── README.md
├── .env.example                  # Placeholder env only (never commit real ICS URL / token)
├── src/                          # Node 22 + TypeScript poll server
├── studio/                       # Layout playground UI (HTML/CSS/JS)
├── test/
│   └── fixtures/sample.ics       # Tiny synthetic ICS (no iCloud URL)
├── Dockerfile
├── docker-compose.yml            # Loopback + Tailscale :8799 + ./data volume
├── deploy/
│   ├── docker-compose.yml        # Loopback + Tailscale :8799 + env_file + ./data
│   └── nginx-trmnl.conf          # /trmnl/<uuid>, /health, /poll (Studio via Tailscale only)
├── docs/
│   └── trmnl-private-plugin.md
├── examples/
│   └── sample-payload.json
└── markup/
    ├── full.liquid               # Full layout (Studio CSS grid: 4×3 weather pair, trash+battery, calendar)
    ├── half_horizontal.liquid
    ├── half_vertical.liquid
    ├── quadrant.liquid
    └── shared.liquid
```

## Environment

Copy `.env.example` → `.env` (gitignored). On the Debian host, create `/home/crearec/trmnl-plugin/.env` out-of-band.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRMNL_POLL_TOKEN` | _(required in production)_ | UUID secret for poll URLs. Never commit a real value. |
| `CALENDAR_ICS_URL` | _(empty)_ | Published iCloud ICS (`https://…`). `webcal://` is rewritten to `https://`. |
| `WEATHER_LAT` | `30.4394` | Open-Meteo latitude (Pflugerville TX area) |
| `WEATHER_LON` | `-97.6200` | Open-Meteo longitude |
| `WEATHER_TZ` | `America/Chicago` | Timezone for weather + calendar window + waste |
| `PORT` | `8799` | Listen port |
| `HOST` | `0.0.0.0` | Listen host |
| `STUDIO_LAYOUT_PATH` | `./data/studio-layout.json` | Server-side Studio layout JSON (compose: `/app/data/studio-layout.json`) |

ICS is cached in memory ~10 minutes; weather ~20 minutes.

## JSON payload

Root fields (see [`examples/sample-payload.json`](examples/sample-payload.json)):

- `title`, `plugin_label`, `updated_at`
- `weather.today` / `weather.tomorrow` — temps (°C/°F), humidity, cloud cover, WMO condition text, adaptive `icon` URL, low/high, `precip_slots[]`, `precip_summary`
- `waste` — `{ active, kind: "trash"|"trash_recycle"|null, label, is_sunday }` (`active` only on Sundays)
- `events[]` — flat list for the next 7 days
- `days[]` — group-friendly `{ key, label, is_today, is_tomorrow, events[] }`

**Battery is not a server field.** In Liquid, show a small badge only when TRMNL injects `trmnl.device.percent_charged` (see Markup Editor → Your Variables). Studio’s `/studio/poll` adds a **preview-only** `trmnl` object for parity; do not copy that into production poll responses.

### Waste schedule (America/Chicago)

- Every Sunday → `trash` (bins collected Monday; badge all day Sunday)
- Every 2nd Sunday from anchor **2026-09-13** (14-day step: 13.09, 27.09, 11.10, …) → `trash_recycle`

Waste is **not** injected into the calendar.

## Prerequisites

- A TRMNL device (BWRY recommended)
- **Developer Edition** / Developer perks enabled
- No secrets in git — keep the real ICS URL and `TRMNL_POLL_TOKEN` in host `.env` only

## Create a Private Plugin in TRMNL

1. Plugins → **Private Plugin** → name e.g. `CreaFridge`.
2. Strategy → **Polling** (recommended).
3. Save, then **Edit Markup**.
4. Paste from `markup/` (or Studio export):
   - `full.liquid` → **Full** (default Studio layout: 4×3 weather pair + top-right trash/battery + calendar), **or** paste Liquid from Studio **Export Liquid** / `GET /studio/liquid` for a freeform 12×8 CSS grid
   - optional half / quadrant tabs
   - `shared.liquid` → **Shared** (Studio export embeds its own `<style>` in Full; Shared stays light)
5. Force Refresh; preview as **TRMNL OG (B/W/R/Y)**. Re-paste Full after markup changes or after exporting a new Studio layout — Studio sync alone does not push Liquid to TRMNL.

Official guide: [Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins)

## Set a polling URL

1. Strategy → **Polling** → verb `GET`
2. URL → `https://crearec.app/trmnl/<your-TRMNL_POLL_TOKEN-uuid>`

**Single URL:** root fields bind as `{{ weather.today.temp_f }}`, `{{ days }}`, …  
**Multiple URLs:** `{{ IDX_0.… }}`.

Keep merge variables at the **root** of the JSON object.

More detail: [docs/trmnl-private-plugin.md](docs/trmnl-private-plugin.md)

## Run locally

```sh
cp .env.example .env   # edit CALENDAR_ICS_URL + TRMNL_POLL_TOKEN
npm ci
npm test
npm run build
npm start
# or: npm run dev
TOKEN=$(grep '^TRMNL_POLL_TOKEN=' .env | cut -d= -f2-)
curl -sS "http://127.0.0.1:8799/poll/${TOKEN}" | jq .
curl -sS http://127.0.0.1:8799/health
curl -sS http://127.0.0.1:8799/studio/layout | jq .
curl -sS http://127.0.0.1:8799/studio/liquid | head
# open http://127.0.0.1:8799/studio/
```

Docker:

```sh
docker compose up -d --build
curl -sS http://127.0.0.1:8799/health
```

## Deploy (Debian + nginx)

CI on `main` publishes `ghcr.io/crearec/trmnl-plugin:main` (+ `sha-*`) and SSH-deploys when Tailscale / deploy secrets are configured.

Manual:

1. Copy `deploy/nginx-trmnl.conf` into `/etc/nginx/snippets/` and `include` it from the crearec.app site.
   **Debian must update this snippet and reload nginx** (`sudo nginx -t && sudo systemctl reload nginx`) so `/trmnl/<uuid>` is routed, bare `/trmnl` returns 401, and public `/trmnl/studio` stays **removed** (Studio is Tailscale-only). Keep the UUID `location ~` regex **double-quoted** (`"^/trmnl/([0-9a-fA-F-]{36})$"`); unquoted `{36}` fails `nginx -t` under PCRE.
2. Place `deploy/docker-compose.yml` at `/home/crearec/trmnl-plugin/docker-compose.yml`.
3. Ensure `/home/crearec/trmnl-plugin/.env` exists with `TRMNL_POLL_TOKEN=<uuid>` (`env_file: .env` in compose). Never commit the real token.
4. Ensure `./data` exists next to compose (Studio layout volume) — `mkdir -p data`.
5. `docker compose pull && docker compose up -d` (binds `127.0.0.1:8799` and Tailscale `100.118.169.52:8799`).
6. `curl -sS https://crearec.app/trmnl/health`
7. `curl -sS https://crearec.app/trmnl/$TRMNL_POLL_TOKEN | jq .`
8. `curl -sS http://100.118.169.52:8799/studio/layout` (on Tailscale)

| Path | Backend |
| --- | --- |
| `/trmnl/<uuid>` | `http://127.0.0.1:8799/poll/<uuid>` |
| `/trmnl` / `/trmnl/` | **401** `{"error":"unauthorized"}` (no bare poll) |
| `/trmnl/health` | `http://127.0.0.1:8799/health` |
| `/trmnl/poll` | `http://127.0.0.1:8799/poll` (needs `?token=` or 401) |
| Studio (no public nginx) | `http://100.118.169.52:8799/studio/` |

## BWRY notes

- Palette: **`screen--color-4bwry`**.
- Hosted Private Plugins wrap Screen/View — paste **layout + title_bar** only.
- Sparse color: red/yellow for waste and precip attention; black for body.
- Prefer glanceable lists over dense grids (Full uses a 7-day **list** of all days with `—` when empty — not a week grid, and not humidity/cloud mini-rows that crush the calendar).
- **Avoid `bg--gray-*` card fills** on BWRY / 1-bit-ish previews — gray dither becomes dense black stipple and kills contrast. Frame cards with `outline` + `rounded--medium` (and gaps), not shaded backgrounds.

Framework: [Color palettes](https://trmnl.com/framework/docs/3.3/color_palettes) · [Outline](https://trmnl.com/framework/docs/3.3/outline) · [Structure](https://trmnl.com/framework/docs/3.3/structure) · [Liquid 101](https://help.trmnl.com/en/articles/10671186-liquid-101)

## License / ownership

CreaRec / Nikita — private home plugin. Talk and code comments may be English; keep the README practical for setup.
