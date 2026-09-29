import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Money in USD (all Working Capital 360 figures are *_USD at fixed illustrative FX). */
export function formatDollar(value: number | null): string {
  const sym = '$';
  if (value == null) return `${sym}0`;
  const v = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (v >= 1e9) return `${sign}${sym}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}${sym}${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}${sym}${(v / 1e3).toFixed(0)}K`;
  return `${sign}${sym}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatPct(value: number | null): string {
  if (value == null) return '0%';
  return value.toFixed(1) + '%';
}

export function formatNumber(value: number | null): string {
  if (value == null) return '0';
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Day metrics (DSO/DPO/DIO/CCC). */
export function formatDays(value: number | null): string {
  if (value == null) return '–';
  return `${value.toFixed(1)} d`;
}

/** Signed delta, e.g. "+3.7 d" or "-$1.6M". */
export function formatDelta(value: number | null, fmt: (v: number) => string): string {
  if (value == null) return 'n/a vs PY';
  return `${value >= 0 ? '+' : '-'}${fmt(Math.abs(value))} vs PY`;
}
