# Argus Harness working context

This repository is the reusable metric harness extracted from Argus. Read
`docs/PRIMITIVES.md` and `docs/ARCHITECTURE.md` before changing the contracts.
Read `docs/ARGUS-AUDIT.md` for the source-to-primitive mapping.

## Default approach

1. Start with the metric definition, not the chart. A key without a unit,
   aggregation, null policy, owner and version is incomplete.
2. Keep a missing observation missing. Never fill a calendar gap with zero.
   `null` means unavailable; `0` means a measured zero.
3. Keep one source adapter boundary. Adapters return measured rows and an
   explicit source status; the renderer and audit do not know the provider.
4. Keep the renderer dependency-free and static. It must be usable in a browser,
   a CI artifact and a printed page.
5. Put honesty checks in the audit, not in a caption. A warning must name the
   metric and the consequence.
6. Do not put credentials, private URLs, account IDs or customer rows in the
   repository, demo or release assets. The demo uses fictional Harbour data.
7. Do not claim measured performance, accuracy, savings or completeness from a
   harness run. A passing audit covers the declared checks and supplied rows only.
8. When a metric definition changes, version it and review every snapshot,
   dashboard and Looker export that consumes it.

## Boundaries

- This is a presentation and contract layer. Authentication, authorization and
  source credentials stay with the host application.
- The BigQuery adapter shells out to the caller's `bq` CLI. It does not create
  infrastructure or manage Google Cloud credentials.
- The Looker bridge writes SQL and a field map. It does not call the Looker
  Studio API or deploy a connector.
- The browser demo imports only `src/`, `packs/` and `demo/`; it has no server
  route or secret access.

## Verification

Run `npm test` and `npm run check`. Add a test for every new validator rule,
adapter shape, audit check or renderer state. Inspect the workshop at 390px and
1440px after a visual change. Record actual results and remaining uncertainty in
`docs/VERIFICATION.md`; do not describe a plan as a verified result.
