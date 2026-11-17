# Argus Harness

**Metrics you can defend.**

A small dashboard harness for metrics that must stay honest across sources. It
keeps the definition, unit, aggregation, null policy, target and freshness next
to the number, then renders the same contract from static JSON, HTTP, CSV or
BigQuery.

Extracted from [Argus](https://github.com/UpswitchEU/argus), the internal
analytics dashboard at Upswitch.

[Try the workshop](https://automatron-workflows.github.io/argus-harness/demo/) ·
[Download v0.1.0](https://github.com/Automatron-workflows/argus-harness/releases/tag/v0.1.0) ·
[Read the primitives](docs/PRIMITIVES.md) · [Audit](docs/ARGUS-AUDIT.md) ·
[Looker Studio](docs/LOOKER-STUDIO.md)

## Why

Most dashboards fail in small, repeatable ways:

- a missing day becomes a zero;
- a percentage is stored as `34.38` in one chart and `0.3438` in another;
- a 30-day rolling count is compared with a calendar month;
- a cumulative counter is allowed to step down without a reset;
- a stale source is presented as the current picture;
- a definition lives in a slide, a Looker field and a SQL comment, and the three
  disagree.

Argus Harness makes those decisions explicit. A metric is not a column name. It
is a small contract with a unit, direction, aggregation, null policy, owner and
version. The audit checks the contract against the snapshot before a dashboard
reaches a reader.

## What is in the box

| Primitive | What it locks |
| --- | --- |
| Metric contract | key, label, description, unit, direction, aggregation, null policy, target, owner, version |
| Source adapter | static JSON, HTTP JSON, CSV, BigQuery; one shape for rows and status |
| Dashboard contract | KPIs, sections, charts, bars, rows, tables and notes; no hidden metrics |
| Snapshot | measured daily rows, latest value, source status, coverage and `asOf` |
| Audit | source agreement, freshness, missing metrics, gaps, cumulative resets, units, chart thickness and definitions |
| Renderer | a dependency-free HTML/SVG dashboard with KPI sparklines, gap-aware charts, data tables and status labels |
| Looker bridge | BigQuery DDL/views and a field map for the same metric layer |

The important details are the primitives, not the pixels. The renderer is one
consumer; the metric and snapshot contracts are the reusable part.

## Install the release

Install the pinned `v0.1.0` tarball, or clone the repository for development:

```sh
npm install --ignore-scripts \
  https://github.com/Automatron-workflows/argus-harness/releases/download/v0.1.0/automatron-argus-harness-0.1.0.tgz

npx argus-harness init ./my-dashboard
cd my-dashboard
npx argus-harness doctor --project .
npx argus-harness render --project . --out dashboard.html
npx argus-harness audit --project . --out evidence.json
```

The package has no runtime dependencies. `npm install` is only needed to place
the `argus-harness` binary; the CLI itself uses Node's standard library.

## Run it from source

```sh
git clone https://github.com/Automatron-workflows/argus-harness.git
node argus-harness/bin/argus-harness.mjs init ./my-dashboard
cd my-dashboard
node ../argus-harness/bin/argus-harness.mjs doctor --project .
node ../argus-harness/bin/argus-harness.mjs render --project . --out dashboard.html
node ../argus-harness/bin/argus-harness.mjs audit --project . --out evidence.json
```

The starter contains ten fictional metrics, a 60-day snapshot, one dashboard and
a deliberate gap. Replace `data/snapshot.json` with your own measured rows. No
account, npm install, model call or telemetry is required.

The **Argus reference** in `examples/argus-reference` contains the 35 preserved
metric definitions with their real units, aggregations, null policies, owners and
targets. It fetches the public portfolio snapshot at render time; no Upswitch
rows are stored in this repository. A rendered copy is hosted with the portfolio:
<https://matthias-mandiau-portfolio.lovable.app/case-studies/upswitch/argus-results/harness.html>.

For the workshop:

```sh
npm run dev
# http://127.0.0.1:4179/demo/
```

## Use it instead of, or alongside, Looker Studio

**Instead of Looker Studio** when you want a code-owned dashboard: versioned
contracts, a small static artifact, no report-level drag-and-drop semantics, and
an audit that runs in CI.

**Alongside Looker Studio** when the warehouse is the source of truth and the
team uses Looker for exploration. Generate the same metric layer as BigQuery
tables and views:

```sh
node bin/argus-harness.mjs looker --project . --out output/looker
```

That writes `bigquery.sql` (`metric_catalog`, `metric_daily`, `metric_status`,
`v_metric_latest`, `v_metric_daily`, `v_metric_health`), a field map for the
Looker Studio BigQuery data source, and a short review guide. Looker Studio reads
the views; the harness reads the same rows. One catalog, two surfaces.

See [Looker Studio](docs/LOOKER-STUDIO.md) for the exact shared and unshared
semantics. The command does not call the Looker Studio API, deploy a connector or
manage credentials.

## Sources

| Kind | Use |
| --- | --- |
| `static-json` | A preserved snapshot or a checked-in evidence capture. |
| `http-json` | A product API. Supports a timeout, environment-backed headers, a generic response map and the Titan-style metrics bundle. |
| `csv` | An export with `metric_key,date,value,source,computed_at`. |
| `bigquery` | A long-format metric table queried through the `bq` CLI. |

An adapter returns measured rows plus a status. A failed request returns an
unavailable snapshot with null values; it does not return zeroes. No credentials
are stored in a project. HTTP header values may reference `${ENV_VAR}`, resolved
at load time.

A custom adapter is one function: read your source, return rows with
`metric_key`, `metric_date`, `value`, optional `source` and `computed_at`, then
call `snapshotFromRows`.

## The audit

`argus-harness audit` writes `argus.evidence/1` and exits non-zero on a fail
(`--strict` also fails on warnings). It checks:

- the dashboard source and the snapshot source agree;
- the requested window matches;
- the snapshot is inside its freshness budget;
- every requested metric has measured rows;
- the latest value matches the final history point;
- missing calendar days stay explicit gaps;
- cumulative series are non-decreasing;
- percent metrics stay inside 0–100%;
- charts have at least two measured points;
- no chart plots the same metric twice;
- every requested metric has a description, owner and null policy.

Gaps are a warning, not a failure. A gap is honest; a filled zero is not.

The evidence also carries SHA-256 fingerprints of the metric catalog, dashboard
and snapshot, so a contract change is bound to the record.

## Limits

- The harness is a presentation and contract layer. It does not own
  authentication, authorization, source credentials or database migrations.
- The BigQuery adapter uses the local `bq` CLI and the caller's existing login.
  It does not create datasets, tables or service accounts.
- The audit checks declared contracts and supplied rows. It does not prove that a
  source's SQL is semantically correct, that an account is unique, or that every
  event was collected.
- Looker Studio blends, calculated fields and report-level aggregation can change
  a metric's meaning. Review them against the catalog.
- The demo uses fictional Harbour data. No revenue, customer or search result is a
  measured claim.
- The starter is a template, not a production schema. Review the BigQuery DDL
  before applying it.

## Check the harness

```sh
npm test
npm run check
```

`npm run check` runs the Node tests, builds the static workshop, runs the CLI
against the starter, audits it and verifies the built assets. No browser binary,
account or network source is required. See [verification](docs/VERIFICATION.md)
for the current record and its limits.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/schema.mjs` | Versioned metric, source, dashboard, snapshot, evidence, project and pack validators |
| `src/sources.mjs` | Static, HTTP, CSV and BigQuery loading plus the row-to-snapshot normalizer |
| `src/series.mjs` | Calendar gaps, segments, ticks, growth rates and sparkline data |
| `src/audit.mjs` | Evidence checks and exit semantics |
| `src/render.mjs` | Dependency-free HTML/SVG dashboard renderer |
| `src/looker.mjs` | BigQuery DDL, views and Looker Studio field map |
| `src/cli.mjs` | `init`, `doctor`, `catalog`, `render`, `audit`, `looker`, `bigquery-sql` |
| `packs/aurora` | The dark Aurora tokens extracted from Argus |
| `examples/starter` | A complete fictional project |
| `examples/argus-reference` | The 35 preserved Argus metric definitions, reading the public portfolio snapshot |
| `demo` | The public workshop |
| `docs/PRIMITIVES.md` | What was locked and why |
| `docs/ARGUS-AUDIT.md` | The extraction audit from Argus source |
| `docs/RELEASE.md` | The pinned tarball, checksum and release process |

MIT licensed. Contributions that add a source adapter or a reproducible
definition failure are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
