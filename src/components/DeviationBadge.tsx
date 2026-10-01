import { ArrowDown, ArrowUp } from 'lucide-react';
import { delta, significance } from '../lib/compare.ts';
import { DASH, formatPercent } from '../lib/format.ts';

interface Props {
  a: number | null;
  b: number | null;
  threshold: number;
}

/** FR-2.3: relative deviation of B from A, highlighted once it crosses the threshold. */
export function DeviationBadge({ a, b, threshold }: Props) {
  const level = significance(a, b, threshold);
  const { relative } = delta(a, b);

  if (level === 'onlyA' || level === 'onlyB') {
    return (
      <span
        className="inline-flex items-center rounded-full border border-line-strong px-2 text-xs font-normal text-ink-2"
        title={level === 'onlyA' ? 'Nur bei A vorhanden' : 'Nur bei B vorhanden'}
      >
        {level === 'onlyA' ? 'nur A' : 'nur B'}
      </span>
    );
  }
  if (relative === null) return <span className="text-ink-3">{DASH}</span>;

  const text = formatPercent(relative);
  if (level === 'none') return <span className="num text-ink-2">{text}</span>;

  const Arrow = relative > 0 ? ArrowUp : ArrowDown;
  const tone =
    level === 'strong' ? 'bg-serious/30 ring-serious font-semibold' : 'bg-warning/20 ring-warning/70 font-medium';
  const description = `${level === 'strong' ? 'Starke' : 'Deutliche'} Abweichung: B liegt ${formatPercent(Math.abs(relative)).replace('+', '')} ${relative > 0 ? 'über' : 'unter'} A`;
  return (
    <span
      className={`num inline-flex items-center gap-0.5 rounded-full px-1.5 text-ink ring-1 ring-inset ${tone}`}
      title={description}
    >
      <Arrow aria-hidden className="size-3" />
      {text}
      <span className="sr-only">{description}</span>
    </span>
  );
}
