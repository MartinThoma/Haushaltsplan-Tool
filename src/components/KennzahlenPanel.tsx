import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LoadedDataset } from '../lib/catalog.ts';
import { toUnit, type Unit } from '../lib/compare.ts';
import {
  DASH,
  formatDate,
  formatEuro,
  formatInteger,
  formatPoints,
  formatShare,
  formatSignedEuro,
} from '../lib/format.ts';
import {
  COMPUTED_KENNZAHLEN,
  STORED_KENNZAHLEN,
  storedKennzahl,
  type KennzahlDefinition,
  type KennzahlValue,
} from '../lib/kennzahlen.ts';

interface Props {
  datasets: LoadedDataset[] | undefined;
  /** One header per dataset, same order. */
  headers: ReactNode[];
  unit: Unit;
  /** Adds a "B − A" column (pairwise comparison). */
  showDelta?: boolean;
  stale?: boolean;
}

interface Row {
  definition: KennzahlDefinition;
  /** Per dataset: the value in its natural unit (€, %, ratio) and, for stored figures, its provenance. */
  cells: (KennzahlValue | null)[];
}

const GROUPS = [
  { title: 'Hebesätze', keys: ['hebesatz_grundsteuer_a', 'hebesatz_grundsteuer_b', 'hebesatz_gewerbesteuer'] },
  { title: 'Finanzlage', keys: ['schulden', 'ruecklagen', 'kassenkredite_hoechstbetrag'] },
] as const;

function provenance(cell: KennzahlValue | null): string | undefined {
  if (!cell || (!cell.stichtag && !cell.quelle)) return undefined;
  return [cell.stichtag && `Stand ${formatDate(cell.stichtag)}`, cell.quelle && `Quelle: ${cell.quelle}`]
    .filter(Boolean)
    .join(' · ');
}

function format(definition: KennzahlDefinition, value: number | null): string {
  if (value === null) return DASH;
  if (definition.unit === 'hebesatz') return `${formatInteger(value)} %`;
  if (definition.unit === 'anteil') return formatShare(value);
  return formatEuro(value);
}

function formatDelta(definition: KennzahlDefinition, a: number | null, b: number | null): string {
  if (a === null || b === null) return DASH;
  if (definition.unit === 'hebesatz') return formatPoints(b - a);
  if (definition.unit === 'anteil') return formatPoints((b - a) * 100);
  return formatSignedEuro(b - a);
}

export function KennzahlenPanel({ datasets, headers, unit, showDelta = false, stale = false }: Props) {
  if (!datasets) return null;
  const einwohner = datasets.map((d) => d.data.metadata.einwohner);

  const groups: { title: string; rows: Row[] }[] = GROUPS.map((group) => ({
    title: group.title,
    rows: STORED_KENNZAHLEN.filter((k) => (group.keys as readonly string[]).includes(k.key))
      .map((definition) => ({ definition, cells: datasets.map((d) => storedKennzahl(d.data, definition.key)) }))
      .filter((row) => row.cells.some(Boolean)),
  }));
  groups.push({
    title: 'Aus dem Haushalt berechnet',
    rows: COMPUTED_KENNZAHLEN.map((definition) => ({
      definition,
      cells: datasets.map((d) => {
        const wert = definition.compute(d.data);
        return wert === null ? null : { wert };
      }),
    })),
  });

  // Values in the unit shown on screen: € figures follow the €/EW switch.
  const shown = (definition: KennzahlDefinition, cell: KennzahlValue | null, i: number) =>
    cell === null ? null : definition.unit === 'euro' ? toUnit(cell.wert, einwohner[i]!, unit) : cell.wert;

  const sources = new Map<string, string[]>();
  for (const d of datasets) {
    for (const k of STORED_KENNZAHLEN) {
      const quelle = storedKennzahl(d.data, k.key)?.quelle;
      if (!quelle) continue;
      const where = `${d.data.metadata.kommune} ${d.data.metadata.jahr}`;
      const list = sources.get(quelle) ?? [];
      if (!list.includes(where)) list.push(where);
      sources.set(quelle, list);
    }
  }

  const columnCount = headers.length + (showDelta ? 2 : 1);

  return (
    <details
      open
      className={`group/kz rounded-xl border border-line bg-surface transition-opacity ${stale ? 'opacity-60' : ''}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-ink-3 transition-transform group-open/kz:rotate-90" />
        Kernzahlen
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-4 py-2 text-left text-xs font-medium text-ink-2">
                Kennzahl
              </th>
              {headers.map((header, i) => (
                <th
                  key={i}
                  scope="col"
                  className="min-w-32 border-b border-line px-3 py-2 text-right text-xs font-medium text-ink"
                >
                  {header}
                </th>
              ))}
              {showDelta && (
                <th
                  scope="col"
                  className="min-w-32 border-b border-line px-4 py-2 text-right text-xs font-medium text-ink"
                >
                  Differenz B − A
                </th>
              )}
            </tr>
          </thead>
          {groups
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <tbody key={group.title}>
                <tr>
                  <th
                    colSpan={columnCount}
                    scope="colgroup"
                    className="border-b border-line bg-surface-2 px-4 pt-2.5 pb-1 text-left text-xs font-semibold tracking-wide text-ink-2 uppercase"
                  >
                    {group.title}
                  </th>
                </tr>
                {group.rows.map(({ definition, cells }) => {
                  const values = cells.map((cell, i) => shown(definition, cell, i));
                  const perResident = definition.unit === 'euro' && unit === 'perCapita';
                  return (
                    <tr key={definition.key} className="hover:bg-surface-2">
                      <th scope="row" className="border-b border-line px-4 py-1.5 text-left font-normal">
                        <span title={definition.description}>{definition.label}</span>
                        {perResident && <span className="text-ink-3"> je EW</span>}
                      </th>
                      {values.map((value, i) => {
                        const note = provenance(cells[i]!);
                        return (
                          <td key={i} className="num border-b border-line px-3 py-1.5 text-right">
                            <span
                              title={note}
                              className={`${value === null ? 'text-ink-3' : ''} ${note ? 'cursor-help underline decoration-line-strong decoration-dotted underline-offset-4' : ''}`}
                            >
                              {format(definition, value)}
                            </span>
                          </td>
                        );
                      })}
                      {showDelta && (
                        <td className="num border-b border-line px-4 py-1.5 text-right text-ink-2">
                          {formatDelta(definition, values[0] ?? null, values[1] ?? null)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            ))}
        </table>
      </div>
      {sources.size > 0 && (
        <div className="px-4 py-3 text-xs text-ink-3">
          <p className="mb-1 font-medium text-ink-2">Quellen</p>
          <ul className="space-y-0.5">
            {[...sources].map(([quelle, where]) => (
              <li key={quelle}>
                {quelle} <span className="text-ink-3">({where.join(', ')})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
