# Argus audit · 16 November 2026

Audit of the internal Argus dashboard (`UpswitchEU/argus`, `apps/argus`) and the
primitives that were moved into this harness. The source revision reviewed was
`7b2aecb` (`UpswitchEU/argus`, 16 September 2026). The goal is reuse without
copying Upswitch credentials, private tables or provider-specific endpoints.

## Source map

| Argus source | Primitive | Locked into harness | Decision |
| --- | --- | --- | --- |
| `src/lib/metrics/keys.ts` | Metric keys, targets, formats | Metric contract, unit, direction, aggregation, target, owner, version | Extended. Argus keys had targets but no first-class unit/null policy/owner. |
| `src/lib/metrics/data-status.ts` | `DataStatus` states | `argus.snapshot.status` | Kept the six states and the distinction between state and numeric value. |
| `src/lib/metrics/metric-calendar-day.ts` | UTC day normalization | `normalizeDay` | Ported, with the same invalid-date rejection. |
| `src/lib/metrics/chart-gaps.ts` | Calendar gaps and segments | `segments`, renderer gap paths | Ported. Missing days stay blank. |
| `src/lib/metrics/chart-axis-ticks.ts` | Readable date ticks | `selectDateTicks` | Ported; thins by pixel distance, not index. |
| `src/lib/metrics/chart-value.ts` | Value formatting | `formatMetric` | Extended to currency, count, percent, ratio, days, hours, duration and text. |
| `src/lib/metrics/sparkline-series.ts` | Sparkline points/segments | `sparklinePoints` | Ported; the renderer also uses `segments` directly. |
| `src/lib/metrics/growth-rates.ts` | 30/90/365 growth | `growthRates` | Ported. No extrapolation; zero baseline returns `null`. |
| `src/lib/metrics/build-growth-series.ts` | Aligned growth rows | `snapshotFromRows`, chart series | Generalized: the host supplies aligned rows; the harness does not own cohort SQL. |
| `src/lib/metrics/build-user-activation-series.ts` | Registered/MAU/signups | Series contract | Kept as a dashboard example, not a harness-specific builder. |
| `src/lib/metrics/build-role-growth-series.ts` | Role cohorts | Bars/rows panels | Generalized to any categorical panel. |
| `src/lib/metrics/build-valuations-series.ts` | Cumulative + rolling | Aggregation semantics | Locked `cumulative` vs `rolling`; no implicit mixing. |
| `src/lib/metrics/queries.ts` | Bundle normalization, last-good cache | Snapshot normalization | Normalization kept; the in-process last-good cache is a host runtime concern, not a library primitive. |
| `src/lib/titan/*-parser.ts` | Provider response contracts | Adapter boundary | Not copied one-for-one. The harness keeps one row shape and one HTTP adapter; provider parsers belong to the host. |
| `src/lib/titan/client.ts` | Auth, endpoint, timeout, fallback | HTTP adapter | Kept timeout, env-backed headers, response mapping and unavailable status. Credentials/auth stay in the host. |
| `src/components/KPICard.tsx` | KPI value, delta, sparkline, source | `kpiCard` | Kept the value/help/target structure; omitted click-through actions and provider controls. |
| `src/components/MetricStatus.tsx` | Contextual diagnostics | Status pill + status panel | Kept state, detail, coverage and computed time. |
| `src/components/Sparkline.tsx` | Responsive sparkline | `sparkline` SVG | Reimplemented without React/visx. |
| `src/components/ChartDataExplorer.tsx` | Measured-date explorer | `Explore chart values` table | Kept the measured-date table and the "missing observations are unavailable" copy. The range slider is not in v0.1. |
| `src/components/ChartTooltip.tsx` | Measured tooltip placement | — | Deferred. The static renderer does not need a portal; a future client renderer can add it. |
| `src/components/ChartLegend.tsx` | Series legend | `legend` | Kept. |
| `src/components/ResponsiveChartFrame.tsx` | Measured chart width | SVG `viewBox` + responsive CSS | Reimplemented with a pure SVG width and CSS scaling. |
| `src/components/SeoControlRoom.tsx` | Bounded SEO score | Status + chart primitives | The SEO-specific score model is not extracted; it is a provider/product model, not a harness primitive. |
| `src/lib/export/to-csv.ts` | RFC 4180 CSV | `toCsv`, Looker field CSV | Ported with the same quoting rules. |
| `src/lib/design/aurora-charts.ts`, `src/app/globals.css` | Aurora tokens | `packs/aurora/pack.json` | Kept the dark palette, chart series colors and radii; fonts remain a host choice. |
| `src/components/DashboardStickyHeader.tsx`, `DashboardPageHeader.tsx`, `DashboardSection.tsx`, `GlassCard.tsx` | Dashboard shell | Renderer shell | Kept the sticky header, eyebrow/title/caption, cards and footer. |
| `src/lib/argus-access.ts`, NextAuth, `server-only`, Titan admin token, `metrics_daily` | Auth and private data | — | Deliberately not extracted. The harness has no credentials, access control or database. |

## Details that matter

1. **Null is not zero.** Argus already treated missing days as gaps in the chart
   and "Unavailable" in the value. The harness makes this a validated contract
   (`nullPolicy`) and an audit check, not a component convention.
2. **One status per source.** The dashboard header, KPI and status panel read the
   same snapshot status. A provider failure does not become a blank chart with a
   green border.
3. **Units are semantic.** `percent` is a fraction; a chart axis formats `0.25` as
   `25%`, a KPI shows `25.00%`, and the Looker field map uses `PERCENT`. The
   catalog is the only place that decides.
4. **Window is explicit.** A rolling 30-day count and a calendar month are
   different types. The metric and dashboard both declare their window; the audit
   compares them with the snapshot.
5. **Cumulative counters can reset.** The audit warns when a cumulative series
   steps down. It does not hide the step or silently rebase the chart.
6. **Freshness is a budget.** Argus's source health and "as of" language became
   `freshnessHours`, `status.computedAt` and a pass/warn/fail check.
7. **Coverage is visible.** Argus's labels describe what a source does not
   include. The snapshot carries `coverage`, and the audit warns when it is
   missing.
8. **Evidence travels with the dashboard.** The audit emits `argus.evidence/1`
   with the dashboard id, source, timestamp, every check and SHA-256 fingerprints
   of the catalog, dashboard and snapshot. A screenshot is not evidence.
9. **Product history is corrected, not hidden.** The preserved
   `metrics.valuations_total` history contains older mixed totals (a maximum of
   457,774), while `userValuations.valuations_total` restores the user-report
   series (118 → 148). The Argus reference uses `metricOverrides` to read the
   corrected series; the raw series remains in the archive with its documented
   caveat.

## Compatibility catalog

[`examples/argus-reference`](../examples/argus-reference) encodes the 35 standard
Argus keys with their units, aggregations, null policies, owners, targets and
source caveats. It is metadata only. The source fetches the public portfolio
snapshot at render time, and `metricOverrides` selects the corrected product
series. `doctor` validates the catalog offline; `render` and `audit` need network
access to the public snapshot.

## Deliberately out of scope

- The Titan API, its parsers, admin token and deployment topology.
- Upswitch account, revenue, customer and search rows.
- Authentication, authorization, rate limits and operator allowlists.
- In-process last-good caches, refresh jobs and provider backfills.
- The SEO score model, experiment readout model and role/cohort SQL.
- Looker Studio API writes, connector deployment and Google Cloud credentials.
- Pixel-perfect Argus replication. The pack keeps the visual language; the
  renderer is a reusable static surface, not a Next.js clone.

## Result

The harness now owns the parts that are portable and easy to get wrong: the
metric contract, calendar gaps, source status, series semantics, dashboard
contract, audit evidence, renderer and Looker bridge. Argus remains the reference
implementation and the source of the visual language.
