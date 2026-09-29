#!/usr/bin/env python3
"""Build the SAP Working Capital 360 presales decks on the SAP branded template.

    00_Presales_Overview.pptx          ten slides: problem, SAP + Taulia, architecture, app, story, ask
    SAP_Working_Capital_360_Demo.pptx  screenshot-led walkthrough of every page

Figures come from /tmp/wc_facts.json and screenshots from /tmp/wc_shots_kit, so
neither deck can drift from the account or the application. Mirrors the Spend
360 deck builder.

    python3 tools/wc_facts.py && python3 tools/capture_shots.py && python3 tools/build_decks.py
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _deck_helpers import (  # noqa: E402
    BODY_GREY, DK1, DK2, FULLW, LEFT, LIGHT_BG, MSO_SHAPE, RED, SF_BLUE, TEAL, TOP,
    VIOLET, WHITE, add_shape_text, banner, box, caption, card, content,
    new_presentation, note, picture, set_ph, stack, stat, verify_deck, verify_slide,
)

FACTS = pathlib.Path("/tmp/wc_facts.json")
SHOTS = pathlib.Path("/tmp/wc_shots_kit")
KIT = pathlib.Path.home() / "Documents" / "SAP" / "Working_Capital_360_Presales_Kit"
HONEST = ("AR/AP invoices are real BDC journal lines; terms, payment behaviour, early-pay programs, "
          "inventory, bank balances and partner names are demo enrichment. USD at fixed FX.")


def load():
    f = json.loads(FACTS.read_text())["facts"]
    shots = {s["id"]: s["file"] for s in json.loads((SHOTS / "manifest.json").read_text())}
    for sid, p in shots.items():
        if not pathlib.Path(p).exists():
            raise FileNotFoundError(f"screenshot missing for '{sid}': {p}")
    return f, shots


def usd(v):
    v = float(v)
    s = "-" if v < 0 else ""
    v = abs(v)
    return f"{s}${v / 1e6:,.2f}M" if v >= 1e6 else f"{s}${v / 1e3:,.0f}K"


def d(v):
    return f"{float(v):.1f}"


def cover(prs, f, subtitle):
    s = prs.slides.add_slide(prs.slide_layouts[13])
    set_ph(s, 3, "SAP WORKING CAPITAL 360")
    set_ph(s, 0, "SAP finance data as governed working capital intelligence")
    set_ph(s, 2, f"{subtitle} · verified {f['verified_on']}")
    return s


def shot_slide(prs, shots, sid, title, subtitle, cards, foot):
    s = content(prs, title, subtitle)
    picture(s, shots[sid], LEFT, TOP, 5.9, 3.5)
    y = TOP
    for kicker, text_, accent, h in cards:
        card(s, LEFT + 6.1, y, 3.0, h, kicker, [(text_, 10, False, DK1, 0)], accent=accent)
        y += h + 0.12
    note(s, foot)
    return s


# ------------------------------------------------------------ overview deck

def o02_problem(prs, f):
    s = content(prs, "The cash is earned. Releasing it is the project.",
                "Working capital questions that should take minutes take weeks")
    card(s, LEFT, TOP, 4.4, 2.5, "what the CFO asks", [
        ("Why did the cash conversion cycle grow?", 12, False, DK1, 8),
        ("Which customers are paying late?", 12, False, DK1, 8),
        ("Which supplier discounts are we losing?", 12, False, DK1, 8),
        ("How much cash can we release, and where?", 12, False, DK1, 0)], accent=SF_BLUE)
    card(s, LEFT + 4.7, TOP, 4.4, 2.5, "why it is slow", [
        ("AR, AP and inventory sit in SAP; bank data sits with the banks.", 12, False, DK1, 8),
        ("DSO, DPO and DIO are rebuilt in spreadsheets every month.", 12, False, DK1, 8),
        ("Early-payment programs are run apart from the analysis.", 12, False, DK1, 0)], accent=RED)
    banner(s, 4.05, [("The blocker is not the formula. It is SAP finance data in one governed "
                      "place, next to the non-SAP data, without copying it.", 12.5, True, WHITE, 0)])
    note(s, "SAP BDC removes the copy: finance data products are shared into Snowflake zero copy.")
    return s


def o03_sap(prs, f):
    s = content(prs, "SAP's working capital story, plus Snowflake",
                "Working Capital Insights for visibility, Taulia for the levers")
    card(s, LEFT, TOP, 2.95, 3.3, "SAP BDC Working Capital Insights", [
        ("Intelligent app: Overview, Cash & Liquidity, AR, AP, Inventory.", 10.5, False, DK1, 6),
        ("DSO, DPO, DIO and CCC; realized discounts, utilization, on-time payment.", 10.5, False, DK1, 0)], accent=SF_BLUE)
    card(s, LEFT + 3.07, TOP, 2.95, 3.3, "SAP Taulia levers", [
        ("Dynamic discounting and supply chain finance: extend DPO, capture discounts.", 10.5, False, DK1, 6),
        ("Flexible Funding and AR finance: reduce DSO.", 10.5, False, DK1, 6),
        ("SAP Taulia cites up to $3M per $1B of payables (SAP Taulia marketing).", 9.5, False, BODY_GREY, 0)], accent=TEAL)
    card(s, LEFT + 6.14, TOP, 2.96, 3.3, "Snowflake value", [
        ("Zero-copy BDC Connect: no extract, no second copy.", 10.5, False, DK1, 6),
        ("Join non-SAP data: bank feeds, credit scores.", 10.5, False, DK1, 6),
        ("Cortex Agent over one semantic view; Native App distribution.", 10.5, False, DK1, 0)], accent=VIOLET)
    note(s, "Sources: sap.com working capital solutions; learning.sap.com BDC intelligent apps; taulia.com.")
    return s


def o04_pattern(prs, f):
    sv, lc = f["semantic_view"], f["lineage_counts"]
    s = content(prs, "One medallion stack, entirely inside Snowflake", "Zero copy in, governed model out")
    layers = [
        ("L0", "SAP BDC data products · Journal Entry, Supplier Invoice, Terms, Cash, Bank",
         f"{lc['ACCTG']:,} journal-entry lines, shared zero copy", TEAL),
        ("L1", f"SAP BDC L1 · {len(f['l1_objects'])} views", "Typed passthrough views over the shares", SF_BLUE),
        ("L2", f"Analytics · {len(f['analytics_objects'])} objects, {len(f['dynamic_tables'])} dynamic tables",
         f"{lc['DT_AR']:,} AR and {lc['DT_AP']:,} AP items, monthly KPIs, 13-week forecast", SF_BLUE),
        ("SEM", "SAP Working Capital 360 Analytics semantic view",
         f"{sv.get('table', 0)} tables · {sv.get('dimension', 0)} dimensions · {sv.get('metric', 0)} metrics", VIOLET),
        ("AI", "SAP Working Capital Analyst agent", "Cortex Agent behind Ask the Agent", VIOLET),
        ("APP", f"Native App · {f['app_page_count']} pages", "React + Express on SPCS, data bundled", DK2),
    ]
    y = TOP
    for tag, name, detail, accent in layers:
        add_shape_text(s, MSO_SHAPE.RECTANGLE, LEFT, y, 0.62, 0.52, tag, accent,
                       DK1 if accent is TEAL else WHITE, 11, True)
        box(s, LEFT + 0.68, y, FULLW - 0.68, 0.52, LIGHT_BG, None)
        stack(s, LEFT + 0.88, y + 0.07, FULLW - 1.1, 0.40, [(name, 11, True, DK1, 1), (detail, 9, False, BODY_GREY, 0)])
        y += 0.60
    note(s, f"Object counts read on {f['verified_on']}.")
    return s


def o05_app(prs, f, shots):
    s = content(prs, f"{f['app_page_count']} pages, and nothing to set up", "Installs as a Native App with its data inside")
    picture(s, shots["overview"], LEFT, TOP, 5.9, 3.5)
    pages = f["app_pages"]
    caption(s, LEFT + 6.1, TOP, 3.0, "every page")
    stack(s, LEFT + 6.1, TOP + 0.30, 3.0, 3.2, [(f"· {p}", 10, False, DK1, 5) for p in pages])
    note(s, "Company and period filters apply across every page. Shown: Working Capital Overview.")
    return s


def o06_story(prs, f, shots):
    L, P, J = f["kpi_total_latest"], f["kpi_total_prior"], f["highest_dio_company"]
    s = content(prs, "Why did the cash conversion cycle grow?",
                f"{f['prior_month']} to {f['latest_month']}, all companies, weighted")
    picture(s, shots["overview"], LEFT, TOP, 5.9, 3.5)
    x = LEFT + 6.1
    stat(s, x, TOP, 3.0, 0.82, f"+{f['ccc_change_days']} days", "cash conversion cycle",
         f"{d(P['CCC'])} to {d(L['CCC'])} days", accent=RED)
    stat(s, x, TOP + 0.90, 3.0, 0.82, f"-{d(P['DPO'] - L['DPO'])} days", "DPO, the main driver",
         f"{d(P['DPO'])} to {d(L['DPO'])} days", accent=SF_BLUE)
    stat(s, x, TOP + 1.80, 3.0, 0.82, d(J["DIO"]), f"DIO, {J['COMPANY']}", "highest of the three", accent=TEAL)
    stat(s, x, TOP + 2.70, 3.0, 0.80, usd(f["cash_release_total_usd"]), "cash release", "by lever", accent=VIOLET)
    note(s, "CCC = DSO + DIO - DPO. DSO weighted by revenue, DPO by purchases, DIO by COGS.")
    return s


def o07_levers(prs, f, shots):
    ap = f["ap_all"]
    s = content(prs, "Discounts lost, and the SAP Taulia levers", "Early Payment & SCF, with a what-if")
    picture(s, shots["early-pay"], LEFT, TOP, 5.9, 3.5)
    x = LEFT + 6.1
    stat(s, x, TOP, 3.0, 0.82, usd(ap["DISC_LOST_USD"]), "discounts lost", f"vs {usd(ap['DISC_CAPTURED_USD'])} captured", accent=RED)
    stat(s, x, TOP + 0.90, 3.0, 0.82, usd(ap["SCF_FUNDED_USD"]), "SCF funded", "supplier paid early, DPO kept", accent=TEAL)
    stat(s, x, TOP + 1.80, 3.0, 0.82, usd(ap["DD_OPPORTUNITY_USD"]), "dynamic discounting", f"opportunity; ~{f['dd_effective_apr']['APR_PCT']}% APR", accent=SF_BLUE)
    stat(s, x, TOP + 2.70, 3.0, 0.80, f"{ap['ON_TIME_PCT']}%", "AP paid on time", "full window", accent=DK2)
    note(s, "Early-pay programs and terms are demo enrichment; invoice amounts are real BDC journal lines.")
    return s


def o08_agent(prs, f, shots):
    sv = f["semantic_view"]
    s = content(prs, "Plain-English questions, governed SQL underneath",
                f"{len(f['agent_questions'])} questions ship with the app")
    picture(s, shots["analyst"], LEFT, TOP, 5.5, 3.5)
    stack(s, LEFT + 5.75, TOP - 0.02, 3.4, 2.4, [(f"· {q}", 9.5, False, DK1, 4) for q in f["agent_questions"]])
    card(s, LEFT + 5.75, TOP + 2.45, 3.4, 1.05, "what it covers", [
        (f"{sv.get('table', 0)} tables, {sv.get('metric', 0)} metrics, one semantic view.", 9.5, False, DK1, 0)], accent=VIOLET)
    note(s, "The generated SQL expands on screen, constrained to the model.")
    return s


def o09_caveats(prs, f):
    s = content(prs, "What is SAP data, and what is demo enrichment", "Say this before you are asked")
    rows = [
        ("Medallion stack, semantic view, agent, app", "Real — this is the deliverable", TEAL, DK1),
        ("AR and AP invoices, amounts, dates", "Real BDC Entry View Journal Entry lines", TEAL, DK1),
        ("Terms, payment behaviour, early-pay programs", "Demo enrichment (IS_DEMO_ENRICHMENT)", RED, RED),
        ("Inventory, bank balances, partner names", "Demo enrichment", RED, RED),
        ("Currency", "USD at fixed illustrative FX (EUR 1.08, JPY 0.0067)", DK2, DK1),
        ("Net working capital negative", "AP is about 3x AR in the demo tenant", RED, RED),
    ]
    y = TOP
    for label, status, accent, colour in rows:
        box(s, LEFT, y, FULLW, 0.50, LIGHT_BG, accent)
        stack(s, LEFT + 0.28, y + 0.13, 4.6, 0.26, [(label, 10.5, True, DK1, 0)])
        stack(s, LEFT + 5.0, y + 0.13, 4.0, 0.26, [(status, 10.5, False, colour, 0)])
        y += 0.56
    note(s, f"Data window {f['window']['FIRST_MONTH']} to {f['window']['LAST_MONTH']}; kit KPIs are for {f['latest_month']}.")
    return s


def o10_next(prs, f):
    s = content(prs, "Where to take it", "Four options, in order of effort")
    opts = [
        ("Demo it", f"Open the Native App {f['native_app']} (role {f['app_role']}) and present."),
        ("Show the architecture", "Run the SQL in your own account and demo through Snowflake Intelligence."),
        ("Join a non-SAP feed", "Add bank statements or credit scores next to the SAP data."),
        ("Point it at customer data", "Swap L0 for the customer's BDC finance data products and real terms."),
    ]
    y = TOP
    for i, (head, detail) in enumerate(opts, 1):
        box(s, LEFT, y, FULLW, 0.68, LIGHT_BG, SF_BLUE)
        stack(s, LEFT + 0.30, y + 0.11, FULLW - 0.6, 0.46, [(f"{i}.  {head}", 12, True, DK2, 2), (detail, 10, False, DK1, 0)])
        y += 0.78
    banner(s, y + 0.10, [(f"Start with 03_SE_Quick_Start.docx · {f['repo']}", 10.5, True, WHITE, 0)], h=0.50)
    return s


def overview(f, shots):
    prs = new_presentation()
    slides = [cover(prs, f, "SE presales kit"), o02_problem(prs, f), o03_sap(prs, f), o04_pattern(prs, f),
              o05_app(prs, f, shots), o06_story(prs, f, shots), o07_levers(prs, f, shots),
              o08_agent(prs, f, shots), o09_caveats(prs, f), o10_next(prs, f)]
    return prs, slides, KIT / "00_Presales_Overview.pptx"


# ---------------------------------------------------------------- demo deck

def demo(f, shots):
    L, P, J = f["kpi_total_latest"], f["kpi_total_prior"], f["highest_dio_company"]
    ap, ar = f["ap_all"], f["ar_open"]
    top = f["top_overdue_customers"][0]
    inv = f["inventory_by_category"][0]
    lever = f["cash_release_by_lever"][0]
    lc = f["lineage_counts"]
    prs = new_presentation()
    slides = [cover(prs, f, "App walkthrough")]
    slides.append(shot_slide(prs, shots, "overview", "Working Capital Overview", "DSO, DPO, DIO and the cash conversion cycle", [
        ("shown", f"CCC {d(L['CCC'])} days in {f['latest_month']}, +{f['ccc_change_days']} vs {f['prior_month']}.", SF_BLUE, 1.05),
        ("say", f"DPO fell {d(P['DPO'] - L['DPO'])} days; DSO improved. {J['COMPANY']} has the highest DIO.", TEAL, 1.2),
        ("honesty", "NWC is negative: AP is about 3x AR in the demo tenant.", RED, 0.95)],
        "All companies; multi-company ratios weighted by revenue, purchases and COGS."))
    slides.append(shot_slide(prs, shots, "cash", "Cash & Liquidity", "Bank balances and the 13-week forecast", [
        ("balances", f"{usd(f['bank_latest']['BALANCE_USD'])} across {f['bank_latest']['ACCOUNTS']} accounts, {f['bank_latest']['HOUSE_BANKS']} house banks.", SF_BLUE, 1.15),
        ("forecast", f"13-week net cash {usd(f['cash_13w_net_usd'])}: receipts less AP, payroll, opex.", TEAL, 1.15),
        ("caution", "Balances are demo enrichment; in production, bank feeds.", RED, 0.95)],
        "Bank structure comes from BDC Bank Account and House Bank data products."))
    slides.append(shot_slide(prs, shots, "ar", "Accounts Receivable", "Aging, overdue customers, disputes", [
        ("open AR", f"{usd(ar['OPEN_AR_USD'])} across {ar['OPEN_ITEMS']} items; {ar['OVERDUE_PCT']}% overdue.", SF_BLUE, 1.1),
        ("call first", f"{top['CUSTOMER_NAME']}: {usd(top['OVERDUE_USD'])} overdue, {top['CREDIT_RISK']} risk.", RED, 1.1),
        ("disputes", f"{usd(ar['DISPUTED_USD'])} of open AR in dispute.", DK2, 0.9)],
        "AR items are customer debit lines of BDC Entry View Journal Entry."))
    slides.append(shot_slide(prs, shots, "ap", "Accounts Payable", "DPO, on-time payment, discounts", [
        ("open AP", f"{usd(f['ap_open']['OPEN_AP_USD'])} across {f['ap_open']['OPEN_ITEMS']} items.", SF_BLUE, 0.95),
        ("discounts", f"{usd(ap['DISC_CAPTURED_USD'])} captured, {usd(ap['DISC_LOST_USD'])} lost.", RED, 1.0),
        ("timing", f"{ap['ON_TIME_PCT']}% on time; {ap['EARLY_NO_BENEFIT_PCT']}% of payables paid early for no benefit.", DK2, 1.2)],
        "AP items are supplier credit lines of BDC Entry View Journal Entry."))
    slides.append(shot_slide(prs, shots, "early-pay", "Early Payment & SCF", "SAP Taulia-style levers, with a what-if", [
        ("SCF", f"{usd(ap['SCF_FUNDED_USD'])} funded: supplier paid early, our DPO kept.", TEAL, 1.1),
        ("dynamic discounting", f"~{f['dd_effective_apr']['APR_PCT']}% effective APR; {usd(ap['DD_OPPORTUNITY_USD'])} opportunity.", SF_BLUE, 1.1),
        ("what-if", "Move the sliders: enrolment and rate.", DK2, 0.85)],
        "Early-pay programs are demo enrichment modelled on SAP Taulia."))
    slides.append(shot_slide(prs, shots, "inventory", "Inventory", "DIO by category against target", [
        ("largest", f"{inv['INVENTORY_CATEGORY']}: {usd(inv['VALUE_USD'])}, DIO {d(inv['DIO'])} vs target {inv['TARGET_DIO']}.", SF_BLUE, 1.2),
        ("company", f"{J['COMPANY']} DIO {d(J['DIO'])}, the highest.", TEAL, 0.95),
        ("caution", "Inventory values are demo enrichment.", RED, 0.85)],
        f"Latest month {f['latest_month']}."))
    slides.append(shot_slide(prs, shots, "opportunities", "WC Opportunities", "Cash release by lever", [
        ("total", f"{usd(f['cash_release_total_usd'])} cash release; {usd(f['pnl_impact_total_usd'])} P&L impact.", SF_BLUE, 1.1),
        ("largest lever", f"{lever['LEVER']}: {usd(lever['CASH_RELEASE_USD'])}.", TEAL, 1.2),
        ("method", "Current vs target days, per company.", DK2, 0.85)],
        "Illustrative targets; the method, not a forecast."))
    slides.append(shot_slide(prs, shots, "lineage", "BDC Sources & Lineage", "The zero-copy proof", [
        ("path", "BDC data product → L1 view → dynamic table → semantic view → app.", VIOLET, 1.2),
        ("rows", f"{lc['ACCTG']:,} journal lines become {lc['DT_AR']:,} AR and {lc['DT_AP']:,} AP items.", TEAL, 1.2)],
        "Close here for a technical audience."))
    slides.append(shot_slide(prs, shots, "analyst", "Ask the Agent", "Plain-English questions, governed SQL", [
        ("try", f"'{f['agent_questions'][0]}'", SF_BLUE, 1.0),
        ("then", "Expand the generated SQL.", DK2, 0.8),
        ("scope", f"{f['semantic_view'].get('metric', 0)} metrics in one semantic view.", VIOLET, 0.9)],
        f"{len(f['agent_questions'])} suggested questions ship with the app."))
    slides.append(o09_caveats(prs, f))
    slides.append(o10_next(prs, f))
    return prs, slides, KIT / "SAP_Working_Capital_360_Demo.pptx"


def build(fn, f, shots):
    prs, slides, out = fn(f, shots)
    issues = 0
    for n, s in enumerate(slides, 1):
        for msg in verify_slide(s, prs, n):
            print(f"  {out.name} slide {n}: {msg}")
            issues += 1
    issues += len(verify_deck(prs))
    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(out)
    print(f"wrote {out}  ({len(prs.slides)} slides, {issues} verifier issue(s))")


def main():
    f, shots = load()
    build(overview, f, shots)
    build(demo, f, shots)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
