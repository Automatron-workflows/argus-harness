import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applySqlTemplate } from "./sql-template.mjs";

const run = promisify(execFile);

export class BigQueryUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = "BigQueryUnavailable";
  }
}

export function bigQueryTable(source) {
  const { project, dataset, table } = source.config;
  if (!dataset || !table) return null;
  return table.includes(".") ? table : `${project}.${dataset}.${table}`;
}

export function buildBigQuerySql(source, window) {
  if (source.config.sql) return applySqlTemplate(source.config.sql, window);
  const table = bigQueryTable(source);
  if (!table) throw new Error("BigQuery source needs dataset and table, or a custom sql projection");
  if (!/^[A-Za-z0-9_$.-]{1,1024}$/.test(table)) throw new Error("Invalid BigQuery table identifier");
  const { dateColumn, metricColumn, valueColumn, sourceColumn, computedAtColumn } = source.config;
  for (const column of [dateColumn, metricColumn, valueColumn, sourceColumn, computedAtColumn]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(column)) throw new Error(`Invalid BigQuery column identifier: ${column}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(window.start) || !/^\d{4}-\d{2}-\d{2}$/.test(window.end)) {
    throw new Error("BigQuery window must use YYYY-MM-DD");
  }
  return `SELECT
  CAST(${metricColumn} AS STRING) AS metric_key,
  CAST(${dateColumn} AS DATE) AS metric_date,
  CAST(${valueColumn} AS FLOAT64) AS value,
  CAST(${sourceColumn} AS STRING) AS source,
  CAST(${computedAtColumn} AS TIMESTAMP) AS computed_at
FROM \`${table}\`
WHERE ${dateColumn} BETWEEN DATE '${window.start}' AND DATE '${window.end}'
ORDER BY ${metricColumn}, ${dateColumn}
`;
}

export function bqEnv(env = process.env) {
  const allowed = [
    "PATH",
    "HOME",
    "TMPDIR",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLOUD_PROJECT",
    "CLOUDSDK_CONFIG",
    "CLOUDSDK_CORE_PROJECT",
    "CLOUDSDK_COMPUTE_REGION",
    "CLOUDSDK_COMPUTE_ZONE",
  ];
  const result = {};
  for (const name of allowed) {
    if (env[name] !== undefined) result[name] = env[name];
  }
  return result;
}

export async function runBigQueryConnectivity({ source, bqBin = process.env.BQ_BIN || "bq" }) {
  const args = [
    "query",
    "--use_legacy_sql=false",
    "--format=json",
    "SELECT 1 AS ok",
  ];
  try {
    const { stdout } = await run(bqBin, args, { maxBuffer: 1024 * 1024, encoding: "utf8", env: bqEnv() });
    JSON.parse(stdout.trim());
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new BigQueryUnavailable("The bq CLI is not installed or not on PATH. Set BQ_BIN or install the Google Cloud SDK.");
    }
    const message = String(error.stderr || error.message || "bq query failed").trim();
    throw new BigQueryUnavailable(message.slice(0, 1200));
  }
}

export async function runBigQuery({ source, window, bqBin = process.env.BQ_BIN || "bq", maxBuffer = 64 * 1024 * 1024 }) {
  const sql = buildBigQuerySql(source, window);
  const args = [
    "query",
    "--use_legacy_sql=false",
    "--format=json",
    "--max_rows=100000",
    "--project_id",
    source.config.project,
    ...(source.config.location ? ["--location", source.config.location] : []),
    sql,
  ];
  try {
    const { stdout } = await run(bqBin, args, { maxBuffer, encoding: "utf8", env: bqEnv() });
    const text = stdout.trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new BigQueryUnavailable("The bq CLI is not installed or not on PATH. Set BQ_BIN or install the Google Cloud SDK.");
    }
    const message = String(error.stderr || error.message || "bq query failed").trim();
    throw new BigQueryUnavailable(message.slice(0, 1200));
  }
}
