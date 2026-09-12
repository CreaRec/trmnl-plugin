# trmnl-plugin

Private Plugin markup + live JSON poller for a fridge-mounted **TRMNL BWRY** (black / white / red / yellow) e-ink display.

Dashboard: equal half weather cards (today / tomorrow), optional device battery + Sunday waste pills, and a **full 7-day calendar list** with `—` for empty days (published iCloud ICS).

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

Web UI to drag dashboard blocks and preview the fridge layout (~800×480 BWRY). **Not** exposed on crearec.app; use Tailscale:

```text
http://100.118.169.52:8799/studio/
```

Public poll is tokenized at `https://crearec.app/trmnl/<uuid>` (TRMNL Polling). Studio layout API is on the same Tailscale host (`/studio/layout`).

- **localStorage** (`trmnl-studio-layout-v1`) — instant client-side persistence while editing.
- **Server sync** — `GET`/`PUT`/`POST` `http://100.118.169.52:8799/studio/layout` writes JSON under `STUDIO_LAYOUT_PATH` (compose volume `./data`). Browser localStorage alone is not readable by agents; sync so Senior Pomidor (or any agent) can later `GET` the layout and update Liquid in the repo.
- **Device source of truth** — `markup/full.liquid` is what TRMNL renders on the fridge. Studio is a layout playground; Full markup is aligned to the default Studio block order (`weather_today` | `weather_tomorrow`, `status`, `calendar`) using TRMNL framework utilities only (no `studio-*` classes).

Buttons: Save locally · Sync to server · Load from server · Reset default. Drop auto-saves locally; optional debounced auto-sync to the server.

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
    ├── full.liquid               # Full layout (half/half weather, status pills, all 7 days)
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

**Battery is not a server field.** In Liquid, show a small badge only when TRMNL injects `trmnl.device.percent_charged` (see Markup Editor → Your Variables).

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
4. Paste from `markup/`:
   - `full.liquid` → **Full** (outlined cards: Weather · Today | Tomorrow, Status · Battery + Waste, Calendar · 7 days listing every day)
   - optional half / quadrant tabs
   - `shared.liquid` → **Shared**
5. Force Refresh; preview as **TRMNL OG (B/W/R/Y)**. Re-paste Full after markup changes in git — Studio sync does not push Liquid.

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
