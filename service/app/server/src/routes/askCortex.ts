import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { isSpcs, runQuery } from "../services/snowflake.js";

// ================================================================ Ask Cortex
// Each topic is a set of SQL "facts" the model must treat as authoritative.
// Facts are company-wide for the default period (2024-04..2025-03, as of 2025-03-31).
const router = Router();
// Native App: queries hit APP_DATA views over the bundled data.
const KPI = "APP_DATA.DT_WC_MONTHLY_KPI";
const AR = "APP_DATA.DT_AR_ITEMS";
const AP = "APP_DATA.DT_AP_ITEMS";
const INV = "APP_DATA.DT_INVENTORY_MONTHLY";
const INVCAT = "APP_DATA.DIM_INVENTORY_CATEGORY";
const BANK = "APP_DATA.DT_BANK_BALANCE_WEEKLY";
const FC = "APP_DATA.DT_CASH_FORECAST";
const OPP = "APP_DATA.V_WC_OPPORTUNITIES";
const MODEL = process.env.CORTEX_MODEL ?? "claude-sonnet-4-5";
const LAST = "2025-03";

type Facts = (args: Record<string, string>) => Promise<Record<string, unknown>>;
const T = (sql: string, binds: string[] = []) => runQuery(sql, binds);
const WEIGHTED = `ROUND(SUM(DSO*REVENUE_USD)/NULLIF(SUM(REVENUE_USD),0),1) dso,
  ROUND(SUM(DPO*PURCHASES_USD)/NULLIF(SUM(PURCHASES_USD),0),1) dpo,
  ROUND(SUM(DIO*COGS_USD)/NULLIF(SUM(COGS_USD),0),1) dio`;

const q = {
  kpiByCompany: () => T(`SELECT COMPANY, REGION, DSO, DPO, DIO, CCC, NET_WORKING_CAPITAL_USD nwc FROM ${KPI} WHERE MONTH=? ORDER BY 1`, [LAST]),
  kpiTrend: () => T(`SELECT MONTH, ${WEIGHTED}, SUM(NET_WORKING_CAPITAL_USD) nwc, SUM(AR_BALANCE_USD) ar, SUM(AP_BALANCE_USD) ap,
    SUM(INVENTORY_USD) inventory FROM ${KPI} GROUP BY 1 ORDER BY 1`),
  arTotals: () => T(`SELECT SUM(AMOUNT_USD) open_ar, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) overdue_ar, COUNT(*) items,
    COUNT(DISTINCT CUSTOMER_ID) customers FROM ${AR} WHERE IS_OPEN`),
  apTotals: () => T(`SELECT SUM(AMOUNT_USD) open_ap, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) overdue_ap, COUNT(*) items,
    COUNT(DISTINCT SUPPLIER_ID) suppliers FROM ${AP} WHERE IS_OPEN`),
  levers: () => T(`SELECT LEVER, MAX(AREA) area, SUM(CASH_RELEASE_USD) cash_release, SUM(PNL_IMPACT_USD) pnl_impact FROM ${OPP} GROUP BY 1 ORDER BY 3 DESC`),
  cashNow: () => T(`SELECT COMPANY, SUM(BALANCE_USD) balance FROM ${BANK} WHERE WEEK_END=(SELECT MAX(WEEK_END) FROM ${BANK}) GROUP BY 1 ORDER BY 2 DESC`),
};

const TOPICS: Record<string, { title: string; facts: Facts }> = {
  general: { title: "working capital across cash, AR, AP, inventory and improvement levers", facts: async () => ({
    ccc_by_company_latest_month: await q.kpiByCompany(),
    kpi_trend_all_companies: await q.kpiTrend(),
    open_ar: (await q.arTotals())[0],
    open_ap: (await q.apTotals())[0],
    cash_latest_week_by_company: await q.cashNow(),
    opportunity_levers: await q.levers(),
  }) },
  overview: { title: "working capital overview (cash conversion cycle, DSO/DPO/DIO, net working capital)", facts: async () => ({
    ccc_by_company_latest_month: await q.kpiByCompany(),
    kpi_trend_all_companies: await q.kpiTrend(),
  }) },
  cash: { title: "cash, bank balances and 13-week cash forecast", facts: async () => ({
    balance_by_company_latest_week: await q.cashNow(),
    balance_by_house_bank: await T(`SELECT HOUSE_BANK, SUM(BALANCE_USD) balance FROM ${BANK} WHERE WEEK_END=(SELECT MAX(WEEK_END) FROM ${BANK}) GROUP BY 1 ORDER BY 2 DESC`),
    balance_by_purpose: await T(`SELECT ACCOUNT_PURPOSE, SUM(BALANCE_USD) balance FROM ${BANK} WHERE WEEK_END=(SELECT MAX(WEEK_END) FROM ${BANK}) GROUP BY 1 ORDER BY 2 DESC`),
    weekly_total_trend: await T(`SELECT TO_CHAR(WEEK_END,'YYYY-MM-DD') week, SUM(BALANCE_USD) balance FROM ${BANK} GROUP BY 1 ORDER BY 1 DESC LIMIT 26`),
    forecast_13w: await T(`SELECT * FROM ${FC} ORDER BY WEEK_NO LIMIT 120`),
  }) },
  ar: { title: "accounts receivable, DSO, aging and collections", facts: async () => ({
    open_ar: (await q.arTotals())[0],
    collection_behaviour: (await T(`SELECT ROUND(100*AVG(IFF(PAID_ON_TIME,1,0)),1) on_time_pct, ROUND(AVG(DAYS_TO_PAY),1) avg_days_to_pay FROM ${AR} WHERE NOT IS_OPEN`))[0],
    aging: await T(`SELECT AGING_BUCKET, SUM(AMOUNT_USD) amount, COUNT(*) items FROM ${AR} WHERE IS_OPEN GROUP BY 1 ORDER BY 1`),
    top_overdue_customers: await T(`SELECT CUSTOMER_NAME, MAX(SEGMENT) segment, MAX(CREDIT_RISK) risk, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) overdue,
      MAX(DAYS_PAST_DUE) max_dpd FROM ${AR} WHERE IS_OPEN GROUP BY 1 HAVING overdue>0 ORDER BY overdue DESC LIMIT 10`),
    by_segment: await T(`SELECT SEGMENT, SUM(AMOUNT_USD) open_ar, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) overdue FROM ${AR} WHERE IS_OPEN GROUP BY 1 ORDER BY 2 DESC`),
    dunning: await T(`SELECT COALESCE(DUNNING_LEVEL,0) level, COUNT(*) items, SUM(AMOUNT_USD) amount FROM ${AR} WHERE IS_OPEN GROUP BY 1 ORDER BY 1`),
    dso_trend: await T(`SELECT MONTH, ROUND(SUM(DSO*REVENUE_USD)/NULLIF(SUM(REVENUE_USD),0),1) dso, SUM(AR_OVERDUE_USD) overdue FROM ${KPI} GROUP BY 1 ORDER BY 1`),
  }) },
  ap: { title: "accounts payable, DPO, aging and discounts", facts: async () => ({
    open_ap: (await q.apTotals())[0],
    payment_behaviour: (await T(`SELECT ROUND(AVG(DAYS_TO_PAY),1) avg_days_to_pay, ROUND(100*AVG(IFF(PAID_ON_TIME,1,0)),1) on_time_pct,
      SUM(DISCOUNT_CAPTURED_USD) discount_captured, SUM(DISCOUNT_LOST_USD) discount_lost FROM ${AP} WHERE NOT IS_OPEN`))[0],
    aging: await T(`SELECT AGING_BUCKET, SUM(AMOUNT_USD) amount, COUNT(*) items FROM ${AP} WHERE IS_OPEN GROUP BY 1 ORDER BY 1`),
    top_suppliers_open: await T(`SELECT SUPPLIER_NAME, MAX(CATEGORY) category, SUM(AMOUNT_USD) open_ap, SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) overdue
      FROM ${AP} WHERE IS_OPEN GROUP BY 1 ORDER BY 3 DESC LIMIT 10`),
    dpo_trend: await T(`SELECT MONTH, ROUND(SUM(DPO*PURCHASES_USD)/NULLIF(SUM(PURCHASES_USD),0),1) dpo, SUM(AP_BALANCE_USD) ap FROM ${KPI} GROUP BY 1 ORDER BY 1`),
  }) },
  "early-pay": { title: "early payment programs, dynamic discounting and supply chain finance", facts: async () => ({
    totals: (await T(`SELECT SUM(AMOUNT_USD) volume, SUM(DISCOUNT_CAPTURED_USD) discount_captured, SUM(DISCOUNT_LOST_USD) discount_lost FROM ${AP}`))[0],
    by_program: await T(`SELECT EARLY_PAY_PROGRAM, SUM(AMOUNT_USD) volume, COUNT(DISTINCT SUPPLIER_ID) suppliers, SUM(DISCOUNT_CAPTURED_USD) captured FROM ${AP} GROUP BY 1 ORDER BY 2 DESC`),
    by_outcome: await T(`SELECT PAYMENT_OUTCOME, COUNT(*) items, SUM(AMOUNT_USD) volume, SUM(DISCOUNT_CAPTURED_USD) captured FROM ${AP} GROUP BY 1 ORDER BY 3 DESC`),
    dd_annualized_yield_pct: (await T(`SELECT ROUND(100*SUM(DISCOUNT_CAPTURED_USD)/NULLIF(SUM(AMOUNT_USD),0)*365/NULLIF(AVG(GREATEST(1,DAYS_TO_PAY)),0),2) yield_pct
      FROM ${AP} WHERE PAYMENT_OUTCOME='DD Accepted'`))[0],
  }) },
  inventory: { title: "inventory value, DIO vs target and slow-moving stock", facts: async () => ({
    dio_trend: await T(`SELECT MONTH, ROUND(SUM(DIO*COGS_USD)/NULLIF(SUM(COGS_USD),0),1) dio, SUM(INVENTORY_USD) inventory FROM ${KPI} GROUP BY 1 ORDER BY 1`),
    categories_latest_month: await T(`SELECT i.INVENTORY_CATEGORY, SUM(i.INVENTORY_VALUE_USD) value, SUM(i.INVENTORY_VALUE_USD*i.SLOW_MOVING_PCT) slow_moving,
      ROUND(SUM(i.INVENTORY_VALUE_USD)/NULLIF(SUM(i.COGS_USD),0)*365/12,1) dio, MAX(c.TARGET_DIO) target_dio
      FROM ${INV} i LEFT JOIN ${INVCAT} c ON c.INVENTORY_CATEGORY=i.INVENTORY_CATEGORY WHERE i.MONTH=? GROUP BY 1 ORDER BY 2 DESC`, [LAST]),
  }) },
  opportunities: { title: "working capital improvement opportunities (cash release and P&L impact)", facts: async () => ({
    by_lever: await q.levers(),
    by_company: await T(`SELECT COMPANY, SUM(CASH_RELEASE_USD) cash_release, SUM(PNL_IMPACT_USD) pnl_impact FROM ${OPP} GROUP BY 1 ORDER BY 2 DESC`),
    top_rows: await T(`SELECT COMPANY, LEVER, AREA, CURRENT_DAYS, TARGET_DAYS, CASH_RELEASE_USD, PNL_IMPACT_USD FROM ${OPP} ORDER BY CASH_RELEASE_USD DESC LIMIT 15`),
  }) },
};
export { TOPICS };

const SYSTEM = `Before answering, check that every number and characterisation in your summary (profit vs loss, up vs down, ages, counts, totals) matches the facts and any table you include; never state a figure the facts do not support.
You are Snowflake Cortex, a working capital and treasury analyst for a multi-company group running SAP.
Data comes from SAP Business Data Cloud data products (AR/AP invoices and amounts from real journal lines)
plus DEMO ENRICHMENT for payment behaviour, early-pay programs, inventory, bank balances and partner names.
Figures are USD at fixed illustrative FX, as of 2025-03-31, period 2024-04..2025-03.

Rules:
- The JSON facts below are authoritative. Cite specific companies, customers, suppliers, levers, days and dollars. Never invent numbers.
- Lead with the direct answer in one or two sentences, then evidence (a small markdown table when comparing), then 2-4 concrete actions.
- Connect to cash: DSO/DPO/DIO changes -> cash conversion cycle -> cash released or tied up.
- When a figure relies on demo enrichment (payment behaviour, early-pay, inventory, bank balances), note it briefly.
- If the facts do not contain what is needed, say so plainly.
- Keep it under 300 words.`;

interface Job { status: "running" | "done" | "error"; answer?: string; error?: string; started: number }
const jobs = new Map<string, Job>();

async function runAsk(topic: string, args: Record<string, string>, question: string): Promise<string> {
  const t = TOPICS[topic];
  const facts = await t.facts(args);
  const qq = question?.trim() || `Analyse this ${t.title}: what stands out, why, and what should we do?`;
  const prompt = `${SYSTEM}\n\nTopic: ${t.title}\nContext: ${JSON.stringify(args)}\n\nFACTS (JSON):\n${JSON.stringify(facts).slice(0, 60000)}\n\nQuestion: ${qq}`;
  const rows = await runQuery(`SELECT AI_COMPLETE(?, ?) AS answer`, [MODEL, prompt]);
  const r = rows[0] ?? {};
  return String(r.ANSWER ?? r.answer ?? "No answer returned.");
}

router.get("/api/ask-cortex/topics", (_req, res) => {
  res.json(Object.fromEntries(Object.entries(TOPICS).map(([k, v]) => [k, v.title])));
});

router.post("/api/ask-cortex", (req: Request, res: Response) => {
  const { topic, args = {}, question = "" } = req.body ?? {};
  if (typeof topic !== "string" || !TOPICS[topic]) return res.status(400).json({ error: "unknown topic" });
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) if (typeof v === "string" && v.length < 80) clean[k] = v;
  const id = crypto.randomUUID();
  jobs.set(id, { status: "running", started: Date.now() });
  runAsk(topic, clean, String(question).slice(0, 1000))
    .then((answer) => jobs.set(id, { status: "done", answer, started: Date.now() }))
    .catch((err) => {
      // Inside the Native App, Cortex may not be enabled for the application (consumer
      // account without Cortex, model not in region, or no cross-region inference).
      // Return a readable answer instead of an error so the page degrades gracefully.
      const msg = String(err);
      if (isSpcs() && /cortex|ai_complete|complete|model|privilege|not authorized|unknown function|region/i.test(msg)) {
        console.error("Ask Cortex unavailable:", msg);
        jobs.set(id, { status: "done", started: Date.now(), answer:
          "_Ask Cortex is not available in this installation._\n\nThe app could not call Snowflake Cortex `AI_COMPLETE` " +
          `(model \`${MODEL}\`). Cortex AI functions must be available in this account and region ` +
          "(or cross-region inference enabled by an ACCOUNTADMIN: `ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION'`). " +
          "All dashboard pages and the Cortex Analyst page continue to work." });
        return;
      }
      jobs.set(id, { status: "error", error: msg, started: Date.now() });
    });
  for (const [k, j] of jobs) if (Date.now() - j.started > 3_600_000) jobs.delete(k);
  res.json({ id });
});

router.get("/api/ask-cortex/:id", (req: Request, res: Response) => {
  const j = jobs.get(String(req.params.id));
  if (!j) return res.status(404).json({ error: "job not found" });
  res.json(j);
});

export default router;
