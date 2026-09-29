import { useFilterArgs } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchAP } from '@/lib/api';
import { formatDollar, formatPct, formatDays, formatNumber } from '@/lib/utils';
import MetricCard, { DollarSign, Calendar, Activity, TrendingDown } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import DemoBadge from '@/components/DemoBadge';
import { NeedCompany, Loading, ErrorBox } from '@/components/PageState';
import ReactECharts from 'echarts-for-react';

const AGING_COLORS: Record<string, string> = { 'Not Due': '#10b981', '1-30': '#f59e0b', '31-60': '#f97316', '60+': '#ef4444' };

export default function Payables() {
  const { f, has, deps } = useFilterArgs();
  const { data, loading, error } = useQuery(() => has ? fetchAP(f) : Promise.resolve(null), deps);
  if (!has) return <NeedCompany />;
  if (loading) return <Loading n={8} />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.kpis) return null;
  const k = data.kpis;
  const dpo = data.dpoTrend ?? [];
  const disc = data.discounts ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Open AP" value={formatDollar(k.openAp)} icon={DollarSign} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={`${formatNumber(k.openItems)} items · ${formatNumber(k.suppliers)} suppliers`} deltaType="neutral" />
        <MetricCard title="DPO · Days Payables Outstanding" value={formatDays(k.dpo)} icon={Calendar} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`Avg ${formatDays(k.avgDaysToPay)} to pay`} deltaType="neutral" trend={dpo.map((t: any) => t.dpo)} />
        <MetricCard title="On-Time Payment" value={formatPct(k.onTimePct)} icon={Activity} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`Overdue ${formatDollar(k.overdueAp)}`} deltaType="neutral" />
        <MetricCard title="Paid Early, No Benefit" value={formatDollar(k.paidEarlyNoBenefit)} icon={TrendingDown} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta="Cash released early without a discount" deltaType="negative" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Days Payables Outstanding (DPO) Trend">
          <ReactECharts option={{ tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 70, right: 50, bottom: 30, top: 36 },
            xAxis: { type: 'category', data: dpo.map((t: any) => t.month) },
            yAxis: [{ type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } }, { type: 'value', axisLabel: { formatter: '{value} d' }, splitLine: { show: false } }],
            series: [
              { name: 'AP balance', type: 'bar', data: dpo.map((t: any) => t.ap), itemStyle: { color: '#c4b5fd', borderRadius: [4, 4, 0, 0] }, tooltip: { valueFormatter: (v: number) => formatDollar(v) } },
              { name: 'DPO', type: 'line', yAxisIndex: 1, smooth: true, data: dpo.map((t: any) => t.dpo), lineStyle: { color: '#8b5cf6', width: 3 }, itemStyle: { color: '#8b5cf6' } },
            ] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Discounts Captured vs Lost" subtitle={`Captured ${formatDollar(k.discountCaptured)} · lost ${formatDollar(k.discountLost)}`} badge={<DemoBadge />}>
          <ReactECharts option={{ tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDollar(v) }, legend: { top: 0 }, grid: { left: 60, right: 20, bottom: 30, top: 36 },
            xAxis: { type: 'category', data: disc.map((d: any) => d.month) },
            yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            series: [
              { name: 'Captured', type: 'bar', stack: 'd', data: disc.map((d: any) => d.captured), itemStyle: { color: '#10b981' } },
              { name: 'Lost', type: 'bar', stack: 'd', data: disc.map((d: any) => d.lost), itemStyle: { color: '#ef4444' } },
            ] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Open AP Aging" subtitle="Open items only">
          <ReactECharts option={{ tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}: ${formatDollar(p[0].value)}` }, grid: { left: 70, right: 20, bottom: 30, top: 20 },
            xAxis: { type: 'category', data: (data.aging ?? []).map((a: any) => a.name) },
            yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            series: [{ type: 'bar', data: (data.aging ?? []).map((a: any) => ({ value: a.amount, itemStyle: { color: AGING_COLORS[a.name] ?? '#3b82f6', borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 48 }] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Top Suppliers by Open AP" badge={<DemoBadge label="Demo enrichment: names & programs" />}>
          <ReactECharts option={{ tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}: ${formatDollar(p[0].value)}` }, grid: { left: 150, right: 20, bottom: 20, top: 10 },
            xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            yAxis: { type: 'category', data: (data.topSuppliers ?? []).slice(0, 10).map((d: any) => d.supplier).reverse(), axisLabel: { fontSize: 10 } },
            series: [{ type: 'bar', data: (data.topSuppliers ?? []).slice(0, 10).map((d: any) => d.openAp).reverse(), itemStyle: { borderRadius: [0, 4, 4, 0], color: '#8b5cf6' }, barMaxWidth: 16 }] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Supplier Open AP Detail" className="lg:col-span-2">
          <DataTable columns={[
            { key: 'supplier', label: 'Supplier' }, { key: 'category', label: 'Category' }, { key: 'segment', label: 'Segment' },
            { key: 'program', label: 'Early-Pay Program' }, { key: 'terms', label: 'Terms' },
            { key: 'openAp', label: 'Open AP', format: formatDollar }, { key: 'overdue', label: 'Overdue', format: formatDollar },
          ]} data={data.topSuppliers ?? []} />
        </ChartCard>
      </div>
    </div>
  );
}
