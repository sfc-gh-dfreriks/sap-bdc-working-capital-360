# SAP Working Capital 360 — Working Capital Insights

A self-contained Snowflake Native App that runs the **SAP BDC Working Capital 360**
Working Capital Insights dashboard (React + Express) on Snowpark Container Services.

## What's inside

- **Interactive dashboard** — Ask Cortex, Working Capital Overview (DSO / DPO / DIO /
  CCC), Cash & Liquidity, Accounts Receivable, Accounts Payable, Early Payment & SCF,
  Inventory, WC Opportunities, BDC Sources & Lineage.
- **Bundled data** — AR, AP, KPI, inventory, cash and opportunity data is packaged
  with the app (no external references). Runs immediately after install.
- **Ask Cortex** — the first page, plus an "Ask Cortex about <page>" button on each
  data page. The app gathers live facts from its bundled data and asks Cortex
  `AI_COMPLETE` (model `claude-sonnet-4-5`) for a short analysis.
- **Ask the Agent** — Cortex Analyst over the bundled **`SAP_WORKING_CAPITAL_360_ANALYTICS`**
  semantic view — the same model behind the account-level **`SAP_WORKING_CAPITAL_ANALYST`**
  Cortex Agent.

## Install

1. Grant the requested account privileges (CREATE COMPUTE POOL, BIND SERVICE
   ENDPOINT, CREATE WAREHOUSE).
2. Activate the app — the version initializer creates the compute pool,
   warehouse, and the `WORKING_CAPITAL_360_SERVICE` container service.
3. Launch from the default web endpoint.

## Cortex access

Ask the Agent (Cortex Analyst) and Ask Cortex (`AI_COMPLETE`) need Cortex AI in this
account. If Cortex is not usable, grant the app `SNOWFLAKE.CORTEX_USER`; if the model is not
in this region, an ACCOUNTADMIN can enable cross-region inference
(`ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION'`). Without Cortex, Ask Cortex
shows "not available in this installation" and the dashboards keep working.
## Working Capital Insights coverage

Aligned to SAP Working Capital Insights: DSO, DPO, DIO and cash conversion cycle by
company, AR aging and collections, AP discipline and discounts, SAP Taulia-style early
payment and supply chain finance, inventory against target, and a cash release plan.

## Install

1. Grant the requested account privileges (CREATE COMPUTE POOL, BIND SERVICE
   ENDPOINT, CREATE WAREHOUSE).
2. Activate the app — the version initializer creates the compute pool,
   warehouse, and the `WORKING_CAPITAL_360_SERVICE` container service.
3. Launch from the default web endpoint.

## Cortex access

Ask the Agent (Cortex Analyst) and Ask Cortex (`AI_COMPLETE`) need Cortex AI in this
account. If Cortex is not usable, grant the app `SNOWFLAKE.CORTEX_USER`; if the model is not
in this region, an ACCOUNTADMIN can enable cross-region inference
(`ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION'`). Without Cortex, Ask Cortex
shows "not available in this installation" and the dashboards keep working.
