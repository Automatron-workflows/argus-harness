# Verification

Recorded 16 November 2026 for v0.1.0.

## Automated

```sh
npm test
npm run check
```

- **31 Node tests** pass: calendar validity, metric/dashboard/snapshot
  validation, series gaps, nice ticks, growth rate suppression, formatting,
  healthy/stale/empty audits, renderer escaping and unavailable values, CSV
  parsing, row-to-snapshot normalization, HTTP success/failure, BigQuery SQL
  validation, static project loading, Looker DDL and field map, CLI
  init/doctor/render/audit/looker.
- `npm run check` passes. The starter audit reports **14 pass, 1 warning, 0
  fail** at the fixed audit time `2026-11-15T12:00:00Z`. The warning is the
  deliberate two-day gap in `search_impressions`.
- The starter render is a static HTML artifact with 4 KPI cards, 5 charts, an
  explicit gap, KPI sparklines, a chart data table and a status pill.
- The CLI init/doctor/render/audit/looker sequence passes from an empty
  temporary directory.
- The Looker export writes `bigquery.sql`, `looker-fields.csv`,
  `looker-fields.json` and `README.md`.
- The warehouse starter loads 6 provider sources; the custom SQL command runs
  against a local fixture; Athena polling/parsing is tested with a fake `aws`
  command; a missing command returns an unavailable snapshot; `--source`
  overrides the provider and the audit records it.

## Browser

The public workshop is deployed at
`https://automatron-workflows.github.io/argus-harness/demo/`. The `test` and
`workshop` GitHub Actions workflows pass.

The Argus reference is also hosted with the portfolio at
`https://matthias-mandiau-portfolio.lovable.app/case-studies/upswitch/argus-results/harness.html`.
Its audit reports 14 pass, 1 explicit-gap warning, 0 fail. The page is responsive
at 320, 390, 768 and 1440px with no horizontal overflow.

Inspected in Chrome at 1440×900 and 390×844:

- The demo loads with no page or console errors.
- Dashboard, Contract, Sources, Looker Studio and Audit tabs open.
- The Live, Stale and Unavailable states re-render the same dashboard.
- The stale state produces a freshness failure; the unavailable state produces
  null KPIs and a required-metrics failure; the live state produces 14 pass and
  1 gap warning.
- No horizontal page overflow at 390px. Charts scale with the stage; the table
  scrollers work.
- Download buttons and the clipboard action were inspected in the code but not
  exercised as file downloads in this run.

## Not verified

- A real BigQuery query through `bq`; no Google Cloud account was used. The SQL
  builder and identifier validation are unit-tested.
- A real HTTP product API; the adapter is tested against a local server and a
  Titan-shaped fixture.
- Looker Studio report creation, blends or calculated fields. The bridge writes
  SQL and a field map only.
- Authentication, authorization, rate limits, retries and scheduled refresh.
  These belong to the host.
- Pixel-identical parity with Argus. The pack keeps the visual language; the
  renderer is a static, dependency-free surface.
- Accessibility certification. The demo uses semantic headings, labelled tabs,
  focusable table regions and escaped text; a dedicated accessibility audit is
  still required.
- A browser test runner in CI. The repository has no browser dependency; the
  workshop is built and inspected manually.

## Limitations of a passing audit

The audit checks the declared dashboard, catalog and supplied snapshot. It does
not prove that the source SQL is semantically correct, that every event was
collected, that an account is unique, or that a Looker Studio report uses the
same denominator. A pass is evidence about the declared checks, not a data-quality
certification.
