-- Athena example: project an existing table into the canonical long shape.
-- Athena is Presto/Trino SQL. Replace the database and table names.
SELECT 'mrr_eur' AS metric_key, metric_date, mrr_eur AS value, 'billing' AS source, computed_at
FROM analytics.daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
UNION ALL
SELECT 'active_accounts', metric_date, active_accounts, 'product', computed_at
FROM analytics.daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
ORDER BY metric_key, metric_date
