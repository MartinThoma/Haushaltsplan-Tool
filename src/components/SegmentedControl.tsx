import type { ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface Props<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg bg-surface-3 p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition-colors ${
              selected ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
