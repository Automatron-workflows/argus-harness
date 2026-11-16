# Harbour metrics

A small Argus Harness project. The rows are fictional.

- `metrics/` defines ten metric contracts.
- `dashboards/growth.json` selects the KPIs, charts and sections.
- `sources/static.json` reads `data/snapshot.json`.
- `argus.config.json` lists the folders.

From this folder, with the harness checked out:

```sh
node ../argus-harness/bin/argus-harness.mjs doctor --project .
node ../argus-harness/bin/argus-harness.mjs render --project . --out output/dashboard.html
node ../argus-harness/bin/argus-harness.mjs audit --project . --out output/evidence.json
node ../argus-harness/bin/argus-harness.mjs looker --project . --out output/looker
```

Replace `data/snapshot.json` with your own measured rows. Keep the metric keys,
units, aggregation and null policy stable. A missing day is a gap, never a zero.
