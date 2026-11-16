import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateDashboard,
  validateMetric,
  validatePack,
  validateProject,
  validateSource,
} from "./schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export async function readJson(file, label = file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function inside(root, target) {
  const base = resolve(root);
  const resolved = resolve(root, target);
  const rel = relative(base, resolved);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function listJson(root, entry) {
  const target = resolve(root, entry);
  if (!inside(root, target)) throw new Error(`Path escapes the project: ${entry}`);
  const info = await stat(target).catch(() => null);
  if (!info) throw new Error(`Path does not exist: ${entry}`);
  if (info.isFile()) return [target];
  if (!info.isDirectory()) throw new Error(`Expected a file or directory: ${entry}`);
  const files = (await readdir(target)).filter((name) => name.endsWith(".json")).sort();
  return files.map((name) => join(target, name));
}

function expand(document, key) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.[key])) return document[key];
  return [document];
}

export async function loadPack(projectRoot, packRef) {
  if (packRef.includes("/") || packRef.endsWith(".json")) {
    const file = resolve(projectRoot, packRef);
    if (!inside(projectRoot, file)) throw new Error(`Pack path escapes the project: ${packRef}`);
    return validatePack(await readJson(file, packRef), packRef);
  }
  const file = join(ROOT, "packs", packRef, "pack.json");
  return validatePack(await readJson(file, `pack ${packRef}`), `pack ${packRef}`);
}

export async function loadProject(projectRoot) {
  const root = resolve(projectRoot);
  const config = validateProject(await readJson(join(root, "argus.config.json"), "argus.config.json"));
  const pack = await loadPack(root, config.pack);
  const metrics = new Map();
  for (const entry of config.metrics) {
    for (const file of await listJson(root, entry)) {
      const document = await readJson(file, relative(root, file));
      for (const [index, raw] of expand(document, "metrics").entries()) {
        const metric = validateMetric(raw, `${relative(root, file)}${index ? `[${index}]` : ""}`);
        if (metrics.has(metric.key)) throw new Error(`Duplicate metric key "${metric.key}"`);
        metrics.set(metric.key, metric);
      }
    }
  }
  const sources = new Map();
  for (const entry of config.sources) {
    for (const file of await listJson(root, entry)) {
      const document = await readJson(file, relative(root, file));
      for (const [index, raw] of expand(document, "sources").entries()) {
        const source = validateSource(raw, `${relative(root, file)}${index ? `[${index}]` : ""}`);
        if (sources.has(source.id)) throw new Error(`Duplicate source id "${source.id}"`);
        sources.set(source.id, source);
      }
    }
  }
  const dashboards = new Map();
  for (const entry of config.dashboards) {
    for (const file of await listJson(root, entry)) {
      const document = await readJson(file, relative(root, file));
      for (const [index, raw] of expand(document, "dashboards").entries()) {
        const dashboard = validateDashboard(raw, `${relative(root, file)}${index ? `[${index}]` : ""}`);
        if (dashboards.has(dashboard.id)) throw new Error(`Duplicate dashboard id "${dashboard.id}"`);
        dashboards.set(dashboard.id, dashboard);
      }
    }
  }
  for (const dashboard of dashboards.values()) {
    if (!sources.has(dashboard.source)) {
      throw new Error(`Dashboard "${dashboard.id}" references unknown source "${dashboard.source}"`);
    }
    for (const metric of dashboardMetrics(dashboard)) {
      if (!metrics.has(metric)) throw new Error(`Dashboard "${dashboard.id}" references unknown metric "${metric}"`);
    }
  }
  const defaultDashboard =
    config.defaultDashboard && dashboards.has(config.defaultDashboard)
      ? config.defaultDashboard
      : dashboards.keys().next().value;
  if (!defaultDashboard) throw new Error("Project has no dashboards");
  return { root, config, pack, metrics, sources, dashboards, defaultDashboard };
}

export function dashboardMetrics(dashboard) {
  const keys = new Set();
  for (const kpi of dashboard.kpis) keys.add(kpi.metric);
  for (const section of dashboard.sections) {
    for (const panel of section.panels) {
      if (panel.kind === "chart") for (const series of panel.series) keys.add(series.metric);
      if (panel.kind === "status") keys.add(panel.metric);
    }
  }
  return [...keys];
}

export async function writeJson(file, value) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
