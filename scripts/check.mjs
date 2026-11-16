import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["--test", "test/core.test.mjs", "test/sources.test.mjs", "test/looker.test.mjs", "test/cli.test.mjs"]);
run(["scripts/build-demo.mjs"]);
run(["bin/argus-harness.mjs", "doctor", "--project", "examples/starter"]);
run(["bin/argus-harness.mjs", "audit", "--project", "examples/starter", "--out", "output/evidence.json", "--now", "2026-11-15T12:00:00.000Z"]);
for (const file of [
  "output/site/index.html",
  "output/site/demo/index.html",
  "output/site/src/render.mjs",
  "output/site/packs/aurora/pack.json",
]) {
  await access(resolve(file));
}
console.log("Argus Harness check passed.");
