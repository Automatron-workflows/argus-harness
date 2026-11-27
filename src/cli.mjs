import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDashboard, evidenceExitCode } from "./audit.mjs";
import { buildBigQuerySql } from "./bigquery.mjs";
import { trailingWindow } from "./calendar.mjs";
import { formatMetric } from "./format.mjs";
import { bigQueryDdl, lookerFields, lookerFieldsCsv, fieldsReadme, lookerReadme } from "./looker.mjs";
import { loadProject, writeJson, inside } from "./project.mjs";
import { renderDashboardPage } from "./render.mjs";
import { warehouseDdl } from "./warehouse-ddl.mjs";
import { loadSnapshot } from "./sources.mjs";
import { runSqlCliConnectivity, SqlCliUnavailable } from "./sql-cli.mjs";
import { runBigQueryConnectivity, BigQueryUnavailable } from "./bigquery.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TEMPLATES = {
  starter: join(ROOT, "examples", "starter"),
  warehouse: join(ROOT, "examples", "warehouse-starter"),
};

const HELP = `Argus Harness — dashboards that keep definitions, freshness and missing data visible.

Usage:
  argus-harness init <dir> [--template starter|warehouse]
  argus-harness doctor [--project <dir>] [--source <id>] [--live] [--json]
  argus-harness catalog [--project <dir>] [--json]
  argus-harness render [--project <dir>] [--dashboard <id>] [--source <id>] [--snapshot <file>] [--out <file>] [--now <iso>]
  argus-harness audit [--project <dir>] [--dashboard <id>] [--source <id>] [--snapshot <file>] [--out <file>] [--strict] [--json] [--now <iso>]
  argus-harness looker [--project <dir>] [--out <dir>]
  argus-harness fields [--project <dir>] [--out <dir>]
  argus-harness warehouse-ddl [--project <dir>] --dialect <snowflake|postgres|redshift|duckdb> [--out <file>]
  argus-harness bigquery-sql [--project <dir>] [--dashboard <id>]
  argus-harness version

A source is one of: static-json, http-json, csv, bigquery, sql-cli.
Use --source to run one dashboard contract against another configured warehouse.
No credentials are stored in the project. HTTP header values may reference ${"${ENV}"}.
`;

function parse(argv) {
  const args = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }
    const [name, inline] = token.slice(2).split("=");
    if (inline !== undefined) {
      flags[name] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[name] = next;
      index += 1;
    } else {
      flags[name] = true;
    }
  }
  return { args, flags };
}

async function projectFrom(flags) {
  if (flags.project === true) throw new Error("--project requires a directory");
  const root = resolve(flags.project ? String(flags.project) : process.cwd());
  return loadProject(root);
}

function flagValue(flags, name) {
  if (flags[name] === true) throw new Error(`--${name} requires a value`);
  return flags[name] === undefined ? undefined : String(flags[name]);
}

function dashboardFrom(project, id) {
  const key = id ? String(id) : project.defaultDashboard;
  const dashboard = project.dashboards.get(key);
  if (!dashboard) throw new Error(`Unknown dashboard "${key}". Available: ${[...project.dashboards.keys()].join(", ")}`);
  return dashboard;
}

function dashboardWithSource(project, dashboard, flags) {
  const sourceId = flagValue(flags, "source");
  if (!sourceId) return dashboard;
  if (!project.sources.has(sourceId)) {
    throw new Error(`Unknown source "${sourceId}". Available: ${[...project.sources.keys()].join(", ")}`);
  }
  return { ...dashboard, source: sourceId };
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

async function init(args, flags) {
  const destination = resolve(args[0] ?? "argus-dashboard");
  const template = String(flags.template ?? "starter");
  const source = TEMPLATES[template];
  if (!source) throw new Error(`Unknown template "${template}". Available: ${Object.keys(TEMPLATES).join(", ")}`);
  const existing = await readdir(destination).catch(() => []);
  if (existing.length) throw new Error(`Destination is not empty: ${destination}`);
  await cp(source, destination, { recursive: true });
  await mkdir(join(destination, ".argus-harness"), { recursive: true });
  const bin = join(ROOT, "bin", "argus-harness.mjs");
  const startHere = template === "warehouse"
    ? `# Start here

This is the warehouse starter. It contains one metric catalog, one dashboard and
source boilerplates for BigQuery, Snowflake, Postgres/Redshift, DuckDB, Athena
and a custom SQL command.

1. Read \`argus.config.json\` and \`sources/README.md\`.
2. Choose one source in \`sources/\` and replace its project, table and connection
   placeholders. Keep credentials in the environment, never in this folder.
3. Create the canonical \`metric_daily\` table, or point the source at an existing
   warehouse table using the provider's SQL file in \`queries/\`.
4. Run \`node ${bin} doctor --project .\` (offline).
5. Run \`node ${bin} render --project . --source bigquery --out dashboard.html\`.
6. Run \`node ${bin} audit --project . --source bigquery --out evidence.json\`.
7. Run \`node ${bin} looker --project . --out looker\` for the BigQuery/Looker
   field map, or follow \`docs/WAREHOUSES.md\` for the other providers in the harness repository.

The starter data is fictional. The audit is the gate; a rendered page alone is
not evidence that the warehouse rows are fresh or complete.
`
    : `# Start here

This project was created by Argus Harness. It contains a metric catalog, a source,
a dashboard contract and a measured snapshot.

1. Read \`argus.config.json\`. It lists the metric, source and dashboard folders.
2. Edit \`metrics/*.json\`. Keep the key, unit, aggregation and null policy stable.
3. Point \`sources/static.json\` at your snapshot, or add an HTTP, CSV or BigQuery
   source. No credentials belong in this folder; use environment variables.
4. Run \`node ${bin} doctor --project .\`.
5. Run \`node ${bin} render --project . --out dashboard.html\`.
6. Run \`node ${bin} audit --project . --out evidence.json\`.
7. Read \`docs/PRIMITIVES.md\` in the harness repository before adding a new metric.

The starter data is fictional. Replace it with your own measured rows.
`;
  await writeFile(join(destination, ".argus-harness", "START_HERE.md"), startHere);
  process.stdout.write(`Created ${destination} (${template})\nNext: cd ${destination} && node ${bin} doctor --project .\n`);
}

async function runSourceCheck(project, source) {
  if (source.kind === "bigquery") return runBigQueryConnectivity({ source });
  if (source.kind === "sql-cli") return runSqlCliConnectivity({ source, env: process.env, projectRoot: project.root });
  throw new Error(`The ${source.kind} source has no live check`);
}

async function doctor(flags) {
  const project = await projectFrom(flags);
  if (flags.source) {
    const sourceId = flagValue(flags, "source");
    if (!project.sources.has(sourceId)) {
      throw new Error(`Unknown source "${sourceId}". Available: ${[...project.sources.keys()].join(", ")}`);
    }
  }
  const checks = [];
  checks.push(["project", "ok", project.config.id]);
  checks.push(["metrics", "ok", `${project.metrics.size}`]);
  checks.push(["sources", "ok", `${project.sources.size}`]);
  checks.push(["dashboards", "ok", `${project.dashboards.size}`]);
  checks.push(["pack", "ok", `${project.pack.id}@${project.pack.version}`]);
  for (const source of project.sources.values()) {
    if (source.kind === "static-json" || source.kind === "csv") {
      const file = resolve(project.root, source.config.path);
      if (!inside(project.root, file)) {
        checks.push([`source:${source.id}`, "fail", `path escapes the project: ${source.config.path}`]);
        continue;
      }
      try {
        await readFile(file);
        checks.push([`source:${source.id}`, "ok", source.config.path]);
      } catch {
        checks.push([`source:${source.id}`, "fail", `missing ${source.config.path}`]);
      }
    } else if (source.kind === "http-json") {
      checks.push([`source:${source.id}`, "info", `${source.config.method} ${new URL(source.config.url).host}`]);
    } else if (source.kind === "bigquery") {
      checks.push([`source:${source.id}`, "info", `${source.config.project} · ${source.config.dataset ?? "custom sql"}.${source.config.table ?? ""}`]);
    } else {
      const commands = { bigquery: "bq", snowflake: "snowsql", postgres: "psql", redshift: "psql", duckdb: "duckdb", athena: "aws", custom: "custom" };
      checks.push([`source:${source.id}`, "info", `${source.config.preset} · ${source.config.command ?? commands[source.config.preset] ?? "custom"}`]);
    }
  }
  let failed = checks.filter(([, level]) => level === "fail").length;
  if (flags.live) {
    const selected = flags.source ? String(flags.source) : null;
    const candidates = selected ? [project.sources.get(selected)] : [...project.sources.values()];
    for (const source of candidates.filter((item) => item.kind === "bigquery" || item.kind === "sql-cli")) {
      try {
        await runSourceCheck(project, source);
        checks.push([`live:${source.id}`, "ok", "SELECT 1"]);
      } catch (error) {
        const level = error.name === SqlCliUnavailable.name || error.name === BigQueryUnavailable.name ? "fail" : "fail";
        checks.push([`live:${source.id}`, level, String(error.message ?? error).slice(0, 120)]);
        failed += 1;
      }
    }
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ project: project.config.id, checks, failed }, null, 2) + "\n");
  } else {
    for (const [name, level, detail] of checks) process.stdout.write(`${level.padEnd(4)} ${name.padEnd(24)} ${detail}\n`);
  }
  process.exitCode = failed ? 1 : 0;
}

async function catalog(flags) {
  const project = await projectFrom(flags);
  const rows = [...project.metrics.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (flags.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }
  for (const metric of rows) {
    const target = metric.target?.label ?? (metric.target ? formatMetric(metric.target.value, metric.unit, metric.format) : "—");
    process.stdout.write(`${metric.key.padEnd(34)} ${metric.unit.padEnd(13)} ${metric.aggregation.padEnd(11)} ${metric.nullPolicy.padEnd(12)} ${target.padEnd(20)} ${metric.label}\n`);
  }
}

function auditNow(flags) {
  if (!flags.now) return new Date();
  const value = new Date(String(flags.now));
  if (!Number.isFinite(value.getTime())) throw new Error("--now must be an ISO timestamp");
  return value;
}

async function render(flags) {
  const project = await projectFrom(flags);
  const dashboard = dashboardWithSource(project, dashboardFrom(project, flags.dashboard), flags);
  const snapshot = await loadSnapshot({
    project,
    dashboard,
    snapshotFile: flagValue(flags, "snapshot"),
    now: auditNow(flags),
  });
  const html = renderDashboardPage({
    dashboard,
    catalog: project.metrics,
    snapshot,
    pack: project.pack,
    projectName: project.config.name,
    noindex: true,
  });
  if (flags.out) {
    const out = resolve(flagValue(flags, "out"));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html);
    process.stdout.write(`Rendered ${dashboard.id} → ${out}\n`);
  } else {
    process.stdout.write(html);
  }
}

async function audit(flags) {
  const project = await projectFrom(flags);
  const dashboard = dashboardWithSource(project, dashboardFrom(project, flags.dashboard), flags);
  const source = project.sources.get(dashboard.source);
  const now = auditNow(flags);
  const snapshot = await loadSnapshot({
    project,
    dashboard,
    snapshotFile: flagValue(flags, "snapshot"),
    now,
  });
  const evidence = auditDashboard({ dashboard, catalog: project.metrics, source, snapshot, now });
  if (flags.json) process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
  else {
    for (const check of evidence.checks) {
      process.stdout.write(`${check.level.toUpperCase().padEnd(5)} ${check.id.padEnd(22)} ${check.title}\n      ${check.detail}\n`);
    }
    process.stdout.write(`\n${evidence.summary.pass} pass · ${evidence.summary.warn} warn · ${evidence.summary.fail} fail\n`);
  }
  if (flags.out) {
    const out = resolve(flagValue(flags, "out"));
    await writeJson(out, evidence);
    process.stdout.write(`Evidence → ${out}\n`);
  }
  process.exitCode = evidenceExitCode(evidence, Boolean(flags.strict));
}

async function looker(flags) {
  const project = await projectFrom(flags);
  const out = resolve(flagValue(flags, "out") ?? "output/looker");
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "bigquery.sql"), bigQueryDdl(project.metrics));
  await writeFile(join(out, "looker-fields.csv"), lookerFieldsCsv(project.metrics));
  await writeJson(join(out, "looker-fields.json"), lookerFields(project.metrics));
  await writeFile(join(out, "README.md"), lookerReadme(project.config.name));
  process.stdout.write(`Wrote ${out}/bigquery.sql, looker-fields.csv, looker-fields.json, README.md\n`);
}

async function fields(flags) {
  const project = await projectFrom(flags);
  const out = resolve(flagValue(flags, "out") ?? "output/looker");
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "looker-fields.csv"), lookerFieldsCsv(project.metrics));
  await writeJson(join(out, "looker-fields.json"), lookerFields(project.metrics));
  await writeFile(join(out, "README.md"), fieldsReadme(project.config.name));
  process.stdout.write(`Wrote ${out}/looker-fields.csv and looker-fields.json\n`);
}

async function warehouseDdlCli(flags) {
  const project = await projectFrom(flags);
  const dialect = flagValue(flags, "dialect");
  if (!dialect) throw new Error("--dialect is required (snowflake, postgres, redshift or duckdb)");
  if (dialect === "bigquery") throw new Error("BigQuery DDL is generated by argus-harness looker");
  const sql = warehouseDdl(dialect, project.metrics);
  const out = flagValue(flags, "out");
  if (out) {
    const file = resolve(out);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, sql);
    process.stdout.write(`Wrote ${file}\n`);
  } else {
    process.stdout.write(sql);
  }
}

async function bigquerySql(flags) {
  const project = await projectFrom(flags);
  const dashboard = dashboardWithSource(project, dashboardFrom(project, flags.dashboard), flags);
  const source = project.sources.get(dashboard.source);
  if (source.kind !== "bigquery") throw new Error(`Dashboard "${dashboard.id}" uses "${source.kind}", not bigquery`);
  const today = new Date().toISOString().slice(0, 10);
  const window = trailingWindow(today, dashboard.window.days);
  process.stdout.write(buildBigQuerySql(source, window));
}

export async function runCli(argv = process.argv.slice(2)) {
  const { args, flags } = parse(argv);
  const command = args.shift() ?? "help";
  try {
    if (command === "help" || flags.help) {
      process.stdout.write(HELP);
      return;
    }
    if (command === "version" || flags.version) {
      process.stdout.write(`${await readVersion()}\n`);
      return;
    }
    if (command === "init") return await init(args, flags);
    if (command === "doctor") return await doctor(flags);
    if (command === "catalog") return await catalog(flags);
    if (command === "render") return await render(flags);
    if (command === "audit") return await audit(flags);
    if (command === "looker") return await looker(flags);
    if (command === "fields") return await fields(flags);
    if (command === "warehouse-ddl") return await warehouseDdlCli(flags);
    if (command === "bigquery-sql") return await bigquerySql(flags);
    throw new Error(`Unknown command "${command}". Run argus-harness help.`);
  } catch (error) {
    if (process.env.DEBUG) throw error;
    process.stderr.write(`argus-harness: ${error.message}\n`);
    process.exitCode = 1;
  }
}
