#!/usr/bin/env python3
"""Build the SAP Working Capital 360 presales kit documents.

Mirrors the Spend 360 builder so the kits read as a set:

    00_START_HERE.docx               what is in the kit and which file to open
    01_Management_Summary.docx       customer-safe summary
    02_Demo_Scripts_by_Persona.docx  one script per persona in the room
    03_SE_Quick_Start.docx           positioning, demo path, objections
    05_Architecture_and_Install.docx the medallion stack and how to stand it up
    06_Setup_and_Access.docx         the listing, the role, access

Every figure comes from /tmp/wc_facts.json (tools/wc_facts.py) and screenshots
from /tmp/wc_shots_kit (tools/capture_shots.py). Nothing is transcribed by hand.

    python3 tools/wc_facts.py && python3 tools/capture_shots.py && python3 tools/build_presales_kit.py
"""
from __future__ import annotations

import json
import pathlib
import sys
from datetime import date

from docx import Document
from docx.shared import Inches, Pt

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from docx_kit import GREY, SAP_NAVY, SNOW_BLUE, body, bullet, callout, h1, h2, setup_page, table  # noqa: E402

KIT = pathlib.Path.home() / "Documents" / "SAP" / "Working_Capital_360_Presales_Kit"
FACTS_FILE = pathlib.Path("/tmp/wc_facts.json")
SHOTS = pathlib.Path("/tmp/wc_shots_kit")
DATE = date.today().strftime("%d %B %Y")
NAME = "SAP Working Capital 360"

SOURCES = [
    ("SAP Taulia — working capital management", "https://taulia.com/working-capital-dg-ppc/"),
    ("SAP asset — working capital solutions", "https://www.sap.com/assetdetail/2026/02/5a03ea36-3e7f-0010-bca6-c68f7e60039b.html"),
    ("SAP Learning — BDC intelligent applications", "https://learning.sap.com/courses/introducing-sap-business-data-cloud/describing-intelligent-applications"),
    ("SAP working capital solutions", "https://www.sap.com/products/financial-management/working-capital-solutions.html"),
]

PAGE_PURPOSE = {
    "Working Capital Overview": "DSO, DPO, DIO and cash conversion cycle by company and month; net working capital",
    "Cash & Liquidity": "Bank balances by house bank and account, and the 13-week cash forecast",
    "Accounts Receivable": "Open AR, aging, overdue customers, disputes, dunning and promise-to-pay",
    "Accounts Payable": "Open AP, DPO, on-time payment, discounts captured and lost",
    "Early Payment & SCF": "SAP Taulia-style dynamic discounting and supply chain finance, with a what-if",
    "Inventory": "Inventory value and DIO by category against target, slow-moving stock",
    "WC Opportunities": "Cash release and P&L impact by lever and company",
    "BDC Sources & Lineage": "Which SAP BDC data products feed each layer, with row counts",
    "Ask the Agent": "Natural-language questions over the working capital semantic view",
}


def load_facts() -> dict:
    if not FACTS_FILE.exists():
        sys.exit(f"{FACTS_FILE} missing — run tools/wc_facts.py first")
    return json.loads(FACTS_FILE.read_text())["facts"]


def usd(v) -> str:
    v = float(v)
    s = "-" if v < 0 else ""
    v = abs(v)
    return f"{s}${v / 1e6:,.2f}M" if v >= 1e6 else f"{s}${v / 1e3:,.0f}K"


def d(v) -> str:
    return f"{float(v):.1f}"


def title_block(doc, title, subtitle, strap):
    for text_, size, bold, color, after in (
        (title, 20, True, SAP_NAVY, 2), (subtitle, 11.5, False, SNOW_BLUE, 2), (strap, 9, False, GREY, 14)):
        p = doc.add_paragraph()
        r = p.add_run(text_)
        r.font.size, r.font.bold, r.font.color.rgb = Pt(size), bold, color
        p.paragraph_format.space_after = Pt(after)


def new_doc(subtitle, strap):
    doc = Document()
    setup_page(doc)
    title_block(doc, NAME, subtitle, strap)
    return doc


def shot(doc, sid, caption):
    p = SHOTS / f"{sid}.png"
    if p.exists():
        doc.add_picture(str(p), width=Inches(6.5))
        body(doc, caption, italic=True)


def honesty_callout(doc, F):
    callout(doc, "What is SAP data, and what is demo enrichment",
            "AR and AP invoices — amounts, dates, companies — come from real SAP BDC Entry View Journal "
            "Entry lines (customer debit lines are AR, supplier credit lines are AP), shared zero copy. "
            "The demo tenant leaves due dates, clearing dates and payment terms empty, so payment terms and "
            "payment behaviour, early-pay programs, inventory, bank balances and partner names are demo "
            "enrichment, filled deterministically and flagged IS_DEMO_ENRICHMENT. All amounts are USD at "
            f"{F['fx_note']}. Net working capital is negative because AP volume in the demo tenant is about "
            "3x AR — a property of the tenant, not a finding. Say this before you are asked.")


def ccc_story(F):
    L, P = F["kpi_total_latest"], F["kpi_total_prior"]
    return (f"Cash conversion cycle {d(P['CCC'])} days in {F['prior_month']} to {d(L['CCC'])} in "
            f"{F['latest_month']} (+{F['ccc_change_days']} days): DPO fell {d(P['DPO'] - L['DPO'])} days "
            f"({d(P['DPO'])} to {d(L['DPO'])}), DIO rose {d(L['DIO'] - P['DIO'])} ({d(P['DIO'])} to "
            f"{d(L['DIO'])}), DSO improved {d(P['DSO'] - L['DSO'])} ({d(P['DSO'])} to {d(L['DSO'])}).")


def headline_rows(F):
    L, J = F["kpi_total_latest"], F["highest_dio_company"]
    ap, ar = F["ap_all"], F["ar_open"]
    return [
        ["Cash conversion cycle", f"{d(L['CCC'])} days in {F['latest_month']}, +{F['ccc_change_days']} vs {F['prior_month']} "
                                  f"(DSO {d(L['DSO'])} + DIO {d(L['DIO'])} − DPO {d(L['DPO'])}, weighted)"],
        ["Highest DIO", f"{J['COMPANY']}: DIO {d(J['DIO'])}, CCC {d(J['CCC'])} days"],
        ["Open AR", f"{usd(ar['OPEN_AR_USD'])} across {ar['OPEN_ITEMS']} items; {ar['OVERDUE_PCT']}% overdue ({usd(ar['OVERDUE_USD'])})"],
        ["Open AP", f"{usd(F['ap_open']['OPEN_AP_USD'])} across {F['ap_open']['OPEN_ITEMS']} items"],
        ["Discounts", f"{usd(ap['DISC_CAPTURED_USD'])} captured, {usd(ap['DISC_LOST_USD'])} lost over the window"],
        ["Supply chain finance", f"{usd(ap['SCF_FUNDED_USD'])} of invoices funded early; dynamic discounting opportunity {usd(ap['DD_OPPORTUNITY_USD'])}"],
        ["13-week net cash", f"{usd(F['cash_13w_net_usd'])} forecast; bank balances {usd(F['bank_latest']['BALANCE_USD'])}"],
        ["Cash release", f"{usd(F['cash_release_total_usd'])} across {len(F['cash_release_by_lever'])} levers; P&L impact {usd(F['pnl_impact_total_usd'])}"],
    ]


def sources(doc):
    h1(doc, "Sources")
    for t, u in SOURCES:
        bullet(doc, f"{t}: {u}")


# ---------------------------------------------------------------- START HERE

def build_start_here(F):
    doc = new_doc("Presales kit — start here", f"SAP Partnership Compass  ·  {DATE}  ·  Owner: Dave Freriks")
    body(doc, "Working Capital 360 shows SAP finance data working as working capital intelligence on Snowflake, "
              "reached through SAP Business Data Cloud with zero copy. It mirrors the SAP BDC Working Capital "
              "Insights intelligent app — overview, cash and liquidity, receivables, payables, inventory — and adds "
              "SAP Taulia-style early-payment levers, a cash-release opportunity model and a Cortex Agent over one "
              "governed semantic view. It installs as a self-contained Native App.")
    callout(doc, "Fastest path to a demo",
            f"Ask for the {F['app_role']} role (see 06_Setup_and_Access) and open the Native App "
            f"{F['native_app']}, or install the organization listing {F['app_listing']} once it is published "
            f"(state today: {F['listing_state']}). You get a {F['app_page_count']}-page working capital app "
            f"with its data inside.")
    callout(doc, "The demo story", f"The CFO asks why the cash conversion cycle grew versus last year. {ccc_story(F)} "
                                   f"{F['highest_dio_company']['COMPANY']} carries the highest DIO. Then: overdue customers, "
                                   f"discounts lost, the SCF what-if, and {usd(F['cash_release_total_usd'])} of opportunities.")
    table(doc, ["The demo in eight numbers", "Value"], headline_rows(F), widths=[2.0, 4.7])
    body(doc, f"Every figure was read from the account on {F['verified_on']}. KPIs are for {F['latest_month']}, "
              "the latest month in the data; multi-company DSO/DPO/DIO are weighted by revenue, purchases and COGS.",
         italic=True)
    h1(doc, "Which file to open")
    table(doc, ["File", "Use it when", "Read time"], [
        ["03_SE_Quick_Start.docx", "You are demoing this week. Positioning, the ten-minute path, agent questions, objections. Start here.", "10 min"],
        ["02_Demo_Scripts_by_Persona.docx", "You know who is in the room — CFO, Treasurer, AR/Credit & Collections, AP/Procurement, SE deep-dive.", "per script"],
        ["01_Management_Summary.docx", "Leaving something with the customer or briefing an exec. Customer-safe and explicit about enrichment.", "15 min"],
        ["00_Presales_Overview.pptx", "You need slides: the problem, SAP Working Capital Insights and Taulia, the architecture, the app, the ask.", "10 slides"],
        ["SAP_Working_Capital_360_Demo.pptx", "A screenshot-led walkthrough of every page to present or leave behind.", "slides"],
        ["05_Architecture_and_Install.docx", "An architect is in the room, or you are standing it up yourself.", "reference"],
        ["06_Setup_and_Access.docx", "You need access: the Native App, the listing, the role, the local build.", "5 min"],
    ], widths=[2.1, 3.8, 0.8])
    honesty_callout(doc, F)
    h1(doc, "The companion kits")
    body(doc, "Sibling kits follow the same pattern: Finance 360, Spend 360, Sales 360, People 360 and Supply Chain 360. "
              "Working Capital pairs naturally with Finance 360 (the P&L behind the cycle) and Spend 360 (the suppliers "
              "behind DPO and the early-payment programs).")
    h1(doc, "Support")
    body(doc, f"Source and documentation: {F['repo']}. Questions: Dave Freriks.")
    out = KIT / "00_START_HERE.docx"
    doc.save(out)
    return out


# ---------------------------------------------------------- MANAGEMENT SUMMARY

def build_management_summary(F):
    doc = new_doc("Management summary", f"Working capital intelligence on SAP BDC data  ·  {DATE}")
    h1(doc, "The problem")
    body(doc, "Working capital is cash the business has already earned but cannot use: receivables not yet "
              "collected, inventory not yet sold, payables paid earlier than they need to be. CFOs and treasurers "
              "are asked why the cash conversion cycle moved and what can be released — and the answer usually "
              "sits across AR, AP, inventory and bank data in different systems, stitched together in spreadsheets.")
    h1(doc, "SAP's working capital story")
    bullet(doc, "SAP Business Data Cloud Working Capital Insights is an SAP intelligent application with overview, cash "
                "and liquidity, accounts receivable, accounts payable and inventory views, built on DSO, DPO, DIO and "
                "the cash conversion cycle, realized discounts, utilization and on-time payment.")
    bullet(doc, "SAP Taulia supplies the levers: dynamic discounting and supply chain finance to extend DPO and capture "
                "discounts, Flexible Funding, and AR finance to reduce DSO. SAP Taulia's marketing cites up to $3M of "
                "value per $1B of payables — that is SAP Taulia's claim, not a result from this demo.")
    h1(doc, "What Working Capital 360 does")
    for t in [
        "Reads SAP journal-entry, supplier-invoice, payment-terms, collections, cash-flow, bank and inventory data products through BDC Connect zero-copy shares — no extract, no second copy.",
        "Builds one governed model of receivables, payables, inventory, bank balances and a 13-week cash forecast, with DSO, DPO, DIO and CCC by company and month.",
        "Models the SAP Taulia levers — dynamic discounting, supply chain finance — with a what-if, and ranks cash-release opportunities by lever.",
        "Joins non-SAP data where Snowflake is strongest: bank feeds, credit scores, market rates, alongside the SAP data.",
        "Lets finance ask questions in plain English through a Cortex Agent over the same semantic view the dashboards use, and ships as a Native App.",
    ]:
        bullet(doc, t)
    h1(doc, "What the demo dataset shows")
    table(doc, ["Measure", "Value"], headline_rows(F), widths=[2.0, 4.7])
    h2(doc, "By company, " + F["latest_month"])
    table(doc, ["Company", "DSO", "DPO", "DIO", "CCC", "AR overdue"],
          [[c["COMPANY"], d(c["DSO"]), d(c["DPO"]), d(c["DIO"]), d(c["CCC"]), f"{c['AR_OVERDUE_PCT']}%"]
           for c in F["kpi_by_company_latest"]] +
          [["Total (weighted)", d(F["kpi_total_latest"]["DSO"]), d(F["kpi_total_latest"]["DPO"]),
            d(F["kpi_total_latest"]["DIO"]), d(F["kpi_total_latest"]["CCC"]), f"{F['ar_open']['OVERDUE_PCT']}%"]],
          widths=[1.9, 0.8, 0.8, 0.8, 0.8, 1.6])
    body(doc, ccc_story(F), italic=True)
    h2(doc, "Cash release by lever")
    table(doc, ["Lever", "Area", "Cash release", "P&L impact"],
          [[x["LEVER"], x["AREA"], usd(x["CASH_RELEASE_USD"]), usd(x["PNL_IMPACT_USD"]) if x["PNL_IMPACT_USD"] else "—"]
           for x in F["cash_release_by_lever"]], widths=[3.0, 0.8, 1.4, 1.5])
    body(doc, "Opportunities are computed from the demo data against illustrative targets; treat them as the method, not a forecast.", italic=True)
    h1(doc, "What is real, and what is demo enrichment")
    honesty_callout(doc, F)
    h1(doc, "Why Snowflake")
    for t in [
        "Zero copy: BDC Connect shares SAP data products into Snowflake; nothing is extracted or duplicated.",
        "Beyond SAP: bank statements, credit-bureau scores and market rates join the SAP data in the same governed platform.",
        "One semantic view serves the dashboards, the Cortex Agent and any BI tool — one definition of DSO everywhere.",
        "Native App distribution: the whole application installs from the internal Marketplace with governed access.",
    ]:
        bullet(doc, t)
    h1(doc, "Suggested next step")
    body(doc, "A scoped proof of value on the customer's own SAP BDC finance data products: the same medallion SQL, "
              "semantic view and agent pointed at their L0 layer, with their real payment terms and clearing data "
              "replacing the demo enrichment, and one non-SAP feed (bank or credit) joined in.")
    sources(doc)
    out = KIT / "01_Management_Summary.docx"
    doc.save(out)
    return out


# -------------------------------------------------------------- DEMO SCRIPTS

def personas(F):
    L, P, J = F["kpi_total_latest"], F["kpi_total_prior"], F["highest_dio_company"]
    top = F["top_overdue_customers"][0]
    ap, lat = F["ap_all"], F["ap_latest_month"]
    lever = F["cash_release_by_lever"][0]
    inv = F["inventory_by_category"][0]
    return [
        ("CFO", "Why did our cash conversion cycle grow versus last year?", "Working Capital Overview", [
            ("Working Capital Overview", f"CCC {d(P['CCC'])} to {d(L['CCC'])} days (+{F['ccc_change_days']}). The driver is DPO, down {d(P['DPO'] - L['DPO'])} days; DSO actually improved."),
            ("Working Capital Overview", f"Split by company: {J['COMPANY']} has the highest DIO ({d(J['DIO'])}) and CCC ({d(J['CCC'])})."),
            ("WC Opportunities", f"{usd(F['cash_release_total_usd'])} of cash release; the largest lever is '{lever['LEVER']}' at {usd(lever['CASH_RELEASE_USD'])}."),
            ("Ask the Agent", "Ask: 'Why did CCC increase in Japan Operations in 2025?'"),
        ], "The cycle is explainable in three numbers, by company, from SAP data — and the levers to reverse it are ranked."),
        ("Treasurer", "How much cash will we have in 13 weeks, and where is it?", "Cash & Liquidity", [
            ("Cash & Liquidity", f"Bank balances {usd(F['bank_latest']['BALANCE_USD'])} across {F['bank_latest']['ACCOUNTS']} accounts and {F['bank_latest']['HOUSE_BANKS']} house banks (demo enrichment)."),
            ("Cash & Liquidity", f"13-week net cash {usd(F['cash_13w_net_usd'])}: receipts minus AP, payroll and opex, by company."),
            ("Early Payment & SCF", f"SCF funded {usd(ap['SCF_FUNDED_USD'])} of invoices early without using our cash; show the what-if."),
            ("Ask the Agent", "Ask: 'What is the 13-week net cash forecast by company?'"),
        ], "In production the bank balances come from real bank feeds joined in Snowflake — the forecast becomes a daily position."),
        ("AR / Credit & Collections manager", "Which customers should we call first?", "Accounts Receivable", [
            ("Accounts Receivable", f"Open AR {usd(F['ar_open']['OPEN_AR_USD'])}, {F['ar_open']['OVERDUE_PCT']}% overdue; {usd(F['ar_open']['DISPUTED_USD'])} in dispute."),
            ("Accounts Receivable", f"Top overdue: {top['CUSTOMER_NAME']} ({top['CREDIT_RISK']} risk), {usd(top['OVERDUE_USD'])} over {top['ITEMS']} items, up to {top['MAX_DPD']} days late."),
            ("WC Opportunities", "Show the 'Reduce DSO' lever per company: collections, disputes, AR finance."),
            ("Ask the Agent", "Ask: 'Which customers have the most overdue AR?'"),
        ], "Add a credit-bureau score in Snowflake and the worklist ranks by risk, not just by amount."),
        ("AP / Procurement lead", "Are we paying suppliers at the right time?", "Accounts Payable", [
            ("Accounts Payable", f"Open AP {usd(F['ap_open']['OPEN_AP_USD'])}; {ap['ON_TIME_PCT']}% paid on time; {ap['EARLY_NO_BENEFIT_PCT']}% of payables paid early with no discount."),
            ("Accounts Payable", f"Discounts {usd(ap['DISC_CAPTURED_USD'])} captured, {usd(ap['DISC_LOST_USD'])} lost; in {F['latest_month']} alone {usd(lat['DISC_LOST_USD'])} was lost."),
            ("Early Payment & SCF", f"Dynamic discounting accepted at ~{F['dd_effective_apr']['APR_PCT']}% effective APR; {usd(ap['DD_OPPORTUNITY_USD'])} further opportunity."),
            ("Ask the Agent", "Ask: 'How much discount did we lose by program?'"),
        ], "SAP Taulia turns the lost-discount line into captured yield or longer DPO — this shows where to start."),
        ("SE technical deep-dive", "How is this built, and could it run on our data?", "BDC Sources & Lineage", [
            ("BDC Sources & Lineage", f"{F['lineage_counts']['ACCTG']:,} journal-entry lines from the Entry View Journal Entry data product become {F['lineage_counts']['DT_AR']:,} AR and {F['lineage_counts']['DT_AP']:,} AP items."),
            ("Inventory", f"Explain enrichment honestly: inventory is modelled; {inv['INVENTORY_CATEGORY']} DIO {d(inv['DIO'])} vs target {inv['TARGET_DIO']}."),
            ("Ask the Agent", f"Ask a question, expand the SQL: the semantic view has {F['semantic_view'].get('metric', 0)} metrics over {F['semantic_view'].get('table', 0)} tables."),
        ], "The deliverable is SQL, a semantic view, an agent and a Native App. Swap L0 for your BDC data products."),
    ]


def build_demo_scripts(F):
    doc = new_doc("Demo scripts by persona", f"Five scripts, each opening on a different page  ·  {DATE}")
    body(doc, "Pick the script for the most senior person in the room. Each runs five to eight minutes. "
              "All figures are the latest month, USD, all companies.")
    honesty_callout(doc, F)
    for name, question, opener, steps, close in personas(F):
        h1(doc, name)
        body(doc, f"Their question: {question}", italic=True)
        body(doc, f"Open on: {opener}")
        table(doc, ["#", "Page", "Do and say"], [[str(i), p, t] for i, (p, t) in enumerate(steps, 1)],
              widths=[0.3, 1.8, 4.6])
        callout(doc, "Close with", close)
    out = KIT / "02_Demo_Scripts_by_Persona.docx"
    doc.save(out)
    return out


# --------------------------------------------------------------- QUICK START

def build_quick_start(F):
    L, J = F["kpi_total_latest"], F["highest_dio_company"]
    ap = F["ap_all"]
    doc = new_doc("SE quick start", f"Ten-minute demo path, the agent's scope, and objection handling  ·  {DATE}")
    body(doc, "Read once, the day before you demo. It assumes you have not opened the app.")
    h1(doc, "Positioning, in three sentences")
    bullet(doc, "SAP BDC Working Capital Insights gives finance DSO, DPO, DIO and the cash conversion cycle across AR, AP, "
                "inventory and cash; SAP Taulia gives the levers — dynamic discounting, supply chain finance, Flexible "
                "Funding and AR finance.")
    bullet(doc, "BDC Connect shares the SAP finance data products into Snowflake with zero copy.")
    bullet(doc, "Snowflake adds what SAP alone does not: non-SAP data joined in (bank feeds, credit scores), a Cortex Agent "
                "over a governed semantic view, and Native App distribution.")
    h1(doc, "Before you start")
    bullet(doc, f"Open the Native App {F['native_app']} (role {F['app_role']}) or the local build at {F['app_dev_url']}. Open it once to warm the container.")
    bullet(doc, f"Set the period so it ends at {F['latest_month']}, the latest month; the data runs {F['window']['FIRST_MONTH']} to {F['window']['LAST_MONTH']}.")
    bullet(doc, "Decide how you will introduce the demo enrichment and the negative net working capital. Say it on the Overview.")
    honesty_callout(doc, F)
    h1(doc, "The ten-minute path: why did the cash conversion cycle grow?")
    table(doc, ["#", "Page", "Do and say", "Time"], [
        ["1", "Working Capital Overview", f"{ccc_story(F)}", "2 min"],
        ["2", "Working Capital Overview", f"By company: {J['COMPANY']} has the highest DIO ({d(J['DIO'])}).", "1 min"],
        ["3", "Accounts Receivable", f"{F['ar_open']['OVERDUE_PCT']}% of open AR overdue; top customer {F['top_overdue_customers'][0]['CUSTOMER_NAME']}.", "1 min"],
        ["4", "Accounts Payable", f"{usd(ap['DISC_LOST_USD'])} of discounts lost against {usd(ap['DISC_CAPTURED_USD'])} captured.", "1 min"],
        ["5", "Early Payment & SCF", f"SCF funded {usd(ap['SCF_FUNDED_USD'])}; run the what-if. Name SAP Taulia.", "2 min"],
        ["6", "WC Opportunities", f"{usd(F['cash_release_total_usd'])} of cash release by lever.", "1 min"],
        ["7", "Ask the Agent", "Ask the Japan CCC question, then expand the SQL.", "1 min"],
        ["8", "BDC Sources & Lineage", "Close for a technical room: the zero-copy proof.", "1 min"],
    ], widths=[0.3, 1.6, 4.1, 0.7])
    shot(doc, "overview", "Working Capital Overview, as captured from the running app.")
    shot(doc, "early-pay", "Early Payment & SCF — the SAP Taulia levers.")
    h2(doc, "The questions the agent ships with")
    body(doc, "Read from the app's source, so these are exactly the chips on screen.")
    for q in F["agent_questions"]:
        bullet(doc, q)
    sv = F["semantic_view"]
    callout(doc, "What the agent knows", f"Ask the Agent reads {sv['name']}: {sv.get('table', 0)} tables "
            f"({', '.join(sv['tables_list'])}), {sv.get('dimension', 0)} dimensions, {sv.get('fact', 0)} facts and "
            f"{sv.get('metric', 0)} metrics. The agent is {F['agents'][0]}.")
    h1(doc, "What is on each page")
    table(doc, ["Page", "What it shows"], [[p, PAGE_PURPOSE.get(p, "—")] for p in F["app_pages"]], widths=[1.9, 4.8])
    h1(doc, "Discovery questions")
    for q in ["How long does it take to explain a move in DSO, DPO or DIO to the CFO today?",
              "Do you run an early-payment or supply chain finance program — SAP Taulia or another provider?",
              "What share of supplier discounts do you capture, and do you know what you lose?",
              "Where do bank balances come from for the cash forecast, and how often?",
              "Do collections use external credit scores, and where do they live?",
              "Are you on RISE with SAP, and is Business Data Cloud part of that subscription?"]:
        bullet(doc, q)
    h1(doc, "Objections, and what to say")
    table(doc, ["They say", "You say"], [
        ["Why is net working capital negative?", "AP volume in the demo tenant is about 3x AR. It is a property of the demo data, not a finding."],
        ["Are the payment terms and bank balances real?", "No — the demo tenant leaves terms and clearing dates empty, so they are deterministic demo enrichment. Invoice amounts and dates are real BDC journal lines."],
        ["What exchange rate did you use?", f"Fixed illustrative rates ({F['fx_note']}). In production use the customer's own rates (SAP TCURR)."],
        ["SAP already has Working Capital Insights.", "Yes, and this follows it. Snowflake adds non-SAP data, a governed agent, and distribution — on the same BDC data products, zero copy."],
        ["Is the $3M per $1B figure yours?", "No. It is SAP Taulia's marketing claim. Our numbers are the demo tenant's, computed live."],
        ["Can we point it at our data?", "Yes — that is the proof of value: swap L0 for your BDC data products and your real terms replace the enrichment."],
    ], widths=[2.0, 4.7])
    h1(doc, "If it goes wrong")
    bullet(doc, "A page is empty — check the Company filter and the period; they persist across pages.")
    bullet(doc, "Numbers differ from this kit — check the period ends at the latest month; the kit is regenerated from the account.")
    bullet(doc, "The agent is slow on first question — the warehouse is resuming; ask again.")
    sources(doc)
    out = KIT / "03_SE_Quick_Start.docx"
    doc.save(out)
    return out


# ------------------------------------------------- ARCHITECTURE AND INSTALL

def build_architecture(F):
    sv = F["semantic_view"]
    lc = F["lineage_counts"]
    doc = new_doc("Architecture and install", f"The medallion stack, every object, and the build order  ·  {DATE}")
    body(doc, f"Everything sits inside Snowflake and reads SAP finance data through BDC Connect zero-copy shares. "
              f"Object counts were read from the account on {F['verified_on']}.")
    h1(doc, "The stack")
    table(doc, ["Layer", "Objects", "What it does"], [
        ["L0 Bronze", "SAP BDC data products", f"Entry View Journal Entry ({lc['ACCTG']:,} lines), Supplier Invoice ({lc['SUPINV']}), Payment Terms, Billing Document, Collections Worklist Item, Dispute Case, Promise To Pay, Cash Flow, Bank Account, House Bank, Physical Inventory Document — shared zero copy"],
        ["L1 Silver", f"{len(F['l1_objects'])} views in SAP_BDC_L1", ", ".join(o["TABLE_NAME"] for o in F["l1_objects"])],
        ["L2 Gold", f"{len(F['analytics_objects'])} objects in ANALYTICS", ", ".join(o["TABLE_NAME"] for o in F["analytics_objects"])],
        ["Semantic", sv["name"].split(".", 1)[1], f"{sv.get('table', 0)} tables, {sv.get('dimension', 0)} dimensions, {sv.get('fact', 0)} facts, {sv.get('metric', 0)} metrics"],
        ["Agent", F["agents"][0], "Cortex Agent behind Ask the Agent"],
        ["App", f"{F['app_page_count']} pages", f"React + Express, packaged as Native App {F['native_app']} from {F['app_package']}"],
    ], widths=[0.9, 2.0, 3.8])
    h1(doc, "Dynamic tables")
    table(doc, ["Dynamic table", "Target lag", "Refresh mode"],
          [[x["name"], x["target_lag"], x["refresh_mode"]] for x in F["dynamic_tables"]], widths=[2.8, 1.8, 2.1])
    body(doc, "DIM_* tables and DT_BANK_BALANCE_WEEKLY are base tables holding demo enrichment; V_WC_OPPORTUNITIES is a view.")
    h1(doc, "How the KPIs are computed")
    for t in ["AR items are customer debit lines of Entry View Journal Entry; AP items are supplier credit lines.",
              "DSO, DPO and DIO are trailing ratios per company and month in DT_WC_MONTHLY_KPI. Across companies they are weighted — DSO by revenue, DPO by purchases, DIO by COGS — and CCC = DSO + DIO − DPO.",
              "Discounts captured and lost, SCF funding and dynamic-discounting opportunity are computed per AP item from its (enriched) terms and early-pay program.",
              "The 13-week forecast (DT_CASH_FORECAST) projects receipts from open AR and payments from open AP plus payroll and opex.",
              f"All amounts are USD at {F['fx_note']} (DIM_COMPANY.RATE_TO_USD)."]:
        bullet(doc, t)
    honesty_callout(doc, F)
    h1(doc, "Build order")
    table(doc, ["Step", "What to run", "Result"], [
        ["1", "scripts/run_sql.py sql/02_l1_curated_views.sql", "SAP_BDC_L1 views over the BDC shares"],
        ["2", "scripts/run_sql.py sql/03_l2_analytics_enrichment.sql", "Dynamic tables, dimensions, opportunities view"],
        ["3", "scripts/run_sql.py sql/04_semantic_view.sql", sv["name"].split(".", 1)[1]],
        ["4", "scripts/run_sql.py sql/05_cortex_agent.sql", F["agents"][0]],
        ["5", "scripts/migrate_data.py, build_and_push.sh", "Bundled data and the working_capital_360 image"],
        ["6", "scripts/deploy_native_app.py", f"{F['app_package']} → {F['native_app']}"],
        ["7", "scripts/create_org_listing.py", f"Organization listing {F['app_listing']}"],
    ], widths=[0.5, 3.2, 3.0])
    body(doc, "run_sql.py uses the key-pair entry in ~/.snowflake/connections.toml. After step 4 you can demo through "
              "Snowflake Intelligence without the app.")
    shot(doc, "lineage", "BDC Sources & Lineage — the zero-copy path, with row counts per data product.")
    out = KIT / "05_Architecture_and_Install.docx"
    doc.save(out)
    return out


# ------------------------------------------------------------- SETUP, ACCESS

def build_setup(F):
    doc = new_doc("Setup and access", f"The Native App, the listing, the role, and the local build  ·  {DATE}")
    h1(doc, "How to get to it")
    table(doc, ["Route", "What you get", "Notes"], [
        ["Native App (demo account)", f"The {F['app_page_count']}-page app with data bundled in.",
         f"{F['native_app']} in {F['account']}; ask for role {F['app_role']}"],
        ["Organization listing", "Install into your own account from the internal Marketplace.", f"{F['app_listing']} — state: {F['listing_state']}"],
        ["Local build", "The dev app for rehearsal and screenshots.", f"client {F['app_dev_url']}, API {F['api_url']}"],
        ["Public static build", "A credential-free build; Ask the Agent will not answer.", F["public_url"]],
        ["Your own account", "Run the SQL and demo via Snowflake Intelligence.", "See 05_Architecture_and_Install"],
    ], widths=[1.5, 2.8, 2.4])
    h1(doc, "Getting access (provision-360-access pattern)")
    for t in [f"Request access in Slack; an admin runs the provision-360-access skill for Working Capital 360.",
              f"It creates or reuses your Snowflake user and grants the application role through {F['app_role']}.",
              "Credentials and the app URL arrive in a private Slack DM — never in a channel.",
              f"Open Snowsight → Data Products → Apps → {F['native_app']}, and launch the app."]:
        bullet(doc, t)
    h1(doc, "Snowflake objects")
    table(doc, ["Object", "Detail"], [
        ["Database", "SAP_WORKING_CAPITAL_360"],
        ["L1", f"{len(F['l1_objects'])} views in SAP_BDC_L1"],
        ["ANALYTICS", f"{len(F['analytics_objects'])} objects, {len(F['dynamic_tables'])} dynamic tables"],
        ["Semantic view", F["semantic_view"]["name"]],
        ["Agent", F["agents"][0]],
        ["Application package", f"{F['app_package']} ({'exists' if F['app_package_exists'] else 'missing'})"],
        ["Native App", f"{F['native_app']} ({'installed' if F['native_app_installed'] else 'deployment in progress'})"],
        ["Account checked", f"{F['account']} ({F['region']})"],
    ], widths=[1.6, 5.1])
    honesty_callout(doc, F)
    h1(doc, "Related assets")
    table(doc, ["Asset", "Where"], [
        ["Finance 360 kit", "The P&L behind the cycle — Compass"],
        ["Spend 360 kit", "Suppliers behind DPO and early-pay programs — Compass"],
        ["Sales, People and Supply Chain 360 kits", "Same pattern, other domains — Compass"],
    ], widths=[2.4, 4.3])
    h1(doc, "Contact")
    body(doc, "Dave Freriks — for access, or to scope pointing this at a customer's own BDC finance data.")
    out = KIT / "06_Setup_and_Access.docx"
    doc.save(out)
    return out


def main() -> int:
    F = load_facts()
    KIT.mkdir(parents=True, exist_ok=True)
    for fn in (build_start_here, build_management_summary, build_demo_scripts, build_quick_start,
               build_architecture, build_setup):
        print(f"wrote {fn(F)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
