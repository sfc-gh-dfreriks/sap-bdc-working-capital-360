import { useState } from 'react';
import { useFilterArgs } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchEarlyPay } from '@/lib/api';
import { formatDollar, formatPct, formatDays } from '@/lib/utils';
import MetricCard, { DollarSign, TrendingUp, TrendingDown, Gauge, Calculator } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import DemoBadge from '@/components/DemoBadge';
import { NeedCompany, Loading, ErrorBox } from '@/components/PageState';
import ReactECharts from 'echarts-for-react';

const PALETTE = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];
const OUTCOME_COLORS: Record<string, string> = {
  'DD Accepted': '#06b6d4', 'SCF Funded': '#8b5cf6', 'Static Discount Taken': '#10b981',
  'Static Discount Missed': '#ef4444', 'Paid at Terms': '#94a3b8',
};
/** Days by which a dynamic-discount payment is typically accelerated (Taulia rule of thumb). */
const DD_ACCEL_DAYS = 30;

function Slider({ label, value, setValue, min, max, step, unit }: {
  label: string; value: number; setValue: (v: number) => void; min: number; max: number; step: number; unit: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-gray-700">{label}</span><span className="font-bold text-sf-primary">{value}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-sky-600" />
    </label>
  );
}

export default function EarlyPayment() {
  const { f, has, deps } = useFilterArgs();
  const { data, loading, error } = useQuery(() => has ? fetchEarlyPay(f) : Promise.resolve(null), deps);
  const [extendDays, setExtendDays] = useState(15);
  const [ddPct, setDdPct] = useState(25);
  if (!has) return <NeedCompany />;
  if (loading) return <Loading n={8} />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.kpis) return null;
  const k = data.kpis;
  const aprPct = Number(k.ddAprPct ?? 0);
  // What-if levers (client-side): SCF term extension and moving Standard suppliers onto DD.
  const cashReleased = (extendDays * Number(k.annualPurchases ?? 0)) / 365;
  const ddYield = (ddPct / 100) * Number(k.standardVolume ?? 0) * (aprPct / 100) * (DD_ACCEL_DAYS / 365);
  const outcomes = data.outcomes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">SAP Taulia-style levers: dynamic discounting (DD) and supply chain finance (SCF). Invoice period {f.from} → {f.to}.</p>
        <DemoBadge label="Demo enrichment: programs & payment outcomes" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Discount Captured" value={formatDollar(k.discountCaptured)} icon={TrendingUp} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`Lost ${formatDollar(k.discountLost)}`} deltaType="negative" />
        <MetricCard title="Untapped DD Opportunity" value={formatDollar(k.ddOpportunity)} icon={TrendingDown} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta="Offers not accepted" deltaType="neutral" />
        <MetricCard title="SCF Funded Volume" value={formatDollar(k.scfFunded)} icon={DollarSign} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={`${formatPct(k.volume ? (100 * k.scfFunded) / k.volume : 0)} of AP volume`} deltaType="neutral" />
        <MetricCard title="Effective DD APR" value={formatPct(aprPct)} icon={Gauge} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatDays(k.daysAccelerated)} accelerated on avg`} deltaType="positive" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="AP Volume by Early-Pay Program">
          <ReactECharts option={{ tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${formatDollar(p.value)} (${p.percent}%)` },
            series: [{ type: 'pie', radius: ['40%', '70%'], data: (data.byProgram ?? []).map((d: any, i: number) => ({ name: d.name, value: d.volume, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
              itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { formatter: '{b}\n{d}%', fontSize: 11 } }] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Payment Outcome Mix" subtitle="Invoice volume by outcome">
          <ReactECharts option={{ tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}: ${formatDollar(p[0].value)}` }, grid: { left: 150, right: 20, bottom: 20, top: 10 },
            xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            yAxis: { type: 'category', data: outcomes.map((o: any) => o.name).reverse() },
            series: [{ type: 'bar', data: outcomes.map((o: any) => ({ value: o.volume, itemStyle: { color: OUTCOME_COLORS[o.name] ?? '#3b82f6', borderRadius: [0, 4, 4, 0] } })).reverse(), barMaxWidth: 20 }] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="What-if: Working Capital Levers" subtitle="Client-side estimate on the selected companies and period" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/40 p-5">
              <Slider label="Extend supplier terms via SCF" value={extendDays} setValue={setExtendDays} min={0} max={60} step={5} unit=" days" />
              <MetricCard title="Cash released" value={formatDollar(cashReleased)} icon={Calculator} accent="border-purple-300/50 bg-white" delta={`DPO +${extendDays} d · on ${formatDollar(k.annualPurchases)} annualized purchases`} deltaType="positive" />
              <p className="text-[11px] text-gray-500">Cash released = extension days × annual purchases / 365. Suppliers keep being paid early by the SCF funder.</p>
            </div>
            <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-5">
              <Slider label="Move Standard suppliers to Dynamic Discounting" value={ddPct} setValue={setDdPct} min={0} max={100} step={5} unit="%" />
              <MetricCard title="Incremental discount yield" value={formatDollar(ddYield)} icon={Calculator} accent="border-cyan-300/50 bg-white" delta={`${ddPct}% of ${formatDollar(k.standardVolume)} Standard volume @ ${formatPct(aprPct)} APR`} deltaType="positive" />
              <p className="text-[11px] text-gray-500">Yield = share × Standard volume × effective DD APR × {DD_ACCEL_DAYS}/365 (typical acceleration).</p>
            </div>
          </div>
        </ChartCard>
        <ChartCard title="Program Detail" className="lg:col-span-2">
          <DataTable columns={[
            { key: 'name', label: 'Program' }, { key: 'suppliers', label: 'Suppliers' },
            { key: 'volume', label: 'Volume', format: formatDollar }, { key: 'captured', label: 'Discount Captured', format: formatDollar },
            { key: 'ddOpportunity', label: 'DD Opportunity', format: formatDollar }, { key: 'scfFunded', label: 'SCF Funded', format: formatDollar },
          ]} data={data.byProgram ?? []} />
        </ChartCard>
      </div>
    </div>
  );
}
