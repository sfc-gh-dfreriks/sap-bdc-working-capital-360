-- =====================================================================
-- L2 (gold) — ANALYTICS: Working Capital 360
--
-- Real BDC signal : AR / AP invoices come from Entry View Journal Entry
--                   (OPERATIONALACCTGDOCITEM) customer debit lines and
--                   supplier credit lines, 3 company codes, 2023-01..2025-03.
-- Demo enrichment : in the BDC demo tenant NETDUEDATE / CLEARINGDATE /
--                   PAYMENTTERMS are empty, so payment terms, payment
--                   behaviour, early-pay programs (SAP Taulia style),
--                   inventory, bank balances and partner names are
--                   generated deterministically (HASH) and flagged as demo.
-- As-of date      : 2025-03-31 (last posting date in the tenant).
-- FX              : fixed illustrative rates to USD (never sum raw LC).
-- =====================================================================

create or replace schema SAP_WORKING_CAPITAL_360.ANALYTICS;
use schema SAP_WORKING_CAPITAL_360.ANALYTICS;

-- ---------------------------------------------------------------- dims
create or replace table DIM_COMPANY as
select * from (values
  ('1000','US Operations','USD','Americas',1.0),
  ('2100','EU Operations','EUR','EMEA',1.08),
  ('5000','Japan Operations','JPY','APAC',0.0067))
  as t(COMPANY_CODE, COMPANY, CURRENCY, REGION, RATE_TO_USD);

create or replace table DIM_CUSTOMER as
with ids as (
  select CUSTOMER as CUSTOMER_ID, row_number() over (order by CUSTOMER) as RN
  from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.OPERATIONAL_ACCTG_DOC_ITEM
  where CUSTOMER <> '' group by CUSTOMER),
g as (select *, abs(hash(CUSTOMER_ID,'cust')) % 100 as H from ids)
select CUSTOMER_ID,
  get(array_construct('Apex','Summit','Harbor','Pioneer','Crestline','Meridian','Atlas','Beacon','Keystone','Silverline','Northgate','Evergreen','Bluewater'), RN % 13)::string
  || ' ' ||
  get(array_construct('Retail Group','Industries','Distribution','Health Systems','Foods','Electronics','Logistics'), RN % 7)::string as CUSTOMER_NAME,
  case when H < 35 then 'Enterprise' when H < 75 then 'Mid-Market' else 'Distributor' end as SEGMENT,
  case when H % 3 = 0 then 'NT30' when H % 3 = 1 then 'NT45' else 'NT60' end as PAYMENT_TERMS,
  case when H % 3 = 0 then 30 when H % 3 = 1 then 45 else 60 end as TERMS_DAYS,
  case when H % 10 < 5 then (H % 5) - 6
       when H % 10 < 8 then 4 + H % 8
       when H % 10 = 8 then 20 + H % 11
       else 35 + H % 16 end as AVG_DELAY_DAYS,
  case when H % 10 < 5 then 'Low' when H % 10 < 8 then 'Medium' else 'High' end as CREDIT_RISK,
  (5 + H % 20) * 50000 as CREDIT_LIMIT_USD,
  true as IS_DEMO_ENRICHMENT
from g;

create or replace table DIM_SUPPLIER as
with ids as (
  select SUPPLIER as SUPPLIER_ID, row_number() over (order by SUPPLIER) as RN
  from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.OPERATIONAL_ACCTG_DOC_ITEM
  where SUPPLIER <> '' group by SUPPLIER),
g as (select *, abs(hash(SUPPLIER_ID,'supp')) % 100 as H from ids)
select SUPPLIER_ID,
  get(array_construct('Northwind','Contoso','Fabrikam','Tailspin','Litware','Proseware','Adatum','Woodgrove','Lucerne','Wingtip','Coho','Alpine','Trey'), RN % 13)::string
  || ' ' ||
  get(array_construct('Components','Packaging','Metals','Chemicals','Logistics','Services','Plastics'), RN % 7)::string as SUPPLIER_NAME,
  get(array_construct('Direct Materials','Packaging','Logistics & Freight','MRO & Supplies','Professional Services','IT & Software','Utilities'), RN % 7)::string as CATEGORY,
  case when H < 30 then 'Dynamic Discounting' when H < 55 then 'Supply Chain Finance' else 'Standard' end as EARLY_PAY_PROGRAM,
  case when H < 30 then 'NT45'
       when H < 55 then 'NT90'
       when H < 75 then '2/10 NET30'
       else iff(H % 2 = 0, 'NT30', 'NT60') end as PAYMENT_TERMS,
  case when H < 30 then 45 when H < 55 then 90 when H < 75 then 30 else iff(H % 2 = 0, 30, 60) end as TERMS_DAYS,
  iff(H between 55 and 74, 0.02, 0) as STATIC_DISCOUNT_PCT,
  iff(H between 55 and 74, 10, 0) as STATIC_DISCOUNT_DAYS,
  iff(H < 30, 0.08 + (H % 5) * 0.01, null) as DD_APR,
  iff(H between 30 and 54, 0.055 + (H % 4) * 0.005, null) as SCF_FUNDING_RATE,
  case when H % 10 < 6 then 'Strategic' when H % 10 < 9 then 'Core' else 'Tail' end as SUPPLIER_SEGMENT,
  true as IS_DEMO_ENRICHMENT
from g;

create or replace table DIM_INVENTORY_CATEGORY as
select * from (values
  ('Raw Materials',        0.34, 48, 0.06),
  ('Work in Progress',     0.16, 22, 0.02),
  ('Finished Goods',       0.30, 64, 0.11),
  ('Spare Parts & MRO',    0.08, 140, 0.24),
  ('Packaging',            0.07, 35, 0.05),
  ('Consignment & Transit',0.05, 18, 0.01))
  as t(INVENTORY_CATEGORY, COGS_SHARE, TARGET_DIO, SLOW_MOVING_PCT);

-- --------------------------------------------------------- AR invoices
create or replace dynamic table DT_AR_ITEMS
  target_lag = '1 day' refresh_mode = AUTO initialize = ON_CREATE warehouse = LOAD_WH
as
with base as (
  select i.COMPANYCODE as COMPANY_CODE, i.FISCALYEAR as FISCAL_YEAR, i.ACCOUNTINGDOCUMENT as DOCUMENT_ID,
         i.CUSTOMER as CUSTOMER_ID, i.POSTINGDATE as INVOICE_DATE, i.COMPANYCODECURRENCY as CURRENCY,
         i.AMOUNTINCOMPANYCODECURRENCY as AMOUNT_LC, i.PROFITCENTER as PROFIT_CENTER,
         abs(hash(i.COMPANYCODE, i.ACCOUNTINGDOCUMENT, i.FISCALYEAR)) % 100 as H
  from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.OPERATIONAL_ACCTG_DOC_ITEM i
  where i.CUSTOMER <> '' and i.DEBITCREDITCODE = 'S'),
t as (
  select b.*, c.CUSTOMER_NAME, c.SEGMENT, c.CREDIT_RISK, c.PAYMENT_TERMS, c.TERMS_DAYS,
         co.COMPANY, co.RATE_TO_USD,
         dateadd(day, c.TERMS_DAYS, b.INVOICE_DATE) as DUE_DATE,
         dateadd(day, c.TERMS_DAYS + c.AVG_DELAY_DAYS + (b.H % 9) - 4, b.INVOICE_DATE) as EXPECTED_CLEARING_DATE
  from base b
  join DIM_CUSTOMER c on c.CUSTOMER_ID = b.CUSTOMER_ID
  join DIM_COMPANY co on co.COMPANY_CODE = b.COMPANY_CODE)
select COMPANY_CODE, COMPANY, FISCAL_YEAR, DOCUMENT_ID, CUSTOMER_ID, CUSTOMER_NAME, SEGMENT, CREDIT_RISK,
  PROFIT_CENTER, CURRENCY, PAYMENT_TERMS, TERMS_DAYS,
  INVOICE_DATE, to_char(INVOICE_DATE,'YYYY-MM') as INVOICE_MONTH, DUE_DATE, EXPECTED_CLEARING_DATE,
  iff(EXPECTED_CLEARING_DATE <= '2025-03-31'::date, EXPECTED_CLEARING_DATE, null) as CLEARING_DATE,
  AMOUNT_LC, round(AMOUNT_LC * RATE_TO_USD, 2) as AMOUNT_USD,
  EXPECTED_CLEARING_DATE > '2025-03-31'::date as IS_OPEN,
  iff(EXPECTED_CLEARING_DATE > '2025-03-31'::date, greatest(datediff(day, DUE_DATE, '2025-03-31'::date), 0), null) as DAYS_PAST_DUE,
  iff(EXPECTED_CLEARING_DATE <= '2025-03-31'::date, datediff(day, INVOICE_DATE, EXPECTED_CLEARING_DATE), null) as DAYS_TO_PAY,
  iff(EXPECTED_CLEARING_DATE <= '2025-03-31'::date, EXPECTED_CLEARING_DATE <= DUE_DATE, null) as PAID_ON_TIME,
  case when EXPECTED_CLEARING_DATE <= '2025-03-31'::date then 'Cleared'
       when DUE_DATE >= '2025-03-31'::date then 'Not Due'
       when datediff(day, DUE_DATE, '2025-03-31'::date) <= 30 then '1-30'
       when datediff(day, DUE_DATE, '2025-03-31'::date) <= 60 then '31-60'
       when datediff(day, DUE_DATE, '2025-03-31'::date) <= 90 then '61-90'
       else '90+' end as AGING_BUCKET,
  (EXPECTED_CLEARING_DATE > '2025-03-31'::date and H < 6) as IS_DISPUTED,
  case when EXPECTED_CLEARING_DATE <= '2025-03-31'::date or DUE_DATE >= '2025-03-31'::date then 0
       when datediff(day, DUE_DATE, '2025-03-31'::date) <= 15 then 1
       when datediff(day, DUE_DATE, '2025-03-31'::date) <= 45 then 2 else 3 end as DUNNING_LEVEL,
  (EXPECTED_CLEARING_DATE > '2025-03-31'::date and DUE_DATE < '2025-03-31'::date and H % 4 = 0) as HAS_PROMISE_TO_PAY
from t;

-- --------------------------------------------------------- AP invoices
create or replace dynamic table DT_AP_ITEMS
  target_lag = '1 day' refresh_mode = AUTO initialize = ON_CREATE warehouse = LOAD_WH
as
with base as (
  select i.COMPANYCODE as COMPANY_CODE, i.FISCALYEAR as FISCAL_YEAR, i.ACCOUNTINGDOCUMENT as DOCUMENT_ID,
         i.SUPPLIER as SUPPLIER_ID, i.POSTINGDATE as INVOICE_DATE, i.COMPANYCODECURRENCY as CURRENCY,
         abs(i.AMOUNTINCOMPANYCODECURRENCY) as AMOUNT_LC,
         abs(hash(i.COMPANYCODE, i.ACCOUNTINGDOCUMENT, i.FISCALYEAR, 'ap')) % 100 as H
  from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.OPERATIONAL_ACCTG_DOC_ITEM i
  where i.SUPPLIER <> '' and i.DEBITCREDITCODE = 'H'),
t as (
  select b.*, s.SUPPLIER_NAME, s.CATEGORY, s.SUPPLIER_SEGMENT, s.EARLY_PAY_PROGRAM, s.PAYMENT_TERMS, s.TERMS_DAYS,
         s.STATIC_DISCOUNT_PCT, s.STATIC_DISCOUNT_DAYS, s.DD_APR, s.SCF_FUNDING_RATE,
         co.COMPANY, co.RATE_TO_USD,
         dateadd(day, s.TERMS_DAYS, b.INVOICE_DATE) as DUE_DATE,
         -- early-pay decision per program
         case when s.EARLY_PAY_PROGRAM = 'Dynamic Discounting' and b.H < 55 then 'DD Accepted'
              when s.EARLY_PAY_PROGRAM = 'Supply Chain Finance' and b.H < 70 then 'SCF Funded'
              when s.STATIC_DISCOUNT_PCT > 0 and b.H < 40 then 'Static Discount Taken'
              when s.STATIC_DISCOUNT_PCT > 0 then 'Static Discount Missed'
              else 'Paid at Terms' end as PAYMENT_OUTCOME
  from base b
  join DIM_SUPPLIER s on s.SUPPLIER_ID = b.SUPPLIER_ID
  join DIM_COMPANY co on co.COMPANY_CODE = b.COMPANY_CODE),
p as (
  select t.*,
    case PAYMENT_OUTCOME
      when 'DD Accepted'           then dateadd(day, 8 + H % 10, INVOICE_DATE)
      when 'SCF Funded'            then DUE_DATE                                   -- buyer pays funder at maturity
      when 'Static Discount Taken' then dateadd(day, STATIC_DISCOUNT_DAYS, INVOICE_DATE)
      else dateadd(day, TERMS_DAYS + iff(H % 10 = 0, -7, H % 9), INVOICE_DATE) end as EXPECTED_PAYMENT_DATE,
    iff(PAYMENT_OUTCOME = 'SCF Funded', dateadd(day, 5 + H % 6, INVOICE_DATE), null) as SUPPLIER_FUNDED_DATE
  from t)
select COMPANY_CODE, COMPANY, FISCAL_YEAR, DOCUMENT_ID, SUPPLIER_ID, SUPPLIER_NAME, CATEGORY, SUPPLIER_SEGMENT,
  EARLY_PAY_PROGRAM, PAYMENT_TERMS, TERMS_DAYS, PAYMENT_OUTCOME, CURRENCY,
  INVOICE_DATE, to_char(INVOICE_DATE,'YYYY-MM') as INVOICE_MONTH, DUE_DATE, EXPECTED_PAYMENT_DATE,
  iff(EXPECTED_PAYMENT_DATE <= '2025-03-31'::date, EXPECTED_PAYMENT_DATE, null) as PAYMENT_DATE,
  SUPPLIER_FUNDED_DATE,
  AMOUNT_LC, round(AMOUNT_LC * RATE_TO_USD, 2) as AMOUNT_USD,
  EXPECTED_PAYMENT_DATE > '2025-03-31'::date as IS_OPEN,
  iff(EXPECTED_PAYMENT_DATE > '2025-03-31'::date, greatest(datediff(day, DUE_DATE, '2025-03-31'::date), 0), null) as DAYS_PAST_DUE,
  iff(EXPECTED_PAYMENT_DATE <= '2025-03-31'::date, datediff(day, INVOICE_DATE, EXPECTED_PAYMENT_DATE), null) as DAYS_TO_PAY,
  iff(EXPECTED_PAYMENT_DATE <= '2025-03-31'::date, EXPECTED_PAYMENT_DATE <= DUE_DATE, null) as PAID_ON_TIME,
  iff(EXPECTED_PAYMENT_DATE < DUE_DATE and PAYMENT_OUTCOME not in ('DD Accepted','Static Discount Taken','SCF Funded'), true, false) as PAID_EARLY_NO_BENEFIT,
  case when EXPECTED_PAYMENT_DATE <= '2025-03-31'::date then 'Paid'
       when DUE_DATE >= '2025-03-31'::date then 'Not Due'
       when datediff(day, DUE_DATE, '2025-03-31'::date) <= 30 then '1-30'
       when datediff(day, DUE_DATE, '2025-03-31'::date) <= 60 then '31-60'
       else '60+' end as AGING_BUCKET,
  -- discount economics (USD)
  round(case PAYMENT_OUTCOME
    when 'DD Accepted' then AMOUNT_LC * RATE_TO_USD * DD_APR * datediff(day, EXPECTED_PAYMENT_DATE, DUE_DATE) / 365
    when 'Static Discount Taken' then AMOUNT_LC * RATE_TO_USD * STATIC_DISCOUNT_PCT
    else 0 end, 2) as DISCOUNT_CAPTURED_USD,
  round(iff(PAYMENT_OUTCOME = 'Static Discount Missed', AMOUNT_LC * RATE_TO_USD * STATIC_DISCOUNT_PCT, 0), 2) as DISCOUNT_LOST_USD,
  round(iff(EARLY_PAY_PROGRAM = 'Dynamic Discounting' and PAYMENT_OUTCOME <> 'DD Accepted',
            AMOUNT_LC * RATE_TO_USD * DD_APR * greatest(TERMS_DAYS - 12, 0) / 365, 0), 2) as DD_OPPORTUNITY_USD,
  round(iff(PAYMENT_OUTCOME = 'SCF Funded', AMOUNT_LC * RATE_TO_USD, 0), 2) as SCF_FUNDED_USD
from p;

-- ------------------------------------------------- monthly company base
create or replace dynamic table DT_MONTHLY_FLOWS
  target_lag = 'DOWNSTREAM' refresh_mode = AUTO initialize = ON_CREATE warehouse = LOAD_WH
as
with months as (
  select distinct COMPANY_CODE, last_day(INVOICE_DATE) as MONTH_END from DT_AR_ITEMS
  where INVOICE_DATE >= '2023-01-01'),
rev as (select COMPANY_CODE, last_day(INVOICE_DATE) MONTH_END, sum(AMOUNT_USD) REVENUE_USD from DT_AR_ITEMS group by 1,2),
pur as (select COMPANY_CODE, last_day(INVOICE_DATE) MONTH_END, sum(AMOUNT_USD) PURCHASES_USD from DT_AP_ITEMS group by 1,2),
arb as (
  select m.COMPANY_CODE, m.MONTH_END, sum(a.AMOUNT_USD) AR_BALANCE_USD,
         sum(iff(a.DUE_DATE < m.MONTH_END, a.AMOUNT_USD, 0)) AR_OVERDUE_USD
  from months m join DT_AR_ITEMS a
    on a.COMPANY_CODE = m.COMPANY_CODE and a.INVOICE_DATE <= m.MONTH_END and a.EXPECTED_CLEARING_DATE > m.MONTH_END
  group by 1,2),
apb as (
  select m.COMPANY_CODE, m.MONTH_END, sum(p.AMOUNT_USD) AP_BALANCE_USD
  from months m join DT_AP_ITEMS p
    on p.COMPANY_CODE = m.COMPANY_CODE and p.INVOICE_DATE <= m.MONTH_END and p.EXPECTED_PAYMENT_DATE > m.MONTH_END
  group by 1,2),
disc as (select COMPANY_CODE, last_day(INVOICE_DATE) MONTH_END, sum(DISCOUNT_CAPTURED_USD) DISCOUNT_CAPTURED_USD,
         sum(DISCOUNT_LOST_USD) DISCOUNT_LOST_USD from DT_AP_ITEMS group by 1,2)
select m.COMPANY_CODE, m.MONTH_END, to_char(m.MONTH_END,'YYYY-MM') as MONTH,
  coalesce(r.REVENUE_USD,0) REVENUE_USD, coalesce(p.PURCHASES_USD,0) PURCHASES_USD,
  coalesce(a.AR_BALANCE_USD,0) AR_BALANCE_USD, coalesce(a.AR_OVERDUE_USD,0) AR_OVERDUE_USD,
  coalesce(b.AP_BALANCE_USD,0) AP_BALANCE_USD,
  coalesce(d.DISCOUNT_CAPTURED_USD,0) DISCOUNT_CAPTURED_USD, coalesce(d.DISCOUNT_LOST_USD,0) DISCOUNT_LOST_USD
from months m
left join rev r on r.COMPANY_CODE=m.COMPANY_CODE and r.MONTH_END=m.MONTH_END
left join pur p on p.COMPANY_CODE=m.COMPANY_CODE and p.MONTH_END=m.MONTH_END
left join arb a on a.COMPANY_CODE=m.COMPANY_CODE and a.MONTH_END=m.MONTH_END
left join apb b on b.COMPANY_CODE=m.COMPANY_CODE and b.MONTH_END=m.MONTH_END
left join disc d on d.COMPANY_CODE=m.COMPANY_CODE and d.MONTH_END=m.MONTH_END;

-- ------------------------------------------- inventory (demo enrichment)
-- COGS modelled at 62% of trailing revenue; inventory value from category
-- target DIO with a gentle upward drift (the "why is CCC longer" story).
create or replace dynamic table DT_INVENTORY_MONTHLY
  target_lag = 'DOWNSTREAM' refresh_mode = AUTO initialize = ON_CREATE warehouse = LOAD_WH
as
with f as (
  select COMPANY_CODE, MONTH_END, MONTH,
    avg(REVENUE_USD) over (partition by COMPANY_CODE order by MONTH_END rows between 2 preceding and current row) as REV_3M_AVG,
    row_number() over (partition by COMPANY_CODE order by MONTH_END) as M_IDX
  from DT_MONTHLY_FLOWS)
select f.COMPANY_CODE, co.COMPANY, f.MONTH_END, f.MONTH, c.INVENTORY_CATEGORY,
  round(f.REV_3M_AVG * 0.62 * c.COGS_SHARE, 2) as COGS_USD,
  round(f.REV_3M_AVG * 0.62 * c.COGS_SHARE / 30
        * c.TARGET_DIO * (1 + 0.006 * f.M_IDX + 0.04 * sin(f.M_IDX / 2.0))
        * iff(f.COMPANY_CODE = '5000', 1.15, iff(f.COMPANY_CODE = '2100', 0.95, 1.0)), 2) as INVENTORY_VALUE_USD,
  round(c.SLOW_MOVING_PCT * (1 + 0.01 * f.M_IDX), 4) as SLOW_MOVING_PCT,
  true as IS_DEMO_ENRICHMENT
from f
join DIM_INVENTORY_CATEGORY c
join DIM_COMPANY co on co.COMPANY_CODE = f.COMPANY_CODE;

-- -------------------------------------------------------- monthly KPIs
create or replace dynamic table DT_WC_MONTHLY_KPI
  target_lag = '1 day' refresh_mode = AUTO initialize = ON_CREATE warehouse = LOAD_WH
as
with inv as (select COMPANY_CODE, MONTH_END, sum(INVENTORY_VALUE_USD) INVENTORY_USD, sum(COGS_USD) COGS_USD
             from DT_INVENTORY_MONTHLY group by 1,2),
f as (
  select m.*, i.INVENTORY_USD, i.COGS_USD,
    sum(m.REVENUE_USD) over (partition by m.COMPANY_CODE order by m.MONTH_END rows between 2 preceding and current row) REV_3M,
    sum(m.PURCHASES_USD) over (partition by m.COMPANY_CODE order by m.MONTH_END rows between 2 preceding and current row) PUR_3M,
    sum(i.COGS_USD) over (partition by m.COMPANY_CODE order by m.MONTH_END rows between 2 preceding and current row) COGS_3M
  from DT_MONTHLY_FLOWS m join inv i on i.COMPANY_CODE = m.COMPANY_CODE and i.MONTH_END = m.MONTH_END)
select f.COMPANY_CODE, co.COMPANY, co.REGION, f.MONTH_END, f.MONTH,
  round(REVENUE_USD,2) REVENUE_USD, round(PURCHASES_USD,2) PURCHASES_USD, round(COGS_USD,2) COGS_USD,
  round(AR_BALANCE_USD,2) AR_BALANCE_USD, round(AR_OVERDUE_USD,2) AR_OVERDUE_USD,
  round(AP_BALANCE_USD,2) AP_BALANCE_USD, round(INVENTORY_USD,2) INVENTORY_USD,
  round(AR_BALANCE_USD + INVENTORY_USD - AP_BALANCE_USD,2) as NET_WORKING_CAPITAL_USD,
  round(AR_BALANCE_USD / nullif(REV_3M,0) * 91, 1) as DSO,
  round(AP_BALANCE_USD / nullif(PUR_3M,0) * 91, 1) as DPO,
  round(INVENTORY_USD / nullif(COGS_3M,0) * 91, 1) as DIO,
  round(AR_BALANCE_USD / nullif(REV_3M,0) * 91 + INVENTORY_USD / nullif(COGS_3M,0) * 91
        - AP_BALANCE_USD / nullif(PUR_3M,0) * 91, 1) as CCC,
  round(AR_OVERDUE_USD / nullif(AR_BALANCE_USD,0), 4) as AR_OVERDUE_PCT,
  round(DISCOUNT_CAPTURED_USD,2) DISCOUNT_CAPTURED_USD, round(DISCOUNT_LOST_USD,2) DISCOUNT_LOST_USD
from f join DIM_COMPANY co on co.COMPANY_CODE = f.COMPANY_CODE
where f.MONTH_END >= '2023-03-31';

-- ------------------------------------------- cash position (demo)
create or replace table DIM_BANK_ACCOUNT as
select * from (values
  ('1000','BA-US-OPS','JPMorgan Chase','Operating',  6200000),
  ('1000','BA-US-PAY','Bank of America','Payroll',   1400000),
  ('1000','BA-US-INV','JPMorgan Chase','Investment', 3500000),
  ('2100','BA-EU-OPS','Deutsche Bank','Operating',   4800000),
  ('2100','BA-EU-PAY','BNP Paribas','Payroll',       1100000),
  ('2100','BA-EU-INV','Deutsche Bank','Investment',  2200000),
  ('5000','BA-JP-OPS','MUFG Bank','Operating',       3900000),
  ('5000','BA-JP-PAY','Mizuho Bank','Payroll',        900000),
  ('5000','BA-JP-INV','SMBC','Investment',           1800000))
  as t(COMPANY_CODE, BANK_ACCOUNT_ID, HOUSE_BANK, ACCOUNT_PURPOSE, BASE_BALANCE_USD);

create or replace table DT_BANK_BALANCE_WEEKLY as
with w as (select dateadd(week, seq4(), '2024-01-05'::date) as WEEK_END, seq4() as I
           from table(generator(rowcount => 65)))
select b.COMPANY_CODE, co.COMPANY, b.BANK_ACCOUNT_ID, b.HOUSE_BANK, b.ACCOUNT_PURPOSE, w.WEEK_END,
  round(b.BASE_BALANCE_USD * (1 - 0.0045 * w.I
        + 0.06 * sin(w.I / 2.2 + abs(hash(b.BANK_ACCOUNT_ID)) % 7)
        + iff(b.ACCOUNT_PURPOSE = 'Payroll' and w.I % 2 = 0, -0.25, 0)), 2) as BALANCE_USD,
  true as IS_DEMO_ENRICHMENT
from DIM_BANK_ACCOUNT b cross join w
join DIM_COMPANY co on co.COMPANY_CODE = b.COMPANY_CODE
where w.WEEK_END <= '2025-03-28';

-- 13-week cash forecast built from open AR (expected receipt) and open AP
-- (expected payment), plus modelled payroll / opex outflows.
create or replace dynamic table DT_CASH_FORECAST
  target_lag = '1 day' refresh_mode = AUTO initialize = ON_CREATE warehouse = LOAD_WH
as
with wk as (select COMPANY_CODE, row_number() over (partition by COMPANY_CODE order by n) as WEEK_NO
            from (select distinct COMPANY_CODE from DIM_COMPANY) c
            cross join (select seq4() as n from table(generator(rowcount => 13))) g),
ar as (select COMPANY_CODE, least(greatest(ceil(datediff(day,'2025-03-31'::date, EXPECTED_CLEARING_DATE)/7),1),13) WEEK_NO, sum(AMOUNT_USD) INFLOW
       from DT_AR_ITEMS where IS_OPEN group by 1,2),
ap as (select COMPANY_CODE, least(greatest(ceil(datediff(day,'2025-03-31'::date, EXPECTED_PAYMENT_DATE)/7),1),13) WEEK_NO, sum(AMOUNT_USD) OUTFLOW
       from DT_AP_ITEMS where IS_OPEN group by 1,2),
rev as (select COMPANY_CODE, avg(REVENUE_USD) AVG_REV from DT_MONTHLY_FLOWS where MONTH_END >= '2024-10-01' group by 1)
select wk.COMPANY_CODE, co.COMPANY, wk.WEEK_NO, dateadd(week, wk.WEEK_NO, '2025-03-31'::date) as WEEK_END,
  round(coalesce(ar.INFLOW,0) + iff(wk.WEEK_NO > 6, rev.AVG_REV / 4.33 * 0.55, 0), 2) as AR_RECEIPTS_USD,
  round(coalesce(ap.OUTFLOW,0) + iff(wk.WEEK_NO > 8, rev.AVG_REV / 4.33 * 0.35, 0), 2) as AP_PAYMENTS_USD,
  round(iff(wk.WEEK_NO % 2 = 0, rev.AVG_REV * 0.18, 0), 2) as PAYROLL_USD,
  round(rev.AVG_REV / 4.33 * 0.08, 2) as OTHER_OPEX_USD
from wk
join DIM_COMPANY co on co.COMPANY_CODE = wk.COMPANY_CODE
join rev on rev.COMPANY_CODE = wk.COMPANY_CODE
left join ar on ar.COMPANY_CODE = wk.COMPANY_CODE and ar.WEEK_NO = wk.WEEK_NO
left join ap on ap.COMPANY_CODE = wk.COMPANY_CODE and ap.WEEK_NO = wk.WEEK_NO;

-- ------------------------------------------- working-capital levers
-- Cash release vs. benchmark targets, latest month, per company.
create or replace view V_WC_OPPORTUNITIES as
with k as (select * from DT_WC_MONTHLY_KPI qualify row_number() over (partition by COMPANY_CODE order by MONTH_END desc) = 1),
f as (select COMPANY_CODE, sum(REVENUE_USD) REV_12M, sum(PURCHASES_USD) PUR_12M from DT_MONTHLY_FLOWS
      where MONTH_END > '2024-03-31' group by 1),
inv as (select COMPANY_CODE, sum(COGS_USD) COGS_12M from DT_INVENTORY_MONTHLY where MONTH_END > '2024-03-31' group by 1),
ap as (select COMPANY_CODE, sum(DISCOUNT_LOST_USD) LOST, sum(DD_OPPORTUNITY_USD) DD_OPP from DT_AP_ITEMS
       where INVOICE_DATE > '2024-03-31' group by 1)
select k.COMPANY_CODE, k.COMPANY, 'Reduce DSO (collections, disputes, AR finance)' as LEVER, 'AR' as AREA,
  k.DSO as CURRENT_DAYS, 42 as TARGET_DAYS, round(greatest(k.DSO - 42,0) * f.REV_12M / 365, 0) as CASH_RELEASE_USD, 0 as PNL_IMPACT_USD
from k join f using (COMPANY_CODE)
union all
select k.COMPANY_CODE, k.COMPANY, 'Extend DPO via Supply Chain Finance', 'AP',
  k.DPO, 60, round(greatest(60 - k.DPO,0) * f.PUR_12M / 365, 0), 0
from k join f using (COMPANY_CODE)
union all
select k.COMPANY_CODE, k.COMPANY, 'Reduce DIO (slow-moving, safety stock)', 'Inventory',
  k.DIO, 50, round(greatest(k.DIO - 50,0) * i.COGS_12M / 365, 0), 0
from k join inv i using (COMPANY_CODE)
union all
select k.COMPANY_CODE, k.COMPANY, 'Capture missed & dynamic discounts', 'AP',
  null, null, 0, round(a.LOST + a.DD_OPP, 0)
from k join ap a using (COMPANY_CODE);

-- ------------------------------------------- lineage snapshot (for Native App,
-- which bundles L2 only and cannot see the L1 / L0 shares)
create or replace table LINEAGE_COUNTS as
select
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.OPERATIONAL_ACCTG_DOC_ITEM) as ACCTG,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.SUPPLIER_INVOICE) as SUPINV,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.PAYMENT_TERMS) as TERMS,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.BILLING_DOCUMENT) as BILLING,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.COLLECTIONS_WORKLIST_ITEM) as WORKLIST,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.DISPUTE_CASE) as DISPUTE,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.PROMISE_TO_PAY) as PTP,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.CASH_FLOW) as CASHFLOW,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.CASH_FLOW_FORECAST) as CFF,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.BANK_ACCOUNT) as BANK,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.HOUSE_BANK) as HOUSEBANK,
  (select count(*) from SAP_WORKING_CAPITAL_360.SAP_BDC_L1.PHYSICAL_INVENTORY_DOCUMENT_ITEM) as PHYSINV,
  (select count(*) from DT_AR_ITEMS) as DT_AR,
  (select count(*) from DT_AP_ITEMS) as DT_AP;
