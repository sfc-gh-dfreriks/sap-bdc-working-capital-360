# SAP BDC Working Capital 360

A reference implementation of an SAP **Working Capital Insights**–style application on Snowflake, built on SAP Business Data Cloud (BDC) data products shared zero-copy via **BDC Connect for Snowflake**. It follows the same pattern as the Finance, Spend, Sales, People and Supply Chain 360 apps.

> **KPI glossary.** **DSO**, Days Sales Outstanding: how long customers take to pay. **DPO**, Days Payables Outstanding: how long we take to pay suppliers. **DIO**, Days Inventory Outstanding: how long stock sits before it is sold. **CCC**, Cash Conversion Cycle = DSO + DIO − DPO: the number of days cash is tied up between paying suppliers and collecting from customers. Lower is better.

- **Pages:** Working Capital Overview (DSO / DPO / DIO / CCC), Cash & Liquidity (bank balances and a 13-week forecast), Accounts Receivable (aging, overdue, disputes, dunning), Accounts Payable (DPO, on-time rate, discounts captured and lost), Early Payment & Supply Chain Finance, Inventory, Working Capital Opportunities, BDC Sources & Lineage, and Ask the Agent.
- **Early-payment levers:** the Early Payment & Supply Chain Finance page models SAP Taulia–style dynamic discounting and supply chain finance (SCF).

## Live
- **Public demo (static, GitHub Pages):** https://sfc-gh-dfreriks.github.io/working-capital-360-public/
- **Native App (US, SPCS):** https://eszht4-sfsenorthamerica-dfreriks-aws1-w2.snowflakecomputing.app (`WORKING_CAPITAL_360_APP`, internal listing `WORKING_CAPITAL_360_ORG`; access role `WORKING_CAPITAL_360_APP_USERS`). EMEA / APAC: not yet deployed.
- **Docs:** `docs/ARCHITECTURE.md`, `docs/INSTALL.md`, `docs/DEMO_GUIDE.md`, `docs/USE_CASES.md`, `docs/SAP_Working_Capital_360_Demo_Guide.pptx`

## Architecture (medallion)

```
L0  SAP_BDC_DEMO_*  (BDC Connect zero-copy shares: Entry View Journal Entry, Supplier Invoice,
                     Billing Document, Payment Terms, Collections, Dispute Case, Promise To Pay,
                     Cash Flow, Bank Account, House Bank, Physical Inventory Document)
L1  SAP_WORKING_CAPITAL_360.SAP_BDC_L1   passthrough views
L2  SAP_WORKING_CAPITAL_360.ANALYTICS    DT_AR_ITEMS, DT_AP_ITEMS, DT_MONTHLY_FLOWS, DT_INVENTORY_MONTHLY,
                                         DT_WC_MONTHLY_KPI, DT_CASH_FORECAST (dynamic tables),
                                         DT_BANK_BALANCE_WEEKLY, DIM_*, V_WC_OPPORTUNITIES
SEM SAP_WORKING_CAPITAL_360.SEMANTIC.SAP_WORKING_CAPITAL_360_ANALYTICS  (semantic view)
AI  SAP_WORKING_CAPITAL_360.AGENTS.SAP_WORKING_CAPITAL_ANALYST          (Cortex Agent)
APP React + Express (working_capital_360_react, 3010/5185) → SPCS Native App WORKING_CAPITAL_360_APP
```

**Data honesty:**
- **Real BDC data:** AR and AP invoices, amounts and dates come from real BDC journal lines. AR invoices are the customer debit lines of Entry View Journal Entry; AP invoices are the supplier credit lines.
- **Demo enrichment:** these fields are filled deterministically and flagged `IS_DEMO_ENRICHMENT`:
  - payment terms and payment behaviour
  - early-pay programs
  - inventory
  - bank balances
  - partner names

  The demo tenant leaves the due, clearing and terms fields empty, which is why they are enriched. See `sql/01_l0_sources.md`.
- **Currency:** all KPI amounts are in USD at fixed illustrative FX rates.
- **Known effect:** AP volume in the tenant is about 3× AR, so net working capital is negative.

## Deploy (US, `dfreriksdemo`)

```bash
python3 scripts/run_sql.py sql/02_l1_curated_views.sql
python3 scripts/run_sql.py sql/03_l2_analytics_enrichment.sql
python3 scripts/run_sql.py sql/04_semantic_view.sql
python3 scripts/run_sql.py sql/05_cortex_agent.sql
# Native App
python3 scripts/migrate_data.py --target dfreriksdemo --mode local --warehouse LOAD_WH
bash scripts/build_and_push.sh          # builds service/app (React + Express) image working_capital_360:latest
python3 scripts/deploy_native_app.py    # WORKING_CAPITAL_360_PKG → WORKING_CAPITAL_360_APP
python3 scripts/create_org_listing.py   # WORKING_CAPITAL_360_ORG (internal marketplace)
```

`scripts/run_sql.py` uses the key-pair entry in `~/.snowflake/connections.toml`. It works around a stale `snow` CLI session cache.

## Related folders
- `../working_capital_360_react`: local dev app (server 3010, client 5185)
- `../working-capital-360-public`: static GitHub Pages build
- `~/Documents/SAP/Working_Capital_360_Presales_Kit`: presales deliverables (`tools/build_*.py`)
