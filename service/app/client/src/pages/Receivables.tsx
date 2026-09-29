import { useFilterArgs } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchAR } from '@/lib/api';
import { formatDollar, formatPct, formatDays, formatNumber } from '@/lib/utils';
import MetricCard, { DollarSign, Calendar, Activity, FileText } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import DemoBadge from '@/components/DemoBadge';
import { NeedCompany, Loading, ErrorBox } from '@/components/PageState';
import ReactECharts from 'echarts-for-react';

const AGING_COLORS: Record<string, string> = { 'Not Due': '#10b981', '1-30': '#f59e0b', '31-60': '#f97316', '61-90': '#ef4444', '90+': '#991b1b' };

export default function Receivables() {
  const { f, has, deps } = useFilterArgs();
  const { data, loading, error } = useQuery(() => has ? fetchAR(f) : Promise.resolve(null), deps);
  if (!has) return <NeedCompany />;
  if (loading) return <Loading n={8} />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.kpis) return null;
  const k = data.kpis;
  const dso = data.dsoTrend ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Open AR" value={formatDollar(k.openAr)} icon={DollarSign} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatNumber(k.openItems)} items · ${formatNumber(k.customers)} customers`} deltaType="neutral" />
        <MetricCard title="Overdue AR" value={formatDollar(k.overdueAr)} icon={Activity} accent="border-red-300/50 bg-gradient-to-br from-red-50 to-rose-50" delta={`${formatPct(k.overduePct)} of open AR`} deltaType={k.overduePct > 20 ? 'negative' : 'neutral'} />
        <MetricCard title="DSO · Days Sales Outstanding" value={formatDays(k.dso)} icon={Calendar} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={`Avg ${formatDays(k.avgDaysToPay)} to pay`} deltaType="neutral" trend={dso.map((t: any) => t.dso)} />
        <MetricCard title="On-Time Collection" value={formatPct(k.onTimePct)} icon={FileText} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`Disputed ${formatDollar(k.disputed)} · PTP ${formatDollar(k.promised)}`} deltaType="neutral" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Days Sales Outstanding (DSO) & Overdue Trend">
          <ReactECharts option={{ tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 70, right: 50, bottom: 30, top: 36 },
            xAxis: { type: 'category', data: dso.map((t: any) => t.month) },
            yAxis: [{ type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } }, { type: 'value', axisLabel: { formatter: '{value} d' }, splitLine: { show: false } }],
            series: [
              { name: 'Overdue AR', type: 'bar', data: dso.map((t: any) => t.overdue), itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] }, tooltip: { valueFormatter: (v: number) => formatDollar(v) } },
              { name: 'DSO', type: 'line', yAxisIndex: 1, smooth: true, data: dso.map((t: any) => t.dso), lineStyle: { color: '#06b6d4', width: 3 }, itemStyle: { color: '#06b6d4' } },
            ] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Open AR Aging" subtitle="Open items only">
          <ReactECharts option={{ tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}: ${formatDollar(p[0].value)}` }, grid: { left: 70, right: 20, bottom: 30, top: 20 },
            xAxis: { type: 'category', data: (data.aging ?? []).map((a: any) => a.name) },
            yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            series: [{ type: 'bar', data: (data.aging ?? []).map((a: any) => ({ value: a.amount, itemStyle: { color: AGING_COLORS[a.name] ?? '#3b82f6', borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 48 }] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Dunning Level Distribution" subtitle="Open AR by dunning level" badge={<DemoBadge />}>
          <ReactECharts option={{ tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}: ${formatDollar(p[0].value)}` }, grid: { left: 70, right: 20, bottom: 30, top: 20 },
            xAxis: { type: 'category', data: (data.dunning ?? []).map((a: any) => a.name) },
            yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            series: [{ type: 'bar', data: (data.dunning ?? []).map((a: any) => a.amount), itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 48 }] }} style={{ height: 280 }} />
        </ChartCard>
        <ChartCard title="Open vs Overdue by Segment" badge={<DemoBadge />}>
          <ReactECharts option={{ tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDollar(v) }, legend: { top: 0 }, grid: { left: 100, right: 20, bottom: 30, top: 36 },
            yAxis: { type: 'category', data: (data.bySegment ?? []).map((a: any) => a.name) },
            xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            series: [
              { name: 'Open', type: 'bar', data: (data.bySegment ?? []).map((a: any) => a.openAr), itemStyle: { color: '#06b6d4' } },
              { name: 'Overdue', type: 'bar', data: (data.bySegment ?? []).map((a: any) => a.overdue), itemStyle: { color: '#ef4444' } },
            ] }} style={{ height: 280 }} />
        </ChartCard>
        <ChartCard title="Top 15 Overdue Customers" className="lg:col-span-2" badge={<DemoBadge label="Demo enrichment: names, risk, disputes" />}>
          <DataTable columns={[
            { key: 'customer', label: 'Customer' }, { key: 'segment', label: 'Segment' }, { key: 'risk', label: 'Credit Risk' },
            { key: 'openAr', label: 'Open AR', format: formatDollar }, { key: 'overdue', label: 'Overdue', format: formatDollar },
            { key: 'maxDpd', label: 'Max Days Past Due', format: formatNumber },
            { key: 'disputed', label: 'Disputed', format: formatDollar }, { key: 'promiseToPay', label: 'Promise to Pay', format: formatDollar },
          ]} data={data.topOverdue ?? []} />
        </ChartCard>
      </div>
    </div>
  );
}
