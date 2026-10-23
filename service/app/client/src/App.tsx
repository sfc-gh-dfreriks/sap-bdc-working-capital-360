import { useState } from 'react';
import { FilterProvider } from '@/hooks/useFilters';
import Sidebar, { NAV_ITEMS, type PageId } from '@/components/Sidebar';
import Overview from '@/pages/Overview';
import Cash from '@/pages/Cash';
import Receivables from '@/pages/Receivables';
import Payables from '@/pages/Payables';
import EarlyPayment from '@/pages/EarlyPayment';
import Inventory from '@/pages/Inventory';
import Opportunities from '@/pages/Opportunities';
import Lineage from '@/pages/Lineage';
import Analyst from '@/pages/Analyst';
import AskCortexPage from '@/pages/AskCortexPage';
import AskCortex from '@/components/AskCortex';

// Per-page Ask Cortex topic + suggested questions (topics defined in server/src/routes/askCortex.ts).
const ASK: Partial<Record<PageId, { topic: string; suggestions: string[] }>> = {
  overview: { topic: 'overview', suggestions: ['Which company has the worst cash conversion cycle and why?', 'How has net working capital trended over the last 12 months?'] },
  cash: { topic: 'cash', suggestions: ['Where is cash concentrated by bank and purpose?', 'Which weeks of the 13-week forecast look tightest?'] },
  ar: { topic: 'ar', suggestions: ['Which customers should collections prioritise first?', 'What is driving overdue AR and how could we cut DSO?'] },
  ap: { topic: 'ap', suggestions: ['How much discount are we losing and to which suppliers?', 'Is there room to extend DPO without hurting suppliers?'] },
  'early-pay': { topic: 'early-pay', suggestions: ['Which early-pay program delivers the best return?', 'How much more volume could move to dynamic discounting?'] },
  inventory: { topic: 'inventory', suggestions: ['Which categories are furthest above target DIO?', 'How much cash is tied up in slow-moving stock?'] },
  opportunities: { topic: 'opportunities', suggestions: ['What are the top three levers to release cash this year?', 'Which company has the largest working capital opportunity?'] },
};

const PAGE_COMPONENTS: Record<string, React.FC> = {
  ask: AskCortexPage,
  overview: Overview,
  cash: Cash,
  ar: Receivables,
  ap: Payables,
  'early-pay': EarlyPayment,
  inventory: Inventory,
  opportunities: Opportunities,
  lineage: Lineage,
  analyst: Analyst,
};

function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('overview');
  const navItem = NAV_ITEMS.find((n) => n.id === activePage)!;
  const Icon = navItem.icon;
  const PageComponent = PAGE_COMPONENTS[activePage];
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="ml-64 min-h-screen p-6">
        <div className="mb-6 flex items-center gap-3">
          <Icon className="h-6 w-6 text-sf-primary" />
          <h1 className="text-2xl font-bold text-sf-deeper">{navItem.label}</h1>
        </div>
        {ASK[activePage] && (
          <div className="mb-6">
            <AskCortex key={activePage} topic={ASK[activePage]!.topic} suggestions={ASK[activePage]!.suggestions}
              label={`Ask Cortex about ${navItem.label}`} />
          </div>
        )}
        {PageComponent ? <PageComponent /> : null}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <FilterProvider>
      <AppShell />
    </FilterProvider>
  );
}
