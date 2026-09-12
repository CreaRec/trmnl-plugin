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

Local / Docker defaults: `HOST=0.0.0.0` `PORT=8799` → `http://127.0.0.1:8799/` and `/health`. Alias: `GET /poll`.

## Folder layout

```text
.
├── README.md
├── .env.example                  # Placeholder env only (never commit real ICS URL)
├── src/                          # Node 22 + TypeScript poll server
├── test/
│   └── fixtures/sample.ics       # Tiny synthetic ICS (no iCloud URL)
├── Dockerfile
├── docker-compose.yml
├── deploy/
│   ├── docker-compose.yml        # Loopback bind + env_file: .env
│   └── nginx-trmnl.conf
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
2. Place `deploy/docker-compose.yml` at `/home/crearec/trmnl-plugin/docker-compose.yml`.
3. Ensure `/home/crearec/trmnl-plugin/.env` exists (`env_file: .env` in compose).
4. `docker compose pull && docker compose up -d`
5. `curl -sS https://crearec.app/trmnl/health`

| Path | Backend |
| --- | --- |
| `/trmnl` | `http://127.0.0.1:8799/` |
| `/trmnl/` | 301 → `/trmnl` |
| `/trmnl/health` | `http://127.0.0.1:8799/health` |

## BWRY notes

- Palette: **`screen--color-4bwry`**.
- Hosted Private Plugins wrap Screen/View — paste **layout + title_bar** only.
- Sparse color: red/yellow for waste and precip attention; black for body.
- Prefer glanceable lists over dense grids (this design uses a 7-day **list**, not a week grid).
- **Avoid `bg--gray-*` card fills** on BWRY / 1-bit-ish previews — gray dither becomes dense black stipple and kills contrast. Frame cards with `outline` + `rounded--medium` (and gaps), not shaded backgrounds.

Framework: [Color palettes](https://trmnl.com/framework/docs/3.3/color_palettes) · [Outline](https://trmnl.com/framework/docs/3.3/outline) · [Structure](https://trmnl.com/framework/docs/3.3/structure) · [Liquid 101](https://help.trmnl.com/en/articles/10671186-liquid-101)

## License / ownership

CreaRec / Nikita — private home plugin. Talk and code comments may be English; keep the README practical for setup.
