# Install & Deploy — SAP BDC Working Capital 360

There are two paths:
- **A. Build the data platform** (L0→L1→L2→semantic→agent) for Snowflake Intelligence.
- **B. Deploy the self-contained Native App** and publish it as an org listing across regions.

> **KPI glossary.** **DSO**, Days Sales Outstanding: how long customers take to pay. **DPO**, Days Payables Outstanding: how long we take to pay suppliers. **DIO**, Days Inventory Outstanding: how long stock sits before it is sold. **CCC**, Cash Conversion Cycle = DSO + DIO − DPO: the number of days cash is tied up between paying suppliers and collecting from customers. Lower is better.

B bundles its own data, so the consumer account does not need A.

## Prerequisites
- A Snowflake account with `ACCOUNTADMIN`.
- SAP BDC Connect shares mounted as `SAP_BDC_DEMO_*`. The 11 data products are listed in [`sql/01_l0_sources.md`](../sql/01_l0_sources.md).
- Docker, the `snow` CLI, and an image repository (default `SC360_APP_PROVIDER.IMAGES.REPO`; override with `REPO_PATH`).
- Python 3.11+ with `snowflake-connector-python[pandas]` and `cryptography`.
- Key-pair connections in `~/.snowflake/connections.toml`.

`scripts/run_sql.py` connects with the key-pair entry. Use it instead of `snow sql`,
because it avoids a stale `snow` CLI session cache.

## A. Build the data platform
Run as `ACCOUNTADMIN`, in order:
```bash
python3 scripts/run_sql.py sql/02_l1_curated_views.sql          # L1 SAP_BDC_L1.* (14 views)
python3 scripts/run_sql.py sql/03_l2_analytics_enrichment.sql   # L2 ANALYTICS.* (dynamic tables, DIM_*, opportunities)
python3 scripts/run_sql.py sql/04_semantic_view.sql             # SAP_WORKING_CAPITAL_360_ANALYTICS
python3 scripts/run_sql.py sql/05_cortex_agent.sql              # SAP_WORKING_CAPITAL_ANALYST (grant SNOWFLAKE.CORTEX_USER first)
```
Verify, then chat with `SAP_WORKING_CAPITAL_ANALYST` in Snowflake Intelligence:
```sql
SELECT * FROM SEMANTIC_VIEW(
  SAP_WORKING_CAPITAL_360.SEMANTIC.SAP_WORKING_CAPITAL_360_ANALYTICS
  METRICS AR.DISPUTED_AR
  DIMENSIONS AR.CREDIT_RISK
);
```

## B. Deploy the Native App
Example connections: `dfreriksdemo` (US, deployed), `dfreriks_eu_demo` (EMEA) and
`dfreriks_apac_demo` (APAC). EMEA and APAC are not deployed yet; run the same scripts with
their `--target` to add them.

1. **Build & push the image** (once per region):
```bash
scripts/build_and_push.sh dfreriksdemo       sfsenorthamerica-dfreriks-aws1-w2.registry.snowflakecomputing.com
scripts/build_and_push.sh dfreriks_eu_demo   sfseeurope-dfreriks-eu-demo.registry.snowflakecomputing.com
scripts/build_and_push.sh dfreriks_apac_demo sfseapac-sap-data-product-demo.registry.snowflakecomputing.com
```
2. **Bundle the data** (13 objects into `WORKING_CAPITAL_360_PKG.SHARED_DATA`):
```bash
python3 scripts/migrate_data.py --target dfreriksdemo --mode local --warehouse LOAD_WH
python3 scripts/migrate_data.py --source dfreriksdemo --target dfreriks_eu_demo   --mode remote
python3 scripts/migrate_data.py --source dfreriksdemo --target dfreriks_apac_demo --mode remote
```
3. **Deploy the app** (per account). To patch a deployed app, use `upgrade_native_app.py --target ... --label "..."`:
```bash
python3 scripts/deploy_native_app.py --target dfreriksdemo
python3 scripts/deploy_native_app.py --target dfreriks_eu_demo
python3 scripts/deploy_native_app.py --target dfreriks_apac_demo
```
4. **Publish the org listing** (region-scoped):
```bash
LISTING_CONTACT=you@snowflake.com python3 scripts/create_org_listing.py --target dfreriksdemo       --region PUBLIC.AWS_US_WEST_2
LISTING_CONTACT=you@snowflake.com python3 scripts/create_org_listing.py --target dfreriks_eu_demo   --region PUBLIC.AWS_EU_CENTRAL_1
LISTING_CONTACT=you@snowflake.com python3 scripts/create_org_listing.py --target dfreriks_apac_demo --region PUBLIC.AWS_AP_SOUTHEAST_2
```
Locator: `ORGDATACLOUD$INTERNAL$WORKING_CAPITAL_360_ORG` (US live in `AWS_US_WEST_2`).
US endpoint: https://eszht4-sfsenorthamerica-dfreriks-aws1-w2.snowflakecomputing.app

5. **Grant user access.** Grant the app role to `WORKING_CAPITAL_360_APP_USERS`, then
provision demo users with the `provision-360-access` pattern.

## Native App internals
| Artifact | Purpose |
|----------|---------|
| `app/manifest.yml` | Manifest v2 (image, endpoint `wc360`, privileges) |
| `app/setup.sql` | App roles, `APP_DATA` views over the bundled `SHARED_DATA`, the in-app `SAP_WORKING_CAPITAL_360_ANALYTICS` semantic view, the SPCS service and lifecycle procs |
| `app/service_spec.yml` | SPCS container and endpoint spec (`wc360`, port 8080) |
| `app/snowflake.yml` | Snowflake CLI project (`WORKING_CAPITAL_360_PKG` / `WORKING_CAPITAL_360_APP`) |
| `service/app/` | React (Vite) client, Express server and Dockerfile |

## Local dev and presales kit
- The local app is `../working_capital_360_react` (server 3010, client 5185). Start it with `npm run dev`.
- Kit tools:
  - `tools/wc_facts.py` writes live figures to `/tmp/wc_facts.json`.
  - `tools/capture_shots.py` takes screenshots of the running app.
  - `tools/build_presales_kit.py` and `tools/build_decks.py` build the presales kit and decks.
  - `tools/build_demo_guide.py` builds the demo guide deck.
- Public static demo: https://sfc-gh-dfreriks.github.io/working-capital-360-public/

## Cortex access
```sql
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO APPLICATION WORKING_CAPITAL_360_APP;
```

## Teardown
```sql
DROP APPLICATION WORKING_CAPITAL_360_APP CASCADE;
DROP APPLICATION PACKAGE WORKING_CAPITAL_360_PKG;
DROP LISTING WORKING_CAPITAL_360_ORG;
```
