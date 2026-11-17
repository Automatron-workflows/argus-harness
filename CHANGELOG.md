# Changelog

## 0.2.2 · 17 November 2026

- `fields` writes a provider-neutral Looker Studio field-map guide.
- The warehouse starter points to the harness repository's `docs/WAREHOUSES.md`.
- 32 tests.

## 0.2.1 · 17 November 2026

- Added `warehouse-ddl` for Snowflake, Postgres, Redshift and DuckDB: catalog,
  daily/status tables and latest/daily/health views.
- Added `fields` for the Looker Studio field map without BigQuery SQL.
- 32 tests.

## 0.2.0 · 17 November 2026

- Added the `sql-cli` warehouse source: Snowflake, Postgres, Redshift, DuckDB,
  Athena and a custom command contract.
- Added `--source <id>` for running one dashboard contract against another
  configured warehouse.
- Added `init --template warehouse` with provider source files, SQL projection
  examples, sample CSV and warehouse setup notes.
- Added BigQuery custom `sql` projections.
- Added Athena query polling, pagination and JSON result parsing.
- Added a child-process environment allowlist.
- Added 32 tests and `docs/WAREHOUSES.md`.

## 0.1.0 · 16 November 2026

- Extracted the metric, calendar, status, series, audit, renderer and Looker
  primitives from Argus.
- Added the `argus.*` formats and validators.
- Added static JSON, HTTP JSON, CSV and BigQuery adapters.
- Added the static HTML/SVG renderer and the Aurora pack.
- Added the starter project, public workshop and Looker Studio field map.
- Added 23 Node tests, including SHA-256 contract fingerprints, the 35-key Argus reference catalog and metric overrides, and the `npm run check` gate.
- Recorded the Argus source audit and remaining limits.
