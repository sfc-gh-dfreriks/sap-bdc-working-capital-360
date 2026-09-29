-- =====================================================================
-- Semantic layer — SAP_WORKING_CAPITAL_360_ANALYTICS
-- AR open items, AP open items (with SAP Taulia-style early-pay program
-- economics), monthly working-capital KPIs (DSO/DPO/DIO/CCC), inventory,
-- 13-week cash forecast. All money columns are USD (fixed illustrative FX).
-- Powers the Native App and the SAP_WORKING_CAPITAL_ANALYST agent.
-- =====================================================================

create schema if not exists SAP_WORKING_CAPITAL_360.SEMANTIC;

create or replace semantic view SAP_WORKING_CAPITAL_360.SEMANTIC.SAP_WORKING_CAPITAL_360_ANALYTICS
  tables (
    AR as SAP_WORKING_CAPITAL_360.ANALYTICS.DT_AR_ITEMS primary key (COMPANY_CODE, FISCAL_YEAR, DOCUMENT_ID)
      with synonyms=('receivables','accounts receivable','customer invoices','AR open items','collections')
      comment='Customer invoices (AR) from SAP BDC Entry View Journal Entry, with due date, clearing, aging and dunning.',
    AP as SAP_WORKING_CAPITAL_360.ANALYTICS.DT_AP_ITEMS primary key (COMPANY_CODE, FISCAL_YEAR, DOCUMENT_ID)
      with synonyms=('payables','accounts payable','supplier invoices','vendor invoices','AP open items')
      comment='Supplier invoices (AP) with payment terms, early-pay program (dynamic discounting, supply chain finance), discounts captured and lost.',
    WC_KPI as SAP_WORKING_CAPITAL_360.ANALYTICS.DT_WC_MONTHLY_KPI primary key (COMPANY_CODE, MONTH)
      with synonyms=('working capital','kpis','cash conversion cycle','monthly kpis')
      comment='Month-end working capital balances and DSO, DPO, DIO, CCC per company (3-month rolling basis).',
    INVENTORY as SAP_WORKING_CAPITAL_360.ANALYTICS.DT_INVENTORY_MONTHLY primary key (COMPANY_CODE, MONTH, INVENTORY_CATEGORY)
      with synonyms=('inventory','stock')
      comment='Month-end inventory value and COGS by inventory category (demo enrichment).',
    CASH_FORECAST as SAP_WORKING_CAPITAL_360.ANALYTICS.DT_CASH_FORECAST primary key (COMPANY_CODE, WEEK_NO)
      with synonyms=('cash forecast','13 week forecast','liquidity forecast')
      comment='13-week cash forecast from open AR receipts, open AP payments, payroll and opex.'
  )
  facts (
    AR.AR_AMOUNT_USD as AMOUNT_USD comment='Invoice amount in USD.',
    AR.AR_DAYS_PAST_DUE as DAYS_PAST_DUE comment='Days past due for open invoices.',
    AR.AR_DAYS_TO_PAY as DAYS_TO_PAY comment='Days from invoice to clearing for cleared invoices.',
    AP.AP_AMOUNT_USD as AMOUNT_USD comment='Supplier invoice amount in USD.',
    AP.AP_DAYS_TO_PAY as DAYS_TO_PAY comment='Days from invoice to payment.',
    AP.DISCOUNT_CAPTURED_USD as DISCOUNT_CAPTURED_USD comment='Early-payment discount captured (dynamic or static).',
    AP.DISCOUNT_LOST_USD as DISCOUNT_LOST_USD comment='Static discount offered but missed.',
    AP.DD_OPPORTUNITY_USD as DD_OPPORTUNITY_USD comment='Unrealized dynamic-discounting yield on eligible invoices.',
    AP.SCF_FUNDED_USD as SCF_FUNDED_USD comment='Invoice value funded via supply chain finance.',
    WC_KPI.DSO_DAYS as DSO comment='Days sales outstanding.',
    WC_KPI.DPO_DAYS as DPO comment='Days payables outstanding.',
    WC_KPI.DIO_DAYS as DIO comment='Days inventory outstanding.',
    WC_KPI.CCC_DAYS as CCC comment='Cash conversion cycle = DSO + DIO - DPO.',
    WC_KPI.AR_BALANCE as AR_BALANCE_USD comment='Month-end AR balance USD.',
    WC_KPI.AP_BALANCE as AP_BALANCE_USD comment='Month-end AP balance USD.',
    WC_KPI.INVENTORY_BALANCE as INVENTORY_USD comment='Month-end inventory USD.',
    WC_KPI.NWC as NET_WORKING_CAPITAL_USD comment='Net working capital = AR + inventory - AP.',
    WC_KPI.REVENUE as REVENUE_USD comment='Monthly billed revenue USD.',
    INVENTORY.INV_VALUE as INVENTORY_VALUE_USD comment='Inventory value USD.',
    INVENTORY.INV_COGS as COGS_USD comment='Monthly COGS USD.',
    CASH_FORECAST.RECEIPTS as AR_RECEIPTS_USD comment='Forecast customer receipts.',
    CASH_FORECAST.PAYMENTS as AP_PAYMENTS_USD comment='Forecast supplier payments.',
    CASH_FORECAST.PAYROLL as PAYROLL_USD comment='Forecast payroll.',
    CASH_FORECAST.OPEX as OTHER_OPEX_USD comment='Forecast other operating outflows.'
  )
  dimensions (
    AR.AR_COMPANY as COMPANY with synonyms=('company','entity','company code') comment='Operating company.',
    AR.CUSTOMER_NAME as CUSTOMER_NAME with synonyms=('customer','client') comment='Customer name.',
    AR.CUSTOMER_SEGMENT as SEGMENT comment='Enterprise, Mid-Market or Distributor.',
    AR.CREDIT_RISK as CREDIT_RISK comment='Low / Medium / High credit risk.',
    AR.AR_AGING_BUCKET as AGING_BUCKET with synonyms=('aging','ageing bucket') comment='Cleared, Not Due, 1-30, 31-60, 61-90, 90+.',
    AR.AR_IS_OPEN as IS_OPEN comment='True if invoice is still open at 2025-03-31.',
    AR.IS_DISPUTED as IS_DISPUTED with synonyms=('dispute','disputed') comment='Open invoice under dispute.',
    AR.DUNNING_LEVEL as DUNNING_LEVEL comment='Dunning level 0-3.',
    AR.HAS_PROMISE_TO_PAY as HAS_PROMISE_TO_PAY with synonyms=('promise to pay') comment='Customer has promised payment.',
    AR.AR_PAID_ON_TIME as PAID_ON_TIME comment='Cleared by due date.',
    AR.AR_INVOICE_MONTH as INVOICE_MONTH with synonyms=('month') comment='Invoice month YYYY-MM.',
    AR.AR_INVOICE_DATE as INVOICE_DATE comment='Invoice (posting) date.',
    AP.AP_COMPANY as COMPANY comment='Operating company.',
    AP.SUPPLIER_NAME as SUPPLIER_NAME with synonyms=('supplier','vendor') comment='Supplier name.',
    AP.SUPPLIER_CATEGORY as CATEGORY with synonyms=('spend category') comment='Supplier spend category.',
    AP.SUPPLIER_SEGMENT as SUPPLIER_SEGMENT comment='Strategic, Core or Tail.',
    AP.EARLY_PAY_PROGRAM as EARLY_PAY_PROGRAM with synonyms=('program','taulia','dynamic discounting','supply chain finance','scf') comment='Dynamic Discounting, Supply Chain Finance or Standard.',
    AP.PAYMENT_OUTCOME as PAYMENT_OUTCOME comment='DD Accepted, SCF Funded, Static Discount Taken/Missed, Paid at Terms.',
    AP.AP_PAYMENT_TERMS as PAYMENT_TERMS comment='Supplier payment terms.',
    AP.AP_AGING_BUCKET as AGING_BUCKET comment='Paid, Not Due, 1-30, 31-60, 60+.',
    AP.AP_IS_OPEN as IS_OPEN comment='True if not yet paid at 2025-03-31.',
    AP.AP_PAID_ON_TIME as PAID_ON_TIME comment='Paid by due date.',
    AP.PAID_EARLY_NO_BENEFIT as PAID_EARLY_NO_BENEFIT comment='Paid before due date without any discount (cash leakage).',
    AP.AP_INVOICE_MONTH as INVOICE_MONTH comment='Invoice month YYYY-MM.',
    WC_KPI.KPI_COMPANY as COMPANY comment='Operating company.',
    WC_KPI.REGION as REGION comment='Americas, EMEA or APAC.',
    WC_KPI.KPI_MONTH as MONTH with synonyms=('period','month') comment='Month YYYY-MM.',
    WC_KPI.MONTH_END as MONTH_END comment='Month-end date.',
    INVENTORY.INV_COMPANY as COMPANY comment='Operating company.',
    INVENTORY.INVENTORY_CATEGORY as INVENTORY_CATEGORY comment='Raw materials, WIP, finished goods, spares, packaging, transit.',
    INVENTORY.INV_MONTH as MONTH comment='Month YYYY-MM.',
    CASH_FORECAST.CF_COMPANY as COMPANY comment='Operating company.',
    CASH_FORECAST.WEEK_NO as WEEK_NO comment='Forecast week 1-13.',
    CASH_FORECAST.WEEK_END as WEEK_END comment='Forecast week end date.'
  )
  metrics (
    AR.TOTAL_AR as SUM(AR.AMOUNT_USD) comment='Total AR invoice value.',
    AR.OPEN_AR as SUM(CASE WHEN AR.IS_OPEN THEN AR.AMOUNT_USD ELSE 0 END) comment='Open receivables.',
    AR.OVERDUE_AR as SUM(CASE WHEN AR.IS_OPEN AND AR.DAYS_PAST_DUE > 0 THEN AR.AMOUNT_USD ELSE 0 END) comment='Overdue receivables.',
    AR.DISPUTED_AR as SUM(CASE WHEN AR.IS_DISPUTED THEN AR.AMOUNT_USD ELSE 0 END) comment='Disputed receivables.',
    AR.AR_ON_TIME_RATE as AVG(CASE WHEN AR.PAID_ON_TIME THEN 1 WHEN AR.PAID_ON_TIME = FALSE THEN 0 END) comment='Share of customer invoices paid on time.',
    AR.AVG_DAYS_TO_COLLECT as AVG(AR.DAYS_TO_PAY) comment='Average days to collect.',
    AP.TOTAL_AP as SUM(AP.AMOUNT_USD) comment='Total AP invoice value.',
    AP.OPEN_AP as SUM(CASE WHEN AP.IS_OPEN THEN AP.AMOUNT_USD ELSE 0 END) comment='Open payables.',
    AP.TOTAL_DISCOUNT_CAPTURED as SUM(AP.DISCOUNT_CAPTURED_USD) comment='Discounts captured.',
    AP.TOTAL_DISCOUNT_LOST as SUM(AP.DISCOUNT_LOST_USD) comment='Discounts lost.',
    AP.TOTAL_DD_OPPORTUNITY as SUM(AP.DD_OPPORTUNITY_USD) comment='Untapped dynamic discounting yield.',
    AP.TOTAL_SCF_FUNDED as SUM(AP.SCF_FUNDED_USD) comment='Volume funded through supply chain finance.',
    AP.AP_ON_TIME_RATE as AVG(CASE WHEN AP.PAID_ON_TIME THEN 1 WHEN AP.PAID_ON_TIME = FALSE THEN 0 END) comment='Share of supplier invoices paid on time.',
    AP.AVG_DAYS_TO_PAY_SUPPLIERS as AVG(AP.DAYS_TO_PAY) comment='Average days to pay suppliers.',
    WC_KPI.AVG_DSO as AVG(WC_KPI.DSO) comment='Average DSO.',
    WC_KPI.AVG_DPO as AVG(WC_KPI.DPO) comment='Average DPO.',
    WC_KPI.AVG_DIO as AVG(WC_KPI.DIO) comment='Average DIO.',
    WC_KPI.AVG_CCC as AVG(WC_KPI.CCC) comment='Average cash conversion cycle.',
    WC_KPI.TOTAL_REVENUE as SUM(WC_KPI.REVENUE_USD) comment='Billed revenue.',
    INVENTORY.TOTAL_INVENTORY as SUM(INVENTORY.INVENTORY_VALUE_USD) comment='Inventory value (sum across categories; use one month).',
    CASH_FORECAST.NET_CASH_FLOW as SUM(CASH_FORECAST.AR_RECEIPTS_USD - CASH_FORECAST.AP_PAYMENTS_USD - CASH_FORECAST.PAYROLL_USD - CASH_FORECAST.OTHER_OPEX_USD) comment='Forecast net cash flow.'
  )
  comment='SAP Working Capital 360: DSO/DPO/DIO/CCC, AR aging & collections, AP & early-pay (dynamic discounting, supply chain finance), inventory and 13-week cash forecast. Amounts in USD.';
