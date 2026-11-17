/** Shared SQL template substitution for warehouse queries. */
export function applySqlTemplate(sql, window, extra = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(window.start) || !/^\d{4}-\d{2}-\d{2}$/.test(window.end)) {
    throw new Error("Warehouse window must use YYYY-MM-DD");
  }
  let result = String(sql)
    .replaceAll("{{start}}", window.start)
    .replaceAll("{{end}}", window.end)
    .replaceAll("{{days}}", String(window.days ?? ""));
  for (const [key, value] of Object.entries(extra)) {
    result = result.replaceAll(`{{${key}}}`, String(value));
  }
  return result;
}
