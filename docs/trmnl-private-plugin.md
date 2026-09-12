# TRMNL Private Plugin notes

Short reference for this repo’s Liquid markup and JSON binding. Official docs win if anything drifts.

## Strategies

| Strategy | Who pushes | Good for |
| --- | --- | --- |
| **Polling** | TRMNL `GET`/`POST`s your URL on a schedule | Stable JSON API / static sample / future CreaDashboard |
| **Webhook** | You `POST` to TRMNL when data changes | Shortcuts, n8n, scripts, event-driven updates |
| **Plugin Merge** | Combines other plugins’ parsed data | Mashups of existing TRMNL sources |

This scaffold assumes **Polling** first; the same root JSON fields work for **Webhook** once nested under `merge_variables`.

### Polling

- One or more HTTPS URLs (line-separated).
- Formats: JSON (preferred here), RSS, XML, plaintext, CSV.
- Optional headers / body; form fields can interpolate as `{{ form_field_key }}`.
- After save: **Force Refresh** so merge variables appear in the Markup Editor.

**Binding**

- One URL → root keys are top-level: `{{ home_status }}`, `{{ presence }}`, …
- Several URLs → `{{ IDX_0.home_status }}`, `{{ IDX_1.… }}`
- Prefer a **flat root object**. A wrapper like `{ "data": { … } }` forces `{{ data.home_status }}`.
- Root arrays are exposed as `data[0]`, `data[1]`, …

Demo endpoint (different shape): `https://trmnl.com/custom_plugin_example_data.json`

### Webhook

1. Create/save the Private Plugin with Strategy **Webhook**.
2. Copy the **Webhook URL** / Plugin Setting UUID from the instance form.
3. `POST` JSON with a `merge_variables` object:

```bash
curl "https://trmnl.com/api/custom_plugins/YOUR_UUID" \
  -H "Content-Type: application/json" \
  -X POST \
  -d @- <<'EOF'
{
  "merge_variables": {
    "title": "CreaFridge",
    "home_status": "away",
    "presence": [{ "name": "Nikita", "state": "away" }],
    "routines": [],
    "alerts": ["Door ajar"]
  }
}
EOF
```

Optional: `merge_strategy` of `deep_merge` or `stream` (with `stream_limit`) — see [Webhooks](https://docs.trmnl.com/go/private-plugins/webhooks).

Payload size limits apply (on the order of a few KB). Keep fridge payloads small.

Same endpoint supports `GET` to inspect current merge variables.

## Variable tips

- Markup uses Liquid: `{{ var }}`, `{% if %}`, `{% for %}`, filters.
- Global `trmnl` namespace (user, timezone, plugin settings) is available in the editor dropdown — e.g. `{{ trmnl.plugin_settings.instance_name }}`.
- Use `| default: "…" ` for empty polling responses while scaffolding.
- TRMNL may skip regenerating a screen when merge variables are unchanged — use **Force Refresh** while designing.
- Custom filters: [Custom plugin filters](https://help.trmnl.com/en/articles/10347358-custom-plugin-filters).

## BWRY markup tips

- Device palette: `screen--color-4bwry`.
- Hosted editor: paste layout + `title_bar` only; platform wraps Screen/View.
- Preview as **TRMNL OG (B/W/R/Y)** / B/W/R/Y.
- Use `text--red` / `text--yellow` (and matching `bg--*` if needed) sparingly for status — black/gray for body text.
- Slow refresh → fewer panels, larger type, short labels.

## Wiring a future polling URL

1. Serve JSON matching [`examples/sample-payload.json`](../examples/sample-payload.json).
2. Set Private Plugin → Polling → that URL.
3. Keep field names stable so `markup/*.liquid` does not churn.
4. Auth via polling headers / form fields if needed — never commit secrets here.

Whitelist TRMNL server IPs if you lock down the API: https://trmnl.com/api/ips

## Links

- [Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins)
- [Dynamic polling URLs](https://help.trmnl.com/en/articles/12689499-dynamic-polling-urls)
- [Liquid 101](https://help.trmnl.com/en/articles/10671186-liquid-101)
- [Framework structure](https://trmnl.com/framework/docs/3.3/structure)
- [Color palettes](https://trmnl.com/framework/docs/3.3/color_palettes)
