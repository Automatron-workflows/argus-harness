import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { auditDashboard } from "../src/audit.mjs";
import { addDays, isValidDay, normalizeDay, trailingWindow } from "../src/calendar.mjs";
import { formatMetric } from "../src/format.mjs";
import { loadProject, dashboardMetrics } from "../src/project.mjs";
import { renderDashboard } from "../src/render.mjs";
import { validateDashboard, validateMetric, validateSnapshot, HarnessError } from "../src/schema.mjs";
import { growthRates, niceTicks, normalizeHistory, segments } from "../src/series.mjs";
import { loadSnapshot } from "../src/sources.mjs";

const root = resolve("examples/starter");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));

test("calendar days are real and missing days are not zero", () => {
  assert.equal(isValidDay("2026-02-30"), false);
  assert.equal(normalizeDay("2026-02-28T23:00:00Z"), "2026-02-28");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.deepEqual(trailingWindow("2026-03-03", 3), { start: "2026-03-01", end: "2026-03-03", days: 3 });
  assert.deepEqual(normalizeHistory([{ date: "2026-03-03", value: 2 }, { date: "2026-03-01", value: 1 }, { date: "2026-03-02", value: null }]), [
    { date: "2026-03-01", value: 1 },
    { date: "2026-03-03", value: 2 },
  ]);
});

test("metric contracts lock unit, aggregation, null policy and target", async () => {
  const metric = validateMetric(await read(resolve(root, "metrics/mrr_eur.json")));
  assert.equal(metric.unit, "currency_eur");
  assert.equal(metric.aggregation, "latest");
  assert.equal(metric.nullPolicy, "gap");
  assert.equal(metric.target.value, 25000);
  assert.throws(() => validateMetric({ ...metric, unit: "euro" }), HarnessError);
  assert.throws(() => validateMetric({ ...metric, key: "MRR" }), HarnessError);
});

test("the starter project loads all contracts and resolves dashboard metrics", async () => {
  const project = await loadProject(root);
  assert.equal(project.metrics.size, 10);
  assert.equal(project.sources.size, 1);
  assert.equal(project.dashboards.size, 1);
  assert.equal(project.defaultDashboard, "growth");
  assert.deepEqual(dashboardMetrics(project.dashboards.get("growth")).sort(), [
    "active_accounts",
    "click_through_rate",
    "mrr_eur",
    "new_accounts_30d",
    "reports_generated_total",
    "search_impressions",
    "trial_to_paid_rate_30d",
  ]);
});

test("series split at calendar gaps and keep measured values", () => {
  const points = normalizeHistory([
    { date: "2026-03-01", value: 1 },
    { date: "2026-03-02", value: 2 },
    { date: "2026-03-04", value: 4 },
  ]);
  assert.equal(segments(points).length, 2);
  assert.equal(segments(points)[0].length, 2);
  assert.equal(segments(points)[1][0].value, 4);
});

test("nice ticks and growth rates do not extrapolate", () => {
  assert.deepEqual(niceTicks(315, 4), [0, 100, 200, 300, 400]);
  const rates = growthRates(
    [
      { date: "2026-01-01", value: 100 },
      { date: "2026-02-01", value: 120 },
    ],
    "2026-02-01",
    [30, 90],
  );
  assert.equal(rates.t30d, 0.2);
  assert.equal(rates.t90d, null);
});

test("formatting keeps null unavailable and percent as a fraction", () => {
  assert.equal(formatMetric(null, "currency_eur"), "Unavailable");
  assert.equal(formatMetric(0.3438, "percent"), "34.38%");
  assert.equal(formatMetric(23604, "currency_eur"), "€23,604");
  assert.equal(formatMetric(3.4, "hours"), "3.4 hours");
});

test("the healthy starter dashboard passes the audit with only explicit gap warnings", async () => {
  const project = await loadProject(root);
  const dashboard = project.dashboards.get("growth");
  const snapshot = await loadSnapshot({ project, dashboard });
  const evidence = auditDashboard({
    dashboard,
    catalog: project.metrics,
    source: project.sources.get(dashboard.source),
    snapshot,
    now: new Date("2026-11-15T12:00:00.000Z"),
  });
  assert.equal(evidence.summary.fail, 0);
  assert.ok(evidence.summary.warn >= 1);
  assert.ok(evidence.checks.some((check) => check.id === "gaps" && check.level === "warn"));
  assert.equal(evidence.schema, "argus.evidence/1");
});

test("a stale or empty snapshot fails the audit", async () => {
  const project = await loadProject(root);
  const dashboard = project.dashboards.get("growth");
  const stale = validateSnapshot(await read("demo/data/snapshot-stale.json"));
  const staleEvidence = auditDashboard({
    dashboard,
    catalog: project.metrics,
    source: project.sources.get(dashboard.source),
    snapshot: stale,
    now: new Date("2026-11-15T12:00:00.000Z"),
  });
  assert.ok(staleEvidence.summary.fail >= 1);
  assert.ok(staleEvidence.checks.some((check) => check.id === "freshness" && check.level === "fail"));

  const empty = validateSnapshot(await read("demo/data/snapshot-empty.json"));
  const emptyEvidence = auditDashboard({
    dashboard,
    catalog: project.metrics,
    source: project.sources.get(dashboard.source),
    snapshot: empty,
    now: new Date("2026-11-15T12:00:00.000Z"),
  });
  assert.ok(emptyEvidence.summary.fail >= 2);
  assert.ok(emptyEvidence.checks.some((check) => check.id === "required-metrics" && check.level === "fail"));
  assert.ok(emptyEvidence.checks.some((check) => check.id === "status" && check.level === "fail"));
});

test("renderer shows measured values, a gap legend and an escaped title", async () => {
  const project = await loadProject(root);
  const dashboard = project.dashboards.get("growth");
  const snapshot = await loadSnapshot({ project, dashboard });
  const html = renderDashboard({
    dashboard,
    catalog: project.metrics,
    snapshot,
    pack: project.pack,
    projectName: "Harbour metrics",
  });
  assert.match(html, /data-ah-dashboard="growth"/);
  assert.match(html, /€23,704/);
  assert.match(html, /Missing observations are blank/);
  assert.match(html, /Explore chart values/);
  assert.match(html, /<svg/);
  const escaped = renderDashboard({
    dashboard: { ...dashboard, title: "<script>alert(1)</script>" },
    catalog: project.metrics,
    snapshot,
    pack: project.pack,
  });
  assert.doesNotMatch(escaped, /<script>alert/);
  assert.match(escaped, /&lt;script&gt;/);
});

test("renderer leaves an unavailable value unavailable", async () => {
  const project = await loadProject(root);
  const dashboard = project.dashboards.get("growth");
  const empty = validateSnapshot(await read("demo/data/snapshot-empty.json"));
  const html = renderDashboard({ dashboard, catalog: project.metrics, snapshot: empty, pack: project.pack });
  assert.match(html, /data-unavailable="true"/);
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /data-ah-dashboard="growth"[^>]*>0</);
});

test("lower-is-better deltas and percent bars keep their semantics", () => {
  const metric = validateMetric({
    schema: "argus.metric/1",
    key: "first_response_hours",
    label: "First response",
    description: "Lower is better.",
    unit: "hours",
    direction: "down",
    aggregation: "average",
    nullPolicy: "gap",
    owner: "Support",
    version: 1,
  });
  const dashboard = validateDashboard({
    schema: "argus.dashboard/1",
    id: "service",
    title: "Service",
    description: "Service metrics",
    source: "static",
    window: { days: 2 },
    kpis: [{ metric: "first_response_hours" }],
    sections: [
      {
        id: "mix",
        title: "Mix",
        panels: [{ kind: "bars", title: "Coverage", unit: "percent", items: [{ label: "Answered", value: 0.33, total: 1 }] }],
      },
    ],
  });
  const snapshot = validateSnapshot({
    schema: "argus.snapshot/1",
    source: "static",
    asOf: "2026-11-15T06:00:00Z",
    window: { start: "2026-11-14", end: "2026-11-15", days: 2 },
    status: { state: "live", label: "Live" },
    metrics: {
      first_response_hours: { value: 2, date: "2026-11-15", history: [{ date: "2026-11-14", value: 1 }, { date: "2026-11-15", value: 2 }] },
    },
  });
  const html = renderDashboard({ dashboard, catalog: new Map([[metric.key, metric]]), snapshot, pack: undefined });
  assert.match(html, /data-tone="bad"/);
  assert.match(html, /33\.00%/);
});
