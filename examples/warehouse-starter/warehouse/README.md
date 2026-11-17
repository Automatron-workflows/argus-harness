# Canonical table and sample rows

The harness only needs one row shape:

```text
metric_key   string
metric_date  date
value        float
source       string
computed_at  timestamp
```

Create it in the provider you use, or map an existing table with the SQL in
`queries/wide-*.sql`.

## BigQuery

```sql
CREATE TABLE IF NOT EXISTS metric_daily (
  metric_key STRING NOT NULL,
  metric_date DATE NOT NULL,
  value FLOAT64,
  source STRING,
  computed_at TIMESTAMP
)
PARTITION BY metric_date
CLUSTER BY metric_key;

bq load --source_format=CSV --skip_leading_rows=1 \
  YOUR_GCP_PROJECT:YOUR_DATASET.metric_daily \
  data/example_rows.csv \
  metric_key:STRING,metric_date:DATE,value:FLOAT64,source:STRING,computed_at:TIMESTAMP
```

`argus-harness looker` generates the catalog plus `v_metric_latest`,
`v_metric_daily` and `v_metric_health` for Looker Studio.

## Snowflake

```sql
CREATE TABLE IF NOT EXISTS metric_daily (
  metric_key VARCHAR NOT NULL,
  metric_date DATE NOT NULL,
  value FLOAT,
  source VARCHAR,
  computed_at TIMESTAMP_NTZ
);

-- Stage the CSV, then load it:
PUT file://data/example_rows.csv @~/argus;
COPY INTO metric_daily
FROM @~/argus/example_rows.csv
FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1)
ON_ERROR = 'ABORT_STATEMENT';
```

## Postgres

```sql
CREATE TABLE IF NOT EXISTS metric_daily (
  metric_key text NOT NULL,
  metric_date date NOT NULL,
  value double precision,
  source text,
  computed_at timestamptz
);

\copy metric_daily FROM 'data/example_rows.csv' CSV HEADER
```

For Redshift, use the same table shape with `COPY` from S3 or an `INSERT` set.

## DuckDB

```sql
CREATE TABLE IF NOT EXISTS metric_daily AS
SELECT * FROM read_csv_auto('data/example_rows.csv', header = true);
```

`duckdb data/harbour.duckdb` then run the statement, or use the DuckDB CLI.

## Athena

Create an external table over your S3 data, or load the sample into a table with
Athena CTAS. The table must expose the five canonical columns and `metric_date`
as a `date`.

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS metric_daily (
  metric_key string,
  metric_date date,
  value double,
  source string,
  computed_at timestamp
)
STORED AS PARQUET
LOCATION 's3://YOUR_BUCKET/argus/metric_daily/';
```

Set `outputLocation` in `sources/athena.json` to an S3 prefix the query results
may use. Athena needs the `aws` CLI, a working profile and permission to write
there.

## Looker Studio

- BigQuery: use `argus-harness looker` for the catalog and views.
- Snowflake, Redshift and Athena: connect Looker Studio's native connector to
  the warehouse and use `metric_daily`/`v_metric_daily`. Keep the same field
  labels, units and null policy from `metrics/`.
- The harness and Looker Studio should read the same rows; neither guarantees
  the other's freshness.
