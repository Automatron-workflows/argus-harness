#!/usr/bin/env node
/**
 * Generate the fictional Harbour snapshot used by the starter and the demo.
 * Deterministic, no network. The rows are illustrative, not measured results.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { addDays } from "../src/calendar.mjs";

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261115);
const end = "2026-11-15";
const start = addDays(end, -59);
const allDays = Array.from({ length: 60 }, (_, index) => addDays(start, index));
const round = (value) => Math.round(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const money = (value) => Math.round(value);

const series = {
  mrr_eur: [],
  active_accounts: [],
  new_accounts_30d: [],
  trial_to_paid_rate_30d: [],
  reports_generated_total: [],
  reports_generated_30d: [],
  search_impressions: [],
  click_through_rate: [],
  first_response_hours: [],
  retention_30d: [],
};

let reportsTotal = 0;
for (let index = 0; index < allDays.length; index += 1) {
  const date = allDays[index];
  const t = index / (allDays.length - 1);
  const weekly = Math.sin((index / 7) * Math.PI * 2);
  const noise = rng() * 2 - 1;
  const push = (key, value) => series[key].push({ date, value });

  push("mrr_eur", money(18400 + 5200 * t + 180 * weekly + 90 * noise));
  push("active_accounts", round(248 + 64 * t + 5 * weekly + 3 * noise));
  push("new_accounts_30d", round(22 + 16 * t + 2 * weekly + 1.2 * noise));
  push("trial_to_paid_rate_30d", Number(clamp(0.26 + 0.08 * t + 0.006 * weekly + 0.004 * noise, 0, 1).toFixed(4)));

  reportsTotal = Math.max(reportsTotal, round(890 + 234 * t + 3 * noise));
  push("reports_generated_total", reportsTotal);
  if (index < 33 || index > 36) {
    push("reports_generated_30d", round(42 + 20 * t + 2 * weekly + 2 * noise));
  }

  const spike = index >= 20 && index <= 22 ? 2500 : 0;
  if (index < 47 || index > 48) {
    push("search_impressions", round(5200 + 4600 * t + 900 * weekly + 500 * noise + spike));
  }
  push("click_through_rate", Number(clamp(0.038 + 0.014 * t + 0.002 * weekly + 0.001 * noise, 0, 1).toFixed(4)));
  push("first_response_hours", Number(Math.max(1.2, 6.8 - 3.4 * t + 0.3 * weekly + 0.2 * noise).toFixed(1)));
  push("retention_30d", Number(clamp(0.54 + 0.072 * t + 0.004 * weekly + 0.003 * noise, 0, 1).toFixed(4)));
}

const latest = (history) => history.at(-1);
const metrics = Object.fromEntries(
  Object.entries(series).map(([key, history]) => [
    key,
    {
      value: latest(history)?.value ?? null,
      date: latest(history)?.date ?? null,
      history,
      source: "harbour-demo",
    },
  ]),
);

const snapshot = {
  schema: "argus.snapshot/1",
  source: "starter-static",
  asOf: "2026-11-15T06:00:00.000Z",
  window: { start, end, days: 60 },
  status: {
    state: "live",
    label: "Live snapshot",
    detail: "Fictional Harbour data generated for the Argus Harness starter.",
    coverage: "60 measured days · 10 metrics · fictional data",
    computedAt: "2026-11-15T06:00:00.000Z",
  },
  metrics,
};

await mkdir("examples/starter/data", { recursive: true });
await writeFile("examples/starter/data/snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`);

// Demo variants: healthy, stale, empty. The healthy state is the starter snapshot.
await mkdir("demo/data", { recursive: true });
await writeFile("demo/data/snapshot-healthy.json", `${JSON.stringify(snapshot, null, 2)}\n`);

const stale = {
  ...snapshot,
  asOf: "2026-11-11T06:00:00.000Z",
  status: {
    state: "stale",
    label: "Stale snapshot",
    detail: "The latest successful load is four days old. Values are retained; they are not current.",
    coverage: "56 measured days shown · last success 11 November 2026",
    computedAt: "2026-11-11T06:00:00.000Z",
  },
  metrics: Object.fromEntries(
    Object.entries(metrics).map(([key, metric]) => [
      key,
      {
        ...metric,
        history: metric.history.filter((point) => point.date <= "2026-11-11"),
        value: metric.history.filter((point) => point.date <= "2026-11-11").at(-1)?.value ?? null,
        date: metric.history.filter((point) => point.date <= "2026-11-11").at(-1)?.date ?? null,
      },
    ]),
  ),
};
await writeFile("demo/data/snapshot-stale.json", `${JSON.stringify(stale, null, 2)}\n`);

const empty = {
  ...snapshot,
  asOf: "2026-11-15T06:00:00.000Z",
  status: {
    state: "unavailable",
    label: "Source unavailable",
    detail: "The source returned no measured rows. Nothing has been replaced with zeroes.",
    coverage: "0 measured rows",
    computedAt: "2026-11-15T06:00:00.000Z",
  },
  metrics: Object.fromEntries(
    Object.keys(metrics).map((key) => [key, { value: null, date: null, history: [], source: "harbour-demo" }]),
  ),
};
await writeFile("demo/data/snapshot-empty.json", `${JSON.stringify(empty, null, 2)}\n`);

console.log(JSON.stringify({ start, end, metrics: Object.keys(metrics), rows: Object.values(series).reduce((sum, rows) => sum + rows.length, 0) }));
