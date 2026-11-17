# Warehouses

The harness does not need a warehouse SDK. It runs the provider's existing CLI,
reads five canonical columns and leaves authentication to the caller.

## Canonical row

```text
metric_key   string
metric_date  date (real calendar day)
value        float (null allowed)
source       string (optional)
computed_at  timestamp (optional)
```

A missing day is a gap. Do not load zero for it. Percent metrics are fractions:
`0.34`, not `34`.

## Start

```sh
node bin/argus-harness.mjs init ./my-warehouse --template warehouse
cd my-warehouse
node ../bin/argus-harness.mjs doctor --project .
node ../bin/argus-harness.mjs render --project . --source bigquery --out dashboard.html
node ../bin/argus-harness.mjs audit --project . --source bigquery --out evidence.json
```

The starter includes `bigquery`, `snowflake`, `postgres`, `redshift`, `duckdb`
and `athena` source files. The dashboard uses `bigquery` by default; `--source`
runs the same dashboard contract against another provider.

## BigQuery

```json
{
  "kind": "bigquery",
  "config": {
    "project": "my-project",
    "dataset": "analytics",
    "table": "metric_daily",
    "location": "EU"
  }
}
```

- Uses `bq query` and the existing `gcloud` login.
- Long-format table; the adapter generates the query.
- `config.sql` can replace the generated query with a projection from any
  existing table. Keep the five aliases.
- `argus-harness looker` writes the BigQuery catalog/views and Looker field map.

## Snowflake

```json
{
  "kind": "sql-cli",
  "config": {
    "preset": "snowflake",
    "connection": "my_connection",
    "database": "analytics",
    "schema": "public",
    "warehouse": "transforming",
    "role": "reporting",
    "sql": "SELECT metric_key, metric_date, value, source, computed_at FROM analytics.public.metric_daily WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'"
  }
}
```

- Uses `snowsql` in CSV mode with `friendly=false` and `timing=false`.
- The connection profile owns the password; do not put it in the project.
- If you use the newer `snow` CLI, set `command` and `args` explicitly:
  ```json
  {
    "command": "snow",
    "args": ["sql", "-q", "{{sql}}", "--format", "json"],
    "format": "json"
  }
  ```
  Confirm the installed CLI's output format before relying on it.

## Postgres and Redshift

```json
{
  "kind": "sql-cli",
  "config": {
    "preset": "postgres",
    "connectionEnv": "DATABASE_URL",
    "env": ["DATABASE_URL"],
    "sql": "SELECT ... FROM analytics.metric_daily WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'"
  }
}
```

- Uses `psql --csv -v ON_ERROR_STOP=1 -c`.
- `DATABASE_URL` is passed only when listed; other environment variables are not
  inherited by the child. Use `PGSSLMODE` and the other `PG*` names explicitly
  if needed.
- Redshift is the same command; set `preset: "redshift"` for the label and keep
  the Redshift endpoint/SSL settings in the connection environment.

## DuckDB

```json
{
  "kind": "sql-cli",
  "config": {
    "preset": "duckdb",
    "database": "data/harbour.duckdb",
    "sql": "SELECT ... FROM metric_daily WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'"
  }
}
```

- Uses `duckdb <file> -csv -c <sql>`.
- Good for a local smoke test and CI; the database file must already contain the
  table.

## AWS Athena

```json
{
  "kind": "sql-cli",
  "config": {
    "preset": "athena",
    "region": "eu-west-1",
    "database": "analytics",
    "outputLocation": "s3://my-athena-results/",
    "workgroup": "primary",
    "env": ["AWS_PROFILE", "AWS_REGION"],
    "sql": "SELECT ... FROM analytics.metric_daily WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'"
  }
}
```

- Uses `aws athena start-query-execution`, polls `get-query-execution`, then
  reads `get-query-results` (including pagination) and maps the header row.
- Requires the AWS CLI, an authenticated profile and an S3 result location.
- Athena is asynchronous; `timeoutMs` defaults to 180 seconds in the starter.

## Any other CLI

```json
{
  "kind": "sql-cli",
  "config": {
    "preset": "custom",
    "command": "my-warehouse",
    "args": ["query", "--format", "csv", "{{sql}}"],
    "format": "csv",
    "env": ["MY_WAREHOUSE_TOKEN"],
    "sql": "SELECT ... WHERE day BETWEEN '{{start}}' AND '{{end}}'"
  }
}
```

- `{{sql}}` is replaced in args. If no `{{sql}}` is present and `stdin` is true,
  SQL is written to stdin.
- `format` is `csv` (header row required) or `json` (array of objects).
- `env` is an allowlist. Only `PATH`, `HOME`, `TMPDIR` and the listed names reach
  the child.
- `cwd` is resolved inside the project; relative command paths and data files are
  found there. The warehouse starter's `custom-local` source uses this for an
  offline smoke test.
- The command must output the five canonical columns. Keep logs on stderr.

## Existing wide tables

Put a projection in `config.sql` and keep the aliases:

```sql
SELECT 'mrr_eur' AS metric_key, metric_date, mrr_eur AS value, 'billing' AS source, computed_at
FROM analytics.daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
UNION ALL
SELECT 'active_accounts', metric_date, active_accounts, 'product', computed_at
FROM analytics.daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
```

The starter's `queries/wide-*.sql` has provider-specific examples. The harness
replaces `{{start}}`, `{{end}}` and `{{days}}`; it does not parse or validate the
projection beyond "one SELECT/WITH statement".

## Security

- No credentials, account IDs or private rows belong in the project.
- The child process gets a small environment allowlist, not the full parent
  environment.
- The SQL template is caller-supplied. Run trusted project files only.
- The audit checks the returned rows, not the warehouse's permissions, query
  cost or semantic correctness.

## Limits

- The harness does not create warehouse infrastructure, load data or manage
  credentials.
- The provider CLI must be installed and authenticated.
- CSV parsing expects a clean header row on stdout. JSON expects an array of
  objects.
- No query is executed by `doctor`; use `render` or `audit` for a real read.
- Looker Studio native connectors and report-level calculated fields are outside
  the audit; review them separately.
