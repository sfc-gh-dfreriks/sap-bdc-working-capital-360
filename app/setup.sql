-- =====================================================================
-- SAP Working Capital 360 Native App — SELF-CONTAINED setup script
-- Data is bundled in the package (SHARED_DATA). No consumer references.
-- Powers the SAP_WORKING_CAPITAL_360_ANALYTICS semantic view
-- (the same model behind the account-level SAP_WORKING_CAPITAL_ANALYST agent).
-- =====================================================================

CREATE APPLICATION ROLE IF NOT EXISTS app_public;

CREATE SCHEMA IF NOT EXISTS config;
GRANT USAGE ON SCHEMA config TO APPLICATION ROLE app_public;
CREATE TABLE IF NOT EXISTS config.settings(key STRING, value STRING);

CREATE SCHEMA IF NOT EXISTS app_data;
GRANT USAGE ON SCHEMA app_data TO APPLICATION ROLE app_public;

CREATE OR REPLACE VIEW app_data.DT_WC_MONTHLY_KPI AS SELECT * FROM shared_data.DT_WC_MONTHLY_KPI;
GRANT SELECT ON VIEW app_data.DT_WC_MONTHLY_KPI TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DT_AR_ITEMS AS SELECT * FROM shared_data.DT_AR_ITEMS;
GRANT SELECT ON VIEW app_data.DT_AR_ITEMS TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DT_AP_ITEMS AS SELECT * FROM shared_data.DT_AP_ITEMS;
GRANT SELECT ON VIEW app_data.DT_AP_ITEMS TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DT_INVENTORY_MONTHLY AS SELECT * FROM shared_data.DT_INVENTORY_MONTHLY;
GRANT SELECT ON VIEW app_data.DT_INVENTORY_MONTHLY TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DT_BANK_BALANCE_WEEKLY AS SELECT * FROM shared_data.DT_BANK_BALANCE_WEEKLY;
GRANT SELECT ON VIEW app_data.DT_BANK_BALANCE_WEEKLY TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DT_CASH_FORECAST AS SELECT * FROM shared_data.DT_CASH_FORECAST;
GRANT SELECT ON VIEW app_data.DT_CASH_FORECAST TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DIM_CUSTOMER AS SELECT * FROM shared_data.DIM_CUSTOMER;
GRANT SELECT ON VIEW app_data.DIM_CUSTOMER TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DIM_SUPPLIER AS SELECT * FROM shared_data.DIM_SUPPLIER;
GRANT SELECT ON VIEW app_data.DIM_SUPPLIER TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DIM_COMPANY AS SELECT * FROM shared_data.DIM_COMPANY;
GRANT SELECT ON VIEW app_data.DIM_COMPANY TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DIM_INVENTORY_CATEGORY AS SELECT * FROM shared_data.DIM_INVENTORY_CATEGORY;
GRANT SELECT ON VIEW app_data.DIM_INVENTORY_CATEGORY TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.DIM_BANK_ACCOUNT AS SELECT * FROM shared_data.DIM_BANK_ACCOUNT;
GRANT SELECT ON VIEW app_data.DIM_BANK_ACCOUNT TO APPLICATION ROLE app_public;
CREATE OR REPLACE VIEW app_data.V_WC_OPPORTUNITIES AS SELECT * FROM shared_data.V_WC_OPPORTUNITIES;
GRANT SELECT ON VIEW app_data.V_WC_OPPORTUNITIES TO APPLICATION ROLE app_public;

CREATE OR REPLACE VIEW app_data.LINEAGE_COUNTS AS SELECT * FROM shared_data.LINEAGE_COUNTS;
GRANT SELECT ON VIEW app_data.LINEAGE_COUNTS TO APPLICATION ROLE app_public;

-- Working Capital semantic view over the bundled APP_DATA views.
create or replace semantic view app_data.SAP_WORKING_CAPITAL_360_ANALYTICS
  tables (
    AR as APP_DATA.DT_AR_ITEMS primary key (COMPANY_CODE, FISCAL_YEAR, DOCUMENT_ID)
      with synonyms=('receivables','accounts receivable','customer invoices','AR open items','collections')
      comment='Customer invoices (AR) from SAP BDC Entry View Journal Entry, with due date, clearing, aging and dunning.',
    AP as APP_DATA.DT_AP_ITEMS primary key (COMPANY_CODE, FISCAL_YEAR, DOCUMENT_ID)
      with synonyms=('payables','accounts payable','supplier invoices','vendor invoices','AP open items')
      comment='Supplier invoices (AP) with payment terms, early-pay program (dynamic discounting, supply chain finance), discounts captured and lost.',
    WC_KPI as APP_DATA.DT_WC_MONTHLY_KPI primary key (COMPANY_CODE, MONTH)
      with synonyms=('working capital','kpis','cash conversion cycle','monthly kpis')
      comment='Month-end working capital balances and DSO, DPO, DIO, CCC per company (3-month rolling basis).',
    INVENTORY as APP_DATA.DT_INVENTORY_MONTHLY primary key (COMPANY_CODE, MONTH, INVENTORY_CATEGORY)
      with synonyms=('inventory','stock')
      comment='Month-end inventory value and COGS by inventory category (demo enrichment).',
    CASH_FORECAST as APP_DATA.DT_CASH_FORECAST primary key (COMPANY_CODE, WEEK_NO)
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

GRANT SELECT ON SEMANTIC VIEW app_data.SAP_WORKING_CAPITAL_360_ANALYTICS TO APPLICATION ROLE app_public;

DELETE FROM config.settings WHERE key = 'semantic_view';
INSERT INTO config.settings(key, value)
  SELECT 'semantic_view', CURRENT_DATABASE() || '.APP_DATA.SAP_WORKING_CAPITAL_360_ANALYTICS';

CREATE SCHEMA IF NOT EXISTS services;
GRANT USAGE ON SCHEMA services TO APPLICATION ROLE app_public;

CREATE OR ALTER VERSIONED SCHEMA core;
GRANT USAGE ON SCHEMA core TO APPLICATION ROLE app_public;

CREATE OR REPLACE PROCEDURE core.version_init()
  RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER
AS $$
DECLARE
  pool_name VARCHAR; wh_name VARCHAR; svc_count INTEGER;
BEGIN
  pool_name := (SELECT CURRENT_DATABASE()) || '_POOL';
  wh_name   := (SELECT CURRENT_DATABASE()) || '_WH';
  CREATE COMPUTE POOL IF NOT EXISTS IDENTIFIER(:pool_name)
    MIN_NODES = 1 MAX_NODES = 1 INSTANCE_FAMILY = CPU_X64_XS
    AUTO_RESUME = TRUE AUTO_SUSPEND_SECS = 300;
  CREATE WAREHOUSE IF NOT EXISTS IDENTIFIER(:wh_name)
    WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;
  SHOW SERVICES LIKE 'WORKING_CAPITAL_360_SERVICE' IN SCHEMA services;
  svc_count := (SELECT COUNT(*) FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));
  IF (:svc_count = 0) THEN
    CREATE SERVICE services.working_capital_360_service
      IN COMPUTE POOL IDENTIFIER(:pool_name)
      FROM SPECIFICATION_FILE = '/service_spec.yml'
      MIN_INSTANCES = 1 MAX_INSTANCES = 1;
    GRANT USAGE ON SERVICE services.working_capital_360_service TO APPLICATION ROLE app_public;
    GRANT SERVICE ROLE services.working_capital_360_service!working_capital_360_role TO APPLICATION ROLE app_public;
  ELSE
    ALTER SERVICE services.working_capital_360_service FROM SPECIFICATION_FILE = '/service_spec.yml';
    CALL SYSTEM$WAIT_FOR_SERVICES(600, 'services.working_capital_360_service');
  END IF;
  RETURN 'version_init ok';
END;
$$;
GRANT USAGE ON PROCEDURE core.version_init() TO APPLICATION ROLE app_public;

CREATE OR REPLACE PROCEDURE core.suspend_service() RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER
AS $$ BEGIN ALTER SERVICE services.working_capital_360_service SUSPEND; RETURN 'suspended'; END; $$;
GRANT USAGE ON PROCEDURE core.suspend_service() TO APPLICATION ROLE app_public;

CREATE OR REPLACE PROCEDURE core.resume_service() RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER
AS $$ BEGIN ALTER SERVICE services.working_capital_360_service RESUME; RETURN 'resumed'; END; $$;
GRANT USAGE ON PROCEDURE core.resume_service() TO APPLICATION ROLE app_public;

CREATE OR REPLACE PROCEDURE core.get_service_status() RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER
AS $$ DECLARE status VARCHAR; BEGIN CALL SYSTEM$GET_SERVICE_STATUS('services.working_capital_360_service') INTO :status; RETURN :status; END; $$;
GRANT USAGE ON PROCEDURE core.get_service_status() TO APPLICATION ROLE app_public;

CREATE OR REPLACE PROCEDURE core.get_service_logs(instance_id STRING, container_name STRING) RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER
AS $$ DECLARE logs VARCHAR; BEGIN CALL SYSTEM$GET_SERVICE_LOGS('services.working_capital_360_service', :instance_id, :container_name, 200) INTO :logs; RETURN :logs; END; $$;
GRANT USAGE ON PROCEDURE core.get_service_logs(STRING, STRING) TO APPLICATION ROLE app_public;

CREATE OR REPLACE PROCEDURE core.app_url() RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER
AS $$ DECLARE url VARCHAR;
BEGIN
  SHOW ENDPOINTS IN SERVICE services.working_capital_360_service;
  SELECT "ingress_url" INTO :url FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) WHERE "name" = 'wc360';
  RETURN :url;
END; $$;
GRANT USAGE ON PROCEDURE core.app_url() TO APPLICATION ROLE app_public;

CREATE OR REPLACE PROCEDURE core.selftest() RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER
AS $$ DECLARE sp INTEGER; sr INTEGER;
BEGIN
  SELECT COUNT(*) INTO :sp FROM app_data.DT_AR_ITEMS;
  SELECT COUNT(*) INTO :sr FROM app_data.DT_AP_ITEMS;
  RETURN 'bundled data OK — DT_AR_ITEMS=' || :sp || ' rows, DT_AP_ITEMS=' || :sr || ' rows';
END; $$;
GRANT USAGE ON PROCEDURE core.selftest() TO APPLICATION ROLE app_public;
