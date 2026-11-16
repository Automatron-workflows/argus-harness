import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const site = resolve("output/site");
await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
await cp(resolve("demo"), resolve(site, "demo"), { recursive: true });
await cp(resolve("src"), resolve(site, "src"), { recursive: true });
await cp(resolve("packs"), resolve(site, "packs"), { recursive: true });
await cp(resolve("LICENSE"), resolve(site, "LICENSE"));
await writeFile(
  resolve(site, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0; url=./demo/"><link rel="canonical" href="./demo/"><title>Argus Harness</title></head><body><p><a href="./demo/">Open the Argus Harness workshop</a></p></body></html>\n`,
);
console.log(`Built ${site}`);
