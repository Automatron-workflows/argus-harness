# Releases

## v0.2.3 · 17 November 2026

Security/portability patch for warehouse child processes. Source revision: the
commit tagged `v0.2.3`. Tarball: `automatron-argus-harness-0.2.3.tgz`.

- BigQuery `bq` now receives only an allowlisted Google Cloud environment rather
  than the full parent environment.
- Postgres/Redshift receive `DATABASE_URL` and the standard `PG*` names by
  default.
- Snowflake receives the standard `SNOWSQL_*` names when present.
- Added an environment-allowlist test.
- 33 tests.

Install:

```sh
npm install --ignore-scripts \
  https://github.com/Automatron-workflows/argus-harness/releases/download/v0.2.3/automatron-argus-harness-0.2.3.tgz
```

## v0.2.2 · 17 November 2026

Fixes the `fields` command README for non-BigQuery warehouses. Source revision:
the commit tagged `v0.2.2`. Tarball:
`automatron-argus-harness-0.2.2.tgz`.

- `fields` now writes a provider-neutral Looker Studio field-map guide.
- `init --template warehouse` points to the harness repository's
  `docs/WAREHOUSES.md` explicitly.
- 32 tests.

Install:

```sh
npm install --ignore-scripts \
  https://github.com/Automatron-workflows/argus-harness/releases/download/v0.2.2/automatron-argus-harness-0.2.2.tgz
```

## v0.2.1 · 17 November 2026

Adds the portable warehouse DDL and field-map commands. Source revision: the
commit tagged `v0.2.1`. Tarball: `automatron-argus-harness-0.2.1.tgz`.

- `warehouse-ddl --dialect snowflake|postgres|redshift|duckdb` emits the catalog,
  daily/status tables and the latest/daily/health views.
- `fields` emits the Looker Studio field map without BigQuery-specific SQL.
- 32 tests.

Install:

```sh
npm install --ignore-scripts \
  https://github.com/Automatron-workflows/argus-harness/releases/download/v0.2.1/automatron-argus-harness-0.2.1.tgz
```

## v0.2.0 · 17 November 2026

Warehouse boilerplate release. Source revision: the commit tagged `v0.2.0`.
Tarball: `automatron-argus-harness-0.2.0.tgz`.

Adds:

- `sql-cli` source: Snowflake, Postgres, Redshift, DuckDB, Athena and a custom
  command contract.
- `--source <id>` to run one dashboard contract against another warehouse.
- `init --template warehouse` with source boilerplates, provider SQL examples and
  a sample CSV.
- `docs/WAREHOUSES.md`.
- BigQuery `config.sql` custom projection.
- Athena polling/pagination and JSON result parsing.
- Child-process environment allowlist.
- 32 tests.

Install:

```sh
npm install --ignore-scripts \
  https://github.com/Automatron-workflows/argus-harness/releases/download/v0.2.0/automatron-argus-harness-0.2.0.tgz
```

## v0.1.0 · 17 November 2026

Source revision: the commit tagged `v0.1.0`
Tarball: `automatron-argus-harness-0.1.0.tgz`

Install:

```sh
npm install --ignore-scripts \
  https://github.com/Automatron-workflows/argus-harness/releases/download/v0.1.0/automatron-argus-harness-0.1.0.tgz
```

Then:

```sh
npx argus-harness init ./my-dashboard
cd my-dashboard
npx argus-harness doctor --project .
npx argus-harness render --project . --out dashboard.html
npx argus-harness audit --project . --out evidence.json
```

Verified locally:

- `npm test` — 23 tests pass.
- `npm run check` — starter audit 14 pass, 1 gap warning, 0 fail.
- The packed tarball installs into an empty npm project, runs `version`, `init`,
  `doctor` and `render`, and produces a non-empty dashboard.
- `argus-harness init` copies the starter project; `doctor` validates it offline.
- The public workshop is deployed from `main` by the `workshop` workflow.

The tarball contains `bin`, `src`, `packs`, `examples`, `docs`, `demo`, `scripts`,
the README, the licence and the policy files. It contains no credentials,
customer rows or private URLs. The Argus reference fetches the public portfolio
snapshot at render time; no Upswitch rows are stored in the package.

## Release process

1. Run `npm test` and `npm run check`.
2. Build the published workshop: `npm run build`.
3. Confirm the source is committed and the working tree is clean.
4. Create the tarball:

   ```sh
   mkdir -p output/release
   npm pack --pack-destination output/release
   shasum -a 256 output/release/automatron-argus-harness-<version>.tgz
   ```

5. Test the tarball in a temporary npm project, including `init`, `doctor` and
   `render`.
6. Tag the exact source revision and create a GitHub release with the tarball and
   its checksum. Do not overwrite a published release; bump the version.
7. Update `docs/RELEASE.md`, `CHANGELOG.md` and the README install URL.
8. Verify the workshop deployment after the release commit.

The package is `private: true` and is not published to the npm registry. The
GitHub release tarball is the distribution unit, matching the other Automatron
harnesses. There is no automatic updater.
