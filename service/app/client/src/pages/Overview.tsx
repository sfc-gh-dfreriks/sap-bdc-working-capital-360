import { useFilterArgs } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchOverview } from '@/lib/api';
import { formatDollar, formatDays, formatDelta, formatPct } from '@/lib/utils';
import MetricCard, { DollarSign, Calendar, Gauge, Activity, Receipt, Building2, TrendingDown, PieChart } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import { NeedCompany, Loading, ErrorBox } from '@/components/PageState';
import ReactECharts from 'echarts-for-react';

const days = (v: number) => `${v.toFixed(1)} d`;
/** For DSO/DIO/CCC/AR/inventory lower is better; for DPO higher is better. */
const tone = (d: number | null, lowerIsBetter = true) =>
  d == null || Math.abs(d) < 0.05 ? 'neutral' : (d < 0) === lowerIsBetter ? 'positive' : 'negative';

export default function Overview() {
  const { f, has, deps } = useFilterArgs();
  const { data, loading, error } = useQuery(() => has ? fetchOverview(f) : Promise.resolve(null), deps);
  if (!has) return <NeedCompany />;
  if (loading) return <Loading n={8} />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.kpis) return null;
  const k = data.kpis; const d = data.delta ?? {};
  const trend = data.trend ?? [];
  const b = data.bridge ?? {};
  const waterfall = [
    { name: 'DSO', base: 0, value: b.dso ?? 0, color: '#06b6d4' },
    { name: '+ DIO', base: b.dso ?? 0, value: b.dio ?? 0, color: '#f59e0b' },
    { name: '− DPO', base: (b.dso ?? 0) + (b.dio ?? 0) - (b.dpo ?? 0), value: b.dpo ?? 0, color: '#8b5cf6' },
    { name: '= CCC', base: 0, value: b.ccc ?? 0, color: '#11567f' },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Latest month <span className="font-semibold text-gray-700">{k.month}</span> vs prior year {k.priorMonth}. Multi-company day metrics are weighted by revenue (DSO), purchases (DPO) and COGS (DIO).</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="DSO · Days Sales Outstanding" value={formatDays(k.dso)} icon={Calendar} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={formatDelta(d.dso, days)} deltaType={tone(d.dso)} trend={trend.map((t: any) => t.dso)} />
        <MetricCard title="DPO · Days Payables Outstanding" value={formatDays(k.dpo)} icon={Calendar} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={formatDelta(d.dpo, days)} deltaType={tone(d.dpo, false)} trend={trend.map((t: any) => t.dpo)} />
        <MetricCard title="DIO · Days Inventory Outstanding" value={formatDays(k.dio)} icon={Gauge} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={formatDelta(d.dio, days)} deltaType={tone(d.dio)} trend={trend.map((t: any) => t.dio)} />
        <MetricCard title="CCC · Cash Conversion Cycle" value={formatDays(k.ccc)} icon={Activity} accent="border-sf-primary/30 bg-gradient-to-br from-blue-50 to-sky-50" delta={formatDelta(d.ccc, days)} deltaType={tone(d.ccc)} trend={trend.map((t: any) => t.ccc)} />
        <MetricCard title="Net Working Capital" value={formatDollar(k.nwc)} icon={DollarSign} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={formatDelta(d.nwc, formatDollar)} deltaType="neutral" />
        <MetricCard title="Accounts Receivable" value={formatDollar(k.ar)} icon={Building2} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatPct(k.ar ? (100 * k.arOverdue) / k.ar : 0)} overdue`} deltaType="neutral" />
        <MetricCard title="Accounts Payable" value={formatDollar(k.ap)} icon={Receipt} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={formatDelta(d.ap, formatDollar)} deltaType="neutral" />
        <MetricCard title="Inventory" value={formatDollar(k.inventory)} icon={PieChart} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={formatDelta(d.inventory, formatDollar)} deltaType={tone(d.inventory)} />
      </div>
      {k.nwc < 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
          Net working capital is negative: AP volume in this BDC tenant is roughly 3× AR, so payables exceed receivables plus inventory. Shown as-is.
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="Cash Conversion Cycle (CCC) Trend" subtitle="CCC = DSO + DIO − DPO: the days cash is tied up between paying suppliers and collecting from customers. Lower is better." className="lg:col-span-2">
          <ReactECharts option={{ tooltip: { trigger: 'axis' }, legend: { top: 0, width: '95%' },
            grid: { left: 50, right: 20, bottom: 30, top: 60 },
            xAxis: { type: 'category', data: trend.map((t: any) => t.month) },
            yAxis: { type: 'value', axisLabel: { formatter: '{value} d' } },
            series: [
              { name: 'DSO · Days Sales Outstanding', type: 'bar', stack: 'days', data: trend.map((t: any) => t.dso), itemStyle: { color: '#06b6d4' } },
              { name: 'DIO · Days Inventory Outstanding', type: 'bar', stack: 'days', data: trend.map((t: any) => t.dio), itemStyle: { color: '#f59e0b' } },
              { name: 'DPO · Days Payables Outstanding (subtracted)', type: 'bar', stack: 'days', data: trend.map((t: any) => -t.dpo), itemStyle: { color: '#8b5cf6' } },
              { name: 'CCC · Cash Conversion Cycle', type: 'line', smooth: true, symbolSize: 6, data: trend.map((t: any) => t.ccc), lineStyle: { color: '#11567f', width: 3 }, itemStyle: { color: '#11567f' } },
            ] }} style={{ height: 340 }} />
        </ChartCard>
        <ChartCard title="Cash Conversion Cycle (CCC) Bridge" subtitle={`Latest month ${k.month} · DSO + DIO − DPO = CCC`}>
          <ReactECharts option={{ tooltip: { trigger: 'axis', formatter: (p: any) => `${p[1].name}: ${p[1].value.toFixed(1)} d` },
            grid: { left: 45, right: 10, bottom: 30, top: 20 },
            xAxis: { type: 'category', data: waterfall.map((w) => w.name) },
            yAxis: { type: 'value', axisLabel: { formatter: '{value} d' } },
            series: [
              { type: 'bar', stack: 'w', data: waterfall.map((w) => w.base), itemStyle: { color: 'transparent' }, emphasis: { disabled: true } },
              { type: 'bar', stack: 'w', data: waterfall.map((w) => ({ value: w.value, itemStyle: { color: w.color, borderRadius: 4 } })),
                label: { show: true, position: 'top', formatter: (p: any) => p.value.toFixed(1) } },
            ] }} style={{ height: 340 }} />
        </ChartCard>
        <ChartCard title="Company Comparison" subtitle={`Latest month ${k.month} · CCC = Cash Conversion Cycle (DSO + DIO − DPO), in days`} className="lg:col-span-3">
          <DataTable columns={[
            { key: 'name', label: 'Company' }, { key: 'region', label: 'Region' },
            { key: 'dso', label: 'DSO', format: formatDays }, { key: 'dpo', label: 'DPO', format: formatDays },
            { key: 'dio', label: 'DIO', format: formatDays }, { key: 'ccc', label: 'CCC (Cash Conv. Cycle)', format: formatDays },
            { key: 'ar', label: 'AR', format: formatDollar }, { key: 'ap', label: 'AP', format: formatDollar },
            { key: 'inventory', label: 'Inventory', format: formatDollar }, { key: 'nwc', label: 'NWC', format: formatDollar },
            { key: 'arOverduePct', label: 'AR Overdue', format: (v: any) => formatPct(v == null ? null : v <= 1 ? v * 100 : v) },
          ]} data={data.byCompany ?? []} />
        </ChartCard>
      </div>
    </div>
  );
}
