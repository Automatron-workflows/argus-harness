/**
 * Value formatting. `null` is always "Unavailable". The harness never converts
 * a missing observation into a zero.
 */

const LOCALE = "en-GB";

export const UNITS = Object.freeze([
  "currency_eur",
  "count",
  "percent",
  "ratio",
  "days",
  "hours",
  "duration_s",
  "text",
]);

function number(value, options) {
  return new Intl.NumberFormat(LOCALE, options).format(value);
}

export function formatMetric(value, unit, options = {}) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "Unavailable";
  const decimals = options.decimals;
  switch (unit) {
    case "currency_eur":
      return new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: decimals ?? (Math.abs(value) >= 1000 ? 0 : 2),
        minimumFractionDigits: decimals ?? 0,
      }).format(value);
    case "percent":
      return new Intl.NumberFormat(LOCALE, {
        style: "percent",
        maximumFractionDigits: decimals ?? 2,
        minimumFractionDigits: 0,
      }).format(value);
    case "ratio":
      return `${number(value, { maximumFractionDigits: decimals ?? 1 })}×`;
    case "days":
      return `${number(value, { maximumFractionDigits: decimals ?? 1 })} ${Math.abs(value) === 1 ? "day" : "days"}`;
    case "hours":
      return `${number(value, { maximumFractionDigits: decimals ?? 1 })} ${Math.abs(value) === 1 ? "hour" : "hours"}`;
    case "duration_s": {
      const seconds = Math.max(0, Math.round(value));
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m`;
    }
    case "count":
      return number(value, {
        maximumFractionDigits: decimals ?? 0,
        minimumFractionDigits: 0,
      });
    case "text":
      return String(value);
    default:
      return number(value, {
        maximumFractionDigits: decimals ?? 2,
        minimumFractionDigits: 0,
      });
  }
}

export function formatCompact(value, unit = "count") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  const abs = Math.abs(value);
  if (unit === "currency_eur" && abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}m`;
  if (unit === "currency_eur" && abs >= 1_000) return `€${(value / 1_000).toFixed(1)}k`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return formatMetric(value, unit);
}

export function formatDayLabel(day) {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return day;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatAsOf(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatWindow(window) {
  if (!window) return "No window";
  return `${formatDayLabel(window.start)}–${formatDayLabel(window.end)} · ${window.days} days`;
}

export function unavailable() {
  return "Unavailable";
}
