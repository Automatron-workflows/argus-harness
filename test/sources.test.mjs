import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildBigQuerySql, BigQueryUnavailable } from "../src/bigquery.mjs";
import { loadProject } from "../src/project.mjs";
import { validateDashboard, validateMetric, validateSource } from "../src/schema.mjs";
import { loadSnapshot, parseCsv, snapshotFromRows } from "../src/sources.mjs";

const root = resolve("examples/starter");

function fixtureProject(overrides = {}) {
  return {
    root,
    metrics: new Map([
      ["mrr_eur", validateMetric({ schema: "argus.metric/1", key: "mrr_eur", label: "MRR", description: "Recurring revenue.", unit: "currency_eur", direction: "up", aggregation: "latest", nullPolicy: "gap", owner: "Finance", version: 1 })],
      ["active_accounts", validateMetric({ schema: "argus.metric/1", key: "active_accounts", label: "Active accounts", description: "Active accounts.", unit: "count", direction: "up", aggregation: "latest", nullPolicy: "gap", owner: "Product", version: 1 })],
    ]),
    sources: new Map(),
    dashboards: new Map(),
    ...overrides,
  };
}

test("CSV parsing handles quotes, commas and newlines", () => {
  const rows = parseCsv('metric_key,date,value,note\nmrr_eur,2026-11-15,100,"a, b"\nactive_accounts,2026-11-15,4,"line 1"\n');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ["mrr_eur", "2026-11-15", "100", "a, b"]);
});

test("rows become a snapshot with explicit gaps and no inferred zero", () => {
  const project = fixtureProject();
  const dashboard = validateDashboard({
    schema: "argus.dashboard/1",
    id: "growth",
    title: "Growth",
    description: "Test",
    source: "rows",
    window: { days: 30 },
    kpis: [{ metric: "mrr_eur" }],
    sections: [{ id: "one", title: "One", panels: [{ kind: "chart", series: [{ metric: "active_accounts" }] }] }],
  });
  const source = validateSource({ schema: "argus.source/1", id: "rows", label: "Rows", description: "Rows", kind: "static-json", config: { path: "rows.json" } });
  const snapshot = snapshotFromRows({
    rows: [
      { metric_key: "mrr_eur", metric_date: "2026-11-13", value: 100 },
      { metric_key: "mrr_eur", metric_date: "2026-11-15", value: 120 },
      { metric_key: "active_accounts", metric_date: "2026-11-15", value: 4 },
    ],
    source,
    dashboard,
    metrics: project.metrics,
    now: new Date("2026-11-15T12:00:00Z"),
  });
  assert.equal(snapshot.metrics.mrr_eur.value, 120);
  assert.deepEqual(snapshot.metrics.mrr_eur.history.map((point) => point.date), ["2026-11-13", "2026-11-15"]);
  assert.equal(snapshot.window.days, 30);
  assert.equal(snapshot.status.state, "live");
});

test("HTTP source maps a Titan-style bundle and an HTTP failure returns unavailable", async () => {
  const project = fixtureProject();
  const dashboard = validateDashboard({
    schema: "argus.dashboard/1",
    id: "growth",
    title: "Growth",
    description: "Test",
    source: "http",
    window: { days: 7 },
    kpis: [{ metric: "mrr_eur" }],
    sections: [{ id: "one", title: "One", panels: [{ kind: "chart", series: [{ metric: "active_accounts" }] }] }],
  });
  const source = validateSource({
    schema: "argus.source/1",
    id: "http",
    label: "HTTP",
    description: "HTTP",
    kind: "http-json",
    config: { url: "http://example.test/metrics", preset: "titan-bundle" },
  });
  project.sources.set("http", source);
  let seen = null;
  const server = createServer((request, response) => {
    if (request.url.startsWith("/ok")) {
      seen = request.url;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        metrics: {
          mrr_eur: { latest: { valueNumeric: 120, snapshotDate: "2026-11-15", computedAt: "2026-11-15T06:00:00Z" }, history: [{ date: "2026-11-14", value: 100 }, { date: "2026-11-15", value: 120 }] },
          active_accounts: { latest: { valueNumeric: 4, snapshotDate: "2026-11-15", computedAt: "2026-11-15T06:00:00Z" }, history: [{ date: "2026-11-15", value: 4 }] },
        },
      }));
      return;
    }
    response.statusCode = 503;
    response.end("unavailable");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const okSource = { ...source, config: { ...source.config, url: `http://127.0.0.1:${port}/ok?days={days}` } };
    project.sources.set("http", okSource);
    const snapshot = await loadSnapshot({ project, dashboard, sourceId: "http", fetchImpl: fetch });
    assert.equal(snapshot.metrics.mrr_eur.value, 120);
    assert.equal(snapshot.status.state, "live");
    assert.equal(seen, "/ok?days=7");

    const failedSource = { ...source, config: { ...source.config, url: `http://127.0.0.1:${port}/fail` } };
    project.sources.set("http", failedSource);
    const failed = await loadSnapshot({ project, dashboard, sourceId: "http", fetchImpl: fetch });
    assert.equal(failed.status.state, "unavailable");
    assert.match(failed.status.detail, /HTTP 503/);
    assert.equal(failed.metrics.mrr_eur.value, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("BigQuery SQL validates identifiers and builds a bounded window", () => {
  const source = validateSource({
    schema: "argus.source/1",
    id: "warehouse",
    label: "Warehouse",
    description: "BigQuery",
    kind: "bigquery",
    config: { project: "my-project", dataset: "analytics", table: "metric_daily" },
  });
  const sql = buildBigQuerySql(source, { start: "2026-09-17", end: "2026-11-15", days: 60 });
  assert.match(sql, /`my-project.analytics.metric_daily`/);
  assert.match(sql, /BETWEEN DATE '2026-09-17' AND DATE '2026-11-15'/);
  assert.match(sql, /metric_date/);
  assert.match(sql, /metric_key/);
  assert.throws(() => buildBigQuerySql(source, { start: "x", end: "y", days: 1 }), /YYYY-MM-DD/);
});

test("a static snapshot file loads through the project", async () => {
  const project = await loadProject(root);
  const dashboard = project.dashboards.get("growth");
  const snapshot = await loadSnapshot({ project, dashboard });
  assert.equal(snapshot.source, "starter-static");
  assert.equal(snapshot.metrics.search_impressions.history.length, 58);
  assert.equal(snapshot.metrics.reports_generated_30d.history.length, 56);
});
