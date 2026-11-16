# Source adapters

An adapter turns a source into measured rows and an explicit status. The
renderer and audit never see provider credentials or provider-specific fields.

## Row shape

```js
{
  metric_key: "mrr_eur",
  metric_date: "2026-11-15",
  value: 23704,
  source: "billing",              // optional
  computed_at: "2026-11-15T06:00:00Z" // optional
}
```

`snapshotFromRows` groups rows, sorts them, drops duplicate days (last wins),
computes the latest value and creates missing series as null. It then validates
the snapshot.

## static-json

```json
{
  "kind": "static-json",
  "config": { "path": "data/snapshot.json" }
}
```

The file may be a full `argus.snapshot/1`, a `{ metrics: { ... } }` document, an
array of rows, or `{ rows: [...] }`. A full snapshot is the most explicit choice
for a preserved evidence page.

## http-json

```json
{
  "kind": "http-json",
  "freshnessHours": 26,
  "config": {
    "url": "https://api.example.com/metrics?days={days}",
    "method": "GET",
    "timeoutMs": 15000,
    "headers": { "authorization": "Bearer ${METRICS_TOKEN}" },
    "preset": "titan-bundle"
  }
}
```

- `${ENV_VAR}` is resolved at load time. A missing variable fails the read.
- `method: "POST"` may include a literal `body` (for example, a JSON query). The
  body is not environment-substituted; keep secrets in headers.
- `preset: "titan-bundle"` maps:
  `metrics[key].latest.valueNumeric`, `.latest.snapshotDate`,
  `.latest.computedAt` and `metrics[key].history[]`.
- A generic response can use `response: { "metricsPath": "data.metrics",
  "valuePath": "value", "datePath": "date", "historyPath": "history" }`.
- A non-2xx response, timeout or parse error returns an `unavailable` snapshot.
  The CLI prints the detail; the audit fails.

The harness does not refresh tokens or retry a failed source. The host owns auth
and retry policy.

## CSV

```json
{ "kind": "csv", "config": { "path": "data/metrics.csv", "delimiter": "," } }
```

Header: `metric_key,date,value,source,computed_at`. Only the first three are
required. Quoted commas, quotes and newlines follow RFC 4180.

## BigQuery

```json
{
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
    "computedAtColumn": "computed_at",
    "location": "EU"
  }
}
```

The adapter shell-outs to:

```sh
bq query --use_legacy_sql=false --format=json --max_rows=100000 \
  --project_id my-project \
  'SELECT ... FROM `my-project.analytics.metric_daily` WHERE ...'
```

- The table is long-format. Use the generated `metric_daily` table from
  `argus-harness looker` if you need a starting schema.
- Column and table names are validated before interpolation. The date window is
  validated as `YYYY-MM-DD`.
- The caller's existing `bq` login is used. No service-account file or token is
  read by the harness.
- `BQ_BIN` can point at a different `bq` executable.
- If `bq` is missing or the query fails, the snapshot is unavailable. It does
  not fall back to a local cache.

## Custom adapter

```js
import { snapshotFromRows } from "@automatron/argus-harness";

const rows = await myWarehouse.query({ start, end });
return snapshotFromRows({
  rows,
  source,
  dashboard,
  metrics: project.metrics,
  now: new Date(),
});
```

Keep the row shape. Put source-specific validation in your adapter and return a
clear error message. Do not return zero for a missing row.

## Failure semantics

| Case | Snapshot |
| --- | --- |
| HTTP 500 | `unavailable`, detail includes the status |
| timeout | `unavailable`, detail includes the timeout |
| `bq` missing | `unavailable`, BigQuery detail |
| no rows | `unavailable`, null metrics |
| some metrics empty | `partial`, measured metrics remain |
| stale timestamp | values remain, status `stale` |
| invalid row | row dropped; the audit reports missing data |
