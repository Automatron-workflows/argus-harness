import { daysBetween, normalizeDay, parseDay } from "./calendar.mjs";
import { formatMetric } from "./format.mjs";
import { isMonotonic, missingDays, normalizeHistory, observedDays } from "./series.mjs";

function check(id, level, title, detail, metrics) {
  return { id, level, title, detail, ...(metrics ? { metrics } : {}) };
}

function requestedMetrics(dashboard) {
  const keys = new Set(dashboard.kpis.map((kpi) => kpi.metric));
  for (const section of dashboard.sections) {
    for (const panel of section.panels) {
      if (panel.kind === "chart") for (const series of panel.series) keys.add(series.metric);
      if (panel.kind === "status") keys.add(panel.metric);
    }
  }
  return [...keys];
}

function ageHours(asOf, now) {
  const time = Date.parse(asOf);
  if (!Number.isFinite(time)) return null;
  return (now.getTime() - time) / 3_600_000;
}

export function auditDashboard({ dashboard, catalog, source, snapshot, now = new Date() }) {
  const checks = [];
  const keys = requestedMetrics(dashboard);
  const maxDays = Math.max(1, ...keys.map((key) => observedDays(snapshot.metrics[key]?.history ?? [])));

  if (snapshot.source !== dashboard.source) {
    checks.push(
      check(
        "dashboard-source",
        "fail",
        "Dashboard source does not match the snapshot",
        `Dashboard "${dashboard.id}" reads "${dashboard.source}" but the snapshot came from "${snapshot.source}".`,
      ),
    );
  } else {
    checks.push(check("dashboard-source", "pass", "Source matches", `Both use "${dashboard.source}".`));
  }

  if (snapshot.window.days !== dashboard.window.days) {
    checks.push(
      check(
        "window",
        "warn",
        "Window differs from the dashboard contract",
        `Dashboard asks for ${dashboard.window.days} days; the snapshot window is ${snapshot.window.days} days.`,
      ),
    );
  } else {
    checks.push(check("window", "pass", "Window matches", `${snapshot.window.days} days.`));
  }

  const freshness = source?.freshnessHours ?? 26;
  const age = ageHours(snapshot.asOf, now);
  if (age === null) {
    checks.push(check("freshness", "fail", "Snapshot has no usable timestamp", `asOf is "${snapshot.asOf}".`));
  } else if (age > freshness * 2) {
    checks.push(
      check(
        "freshness",
        "fail",
        "Snapshot is more than twice the freshness budget",
        `asOf ${snapshot.asOf} is ${age.toFixed(1)} hours old; the source budget is ${freshness} hours.`,
      ),
    );
  } else if (age > freshness) {
    checks.push(
      check(
        "freshness",
        "warn",
        "Snapshot is older than the freshness budget",
        `asOf ${snapshot.asOf} is ${age.toFixed(1)} hours old; the source budget is ${freshness} hours.`,
      ),
    );
  } else {
    checks.push(check("freshness", "pass", "Snapshot is inside its freshness budget", `${age.toFixed(1)} hours old; budget ${freshness} hours.`));
  }

  const missing = [];
  const empty = [];
  for (const key of keys) {
    const metric = snapshot.metrics[key];
    if (!metric) missing.push(key);
    else if (!metric.history.length) empty.push(key);
  }
  if (missing.length || empty.length) {
    checks.push(
      check(
        "required-metrics",
        "fail",
        "A requested metric has no measured rows",
        [
          missing.length ? `Missing from the snapshot: ${missing.join(", ")}.` : "",
          empty.length ? `Present but empty: ${empty.join(", ")}.` : "",
        ].filter(Boolean).join(" "),
        [...missing, ...empty],
      ),
    );
  } else {
    checks.push(check("required-metrics", "pass", "Every requested metric has measured rows", `${keys.length} metrics.`));
  }

  const latestMismatch = [];
  const nullLatest = [];
  for (const key of keys) {
    const metric = snapshot.metrics[key];
    if (!metric) continue;
    const last = normalizeHistory(metric.history).at(-1);
    if (!last) continue;
    if (metric.value === null) nullLatest.push(key);
    else if (Number.isFinite(metric.value) && Math.abs(metric.value - last.value) > 1e-9) latestMismatch.push(key);
  }
  checks.push(
    check(
      "latest-value",
      latestMismatch.length ? "warn" : "pass",
      latestMismatch.length ? "Latest values differ from the final history point" : "Latest values match the final history point",
      latestMismatch.length
        ? `Review: ${latestMismatch.join(", ")}. The snapshot's value is authoritative, but the two must not diverge silently.`
        : `${keys.length} metrics checked.`,
      latestMismatch,
    ),
  );
  if (nullLatest.length) {
    checks.push(
      check("latest-null", "fail", "A requested metric has a null latest value", `Unavailable: ${nullLatest.join(", ")}.`, nullLatest),
    );
  }

  const gapSummary = [];
  let gapTotal = 0;
  for (const key of keys) {
    const missingCount = missingDays(snapshot.metrics[key]?.history ?? []);
    if (missingCount) {
      gapSummary.push(`${key}: ${missingCount}`);
      gapTotal += missingCount;
    }
  }
  checks.push(
    check(
      "gaps",
      gapTotal ? "warn" : "pass",
      gapTotal ? "Calendar gaps are explicit" : "Gaps are explicit",
      gapTotal
        ? `${gapTotal} calendar day${gapTotal === 1 ? "" : "s"} have no observation. They stay blank; the renderer does not fill them with zero.`
        : "No calendar gaps in the requested series.",
      gapTotal ? gapSummary : undefined,
    ),
  );

  const counterMismatch = [];
  for (const key of keys) {
    const metric = catalog.get(key);
    if (metric?.aggregation === "cumulative" && !isMonotonic(snapshot.metrics[key]?.history ?? [])) {
      counterMismatch.push(key);
    }
  }
  checks.push(
    check(
      "cumulative",
      counterMismatch.length ? "warn" : "pass",
      counterMismatch.length ? "A cumulative series decreases" : "Cumulative series are non-decreasing",
      counterMismatch.length
        ? `Review resets or corrections in: ${counterMismatch.join(", ")}. A cumulative counter should only step down after an explicit reset.`
        : "No cumulative series steps down.",
      counterMismatch,
    ),
  );

  const percentOut = [];
  for (const key of keys) {
    const metric = catalog.get(key);
    const value = snapshot.metrics[key]?.value;
    if (metric?.unit === "percent" && value !== null && Number.isFinite(value) && (value < 0 || value > 1)) {
      percentOut.push(`${key}=${formatMetric(value, "percent")}`);
    }
  }
  checks.push(
    check(
      "percent-bounds",
      percentOut.length ? "warn" : "pass",
      percentOut.length ? "A percent metric is outside 0–100%" : "Percent metrics are inside 0–100%",
      percentOut.length ? `Review the unit; the harness expects a fraction. ${percentOut.join(", ")}.` : "Fractions checked.",
    ),
  );

  const thinCharts = [];
  for (const section of dashboard.sections) {
    for (const panel of section.panels) {
      if (panel.kind !== "chart") continue;
      for (const series of panel.series) {
        const count = normalizeHistory(snapshot.metrics[series.metric]?.history ?? []).length;
        if (count < 2) thinCharts.push(`${panel.title ?? "chart"}: ${series.metric} (${count})`);
      }
    }
  }
  checks.push(
    check(
      "chart-points",
      thinCharts.length ? "warn" : "pass",
      thinCharts.length ? "A chart has fewer than two measured points" : "Charts have enough measured points",
      thinCharts.length ? thinCharts.join("; ") : "Every chart series has at least two observations.",
    ),
  );

  const duplicateSeries = [];
  for (const section of dashboard.sections) {
    for (const panel of section.panels) {
      if (panel.kind !== "chart") continue;
      const seen = new Set();
      for (const series of panel.series) {
        if (seen.has(series.metric)) duplicateSeries.push(`${panel.title ?? "chart"}: ${series.metric}`);
        seen.add(series.metric);
      }
    }
  }
  checks.push(
    check(
      "duplicate-series",
      duplicateSeries.length ? "warn" : "pass",
      duplicateSeries.length ? "A chart plots the same metric twice" : "No duplicate chart series",
      duplicateSeries.length ? duplicateSeries.join("; ") : "Checked every chart panel.",
    ),
  );

  checks.push(
    check(
      "status",
      ["live", "pass"].includes(snapshot.status.state)
        ? "pass"
        : snapshot.status.state === "partial" || snapshot.status.state === "stale"
          ? "warn"
          : "fail",
      `Source status: ${snapshot.status.label}`,
      [snapshot.status.detail, snapshot.status.coverage].filter(Boolean).join(" ") || `State: ${snapshot.status.state}.`,
    ),
  );

  checks.push(
    check(
      "coverage",
      snapshot.status.coverage ? "pass" : "warn",
      snapshot.status.coverage ? "Source coverage is declared" : "Source coverage is not declared",
      snapshot.status.coverage ?? "Add a coverage string to the source status so a reader can see what the snapshot does and does not include.",
    ),
  );

  const definitionGaps = keys.filter((key) => {
    const metric = catalog.get(key);
    return !metric || !metric.description || !metric.owner || !metric.nullPolicy;
  });
  checks.push(
    check(
      "definitions",
      definitionGaps.length ? "fail" : "pass",
      definitionGaps.length ? "A requested metric has an incomplete definition" : "Every requested metric is defined",
      definitionGaps.length ? `Add description, owner and null policy for: ${definitionGaps.join(", ")}.` : `${keys.length} definitions checked.`,
      definitionGaps,
    ),
  );

  if (maxDays > 3660) {
    checks.push(check("window-span", "warn", "The observed span is longer than the supported window", `${maxDays} days observed.`));
  } else {
    checks.push(check("window-span", "pass", "The observed span is inside the supported window", `${maxDays} days observed.`));
  }

  const future = [];
  const asOfDay = normalizeDay(snapshot.asOf);
  if (asOfDay) {
    for (const key of keys) {
      for (const point of snapshot.metrics[key]?.history ?? []) {
        if (point.date > asOfDay) future.push(`${key}@${point.date}`);
      }
    }
  }
  checks.push(
    check(
      "future-dates",
      future.length ? "warn" : "pass",
      future.length ? "A history point is after the snapshot timestamp" : "No history point is after the snapshot timestamp",
      future.length ? future.slice(0, 12).join(", ") : `asOf day ${asOfDay ?? "unknown"}.`,
    ),
  );

  const summary = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const item of checks) summary[item.level] += 1;
  return {
    schema: "argus.evidence/1",
    dashboard: dashboard.id,
    source: snapshot.source,
    capturedAt: now.toISOString(),
    checks,
    summary,
    pack: "aurora",
  };
}

export function evidenceExitCode(evidence, strict = false) {
  if (evidence.summary.fail > 0) return 1;
  if (strict && evidence.summary.warn > 0) return 1;
  return 0;
}
