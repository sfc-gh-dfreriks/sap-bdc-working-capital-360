#!/usr/bin/env node
/**
 * export-static.mjs — Working Capital 360
 * Static point-in-time snapshot for the public (anonymous) build.
 *
 * Filters: companies (3) x period. We bake the full company power set
 * (7 non-empty subsets + "" = all) for the default period only. The client
 * falls back to the default-period snapshot for any other period (see
 * filterKey / getKeyed in client/src/lib/api.ts).
 *
 * Usage:  EXPORT_BASE=http://localhost:3010 node scripts/export-static.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.EXPORT_BASE ?? "http://localhost:3010";
const CONCURRENCY = Number(process.env.EXPORT_CONCURRENCY ?? 8);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../client/public/data");

const KEYED_ENDPOINTS = ["overview", "cash", "ar", "ap", "early-pay", "inventory", "opportunities"]
  .map((name) => ({ name, path: `/api/${name}` }));
const SINGLE_ENDPOINTS = [{ name: "lineage", path: "/api/lineage" }];

/** Canonical key — MUST match filterKey() in lib/api.ts. */
function makeKey(companies, from, to) {
  return `${[...companies].sort().join(",")}||${from}..${to}`;
}
function powerSet(arr) {
  return arr.reduce((s, v) => s.concat(s.map((x) => [...x, v])), [[]]);
}
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function mapPool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const filters = await getJson(`${BASE}/api/filters`);
  await writeFile(path.join(OUT_DIR, "filters.json"), JSON.stringify(filters));
  const companies = filters.companies ?? [];
  const from = filters.default_from; const to = filters.default_to;
  // "" (empty subset) = all companies, same as selecting every company server-side.
  const combos = powerSet(companies);
  console.log(`companies: ${companies.length}, period ${from}..${to}, ${combos.length} combinations per keyed endpoint`);

  for (const ep of KEYED_ENDPOINTS) {
    const map = { __defaultFrom: from, __defaultTo: to };
    await mapPool(combos, CONCURRENCY, async (cSub) => {
      const params = new URLSearchParams({ from, to });
      if (cSub.length) params.set("companies", cSub.join(","));
      map[makeKey(cSub, from, to)] = await getJson(`${BASE}${ep.path}?${params}`);
    });
    await writeFile(path.join(OUT_DIR, `${ep.name}.json`), JSON.stringify(map));
    console.log(`wrote ${ep.name}.json (${combos.length} entries)`);
  }

  for (const ep of SINGLE_ENDPOINTS) {
    const data = await getJson(`${BASE}${ep.path}`);
    await writeFile(path.join(OUT_DIR, `${ep.name}.json`), JSON.stringify(data));
    console.log(`wrote ${ep.name}.json (single)`);
  }

  await writeFile(path.join(OUT_DIR, "meta.json"), JSON.stringify({ generatedAt: new Date().toISOString() }));
  console.log("done");
}

main().catch((err) => { console.error("export-static failed:", err); process.exit(1); });
