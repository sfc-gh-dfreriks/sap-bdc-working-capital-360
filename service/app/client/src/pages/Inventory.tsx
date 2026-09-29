import { useFilterArgs } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchInventory } from '@/lib/api';
import { formatDollar, formatPct, formatDays } from '@/lib/utils';
import MetricCard, { DollarSign, Gauge, TrendingDown, PieChart } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import DemoBadge from '@/components/DemoBadge';
import { NeedCompany, Loading, ErrorBox } from '@/components/PageState';
import ReactECharts from 'echarts-for-react';

const PALETTE = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];

export default function Inventory() {
  const { f, has, deps } = useFilterArgs();
  const { data, loading, error } = useQuery(() => has ? fetchInventory(f) : Promise.resolve(null), deps);
  if (!has) return <NeedCompany />;
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.kpis) return null;
  const k = data.kpis;
  const dio = data.dioTrend ?? [];
  const cats = data.categories ?? [];
  const over = cats.filter((c: any) => c.gapDays > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><DemoBadge label="Demo enrichment: inventory valuation" /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Inventory Value" value={formatDollar(k.inventory)} icon={DollarSign} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={`Month ${k.month}`} deltaType="neutral" />
        <MetricCard title="DIO · Days Inventory Outstanding" value={formatDays(k.dio)} icon={Gauge} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta="COGS-weighted" deltaType="neutral" trend={dio.map((t: any) => t.dio)} />
        <MetricCard title="Slow-Moving Value" value={formatDollar(k.slowMoving)} icon={TrendingDown} accent="border-red-300/50 bg-gradient-to-br from-red-50 to-rose-50" delta={`${formatPct(k.slowMovingPct)} of inventory`} deltaType="negative" />
        <MetricCard title="Categories Over Target" value={`${over} / ${cats.length}`} icon={PieChart} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta="DIO above target" deltaType={over ? 'negative' : 'positive'} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Days Inventory Outstanding (DIO) Trend">
          <ReactECharts option={{ tooltip: { trigger: 'axis' }, grid: { left: 50, right: 20, bottom: 30, top: 20 },
            xAxis: { type: 'category', data: dio.map((t: any) => t.month), boundaryGap: false },
            yAxis: { type: 'value', axisLabel: { formatter: '{value} d' } },
            series: [{ type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: dio.map((t: any) => t.dio), lineStyle: { color: '#f59e0b', width: 3 }, itemStyle: { color: '#f59e0b' },
              areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(245,158,11,0.35)' }, { offset: 1, color: 'rgba(245,158,11,0.03)' }] } } }] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Inventory by Category" subtitle={`Month ${k.month}`}>
          <ReactECharts option={{ tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${formatDollar(p.value)} (${p.percent}%)` },
            series: [{ type: 'pie', radius: ['40%', '70%'], data: cats.map((d: any, i: number) => ({ name: d.name, value: d.value, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
              itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { formatter: '{b}\n{d}%', fontSize: 11 } }] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="DIO vs Target by Category" className="lg:col-span-2">
          <ReactECharts option={{ tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 60, right: 20, bottom: 30, top: 36 },
            xAxis: { type: 'category', data: cats.map((c: any) => c.name), axisLabel: { fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { formatter: '{value} d' } },
            series: [
              { name: 'Actual DIO', type: 'bar', data: cats.map((c: any) => ({ value: c.dio, itemStyle: { color: c.gapDays > 0 ? '#ef4444' : '#10b981', borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 36 },
              { name: 'Target DIO', type: 'line', data: cats.map((c: any) => c.targetDio), symbol: 'diamond', symbolSize: 10, lineStyle: { type: 'dashed', color: '#11567f' }, itemStyle: { color: '#11567f' } },
            ] }} style={{ height: 300 }} />
        </ChartCard>
        <ChartCard title="Category Detail" className="lg:col-span-2">
          <DataTable columns={[
            { key: 'name', label: 'Category' }, { key: 'value', label: 'Inventory Value', format: formatDollar },
            { key: 'slowMoving', label: 'Slow-Moving', format: formatDollar },
            { key: 'dio', label: 'DIO', format: formatDays }, { key: 'targetDio', label: 'Target DIO', format: formatDays },
            { key: 'gapDays', label: 'Gap vs Target', format: (v: any) => v == null ? '–' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} d` },
          ]} data={cats} />
        </ChartCard>
      </div>
    </div>
  );
}
