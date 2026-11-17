import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { rowsFromCsv } from "./csv.mjs";
import { inside } from "./project.mjs";
import { applySqlTemplate } from "./sql-template.mjs";

const run = promisify(execFile);

export class SqlCliUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = "SqlCliUnavailable";
  }
}

const PRESETS = {
  bigquery: { command: "bq", format: "json" },
  snowflake: { command: "snowsql", format: "csv" },
  postgres: { command: "psql", format: "csv" },
  redshift: { command: "psql", format: "csv" },
  duckdb: { command: "duckdb", format: "csv" },
  athena: { command: "aws", format: "json" },
  custom: { command: null, format: "csv" },
};

function childEnv(source, env) {
  const allowed = new Set(["PATH", "HOME", "TMPDIR", ...(source.config.env ?? [])]);
  if (source.config.preset === "postgres" || source.config.preset === "redshift") {
    allowed.add(source.config.connectionEnv ?? "DATABASE_URL");
  }
  const result = {};
  for (const name of allowed) {
    if (env[name] !== undefined) result[name] = env[name];
  }
  return result;
}

function resolveArgs(args, sql, env) {
  return (args ?? []).map((arg) => {
    let resolved = arg.replaceAll("{{sql}}", sql).replaceAll("{sql}", sql);
    resolved = resolved.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, name) => {
      if (env[name] === undefined) throw new SqlCliUnavailable(`Missing environment variable ${name}`);
      return env[name];
    });
    return resolved;
  });
}

function presetArgs(source, sql) {
  const { preset, connection, database } = source.config;
  if (preset === "snowflake") {
    const args = ["-o", "output_format=csv", "-o", "header=true", "-o", "friendly=false", "-o", "timing=false"];
    if (connection) args.push("-c", connection);
    if (source.config.database) args.push("-d", source.config.database);
    if (source.config.schema) args.push("-s", source.config.schema);
    if (source.config.warehouse) args.push("-w", source.config.warehouse);
    if (source.config.role) args.push("-r", source.config.role);
    args.push("-q", sql);
    return args;
  }
  if (preset === "postgres" || preset === "redshift") {
    return ["--csv", "-v", "ON_ERROR_STOP=1", "-c", sql];
  }
  if (preset === "duckdb") {
    return database ? [database, "-csv", "-c", sql] : ["-csv", "-c", sql];
  }
  if (preset === "bigquery") {
    return ["query", "--use_legacy_sql=false", "--format=json", "--max_rows=100000", sql];
  }
  return [sql];
}

function parseJsonRows(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.data)) return parsed.data;
  throw new Error("JSON output did not contain an array of rows");
}

function normalizeRow(row) {
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    metric_key: String(lower.metric_key ?? lower.metrickey ?? lower.key ?? "").trim(),
    metric_date: String(lower.metric_date ?? lower.metricdate ?? lower.date ?? "").trim(),
    value: lower.value,
    source: lower.source,
    computed_at: lower.computed_at ?? lower.computedat ?? lower.computed ?? undefined,
  };
}

function parseRows(text, format) {
  if (format === "json") return parseJsonRows(text).map(normalizeRow);
  return rowsFromCsv(text).map(normalizeRow);
}

async function runAthena({ source, sql, env, timeoutMs }) {
  const config = source.config;
  const common = [
    ...(config.profile ? ["--profile", config.profile] : []),
    ...(config.region ? ["--region", config.region] : []),
    "--output",
    "json",
  ];
  const start = await aws(
    [
      "athena",
      "start-query-execution",
      "--query-string",
      sql,
      "--query-execution-context",
      `Database=${config.database}`,
      ...(config.outputLocation ? ["--result-configuration", `OutputLocation=${config.outputLocation}`] : []),
      ...(config.workgroup ? ["--work-group", config.workgroup] : []),
      ...common,
    ],
    env,
    timeoutMs,
  );
  const id = JSON.parse(start).QueryExecutionId;
  if (!id) throw new SqlCliUnavailable("Athena did not return a query execution id");
  const deadline = Date.now() + timeoutMs;
  let state = "";
  while (Date.now() < deadline) {
    const detail = JSON.parse(await aws(["athena", "get-query-execution", "--query-execution-id", id, ...common], env, timeoutMs));
    state = detail?.QueryExecution?.Status?.State ?? "";
    if (state === "SUCCEEDED") break;
    if (["FAILED", "CANCELLED"].includes(state)) {
      const reason = detail?.QueryExecution?.Status?.StateChangeReason ?? state;
      throw new SqlCliUnavailable(`Athena query ${state.toLowerCase()}: ${reason}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  if (state !== "SUCCEEDED") throw new SqlCliUnavailable("Athena query timed out");
  const rows = [];
  let nextToken;
  do {
    const result = JSON.parse(
      await aws(
        ["athena", "get-query-results", "--query-execution-id", id, ...(nextToken ? ["--next-token", nextToken] : []), ...common],
        env,
        timeoutMs,
      ),
    );
    const page = result?.ResultSet?.Rows ?? [];
    if (!rows.length) rows.push(...page);
    else rows.push(...page.slice(1));
    nextToken = result?.NextToken;
  } while (nextToken);
  if (!rows.length) return [];
  const header = (rows[0].Data ?? []).map((cell) => cell.VarCharValue ?? "");
  return rows.slice(1).map((row) =>
    normalizeRow(Object.fromEntries(header.map((name, index) => [name, row.Data?.[index]?.VarCharValue ?? ""]))),
  );
}

async function aws(args, env, timeoutMs) {
  try {
    const { stdout } = await run("aws", args, {
      env: childEnv({ config: { env: ["AWS_PROFILE", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"] } }, env),
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout;
  } catch (error) {
    if (error.code === "ENOENT") throw new SqlCliUnavailable("The aws CLI is not installed or not on PATH");
    throw new SqlCliUnavailable(String(error.stderr || error.message || "aws command failed").trim().slice(0, 1200));
  }
}

export async function runSqlCli({ source, window, env = process.env, projectRoot }) {
  const config = source.config;
  const sql = applySqlTemplate(config.sql, window);
  if (config.preset === "athena") return runAthena({ source, sql, env, timeoutMs: config.timeoutMs });
  const preset = PRESETS[config.preset] ?? PRESETS.custom;
  const command = config.command ?? preset.command;
  if (!command) throw new SqlCliUnavailable("sql-cli source has no command");
  const args = config.args ? resolveArgs(config.args, sql, env) : presetArgs(source, sql);
  if (config.stdin) {
    if (args.at(-1) === sql) args.pop();
  } else if (!config.args && args.at(-1) !== sql) {
    args.push(sql);
  }
  const input = config.stdin ? sql : undefined;
  const format = config.format ?? preset.format;
  let cwd;
  if (projectRoot) {
    cwd = resolve(projectRoot, config.cwd ?? ".");
    if (!inside(projectRoot, cwd)) throw new SqlCliUnavailable("sql-cli cwd escapes the project");
  } else if (config.cwd) {
    cwd = resolve(config.cwd);
  }
  try {
    const { stdout } = await run(command, args, {
      env: childEnv(source, env),
      timeout: config.timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
      ...(cwd ? { cwd } : {}),
      ...(input ? { input } : {}),
    });
    return parseRows(stdout, format);
  } catch (error) {
    if (error instanceof SqlCliUnavailable) throw error;
    if (error.code === "ENOENT") throw new SqlCliUnavailable(`The command "${command}" is not installed or not on PATH`);
    throw new SqlCliUnavailable(String(error.stderr || error.message || "warehouse command failed").trim().slice(0, 1200));
  }
}

export { PRESETS, parseRows };
