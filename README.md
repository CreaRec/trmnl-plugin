# trmnl-plugin

Private Plugin markup + a small live JSON poller for a fridge-mounted **TRMNL BWRY** (black / white / red / yellow) e-ink display.

Related home context: Linear [CRE-20](https://linear.app/creadev/issue/CRE-20) / CreaDashboard — presence & routine glanceables on the fridge.

## Polling URL (TRMNL)

After deploy behind nginx on crearec.app:

```text
https://crearec.app/trmnl
```

Use that as the Private Plugin **Polling** URL (`GET`). Each response refreshes `updated_at` to now (ISO UTC). Health:

```text
https://crearec.app/trmnl/health
```

Local / Docker defaults: `HOST=0.0.0.0` `PORT=8799` → `http://127.0.0.1:8799/` and `/health`.

## Folder layout

```text
.
├── README.md
├── src/                          # Node 22 + TypeScript poll server
├── test/
├── Dockerfile
├── docker-compose.yml
├── deploy/
│   ├── docker-compose.yml        # Loopback bind for Debian + nginx
│   └── nginx-trmnl.conf          # /trmnl → :8799 snippet
├── docs/
│   └── trmnl-private-plugin.md   # Polling vs webhook, variable tips
├── examples/
│   └── sample-payload.json       # JSON shape expected by markup/
└── markup/
    ├── full.liquid               # Paste into Markup Editor → Full
    ├── half_horizontal.liquid    # Mashup half (optional)
    ├── half_vertical.liquid
    ├── quadrant.liquid
    └── shared.liquid             # Shared snippets / light styles
```

## Prerequisites

- A TRMNL device (BWRY recommended for this scaffold)
- **Developer Edition** / Developer perks enabled on the account  
  (Clarity Kit includes Developer Edition; otherwise upgrade once in device settings → Developer perks)
- No secrets belong in this repo — keep API keys and webhook UUIDs out of git

## Create a Private Plugin in TRMNL

1. In TRMNL, open **Plugins** → search **Private Plugin**.
2. Give it a name (e.g. `CreaFridge`).
3. Choose a **Strategy**:
   - **Polling** (recommended) — TRMNL fetches `https://crearec.app/trmnl` on a schedule.
   - **Webhook** — you `POST` data to TRMNL when something changes.
4. Save the plugin (needed before markup / UUID / webhook URL appear).
5. Click **Edit Markup**.
6. Paste files from `markup/`:
   - `full.liquid` → **Full** tab
   - optionally the half / quadrant files into their tabs
   - `shared.liquid` → **Shared** tab
7. Force Refresh, then preview with device profile **TRMNL OG (B/W/R/Y)** (or equivalent BWRY preview).

Official guide: [Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins)

## Set a polling URL

1. Strategy → **Polling**
2. Polling verb → `GET`
3. Polling URL → `https://crearec.app/trmnl`

JSON shape matches `examples/sample-payload.json` (`title`, `plugin_label`, `updated_at`, `home_status`, `home_summary`, `presence`, `routines`, `alerts`). Presence / routines / alerts may stay hardcoded for now; only `updated_at` is live.

**Single URL:** root fields bind as `{{ field_name }}`.  
**Multiple URLs:** use `{{ IDX_0.field }}`, `{{ IDX_1.field }}`, …

Put merge variables at the **root** of the JSON object (not nested under a lone `data` wrapper), unless you deliberately reference `{{ data.field }}`.

More detail: [docs/trmnl-private-plugin.md](docs/trmnl-private-plugin.md)

## Run the poll server locally

```sh
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

CI on `main` publishes `ghcr.io/crearec/trmnl-plugin:main` (+ `sha-*`) and SSH-deploys when the same Tailscale / deploy secrets as CreaParks are configured (`TS_OAUTH_*`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`).

Manual one-time nginx:

1. Copy `deploy/nginx-trmnl.conf` into `/etc/nginx/snippets/` and `include` it from the crearec.app site.
2. Place `deploy/docker-compose.yml` at `/home/crearec/trmnl-plugin/docker-compose.yml`.
3. `docker compose pull && docker compose up -d`
4. `curl -sS https://crearec.app/trmnl/health`

Public paths:

| Path | Backend |
| --- | --- |
| `/trmnl` | `http://127.0.0.1:8799/` (poll JSON) |
| `/trmnl/` | 301 → `/trmnl` |
| `/trmnl/health` | `http://127.0.0.1:8799/health` |

## BWRY notes

- Framework palette class: **`screen--color-4bwry`** (black, white, red, yellow).
- On hosted Private Plugins, TRMNL usually wraps your markup in Screen / View for you — paste **layout + title_bar** only (as in `markup/full.liquid`).
- If you render offline / BYOS / framework playground, wrap with:

  ```html
  <div class="screen screen--og screen--color-4bwry">
    <div class="view view--full">
      <!-- layout + title_bar from markup/full.liquid -->
    </div>
  </div>
  ```

- Prefer sparse color: red for alerts / away, yellow for attention / upcoming, black text for body.
- BWRY refreshes are slower than grayscale OG — favor glanceable blocks over dense tables; longer refresh intervals are fine for a fridge mount.
- In the Markup Editor / Framework Device Preview, switch to **B/W/R/Y** (or **TRMNL OG (B/W/R/Y)**) before judging color.

Framework references:

- [Color palettes](https://trmnl.com/framework/docs/3.3/color_palettes)
- [Structure](https://trmnl.com/framework/docs/3.3/structure)
- [Liquid 101](https://help.trmnl.com/en/articles/10671186-liquid-101)

## Local markup workflow

1. Edit Liquid under `markup/`.
2. Keep `examples/sample-payload.json` (and `src/payload.ts`) in sync with any new `{{ variables }}`.
3. Copy into the TRMNL Markup Editor and Force Refresh.
4. Point Polling at `https://crearec.app/trmnl` (or local `:8799`).

## License / ownership

CreaRec / Nikita — private home plugin scaffold. Talk and code comments may be English; keep the README practical for setup.
