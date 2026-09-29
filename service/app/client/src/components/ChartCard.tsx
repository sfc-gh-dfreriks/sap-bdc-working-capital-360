import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  subtitle?: string;
  badge?: ReactNode;
}

export default function ChartCard({ title, children, className, subtitle, badge }: ChartCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-6 shadow-md transition-shadow hover:shadow-lg',
        className
      )}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="min-h-[280px]">
        {children}
      </div>
    </div>
  );
}
