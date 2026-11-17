import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const run = promisify(execFile);
const bin = resolve("bin/argus-harness.mjs");

test("init, doctor, render, audit and looker work from an empty directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "argus-harness-"));
  try {
    const init = await run(process.execPath, [bin, "init", dir]);
    assert.match(init.stdout, /Created/);
    assert.ok((await stat(join(dir, "argus.config.json"))).isFile());
    assert.ok((await stat(join(dir, ".argus-harness", "START_HERE.md"))).isFile());

    const doctor = await run(process.execPath, [bin, "doctor", "--project", dir]);
    assert.match(doctor.stdout, /ok\s+metrics\s+10/);
    assert.match(doctor.stdout, /ok\s+dashboards\s+1/);

    const catalog = await run(process.execPath, [bin, "catalog", "--project", dir]);
    assert.match(catalog.stdout, /mrr_eur/);

    const render = await run(process.execPath, [bin, "render", "--project", dir, "--out", join(dir, "dashboard.html")]);
    assert.match(render.stdout, /Rendered growth/);
    const html = await readFile(join(dir, "dashboard.html"), "utf8");
    assert.match(html, /Owner growth/);
    assert.match(html, /data-ah-dashboard="growth"/);

    const audit = await run(process.execPath, [bin, "audit", "--project", dir, "--out", join(dir, "evidence.json")]);
    assert.match(audit.stdout, /pass/);
    const evidence = JSON.parse(await readFile(join(dir, "evidence.json"), "utf8"));
    assert.equal(evidence.schema, "argus.evidence/1");
    assert.equal(evidence.summary.fail, 0);

    const looker = await run(process.execPath, [bin, "looker", "--project", dir, "--out", join(dir, "looker")]);
    assert.match(looker.stdout, /bigquery.sql/);
    assert.match(await readFile(join(dir, "looker", "bigquery.sql"), "utf8"), /metric_catalog/);
    assert.match(await readFile(join(dir, "looker", "looker-fields.csv"), "utf8"), /mrr_eur/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the warehouse template loads and a source override changes the provider", async () => {
  const warehouse = await mkdtemp(join(tmpdir(), "argus-warehouse-init-"));
  const starter = await mkdtemp(join(tmpdir(), "argus-source-override-"));
  try {
    const init = await run(process.execPath, [bin, "init", warehouse, "--template", "warehouse"]);
    assert.match(init.stdout, /\(warehouse\)/);
    const doctor = await run(process.execPath, [bin, "doctor", "--project", warehouse]);
    assert.match(doctor.stdout, /ok\s+sources\s+7/);
    assert.match(doctor.stdout, /athena\s+·\s+aws/);
    assert.match(doctor.stdout, /snowflake\s+·\s+snowsql/);
    const local = await run(process.execPath, [bin, "audit", "--project", warehouse, "--source", "custom-local", "--now", "2026-11-15T12:00:00.000Z"]);
    assert.match(local.stdout, /0 fail/);

    await run(process.execPath, [bin, "init", starter]);
    const alternate = JSON.parse(await readFile(join(starter, "data", "snapshot.json"), "utf8"));
    alternate.source = "alternate";
    await writeFile(join(starter, "data", "alternate.json"), JSON.stringify(alternate));
    await writeFile(
      join(starter, "sources", "alternate.json"),
      JSON.stringify({
        schema: "argus.source/1",
        id: "alternate",
        label: "Alternate snapshot",
        description: "A second static source for the override test.",
        kind: "static-json",
        freshnessHours: 8760,
        config: { path: "data/alternate.json" },
      }),
    );
    const render = await run(process.execPath, [bin, "render", "--project", starter, "--source", "alternate", "--out", join(starter, "alternate.html")]);
    assert.match(render.stdout, /Rendered growth/);
    const audit = await run(process.execPath, [bin, "audit", "--project", starter, "--source", "alternate", "--out", join(starter, "alternate-evidence.json")]);
    assert.match(audit.stdout, /pass/);
    const evidence = JSON.parse(await readFile(join(starter, "alternate-evidence.json"), "utf8"));
    assert.equal(evidence.source, "alternate");
    assert.equal(evidence.summary.fail, 0);
  } finally {
    await Promise.all([
      rm(warehouse, { recursive: true, force: true }),
      rm(starter, { recursive: true, force: true }),
    ]);
  }
});

test("an unknown command explains the failure", async () => {
  try {
    await run(process.execPath, [bin, "nope"]);
    assert.fail("expected a non-zero exit");
  } catch (error) {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Unknown command/);
  }
});
