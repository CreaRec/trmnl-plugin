# TRMNL Private Plugin notes

Short reference for this repo’s Liquid markup and JSON binding. Official docs win if anything drifts.

## Strategies

| Strategy | Who pushes | Good for |
| --- | --- | --- |
| **Polling** | TRMNL `GET`s your URL on a schedule | Live fridge JSON from this service |
| **Webhook** | You `POST` to TRMNL when data changes | Shortcuts, n8n, event-driven updates |
| **Plugin Merge** | Combines other plugins’ parsed data | Mashups |

This repo assumes **Polling** first; the same root JSON fields work for **Webhook** under `merge_variables`.

### Polling

- HTTPS URL: production `https://crearec.app/trmnl` (also `/poll` on the Node service).
- Prefer JSON with a **flat root object**.
- After save: **Force Refresh** so merge variables appear in the Markup Editor.

**Binding**

- One URL → `{{ weather.today.temp_f }}`, `{{ days }}`, `{{ waste.label }}`, …
- Several URLs → `{{ IDX_0.weather.… }}`
- Avoid wrapping everything under a lone `data` key unless markup uses `{{ data.… }}`.

### Webhook

```bash
curl "https://trmnl.com/api/custom_plugins/YOUR_UUID" \
  -H "Content-Type: application/json" \
  -X POST \
  -d @- <<'EOF'
{
  "merge_variables": {
    "title": "CreaFridge",
    "weather": { "today": { "temp_f": 88, "condition": "Clear" }, "tomorrow": {} },
    "waste": { "active": false, "kind": null, "label": "", "is_sunday": false },
    "events": [],
    "days": []
  }
}
EOF
```

Keep payloads small (a few KB).

## Payload shape

See [`examples/sample-payload.json`](../examples/sample-payload.json).

| Field | Notes |
| --- | --- |
| `updated_at` | ISO UTC, refreshed every poll |
| `weather.today` / `.tomorrow` | Temps, condition (WMO text), `icon` URL, precip slots/summary |
| `waste` | Sunday-only badge; `kind` is `trash` or `trash_recycle` |
| `events` / `days` | Next 7 days in `America/Chicago`; waste is not in the calendar |

### Battery (device vars only)

Do **not** invent a server battery field. In Liquid, gate on TRMNL’s injected device vars, e.g.:

```liquid
{% if trmnl.device.percent_charged %}
  <span class="label">{{ trmnl.device.percent_charged | round }}%</span>
{% endif %}
```

Confirm the exact path under Markup Editor → **Your Variables** / `trmnl` (names can evolve). If the variable is absent, omit the badge.

## Variable tips

- Liquid: `{{ var }}`, `{% if %}`, `{% for %}`, filters.
- Global `trmnl` namespace (user, device, plugin settings) is available in the editor dropdown.
- Use `| default: "…" ` while scaffolding.
- Force Refresh when designing; TRMNL may skip regenerating when merge vars are unchanged.

## BWRY markup tips

- Device palette: `screen--color-4bwry`.
- Paste layout + `title_bar` only on hosted plugins.
- Sparse `text--red` / `text--yellow` for waste and precip; black for body.
- Full layout: outlined card frames — today/tomorrow weather with adaptive icons, status strip (battery + waste), calendar day rows (skip empty days after tomorrow).
- Do **not** use `bg--gray-*` (or other dark fills) for cards on BWRY: gray dither prints as dense black stipple. Prefer `outline` / `rounded--medium` frames on a light canvas.

## Wiring

1. Node service serves JSON matching the sample; caches ICS (~10 min) and Open-Meteo (~20 min).
2. Host `.env` supplies `CALENDAR_ICS_URL` + optional weather overrides (see `.env.example`).
3. Deploy compose uses `env_file: .env` under `/home/crearec/trmnl-plugin/`.
4. Nginx snippet: [`deploy/nginx-trmnl.conf`](../deploy/nginx-trmnl.conf).

Whitelist TRMNL IPs if locking down: https://trmnl.com/api/ips

## Links

- [Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins)
- [Liquid 101](https://help.trmnl.com/en/articles/10671186-liquid-101)
- [Framework structure](https://trmnl.com/framework/docs/3.3/structure)
- [Color palettes](https://trmnl.com/framework/docs/3.3/color_palettes)
- [Open-Meteo](https://open-meteo.com/)
