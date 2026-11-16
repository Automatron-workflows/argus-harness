# Contributing

Small, reproducible contributions are welcome.

## Useful contributions

- A source adapter with a tested failure path and no credentials.
- A metric definition failure: two dashboards that disagree, a rolled-up
  percentage, a cumulative reset, a missing day rendered as zero.
- A renderer bug at 320–390px or with a long label.
- A Looker Studio mismatch between a catalog field and the generated schema.
- A clearer audit message that names the metric and the consequence.

## Rules

- Add a test for every validator rule, adapter, audit check or renderer state.
- Do not commit credentials, private URLs, customer rows or provider tokens.
- Use fictional data in examples and the demo.
- Keep the renderer dependency-free. Prefer semantic HTML and SVG.
- Do not claim a measured saving, accuracy or completeness from a harness run.
- Run `npm test` and `npm run check` before opening a pull request.
- Keep the diff focused; do not reformat unrelated files.

## A source adapter

Add the config validator, the loader branch, the failure behavior and a test. The
row shape is:

```js
{ metric_key, metric_date, value, source?, computed_at? }
```

A failed read must produce an `unavailable` snapshot, not zero rows.

## A metric definition

Change the catalog, increment `version` when the meaning changes, update the
fixtures and run the audit. Explain the old and new meaning in the pull request.
