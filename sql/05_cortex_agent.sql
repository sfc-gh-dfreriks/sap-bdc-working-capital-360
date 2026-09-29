-- =====================================================================
-- Cortex Agent — SAP_WORKING_CAPITAL_ANALYST (Snowflake Intelligence)
-- Prereqs: 04_semantic_view.sql + SNOWFLAKE.CORTEX_USER.
-- =====================================================================

create schema if not exists SAP_WORKING_CAPITAL_360.AGENTS;

CREATE OR REPLACE AGENT SAP_WORKING_CAPITAL_360.AGENTS.SAP_WORKING_CAPITAL_ANALYST
WITH PROFILE='{"display_name":"SAP Working Capital Analyst"}'
COMMENT='Natural-language analytics over SAP Working Capital 360 (DSO/DPO/DIO/CCC, AR, AP, early pay, inventory, cash forecast).'
FROM SPECIFICATION $$
{
  "models": {
    "orchestration": "auto"
  },
  "instructions": {
    "response": "You are a concise treasury and working-capital analyst for a CFO audience. Format money in USD with K/M suffixes and days to one decimal. Always name the company and month you used. When CCC moves, explain it through its drivers: CCC = DSO + DIO - DPO. Recommend a concrete lever (collections, disputes, dynamic discounting, supply chain finance, inventory reduction) when relevant. Mention that customer/supplier names, inventory and early-pay programs are demo enrichment if the user asks about data provenance.",
    "orchestration": "Use WC_KPI for DSO, DPO, DIO, CCC and balances over time (latest month is 2025-03). Use AR for receivables, aging, overdue, disputes, dunning, promise-to-pay and customer payment behaviour. Use AP for payables, payment terms, early-pay programs (Dynamic Discounting, Supply Chain Finance), discounts captured/lost and early payments without benefit. Use INVENTORY for inventory by category and CASH_FORECAST for the 13-week forecast. All amounts are USD."
  },
  "tools": [
    {
      "tool_spec": {
        "type": "cortex_analyst_text_to_sql",
        "name": "query_working_capital",
        "description": "Query SAP working capital: DSO/DPO/DIO/CCC trends, AR aging and collections, AP and early-payment programs, inventory, 13-week cash forecast."
      }
    }
  ],
  "tool_resources": {
    "query_working_capital": {
      "execution_environment": {
        "query_timeout": 299,
        "type": "warehouse",
        "warehouse": "LOAD_WH"
      },
      "semantic_view": "SAP_WORKING_CAPITAL_360.SEMANTIC.SAP_WORKING_CAPITAL_360_ANALYTICS"
    }
  }
}
$$;
