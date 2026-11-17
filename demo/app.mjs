import { auditDashboard } from "../src/audit.mjs";
import { formatMetric } from "../src/format.mjs";
import { bigQueryDdl, lookerFields, lookerFieldsCsv } from "../src/looker.mjs";
import { renderCss, renderDashboard, escape } from "../src/render.mjs";
import { validateDashboard, validateMetric, validatePack, validateSnapshot } from "../src/schema.mjs";

const state = {
  dashboard: null,
  catalog: new Map(),
  pack: null,
  snapshots: new Map(),
  snapshot: null,
  evidence: null,
  auditNow: new Date("2026-11-15T12:00:00.000Z"),
};
const SOURCE = { id: "starter-static", freshnessHours: 36 };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function sourceCard(title, kicker, description, snippet) {
  return `<article class="demo-card"><p class="demo-eyebrow">${escape(kicker)}</p><h3>${escape(title)}</h3><p>${escape(description)}</p><pre class="demo-code">${escape(snippet)}</pre></article>`;
}

function renderSources() {
  const cards = [
    sourceCard(
      "Static JSON",
      "Preserved snapshot",
      "A checked-in snapshot. Good for a historical read-only dashboard or an evidence capture.",
      '{\n  "kind": "static-json",\n  "config": { "path": "data/snapshot.json" }\n}',
    ),
    sourceCard(
      "HTTP JSON",
      "Product API",
      "Fetch a JSON endpoint with a timeout and environment-backed headers. No credentials in the project.",
      '{\n  "kind": "http-json",\n  "config": {\n    "url": "https://api.example.com/metrics?days={days}",\n    "preset": "titan-bundle",\n    "headers": { "authorization": "Bearer ${METRICS_TOKEN}" }\n  }\n}',
    ),
    sourceCard(
      "CSV",
      "Export",
      "Point at an exported table with metric_key, date and value columns. Missing rows stay gaps.",
      'metric_key,date,value,source,computed_at\nmrr_eur,2026-11-15,23704,billing,2026-11-15T06:00:00Z\nactive_accounts,2026-11-15,315,product,2026-11-15T06:00:00Z',
    ),
    sourceCard(
      "BigQuery",
      "GCP warehouse",
      "Query a long-format metric table through the bq CLI. The same rows can feed Looker Studio views.",
      '{\n  "kind": "bigquery",\n  "config": {\n    "project": "my-project",\n    "dataset": "analytics",\n    "table": "metric_daily"\n  }\n}',
    ),
    sourceCard(
      "SQL warehouse",
      "Snowflake · Redshift · Athena · DuckDB",
      "Run an installed warehouse CLI. The same dashboard contract works across providers with --source.",
      '{\n  "kind": "sql-cli",\n  "config": {\n    "preset": "snowflake",\n    "sql": "SELECT metric_key, metric_date, value, source, computed_at FROM analytics.metric_daily WHERE metric_date BETWEEN DATE \'{{start}}\' AND DATE \'{{end}}\'",\n    "format": "csv"\n  }\n}',
    ),
  ];
  $("#source-grid").innerHTML = cards.join("");
}

function renderContract() {
  const rows = [...state.catalog.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((metric) => {
      const target = metric.target
        ? metric.target.label ?? formatMetric(metric.target.value, metric.unit, metric.format)
        : "—";
      return `<tr><td><code>${escape(metric.key)}</code></td><td>${escape(metric.label)}</td><td>${escape(metric.unit)}</td><td>${escape(metric.aggregation)}</td><td>${escape(metric.nullPolicy)}</td><td>${escape(target)}</td><td>${escape(metric.owner)}</td></tr>`;
    })
    .join("");
  $("#metric-table").innerHTML = `<thead><tr><th scope="col">Key</th><th scope="col">Label</th><th scope="col">Unit</th><th scope="col">Aggregation</th><th scope="col">Null policy</th><th scope="col">Target</th><th scope="col">Owner</th></tr></thead><tbody>${rows}</tbody>`;
  $("#dashboard-json").textContent = JSON.stringify(state.dashboard, null, 2);
}

function renderLooker() {
  $("#bigquery-sql").textContent = bigQueryDdl(state.catalog);
  const fields = lookerFields(state.catalog);
  $("#looker-table").innerHTML = `<thead><tr><th scope="col">Field</th><th scope="col">Label</th><th scope="col">Type</th><th scope="col">Default aggregation</th></tr></thead><tbody>${fields
    .map((field) => `<tr><td><code>${escape(field.name)}</code></td><td>${escape(field.label)}</td><td>${escape(field.semanticType)}</td><td>${escape(field.aggregation)}</td></tr>`)
    .join("")}</tbody>`;
}

function renderAudit() {
  const evidence = state.evidence;
  $("#audit-summary").innerHTML = ["pass", "warn", "fail"]
    .map((level) => `<span class="demo-audit-count" data-level="${level}">${evidence.summary[level]} ${level}</span>`)
    .join("") + `<span class="demo-audit-count">Audit time · 15 Nov 2026 · 12:00 UTC</span>` + `<span class="demo-audit-count">Catalog ${escape(evidence.contract?.metricCatalog?.slice(0, 12) ?? "—")}</span>`;
  $("#audit-checks").innerHTML = evidence.checks
    .map((check) => `<article class="demo-check" data-level="${escape(check.level)}"><span class="demo-check-level">${escape(check.level)}</span><div><h3>${escape(check.title)}</h3><p>${escape(check.detail)}</p></div></article>`)
    .join("");
}

function renderStage() {
  $("#dashboard-stage").innerHTML = renderDashboard({
    dashboard: state.dashboard,
    catalog: state.catalog,
    snapshot: state.snapshot,
    pack: state.pack,
    projectName: "Harbour metrics · fictional",
    includeStyles: false,
  });
  state.evidence = auditDashboard({
    dashboard: state.dashboard,
    catalog: state.catalog,
    source: SOURCE,
    snapshot: state.snapshot,
    now: state.auditNow,
  });
  renderAudit();
}

function setState(name) {
  $$(".demo-state-button").forEach((button) => {
    const active = button.dataset.state === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  state.snapshot = state.snapshots.get(name);
  renderStage();
}

function setTab(id) {
  $$(".demo-tab").forEach((tab) => {
    const selected = tab.id === `tab-${id}`;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $$(".demo-panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${id}`;
  });
  $(`#tab-${id}`)?.focus({ preventScroll: true });
}

function download(name, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function main() {
  const [metricsRaw, dashboardRaw, packRaw, healthy, stale, empty] = await Promise.all([
    json("./data/metrics.json"),
    json("./data/dashboard.json"),
    json("../packs/aurora/pack.json"),
    json("./data/snapshot-healthy.json"),
    json("./data/snapshot-stale.json"),
    json("./data/snapshot-empty.json"),
  ]);
  state.dashboard = validateDashboard(dashboardRaw);
  state.pack = validatePack(packRaw);
  state.catalog = new Map(metricsRaw.map((metric) => [metric.key, validateMetric(metric)]));
  state.snapshots.set("healthy", validateSnapshot(healthy));
  state.snapshots.set("stale", validateSnapshot(stale));
  state.snapshots.set("empty", validateSnapshot(empty));
  state.snapshot = state.snapshots.get("healthy");

  const style = document.createElement("style");
  style.textContent = renderCss(state.pack);
  document.head.append(style);

  renderContract();
  renderSources();
  renderLooker();
  renderStage();

  $$(".demo-state-button").forEach((button) => button.addEventListener("click", () => setState(button.dataset.state)));
  $$(".demo-tab").forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.id.replace("tab-", "")));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$(".demo-tab");
      const index = tabs.indexOf(tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tabs[next].id.replace("tab-", ""));
    });
  });
  $("#download-sql").addEventListener("click", () => download("bigquery.sql", bigQueryDdl(state.catalog), "text/sql"));
  $("#download-fields").addEventListener("click", () => download("looker-fields.csv", lookerFieldsCsv(state.catalog), "text/csv"));
  $("#download-evidence").addEventListener("click", () => download("evidence.json", JSON.stringify(state.evidence, null, 2), "application/json"));
  $("#copy-init").addEventListener("click", async () => {
    const command = "git clone https://github.com/Automatron-workflows/argus-harness.git\nnode argus-harness/bin/argus-harness.mjs init ./my-warehouse --template warehouse";
    try {
      await navigator.clipboard.writeText(command);
      $("#copy-init").textContent = "Copied";
      setTimeout(() => { $("#copy-init").textContent = "Copy setup command"; }, 1600);
    } catch {
      $("#copy-init").textContent = "Select the command below";
    }
  });
}

main().catch((error) => {
  $("#dashboard-stage").innerHTML = `<p class="demo-callout">The demo could not load: ${escape(error.message)}</p>`;
  console.error(error);
});
