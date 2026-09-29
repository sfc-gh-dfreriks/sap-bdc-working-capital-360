# SAP Working Capital 360 — Working Capital Insights

A self-contained Snowflake Native App that runs the **SAP BDC Working Capital 360**
Working Capital Insights dashboard (React + Express) on Snowpark Container Services.

## What's inside

- **Interactive dashboard** — Spend Overview, Categories, Suppliers, **Supplier
  Risk**, **Sustainability & Diversity**, **Savings Pipeline**, Contract
  Compliance, Purchase Orders.
- **Bundled data** — All spend, supplier-risk, ESG, category-hierarchy and
  savings data is packaged with the app (no external references). Runs
  immediately after install.
- **Ask the Agent** — Cortex Analyst over the bundled **`SAP_WORKING_CAPITAL_360_ANALYTICS`**
  semantic view — the same model behind the account-level **`SAP_WORKING_CAPITAL_ANALYST`**
  Cortex Agent.

## Working Capital Insights coverage

Aligned to SAP Working Capital Insights: total spend visibility, supplier **risk**
(financial/geo/compliance, single-source), **ESG & diversity** (sustainable and
diverse spend), category **taxonomy** (direct/indirect, addressable), and a
**savings pipeline** (levers, status, realized vs identified).

## Install

1. Grant the requested account privileges (CREATE COMPUTE POOL, BIND SERVICE
   ENDPOINT, CREATE WAREHOUSE).
2. Activate the app — the version initializer creates the compute pool,
   warehouse, and the `WORKING_CAPITAL_360_SERVICE` container service.
3. Launch from the default web endpoint.

## Cortex access

Grant the app `SNOWFLAKE.CORTEX_USER` so the "Ask the Agent" page can call
Cortex Analyst.
