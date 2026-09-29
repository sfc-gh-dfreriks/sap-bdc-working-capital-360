// Data access layer. Two modes:
//   - Live (default): fetch from the Express server at /api/*
//   - Static (VITE_STATIC=1): read pre-baked JSON snapshots from <base>/data/*
//     and route the Cortex agent to VITE_AGENT_URL (a serverless function).
const STATIC = import.meta.env.VITE_STATIC === '1';
const AGENT_BASE = (import.meta.env.VITE_AGENT_URL ?? '').replace(/\/$/, '');
const DATA_BASE = `${import.meta.env.BASE_URL}data`;
const BASE = '/api';

export interface Filters { companies: string[]; from: string; to: string; }

function buildParams(f: Filters): string {
  const params = new URLSearchParams();
  if (f.companies.length) params.set('companies', f.companies.join(','));
  params.set('from', f.from);
  params.set('to', f.to);
  return params.toString();
}

/** Canonical snapshot key — MUST match makeKey() in scripts/export-static.mjs.
 *  Companies are baked as the full power set for the default period only; a
 *  non-default period falls back to the default-period snapshot. */
function filterKey(f: Filters): string {
  return `${[...f.companies].sort().join(',')}||${f.from}..${f.to}`;
}

function camelizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[camelizeKey(k)] = camelizeKeys(v);
    return out;
  }
  return obj;
}

async function liveGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return camelizeKeys(await res.json()) as T;
}

const fileCache = new Map<string, Promise<any>>();
function loadStaticFile(file: string): Promise<any> {
  let p = fileCache.get(file);
  if (!p) {
    p = fetch(`${DATA_BASE}/${file}.json`).then((res) => {
      if (!res.ok) throw new Error(`Static data error: ${res.status} ${file}`);
      return res.json();
    });
    fileCache.set(file, p);
  }
  return p;
}

async function getKeyed<T>(name: string, f: Filters): Promise<T> {
  if (STATIC) {
    const map = await loadStaticFile(name);
    const hit = map[filterKey(f)] ?? map[filterKey({ ...f, from: map.__defaultFrom, to: map.__defaultTo })];
    return camelizeKeys(hit ?? {}) as T;
  }
  return liveGet<T>(`/${name}?${buildParams(f)}`);
}
async function getSingle<T>(name: string): Promise<T> {
  if (STATIC) return camelizeKeys(await loadStaticFile(name)) as T;
  return liveGet<T>(`/${name}`);
}

export function fetchFilters(): Promise<{ companies: string[]; months: string[]; defaultFrom?: string; defaultTo?: string }> {
  if (STATIC) return loadStaticFile('filters').then(camelizeKeys);
  return liveGet('/filters');
}

export const fetchOverview = (f: Filters) => getKeyed<any>('overview', f);
export const fetchCash = (f: Filters) => getKeyed<any>('cash', f);
export const fetchAR = (f: Filters) => getKeyed<any>('ar', f);
export const fetchAP = (f: Filters) => getKeyed<any>('ap', f);
export const fetchEarlyPay = (f: Filters) => getKeyed<any>('early-pay', f);
export const fetchInventory = (f: Filters) => getKeyed<any>('inventory', f);
export const fetchOpportunities = (f: Filters) => getKeyed<any>('opportunities', f);
export const fetchLineage = () => getSingle<any>('lineage');

export async function fetchAnalyst(messages: { role: string; content: string }[]) {
  const base = STATIC ? AGENT_BASE : BASE;
  const res = await fetch(`${base}/analyst`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function runAnalystSql(sql: string) {
  const base = STATIC ? AGENT_BASE : BASE;
  const res = await fetch(`${base}/analyst/run-sql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
