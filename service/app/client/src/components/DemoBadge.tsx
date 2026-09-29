import { Sparkles } from 'lucide-react';

/** Subtle marker for figures built on demo enrichment rather than real BDC journal lines. */
export default function DemoBadge({ label = 'Demo enrichment' }: { label?: string }) {
  return (
    <span title="Payment behaviour, early-pay programs, inventory, bank balances and partner names are demo enrichment; AR/AP invoices and amounts come from real SAP BDC journal lines."
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
      <Sparkles className="h-3 w-3" />{label}
    </span>
  );
}
