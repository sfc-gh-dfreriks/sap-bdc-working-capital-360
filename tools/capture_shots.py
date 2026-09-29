#!/usr/bin/env python3
"""Capture 1600x1000 screenshots of every Working Capital 360 page for the kit.

Walks the sidebar of the running local app (client 5185), clicking each label and
waiting for data. Writes /tmp/wc_shots_kit/<id>.png and manifest.json.
    python3 tools/capture_shots.py [--url http://localhost:5185]
"""
import argparse
import json
import pathlib

from playwright.sync_api import sync_playwright

OUT = pathlib.Path("/tmp/wc_shots_kit")
PAGES = [
    ("overview", "Working Capital Overview"), ("cash", "Cash & Liquidity"),
    ("ar", "Accounts Receivable"), ("ap", "Accounts Payable"),
    ("early-pay", "Early Payment & SCF"), ("inventory", "Inventory"),
    ("opportunities", "WC Opportunities"), ("lineage", "BDC Sources & Lineage"),
    ("analyst", "Ask the Agent"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5185")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1000})
        pg.goto(a.url, wait_until="networkidle")
        pg.wait_for_timeout(4500)
        for sid, label in PAGES:
            pg.locator("button", has_text=label).first.click()
            pg.wait_for_timeout(4500)
            f = OUT / f"{sid}.png"
            pg.screenshot(path=str(f))
            manifest.append({"id": sid, "label": label, "file": str(f)})
            print("shot", f)
        b.close()
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
