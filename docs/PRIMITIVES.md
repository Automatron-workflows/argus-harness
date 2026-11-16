# Primitives

The harness exists because the important decisions in a dashboard are not in the
chart library. They sit in a handful of small primitives that are easy to get
wrong and hard to notice after a screenshot is approved.

## 1. Metric contract

A metric key is a promise. `mrr_eur` is not "whatever the billing query returns";
it is invoice-backed recurring revenue, in EUR, latest measured row, direction
up, gap on missing days, owned by Finance, version 1, with a €25k target.

Locked fields:

| Field | Why it is locked |
| --- | --- |
| `key` | Stable join key across the harness, BigQuery, Looker and source rows. Lowercase snake_case. |
| `label` | One human label, not a chart title that drifts between pages. |
| `description` | The definition and its boundary. Long enough to disambiguate. |
| `unit` | `currency_eur`, `count`, `percent`, `ratio`, `days`, `hours`, `duration_s`. Percent is a fraction. |
| `direction` | `up`, `down` or `neutral`. Lower-is-better metrics must not show a green increase. |
| `aggregation` | `latest`, `sum`, `cumulative`, `rolling` or `average`. A rolling count is not a calendar month. |
| `nullPolicy` | `gap` or `unavailable`. Never silently zero. |
| `target` | Optional value, band and label. A target is a claim; keep it visible. |
| `owner` | The team that answers for the definition. |
| `version` | Increment when the meaning changes; a dashboard cannot silently reuse an old claim. |
| `source` | Optional source id and field mapping. The adapter still owns acquisition. |

## 2. Calendar day and gaps

Every series is keyed by a real UTC calendar day. `normalizeDay` rejects
`2026-02-30` and projects ISO datetimes to their UTC day. `segments` splits a
series wherever one or more days are absent. The chart draws separate paths; the
table prints `—`. No interpolation, no zero fill, no "carry forward".

This is the difference between "we did not collect the 4th" and "the value was
zero on the 4th".

## 3. Source status

A snapshot carries a status independent of its numbers:

| State | Meaning |
| --- | --- |
| `live` | The source responded and the requested metrics have measured rows. |
| `partial` | Some requested metrics are empty. Values that exist remain visible. |
| `stale` | The last successful snapshot is older than the source budget. Values remain visible, not current. |
| `unavailable` | No usable rows. Null, not zero. |
| `restricted` | The caller may not read this source. |
| `critical` | A contract or integrity failure that must stop publication. |

The status also carries `detail`, `coverage` and `computedAt`. The audit uses the
source's `freshnessHours`; a source is allowed to declare a different budget.

## 4. Series semantics

- `normalizeHistory` de-duplicates a day, keeps the last measured value, drops
  invalid and non-finite rows, and sorts by day.
- `segments` is the only gap logic. The renderer, sparkline and table share it.
- `niceTicks` produces a readable y-axis from 0 to a rounded top.
- `selectDateTicks` thins x-axis labels by rendered pixel distance.
- `growthRates` returns a fraction or `null`. It never extrapolates before the
  first observation, and a zero baseline with a positive current value is `null`,
  not `+∞%`.
- `summarize` keeps first, last, min, max and delta. It does not invent a trend.

## 5. Source adapter

The adapter boundary is one shape:

```js
// rows
{ metric_key, metric_date, value, source?, computed_at? }
// snapshot
{ schema, source, asOf, window, status, metrics }
```

Built-in adapters: static JSON, HTTP JSON, CSV and BigQuery (`bq` CLI). The HTTP
adapter supports a generic response map and a Titan-style bundle. A failed
request returns an unavailable snapshot; it does not throw a half-rendered page.

No credentials are stored in the project. Header values can reference
`${ENV_VAR}` and are resolved at load time. The host still owns authentication.

## 6. Dashboard contract

A dashboard selects metrics by key. It cannot invent a metric that is not in the
catalog. Panels are declarative: `chart`, `bars`, `rows`, `table`, `note`,
`status`. A chart series has a metric, optional label and a palette accent. The
renderer resolves the label, unit, color and source.

The contract also fixes the window. A dashboard asking for 60 days cannot quietly
render a 30-day source.

## 7. Audit and evidence

`auditDashboard` writes `argus.evidence/1`. Each check is `pass`, `warn`, `fail`
or `info`, with a title and a consequence. Fails exit non-zero; `--strict` also
fails on warnings. The evidence also carries SHA-256 fingerprints of the metric
catalog, dashboard and snapshot, so a contract change is visible in the record.

The audit is deliberately conservative:

- it checks declared rows and contracts, not the source's SQL semantics;
- a gap is a warning, not a failure;
- a missing metric is a failure;
- a stale source is a warning, a source more than twice the budget old is a
  failure;
- a cumulative step down is a warning; a percent outside 0–1 is a warning.

## 8. Looker bridge

The bridge generates a shared warehouse layer: `metric_catalog`, `metric_daily`,
`metric_status`, `v_metric_latest`, `v_metric_daily`, `v_metric_health`. The
field map carries the same labels, units, directions and descriptions.

The 35 standard Argus definitions are preserved in
[`examples/argus-reference`](../examples/argus-reference). The catalog is
metadata only; the source fetches the public portfolio snapshot at render time
and uses `metricOverrides` for the corrected user-report product history.

It does not generate a Looker Studio connector. Looker Studio is a peer surface;
its blends and calculated fields can diverge from the catalog and must be
reviewed.

## Mapping from Argus

See [ARGUS-AUDIT.md](ARGUS-AUDIT.md) for the source-file mapping and the
decisions about what was not extracted.
