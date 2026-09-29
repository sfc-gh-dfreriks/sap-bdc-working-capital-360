# Architecture — SAP BDC Working Capital 360 (Working Capital Insights)

Working Capital 360 is built on a **medallion architecture** inside Snowflake. It reads SAP
finance data through **SAP Business Data Cloud (BDC) Connect for Snowflake** zero-copy
shares and turns it into a **Working Capital Insights** model covering DSO, DPO, DIO,
the cash conversion cycle, liquidity, and SAP Taulia early-payment levers. There is no ETL,
no copy, and the SAP business context is preserved.

> **KPI glossary.** **DSO**, Days Sales Outstanding: how long customers take to pay. **DPO**, Days Payables Outstanding: how long we take to pay suppliers. **DIO**, Days Inventory Outstanding: how long stock sits before it is sold. **CCC**, Cash Conversion Cycle = DSO + DIO − DPO: the number of days cash is tied up between paying suppliers and collecting from customers. Lower is better.

```
 SAP S/4HANA (FI-AR / FI-AP / Cash / MM)     SAP Business Data Cloud
 (source of record)  ─────  Journal Entry · Supplier Invoice · Cash Flow  ─────►  Snowflake
                                         (BDC Connect, zero-copy)
                                                                │
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  L0  BRONZE  — SAP_BDC_DEMO_* BDC Connect shares (11 data products)        │
 │      Entry View Journal Entry · Supplier Invoice · Billing Document ·      │
 │      Payment Terms · Collections Worklist · Dispute Case · Promise To Pay ·│
 │      Cash Flow · Bank Account · House Bank · Physical Inventory Document   │
 └──────────────────────────────────────────────────────────────────────────┘
                                                                │  (views)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  L1  SILVER  — SAP_WORKING_CAPITAL_360.SAP_BDC_L1 (14 passthrough views)   │
 └──────────────────────────────────────────────────────────────────────────┘
                                                                │  (curate + enrich)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  L2  GOLD  — SAP_WORKING_CAPITAL_360.ANALYTICS                             │
 │      DT_AR_ITEMS            AR invoices (customer debit lines), aging,     │
 │                             disputes, dunning, promise to pay              │
 │      DT_AP_ITEMS            AP invoices (supplier credit lines), terms,    │
 │                             early-pay program, discounts captured/lost     │
 │      DT_MONTHLY_FLOWS       monthly revenue / COGS / purchases            │
 │      DT_INVENTORY_MONTHLY   inventory value and DIO by category           │
 │      DT_WC_MONTHLY_KPI      DSO · DPO · DIO · CCC · NWC per company/month  │
 │      DT_CASH_FORECAST       13-week receipts / outflows forecast          │
 │      DT_BANK_BALANCE_WEEKLY, DIM_* , V_WC_OPPORTUNITIES, LINEAGE_COUNTS    │
 └──────────────────────────────────────────────────────────────────────────┘
                                                                │
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  SEMANTIC — SAP_WORKING_CAPITAL_360_ANALYTICS (AR, AP, WC_KPI, INVENTORY,  │
 │             CASH_FORECAST · 34 dimensions · 24 facts · 21 metrics)         │
 └──────────────────────────────────────────────────────────────────────────┘
              │                                        │
              ▼                                        ▼
   SAP_WORKING_CAPITAL_ANALYST agent        Native App "Ask the Agent"
   (Snowflake Intelligence)                 (Cortex Analyst in-app)
                                                        │
                                            React + Express on SPCS
```

The six `DT_*` flow tables are dynamic tables (target lag 1 day or DOWNSTREAM), so the model
refreshes by itself as BDC data changes.

## Working Capital Insights alignment (SAP)

| SAP Working Capital Insights / Taulia lever | Where it lives |
|---------------------------------------------|----------------|
| DSO, DPO, DIO, CCC (Cash Conversion Cycle = DSO + DIO − DPO) | `DT_WC_MONTHLY_KPI` |
| Receivables: aging, overdue, disputes, collections | `DT_AR_ITEMS` |
| Payables: DPO, on-time rate, discounts captured and lost | `DT_AP_ITEMS` |
| Dynamic discounting, supply chain finance, Flexible Funding | `DT_AP_ITEMS.EARLY_PAY_PROGRAM` |
| AR finance / collections levers | `V_WC_OPPORTUNITIES` (Reduce DSO) |
| Inventory optimization | `DT_INVENTORY_MONTHLY` (DIO vs target) |
| Liquidity and cash forecasting | `DT_BANK_BALANCE_WEEKLY`, `DT_CASH_FORECAST` |
| AI / semantic / KPIs | `SAP_WORKING_CAPITAL_360_ANALYTICS` + `SAP_WORKING_CAPITAL_ANALYST` |

Snowflake adds what SAP alone does not: BDC data is joined with non-SAP data (bank balances,
funding programs, market data) in one governed place. The Cortex Agent answers questions over
that data, and the Native App distributes it to other accounts.

## Data honesty

- **Real BDC data:** AR and AP invoices, amounts and dates are real BDC Entry View Journal
  Entry lines. Customer debit lines become AR and supplier credit lines become AP, across
  3 company codes from 2023-03 to 2025-03.
- **Demo enrichment (`IS_DEMO_ENRICHMENT`):** payment terms, payment behaviour, early-pay
  programs, inventory, bank balances and partner names. The demo tenant leaves the due,
  clearing and terms fields empty, so these values are filled deterministically.
- **Currency:** amounts are in USD at fixed illustrative FX rates (EUR 1.08, JPY 0.0067).
- **Negative NWC:** AP volume in the demo tenant is about 3× AR, so net working capital is negative.

In production, SAP BDC and the SAP Taulia platform supply these values.

## Native App packaging

The app bundles 13 L2 objects into the package `SHARED_DATA` schema (no consumer
references). It rebuilds an in-app copy of `SAP_WORKING_CAPITAL_360_ANALYTICS` over
`APP_DATA`. The React client and Express server run on SPCS (endpoint `wc360`, port 8080).
See [`app/`](../app) and [`INSTALL.md`](INSTALL.md).
