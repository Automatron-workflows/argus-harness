-- Postgres / Redshift example: project an existing wide daily table into the
-- canonical long shape. Replace the schema, table and column names.
SELECT 'mrr_eur' AS metric_key, metric_date, mrr_eur AS value, 'billing' AS source, computed_at
FROM analytics.daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
UNION ALL
SELECT 'active_accounts', metric_date, active_accounts, 'product', computed_at
FROM analytics.daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
ORDER BY metric_key, metric_date
