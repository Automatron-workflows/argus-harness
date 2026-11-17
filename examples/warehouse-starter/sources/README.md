# Sources

Each file is a complete source. The dashboard uses `bigquery` by default; use
`--source <id>` to switch without editing the dashboard.

| Source | Command | Credentials |
| --- | --- | --- |
| `bigquery` | `bq query` | Existing `gcloud`/`bq` login |
| `snowflake` | `snowsql` | SnowSQL connection profile; password stays there |
| `postgres` | `psql --csv` | `DATABASE_URL` in the environment |
| `redshift` | `psql --csv` | `DATABASE_URL` or `PG*` variables, SSL settings |
| `duckdb` | `duckdb` | Local database file, no credential |
| `athena` | `aws athena` | AWS profile/environment; S3 output location |
| `custom-local` | `node data/query.mjs` | Offline sample CSV for a smoke test |

No file in this folder contains a secret. `env` lists the environment variable
names the child process may receive; other variables are not passed.

## Existing schemas

If your table is wide, put a `sql` projection in the source and keep the five
canonical aliases. Examples are in `queries/wide-*.sql`. The harness replaces
`{{start}}`, `{{end}}` and `{{days}}` before running the command.

For a provider not listed, use `kind: "sql-cli"`, `preset: "custom"`, a
`command`, and either `args` with `{{sql}}` or `stdin: true`. Set `format` to
`csv` or `json`. See `docs/WAREHOUSES.md` in the harness repository.
