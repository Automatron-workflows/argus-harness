-- Snowflake example: project an existing wide daily table into the canonical
-- long shape. Replace the fully qualified table and column names.
SELECT 'MRR_EUR' AS metric_key, metric_date, mrr_eur AS value, 'billing' AS source, computed_at
FROM YOUR_DATABASE.YOUR_SCHEMA.DAILY_METRICS
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
UNION ALL
SELECT 'ACTIVE_ACCOUNTS', metric_date, active_accounts, 'product', computed_at
FROM YOUR_DATABASE.YOUR_SCHEMA.DAILY_METRICS
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
ORDER BY metric_key, metric_date
