-- BigQuery example: project an existing wide daily table into the canonical
-- long shape. Put this in sources/bigquery.json as config.sql and set
-- config.project. The bq CLI runs it in that project.
SELECT 'mrr_eur' AS metric_key, metric_date, mrr_eur AS value, 'billing' AS source, computed_at
FROM `YOUR_GCP_PROJECT.YOUR_DATASET.daily_metrics`
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
UNION ALL
SELECT 'active_accounts', metric_date, active_accounts, 'product', computed_at
FROM `YOUR_GCP_PROJECT.YOUR_DATASET.daily_metrics`
WHERE metric_date BETWEEN DATE '{{start}}' AND DATE '{{end}}'
ORDER BY metric_key, metric_date
