# Looker Studio and BigQuery

Argus Harness can replace a Looker Studio dashboard or sit beside it. The shared
part is the metric layer, not the runtime.

## Instead of Looker Studio

Use the harness when:

- the dashboard should be a small versioned artifact, not a report owned by a
  drag-and-drop canvas;
- null, gap, window and freshness semantics must be enforced before publication;
- the same definitions should be reviewed in code and rendered in CI;
- the audience needs a stable read-only page, not a self-service explorer.

Run `argus-harness render` and publish the HTML. The source can still be
BigQuery; only the presentation is code-owned.

## Alongside Looker Studio

Use both when the team wants Looker for exploration and the harness for the
canonical read.

```sh
node bin/argus-harness.mjs looker --project . --out output/looker
```

This writes:

| File | Purpose |
| --- | --- |
| `bigquery.sql` | `metric_catalog`, `metric_daily`, `metric_status`, `v_metric_latest`, `v_metric_daily`, `v_metric_health`, plus catalog seed inserts |
| `looker-fields.csv` | Field, label, type, semantic type, default aggregation, unit, direction, description |
| `looker-fields.json` | The same map as structured JSON |
| `README.md` | Application steps and limits |

The SQL is a starting point. Review it before applying it to a production
dataset. It does not create service accounts, datasets or scheduled queries.

## Shared semantics

Both surfaces should use:

- the same `metric_key` values;
- the same catalog label, unit, direction and description;
- the same daily rows and latest-row rule (`ORDER BY metric_date DESC,
  computed_at DESC`);
- the same null policy: missing is blank, not zero;
- the same freshness view (`v_metric_health`).

## What is not shared

Looker Studio can add:

- blends across data sources;
- calculated fields with a different denominator;
- report-level filters that change the population;
- cached extracts with a different freshness;
- a chart aggregation that changes a rolling metric into a sum.

Those are review items. The field map is not a semantic guarantee. A report that
looks correct is not evidence that its rows are complete.

## A practical workflow

1. Keep the catalog and source rows in Git or in the warehouse migrations.
2. Generate `bigquery.sql` and the field map.
3. Apply the tables/views in a non-production dataset; review types and grants.
4. Point Looker Studio at `v_metric_daily` for exploration and `v_metric_latest`
   for scorecards.
5. Run `argus-harness audit` on the code-owned dashboard.
6. Compare any Looker calculated field with the catalog before publishing.
7. Repeat after a metric version change.

## Limits

- No Looker Studio API calls, connector deployment or credential handling.
- No guarantee that Looker's cache matches the source's `asOf`.
- No automatic reconciliation of report-level blends.
- `bq` must already be authenticated on the machine running the BigQuery
  adapter.
