-- Canonical long-format query.
-- Replace the table and keep the five output aliases. The harness passes
-- {{start}}, {{end}} and {{days}} before the command runs.
SELECT
  metric_key,
  metric_date,
  value,
  source,
  computed_at
FROM YOUR_DATABASE.YOUR_SCHEMA.metric_daily
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
ORDER BY metric_key, metric_date
