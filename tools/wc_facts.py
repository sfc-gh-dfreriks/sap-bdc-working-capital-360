#!/usr/bin/env python3
"""Extract every figure the Working Capital 360 deliverables quote, with its provenance.

Mirrors tools/spend_facts.py in sap-bdc-spend-360. Nothing in the kit or decks is
typed by hand: each figure is read live from SAP_WORKING_CAPITAL_360 and stamped
with the query that produced it.

Working Capital 360 specifics:
  1. DSO/DPO/DIO in DT_WC_MONTHLY_KPI are trailing ratios, so multi-company values
     are weighted: DSO by REVENUE_USD, DPO by PURCHASES_USD, DIO by COGS_USD
     (the same weighting the app uses). CCC = DSO + DIO - DPO.
  2. AR/AP invoice amounts and dates are real BDC Entry View Journal Entry lines;
     terms, payment behaviour, early-pay programs, inventory, bank balances and
     partner names are demo enrichment (IS_DEMO_ENRICHMENT). USD at fixed FX.

Writes /tmp/wc_facts.json.   Usage: python3 tools/wc_facts.py [--print]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import tomllib
import urllib.request

import snowflake.connector

CONN = "dfreriksdemo"
DB = "SAP_WORKING_CAPITAL_360"
A = f"{DB}.ANALYTICS"
SV = f"{DB}.SEMANTIC.SAP_WORKING_CAPITAL_360_ANALYTICS"
OUT = pathlib.Path("/tmp/wc_facts.json")
REPO = "https://github.com/sfc-gh-dfreriks/sap-bdc-working-capital-360"
PUBLIC_URL = "https://sfc-gh-dfreriks.github.io/working-capital-360-public/"
NATIVE_APP = "WORKING_CAPITAL_360_APP"
APP_PACKAGE = "WORKING_CAPITAL_360_PKG"
APP_LISTING = "WORKING_CAPITAL_360_ORG"
APP_ROLE = "WORKING_CAPITAL_360_APP_USERS"
LATEST, PRIOR = "2025-03", "2024-03"

APP = pathlib.Path.home() / "Documents" / "SAP" / "SAP Skills" / "working_capital_360_react"
SIDEBAR = APP / "client" / "src" / "components" / "Sidebar.tsx"
ANALYST_PAGE = APP / "client" / "src" / "pages" / "Analyst.tsx"
APP_DEV_URL = "http://localhost:5185"
API_URL = "http://localhost:3010"


def conn_params(name: str) -> dict:
    path = pathlib.Path.home() / ".snowflake" / "connections.toml"
    c = dict(tomllib.loads(path.read_text())[name])
    if "private_key_path" in c:
        c["private_key_file"] = str(pathlib.Path(c.pop("private_key_path")).expanduser())
    c.pop("database", None)
    c.pop("schema", None)
    return c


def clean(v):
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()[:10]
    if isinstance(v, list):
        return [clean(x) for x in v]
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if hasattr(v, "normalize"):
        return float(v)
    return v


class Facts:
    def __init__(self, cur):
        self.cur, self.data, self.provenance = cur, {}, {}

    def rows(self, key, sql, source):
        self.cur.execute(sql)
        cols = [d[0] for d in self.cur.description]
        self.data[key] = [{c: clean(v) for c, v in zip(cols, r)} for r in self.cur.fetchall()]
        self.provenance[key] = source
        return self.data[key]

    def one(self, key, sql, source):
        r = self.rows(key, sql, source)
        self.data[key] = r[0] if r else None
        return self.data[key]

    def put(self, key, value, source):
        self.data[key] = clean(value)
        self.provenance[key] = source
        return self.data[key]


WEIGHTED = """
  ROUND(SUM(DSO*REVENUE_USD)/NULLIF(SUM(REVENUE_USD),0),1) AS DSO,
  ROUND(SUM(DPO*PURCHASES_USD)/NULLIF(SUM(PURCHASES_USD),0),1) AS DPO,
  ROUND(SUM(DIO*COGS_USD)/NULLIF(SUM(COGS_USD),0),1) AS DIO,
  SUM(AR_BALANCE_USD) AR_BALANCE_USD, SUM(AR_OVERDUE_USD) AR_OVERDUE_USD,
  SUM(AP_BALANCE_USD) AP_BALANCE_USD, SUM(INVENTORY_USD) INVENTORY_USD,
  SUM(NET_WORKING_CAPITAL_USD) NWC_USD, SUM(REVENUE_USD) REVENUE_USD,
  SUM(DISCOUNT_CAPTURED_USD) DISC_CAPTURED_USD, SUM(DISCOUNT_LOST_USD) DISC_LOST_USD"""


def collect(cur) -> Facts:
    f = Facts(cur)
    K = f"{A}.DT_WC_MONTHLY_KPI"
    f.rows("kpi_by_company_latest", f"""
        SELECT COMPANY_CODE, COMPANY, REGION, DSO, DPO, DIO, CCC, AR_BALANCE_USD, AR_OVERDUE_USD,
               ROUND(AR_OVERDUE_PCT*100,1) AR_OVERDUE_PCT, AP_BALANCE_USD, INVENTORY_USD,
               NET_WORKING_CAPITAL_USD, DISCOUNT_CAPTURED_USD, DISCOUNT_LOST_USD
        FROM {K} WHERE MONTH='{LATEST}' ORDER BY COMPANY_CODE""", f"{K}, MONTH={LATEST}")
    f.rows("kpi_by_company_prior", f"""
        SELECT COMPANY_CODE, COMPANY, DSO, DPO, DIO, CCC FROM {K} WHERE MONTH='{PRIOR}' ORDER BY 1""",
           f"{K}, MONTH={PRIOR}")
    for key, m in (("kpi_total_latest", LATEST), ("kpi_total_prior", PRIOR)):
        t = f.one(key, f"SELECT {WEIGHTED} FROM {K} WHERE MONTH='{m}'",
                  f"{K}, MONTH={m}, weighted DSO/REVENUE, DPO/PURCHASES, DIO/COGS")
        t["CCC"] = round(t["DSO"] + t["DIO"] - t["DPO"], 1)
    lat, pri = f.data["kpi_total_latest"], f.data["kpi_total_prior"]
    f.put("ccc_change_days", round(lat["CCC"] - pri["CCC"], 1), "weighted CCC latest - prior year")
    f.put("latest_month", LATEST, "constant")
    f.put("prior_month", PRIOR, "constant")
    comps = f.data["kpi_by_company_latest"]
    f.put("highest_dio_company", max(comps, key=lambda c: c["DIO"]), "max DIO in latest month")
    f.put("highest_ccc_company", max(comps, key=lambda c: c["CCC"]), "max CCC in latest month")
    f.one("window", f"SELECT MIN(MONTH) FIRST_MONTH, MAX(MONTH) LAST_MONTH, COUNT(DISTINCT MONTH) MONTHS FROM {K}", K)

    # ---- AR --------------------------------------------------------------
    AR = f"{A}.DT_AR_ITEMS"
    f.one("ar_open", f"""SELECT COUNT(*) OPEN_ITEMS, SUM(AMOUNT_USD) OPEN_AR_USD,
        SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0)) OVERDUE_USD,
        ROUND(100*SUM(IFF(DAYS_PAST_DUE>0,AMOUNT_USD,0))/NULLIF(SUM(AMOUNT_USD),0),1) OVERDUE_PCT,
        SUM(IFF(IS_DISPUTED,AMOUNT_USD,0)) DISPUTED_USD FROM {AR} WHERE IS_OPEN""", f"{AR}, IS_OPEN")
    f.one("ar_all", f"""SELECT COUNT(*) ITEMS, COUNT(DISTINCT CUSTOMER_ID) CUSTOMERS,
        ROUND(100*AVG(IFF(PAID_ON_TIME,1,0)),1) ON_TIME_PCT FROM {AR} WHERE NOT IS_OPEN""", f"{AR}, cleared items")
    f.rows("ar_aging", f"""SELECT AGING_BUCKET, COUNT(*) ITEMS, SUM(AMOUNT_USD) USD FROM {AR}
        WHERE IS_OPEN GROUP BY 1 ORDER BY 3 DESC""", f"{AR}, open by AGING_BUCKET")
    f.rows("top_overdue_customers", f"""SELECT CUSTOMER_NAME, CREDIT_RISK, COUNT(*) ITEMS,
        SUM(AMOUNT_USD) OVERDUE_USD, MAX(DAYS_PAST_DUE) MAX_DPD FROM {AR}
        WHERE IS_OPEN AND DAYS_PAST_DUE>0 GROUP BY 1,2 ORDER BY 4 DESC LIMIT 5""", f"{AR}, open overdue by customer")

    # ---- AP --------------------------------------------------------------
    AP = f"{A}.DT_AP_ITEMS"
    f.one("ap_open", f"""SELECT COUNT(*) OPEN_ITEMS, SUM(AMOUNT_USD) OPEN_AP_USD FROM {AP} WHERE IS_OPEN""", f"{AP}, IS_OPEN")
    f.one("ap_all", f"""SELECT COUNT(*) ITEMS, COUNT(DISTINCT SUPPLIER_ID) SUPPLIERS,
        SUM(AMOUNT_USD) PAID_USD, ROUND(100*AVG(IFF(PAID_ON_TIME,1,0)),1) ON_TIME_PCT,
        SUM(DISCOUNT_CAPTURED_USD) DISC_CAPTURED_USD, SUM(DISCOUNT_LOST_USD) DISC_LOST_USD,
        SUM(SCF_FUNDED_USD) SCF_FUNDED_USD, SUM(DD_OPPORTUNITY_USD) DD_OPPORTUNITY_USD,
        ROUND(100*SUM(IFF(PAID_EARLY_NO_BENEFIT,AMOUNT_USD,0))/NULLIF(SUM(AMOUNT_USD),0),1) EARLY_NO_BENEFIT_PCT
        FROM {AP} WHERE NOT IS_OPEN""", f"{AP}, paid items, full window")
    f.one("ap_latest_month", f"""SELECT SUM(DISCOUNT_CAPTURED_USD) DISC_CAPTURED_USD,
        SUM(DISCOUNT_LOST_USD) DISC_LOST_USD, SUM(SCF_FUNDED_USD) SCF_FUNDED_USD,
        SUM(DD_OPPORTUNITY_USD) DD_OPPORTUNITY_USD FROM {AP} WHERE INVOICE_MONTH='{LATEST}'""",
          f"{AP}, INVOICE_MONTH={LATEST}")
    f.rows("ap_by_program", f"""SELECT EARLY_PAY_PROGRAM, COUNT(*) ITEMS, SUM(AMOUNT_USD) USD,
        SUM(DISCOUNT_CAPTURED_USD) CAPTURED_USD, SUM(DISCOUNT_LOST_USD) LOST_USD,
        SUM(SCF_FUNDED_USD) SCF_USD, SUM(DD_OPPORTUNITY_USD) DD_OPP_USD FROM {AP}
        GROUP BY 1 ORDER BY 3 DESC""", f"{AP}, by EARLY_PAY_PROGRAM, full window")
    f.one("dd_effective_apr", f"""SELECT ROUND(100*SUM(DISCOUNT_CAPTURED_USD)/NULLIF(SUM(AMOUNT_USD*
        GREATEST(TERMS_DAYS-DAYS_TO_PAY,1)/365),0),1) APR_PCT FROM {AP} WHERE PAYMENT_OUTCOME='DD Accepted'""",
          f"{AP}, DD Accepted: captured / (amount x days accelerated / 365)")

    # ---- inventory, cash, opportunities ------------------------------------
    INV = f"{A}.DT_INVENTORY_MONTHLY"
    f.rows("inventory_by_category", f"""SELECT i.INVENTORY_CATEGORY, SUM(INVENTORY_VALUE_USD) VALUE_USD,
        ROUND(SUM(INVENTORY_VALUE_USD)/NULLIF(SUM(i.COGS_USD),0)*365/12,1) DIO, MAX(c.TARGET_DIO) TARGET_DIO
        FROM {INV} i JOIN {A}.DIM_INVENTORY_CATEGORY c USING (INVENTORY_CATEGORY)
        WHERE MONTH='{LATEST}' GROUP BY 1 ORDER BY 2 DESC""", f"{INV} x DIM_INVENTORY_CATEGORY, {LATEST}")
    CF = f"{A}.DT_CASH_FORECAST"
    f.rows("cash_13w_by_company", f"""SELECT COMPANY, SUM(AR_RECEIPTS_USD) RECEIPTS_USD,
        SUM(AP_PAYMENTS_USD+PAYROLL_USD+OTHER_OPEX_USD) OUTFLOWS_USD,
        SUM(AR_RECEIPTS_USD-AP_PAYMENTS_USD-PAYROLL_USD-OTHER_OPEX_USD) NET_USD,
        MIN(WEEK_END) FIRST_WEEK, MAX(WEEK_END) LAST_WEEK, COUNT(DISTINCT WEEK_NO) WEEKS
        FROM {CF} GROUP BY 1 ORDER BY 1""", f"{CF}, receipts - AP - payroll - opex")
    f.put("cash_13w_net_usd", sum(r["NET_USD"] for r in f.data["cash_13w_by_company"]), "sum of cash_13w_by_company")
    BB = f"{A}.DT_BANK_BALANCE_WEEKLY"
    f.one("bank_latest", f"""SELECT MAX(WEEK_END) WEEK_END, SUM(BALANCE_USD) BALANCE_USD, COUNT(*) ACCOUNTS,
        COUNT(DISTINCT HOUSE_BANK) HOUSE_BANKS FROM {BB} WHERE WEEK_END=(SELECT MAX(WEEK_END) FROM {BB})""", BB)
    OP = f"{A}.V_WC_OPPORTUNITIES"
    f.rows("cash_release_by_lever", f"""SELECT LEVER, AREA, SUM(CASH_RELEASE_USD) CASH_RELEASE_USD,
        SUM(PNL_IMPACT_USD) PNL_IMPACT_USD FROM {OP} GROUP BY 1,2 ORDER BY 3 DESC""", OP)
    f.put("cash_release_total_usd", sum(r["CASH_RELEASE_USD"] for r in f.data["cash_release_by_lever"]), f"sum {OP}")
    f.put("pnl_impact_total_usd", sum(r["PNL_IMPACT_USD"] for r in f.data["cash_release_by_lever"]), f"sum {OP}")
    f.rows("opportunities", f"SELECT * FROM {OP} ORDER BY CASH_RELEASE_USD DESC", OP)
    f.rows("companies", f"SELECT COMPANY_CODE, COMPANY, CURRENCY, REGION, RATE_TO_USD FROM {A}.DIM_COMPANY ORDER BY 1",
           f"{A}.DIM_COMPANY")
    f.one("lineage_counts", f"SELECT * FROM {A}.LINEAGE_COUNTS", f"{A}.LINEAGE_COUNTS")

    # ---- platform ----------------------------------------------------------
    f.rows("analytics_objects", f"""SELECT TABLE_NAME, TABLE_TYPE, ROW_COUNT FROM {DB}.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA='ANALYTICS' ORDER BY 1""", "INFORMATION_SCHEMA.TABLES ANALYTICS")
    f.rows("l1_objects", f"""SELECT TABLE_NAME FROM {DB}.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA='SAP_BDC_L1' ORDER BY 1""", "INFORMATION_SCHEMA.TABLES SAP_BDC_L1")
    cur.execute(f"SHOW DYNAMIC TABLES IN DATABASE {DB}")
    cols = [d[0] for d in cur.description]
    dts = [dict(zip(cols, r)) for r in cur.fetchall()]
    f.put("dynamic_tables", [{"name": d["name"], "target_lag": d["target_lag"], "refresh_mode": d["refresh_mode"]}
                             for d in sorted(dts, key=lambda d: d["name"])], "SHOW DYNAMIC TABLES")
    cur.execute(f"DESCRIBE SEMANTIC VIEW {SV}")
    cols = [d[0].lower() for d in cur.description]
    kinds: dict = {}
    for r in cur.fetchall():
        d = dict(zip(cols, r))
        if d.get("object_kind"):
            kinds.setdefault(d["object_kind"], set()).add((d.get("parent_entity"), d["object_name"]))
    sv = {"name": SV, **{k.lower(): len(v) for k, v in kinds.items()},
          "tables_list": sorted(n for _, n in kinds.get("TABLE", []))}
    f.put("semantic_view", sv, "DESCRIBE SEMANTIC VIEW")
    cur.execute(f"SHOW AGENTS IN DATABASE {DB}")
    f.put("agents", [f"{r[3]}.{r[1]}" if len(r) > 3 else r[1] for r in cur.fetchall()], "SHOW AGENTS")
    try:
        cur.execute(f"SHOW APPLICATIONS LIKE '{NATIVE_APP}'")
        f.put("native_app_installed", bool(cur.fetchall()), "SHOW APPLICATIONS")
    except Exception:  # noqa: BLE001
        f.put("native_app_installed", False, "SHOW APPLICATIONS")
    cur.execute(f"SHOW APPLICATION PACKAGES LIKE '{APP_PACKAGE}'")
    f.put("app_package_exists", bool(cur.fetchall()), "SHOW APPLICATION PACKAGES")
    cur.execute(f"SHOW LISTINGS LIKE '%{APP_LISTING}%'")
    lst = cur.fetchall()
    f.put("listing_state", (lst[0][cur.description.index(next(d for d in cur.description if d[0] == 'state'))]
                            if lst else "not yet published"), "SHOW LISTINGS")
    cur.execute("SELECT CURRENT_ACCOUNT(), CURRENT_REGION()")
    acct, region = cur.fetchone()
    f.put("account", acct, "CURRENT_ACCOUNT()")
    f.put("region", region, "CURRENT_REGION()")

    # ---- app source ---------------------------------------------------------
    f.put("app_pages", re.findall(r"label: '([^']+)'", SIDEBAR.read_text()), str(SIDEBAR))
    f.put("app_page_count", len(f.data["app_pages"]), str(SIDEBAR))
    src = ANALYST_PAGE.read_text()
    f.put("agent_questions", re.findall(r"'([^']+\?)'", src)[:8], str(ANALYST_PAGE))
    try:
        with urllib.request.urlopen(APP_DEV_URL, timeout=5) as r:
            f.put("app_dev_status", r.status, f"GET {APP_DEV_URL}")
    except Exception as e:  # noqa: BLE001
        f.put("app_dev_status", f"not reachable: {str(e)[:50]}", f"GET {APP_DEV_URL}")
    for k, v in (("app_dev_url", APP_DEV_URL), ("api_url", API_URL), ("repo", REPO), ("public_url", PUBLIC_URL),
                 ("native_app", NATIVE_APP), ("app_package", APP_PACKAGE), ("app_listing", APP_LISTING),
                 ("app_role", APP_ROLE), ("fx_note", "fixed illustrative rates: EUR 1.08, JPY 0.0067 USD")):
        f.put(k, v, "constant")
    f.put("verified_on", dt.date.today().isoformat(), "extraction date")
    return f


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", action="store_true", dest="show")
    args = ap.parse_args()
    cn = snowflake.connector.connect(**conn_params(CONN))
    try:
        f = collect(cn.cursor())
    finally:
        cn.close()
    OUT.write_text(json.dumps({"facts": f.data, "provenance": f.provenance}, indent=2, default=str))
    print(f"wrote {OUT}  ({len(f.data)} facts)")
    if args.show:
        for k, v in f.data.items():
            print(f"{k:26s} {json.dumps(v, default=str)[:150]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
