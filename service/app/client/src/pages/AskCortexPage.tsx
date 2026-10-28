import AskCortex from '@/components/AskCortex';

const SUGGESTIONS = [
  'Summarise our working capital position in three bullets',
  'Which company has the longest cash conversion cycle and why?',
  'Where is the biggest cash release opportunity?',
  'How do DSO, DPO and DIO compare to a year ago?',
  'How much cash do we hold versus open AR and AP?',
  'What should the treasurer focus on this quarter?',
];

/** Free-form Cortex analysis over a compact cross-page fact set (topic `general`). */
export default function AskCortexPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-gray-600">
        Ask about cash, receivables, payables, early payment, inventory or improvement levers. Cortex answers from live
        Snowflake facts across all companies for 2024-04 to 2025-03.
      </p>
      <AskCortex topic="general" label="Analyse working capital" suggestions={SUGGESTIONS} autoOpen
        placeholder="Ask anything about working capital…" />
    </div>
  );
}
