import test from "node:test";
import assert from "node:assert/strict";
import { bigQueryDdl, fieldsReadme, lookerFields, lookerFieldsCsv, lookerReadme } from "../src/looker.mjs";
import { loadProject } from "../src/project.mjs";

const project = await loadProject("examples/starter");

test("BigQuery DDL includes the catalog, daily rows, latest and health views", () => {
  const sql = bigQueryDdl(project.metrics);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS metric_catalog/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS metric_daily/);
  assert.match(sql, /CREATE OR REPLACE VIEW v_metric_latest/);
  assert.match(sql, /CREATE OR REPLACE VIEW v_metric_daily/);
  assert.match(sql, /CREATE OR REPLACE VIEW v_metric_health/);
  assert.match(sql, /mrr_eur/);
  assert.match(sql, /metric_date/);
  assert.doesNotMatch(sql, /undefined/);
});

test("Looker Studio field map carries labels, units and aggregation", () => {
  const fields = lookerFields(project.metrics);
  assert.equal(fields.length, 10);
  const mrr = fields.find((field) => field.name === "mrr_eur");
  assert.equal(mrr.label, "Monthly recurring revenue");
  assert.equal(mrr.semanticType, "CURRENCY_EUR");
  assert.equal(mrr.aggregation, "LATEST");
  const csv = lookerFieldsCsv(project.metrics);
  assert.match(csv, /^field,label,type,semantic_type,default_aggregation,unit,direction,description/);
  assert.match(csv, /mrr_eur,Monthly recurring revenue/);
  assert.match(lookerReadme("Harbour"), /not an\s+automatic Looker Studio connector/);
  const generic = fieldsReadme("Harbour");
  assert.match(generic, /Connect Looker Studio to your warehouse/);
  assert.doesNotMatch(generic, /Apply `bigquery\.sql`/);
});
