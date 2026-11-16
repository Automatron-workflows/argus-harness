/**
 * Calendar-day helpers. Every series in the harness is keyed by a real UTC
 * calendar day. A missing day is a gap; it is never a zero.
 */

const DAY_MS = 86_400_000;

export function isValidDay(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function normalizeDay(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isValidDay(trimmed)) return trimmed;
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 9999) return null;
  return formatDay(date);
}

export function formatDay(date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function parseDay(day) {
  return new Date(`${day}T00:00:00.000Z`);
}

export function addDays(day, amount) {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDay(date);
}

export function daysBetween(start, end) {
  return Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / DAY_MS);
}

export function trailingWindow(end, days) {
  const safeDays = Math.max(1, Math.min(3660, Math.trunc(days)));
  return { start: addDays(end, -(safeDays - 1)), end, days: safeDays };
}

export function dayRange(start, end) {
  const result = [];
  let cursor = start;
  for (let guard = 0; guard < 3661 && cursor <= end; guard += 1) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

export function isContiguous(previous, next) {
  return daysBetween(previous, next) === 1;
}

export function previousDay(day) {
  return addDays(day, -1);
}
