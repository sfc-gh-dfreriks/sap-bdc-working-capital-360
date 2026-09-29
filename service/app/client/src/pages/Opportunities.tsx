import { useFilterArgs } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchOpportunities } from '@/lib/api';
import { formatDollar, formatDays } from '@/lib/utils';
import MetricCard, { DollarSign, TrendingUp, Calculator } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import DemoBadge from '@/components/DemoBadge';
import { NeedCompany, Loading, ErrorBox } from '@/components/PageState';
import ReactECharts from 'echarts-for-react';

const AREA_ACCENT: Record<string, string> = {
  AR: 'border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50',
  AP: 'border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50',
  Inventory: 'border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50',
};
const PALETTE = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];

export default function Opportunities() {
  const { f, has, deps } = useFilterArgs();
  const { data, loading, error } = useQuery(() => has ? fetchOpportunities(f) : Promise.resolve(null), deps);
  if (!has) return <NeedCompany />;
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.kpis) return null;
  const k = data.kpis;
  const levers = data.byLever ?? [];
  const rows = data.rows ?? [];
  const companies = [...new Set(rows.map((r: any) => r.company))] as string[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Cash release from closing the gap between current and target days, per lever and company (latest month).</p>
        <DemoBadge label="Targets are illustrative" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard title="Total Cash Release" value={formatDollar(k.cashRelease)} icon={DollarSign} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`${k.levers} levers`} deltaType="positive" />
        <MetricCard title="P&L Impact" value={formatDollar(k.pnlImpact)} icon={TrendingUp} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta="Discounts & financing yield" deltaType="positive" />
        <MetricCard title="Largest Lever" value={formatDollar(levers[0]?.cashRelease)} icon={Calculator} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={levers[0]?.name ?? ''} deltaType="neutral" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {levers.map((l: any) => (
          <MetricCard key={l.name} title={`${l.area} lever`} value={formatDollar(l.cashRelease)} accent={AREA_ACCENT[l.area]} delta={l.name} deltaType="neutral" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Cash Release by Lever and Company" className="lg:col-span-2">
          <ReactECharts option={{ tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDollar(v) }, legend: { top: 0 }, grid: { left: 280, right: 20, bottom: 20, top: 36 },
            xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            yAxis: { type: 'category', data: levers.map((l: any) => l.name).reverse(), axisLabel: { fontSize: 10 } },
            series: companies.map((c, i) => ({ name: c, type: 'bar', stack: 'cash', itemStyle: { color: PALETTE[i] },
              data: levers.map((l: any) => rows.find((r: any) => r.lever === l.name && r.company === c)?.cashRelease ?? 0).reverse() })) }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Opportunity Detail" className="lg:col-span-2">
          <DataTable columns={[
            { key: 'company', label: 'Company' }, { key: 'lever', label: 'Lever' }, { key: 'area', label: 'Area' },
            { key: 'currentDays', label: 'Current', format: formatDays }, { key: 'targetDays', label: 'Target', format: formatDays },
            { key: 'cashRelease', label: 'Cash Release', format: formatDollar }, { key: 'pnlImpact', label: 'P&L Impact', format: formatDollar },
          ]} data={rows} />
        </ChartCard>
      </div>
    </div>
  );
}
