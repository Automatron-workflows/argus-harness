-- DuckDB example: project a local wide table into the canonical long shape.
SELECT 'mrr_eur' AS metric_key, metric_date, mrr_eur AS value, 'billing' AS source, computed_at
FROM daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
UNION ALL
SELECT 'active_accounts', metric_date, active_accounts, 'product', computed_at
FROM daily_metrics
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
ORDER BY metric_key, metric_date
