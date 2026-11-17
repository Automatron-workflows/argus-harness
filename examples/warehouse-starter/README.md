# Harbour warehouse starter

A warehouse-neutral Argus Harness project. One metric catalog, one dashboard and
source boilerplates for:

- BigQuery
- Snowflake
- Postgres
- AWS Redshift
- DuckDB
- AWS Athena

The dashboard contract is the same. Pick a source with `--source`:

```sh
node ../bin/argus-harness.mjs doctor --project .
node ../bin/argus-harness.mjs render --project . --source custom-local --out output/dashboard.html
node ../bin/argus-harness.mjs audit --project . --source custom-local --out output/evidence.json
node ../bin/argus-harness.mjs render --project . --source bigquery --out output/bigquery.html
node ../bin/argus-harness.mjs audit --project . --source bigquery --out output/bigquery-evidence.json
node ../bin/argus-harness.mjs looker --project . --out output/looker
```

`custom-local` is an offline smoke test: it reads `data/example_rows.csv`
through the custom command contract. It needs no warehouse. `doctor` is offline.
The provider runs need their CLI and credentials; the audit fails if the command
is missing, the query fails or a requested metric has no measured rows.

## First steps

1. Read `sources/README.md` and choose a provider.
2. Replace the placeholders in that source file. Keep credentials in the
   environment or the provider's own profile.
3. Create a canonical `metric_daily` table, or point the source's `sql` at an
   existing table. See `warehouse/README.md` and `queries/`.
4. Load `data/example_rows.csv` for a quick smoke test, or use your own rows.
5. Run `doctor`, then `render` and `audit` with `--source`.
6. Connect Looker Studio to the same warehouse/views when needed.

## Canonical row

```text
metric_key   string
metric_date  date (calendar day)
value        float (null allowed)
source       string (optional)
computed_at  timestamp (optional)
```

A missing day is a gap. Do not load zero for it. Percent metrics are fractions:
`0.34`, not `34`.

## The dashboard

`dashboards/growth.json` uses the `bigquery` source by default. `--source
snowflake` (or any other id) runs the same metric and dashboard contract against
that warehouse. The audit compares the chosen source with the dashboard after
the override, so the evidence names the actual provider.

The starter data is fictional. No credentials or customer rows are included.
