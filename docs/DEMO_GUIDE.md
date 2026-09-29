# Demo Guide — SAP BDC Working Capital 360 (Working Capital Insights)

A ~10-minute flow showing how Snowflake × SAP Business Data Cloud turns SAP receivables,
payables and cash data into a live, AI-powered **Working Capital Insights** app. The full
deck, with presenter notes, is [`SAP_Working_Capital_360_Demo_Guide.pptx`](SAP_Working_Capital_360_Demo_Guide.pptx).

## The story in one line
The CFO asks: *"Why did our cash conversion cycle grow year over year?"* The app answers
from governed SAP BDC data shared zero-copy. It then shows the SAP Taulia levers that would
release the cash.

## The numbers (March 2025 vs March 2024)
- **CCC (Cash Conversion Cycle = DSO + DIO − DPO):** 58.7 days, up from 54.0 (**+4.7 days**).
- **DPO (Days Payables Outstanding)** fell from 50.0 to 44.5, the biggest driver.
  **DSO (Days Sales Outstanding)** improved from 48.1 to 46.3. **DIO (Days Inventory Outstanding)** rose from 55.9 to 56.9.
- **Japan Operations** has the highest CCC (66.0 days) and the highest DIO (62.6).
- **Discounts lost** in the latest month: USD 30.1K, against USD 19.0K captured.
- **Opportunities:** USD 3.0M of cash release and USD 261K of P&L impact. Most of the cash
  release is from extending DPO with supply chain finance.

## 10-minute flow
1. **Open the app.** No setup is needed; the data is already inside (bundled Native App).
2. **Working Capital Overview.** Show DSO, DPO, DIO and CCC by company, and the +4.7-day CCC increase.
3. **Accounts Payable.** DPO shortened: suppliers are being paid earlier, with discounts lost.
4. **Early Payment & SCF.** Show dynamic discounting (10.2% effective APR) and supply chain finance funding.
5. **Accounts Receivable.** Show aging, overdue AR (13.6% of open AR) and disputes, and the top overdue customers.
6. **Inventory.** Show DIO against target by category; Spare Parts & MRO is the slowest.
7. **Cash & Liquidity.** Show USD 18.4M in bank balances and the 13-week forecast.
8. **WC Opportunities.** Show cash release by lever and company.
9. **Ask the Agent.** Ask `SAP_WORKING_CAPITAL_ANALYST` live:
   - "Why did CCC increase in Japan Operations in 2025?"
   - "How much discount did we lose by program?"
   - "Which customers have the most overdue AR?"
10. **BDC Sources & Lineage + recap.** Show the 11 BDC data products → 14 L1 views → L2 → app. Recap: zero-ETL, governed, AI-ready, one-click distribution.

## Key points to land
- The AR and AP invoices are **real SAP BDC journal entry lines**, already in Snowflake with no ETL.
- SAP Working Capital Insights KPIs sit side by side with SAP Taulia levers (dynamic discounting,
  supply chain finance, Flexible Funding, AR finance).
- Snowflake joins SAP and non-SAP data (bank balances, funding programs) in one governed place.
- `SAP_WORKING_CAPITAL_ANALYST` answers live, in plain English, with governed SQL.

## Where to run it
- **Native App (US):** https://eszht4-sfsenorthamerica-dfreriks-aws1-w2.snowflakecomputing.app
  (role `WORKING_CAPITAL_360_APP_USERS`).
- **Public demo, no login:** https://sfc-gh-dfreriks.github.io/working-capital-360-public/
- **Local:** `working_capital_360_react` → `npm run dev` (http://localhost:5185).

## Do / Don't
- **Do** focus on AP and Early Payment & SCF. The DPO drop is the main reason CCC grew, and the Taulia levers fix it.
- **Don't** pre-load canned answers or dwell on architecture or SQL.
- **Be honest about the data.** AR/AP invoices, amounts and dates are real BDC Entry View
  Journal Entry lines. Payment terms and behaviour, early-pay programs, inventory, bank balances and
  partner names are demo enrichment (`IS_DEMO_ENRICHMENT`). USD uses fixed illustrative FX
  (EUR 1.08, JPY 0.0067). NWC is negative because AP is about 3× AR in the demo tenant.
