import { useId, type ReactNode } from 'react';

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

/** Native radio buttons styled as segments, so arrow keys and screen readers work as usual. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  const name = useId();
  return (
    <fieldset className="inline-flex shrink-0 rounded-lg bg-surface-3 p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            title={option.title}
            className={`relative cursor-pointer rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
              selected ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
