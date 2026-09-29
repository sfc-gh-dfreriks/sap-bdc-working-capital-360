import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { fetchFilters } from '@/lib/api';

export const DEFAULT_FROM = '2024-04';
export const DEFAULT_TO = '2025-03';

interface FilterContextType {
  companies: string[];
  selectedCompanies: string[];
  setSelectedCompanies: (v: string[]) => void;
  months: string[];
  fromMonth: string;
  toMonth: string;
  setPeriod: (from: string, to: string) => void;
  loading: boolean;
}

const FilterContext = createContext<FilterContextType>({
  companies: [], selectedCompanies: [], setSelectedCompanies: () => {},
  months: [], fromMonth: DEFAULT_FROM, toMonth: DEFAULT_TO, setPeriod: () => {}, loading: true,
});

export function FilterProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [fromMonth, setFrom] = useState(DEFAULT_FROM);
  const [toMonth, setTo] = useState(DEFAULT_TO);
  const [loading, setLoading] = useState(true);
  const setPeriod = (f: string, t: string) => { if (f > t) [f, t] = [t, f]; setFrom(f); setTo(t); };

  useEffect(() => {
    fetchFilters()
      .then((data) => {
        setCompanies(data.companies); setSelectedCompanies(data.companies);
        setMonths(data.months ?? []);
        if (data.defaultFrom && data.defaultTo) { setFrom(data.defaultFrom); setTo(data.defaultTo); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return React.createElement(
    FilterContext.Provider,
    { value: { companies, selectedCompanies, setSelectedCompanies, months, fromMonth, toMonth, setPeriod, loading } },
    children
  );
}

export function useFilters() { return useContext(FilterContext); }

/** Standard page data hook inputs: the active filter selection and its dependency key. */
export function useFilterArgs() {
  const { selectedCompanies, fromMonth, toMonth } = useFilters();
  const f = { companies: selectedCompanies, from: fromMonth, to: toMonth };
  return { f, has: selectedCompanies.length > 0, deps: [selectedCompanies.join(','), fromMonth, toMonth] };
}
