# Use Cases — SAP BDC Working Capital 360

> Working capital intelligence over SAP BDC finance data products: DSO, DPO, DIO, cash conversion cycle, liquidity, and SAP Taulia early-payment levers.

- **App:** working_capital_360_react (React, server 3010 / client 5185)
- **Semantic view:** `SAP_WORKING_CAPITAL_360.SEMANTIC.SAP_WORKING_CAPITAL_360_ANALYTICS`
- **Analytics tables:** DT_WC_MONTHLY_KPI, DT_AR_ITEMS, DT_AP_ITEMS, DT_INVENTORY_MONTHLY, DT_CASH_FORECAST, V_WC_OPPORTUNITIES
- **Catalog audited:** 2026-09-28. Each use case maps to an existing app page and to fields in the semantic view or API.

| # | Use case | Persona | App page |
|---|---|---|---|
| 1 | Cash conversion cycle | CFO | Working Capital Overview |
| 2 | Collections and disputes | Credit & collections manager | Accounts Receivable |
| 3 | Payables discipline | AP manager | Accounts Payable |
| 4 | Early payment and supply chain finance | Treasurer / procurement | Early Payment & SCF |
| 5 | Inventory optimization | Supply chain / controller | Inventory |
| 6 | Liquidity and 13-week cash | Treasurer | Cash & Liquidity |
| 7 | Cash release plan | CFO / finance transformation | WC Opportunities |
| 8 | Working capital copilot | Any finance user | Ask the Agent (Cortex Agent) |

## 1. Cash conversion cycle

- **Persona:** CFO
- **Business question:** Why did our CCC (Cash Conversion Cycle = DSO + DIO − DPO) grow year over year, and in which company?
- **Where in the app:** Working Capital Overview
- **Data used:** DSO, DPO, DIO, CCC, NET_WORKING_CAPITAL_USD, COMPANY, MONTH
- **Ask the agent:**
  - "Why did CCC increase in Japan Operations in 2025?"
  - "What is DSO, DPO and DIO by company for the latest month?"
- **Value:** Pinpoints which lever (receivables, payables or inventory) is tying up cash.

## 2. Collections and disputes

- **Persona:** Credit & collections manager
- **Business question:** Which customers are overdue or in dispute, and how old is the debt?
- **Where in the app:** Accounts Receivable
- **Data used:** AGING_BUCKET, CREDIT_RISK, IS_DISPUTED, DUNNING_LEVEL, HAS_PROMISE_TO_PAY, AMOUNT_USD
- **Ask the agent:**
  - "Which customers have the most overdue AR?"
- **Value:** Lowers DSO by prioritizing the collections worklist.

## 3. Payables discipline

- **Persona:** AP manager
- **Business question:** Are we paying suppliers too early, and which balances are largest?
- **Where in the app:** Accounts Payable
- **Data used:** DPO, AP aging bucket, on-time rate, SUPPLIER, open AP
- **Ask the agent:**
  - "Which suppliers have the largest open AP balance?"
- **Value:** Protects DPO without hurting supplier relationships.

## 4. Early payment and supply chain finance

- **Persona:** Treasurer / procurement
- **Business question:** How much discount are we losing, and where would dynamic discounting or SCF pay off?
- **Where in the app:** Early Payment & SCF
- **Data used:** EARLY_PAY_PROGRAM (Dynamic Discounting, Supply Chain Finance, Standard), discounts captured and lost, SCF funded
- **Ask the agent:**
  - "How much discount did we lose by program?"
- **Value:** Captures SAP Taulia-style discounts or extends DPO through funded programs.

## 5. Inventory optimization

- **Persona:** Supply chain / controller
- **Business question:** Which inventory categories exceed their target DIO?
- **Where in the app:** Inventory
- **Data used:** INVENTORY_CATEGORY, VALUE_USD, DIO, TARGET_DIO
- **Ask the agent:**
  - "Which inventory categories exceed their target DIO?"
- **Value:** Releases cash tied up in slow-moving stock.

## 6. Liquidity and 13-week cash

- **Persona:** Treasurer
- **Business question:** What is our bank position, and what is the 13-week net cash forecast?
- **Where in the app:** Cash & Liquidity
- **Data used:** bank balance by house bank, receipts, outflows, net forecast by company and week
- **Ask the agent:**
  - "What is the 13-week net cash forecast by company?"
- **Value:** Spots funding gaps before they happen.

## 7. Cash release plan

- **Persona:** CFO / finance transformation
- **Business question:** How much cash can each lever release, and in which company?
- **Where in the app:** WC Opportunities
- **Data used:** LEVER, AREA, CURRENT_DAYS, TARGET_DAYS, CASH_RELEASE_USD, PNL_IMPACT_USD
- **Ask the agent:**
  - "What is the monthly trend of net working capital?"
- **Value:** Builds a defensible, lever-by-lever working capital program.

## 8. Working capital copilot

- **Persona:** Any finance user
- **Business question:** Ask working capital questions in plain English.
- **Where in the app:** Ask the Agent (Cortex Agent)
- **Data used:** Semantic view SAP_WORKING_CAPITAL_360_ANALYTICS
- **Ask the agent:**
  - "What is DSO, DPO and DIO by company for the latest month?"
- **Value:** Self-service analysis for finance without SQL.

---
Example agent questions are suggested prompts; validate answers in the app before customer demos. Payment terms and behaviour, early-pay programs, inventory, bank balances and partner names are demo enrichment (`IS_DEMO_ENRICHMENT`).
