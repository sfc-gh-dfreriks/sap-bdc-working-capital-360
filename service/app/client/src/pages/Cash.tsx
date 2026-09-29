import { useFilterArgs } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchCash } from '@/lib/api';
import { formatDollar, formatNumber } from '@/lib/utils';
import MetricCard, { DollarSign, TrendingDown, Building2, Activity } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DemoBadge from '@/components/DemoBadge';
import { NeedCompany, Loading, ErrorBox } from '@/components/PageState';
import ReactECharts from 'echarts-for-react';

const PALETTE = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];

export default function Cash() {
  const { f, has, deps } = useFilterArgs();
  const { data, loading, error } = useQuery(() => has ? fetchCash(f) : Promise.resolve(null), deps);
  if (!has) return <NeedCompany />;
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.kpis) return null;
  const k = data.kpis;
  const trend = data.trend ?? [];
  const weeks = [...new Set(trend.map((t: any) => t.week))] as string[];
  const names = [...new Set(trend.map((t: any) => t.name))] as string[];
  const fc = data.forecast ?? [];
  const pie = (rows: any[]) => ({ tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${formatDollar(p.value)} (${p.percent}%)` },
    series: [{ type: 'pie', radius: ['40%', '70%'], data: rows.map((d: any, i: number) => ({ name: d.name, value: d.balance, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { formatter: '{b}\n{d}%', fontSize: 11 } }] });

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><DemoBadge label="Demo enrichment: bank balances & forecast" /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Bank Balance" value={formatDollar(k.balance)} icon={DollarSign} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`Week ending ${k.weekEnd}`} deltaType="neutral" />
        <MetricCard title="Bank Accounts" value={formatNumber(k.accounts)} icon={Building2} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${(data.byBank ?? []).length} house banks`} deltaType="neutral" />
        <MetricCard title="13-Week Net Flow" value={formatDollar(k.forecastNet)} icon={Activity} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta="Receipts − payments" deltaType={k.forecastNet >= 0 ? 'positive' : 'negative'} />
        <MetricCard title="Week-13 Balance" value={formatDollar(k.forecastEndBalance)} icon={TrendingDown} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={`Low point ${formatDollar(k.minBalance)}`} deltaType="neutral" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Weekly Bank Balance by Company" className="lg:col-span-2">
          <ReactECharts option={{ tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDollar(v) }, legend: { top: 0 },
            grid: { left: 70, right: 20, bottom: 30, top: 36 },
            xAxis: { type: 'category', data: weeks, boundaryGap: false },
            yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
            series: names.map((n, i) => ({ name: n, type: 'line', stack: 'bal', areaStyle: { opacity: 0.25 }, symbol: 'none', smooth: true,
              data: weeks.map((w) => trend.find((t: any) => t.week === w && t.name === n)?.balance ?? null), itemStyle: { color: PALETTE[i] } })) }} style={{ height: 320 }} />
        </ChartCard>
        <ChartCard title="Balance by House Bank"><ReactECharts option={pie(data.byBank ?? [])} style={{ height: 300 }} /></ChartCard>
        <ChartCard title="Balance by Account Purpose"><ReactECharts option={pie(data.byPurpose ?? [])} style={{ height: 300 }} /></ChartCard>
        <ChartCard title="13-Week Cash Forecast" subtitle={`Starting from latest bank balance ${formatDollar(k.balance)}`} className="lg:col-span-2">
          <ReactECharts option={{ tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDollar(v) }, legend: { top: 0 },
            grid: { left: 70, right: 70, bottom: 30, top: 36 },
            xAxis: { type: 'category', data: fc.map((r: any) => `W${r.weekNo} ${r.weekEnd}`) },
            yAxis: [{ type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
                    { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) }, splitLine: { show: false } }],
            series: [
              { name: 'Receipts', type: 'bar', data: fc.map((r: any) => r.receipts), itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } },
              { name: 'Payments', type: 'bar', data: fc.map((r: any) => -r.payments), itemStyle: { color: '#ef4444', borderRadius: [0, 0, 4, 4] } },
              { name: 'Closing balance', type: 'line', yAxisIndex: 1, smooth: true, data: fc.map((r: any) => r.closingBalance), lineStyle: { color: '#11567f', width: 3 }, itemStyle: { color: '#11567f' } },
            ] }} style={{ height: 340 }} />
        </ChartCard>
      </div>
    </div>
  );
}
