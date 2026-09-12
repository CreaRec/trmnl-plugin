# trmnl-plugin

Private Plugin markup + live JSON poller for a fridge-mounted **TRMNL BWRY** (black / white / red / yellow) e-ink display.

Dashboard: compact weather + optional device battery + Sunday waste badge, and a **7-day calendar list** (published iCloud ICS).

## Polling URL (TRMNL)

After deploy behind nginx on crearec.app:

```text
https://crearec.app/trmnl
```

Use that as the Private Plugin **Polling** URL (`GET`). Each response refreshes `updated_at` to now (ISO UTC). Health:

```text
https://crearec.app/trmnl/health
```

### Studio (layout playground) — Tailscale only

Web UI to drag dashboard blocks and preview the fridge layout (~800×480 BWRY). **Not** exposed on crearec.app; use Tailscale:

```text
http://100.118.169.52:8799/studio/
```

Public poll stays at `https://crearec.app/trmnl` (TRMNL Polling). Studio layout API is on the same Tailscale host (`/studio/layout`).

- **localStorage** (`trmnl-studio-layout-v1`) — instant client-side persistence while editing.
- **Server sync** — `GET`/`PUT`/`POST` `http://100.118.169.52:8799/studio/layout` writes JSON under `STUDIO_LAYOUT_PATH` (compose volume `./data`). Browser localStorage alone is not readable by agents; sync so Senior Pomidor (or any agent) can later `GET` the layout and update Liquid in the repo.

Buttons: Save locally · Sync to server · Load from server · Reset default. Drop auto-saves locally; optional debounced auto-sync to the server.

Local (without Tailscale bind): `http://127.0.0.1:8799/studio/`.

Local / Docker defaults: `HOST=0.0.0.0` `PORT=8799` → `http://127.0.0.1:8799/` and `/health`. Alias: `GET /poll`.

## Folder layout

```text
.
├── README.md
├── .env.example                  # Placeholder env only (never commit real ICS URL)
├── src/                          # Node 22 + TypeScript poll server
├── studio/                       # Layout playground UI (HTML/CSS/JS)
├── test/
│   └── fixtures/sample.ics       # Tiny synthetic ICS (no iCloud URL)
├── Dockerfile
├── docker-compose.yml            # Includes ./data volume for Studio layout
├── deploy/
│   ├── docker-compose.yml        # Loopback + Tailscale :8799 + env_file + ./data
│   └── nginx-trmnl.conf          # /trmnl, /health, /poll (Studio via Tailscale only)
├── docs/
│   └── trmnl-private-plugin.md
├── examples/
│   └── sample-payload.json
└── markup/
    ├── full.liquid               # Full layout (weather + waste + 7-day list)
    ├── half_horizontal.liquid
    ├── half_vertical.liquid
    ├── quadrant.liquid
    └── shared.liquid
```

## Environment

Copy `.env.example` → `.env` (gitignored). On the Debian host, create `/home/crearec/trmnl-plugin/.env` out-of-band.

| Variable | Default | Purpose |
| --- | --- | --- |
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
- `weather.today` / `weather.tomorrow` — temps (°C/°F), humidity, cloud cover, WMO condition text, adaptive `icon` URL (`https://trmnl.com/images/plugins/weather/wi-….svg`), low/high, `precip_slots[]`, `precip_summary`
- `waste` — `{ active, kind: "trash"|"trash_recycle"|null, label, is_sunday }` (`active` only on Sundays)
- `events[]` — flat list for the next 7 days
- `days[]` — group-friendly `{ key, label, is_today, is_tomorrow, events[] }`

**Battery is not a server field.** In Liquid, show a small badge only when TRMNL injects `trmnl.device.percent_charged` (see Markup Editor → Your Variables).

### Waste schedule (America/Chicago)

- Every Sunday → `trash` (bins collected Monday; badge all day Sunday)
- Every 2nd Sunday from anchor **2026-09-13** (14-day step: 13.09, 27.09, 11.10, …) → `trash_recycle`

Waste is **not** injected into the calendar.

## Prerequisites

- A TRMNL device (BWRY recommended)
- **Developer Edition** / Developer perks enabled
- No secrets in git — keep the real ICS URL in host `.env` only

## Create a Private Plugin in TRMNL

1. Plugins → **Private Plugin** → name e.g. `CreaFridge`.
2. Strategy → **Polling** (recommended).
3. Save, then **Edit Markup**.
4. Paste from `markup/`:
   - `full.liquid` → **Full**
   - optional half / quadrant tabs
   - `shared.liquid` → **Shared**
5. Force Refresh; preview as **TRMNL OG (B/W/R/Y)**.

Official guide: [Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins)

## Set a polling URL

1. Strategy → **Polling** → verb `GET`
2. URL → `https://crearec.app/trmnl`

**Single URL:** root fields bind as `{{ weather.today.temp_f }}`, `{{ days }}`, …  
**Multiple URLs:** `{{ IDX_0.… }}`.

Keep merge variables at the **root** of the JSON object.

More detail: [docs/trmnl-private-plugin.md](docs/trmnl-private-plugin.md)

## Run locally

```sh
cp .env.example .env   # edit CALENDAR_ICS_URL if you have one
npm ci
npm test
npm run build
npm start
# or: npm run dev
curl -sS http://127.0.0.1:8799/ | jq .
curl -sS http://127.0.0.1:8799/health
curl -sS http://127.0.0.1:8799/studio/layout | jq .
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
   **Debian must update this snippet and reload nginx after deploy** (`sudo nginx -t && sudo systemctl reload nginx`) so public `/trmnl/studio` is **removed** (Studio is Tailscale-only).
2. Place `deploy/docker-compose.yml` at `/home/crearec/trmnl-plugin/docker-compose.yml`.
3. Ensure `/home/crearec/trmnl-plugin/.env` exists (`env_file: .env` in compose).
4. Ensure `./data` exists next to compose (Studio layout volume) — `mkdir -p data`.
5. `docker compose pull && docker compose up -d` (binds `127.0.0.1:8799` and Tailscale `100.118.169.52:8799`).
6. `curl -sS https://crearec.app/trmnl/health`
7. `curl -sS http://100.118.169.52:8799/studio/layout` (on Tailscale)

| Path | Backend |
| --- | --- |
| `/trmnl` | `http://127.0.0.1:8799/` |
| `/trmnl/` | 301 → `/trmnl` |
| `/trmnl/health` | `http://127.0.0.1:8799/health` |
| `/trmnl/poll` | `http://127.0.0.1:8799/poll` |
| Studio (no public nginx) | `http://100.118.169.52:8799/studio/` |

## BWRY notes

- Palette: **`screen--color-4bwry`**.
- Hosted Private Plugins wrap Screen/View — paste **layout + title_bar** only.
- Sparse color: red/yellow for waste and precip attention; black for body.
- Prefer glanceable lists over dense grids (this design uses a 7-day **list**, not a week grid).
- **Avoid `bg--gray-*` card fills** on BWRY / 1-bit-ish previews — gray dither becomes dense black stipple and kills contrast. Frame cards with `outline` + `rounded--medium` (and gaps), not shaded backgrounds.

Framework: [Color palettes](https://trmnl.com/framework/docs/3.3/color_palettes) · [Outline](https://trmnl.com/framework/docs/3.3/outline) · [Structure](https://trmnl.com/framework/docs/3.3/structure) · [Liquid 101](https://help.trmnl.com/en/articles/10671186-liquid-101)

## License / ownership

CreaRec / Nikita — private home plugin. Talk and code comments may be English; keep the README practical for setup.
