import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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

test("an unknown command explains the failure", async () => {
  try {
    await run(process.execPath, [bin, "nope"]);
    assert.fail("expected a non-zero exit");
  } catch (error) {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Unknown command/);
  }
});
