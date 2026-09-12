# trmnl-plugin

Private Plugin markup for a fridge-mounted **TRMNL BWRY** (black / white / red / yellow) e-ink display.

This repo is **markup-first**: Liquid templates + a sample JSON shape. It is not a CreaDashboard rewrite. A polling URL (or webhook) can be plugged in later when a data source exists.

Related home context: Linear [CRE-20](https://linear.app/creadev/issue/CRE-20) / CreaDashboard — presence & routine glanceables on the fridge.

## Folder layout

```text
.
├── README.md
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
   - **Polling** (recommended for a future JSON API) — TRMNL fetches your URL on a schedule.
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

Until you have a real backend:

1. Strategy → **Polling**
2. Polling verb → `GET`
3. Polling URL → a public HTTPS URL that returns JSON matching `examples/sample-payload.json`

Quick start options while scaffolding:

- Host `examples/sample-payload.json` on any static HTTPS host (GitHub raw is awkward for CORS-free polling; a tiny gist / Pages / Cloudflare R2 / S3 object works).
- Or use TRMNL’s demo JSON to confirm the editor works:  
  `https://trmnl.com/custom_plugin_example_data.json`  
  (different shape — swap back to our sample before relying on the fridge markup.)

**Single URL:** root fields bind as `{{ field_name }}`.  
**Multiple URLs:** use `{{ IDX_0.field }}`, `{{ IDX_1.field }}`, …

Put merge variables at the **root** of the JSON object (not nested under a lone `data` wrapper), unless you deliberately reference `{{ data.field }}`.

More detail: [docs/trmnl-private-plugin.md](docs/trmnl-private-plugin.md)

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

## Local workflow

1. Edit Liquid under `markup/`.
2. Keep `examples/sample-payload.json` in sync with any new `{{ variables }}`.
3. Copy into the TRMNL Markup Editor and Force Refresh.
4. Optionally point Polling at a hosted copy of the sample JSON.

No production server is required for this scaffold. A future CreaDashboard (or any small JSON endpoint) can serve the same shape.

## License / ownership

CreaRec / Nikita — private home plugin scaffold. Talk and code comments may be English; keep the README practical for setup.
