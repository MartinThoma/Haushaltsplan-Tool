import { useMemo } from 'react';
import type { LoadedDataset } from '../lib/catalog.ts';
import type { BudgetMetadata } from '../lib/schema.ts';
import { delta, toUnit } from '../lib/compare.ts';
import { csvNumber, formatInteger, formatSignedEuro } from '../lib/format.ts';
import { downloadFile, slug, toCsv } from '../lib/csv.ts';
import { buildTree, type TreeNode } from '../lib/tree.ts';
import { BudgetTable, type Column } from './BudgetTable.tsx';
import { DeviationBadge } from './DeviationBadge.tsx';
import { KennzahlenPanel } from './KennzahlenPanel.tsx';
import { Toolbar, ToolbarGroup } from './Toolbar.tsx';
import {
  Amount,
  CSV_PREFIX_HEADER,
  csvPrefix,
  nodeRows,
  sectionsFor,
  unitSuffix,
  useTreeRows,
  type ViewControls,
} from './viewModel.tsx';

const THRESHOLDS = [0.1, 0.2, 0.3, 0.5];

interface Props {
  /** Loaded datasets for A and B; undefined while loading. */
  datasets: [LoadedDataset, LoadedDataset] | undefined;
  stale: boolean;
  controls: ViewControls;
  threshold: number;
  onThreshold: (threshold: number) => void;
}

export function PairView({ datasets, stale, controls, threshold, onThreshold }: Props) {
  const { settings } = controls;
  const sections = sectionsFor(settings.section);
  const trees = useMemo(
    () => (datasets ? buildTree([datasets[0].data, datasets[1].data], sections) : []),
    [datasets, sections],
  );
  const { rows, toggle, setLevel } = useTreeRows(trees, controls);

  const einwohner = datasets?.map((d) => d.data.metadata.einwohner) ?? [1, 1];
  const value = (node: TreeNode, i: 0 | 1) => toUnit(node.values[i] ?? null, einwohner[i]!, settings.unit);
  const unit = unitSuffix(settings.unit);
  // Labels follow the datasets on screen, which lag behind the selection while loading.
  const names = datasets?.map((d) => `${d.data.metadata.kommune} ${d.data.metadata.jahr}`) ?? ['A', 'B'];

  const columns: Column[] = [
    ...([0, 1] as const).map((i) => ({
      key: i === 0 ? 'a' : 'b',
      className: 'min-w-36',
      header: (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span aria-hidden className={`size-2 rounded-full ${i === 0 ? 'bg-series-a' : 'bg-series-b'}`} />
            {i === 0 ? 'A' : 'B'} · {names[i]}
          </span>
          <span className="font-normal text-ink-3">{unit}</span>
        </span>
      ),
      cell: (node: TreeNode) => <Amount value={value(node, i)} />,
    })),
    {
      key: 'diff',
      className: 'min-w-36',
      header: (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="text-ink">Differenz B − A</span>
          <span className="font-normal text-ink-3">{unit}</span>
        </span>
      ),
      cell: (node) => <span className="num">{formatSignedEuro(delta(value(node, 0), value(node, 1)).absolute)}</span>,
    },
    {
      key: 'pct',
      className: 'min-w-28',
      header: <span className="text-ink">Abweichung</span>,
      cell: (node) => <DeviationBadge a={value(node, 0)} b={value(node, 1)} threshold={threshold} />,
    },
  ];

  function exportCsv() {
    if (!datasets) return;
    const [a, b] = datasets.map((d) => d.data.metadata) as [BudgetMetadata, BudgetMetadata];
    const header = [
      ...CSV_PREFIX_HEADER,
      `A: ${names[0]} (${unit})`,
      `B: ${names[1]} (${unit})`,
      `Differenz B − A (${unit})`,
      'Abweichung (%)',
    ];
    const body = nodeRows(rows).map((node) => {
      const [va, vb] = [value(node, 0), value(node, 1)];
      const d = delta(va, vb);
      return [
        ...csvPrefix(node),
        csvNumber(va),
        csvNumber(vb),
        csvNumber(d.absolute),
        csvNumber(d.relative === null ? null : d.relative * 100),
      ];
    });
    const name = `haushaltsvergleich_${slug(a.kommune)}-${a.jahr}_${slug(b.kommune)}-${b.jahr}${settings.unit === 'perCapita' ? '_je-ew' : ''}.csv`;
    downloadFile(name, toCsv([header, ...body]));
  }

  const [ewA, ewB] = einwohner as [number, number];
  const sizeGap = Math.abs(ewA - ewB) / Math.min(ewA, ewB);

  return (
    <div className="flex flex-col gap-3">
      <KennzahlenPanel
        datasets={datasets}
        headers={([0, 1] as const).map((i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${i === 0 ? 'bg-series-a' : 'bg-series-b'}`} />
            {i === 0 ? 'A' : 'B'} · {names[i]}
          </span>
        ))}
        unit={settings.unit}
        showDelta
        stale={stale}
      />
      <Toolbar
        settings={settings}
        onSection={controls.onSection}
        onUnit={controls.onUnit}
        onSearch={controls.onSearch}
        onLevel={setLevel}
        onExport={exportCsv}
        exportDisabled={!datasets}
      >
        <ToolbarGroup label="Hervorheben ab">
          <span className="relative">
            <select
              aria-label="Abweichungen hervorheben ab"
              value={threshold}
              onChange={(e) => onThreshold(Number(e.target.value))}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
            >
              {THRESHOLDS.map((t) => (
                <option key={t} value={t}>
                  ± {t * 100} %
                </option>
              ))}
            </select>
          </span>
        </ToolbarGroup>
      </Toolbar>

      {datasets && settings.unit === 'absolute' && sizeGap > 0.05 && (
        <p className="text-sm text-ink-2">
          A hat {formatInteger(ewA)}, B {formatInteger(ewB)} Einwohner. Für einen fairen Vergleich{' '}
          <button
            type="button"
            className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
            onClick={() => controls.onUnit('perCapita')}
          >
            auf €/EW umschalten
          </button>
          .
        </p>
      )}

      <BudgetTable
        caption={`Vergleich ${names[0]} mit ${names[1]}`}
        rows={rows}
        columns={columns}
        onToggle={toggle}
        stale={stale}
        emptyMessage={datasets ? 'Keine Zeilen gefunden.' : 'Daten werden geladen …'}
      />
    </div>
  );
}
