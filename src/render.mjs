import { formatAsOf, formatCompact, formatDayLabel, formatMetric, formatWindow } from "./format.mjs";
import { compareToPrevious, niceTicks, normalizeHistory, segments, selectDateTicks, summarize } from "./series.mjs";
import { dateMs } from "./series.mjs";

const DEFAULT_TOKENS = {
  "color.background": "#0d1014",
  "color.surface": "#14181e",
  "color.surface2": "#1a1f27",
  "color.text": "#eef2f3",
  "color.muted": "#9ba6b2",
  "color.border": "#28313a",
  "color.primary": "#35b7a9",
  "color.teal": "#5ed3c6",
  "color.violet": "#a58be0",
  "color.amber": "#d9a13f",
  "color.rose": "#d76d6d",
  "color.mint": "#6fc58c",
  "color.warning": "#d9a13f",
  "color.danger": "#d76d6d",
  "space.radius": "16px",
  "space.gap": "16px",
  "font.sans": "Satoshi, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  "font.mono": "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
};

const ACCENT_TOKEN = {
  teal: "color.teal",
  violet: "color.violet",
  amber: "color.amber",
  rose: "color.rose",
  mint: "color.mint",
};

function tokens(pack) {
  return { ...DEFAULT_TOKENS, ...(pack?.tokens ?? {}) };
}

function cssVariables(pack) {
  const map = tokens(pack);
  return Object.entries(map)
    .map(([name, value]) => `--ah-${name.replace(/\./g, "-")}: ${value};`)
    .join("\n  ");
}

export function renderCss(pack) {
  return `:root {
  ${cssVariables(pack)}
}
.ah, .ah * { box-sizing: border-box; }
.ah {
  min-height: 100vh;
  color: var(--ah-color-text);
  background:
    radial-gradient(860px 480px at 6% -12%, color-mix(in srgb, var(--ah-color-primary) 18%, transparent), transparent 60%),
    radial-gradient(620px 420px at 100% 0%, color-mix(in srgb, var(--ah-color-violet) 10%, transparent), transparent 55%),
    var(--ah-color-background);
  font-family: var(--ah-font-sans);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.ah a { color: inherit; }
.ah-shell { width: 100%; max-width: 1400px; margin: 0 auto; padding: 0 24px; }
.ah-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; border-bottom: 1px solid var(--ah-color-border); }
.ah-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
.ah-mark { width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--ah-color-primary) 30%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--ah-color-primary) 10%, transparent); color: var(--ah-color-primary); }
.ah-mark svg { width: 17px; height: 17px; }
.ah-brand strong { display: block; font-size: 14px; font-weight: 600; line-height: 1.2; }
.ah-brand small { display: block; font-size: 12px; color: var(--ah-color-muted); line-height: 1.3; }
.ah-chip { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 12px; border: 1px solid var(--ah-color-border); border-radius: 10px; color: var(--ah-color-muted); font-size: 12px; white-space: nowrap; }
.ah-chip svg { width: 13px; height: 13px; color: var(--ah-color-primary); }
.ah-main { padding: 32px 0 12px; }
.ah-eyebrow { margin: 0 0 6px; font-family: var(--ah-font-mono); font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: color-mix(in srgb, var(--ah-color-muted) 76%, transparent); }
.ah h1 { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 600; letter-spacing: -.02em; }
.ah-lede { margin: 8px 0 0; max-width: 780px; font-size: 14px; line-height: 1.6; color: var(--ah-color-muted); }
.ah-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.ah-pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ah-color-border); border-radius: 999px; padding: 5px 10px; font-family: var(--ah-font-mono); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--ah-color-muted); }
.ah-pill[data-state="live"] { color: var(--ah-color-primary); border-color: color-mix(in srgb, var(--ah-color-primary) 35%, transparent); }
.ah-pill[data-state="warn"], .ah-pill[data-state="stale"], .ah-pill[data-state="partial"] { color: var(--ah-color-warning); border-color: color-mix(in srgb, var(--ah-color-warning) 35%, transparent); }
.ah-pill[data-state="fail"], .ah-pill[data-state="unavailable"], .ah-pill[data-state="critical"] { color: var(--ah-color-danger); border-color: color-mix(in srgb, var(--ah-color-danger) 35%, transparent); }
.ah-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ah-space-gap); margin-top: 24px; }
.ah-kpi { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 20px; border: 1px solid color-mix(in srgb, var(--ah-color-text) 8%, transparent); border-radius: var(--ah-space-radius); background: color-mix(in srgb, var(--ah-color-surface) 82%, transparent); }
.ah-kpi-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; color: var(--ah-color-muted); }
.ah-kpi-value { margin: 0; font-size: 30px; font-weight: 600; line-height: 1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.ah-kpi-value[data-unavailable="true"] { color: var(--ah-color-muted); font-size: 22px; }
.ah-kpi-delta { font-family: var(--ah-font-mono); font-size: 11px; color: var(--ah-color-muted); }
.ah-kpi-delta[data-tone="good"] { color: var(--ah-color-mint); }
.ah-kpi-delta[data-tone="bad"] { color: var(--ah-color-rose); }
.ah-kpi-spark { display: block; width: 100%; height: 38px; margin: 1px 0; }
.ah-kpi-help { margin: 0; font-size: 12px; line-height: 1.45; color: var(--ah-color-muted); }
.ah-kpi-target { margin: 0; font-family: var(--ah-font-mono); font-size: 10px; letter-spacing: .04em; color: color-mix(in srgb, var(--ah-color-muted) 80%, transparent); }
.ah-section { margin-top: 40px; }
.ah-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid color-mix(in srgb, var(--ah-color-text) 7%, transparent); padding-bottom: 14px; margin-bottom: 18px; }
.ah-section-head h2 { margin: 0; font-size: 21px; font-weight: 600; letter-spacing: -.01em; }
.ah-section-head p { margin: 5px 0 0; max-width: 760px; font-size: 14px; line-height: 1.55; color: var(--ah-color-muted); }
.ah-grid { display: grid; grid-template-columns: 1.55fr 1fr; gap: var(--ah-space-gap); }
.ah-grid[data-layout="equal"] { grid-template-columns: 1fr 1fr; }
.ah-grid[data-layout="full"] { grid-template-columns: 1fr; }
.ah-grid[data-layout="grid"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ah-panel { min-width: 0; padding: 24px; border: 1px solid color-mix(in srgb, var(--ah-color-text) 8%, transparent); border-radius: var(--ah-space-radius); background: color-mix(in srgb, var(--ah-color-surface) 82%, transparent); }
.ah-panel h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
.ah-panel-sub { margin: 0 0 14px; font-size: 12px; line-height: 1.5; color: var(--ah-color-muted); }
.ah-legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 10px 0 14px; font-size: 12px; color: var(--ah-color-muted); }
.ah-legend span { display: inline-flex; align-items: center; gap: 7px; }
.ah-swatch { display: inline-block; width: 15px; height: 3px; border-radius: 2px; }
.ah-chart { display: block; width: 100%; height: auto; overflow: visible; }
.ah-chart text { font-family: var(--ah-font-sans); fill: var(--ah-color-muted); font-size: 11.5px; }
.ah-chart .ah-axis { stroke: color-mix(in srgb, var(--ah-color-text) 8%, transparent); stroke-dasharray: 3 5; }
.ah-chart .ah-line { fill: none; stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
.ah-chart .ah-dot { stroke: var(--ah-color-background); stroke-width: 1.5; }
.ah-values { margin-top: 14px; border-top: 1px solid color-mix(in srgb, var(--ah-color-text) 7%, transparent); padding-top: 10px; }
.ah-values summary { cursor: pointer; list-style: none; font-size: 12px; color: var(--ah-color-muted); }
.ah-values summary::-webkit-details-marker { display: none; }
.ah-values summary::before { content: '▸'; display: inline-block; margin-right: 7px; color: var(--ah-color-primary); transition: transform .15s; }
.ah-values[open] summary::before { transform: rotate(90deg); }
.ah-table-scroll { max-height: 260px; overflow: auto; margin-top: 10px; border: 1px solid var(--ah-color-border); border-radius: 10px; }
.ah-table-scroll table { min-width: 420px; }
.ah-table-scroll th { position: sticky; top: 0; z-index: 1; background: var(--ah-color-surface); }
.ah-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ah-table th { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--ah-color-border); color: color-mix(in srgb, var(--ah-color-muted) 78%, transparent); font-family: var(--ah-font-mono); font-size: 10px; font-weight: 400; letter-spacing: .12em; text-transform: uppercase; }
.ah-table td { padding: 10px 8px; border-bottom: 1px solid color-mix(in srgb, var(--ah-color-border) 65%, transparent); }
.ah-table tbody tr:last-child td { border-bottom: 0; }
.ah-table td[data-align="right"], .ah-table th[data-align="right"] { text-align: right; font-variant-numeric: tabular-nums; }
.ah-rows { display: grid; gap: 0; }
.ah-row { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--ah-color-border) 65%, transparent); font-size: 14px; }
.ah-row:last-child { border-bottom: 0; }
.ah-row b { font-weight: 500; font-size: 16px; text-align: right; font-variant-numeric: tabular-nums; }
.ah-row[data-tone="muted"] span, .ah-row[data-tone="muted"] b { color: var(--ah-color-muted); }
.ah-row[data-tone="warning"] b { color: var(--ah-color-warning); }
.ah-row[data-tone="danger"] b { color: var(--ah-color-danger); }
.ah-bars { display: grid; gap: 0; }
.ah-bar-label { display: flex; justify-content: space-between; gap: 16px; margin: 16px 0 7px; font-size: 13px; }
.ah-meter { height: 7px; border-radius: 4px; background: color-mix(in srgb, var(--ah-color-text) 7%, transparent); overflow: hidden; }
.ah-meter span { display: block; height: 100%; border-radius: 4px; background: var(--ah-color-teal); }
.ah-fine { margin: 14px 0 0; font-size: 12px; line-height: 1.6; color: var(--ah-color-muted); }
.ah-note { margin: 18px 0 0; padding: 13px 17px; border: 1px solid color-mix(in srgb, var(--ah-color-warning) 35%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--ah-color-warning) 8%, transparent); color: color-mix(in srgb, var(--ah-color-warning) 80%, white); font-size: 13px; line-height: 1.6; }
.ah-status { margin-top: 12px; font-size: 12px; color: var(--ah-color-muted); }
.ah-status[data-state="live"] { color: var(--ah-color-primary); }
.ah-status[data-state="partial"], .ah-status[data-state="stale"] { color: var(--ah-color-warning); }
.ah-status[data-state="unavailable"], .ah-status[data-state="critical"], .ah-status[data-state="restricted"] { color: var(--ah-color-danger); }
.ah-footer { margin-top: 48px; padding: 20px 0 32px; border-top: 1px solid var(--ah-color-border); display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; font-family: var(--ah-font-mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: color-mix(in srgb, var(--ah-color-muted) 80%, transparent); }
.ah-footer strong { color: var(--ah-color-primary); font-weight: 400; }
.ah-empty { padding: 28px; border: 1px dashed color-mix(in srgb, var(--ah-color-text) 18%, transparent); border-radius: var(--ah-space-radius); color: var(--ah-color-muted); font-size: 14px; }
.ah-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 1100px) {
  .ah-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ah-grid, .ah-grid[data-layout="equal"], .ah-grid[data-layout="grid"] { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .ah-shell { padding: 0 16px; }
  .ah-kpis { grid-template-columns: 1fr; }
  .ah h1 { font-size: 25px; }
  .ah-panel { padding: 18px; }
  .ah-chip { display: none; }
  .ah-section { margin-top: 32px; }
}
@media print {
  .ah { background: #fff; color: #111; }
  .ah-chip, .ah-values { display: none; }
  .ah-panel, .ah-kpi { background: #fff; border-color: #ccc; }
  .ah, .ah h1, .ah .ah-kpi-value, .ah .ah-panel h3 { color: #111; }
}
`;
}

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function accent(pack, name = "teal") {
  return `var(--ah-${ACCENT_TOKEN[name]?.replace(/\./g, "-") ?? "color-teal"})`;
}

function sparkline(history, pack, color, index) {
  const points = normalizeHistory(history);
  if (!points.length) return `<span class="ah-kpi-spark" aria-hidden="true"></span>`;
  const width = 240;
  const height = 38;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.1;
  const x = (date) => 2 + ((dateMs(date) - dateMs(points[0].date)) / Math.max(1, dateMs(points.at(-1).date) - dateMs(points[0].date))) * (width - 4);
  const y = (value) => height - 3 - ((value - min + pad) / (max - min + pad * 2)) * (height - 6);
  let paths = "";
  for (const segment of segments(points)) {
    if (segment.length === 1) {
      paths += `<circle cx="${x(segment[0].date).toFixed(2)}" cy="${y(segment[0].value).toFixed(2)}" r="2" fill="${color}"/>`;
      continue;
    }
    const line = segment.map((point, i) => `${i ? "L" : "M"}${x(point.date).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
    paths += `<path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    const area = `M${x(segment[0].date).toFixed(2)},${height} ${segment.map((point) => `L${x(point.date).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ")} L${x(segment.at(-1).date).toFixed(2)},${height} Z`;
    paths += `<path d="${area}" fill="url(#ah-spark-${index})" stroke="none"/>`;
  }
  return `<svg class="ah-kpi-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Measured trend; missing dates are blank"><title>Measured trend</title><defs><linearGradient id="ah-spark-${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".22"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${paths}</svg>`;
}

function delta(history, metric) {
  const change = compareToPrevious(history);
  if (!change) return "";
  if (change.pct === null) return `<span class="ah-kpi-delta">No comparable previous update</span>`;
  const flat = Math.abs(change.pct) < 0.0005;
  const direction = flat ? "flat" : change.pct > 0 ? "up" : "down";
  const good = metric.direction === "down" ? direction === "down" : metric.direction === "up" ? direction === "up" : null;
  const tone = flat || good === null ? "flat" : good ? "good" : "bad";
  const percent = formatMetric(change.pct, "percent", { decimals: 1 });
  const text = flat ? "unchanged vs previous update" : `${change.pct > 0 ? "+" : ""}${percent} vs previous update`;
  return `<span class="ah-kpi-delta" data-direction="${direction}" data-tone="${tone}">${text}</span>`;
}

function kpiCard({ kpi, metric, data, snapshot, pack, index }) {
  const color = accent(pack, kpi.accent ?? (index % 2 ? "violet" : "teal"));
  const value = data?.value ?? null;
  const formatted = formatMetric(value, metric.unit, metric.format);
  const target = metric.target
    ? `<p class="ah-kpi-target">${escape(metric.target.label ?? `Target ${formatMetric(metric.target.value, metric.unit, metric.format)}`)}</p>`
    : "";
  const status =
    data?.status && data.status.state !== "live"
      ? `<span class="ah-pill" data-state="${escape(data.status.state)}">${escape(data.status.label)}</span>`
      : "";
  return `<article class="ah-kpi" data-metric="${escape(metric.key)}" data-null-policy="${escape(metric.nullPolicy)}">
  <div class="ah-kpi-label"><span>${escape(kpi.label ?? metric.label)}</span>${status}</div>
  <p class="ah-kpi-value" data-unavailable="${value === null}">${escape(formatted)}</p>
  ${sparkline(data?.history ?? [], pack, color, index)}
  ${delta(data?.history ?? [], metric)}
  <p class="ah-kpi-help">${escape(kpi.help ?? metric.description)}</p>
  ${target}
</article>`;
}

function chartPanel({ panel, catalog, data, pack, panelIndex }) {
  const series = panel.series.map((item, index) => {
    const metric = catalog.get(item.metric);
    return {
      ...item,
      metric,
      label: item.label ?? metric?.label ?? item.metric,
      color: accent(pack, item.color ?? (index % 2 ? "violet" : "teal")),
      history: normalizeHistory(data.metrics[item.metric]?.history ?? []),
    };
  });
  const allPoints = series.flatMap((item) => item.history);
  if (!allPoints.length) {
    return `<section class="ah-panel" data-panel="chart"><h3>${escape(panel.title ?? "Chart")}</h3>${panel.subtitle ? `<p class="ah-panel-sub">${escape(panel.subtitle)}</p>` : ""}<div class="ah-empty">No measured rows for this chart. Missing values are unavailable, not zero.</div></section>`;
  }
  const width = 720;
  const height = panel.height;
  const left = 58;
  const right = 18;
  const top = 14;
  const bottom = 34;
  const innerWidth = width - left - right;
  const minDate = Math.min(...allPoints.map((point) => dateMs(point.date)));
  const maxDate = Math.max(...allPoints.map((point) => dateMs(point.date)));
  const maxValue = Math.max(1, ...allPoints.map((point) => point.value));
  const ticks = niceTicks(maxValue * 1.06, 4);
  const topValue = ticks.at(-1) || 1;
  const x = (day) => left + ((dateMs(day) - minDate) / Math.max(1, maxDate - minDate)) * innerWidth;
  const y = (value) => height - bottom - (value / topValue) * (height - top - bottom);
  const base = height - bottom;
  const dateTicks = selectDateTicks(
    [...new Set(allPoints.map((point) => point.date))].sort().map((day) => new Date(`${day}T00:00:00.000Z`)),
    (date) => left + ((date.getTime() - minDate) / Math.max(1, maxDate - minDate)) * innerWidth,
    innerWidth,
  );
  const gradientId = `ah-chart-${panelIndex}`;
  let svg = `<svg class="ah-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(panel.title ?? "Metric history")}"><title>${escape(panel.title ?? "Metric history")}</title><desc>Measured calendar-day observations. Missing dates are blank; no values are inferred between captures.</desc><defs>${series.map((item, index) => `<linearGradient id="${gradientId}-${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${item.color}" stop-opacity=".18"/><stop offset="100%" stop-color="${item.color}" stop-opacity="0"/></linearGradient>`).join("")}</defs>`;
  for (const tick of ticks) {
    svg += `<line class="ah-axis" x1="${left}" y1="${y(tick).toFixed(2)}" x2="${width - right}" y2="${y(tick).toFixed(2)}"/><text x="${left - 10}" y="${(y(tick) + 4).toFixed(2)}" text-anchor="end">${escape(formatCompact(tick, series[0].metric?.unit ?? "count"))}</text>`;
  }
  for (const [index, item] of series.entries()) {
    const pathParts = [];
    const areaParts = [];
    for (const segment of segments(item.history)) {
      if (segment.length === 1) {
        svg += `<circle class="ah-dot" cx="${x(segment[0].date).toFixed(2)}" cy="${y(segment[0].value).toFixed(2)}" r="3" fill="${item.color}"/>`;
        continue;
      }
      const line = segment.map((point, i) => `${i ? "L" : "M"}${x(point.date).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
      pathParts.push(line);
      if (series.length === 1) {
        areaParts.push(`M${x(segment[0].date).toFixed(2)},${base} ${segment.map((point) => `L${x(point.date).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ")} L${x(segment.at(-1).date).toFixed(2)},${base} Z`);
      }
    }
    if (series.length === 1) {
      for (const area of areaParts) svg += `<path d="${area}" fill="url(#${gradientId}-${index})" stroke="none"/>`;
    }
    for (const path of pathParts) {
      svg += `<path class="ah-line" d="${path}" stroke="${item.color}" data-series="${escape(item.metric.key)}"/>`;
    }
    const last = item.history.at(-1);
    if (last) svg += `<circle class="ah-dot" cx="${x(last.date).toFixed(2)}" cy="${y(last.value).toFixed(2)}" r="3.4" fill="${item.color}"/>`;
  }
  for (const date of dateTicks) {
    const day = date.toISOString().slice(0, 10);
    svg += `<text x="${x(day).toFixed(2)}" y="${height - 9}" text-anchor="middle">${escape(formatDayLabel(day))}</text>`;
  }
  svg += "</svg>";
  const dates = [...new Set(allPoints.map((point) => point.date))].sort();
  const table = `<details class="ah-values"><summary>Explore chart values</summary><div class="ah-table-scroll"><table class="ah-table"><caption class="ah-sr">Measured chart history</caption><thead><tr><th scope="col">Date</th>${series.map((item) => `<th scope="col" data-align="right">${escape(item.label)}</th>`).join("")}</tr></thead><tbody>${dates.map((day) => `<tr><th scope="row">${escape(day)}</th>${series.map((item) => { const point = item.history.find((row) => row.date === day); return `<td data-align="right">${point ? escape(formatMetric(point.value, item.metric?.unit ?? "count", item.metric?.format)) : "—"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div></details>`;
  return `<section class="ah-panel" data-panel="chart">${panel.title ? `<h3>${escape(panel.title)}</h3>` : ""}${panel.subtitle ? `<p class="ah-panel-sub">${escape(panel.subtitle)}</p>` : ""}<div class="ah-legend">${series.map((item) => `<span><i class="ah-swatch" style="background:${item.color}"></i>${escape(item.label)}</span>`).join("")}</div>${svg}${table}${panel.note ? `<p class="ah-fine">${escape(panel.note)}</p>` : ""}<p class="ah-fine">Missing observations are blank. No values are inferred between captures.</p></section>`;
}

function barsPanel({ panel, pack }) {
  const max = Math.max(1, ...panel.items.map((item) => item.total ?? item.value));
  return `<section class="ah-panel" data-panel="bars">${panel.title ? `<h3>${escape(panel.title)}</h3>` : ""}${panel.subtitle ? `<p class="ah-panel-sub">${escape(panel.subtitle)}</p>` : ""}<div class="ah-bars">${panel.items.map((item) => {
    const width = item.total ? (item.value / item.total) * 100 : (item.value / max) * 100;
    return `<div class="ah-bar-label"><span>${escape(item.label)}</span><span>${escape(formatMetric(item.value, panel.unit))}${item.total ? ` / ${escape(formatMetric(item.total, panel.unit))}` : ""}</span></div><div class="ah-meter"><span style="width:${Math.max(0, Math.min(100, width)).toFixed(2)}%;background:${accent(pack, item.color ?? "teal")}"></span></div>`;
  }).join("")}</div>${panel.note ? `<p class="ah-fine">${escape(panel.note)}</p>` : ""}</section>`;
}

function rowsPanel({ panel }) {
  return `<section class="ah-panel" data-panel="rows">${panel.title ? `<h3>${escape(panel.title)}</h3>` : ""}${panel.subtitle ? `<p class="ah-panel-sub">${escape(panel.subtitle)}</p>` : ""}<div class="ah-rows">${panel.items.map((item) => `<div class="ah-row" ${item.tone ? `data-tone="${escape(item.tone)}"` : ""}><span>${escape(item.label)}</span><b>${escape(item.value)}</b></div>`).join("")}</div>${panel.note ? `<p class="ah-fine">${escape(panel.note)}</p>` : ""}</section>`;
}

function tablePanel({ panel }) {
  return `<section class="ah-panel" data-panel="table">${panel.title ? `<h3>${escape(panel.title)}</h3>` : ""}${panel.subtitle ? `<p class="ah-panel-sub">${escape(panel.subtitle)}</p>` : ""}<div class="ah-table-scroll" role="region" aria-label="${escape(panel.title ?? "Table")}" tabindex="0"><table class="ah-table"><thead><tr>${panel.columns.map((column) => `<th scope="col" ${column.align ? `data-align="${escape(column.align)}"` : ""}>${escape(column.label)}</th>`).join("")}</tr></thead><tbody>${panel.rows.map((row) => `<tr>${panel.columns.map((column) => `<td ${column.align ? `data-align="${escape(column.align)}"` : ""}>${escape(row[column.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${panel.note ? `<p class="ah-fine">${escape(panel.note)}</p>` : ""}</section>`;
}

function statusPanel({ panel, catalog, data }) {
  const metric = catalog.get(panel.metric);
  const metricData = data.metrics[panel.metric];
  const status = metricData?.status ?? data.status;
  return `<section class="ah-panel" data-panel="status">${panel.title ? `<h3>${escape(panel.title)}</h3>` : ""}<p class="ah-status" data-state="${escape(status?.state ?? "unavailable")}">${escape(status?.label ?? "Unavailable")}</p>${status?.detail ? `<p class="ah-fine">${escape(status.detail)}</p>` : ""}${status?.coverage ? `<p class="ah-fine">${escape(status.coverage)}</p>` : ""}${metric ? `<p class="ah-fine">${escape(metric.description)}</p>` : ""}</section>`;
}

export function renderDashboard({ dashboard, catalog, snapshot, pack, projectName = "Metric harness", includeStyles = true, noindex = false }) {
  const statusTone = ["live"].includes(snapshot.status.state) ? "live" : ["partial", "stale"].includes(snapshot.status.state) ? "warn" : "fail";
  const kpis = dashboard.kpis.map((kpi, index) => kpiCard({ kpi, metric: catalog.get(kpi.metric) ?? { key: kpi.metric, label: kpi.metric, description: "Metric is not defined in the catalog.", unit: "count", fair: true }, data: snapshot.metrics[kpi.metric], snapshot, pack, index })).join("");
  let panelIndex = 0;
  const sections = dashboard.sections.map((section) => {
    const panels = section.panels.map((panel) => {
      panelIndex += 1;
      if (panel.kind === "chart") return chartPanel({ panel, catalog, data: snapshot, pack, panelIndex });
      if (panel.kind === "bars") return barsPanel({ panel, pack });
      if (panel.kind === "rows") return rowsPanel({ panel });
      if (panel.kind === "table") return tablePanel({ panel });
      if (panel.kind === "status") return statusPanel({ panel, catalog, data: snapshot });
      return `<p class="ah-note">${escape(panel.text)}</p>`;
    }).join("");
    return `<section class="ah-section" data-section="${escape(section.id)}"><div class="ah-section-head"><div><p class="ah-eyebrow">${escape(section.eyebrow)}</p><h2>${escape(section.title)}</h2>${section.caption ? `<p>${escape(section.caption)}</p>` : ""}</div></div><div class="ah-grid" data-layout="${escape(section.layout)}">${panels}</div></section>`;
  }).join("");
  const source = snapshot.source;
  const html = `<div class="ah" data-ah-dashboard="${escape(dashboard.id)}" data-ah-source="${escape(source)}">
${includeStyles ? `<style>${renderCss(pack)}</style>` : ""}
<div class="ah-shell">
  <header class="ah-top"><a class="ah-brand" href="#main"><span class="ah-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.45 7.44 7.29 4 12 4s8.55 3.44 9.94 7.65a1 1 0 0 1 0 .7C20.55 16.56 16.71 20 12 20s-8.55-3.44-9.94-7.65"/><circle cx="12" cy="12" r="3"/></svg></span><span><strong>${escape(dashboard.title)}</strong><small>${escape(projectName)}</small></span></a><span class="ah-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Read-only snapshot</span></header>
  <main id="main" class="ah-main">
    <p class="ah-eyebrow">Preserved dashboard · ${escape(source)}</p>
    <h1>${escape(dashboard.title)}</h1>
    <p class="ah-lede">${escape(dashboard.description)}</p>
    <div class="ah-pills"><span class="ah-pill">${escape(formatWindow(snapshot.window))}</span><span class="ah-pill">As of ${escape(formatAsOf(snapshot.asOf))}</span><span class="ah-pill" data-state="${statusTone}">${escape(snapshot.status.label)}</span></div>
    <section class="ah-kpis" aria-label="Key metrics">${kpis}</section>
    ${sections}
    ${dashboard.note ? `<p class="ah-note">${escape(dashboard.note)}</p>` : ""}
    <footer class="ah-footer"><strong>Measured rows · missing data stays unavailable</strong><span>Source: ${escape(source)} · ${escape(formatWindow(snapshot.window))} · ${escape(formatAsOf(snapshot.asOf))}</span></footer>
  </main>
</div>
</div>`;
  return noindex ? html.replace('<div class="ah"', '<div class="ah" data-noindex="true"') : html;
}

export function renderDashboardPage({ dashboard, catalog, snapshot, pack, projectName = "Metric harness", noindex = true }) {
  const body = renderDashboard({ dashboard, catalog, snapshot, pack, projectName, includeStyles: true });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<title>${escape(dashboard.title)} · ${escape(projectName)}</title>
<style>html,body{margin:0;background:${tokens(pack)["color.background"]};}a{color:inherit}@media print{html,body{background:#fff}}</style>
</head>
<body>${body}</body>
</html>
`;
}

export { escape, tokens };
