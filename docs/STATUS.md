# Status

## v0.2.2 · 17 November 2026

- Provider-neutral `fields` README.
- Warehouse starter documentation path clarified.
- 32 tests.

## v0.2.1 · 17 November 2026

- Added portable `warehouse-ddl` for Snowflake, Postgres, Redshift and DuckDB.
- Added `fields` for a Looker Studio field map without BigQuery SQL.
- 32 tests.

## v0.2.0 · 17 November 2026

Implemented on top of v0.1.0:

- `sql-cli` warehouse source with Snowflake, Postgres, Redshift, DuckDB, Athena
  and a custom command contract.
- `--source <id>` for one dashboard contract across providers.
- `init --template warehouse` with source boilerplates, SQL projection examples,
  a sample CSV and provider setup notes.
- BigQuery custom `sql` projections.
- Athena polling, pagination and JSON result parsing.
- Child-process environment allowlist.
- 32 tests, including fake CLI and Athena command coverage.

Not implemented:

- A client-side chart renderer with tooltips, a date slider or cross-filtering.
  The static renderer has an `Explore chart values` table instead.
- Scheduled refresh, retries, caching or a last-good window. The host owns these.
- Warehouse DDL migration runners; the SQL files are reviewed starting points.
- A Looker Studio connector or API integration.
- Authentication, authorization or a report server.
- Automated accessibility certification.
- A browser test runner in CI.
- Live warehouse integration tests. The suite covers SQL construction, local
  command execution, CSV/JSON parsing and Athena polling with a fake `aws`
  command. Real provider credentials are not used.

Next candidates, only with a real use case:

1. A live Snowflake/BigQuery integration test against a disposable dataset.
2. A client renderer that reuses the same contracts and adds a measured tooltip
   and date explorer.
3. A `--snapshot` diff command for comparing two evidence captures.
4. A `doctor --source <id>` read-only connectivity check that never prints
   credentials.

## v0.1.0 · 16 November 2026

Implemented:

- Versioned metric, source, dashboard, snapshot, evidence, project and pack
  formats, with runtime validators.
- Static JSON, HTTP JSON, CSV and BigQuery source adapters.
- Row-to-snapshot normalization with explicit gaps and source status.
- The audit and `argus.evidence/1` output.
- A dependency-free HTML/SVG renderer with KPI cards, sparklines, gap-aware
  line/area charts, bars, rows, tables, notes and status details.
- The Aurora pack from Argus.
- A starter project and a public workshop with Live, Stale and Unavailable
  states.
- BigQuery DDL/views and a Looker Studio field map.
- The Argus extraction audit in [ARGUS-AUDIT.md](ARGUS-AUDIT.md).

Not implemented:

- A client-side chart renderer with tooltips, a date slider or cross-filtering.
  The static renderer has an `Explore chart values` table instead.
- Scheduled refresh, retries, caching or a last-good window. The host owns these.
- A BigQuery schema migration runner; the SQL is a reviewed starting point.
- A Looker Studio connector or API integration.
- Authentication, authorization or a report server.
- Automated accessibility certification.
- A browser test runner in CI.

Next candidates, only with a real use case:

1. A custom adapter guide with a second warehouse (Postgres or DuckDB) and a
   tested failure path.
2. A client renderer that reuses the same contracts and adds a measured tooltip
   and date explorer.
3. A `--snapshot` diff command for comparing two evidence captures.
4. A BigQuery integration test against a disposable dataset.
5. A `doctor --source <id>` read-only connectivity check that never prints
   credentials.
