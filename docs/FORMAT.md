# Formats

All files are UTF-8 JSON. The validators in `src/schema.mjs` are authoritative.
Unknown top-level fields are preserved by JSON but not by the normalized object;
keep provider-specific metadata in your own files.

## Metric — `argus.metric/1`

```json
{
  "schema": "argus.metric/1",
  "key": "mrr_eur",
  "label": "Monthly recurring revenue",
  "description": "Invoice-backed recurring revenue for active paid subscriptions.",
  "unit": "currency_eur",
  "direction": "up",
  "aggregation": "latest",
  "nullPolicy": "gap",
  "owner": "Finance",
  "version": 1,
  "target": { "value": 25000, "label": "€25k monthly target" },
  "window": { "kind": "trailing", "days": 30 },
  "format": { "decimals": 0 },
  "source": { "id": "warehouse", "field": "mrr_eur" }
}
```

- `unit`: `currency_eur`, `count`, `percent`, `ratio`, `days`, `hours`,
  `duration_s`.
- `direction`: `up`, `down`, `neutral`.
- `aggregation`: `latest`, `sum`, `cumulative`, `rolling`, `average`.
- `nullPolicy`: `gap` (a missing day is a gap) or `unavailable` (a missing latest
  value is unavailable). Both mean "do not zero".
- `percent` values are fractions: `0.3438` renders as `34.38%`.
- `window` is optional metadata; the dashboard declares the render window.
- `target.band` is an optional ascending two-number interval.

## Source — `argus.source/1`

```json
{
  "schema": "argus.source/1",
  "id": "warehouse",
  "label": "Warehouse",
  "description": "Long-format metric rows in BigQuery.",
  "kind": "bigquery",
  "freshnessHours": 26,
  "config": {
    "project": "my-project",
    "dataset": "analytics",
    "table": "metric_daily",
    "dateColumn": "metric_date",
    "metricColumn": "metric_key",
    "valueColumn": "value",
    "sourceColumn": "source",
    "computedAtColumn": "computed_at"
  }
}
```

Kinds:

- `static-json`: `{ "path": "data/snapshot.json" }`
- `http-json`: `{ "url", "method", "headers", "timeoutMs", "preset", "response" }`
- `csv`: `{ "path", "delimiter" }`
- `bigquery`: project/dataset/table and column names.

`headers` values may use `${ENV_VAR}`. Do not put a literal token in a project.
`preset: "titan-bundle"` maps a bundle with `metrics[key].latest` and
`metrics[key].history`. `response` maps a generic JSON shape with dot paths.

## Dashboard — `argus.dashboard/1`

```json
{
  "schema": "argus.dashboard/1",
  "id": "growth",
  "title": "Owner growth",
  "description": "Acquisition, product output and search reach.",
  "source": "warehouse",
  "window": { "days": 60 },
  "kpis": [
    { "metric": "mrr_eur", "label": "Monthly recurring revenue", "accent": "teal" }
  ],
  "sections": [
    {
      "id": "acquisition",
      "eyebrow": "01",
      "title": "Acquisition",
      "caption": "A rolling count and an active base.",
      "layout": "split",
      "panels": [
        {
          "kind": "chart",
          "title": "Active accounts",
          "series": [{ "metric": "active_accounts", "color": "teal" }],
          "chartType": "area"
        }
      ]
    }
  ]
}
```

Layouts: `split` (1.55:1), `equal`, `full`, `grid` (3 columns on desktop).
Panels: `chart`, `bars`, `rows`, `table`, `note`, `status`.

Chart series: 1–6 metrics, `area` or `line`, height 140–480.
Bars: `value` and optional `total` (the meter denominator).
Rows: strings only; pre-format when the value is not a metric.
Table: columns with `key`, `label`, optional `align`.

The dashboard cannot reference a metric that is not in the catalog.

## Snapshot — `argus.snapshot/1`

```json
{
  "schema": "argus.snapshot/1",
  "source": "warehouse",
  "asOf": "2026-11-15T06:00:00.000Z",
  "window": { "start": "2026-09-17", "end": "2026-11-15", "days": 60 },
  "status": {
    "state": "live",
    "label": "Live snapshot",
    "detail": "The warehouse responded.",
    "coverage": "60 measured days · 10 metrics",
    "computedAt": "2026-11-15T06:00:00.000Z"
  },
  "metrics": {
    "mrr_eur": {
      "value": 23704,
      "date": "2026-11-15",
      "history": [
        { "date": "2026-11-14", "value": 23680 },
        { "date": "2026-11-15", "value": 23704 }
      ],
      "source": "billing"
    }
  }
}
```

A missing day is absent from `history`. A null latest value is `value: null`,
`date: null`. Do not add a synthetic row.

## Evidence — `argus.evidence/1`

```json
{
  "schema": "argus.evidence/1",
  "dashboard": "growth",
  "source": "warehouse",
  "capturedAt": "2026-11-15T12:00:00.000Z",
  "checks": [
    {
      "id": "freshness",
      "level": "pass",
      "title": "Snapshot is inside its freshness budget",
      "detail": "6.0 hours old; budget 26 hours."
    }
  ],
  "summary": { "pass": 14, "warn": 1, "fail": 0, "info": 0 },
  "contract": {
    "metricCatalog": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "dashboard": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "snapshot": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

`level` is `pass`, `warn`, `fail` or `info`. Fails exit non-zero; `--strict`
also fails on warnings.

## Project — `argus.project/1`

```json
{
  "schema": "argus.project/1",
  "id": "harbour",
  "name": "Harbour metrics",
  "pack": "aurora",
  "metrics": "metrics",
  "sources": "sources",
  "dashboards": "dashboards",
  "defaultDashboard": "growth"
}
```

Each folder is read for `*.json`. A single file may contain one document or an
array under `metrics`, `sources` or `dashboards`.

## Pack — `argus.pack/1`

```json
{
  "schema": "argus.pack/1",
  "id": "aurora",
  "name": "Aurora",
  "version": "1.0.0",
  "tokens": {
    "color.background": "#0d1014",
    "color.surface": "#14181e",
    "color.text": "#eef2f3",
    "color.muted": "#9ba6b2",
    "color.border": "#28313a",
    "color.primary": "#35b7a9",
    "color.teal": "#5ed3c6",
    "color.violet": "#a58be0",
    "space.radius": "16px",
    "font.sans": "Satoshi, system-ui, sans-serif",
    "font.mono": "'JetBrains Mono', monospace"
  }
}
```

Token names are flat, lowercase and dot-separated. Colors are `#rrggbb` or a
`var(--token)` reference. A pack is not a full design system; it is the small set
of surfaces the renderer needs.
