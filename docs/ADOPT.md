# Adopt the harness

Three ways to use it, from smallest to largest.

## 1. Use the CLI on a new dashboard

```sh
node /path/to/argus-harness/bin/argus-harness.mjs init ./my-dashboard
cd my-dashboard
node /path/to/argus-harness/bin/argus-harness.mjs doctor --project .
```

Edit `metrics/*.json`, point a source at your measured rows, edit
`dashboards/growth.json`, then:

```sh
node /path/to/argus-harness/bin/argus-harness.mjs render --project . --out dashboard.html
node /path/to/argus-harness/bin/argus-harness.mjs audit --project . --out evidence.json
```

The output is a static page. Publish it wherever you serve static files. The
audit is the gate, not the renderer.

## 2. Add a source adapter

Start with a warehouse query that returns one row per metric per day. Keep the
row shape:

```js
{ metric_key, metric_date, value, source?, computed_at? }
```

If you use BigQuery long-format, the built-in adapter is enough. If you use a
different warehouse, write a small adapter and call `snapshotFromRows`.

Do not return zero for a missing row. Do not carry the last value forward. Do not
merge a rolling count with a calendar month.

## 3. Use the primitives inside an existing app

Import the validators, series helpers or renderer:

```js
import { renderDashboard, validateSnapshot, segments, niceTicks } from "@automatron/argus-harness";
```

The React app can keep its own chart components and use only the catalog,
snapshot, gap and audit primitives. The contracts do not require the static
renderer.

If you already use Looker Studio, generate the warehouse layer:

```sh
node /path/to/argus-harness/bin/argus-harness.mjs looker --project . --out output/looker
```

Apply the SQL, connect Looker to `v_metric_daily`, and keep the catalog in the
repository.

## A migration sequence

1. Inventory the metrics already shown in dashboards, spreadsheets and reports.
2. Write the ambiguous ones first: percentages, rolling windows, cumulative
   counters and anything with a null.
3. Record owner, unit, aggregation, null policy and version.
4. Choose one source and one dashboard. Do not migrate everything at once.
5. Run the audit. Fix the source or the contract; do not hide the warning.
6. Publish the static dashboard and compare it with the existing report.
7. Only then connect Looker Studio to the shared views.

## Questions to answer before you start

- Does a missing day mean "not collected" or "measured zero"?
- Is a percentage stored as `0.34` or `34`?
- Is a 30-day count rolling or calendar?
- Which metric can legitimately decrease?
- Who owns the definition when the source changes?
- What freshness is acceptable for this audience?
- Which private rows must never enter a public artifact?

If the answer is unclear, keep the metric out of the dashboard. An honest gap is
better than a confident number.
