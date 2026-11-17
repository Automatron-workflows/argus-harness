# Argus reference

The 35 standard metric definitions from the preserved 20 October 2026 Argus
export, with the real units, aggregations, null policies, owners and targets.
The catalog is metadata only.

The source fetches the public preserved snapshot from the Upswitch case study in
the portfolio:

```sh
node ../bin/argus-harness.mjs doctor --project .
node ../bin/argus-harness.mjs render --project . --out output/argus.html
node ../bin/argus-harness.mjs audit --project . --out output/argus-evidence.json --now 2026-10-21T12:00:00.000Z
node ../bin/argus-harness.mjs looker --project . --out output/looker
```

`doctor` is offline and validates the catalog, source and dashboard. `render` and
`audit` fetch the public snapshot; they need network access. The source declares
a preserved status and a one-year freshness budget because it is an archive, not
a live dashboard.

No Upswitch rows, credentials, customer identities or private drilldowns are
stored in this repository. The public snapshot is the same aggregate already
published with the portfolio case study. A rendered copy is hosted with the
portfolio:
<https://matthias-mandiau-portfolio.lovable.app/case-studies/upswitch/argus-results/harness.html>.

Placeholder unit-economics metrics stay unavailable rather than becoming zero.
