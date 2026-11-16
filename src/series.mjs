import { addDays, dayRange, daysBetween, isContiguous, normalizeDay, parseDay } from "./calendar.mjs";

const DAY_MS = 86_400_000;

export function normalizeHistory(points) {
  const byDay = new Map();
  for (const point of points ?? []) {
    if (point === null || typeof point !== "object") continue;
    const day = normalizeDay(point.date);
    const value = point.value;
    if (!day || typeof value !== "number" || !Number.isFinite(value)) continue;
    byDay.set(day, value);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

/** Split a measured series wherever one or more calendar days are absent. */
export function segments(history) {
  const result = [];
  for (const point of history) {
    const current = result.at(-1);
    const previous = current?.at(-1);
    if (!previous || !isContiguous(previous.date, point.date)) result.push([point]);
    else current.push(point);
  }
  return result;
}

export function sparklinePoints(history) {
  const points = normalizeHistory(history).map((point) => ({
    ...point,
    timestamp: parseDay(point.date).getTime(),
  }));
  return { points, segments: segments(points) };
}

/**
 * Pick a readable y-axis step. Returns ticks from 0 to a rounded maximum.
 * The algorithm is deliberately small and deterministic; charts remain
 * comparable when the same data is rendered in the harness and in a snapshot.
 */
export function niceTicks(maxValue, count = 4) {
  const safeMax = Number.isFinite(maxValue) ? Math.max(0, maxValue) : 0;
  if (safeMax === 0) return [0];
  const target = Math.max(1, Math.trunc(count));
  const rough = safeMax / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const step = ([1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) ?? 10) * magnitude;
  const top = Math.ceil(safeMax / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step / 1_000_000; value += step) ticks.push(value);
  return ticks;
}

/**
 * Select x-axis labels that stay readable at the rendered pixel width.
 * Adjacent calendar days are thinned by pixel distance, not by index.
 */
export function selectDateTicks(dates, projectX, innerWidth, options = {}) {
  const byTime = new Map();
  for (const date of dates) {
    const time = date.getTime();
    if (Number.isFinite(time)) byTime.set(time, date);
  }
  const sorted = [...byTime.entries()].sort(([a], [b]) => a - b).map(([, date]) => date);
  if (sorted.length <= 2) return sorted;
  const minGap = options.minGapPx ?? (innerWidth < 320 ? 72 : innerWidth < 520 ? 64 : 56);
  const maxTicks = options.maxTicks ?? sorted.length;
  const candidates = sorted
    .map((date) => ({ date, x: projectX(date) }))
    .filter((candidate) => Number.isFinite(candidate.x));
  if (candidates.length <= 2) return candidates.map((candidate) => candidate.date);
  let selected = [];
  const last = candidates.at(-1);
  for (const candidate of candidates.slice(0, -1)) {
    const previous = selected.at(-1);
    if (!previous || candidate.x - previous.x >= minGap) selected.push(candidate);
  }
  if (last) {
    if (selected.at(-1) && last.x - selected.at(-1).x < minGap) selected.pop();
    selected.push(last);
  }
  if (selected.length > maxTicks) {
    const thinned = [];
    for (let index = 0; index < maxTicks; index += 1) {
      const pick = selected[Math.round((index * (selected.length - 1)) / Math.max(1, maxTicks - 1))];
      if (pick && thinned.at(-1)?.date !== pick.date) thinned.push(pick);
    }
    selected = thinned;
  }
  return selected.map((candidate) => candidate.date);
}

export function findAtOrBefore(history, targetDay) {
  let candidate = null;
  for (const point of history) {
    if (point.date > targetDay) break;
    candidate = point.value;
  }
  return candidate;
}

/**
 * Growth at 30/90/365 days. `null` means the window cannot be evaluated; it is
 * never extrapolated. A zero baseline with a positive current value returns
 * `null` because "+∞%" is not a dashboard number.
 */
export function growthRates(history, latestDay, windows = [30, 90, 365]) {
  const points = normalizeHistory(history);
  if (!points.length || !latestDay) return Object.fromEntries(windows.map((days) => [`t${days}d`, null]));
  const latest = points.at(-1).value;
  const oldest = points[0].date;
  const result = {};
  for (const days of windows) {
    const target = addDays(latestDay, -days);
    if (target < oldest) {
      result[`t${days}d`] = null;
      continue;
    }
    const past = findAtOrBefore(points, target);
    if (past === null) result[`t${days}d`] = null;
    else if (past <= 0) result[`t${days}d`] = latest > 0 ? null : 0;
    else result[`t${days}d`] = (latest - past) / past;
  }
  return result;
}

export function summarize(history) {
  const points = normalizeHistory(history);
  if (!points.length) {
    return { first: null, last: null, min: null, max: null, delta: null, deltaPct: null, points: 0 };
  }
  const first = points[0].value;
  const last = points.at(-1).value;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    first,
    last,
    min,
    max,
    delta: last - first,
    deltaPct: first === 0 ? null : (last - first) / Math.abs(first),
    points: points.length,
  };
}

export function chartWindow(seriesList, fallbackWindow) {
  const days = seriesList
    .flatMap((series) => series.history ?? [])
    .map((point) => normalizeDay(point.date))
    .filter(Boolean)
    .sort();
  if (!days.length) return fallbackWindow;
  return {
    start: days[0],
    end: days.at(-1),
    days: daysBetween(days[0], days.at(-1)) + 1,
  };
}

export function observedDays(history) {
  const points = normalizeHistory(history);
  if (!points.length) return 0;
  return daysBetween(points[0].date, points.at(-1).date) + 1;
}

export function missingDays(history) {
  const points = normalizeHistory(history);
  if (points.length < 2) return 0;
  const span = daysBetween(points[0].date, points.at(-1).date) + 1;
  return Math.max(0, span - points.length);
}

export function compareToPrevious(history) {
  const points = normalizeHistory(history);
  if (points.length < 2) return null;
  const current = points.at(-1).value;
  const previous = points.at(-2).value;
  if (previous === 0) return null;
  return { current, previous, delta: current - previous, pct: (current - previous) / Math.abs(previous) };
}

export function isMonotonic(history) {
  const points = normalizeHistory(history);
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].value < points[index - 1].value) return false;
  }
  return true;
}

export function median(values) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function rollingSum(history, days) {
  const points = normalizeHistory(history);
  if (points.length < days) return [];
  const result = [];
  for (let index = days - 1; index < points.length; index += 1) {
    let total = 0;
    for (let offset = 0; offset < days; offset += 1) total += points[index - offset].value;
    result.push({ date: points[index].date, value: total });
  }
  return result;
}

export function rollingAverage(history, days) {
  return rollingSum(history, days).map((point) => ({ date: point.date, value: point.value / days }));
}

export function calendarRows(history) {
  const points = normalizeHistory(history);
  if (!points.length) return [];
  return dayRange(points[0].date, points.at(-1).date).map((date) => ({
    date,
    value: points.find((point) => point.date === date)?.value ?? null,
  }));
}

export function toCsv(headers, rows) {
  const escape = (cell) => {
    if (cell === null || cell === undefined) return "";
    const text = String(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

export const DAY = DAY_MS;
export const dateMs = (day) => parseDay(day).getTime();
