import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeDay, trailingWindow } from "./calendar.mjs";
import { BigQueryUnavailable, runBigQuery } from "./bigquery.mjs";
import { inside, readJson } from "./project.mjs";
import { normalizeHistory } from "./series.mjs";
import { validateSnapshot } from "./schema.mjs";

const STATUS = {
  live: "Live snapshot",
  partial: "Partial snapshot",
  stale: "Stale snapshot",
  unavailable: "Unavailable",
  restricted: "Restricted",
  critical: "Critical",
};

function nowIso(now) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function emptyMetric() {
  return { value: null, date: null, history: [] };
}

function dataStatus(state, label, detail, coverage, computedAt) {
  return {
    state,
    label: label ?? STATUS[state] ?? state,
    ...(detail ? { detail } : {}),
    ...(coverage ? { coverage } : {}),
    ...(computedAt ? { computedAt } : {}),
  };
}

export function emptySnapshot({ source, dashboard, metrics, status, now = new Date() }) {
  const asOf = nowIso(now);
  const window = trailingWindow(asOf.slice(0, 10), dashboard.window.days);
  return validateSnapshot({
    schema: "argus.snapshot/1",
    source: source.id,
    asOf,
    window,
    status: status ?? dataStatus("unavailable", "Source unavailable", "No rows were returned. Missing values are not zero."),
    metrics: Object.fromEntries([...metrics.keys()].map((key) => [key, emptyMetric()])),
  });
}

function getPath(value, path) {
  if (!path) return value;
  let current = value;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsFrom(value, source) {
  if (!Array.isArray(value)) throw new Error("Expected an array of metric rows");
  return value.map((raw) => {
    const row = raw ?? {};
    return {
      metric_key: String(row.metric_key ?? row.metricKey ?? row.key ?? "").trim(),
      metric_date: normalizeDay(row.metric_date ?? row.metricDate ?? row.date ?? ""),
      value: numeric(row.value),
      source: row.source === undefined || row.source === null ? undefined : String(row.source),
      computed_at: row.computed_at ?? row.computedAt ?? undefined,
    };
  });
}

export function snapshotFromRows({ rows, source, dashboard, metrics, now = new Date(), status }) {
  const grouped = new Map();
  let latestComputedAt = 0;
  let minDate = null;
  let maxDate = null;
  for (const row of rows) {
    if (!row.metric_key || !row.metric_date) continue;
    if (!metrics.has(row.metric_key) && !dashboard) continue;
    if (!grouped.has(row.metric_key)) grouped.set(row.metric_key, []);
    if (row.value !== null) grouped.get(row.metric_key).push({ date: row.metric_date, value: row.value });
    const computed = Date.parse(row.computed_at ?? "");
    if (Number.isFinite(computed)) latestComputedAt = Math.max(latestComputedAt, computed);
    if (!minDate || row.metric_date < minDate) minDate = row.metric_date;
    if (!maxDate || row.metric_date > maxDate) maxDate = row.metric_date;
  }
  const end = maxDate ?? nowIso(now).slice(0, 10);
  const window = trailingWindow(end, dashboard.window.days);
  const metricMap = {};
  let present = 0;
  for (const [key, rowsForMetric] of grouped.entries()) {
    const history = normalizeHistory(rowsForMetric);
    const last = history.at(-1);
    const lastRow = rows.filter((row) => row.metric_key === key && row.value !== null).at(-1);
    metricMap[key] = {
      value: last?.value ?? null,
      date: last?.date ?? null,
      history,
      ...(lastRow?.source ? { source: lastRow.source } : {}),
    };
    if (last) present += 1;
  }
  const keys = dashboard ? new Set(dashboardMetricsFor(dashboard)) : new Set([...grouped.keys()]);
  for (const key of keys) {
    if (!metricMap[key]) metricMap[key] = emptyMetric();
  }
  const requested = keys;
  const missing = [...requested].filter((key) => !metricMap[key]?.history.length);
  const state = present === 0 ? "unavailable" : missing.length ? "partial" : "live";
  const resolvedStatus =
    status ??
    dataStatus(
      state,
      state === "live" ? "Live snapshot" : state === "partial" ? "Partial snapshot" : "Unavailable",
      state === "partial" ? `No measured rows for ${missing.length} requested metric${missing.length === 1 ? "" : "s"}.` : undefined,
      `${present} metric${present === 1 ? "" : "s"} · ${rows.length} row${rows.length === 1 ? "" : "s"}`,
      latestComputedAt ? new Date(latestComputedAt).toISOString() : undefined,
    );
  return validateSnapshot({
    schema: "argus.snapshot/1",
    source: source.id,
    asOf: latestComputedAt ? new Date(latestComputedAt).toISOString() : `${end}T00:00:00.000Z`,
    window: minDate
      ? { start: minDate < window.start ? window.start : minDate, end, days: dashboard.window.days }
      : window,
    status: resolvedStatus,
    metrics: metricMap,
  });
}

function dashboardMetricsFor(dashboard) {
  const keys = new Set(dashboard.kpis.map((kpi) => kpi.metric));
  for (const section of dashboard.sections) {
    for (const panel of section.panels) {
      if (panel.kind === "chart") for (const series of panel.series) keys.add(series.metric);
      if (panel.kind === "status") keys.add(panel.metric);
    }
  }
  return [...keys];
}

function snapshotFromTitanBundle({ json, source, dashboard, metrics, now }) {
  const bundle = getPath(json, source.config.response?.metricsPath ?? "metrics") ?? json.metrics ?? json;
  const rows = [];
  let latestComputedAt = 0;
  for (const [key, raw] of Object.entries(bundle ?? {})) {
    if (raw === null || typeof raw !== "object") continue;
    const latest = raw.latest ?? {};
    const value = numeric(latest.valueNumeric ?? latest.value ?? raw.value);
    const date = normalizeDay(latest.snapshotDate ?? latest.date ?? raw.date ?? "");
    const computed = Date.parse(latest.computedAt ?? latest.computed_at ?? "");
    if (Number.isFinite(computed)) latestComputedAt = Math.max(latestComputedAt, computed);
    if (value !== null && date) rows.push({ metric_key: key, metric_date: date, value, source: latest.source, computed_at: latest.computedAt });
    for (const point of Array.isArray(raw.history) ? raw.history : []) {
      const day = normalizeDay(point.date);
      const pointValue = numeric(point.value);
      if (day && pointValue !== null) rows.push({ metric_key: key, metric_date: day, value: pointValue, source: latest.source });
    }
  }
  const snapshot = snapshotFromRows({ rows, source, dashboard, metrics, now });
  return latestComputedAt
    ? validateSnapshot({ ...snapshot, asOf: new Date(latestComputedAt).toISOString(), status: { ...snapshot.status, computedAt: new Date(latestComputedAt).toISOString() } })
    : snapshot;
}

function snapshotFromGeneric({ json, source, dashboard, metrics, now }) {
  if (json?.schema === "argus.snapshot/1") return validateSnapshot(json);
  if (Array.isArray(json)) return snapshotFromRows({ rows: rowsFrom(json, source), source, dashboard, metrics, now });
  if (Array.isArray(json?.rows)) return snapshotFromRows({ rows: rowsFrom(json.rows, source), source, dashboard, metrics, now });
  if (json?.metrics && typeof json.metrics === "object") {
    const rows = [];
    let latestComputedAt = 0;
    for (const [key, raw] of Object.entries(json.metrics)) {
      if (raw === null || typeof raw !== "object") continue;
      const value = numeric(raw.value ?? raw.latest?.valueNumeric ?? raw.latest?.value);
      const date = normalizeDay(raw.date ?? raw.latest?.snapshotDate ?? raw.latest?.date ?? "");
      const computed = Date.parse(raw.latest?.computedAt ?? raw.computedAt ?? "");
      if (Number.isFinite(computed)) latestComputedAt = Math.max(latestComputedAt, computed);
      if (value !== null && date) rows.push({ metric_key: key, metric_date: date, value, source: raw.source });
      for (const point of Array.isArray(raw.history) ? raw.history : []) {
        const day = normalizeDay(point.date);
        const pointValue = numeric(point.value);
        if (day && pointValue !== null) rows.push({ metric_key: key, metric_date: day, value: pointValue, source: raw.source });
      }
    }
    const snapshot = snapshotFromRows({ rows, source, dashboard, metrics, now });
    return latestComputedAt
      ? validateSnapshot({ ...snapshot, asOf: new Date(latestComputedAt).toISOString(), status: { ...snapshot.status, computedAt: new Date(latestComputedAt).toISOString() } })
      : snapshot;
  }
  if (source.config.response?.metricsPath) {
    const mapped = [];
    const bundle = getPath(json, source.config.response.metricsPath) ?? {};
    for (const [key, raw] of Object.entries(bundle)) {
      if (raw === null || typeof raw !== "object") continue;
      const value = numeric(getPath(raw, source.config.response.valuePath ?? "value"));
      const date = normalizeDay(getPath(raw, source.config.response.datePath ?? "date") ?? "");
      if (value !== null && date) mapped.push({ metric_key: key, metric_date: date, value, source: source.id });
      const history = Array.isArray(getPath(raw, source.config.response.historyPath ?? "history"))
        ? getPath(raw, source.config.response.historyPath ?? "history")
        : [];
      for (const point of history) {
        const day = normalizeDay(point.date);
        const pointValue = numeric(point.value);
        if (day && pointValue !== null) mapped.push({ metric_key: key, metric_date: day, value: pointValue, source: source.id });
      }
    }
    return snapshotFromRows({ rows: mapped, source, dashboard, metrics, now });
  }
  throw new Error("The source response did not match a supported snapshot or row shape");
}

function resolveHeaders(headers, env) {
  if (!headers) return {};
  const resolved = {};
  for (const [name, value] of Object.entries(headers)) {
    const match = /\$\{([A-Z0-9_]+)\}/.exec(value);
    if (match) {
      const replacement = env[match[1]];
      if (!replacement) throw new Error(`Missing environment variable ${match[1]} for header ${name}`);
      resolved[name] = value.replaceAll(match[0], replacement);
    } else {
      resolved[name] = value;
    }
  }
  return resolved;
}

async function fetchJson({ source, env, fetchImpl, timeoutMs, window }) {
  if (typeof fetchImpl !== "function") throw new Error("No fetch implementation is available");
  const url = source.config.url
    .replaceAll("{days}", String(window.days))
    .replaceAll("{start}", window.start)
    .replaceAll("{end}", window.end);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Source request timed out")), timeoutMs ?? source.config.timeoutMs ?? 15000);
  try {
    const response = await fetchImpl(url, {
      method: source.config.method ?? "GET",
      headers: resolveHeaders(source.config.headers, env),
      ...(source.config.method === "POST" && source.config.body ? { body: source.config.body } : {}),
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.length)) rows.push(row);
  }
  return rows;
}

export async function loadSnapshot({
  project,
  dashboard,
  sourceId,
  snapshotFile,
  now = new Date(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  bqBin,
}) {
  const source = project.sources.get(sourceId ?? dashboard.source);
  if (!source) throw new Error(`Unknown source "${sourceId ?? dashboard.source}"`);
  if (snapshotFile) {
    const json = await readJson(resolve(project.root, snapshotFile), snapshotFile);
    return snapshotFromGeneric({ json, source, dashboard, metrics: project.metrics, now });
  }
  if (source.kind === "static-json" || source.kind === "csv") {
    const file = resolve(project.root, source.config.path);
    if (!inside(project.root, file)) throw new Error(`Source path escapes the project: ${source.config.path}`);
    if (source.kind === "static-json") {
      return snapshotFromGeneric({ json: await readJson(file, source.config.path), source, dashboard, metrics: project.metrics, now });
    }
    const text = await readFile(file, "utf8");
    const table = parseCsv(text, source.config.delimiter ?? ",");
    if (table.length < 2) {
      return snapshotFromRows({ rows: [], source, dashboard, metrics: project.metrics, now });
    }
    const header = table[0].map((name) => name.trim());
    const rows = table.slice(1).map((cells) =>
      Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])),
    );
    return snapshotFromRows({ rows: rowsFrom(rows, source), source, dashboard, metrics: project.metrics, now });
  }
  if (source.kind === "http-json") {
    try {
      const window = trailingWindow(nowIso(now).slice(0, 10), dashboard.window.days);
      const json = await fetchJson({ source, env, fetchImpl, window });
      if (source.config.preset === "titan-bundle") {
        return snapshotFromTitanBundle({ json, source, dashboard, metrics: project.metrics, now });
      }
      return snapshotFromGeneric({ json, source, dashboard, metrics: project.metrics, now });
    } catch (error) {
      return emptySnapshot({
        source,
        dashboard,
        metrics: project.metrics,
        now,
        status: dataStatus("unavailable", "Source request failed", String(error.message ?? error).slice(0, 900)),
      });
    }
  }
  if (source.kind === "bigquery") {
    try {
      const rows = await runBigQuery({ source, window: trailingWindow(nowIso(now).slice(0, 10), dashboard.window.days), bqBin });
      return snapshotFromRows({ rows: rowsFrom(rows, source), source, dashboard, metrics: project.metrics, now });
    } catch (error) {
      return emptySnapshot({
        source,
        dashboard,
        metrics: project.metrics,
        now,
        status: dataStatus("unavailable", error.name === BigQueryUnavailable.name ? "BigQuery unavailable" : "BigQuery query failed", String(error.message ?? error).slice(0, 900)),
      });
    }
  }
  throw new Error(`Unsupported source kind "${source.kind}"`);
}

export { dataStatus, getPath, parseCsv, snapshotFromGeneric };
