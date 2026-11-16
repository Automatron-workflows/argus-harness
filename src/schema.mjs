import { isValidDay, normalizeDay } from "./calendar.mjs";
import { UNITS } from "./format.mjs";

export class HarnessError extends Error {
  constructor(message, path = "") {
    super(path ? `${path}: ${message}` : message);
    this.name = "HarnessError";
    this.path = path;
  }
}

const METRIC_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const SOURCE_ID = /^[a-z][a-z0-9-]{1,63}$/;
const DASHBOARD_ID = /^[a-z][a-z0-9-]{1,63}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const BIGQUERY_TABLE = /^[A-Za-z0-9_$.-]{1,1024}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const STATUS_STATES = ["live", "partial", "stale", "unavailable", "restricted", "critical"];
const DIRECTIONS = ["up", "down", "neutral"];
const AGGREGATIONS = ["latest", "sum", "cumulative", "rolling", "average"];
const NULL_POLICIES = ["gap", "unavailable"];
const ACCENTS = ["teal", "violet", "amber", "rose", "mint"];

function fail(message, path) {
  throw new HarnessError(message, path);
}

function object(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("expected an object", path);
  return value;
}

function string(value, path, { min = 1, max = 2000, pattern } = {}) {
  if (typeof value !== "string") fail("expected a string", path);
  if (value.length < min || value.length > max) fail(`expected ${min}–${max} characters`, path);
  if (pattern && !pattern.test(value)) fail("has an invalid format", path);
  return value;
}

function number(value, path, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("expected a finite number", path);
  if (integer && !Number.isInteger(value)) fail("expected an integer", path);
  if (value < min || value > max) fail(`expected a value between ${min} and ${max}`, path);
  return value;
}

function optionalString(value, path, options) {
  if (value === undefined || value === null) return undefined;
  return string(value, path, options);
}

function array(value, path, { min = 0, max = 100 } = {}) {
  if (!Array.isArray(value)) fail("expected an array", path);
  if (value.length < min || value.length > max) fail(`expected ${min}–${max} items`, path);
  return value;
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(`expected one of ${allowed.join(", ")}`, path);
  return value;
}

function day(value, path) {
  const normalized = normalizeDay(value);
  if (!normalized) fail("expected a real calendar day (YYYY-MM-DD)", path);
  return normalized;
}

function snapshotValue(value, path) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) fail("expected a finite number or null", path);
  return value;
}

function status(value, path) {
  const input = object(value, path);
  return Object.freeze({
    state: oneOf(input.state, STATUS_STATES, `${path}.state`),
    label: string(input.label, `${path}.label`, { max: 120 }),
    ...(optionalString(input.detail, `${path}.detail`, { max: 1000 })
      ? { detail: input.detail }
      : {}),
    ...(optionalString(input.computedAt, `${path}.computedAt`, { max: 80 })
      ? { computedAt: input.computedAt }
      : {}),
    ...(optionalString(input.coverage, `${path}.coverage`, { max: 500 })
      ? { coverage: input.coverage }
      : {}),
  });
}

function history(value, path) {
  const rows = [];
  for (const [index, raw] of array(value, path, { max: 5000 }).entries()) {
    const point = object(raw, `${path}[${index}]`);
    const date = day(point.date, `${path}[${index}].date`);
    const value = number(point.value, `${path}[${index}].value`);
    rows.push({ date, value });
  }
  const byDay = new Map(rows.map((row) => [row.date, row.value]));
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export function validateMetric(input, path = "metric") {
  const metric = object(input, path);
  if (metric.schema !== undefined && metric.schema !== "argus.metric/1") {
    fail("schema must be argus.metric/1", `${path}.schema`);
  }
  const unit = oneOf(metric.unit, UNITS, `${path}.unit`);
  const target = metric.target
    ? (() => {
        const raw = object(metric.target, `${path}.target`);
        const value = number(raw.value, `${path}.target.value`);
        const band = raw.band
          ? array(raw.band, `${path}.target.band`, { min: 2, max: 2 }).map((item, index) =>
              number(item, `${path}.target.band[${index}]`),
            )
          : undefined;
        if (band && band[0] > band[1]) fail("band must be ascending", `${path}.target.band`);
        return Object.freeze({
          value,
          ...(band ? { band } : {}),
          ...(optionalString(raw.label, `${path}.target.label`, { max: 80 })
            ? { label: raw.label }
            : {}),
        });
      })()
    : undefined;
  const window = metric.window
    ? (() => {
        const raw = object(metric.window, `${path}.window`);
        const kind = oneOf(raw.kind, ["trailing", "calendar"], `${path}.window.kind`);
        if (kind === "trailing") {
          return Object.freeze({
            kind,
            days: number(raw.days, `${path}.window.days`, { min: 1, max: 3660, integer: true }),
          });
        }
        const start = day(raw.start, `${path}.window.start`);
        const end = day(raw.end, `${path}.window.end`);
        if (start > end) fail("start must be on or before end", `${path}.window`);
        return Object.freeze({ kind, start, end });
      })()
    : undefined;
  const source = metric.source
    ? (() => {
        const raw = object(metric.source, `${path}.source`);
        return Object.freeze({
          ...(optionalString(raw.id, `${path}.source.id`, { max: 63, pattern: SOURCE_ID })
            ? { id: raw.id }
            : {}),
          ...(optionalString(raw.field, `${path}.source.field`, { max: 128 })
            ? { field: raw.field }
            : {}),
        });
      })()
    : undefined;
  const format = metric.format
    ? (() => {
        const raw = object(metric.format, `${path}.format`);
        return Object.freeze({
          ...(raw.decimals === undefined
            ? {}
            : { decimals: number(raw.decimals, `${path}.format.decimals`, { min: 0, max: 4, integer: true }) }),
        });
      })()
    : undefined;
  return Object.freeze({
    schema: "argus.metric/1",
    key: string(metric.key, `${path}.key`, { pattern: METRIC_KEY, max: 64 }),
    label: string(metric.label, `${path}.label`, { max: 80 }),
    description: string(metric.description, `${path}.description`, { max: 600 }),
    unit,
    direction: oneOf(metric.direction, DIRECTIONS, `${path}.direction`),
    aggregation: oneOf(metric.aggregation, AGGREGATIONS, `${path}.aggregation`),
    nullPolicy: oneOf(metric.nullPolicy, NULL_POLICIES, `${path}.nullPolicy`),
    owner: string(metric.owner, `${path}.owner`, { max: 80 }),
    version: number(metric.version, `${path}.version`, { min: 1, max: 9999, integer: true }),
    ...(target ? { target } : {}),
    ...(window ? { window } : {}),
    ...(source ? { source } : {}),
    ...(format ? { format } : {}),
    ...(optionalString(metric.notes, `${path}.notes`, { max: 1000 })
      ? { notes: metric.notes }
      : {}),
  });
}

export function validateSource(input, path = "source") {
  const source = object(input, path);
  if (source.schema !== undefined && source.schema !== "argus.source/1") {
    fail("schema must be argus.source/1", `${path}.schema`);
  }
  const kind = oneOf(source.kind, ["static-json", "http-json", "csv", "bigquery"], `${path}.kind`);
  const config = object(source.config, `${path}.config`);
  let normalizedConfig;
  if (kind === "static-json") {
    normalizedConfig = Object.freeze({ path: string(config.path, `${path}.config.path`, { max: 1000 }) });
  } else if (kind === "csv") {
    normalizedConfig = Object.freeze({
      path: string(config.path, `${path}.config.path`, { max: 1000 }),
      ...(config.delimiter === undefined
        ? {}
        : { delimiter: string(config.delimiter, `${path}.config.delimiter`, { min: 1, max: 1 }) }),
    });
  } else if (kind === "http-json") {
    const url = string(config.url, `${path}.config.url`, { max: 2000 });
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      fail("expected an http(s) URL", `${path}.config.url`);
    }
    if (!["http:", "https:"].includes(parsed.protocol)) fail("expected an http(s) URL", `${path}.config.url`);
    const headers = config.headers
      ? Object.fromEntries(
          Object.entries(object(config.headers, `${path}.config.headers`)).map(([name, value]) => [
            string(name, `${path}.config.headers.${name}`, { max: 80 }),
            string(value, `${path}.config.headers.${name}`, { max: 1000 }),
          ]),
        )
      : undefined;
    normalizedConfig = Object.freeze({
      url,
      ...(config.method === undefined
        ? { method: "GET" }
        : { method: oneOf(String(config.method).toUpperCase(), ["GET", "POST"], `${path}.config.method`) }),
      ...(headers ? { headers } : {}),
      ...(config.timeoutMs === undefined
        ? { timeoutMs: 15000 }
        : { timeoutMs: number(config.timeoutMs, `${path}.config.timeoutMs`, { min: 500, max: 120000, integer: true }) }),
      ...(config.body === undefined
        ? {}
        : { body: string(config.body, `${path}.config.body`, { max: 10000 }) }),
      ...(config.preset === undefined
        ? {}
        : { preset: oneOf(config.preset, ["argus-snapshot", "titan-bundle"], `${path}.config.preset`) }),
      ...(config.response
        ? {
            response: Object.freeze(
              Object.fromEntries(
                Object.entries(object(config.response, `${path}.config.response`)).map(([key, value]) => [
                  string(key, `${path}.config.response.${key}`, { max: 40 }),
                  string(value, `${path}.config.response.${key}`, { max: 200 }),
                ]),
              ),
            ),
          }
        : {}),
    });
  } else {
    const project = string(config.project, `${path}.config.project`, { max: 128, pattern: /^[A-Za-z0-9_.:-]+$/ });
    const dataset = string(config.dataset, `${path}.config.dataset`, { max: 128, pattern: IDENTIFIER });
    const table = string(config.table, `${path}.config.table`, { max: 128, pattern: BIGQUERY_TABLE });
    const column = (name, fallback) => {
      const value = config[name] ?? fallback;
      return string(value, `${path}.config.${name}`, { max: 128, pattern: IDENTIFIER });
    };
    normalizedConfig = Object.freeze({
      project,
      dataset,
      table,
      dateColumn: column("dateColumn", "metric_date"),
      metricColumn: column("metricColumn", "metric_key"),
      valueColumn: column("valueColumn", "value"),
      sourceColumn: column("sourceColumn", "source"),
      computedAtColumn: column("computedAtColumn", "computed_at"),
      ...(config.location === undefined
        ? {}
        : { location: string(config.location, `${path}.config.location`, { max: 40 }) }),
    });
  }
  return Object.freeze({
    schema: "argus.source/1",
    id: string(source.id, `${path}.id`, { pattern: SOURCE_ID, max: 64 }),
    label: string(source.label, `${path}.label`, { max: 80 }),
    description: string(source.description, `${path}.description`, { max: 600 }),
    kind,
    config: normalizedConfig,
    freshnessHours:
      source.freshnessHours === undefined
        ? 26
        : number(source.freshnessHours, `${path}.freshnessHours`, { min: 1, max: 8760 }),
    ...(optionalString(source.asOfField, `${path}.asOfField`, { max: 200 })
      ? { asOfField: source.asOfField }
      : {}),
    ...(optionalString(source.coverageField, `${path}.coverageField`, { max: 200 })
      ? { coverageField: source.coverageField }
      : {}),
  });
}

function validatePanel(input, path) {
  const panel = object(input, path);
  const kind = oneOf(panel.kind, ["chart", "bars", "rows", "table", "note", "status"], `${path}.kind`);
  const title = optionalString(panel.title, `${path}.title`, { max: 120 });
  const subtitle = optionalString(panel.subtitle, `${path}.subtitle`, { max: 300 });
  const note = optionalString(panel.note, `${path}.note`, { max: 1000 });
  if (kind === "chart") {
    const series = array(panel.series, `${path}.series`, { min: 1, max: 6 }).map((raw, index) => {
      const item = object(raw, `${path}.series[${index}]`);
      return Object.freeze({
        metric: string(item.metric, `${path}.series[${index}].metric`, { pattern: METRIC_KEY, max: 64 }),
        ...(optionalString(item.label, `${path}.series[${index}].label`, { max: 80 })
          ? { label: item.label }
          : {}),
        ...(item.color === undefined
          ? {}
          : { color: oneOf(item.color, ACCENTS, `${path}.series[${index}].color`) }),
      });
    });
    return Object.freeze({
      kind,
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      series,
      chartType: oneOf(panel.chartType ?? "area", ["area", "line"], `${path}.chartType`),
      height:
        panel.height === undefined
          ? 260
          : number(panel.height, `${path}.height`, { min: 140, max: 480, integer: true }),
      ...(note ? { note } : {}),
    });
  }
  if (kind === "bars") {
    const items = array(panel.items, `${path}.items`, { min: 1, max: 20 }).map((raw, index) => {
      const item = object(raw, `${path}.items[${index}]`);
      return Object.freeze({
        label: string(item.label, `${path}.items[${index}].label`, { max: 100 }),
        value: number(item.value, `${path}.items[${index}].value`),
        ...(item.total === undefined
          ? {}
          : { total: number(item.total, `${path}.items[${index}].total`, { min: 0 }) }),
        ...(item.color === undefined
          ? {}
          : { color: oneOf(item.color, ACCENTS, `${path}.items[${index}].color`) }),
      });
    });
    return Object.freeze({
      kind,
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      unit: panel.unit === undefined ? "count" : oneOf(panel.unit, UNITS, `${path}.unit`),
      items,
      ...(note ? { note } : {}),
    });
  }
  if (kind === "rows") {
    const items = array(panel.items, `${path}.items`, { min: 1, max: 30 }).map((raw, index) => {
      const item = object(raw, `${path}.items[${index}]`);
      return Object.freeze({
        label: string(item.label, `${path}.items[${index}].label`, { max: 120 }),
        value: string(item.value, `${path}.items[${index}].value`, { max: 200 }),
        ...(item.tone === undefined
          ? {}
          : { tone: oneOf(item.tone, ["default", "muted", "warning", "danger"], `${path}.items[${index}].tone`) }),
      });
    });
    return Object.freeze({
      kind,
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      items,
      ...(note ? { note } : {}),
    });
  }
  if (kind === "table") {
    const columns = array(panel.columns, `${path}.columns`, { min: 1, max: 8 }).map((raw, index) => {
      const item = object(raw, `${path}.columns[${index}]`);
      return Object.freeze({
        label: string(item.label, `${path}.columns[${index}].label`, { max: 80 }),
        key: string(item.key, `${path}.columns[${index}].key`, { max: 64 }),
        ...(item.align === undefined
          ? {}
          : { align: oneOf(item.align, ["left", "right"], `${path}.columns[${index}].align`) }),
      });
    });
    const rows = array(panel.rows, `${path}.rows`, { max: 200 }).map((raw, index) => {
      const row = object(raw, `${path}.rows[${index}]`);
      return Object.freeze(
        Object.fromEntries(
          columns.map((column) => [
            column.key,
            typeof row[column.key] === "number" ? row[column.key] : String(row[column.key] ?? ""),
          ]),
        ),
      );
    });
    return Object.freeze({
      kind,
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      columns,
      rows,
      ...(note ? { note } : {}),
    });
  }
  if (kind === "note") {
    return Object.freeze({ kind, text: string(panel.text, `${path}.text`, { max: 1200 }) });
  }
  return Object.freeze({
    kind: "status",
    metric: string(panel.metric, `${path}.metric`, { pattern: METRIC_KEY, max: 64 }),
    ...(title ? { title } : {}),
  });
}

export function validateDashboard(input, path = "dashboard") {
  const dashboard = object(input, path);
  if (dashboard.schema !== undefined && dashboard.schema !== "argus.dashboard/1") {
    fail("schema must be argus.dashboard/1", `${path}.schema`);
  }
  const kpis = array(dashboard.kpis ?? [], `${path}.kpis`, { max: 12 }).map((raw, index) => {
    const item = object(raw, `${path}.kpis[${index}]`);
    return Object.freeze({
      metric: string(item.metric, `${path}.kpis[${index}].metric`, { pattern: METRIC_KEY, max: 64 }),
      ...(optionalString(item.label, `${path}.kpis[${index}].label`, { max: 80 })
        ? { label: item.label }
        : {}),
      ...(optionalString(item.help, `${path}.kpis[${index}].help`, { max: 240 })
        ? { help: item.help }
        : {}),
      ...(item.accent === undefined
        ? {}
        : { accent: oneOf(item.accent, ACCENTS, `${path}.kpis[${index}].accent`) }),
    });
  });
  const seen = new Set();
  const sections = array(dashboard.sections, `${path}.sections`, { min: 1, max: 20 }).map((raw, index) => {
    const section = object(raw, `${path}.sections[${index}]`);
    const id = string(section.id, `${path}.sections[${index}].id`, { max: 64, pattern: DASHBOARD_ID });
    if (seen.has(id)) fail(`duplicate section id "${id}"`, `${path}.sections[${index}].id`);
    seen.add(id);
    return Object.freeze({
      id,
      eyebrow: optionalString(section.eyebrow, `${path}.sections[${index}].eyebrow`, { max: 40 }) ?? "",
      title: string(section.title, `${path}.sections[${index}].title`, { max: 120 }),
      ...(optionalString(section.caption, `${path}.sections[${index}].caption`, { max: 600 })
        ? { caption: section.caption }
        : {}),
      layout: oneOf(section.layout ?? "split", ["split", "equal", "full", "grid"], `${path}.sections[${index}].layout`),
      panels: array(section.panels, `${path}.sections[${index}].panels`, { min: 1, max: 12 }).map((panel, panelIndex) =>
        validatePanel(panel, `${path}.sections[${index}].panels[${panelIndex}]`),
      ),
    });
  });
  return Object.freeze({
    schema: "argus.dashboard/1",
    id: string(dashboard.id, `${path}.id`, { pattern: DASHBOARD_ID, max: 64 }),
    title: string(dashboard.title, `${path}.title`, { max: 120 }),
    description: string(dashboard.description, `${path}.description`, { max: 600 }),
    source: string(dashboard.source, `${path}.source`, { pattern: SOURCE_ID, max: 64 }),
    window: Object.freeze({
      days: number(dashboard.window?.days, `${path}.window.days`, { min: 1, max: 3660, integer: true }),
    }),
    kpis,
    sections,
    ...(optionalString(dashboard.note, `${path}.note`, { max: 1000 }) ? { note: dashboard.note } : {}),
  });
}

export function validateSnapshot(input, path = "snapshot") {
  const snapshot = object(input, path);
  if (snapshot.schema !== undefined && snapshot.schema !== "argus.snapshot/1") {
    fail("schema must be argus.snapshot/1", `${path}.schema`);
  }
  const window = object(snapshot.window, `${path}.window`);
  const start = day(window.start, `${path}.window.start`);
  const end = day(window.end, `${path}.window.end`);
  if (start > end) fail("window start must be on or before end", `${path}.window`);
  const metrics = {};
  for (const [key, raw] of Object.entries(object(snapshot.metrics, `${path}.metrics`))) {
    if (!METRIC_KEY.test(key)) fail("invalid metric key", `${path}.metrics.${key}`);
    const metric = object(raw, `${path}.metrics.${key}`);
    metrics[key] = Object.freeze({
      value: metric.value === undefined ? null : snapshotValue(metric.value, `${path}.metrics.${key}.value`),
      date: metric.date === undefined || metric.date === null ? null : day(metric.date, `${path}.metrics.${key}.date`),
      history: history(metric.history ?? [], `${path}.metrics.${key}.history`),
      ...(optionalString(metric.source, `${path}.metrics.${key}.source`, { max: 120 })
        ? { source: metric.source }
        : {}),
      ...(metric.status ? { status: status(metric.status, `${path}.metrics.${key}.status`) } : {}),
    });
  }
  return Object.freeze({
    schema: "argus.snapshot/1",
    source: string(snapshot.source, `${path}.source`, { pattern: SOURCE_ID, max: 64 }),
    asOf: string(snapshot.asOf, `${path}.asOf`, { max: 80 }),
    window: Object.freeze({ start, end, days: number(window.days, `${path}.window.days`, { min: 1, max: 3660, integer: true }) }),
    status: status(snapshot.status, `${path}.status`),
    metrics: Object.freeze(metrics),
    ...(optionalString(snapshot.generatedAt, `${path}.generatedAt`, { max: 80 })
      ? { generatedAt: snapshot.generatedAt }
      : {}),
  });
}

export function validateEvidence(input, path = "evidence") {
  const evidence = object(input, path);
  if (evidence.schema !== "argus.evidence/1") fail("schema must be argus.evidence/1", `${path}.schema`);
  const checks = array(evidence.checks, `${path}.checks`, { max: 200 }).map((raw, index) => {
    const check = object(raw, `${path}.checks[${index}]`);
    return Object.freeze({
      id: string(check.id, `${path}.checks[${index}].id`, { max: 80 }),
      level: oneOf(check.level, ["pass", "warn", "fail", "info"], `${path}.checks[${index}].level`),
      title: string(check.title, `${path}.checks[${index}].title`, { max: 160 }),
      detail: string(check.detail, `${path}.checks[${index}].detail`, { max: 1000 }),
      ...(Array.isArray(check.metrics) ? { metrics: check.metrics.map(String) } : {}),
    });
  });
  const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const check of checks) counts[check.level] += 1;
  return Object.freeze({
    schema: "argus.evidence/1",
    dashboard: string(evidence.dashboard, `${path}.dashboard`, { max: 64 }),
    source: string(evidence.source, `${path}.source`, { max: 64 }),
    capturedAt: string(evidence.capturedAt, `${path}.capturedAt`, { max: 80 }),
    checks: Object.freeze(checks),
    summary: Object.freeze(counts),
    ...(optionalString(evidence.pack, `${path}.pack`, { max: 80 }) ? { pack: evidence.pack } : {}),
  });
}

export function validateProject(input, path = "project") {
  const project = object(input, path);
  if (project.schema !== "argus.project/1") fail("schema must be argus.project/1", `${path}.schema`);
  const paths = (value, name) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length)) return value;
    fail(`${name} must be a path or an array of paths`, `${path}.${name}`);
  };
  return Object.freeze({
    schema: "argus.project/1",
    id: string(project.id, `${path}.id`, { pattern: DASHBOARD_ID, max: 64 }),
    name: string(project.name, `${path}.name`, { max: 120 }),
    pack: optionalString(project.pack, `${path}.pack`, { max: 200 }) ?? "aurora",
    metrics: paths(project.metrics ?? "metrics", "metrics"),
    sources: paths(project.sources ?? "sources", "sources"),
    dashboards: paths(project.dashboards ?? "dashboards", "dashboards"),
    defaultDashboard: optionalString(project.defaultDashboard, `${path}.defaultDashboard`, { max: 64 }),
  });
}

export function validatePack(input, path = "pack") {
  const pack = object(input, path);
  if (pack.schema !== "argus.pack/1") fail("schema must be argus.pack/1", `${path}.schema`);
  const tokens = object(pack.tokens, `${path}.tokens`);
  const normalized = {};
  for (const [name, value] of Object.entries(tokens)) {
    if (!/^[a-z][a-z0-9.-]{1,60}$/.test(name)) fail("invalid token name", `${path}.tokens.${name}`);
    if (typeof value !== "string" || !value.length) fail("token values must be non-empty strings", `${path}.tokens.${name}`);
    if (name.startsWith("color.") && !HEX.test(value) && !/^var\(--[a-z0-9-]+\)$/.test(value)) {
      fail("color tokens must be #rrggbb or a var() reference", `${path}.tokens.${name}`);
    }
    normalized[name] = value;
  }
  return Object.freeze({
    schema: "argus.pack/1",
    id: string(pack.id, `${path}.id`, { pattern: DASHBOARD_ID, max: 64 }),
    name: string(pack.name, `${path}.name`, { max: 120 }),
    version: string(pack.version, `${path}.version`, { max: 40 }),
    ...(optionalString(pack.description, `${path}.description`, { max: 600 }) ? { description: pack.description } : {}),
    tokens: Object.freeze(normalized),
  });
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function multiple(values) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  return duplicates;
}

export { ACCENTS, AGGREGATIONS, DIRECTIONS, METRIC_KEY, NULL_POLICIES, SOURCE_ID, STATUS_STATES, UNITS, isValidDay };
