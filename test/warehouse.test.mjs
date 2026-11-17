import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildBigQuerySql } from "../src/bigquery.mjs";
import { loadProject } from "../src/project.mjs";
import { parseRows, runSqlCli, SqlCliUnavailable } from "../src/sql-cli.mjs";
import { validateDashboard, validateMetric, validateSource, HarnessError } from "../src/schema.mjs";
import { loadSnapshot } from "../src/sources.mjs";

const warehouseRoot = resolve("examples/warehouse-starter");

test("the warehouse starter loads every provider source", async () => {
  const project = await loadProject(warehouseRoot);
  assert.equal(project.metrics.size, 10);
  assert.equal(project.sources.size, 7);
  assert.equal(project.dashboards.size, 1);
  assert.equal(project.sources.get("bigquery").kind, "bigquery");
  for (const id of ["snowflake", "postgres", "redshift", "duckdb", "athena", "custom-local"]) {
    assert.equal(project.sources.get(id).kind, "sql-cli");
  }
  assert.equal(project.sources.get("snowflake").config.preset, "snowflake");
  assert.equal(project.sources.get("athena").config.preset, "athena");
});

test("custom SQL sources require a command and a single SELECT", () => {
  assert.throws(
    () => validateSource({ schema: "argus.source/1", id: "x", label: "X", description: "X", kind: "sql-cli", config: { preset: "custom", sql: "SELECT 1" } }),
    HarnessError,
  );
  assert.throws(
    () => validateSource({ schema: "argus.source/1", id: "x", label: "X", description: "X", kind: "sql-cli", config: { preset: "custom", command: "x", sql: "DELETE FROM metric_daily" } }),
    HarnessError,
  );
  assert.throws(
    () => validateSource({ schema: "argus.source/1", id: "x", label: "X", description: "X", kind: "sql-cli", config: { preset: "custom", command: "x", sql: "SELECT 1; SELECT 2" } }),
    HarnessError,
  );
});

test("BigQuery accepts a custom projection and substitutes the window", () => {
  const source = validateSource({
    schema: "argus.source/1",
    id: "bq",
    label: "BigQuery",
    description: "BigQuery",
    kind: "bigquery",
    config: { project: "my-project", sql: "SELECT * FROM `my-project.analytics.daily` WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'" },
  });
  const sql = buildBigQuerySql(source, { start: "2026-11-01", end: "2026-11-15", days: 15 });
  assert.match(sql, /DATE '2026-11-01'/);
  assert.match(sql, /DATE '2026-11-15'/);
});

test("CSV and JSON rows normalize to the canonical shape", () => {
  const csv = parseRows("metric_key,metric_date,value,source,computed_at\nmrr_eur,2026-11-15,120,billing,2026-11-15T06:00:00Z\n", "csv");
  assert.deepEqual(csv[0], { metric_key: "mrr_eur", metric_date: "2026-11-15", value: "120", source: "billing", computed_at: "2026-11-15T06:00:00Z" });
  const json = parseRows('[{"metric_key":"mrr_eur","metric_date":"2026-11-15","value":120}]', "json");
  assert.equal(json[0].metric_key, "mrr_eur");
});

test("a custom CLI source runs and becomes a snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "argus-warehouse-"));
  const script = join(dir, "query.mjs");
  await writeFile(
    script,
    `process.stdout.write("metric_key,metric_date,value,source,computed_at\\nmrr_eur,2026-11-14,100,test,2026-11-15T06:00:00Z\\nmrr_eur,2026-11-15,120,test,2026-11-15T06:00:00Z\\nactive_accounts,2026-11-15,4,test,2026-11-15T06:00:00Z\\n");`,
  );
  const source = validateSource({
    schema: "argus.source/1",
    id: "fake",
    label: "Fake warehouse",
    description: "A local CSV command",
    kind: "sql-cli",
    config: {
      preset: "custom",
      command: process.execPath,
      args: [script],
      format: "csv",
      sql: "SELECT * FROM metric_daily WHERE metric_date BETWEEN '{{start}}' AND '{{end}}'",
    },
  });
  const rows = await runSqlCli({ source, window: { start: "2026-11-01", end: "2026-11-15", days: 15 } });
  assert.equal(rows.length, 3);
  assert.equal(rows[1].value, "120");

  const metric = validateMetric({ schema: "argus.metric/1", key: "mrr_eur", label: "MRR", description: "Revenue", unit: "currency_eur", direction: "up", aggregation: "latest", nullPolicy: "gap", owner: "Finance", version: 1 });
  const active = validateMetric({ schema: "argus.metric/1", key: "active_accounts", label: "Active", description: "Active", unit: "count", direction: "up", aggregation: "latest", nullPolicy: "gap", owner: "Product", version: 1 });
  const dashboard = validateDashboard({
    schema: "argus.dashboard/1",
    id: "fake",
    title: "Fake",
    description: "Fake",
    source: "fake",
    window: { days: 15 },
    kpis: [{ metric: "mrr_eur" }],
    sections: [{ id: "one", title: "One", panels: [{ kind: "chart", series: [{ metric: "active_accounts" }] }] }],
  });
  const project = { root: dir, metrics: new Map([[metric.key, metric], [active.key, active]]), sources: new Map([["fake", source]]) };
  const snapshot = await loadSnapshot({ project, dashboard, now: new Date("2026-11-15T12:00:00Z") });
  assert.equal(snapshot.source, "fake");
  assert.equal(snapshot.metrics.mrr_eur.value, 120);
  assert.equal(snapshot.metrics.mrr_eur.history.length, 2);
  assert.equal(snapshot.status.state, "live");
  await rm(dir, { recursive: true, force: true });
});

test("a missing warehouse command returns an unavailable snapshot", async () => {
  const source = validateSource({
    schema: "argus.source/1",
    id: "missing",
    label: "Missing",
    description: "Missing",
    kind: "sql-cli",
    config: { preset: "custom", command: "definitely-not-a-real-command-xyz", sql: "SELECT 1" },
  });
  const metric = validateMetric({ schema: "argus.metric/1", key: "mrr_eur", label: "MRR", description: "Revenue", unit: "currency_eur", direction: "up", aggregation: "latest", nullPolicy: "gap", owner: "Finance", version: 1 });
  const dashboard = validateDashboard({
    schema: "argus.dashboard/1",
    id: "missing",
    title: "Missing",
    description: "Missing",
    source: "missing",
    window: { days: 15 },
    kpis: [{ metric: "mrr_eur" }],
    sections: [{ id: "one", title: "One", panels: [{ kind: "chart", series: [{ metric: "mrr_eur" }] }] }],
  });
  const project = { root: process.cwd(), metrics: new Map([[metric.key, metric]]), sources: new Map([["missing", source]]) };
  const snapshot = await loadSnapshot({ project, dashboard });
  assert.equal(snapshot.status.state, "unavailable");
  assert.match(snapshot.status.detail, /not installed/);
  assert.equal(snapshot.metrics.mrr_eur.value, null);
});

test("Athena runs, polls and parses the AWS result shape", async () => {
  const dir = await mkdtemp(join(tmpdir(), "argus-athena-"));
  const fake = join(dir, "aws");
  await writeFile(
    fake,
    `#!/bin/sh
case "$1 $2" in
  "athena start-query-execution") echo '{"QueryExecutionId":"q1"}' ;;
  "athena get-query-execution") echo '{"QueryExecution":{"Status":{"State":"SUCCEEDED"}}}' ;;
  "athena get-query-results") echo '{"ResultSet":{"Rows":[{"Data":[{"VarCharValue":"metric_key"},{"VarCharValue":"metric_date"},{"VarCharValue":"value"},{"VarCharValue":"source"},{"VarCharValue":"computed_at"}]},{"Data":[{"VarCharValue":"mrr_eur"},{"VarCharValue":"2026-11-15"},{"VarCharValue":"120"},{"VarCharValue":"test"},{"VarCharValue":"2026-11-15T06:00:00Z"}]}]}}' ;;
esac
`,
  );
  await (await import("node:fs/promises")).chmod(fake, 0o755);
  const source = validateSource({
    schema: "argus.source/1",
    id: "athena-fake",
    label: "Athena",
    description: "Athena",
    kind: "sql-cli",
    config: {
      preset: "athena",
      region: "eu-west-1",
      database: "analytics",
      outputLocation: "s3://example/results/",
      sql: "SELECT * FROM metric_daily WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'",
      env: ["AWS_PROFILE"],
    },
  });
  const rows = await runSqlCli({
    source,
    window: { start: "2026-11-01", end: "2026-11-15", days: 15 },
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metric_key, "mrr_eur");
  assert.equal(rows[0].value, "120");
  await rm(dir, { recursive: true, force: true });
});
