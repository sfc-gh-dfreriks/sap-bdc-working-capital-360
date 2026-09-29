/** Shared loading / error / empty-selection states used by every filtered page. */
export function NeedCompany() {
  return <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">Select at least one company.</div>;
}
export function Loading({ n = 4 }: { n?: number }) {
  return <div className="grid grid-cols-4 gap-4">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}</div>;
}
export function ErrorBox({ error }: { error: string }) {
  return <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">Error: {error}</div>;
}
