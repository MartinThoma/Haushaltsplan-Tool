import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { SECTION_LABEL } from '../lib/master.ts';
import type { RowItem, TreeNode } from '../lib/tree.ts';

export interface Column {
  key: string;
  header: ReactNode;
  cell: (node: TreeNode) => ReactNode;
  /** Extra classes for header and body cells, e.g. a minimum width. */
  className?: string;
}

interface Props {
  caption: string;
  rows: RowItem[];
  columns: Column[];
  onToggle: (id: string) => void;
  /** Rendered in front of the row label, e.g. the chart toggle in the time series. */
  leading?: (node: TreeNode) => ReactNode;
  /** Dims the table while newly selected datasets are loading. */
  stale?: boolean;
  emptyMessage: string;
}

const INDENT_REM = 1;

export function BudgetTable({ caption, rows, columns, onToggle, leading, stale, emptyMessage }: Props) {
  return (
    <div
      className={`relative max-h-[calc(100dvh-7rem)] overflow-auto rounded-xl border border-line bg-surface transition-opacity ${
        stale ? 'opacity-60' : ''
      }`}
    >
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-30 border-b border-line bg-surface px-3 py-2 text-left align-bottom text-xs font-medium text-ink-2"
            >
              Gruppierung
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`sticky top-0 z-20 border-b border-line bg-surface px-3 py-2 text-right align-bottom text-xs font-medium text-ink-2 ${column.className ?? ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-ink-3">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) =>
            row.type === 'section' ? (
              <tr key={`section-${row.section}`}>
                <th
                  colSpan={columns.length + 1}
                  scope="colgroup"
                  className="border-b border-line bg-surface-2 p-0 text-left"
                >
                  <span className="sticky left-0 inline-block px-3 pt-3 pb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">
                    {SECTION_LABEL[row.section]}
                  </span>
                </th>
              </tr>
            ) : (
              <NodeRow key={row.node.id} row={row} columns={columns} onToggle={onToggle} leading={leading} />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function NodeRow({
  row,
  columns,
  onToggle,
  leading,
}: {
  row: Extract<RowItem, { type: 'node' }>;
  columns: Column[];
  onToggle: (id: string) => void;
  leading?: (node: TreeNode) => ReactNode;
}) {
  const { node, expanded, expandable, match } = row;
  const isTotal = node.kind === 'side';
  const isRest = node.kind === 'rest';
  const weight = isTotal ? 'font-semibold' : node.depth === 1 && !isRest ? 'font-medium' : 'font-normal';
  // Sticky cells need opaque backgrounds, so hover is applied per cell.
  const tone = isTotal ? 'bg-surface-2 group-hover:bg-surface-3' : 'bg-surface group-hover:bg-surface-2';
  const cellBase = `${weight} border-b border-line ${tone}`;

  return (
    <tr className="group">
      <th scope="row" className={`sticky left-0 z-10 px-3 py-1.5 text-left ${cellBase}`}>
        <div className="flex min-w-44 items-start gap-1 sm:min-w-[22rem] lg:max-w-[30rem]">
          {leading?.(node)}
          <div
            className="flex items-start gap-1"
            style={{ paddingLeft: `${Math.max(0, node.depth - 1) * INDENT_REM}rem` }}
          >
            {expandable ? (
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                aria-expanded={expanded}
                aria-label={`${node.code ?? ''} ${node.title} ${expanded ? 'zuklappen' : 'aufklappen'}`}
                className="-my-0.5 shrink-0 rounded p-0.5 text-ink-3 hover:bg-surface-3 hover:text-ink"
              >
                <ChevronRight aria-hidden className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <span aria-hidden className="w-5 shrink-0" />
            )}
            {node.kind !== 'side' && (
              <span className="w-8 shrink-0 pt-px font-mono text-xs font-normal text-ink-3">
                {node.kind === 'code' ? node.code : ''}
              </span>
            )}
            <span
              className={`${node.known && !isRest ? '' : 'text-ink-2 italic'} ${match ? 'rounded-sm bg-warning/25 px-0.5' : ''}`}
              title={
                isRest
                  ? 'Teil der Summe darüber, den die Quelle nicht weiter aufschlüsselt'
                  : node.known
                    ? undefined
                    : 'Nicht im Gruppierungsplan aufgeführt'
              }
            >
              {node.title}
            </span>
          </div>
        </div>
      </th>
      {columns.map((column) => (
        <td key={column.key} className={`px-3 py-1.5 text-right align-top ${cellBase} ${column.className ?? ''}`}>
          {column.cell(node)}
        </td>
      ))}
    </tr>
  );
}
