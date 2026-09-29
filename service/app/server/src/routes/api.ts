import { Router, type Request } from "express";
import { runQuery } from "../services/snowflake.js";
import { callCortexAnalyst } from "../services/analyst.js";

const router = Router();
const DB = "SAP_WORKING_CAPITAL_360"; // label only; app queries hit APP_DATA
const KPI = "APP_DATA.DT_WC_MONTHLY_KPI";
const AR = "APP_DATA.DT_AR_ITEMS";
const AP = "APP_DATA.DT_AP_ITEMS";
const INV = "APP_DATA.DT_INVENTORY_MONTHLY";
const INVCAT = "APP_DATA.DIM_INVENTORY_CATEGORY";
const BANK = "APP_DATA.DT_BANK_BALANCE_WEEKLY";
const FC = "APP_DATA.DT_CASH_FORECAST";
const OPP = "APP_DATA.V_WC_OPPORTUNITIES";
const L1 = `${DB}.SAP_BDC_L1`;

// ---------------------------------------------------------------------------
// All money is USD (*_USD columns, fixed illustrative FX). AMOUNT_LC is never
// summed across companies. Cross-company day metrics are weighted by their
// flow driver: DSO by revenue, DPO by purchases, DIO by COGS.
// ---------------------------------------------------------------------------
export const AS_OF = "2025-03-31";
export const DEFAULT_FROM = "2024-04";
export const DEFAULT_TO = "2025-03";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const WEIGHTED = `ROUND(SUM(DSO*REVENUE_USD)/NULLIF(SUM(REVENUE_USD),0),1) AS dso,
  ROUND(SUM(DPO*PURCHASES_USD)/NULLIF(SUM(PURCHASES_USD),0),1) AS dpo,
  ROUND(SUM(DIO*COGS_USD)/NULLIF(SUM(COGS_USD),0),1) AS dio`;
const CCC = `ROUND(dso + dio - dpo, 1) AS ccc`;

function parseList(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}
function period(req: Request): { from: string; to: string } {
  const f = String(req.query.from ?? ""); const t = String(req.query.to ?? "");
  let from = MONTH_RE.test(f) ? f : DEFAULT_FROM; let to = MONTH_RE.test(t) ? t : DEFAULT_TO;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}
/** Company + optional month-range predicate with positional binds.
 *  `monthCol` is a trusted column expression yielding 'YYYY-MM'. */
function filters(req: Request, monthCol: string | null = null, extra: string[] = []): { where: string; binds: string[] } {
  const comps = parseList(req.query.companies);
  const parts = [...extra]; const binds: string[] = [];
  if (comps.length) { parts.push(`COMPANY IN (${comps.map(() => "?").join(",")})`); binds.push(...comps); }
  if (monthCol) { const { from, to } = period(req); parts.push(`${monthCol} BETWEEN ? AND ?`); binds.push(from, to); }
  return { where: parts.length ? `WHERE ${parts.join(" AND ")}` : "", binds };
}
/** 'YYYY-MM' twelve months earlier. */
function priorYear(m: string): string { return `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`; }
const num = (v: unknown) => (v == null ? null : Number(v));

router.get("/api/filters", async (_req, res) => {
  try {
    const [comps, months] = await Promise.all([
      runQuery(`SELECT DISTINCT COMPANY AS v FROM ${KPI} ORDER BY 1`),
      runQuery(`SELECT DISTINCT MONTH AS v FROM ${KPI} ORDER BY 1`),
    ]);
    res.json({ companies: comps.map((r) => r.v), months: months.map((r) => r.v),
      default_from: DEFAULT_FROM, default_to: DEFAULT_TO, as_of: AS_OF, currency: "USD" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/overview", async (req, res) => {
  try {
    const { to } = period(req);
    const py = priorYear(to);
    const c = filters(req);
    const cw = c.where ? `${c.where} AND` : "WHERE";
    const [latest, trend, byCompany] = await Promise.all([
      runQuery(`SELECT MONTH AS month, ${CCC}, dso, dpo, dio, nwc, ar, ap, inventory, ar_overdue FROM (
                  SELECT MONTH, ${WEIGHTED}, SUM(NET_WORKING_CAPITAL_USD) AS nwc, SUM(AR_BALANCE_USD) AS ar,
                    SUM(AP_BALANCE_USD) AS ap, SUM(INVENTORY_USD) AS inventory, SUM(AR_OVERDUE_USD) AS ar_overdue
                  FROM ${KPI} ${cw} MONTH IN (?, ?) GROUP BY 1) ORDER BY 1`, [...c.binds, py, to]),
      runQuery(`SELECT MONTH AS month, ${CCC}, dso, dpo, dio, nwc FROM (
                  SELECT MONTH, ${WEIGHTED}, SUM(NET_WORKING_CAPITAL_USD) AS nwc FROM ${KPI} ${filters(req, "MONTH").where}
                  GROUP BY 1) ORDER BY 1`, filters(req, "MONTH").binds),
      runQuery(`SELECT COMPANY AS name, REGION AS region, DSO AS dso, DPO AS dpo, DIO AS dio, CCC AS ccc,
                  NET_WORKING_CAPITAL_USD AS nwc, AR_BALANCE_USD AS ar, AP_BALANCE_USD AS ap, INVENTORY_USD AS inventory,
                  AR_OVERDUE_PCT AS ar_overdue_pct
                FROM ${KPI} ${cw} MONTH = ? ORDER BY 1`, [...c.binds, to]),
    ]);
    const cur = latest.find((r) => r.month === to) ?? {};
    const prev = latest.find((r) => r.month === py) ?? {};
    const delta: Record<string, number | null> = {};
    for (const k of ["dso", "dpo", "dio", "ccc", "nwc", "ar", "ap", "inventory"]) {
      delta[k] = cur[k] != null && prev[k] != null ? Number(cur[k]) - Number(prev[k]) : null;
    }
    res.json({ kpis: { ...cur, prior_month: py }, delta, trend, by_company: byCompany,
      bridge: { dso: num(cur.dso), dio: num(cur.dio), dpo: num(cur.dpo), ccc: num(cur.ccc) } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/cash", async (req, res) => {
  try {
    const c = filters(req);
    const cw = c.where ? `${c.where} AND` : "WHERE";
    const { from, to } = period(req);
    const [total, trend, byBank, byPurpose, forecast] = await Promise.all([
      runQuery(`SELECT MAX(WEEK_END) AS week_end, SUM(BALANCE_USD) AS balance, COUNT(DISTINCT BANK_ACCOUNT_ID) AS accounts
                FROM ${BANK} ${cw} WEEK_END = (SELECT MAX(WEEK_END) FROM ${BANK})`, c.binds),
      runQuery(`SELECT TO_CHAR(WEEK_END,'YYYY-MM-DD') AS week, COMPANY AS name, SUM(BALANCE_USD) AS balance FROM ${BANK}
                ${cw} TO_CHAR(WEEK_END,'YYYY-MM') BETWEEN ? AND ? GROUP BY 1,2 ORDER BY 1,2`, [...c.binds, from, to]),
      runQuery(`SELECT HOUSE_BANK AS name, SUM(BALANCE_USD) AS balance FROM ${BANK}
                ${cw} WEEK_END = (SELECT MAX(WEEK_END) FROM ${BANK}) GROUP BY 1 ORDER BY 2 DESC`, c.binds),
      runQuery(`SELECT ACCOUNT_PURPOSE AS name, SUM(BALANCE_USD) AS balance FROM ${BANK}
                ${cw} WEEK_END = (SELECT MAX(WEEK_END) FROM ${BANK}) GROUP BY 1 ORDER BY 2 DESC`, c.binds),
      runQuery(`SELECT WEEK_NO AS week_no, TO_CHAR(MIN(WEEK_END),'YYYY-MM-DD') AS week_end, SUM(AR_RECEIPTS_USD) AS receipts,
                  SUM(AP_PAYMENTS_USD) AS ap_payments, SUM(PAYROLL_USD) AS payroll, SUM(OTHER_OPEX_USD) AS other_opex,
                  SUM(AR_RECEIPTS_USD - AP_PAYMENTS_USD - PAYROLL_USD - OTHER_OPEX_USD) AS net
                FROM ${FC} ${c.where} GROUP BY 1 ORDER BY 1`, c.binds),
    ]);
    const start = Number(total[0]?.balance ?? 0);
    let run = start;
    const fc = forecast.map((r) => {
      const payments = Number(r.ap_payments) + Number(r.payroll) + Number(r.other_opex);
      run += Number(r.net);
      return { ...r, payments, closing_balance: run };
    });
    res.json({ kpis: { ...(total[0] ?? {}), forecast_net: run - start, forecast_end_balance: run,
      min_balance: fc.length ? Math.min(...fc.map((r) => r.closing_balance)) : start }, trend,
      by_bank: byBank, by_purpose: byPurpose, forecast: fc, demo_enrichment: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/ar", async (req, res) => {
  try {
    const open = filters(req, null, ["IS_OPEN"]);
    const inv = filters(req, "INVOICE_MONTH");
    const k = filters(req, "MONTH");
    const [kpis, onTime, dso, aging, topOverdue, dunning, bySegment] = await Promise.all([
      runQuery(`SELECT SUM(AMOUNT_USD) AS open_ar, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) AS overdue_ar,
                  ROUND(100*SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0))/NULLIF(SUM(AMOUNT_USD),0),1) AS overdue_pct,
                  SUM(IFF(IS_DISPUTED,AMOUNT_USD,0)) AS disputed, SUM(IFF(HAS_PROMISE_TO_PAY,AMOUNT_USD,0)) AS promised,
                  COUNT(*) AS open_items, COUNT(DISTINCT CUSTOMER_ID) AS customers FROM ${AR} ${open.where}`, open.binds),
      runQuery(`SELECT ROUND(100*AVG(IFF(PAID_ON_TIME,1,0)),1) AS on_time_pct, ROUND(AVG(DAYS_TO_PAY),1) AS avg_days_to_pay,
                  SUM(AMOUNT_USD) AS invoiced FROM ${AR} ${inv.where}${inv.where ? " AND" : " WHERE"} NOT IS_OPEN`, inv.binds),
      runQuery(`SELECT MONTH AS month, ROUND(SUM(DSO*REVENUE_USD)/NULLIF(SUM(REVENUE_USD),0),1) AS dso,
                  SUM(AR_BALANCE_USD) AS ar, SUM(AR_OVERDUE_USD) AS overdue FROM ${KPI} ${k.where} GROUP BY 1 ORDER BY 1`, k.binds),
      runQuery(`SELECT AGING_BUCKET AS name, SUM(AMOUNT_USD) AS amount, COUNT(*) AS items FROM ${AR} ${open.where}
                GROUP BY 1 ORDER BY DECODE(AGING_BUCKET,'Not Due',0,'1-30',1,'31-60',2,'61-90',3,'90+',4,9)`, open.binds),
      runQuery(`SELECT CUSTOMER_NAME AS customer, MAX(SEGMENT) AS segment, MAX(CREDIT_RISK) AS risk,
                  SUM(AMOUNT_USD) AS open_ar, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) AS overdue,
                  MAX(DAYS_PAST_DUE) AS max_dpd, SUM(IFF(IS_DISPUTED,AMOUNT_USD,0)) AS disputed,
                  SUM(IFF(HAS_PROMISE_TO_PAY,AMOUNT_USD,0)) AS promise_to_pay
                FROM ${AR} ${open.where} GROUP BY CUSTOMER_NAME HAVING SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) > 0
                ORDER BY overdue DESC LIMIT 15`, open.binds),
      runQuery(`SELECT 'Level ' || COALESCE(DUNNING_LEVEL,0) AS name, COUNT(*) AS items, SUM(AMOUNT_USD) AS amount
                FROM ${AR} ${open.where} GROUP BY 1 ORDER BY 1`, open.binds),
      runQuery(`SELECT SEGMENT AS name, SUM(AMOUNT_USD) AS open_ar, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) AS overdue
                FROM ${AR} ${open.where} GROUP BY 1 ORDER BY 2 DESC`, open.binds),
    ]);
    res.json({ kpis: { ...(kpis[0] ?? {}), ...(onTime[0] ?? {}), dso: dso.at(-1)?.dso ?? null },
      dso_trend: dso, aging, top_overdue: topOverdue, dunning, by_segment: bySegment });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/ap", async (req, res) => {
  try {
    const open = filters(req, null, ["IS_OPEN"]);
    const inv = filters(req, "INVOICE_MONTH");
    const k = filters(req, "MONTH");
    const [kpis, paid, dpo, discounts, aging, topSuppliers] = await Promise.all([
      runQuery(`SELECT SUM(AMOUNT_USD) AS open_ap, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) AS overdue_ap,
                  COUNT(*) AS open_items, COUNT(DISTINCT SUPPLIER_ID) AS suppliers FROM ${AP} ${open.where}`, open.binds),
      runQuery(`SELECT ROUND(AVG(DAYS_TO_PAY),1) AS avg_days_to_pay, ROUND(100*AVG(IFF(PAID_ON_TIME,1,0)),1) AS on_time_pct,
                  SUM(IFF(PAID_EARLY_NO_BENEFIT,AMOUNT_USD,0)) AS paid_early_no_benefit,
                  SUM(DISCOUNT_CAPTURED_USD) AS discount_captured, SUM(DISCOUNT_LOST_USD) AS discount_lost
                FROM ${AP} ${inv.where}${inv.where ? " AND" : " WHERE"} NOT IS_OPEN`, inv.binds),
      runQuery(`SELECT MONTH AS month, ROUND(SUM(DPO*PURCHASES_USD)/NULLIF(SUM(PURCHASES_USD),0),1) AS dpo,
                  SUM(AP_BALANCE_USD) AS ap FROM ${KPI} ${k.where} GROUP BY 1 ORDER BY 1`, k.binds),
      runQuery(`SELECT INVOICE_MONTH AS month, SUM(DISCOUNT_CAPTURED_USD) AS captured, SUM(DISCOUNT_LOST_USD) AS lost
                FROM ${AP} ${inv.where} GROUP BY 1 ORDER BY 1`, inv.binds),
      runQuery(`SELECT AGING_BUCKET AS name, SUM(AMOUNT_USD) AS amount, COUNT(*) AS items FROM ${AP} ${open.where}
                GROUP BY 1 ORDER BY DECODE(AGING_BUCKET,'Not Due',0,'1-30',1,'31-60',2,'60+',3,9)`, open.binds),
      runQuery(`SELECT SUPPLIER_NAME AS supplier, MAX(CATEGORY) AS category, MAX(SUPPLIER_SEGMENT) AS segment,
                  MAX(EARLY_PAY_PROGRAM) AS program, MAX(PAYMENT_TERMS) AS terms, SUM(AMOUNT_USD) AS open_ap,
                  SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) AS overdue FROM ${AP} ${open.where}
                GROUP BY SUPPLIER_NAME ORDER BY open_ap DESC LIMIT 15`, open.binds),
    ]);
    res.json({ kpis: { ...(kpis[0] ?? {}), ...(paid[0] ?? {}), dpo: dpo.at(-1)?.dpo ?? null },
      dpo_trend: dpo, discounts, aging, top_suppliers: topSuppliers });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/early-pay", async (req, res) => {
  try {
    const inv = filters(req, "INVOICE_MONTH");
    const k = filters(req, "MONTH");
    const [kpis, byProgram, outcomes, apr, annual] = await Promise.all([
      runQuery(`SELECT SUM(AMOUNT_USD) AS volume, SUM(DISCOUNT_CAPTURED_USD) AS discount_captured,
                  SUM(DISCOUNT_LOST_USD) AS discount_lost, SUM(DD_OPPORTUNITY_USD) AS dd_opportunity,
                  SUM(SCF_FUNDED_USD) AS scf_funded,
                  SUM(IFF(EARLY_PAY_PROGRAM='Standard',AMOUNT_USD,0)) AS standard_volume FROM ${AP} ${inv.where}`, inv.binds),
      runQuery(`SELECT EARLY_PAY_PROGRAM AS name, SUM(AMOUNT_USD) AS volume, COUNT(DISTINCT SUPPLIER_ID) AS suppliers,
                  SUM(DISCOUNT_CAPTURED_USD) AS captured, SUM(DD_OPPORTUNITY_USD) AS dd_opportunity, SUM(SCF_FUNDED_USD) AS scf_funded
                FROM ${AP} ${inv.where} GROUP BY 1 ORDER BY 2 DESC`, inv.binds),
      runQuery(`SELECT PAYMENT_OUTCOME AS name, COUNT(*) AS items, SUM(AMOUNT_USD) AS volume,
                  SUM(DISCOUNT_CAPTURED_USD) AS captured, SUM(DISCOUNT_LOST_USD) AS lost
                FROM ${AP} ${inv.where} GROUP BY 1 ORDER BY 3 DESC`, inv.binds),
      // Effective annualized yield on dynamic discounts actually accepted.
      runQuery(`SELECT ROUND(100 * SUM(DISCOUNT_CAPTURED_USD) / NULLIF(SUM(AMOUNT_USD),0) * 365
                  / NULLIF(AVG(GREATEST(TERMS_DAYS - DAYS_TO_PAY, 1)),0), 1) AS dd_apr_pct,
                  ROUND(AVG(GREATEST(TERMS_DAYS - DAYS_TO_PAY, 0)),1) AS days_accelerated
                FROM ${AP} ${inv.where}${inv.where ? " AND" : " WHERE"} PAYMENT_OUTCOME = 'DD Accepted'`, inv.binds),
      runQuery(`SELECT SUM(PURCHASES_USD) AS purchases, COUNT(DISTINCT MONTH) AS months FROM ${KPI} ${k.where}`, k.binds),
    ]);
    const months = Number(annual[0]?.months ?? 0);
    const annualPurchases = months ? (Number(annual[0]?.purchases ?? 0) * 12) / months : 0;
    res.json({ kpis: { ...(kpis[0] ?? {}), ...(apr[0] ?? {}), annual_purchases: annualPurchases },
      by_program: byProgram, outcomes, demo_enrichment: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/inventory", async (req, res) => {
  try {
    const { to } = period(req);
    const k = filters(req, "MONTH");
    const c = filters(req);
    const cw = c.where ? `${c.where} AND` : "WHERE";
    const [dio, trendByCat, categories] = await Promise.all([
      runQuery(`SELECT MONTH AS month, ROUND(SUM(DIO*COGS_USD)/NULLIF(SUM(COGS_USD),0),1) AS dio,
                  SUM(INVENTORY_USD) AS inventory FROM ${KPI} ${k.where} GROUP BY 1 ORDER BY 1`, k.binds),
      runQuery(`SELECT MONTH AS month, INVENTORY_CATEGORY AS name, SUM(INVENTORY_VALUE_USD) AS value FROM ${INV}
                ${k.where} GROUP BY 1,2 ORDER BY 1,2`, k.binds),
      runQuery(`SELECT i.INVENTORY_CATEGORY AS name, SUM(i.INVENTORY_VALUE_USD) AS value,
                  SUM(i.INVENTORY_VALUE_USD * i.SLOW_MOVING_PCT) AS slow_moving,
                  ROUND(SUM(i.INVENTORY_VALUE_USD) / NULLIF(SUM(i.COGS_USD),0) * 365 / 12, 1) AS dio,
                  MAX(c.TARGET_DIO) AS target_dio
                FROM ${INV} i LEFT JOIN ${INVCAT} c ON c.INVENTORY_CATEGORY = i.INVENTORY_CATEGORY
                ${cw.replace("COMPANY", "i.COMPANY")} i.MONTH = ? GROUP BY 1 ORDER BY 2 DESC`, [...c.binds, to]),
    ]);
    const total = categories.reduce((s, r) => s + Number(r.value ?? 0), 0);
    const slow = categories.reduce((s, r) => s + Number(r.slow_moving ?? 0), 0);
    res.json({ kpis: { month: to, inventory: total, slow_moving: slow, slow_moving_pct: total ? (100 * slow) / total : 0,
      dio: dio.at(-1)?.dio ?? null }, dio_trend: dio, trend_by_cat: trendByCat,
      categories: categories.map((r) => ({ ...r, gap_days: r.dio != null && r.target_dio != null ? Number(r.dio) - Number(r.target_dio) : null })),
      demo_enrichment: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/opportunities", async (req, res) => {
  try {
    const c = filters(req);
    const [rows, byLever, byCompany] = await Promise.all([
      runQuery(`SELECT COMPANY AS company, LEVER AS lever, AREA AS area, CURRENT_DAYS AS current_days, TARGET_DAYS AS target_days,
                  CASH_RELEASE_USD AS cash_release, PNL_IMPACT_USD AS pnl_impact FROM ${OPP} ${c.where} ORDER BY cash_release DESC`, c.binds),
      runQuery(`SELECT LEVER AS name, MAX(AREA) AS area, SUM(CASH_RELEASE_USD) AS cash_release, SUM(PNL_IMPACT_USD) AS pnl_impact
                FROM ${OPP} ${c.where} GROUP BY 1 ORDER BY 3 DESC`, c.binds),
      runQuery(`SELECT COMPANY AS name, SUM(CASH_RELEASE_USD) AS cash_release, SUM(PNL_IMPACT_USD) AS pnl_impact
                FROM ${OPP} ${c.where} GROUP BY 1 ORDER BY 2 DESC`, c.binds),
    ]);
    res.json({ kpis: { cash_release: rows.reduce((s, r) => s + Number(r.cash_release ?? 0), 0),
      pnl_impact: rows.reduce((s, r) => s + Number(r.pnl_impact ?? 0), 0), levers: byLever.length },
      rows, by_lever: byLever, by_company: byCompany });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/api/lineage", async (_req, res) => {
  try {
    const c = (await runQuery(
      `SELECT ACCTG AS acctg, SUPINV AS supinv, TERMS AS terms, BILLING AS billing, WORKLIST AS worklist, DISPUTE AS dispute, PTP AS ptp, CASHFLOW AS cashflow, CFF AS cff, BANK AS bank, HOUSEBANK AS housebank, PHYSINV AS physinv, DT_AR AS dt_ar, DT_AP AS dt_ap FROM APP_DATA.LINEAGE_COUNTS`))[0] as any;
    const p = (sapSystem: string, dataProduct: string, l0Object: string, l1Object: string, rows: unknown, usage: string) =>
      ({ sapSystem, dataProduct, l0Object, l1Object: `SAP_BDC_L1.${l1Object}`, rows, usage });
    res.json({
      app: "SAP BDC Working Capital 360",
      database: DB,
      sourceSystems: ["SAP S/4HANA Finance — Receivables, Payables & Cash Management", "SAP Taulia (working capital levers)"],
      summary:
        "Financial documents flow from SAP S/4HANA Finance into Snowflake as SAP BDC zero-copy data products (L0), " +
        "exposed as passthrough views (L1), and curated into AR/AP item, KPI, cash and inventory dynamic tables plus a " +
        "semantic view (L2) that serve this app and the SAP Working Capital Analyst. AR/AP invoices and amounts come from " +
        "real Entry View journal lines; payment terms/behaviour, early-pay programs, inventory, bank balances and partner " +
        "names are demo enrichment.",
      products: [
        p("S/4HANA Finance", "Entry View Journal Entry — Operational Acctg Doc Item", "SAP_BDC_DEMO_ENTRY_VIEW_JOURNAL_ENTRY.BDCCONNECT.OPERATIONALACCTGDOCITEM", "OPERATIONAL_ACCTG_DOC_ITEM", c.acctg, "AR/AP open & cleared items (real)"),
        p("S/4HANA Finance", "Supplier Invoice", "SAP_BDC_DEMO_SUPPLIER_INVOICE.BDCCONNECT.SUPPLIERINVOICE", "SUPPLIER_INVOICE", c.supinv, "AP invoice context"),
        p("S/4HANA Finance", "Payment Terms", "SAP_BDC_DEMO_PAYMENT_TERMS.BDCCONNECT.PAYMENTTERMS", "PAYMENT_TERMS", c.terms, "Terms reference"),
        p("S/4HANA Sales", "Billing Document", "SAP_BDC_DEMO_BILLING_DOCUMENT.BDCCONNECT.BILLINGDOCUMENT", "BILLING_DOCUMENT", c.billing, "Revenue context"),
        p("S/4HANA FSCM", "Collections Worklist Item", "SAP_BDC_DEMO_COLLECTIONS_WORKLIST_ITEM.BDCCONNECT.COLLECTIONSWORKLISTITEM", "COLLECTIONS_WORKLIST_ITEM", c.worklist, "Collections / dunning"),
        p("S/4HANA FSCM", "Dispute Case", "SAP_BDC_DEMO_DISPUTE_CASE.BDCCONNECT.DISPUTECASE", "DISPUTE_CASE", c.dispute, "Disputed AR"),
        p("S/4HANA FSCM", "Promise to Pay", "SAP_BDC_DEMO_PROMISE_TO_PAY.BDCCONNECT.PROMISETOPAY", "PROMISE_TO_PAY", c.ptp, "Promises to pay"),
        p("S/4HANA Cash Mgmt", "Cash Flow", "SAP_BDC_DEMO_CASH_FLOW.BDCCONNECT.CASHFLOW", "CASH_FLOW", c.cashflow, "Actual cash flows"),
        p("S/4HANA Cash Mgmt", "Cash Flow Forecast", "SAP_BDC_DEMO_CASH_FLOW.BDCCONNECT.CASHFLOWFORECAST", "CASH_FLOW_FORECAST", c.cff, "13-week forecast"),
        p("S/4HANA Cash Mgmt", "Bank Account", "SAP_BDC_DEMO_BANK_ACCOUNT.BDCCONNECT.BANKACCOUNT", "BANK_ACCOUNT", c.bank, "Bank accounts"),
        p("S/4HANA Cash Mgmt", "House Bank", "SAP_BDC_DEMO_HOUSE_BANK.BDCCONNECT.HOUSEBANK", "HOUSE_BANK", c.housebank, "House banks"),
        p("S/4HANA Logistics", "Physical Inventory Document", "SAP_BDC_DEMO_PHYSICAL_INVENTORY_DOCUMENT.BDCCONNECT.PHYSICALINVENTORYDOCUMENTITEM", "PHYSICAL_INVENTORY_DOCUMENT_ITEM", c.physinv, "Inventory context"),
      ],
      curated: [
        { object: "ANALYTICS.DT_AR_ITEMS", rows: c.dt_ar }, { object: "ANALYTICS.DT_AP_ITEMS", rows: c.dt_ap },
      ],
      layers: [
        { name: "SAP Source Systems", tone: "sap", objects: ["SAP S/4HANA Finance (FI-AR/AP)", "SAP FSCM Collections & Disputes", "SAP Cash Management"] },
        { name: "L0 — Bronze (BDC Zero-Copy)", tone: "bronze", objects: ["SAP_BDC_DEMO_ENTRY_VIEW_JOURNAL_ENTRY", "SAP_BDC_DEMO_SUPPLIER_INVOICE", "SAP_BDC_DEMO_CASH_FLOW", "SAP_BDC_DEMO_BANK_ACCOUNT", "SAP_BDC_DEMO_DISPUTE_CASE", "+7 more"] },
        { name: "L1 — Silver (Passthrough Views)", tone: "silver", objects: ["SAP_BDC_L1.OPERATIONAL_ACCTG_DOC_ITEM", "SAP_BDC_L1.CASH_FLOW_FORECAST", "SAP_BDC_L1.BANK_ACCOUNT", "SAP_BDC_L1.PAYMENT_TERMS"] },
        { name: "L2 — Gold (Dynamic Tables + Semantic View)", tone: "gold", objects: ["ANALYTICS.DT_AR_ITEMS", "ANALYTICS.DT_AP_ITEMS", "ANALYTICS.DT_WC_MONTHLY_KPI", "ANALYTICS.DT_CASH_FORECAST", "SEMANTIC.SAP_WORKING_CAPITAL_360_ANALYTICS"] },
        { name: "AI + Application", tone: "ai", objects: ["AGENTS.SAP_WORKING_CAPITAL_ANALYST (Cortex Agent)", "SAP BDC Working Capital 360 (React)"] },
      ],
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/api/analyst", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages array is required" });
    res.json(await callCortexAnalyst(messages));
  } catch (err) { console.error("POST /api/analyst error:", err); res.status(500).json({ error: String(err) }); }
});

router.post("/api/analyst/run-sql", async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || typeof sql !== "string") return res.status(400).json({ error: "sql string is required" });
    const t = sql.trim().toUpperCase();
    if (!t.startsWith("SELECT") && !t.startsWith("WITH")) return res.status(400).json({ error: "Only SELECT/WITH allowed" });
    const rows = await runQuery(sql);
    res.json({ rows, columns: rows.length > 0 ? Object.keys(rows[0]) : [] });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
