import { Check, X } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import type { LoadedDataset } from '../lib/catalog.ts';
import { delta, toUnit } from '../lib/compare.ts';
import { csvNumber, formatPercent } from '../lib/format.ts';
import { downloadFile, slug, toCsv } from '../lib/csv.ts';
import { SECTIONS, SECTION_LABEL, SIDE_LABEL, standaloneTitle } from '../lib/master.ts';
import { buildTree, findNode, type TreeNode } from '../lib/tree.ts';
import { BudgetTable, type Column } from './BudgetTable.tsx';
import { KennzahlenPanel } from './KennzahlenPanel.tsx';
import { Toolbar } from './Toolbar.tsx';
import type { TrendSeries } from './TrendChart.tsx';
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

export interface ChartPick {
  id: string;
  slot: number;
}

// Chart.js is only needed here, so it is loaded on demand.
const TrendChart = lazy(() => import('./TrendChart.tsx').then((m) => ({ default: m.TrendChart })));

/** One line per categorical color slot (--series-1 … --series-8). */
const MAX_SERIES = 8;

/** Gewerbesteuer and Personalausgaben: two lines most readers look for first. */
const DEFAULT_CHART = ['vwh.einnahmen.003', 'vwh.ausgaben.4'];

interface Props {
  /** Loaded datasets of the selected years, oldest first; undefined while loading. */
  datasets: LoadedDataset[] | undefined;
  stale: boolean;
  controls: ViewControls;
  chart: ChartPick[] | null;
  onChart: (chart: ChartPick[]) => void;
}

function seriesLabel(node: TreeNode): string {
  if (node.kind === 'side') return `${SIDE_LABEL[node.side]} ${SECTION_LABEL[node.section]}`;
  if (node.kind === 'rest') return `${node.code ?? SIDE_LABEL[node.side]} ${node.title}`;
  return `${node.code} ${standaloneTitle(node.code!)}`;
}

function shortLabel(node: TreeNode): string {
  if (node.kind === 'side') return `${SIDE_LABEL[node.side].slice(0, 4)}. ${node.section === 'vwh' ? 'VwH' : 'VmH'}`;
  return node.kind === 'rest' ? `${node.code ?? SIDE_LABEL[node.side].slice(0, 4) + '.'} Rest` : node.code!;
}

export function SeriesView({ datasets, stale, controls, chart, onChart }: Props) {
  const { settings } = controls;
  const sections = sectionsFor(settings.section);
  const allTrees = useMemo(
    () =>
      datasets
        ? buildTree(
            datasets.map((d) => d.data),
            SECTIONS,
          )
        : [],
    [datasets],
  );
  const trees = useMemo(() => allTrees.filter((t) => sections.includes(t.section)), [allTrees, sections]);
  const { rows, toggle, setLevel } = useTreeRows(trees, controls);

  const metas = datasets?.map((d) => d.data.metadata) ?? [];
  const value = (node: TreeNode, i: number) => toUnit(node.values[i] ?? null, metas[i]!.einwohner, settings.unit);
  const unit = unitSuffix(settings.unit);
  const kommune = metas[0]?.kommune ?? '';

  const picks = chart ?? DEFAULT_CHART.filter((id) => findNode(allTrees, id)).map((id, slot) => ({ id, slot }));

  function toggleChart(id: string) {
    if (picks.some((p) => p.id === id)) return onChart(picks.filter((p) => p.id !== id));
    const used = new Set(picks.map((p) => p.slot));
    const slot = [...Array(MAX_SERIES).keys()].find((s) => !used.has(s));
    if (slot !== undefined) onChart([...picks, { id, slot }]);
  }

  const series: TrendSeries[] = picks.flatMap(({ id, slot }) => {
    const node = findNode(allTrees, id);
    if (!node) return [];
    return [
      { id, slot, label: seriesLabel(node), shortLabel: shortLabel(node), values: metas.map((_, i) => value(node, i)) },
    ];
  });

  const first = 0;
  const last = metas.length - 1;
  const columns: Column[] = [
    ...metas.map((meta, i) => ({
      key: `y${i}`,
      className: 'min-w-36',
      header: (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="text-ink">{meta.jahr}</span>
          <span className="font-normal text-ink-3">
            {meta.status} · {unit}
          </span>
        </span>
      ),
      cell: (node: TreeNode) => <Amount value={value(node, i)} />,
    })),
    ...(metas.length > 1
      ? [
          {
            key: 'change',
            className: 'min-w-28',
            header: (
              <span className="inline-flex flex-col items-end gap-0.5">
                <span className="text-ink">Veränderung</span>
                <span className="font-normal text-ink-3">
                  {metas[first]!.jahr}–{metas[last]!.jahr}
                </span>
              </span>
            ),
            cell: (node: TreeNode) => (
              <span className="num text-ink-2">
                {formatPercent(delta(value(node, first), value(node, last)).relative)}
              </span>
            ),
          },
        ]
      : []),
  ];

  function exportCsv() {
    if (!metas.length) return;
    const header = [
      ...CSV_PREFIX_HEADER,
      ...metas.map((m) => `${m.jahr} ${m.status} (${unit})`),
      ...(metas.length > 1 ? [`Veränderung ${metas[first]!.jahr}–${metas[last]!.jahr} (%)`] : []),
    ];
    const body = nodeRows(rows).map((node) => {
      const values = metas.map((_, i) => value(node, i));
      const change = delta(values[first]!, values[last]!).relative;
      return [
        ...csvPrefix(node),
        ...values.map(csvNumber),
        ...(metas.length > 1 ? [csvNumber(change === null ? null : change * 100)] : []),
      ];
    });
    const years = metas.length > 1 ? `${metas[first]!.jahr}-${metas[last]!.jahr}` : String(metas[0]!.jahr);
    downloadFile(
      `zeitreihe_${slug(kommune)}_${years}${settings.unit === 'perCapita' ? '_je-ew' : ''}.csv`,
      toCsv([header, ...body]),
    );
  }

  const leading = (node: TreeNode) => {
    const pick = picks.find((p) => p.id === node.id);
    const full = !pick && picks.length >= MAX_SERIES;
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!pick}
        disabled={full}
        onClick={() => toggleChart(node.id)}
        title={
          full
            ? `Höchstens ${MAX_SERIES} Linien im Diagramm`
            : pick
              ? 'Aus dem Diagramm entfernen'
              : 'Im Diagramm anzeigen'
        }
        aria-label={`${seriesLabel(node)} im Diagramm ${pick ? 'ausblenden' : 'anzeigen'}`}
        className="mt-0.5 mr-1 flex size-4 shrink-0 items-center justify-center rounded border border-line-strong bg-surface hover:border-ink-2 disabled:opacity-40"
        style={
          pick
            ? { background: `var(--series-${pick.slot + 1})`, borderColor: `var(--series-${pick.slot + 1})` }
            : undefined
        }
      >
        {pick && <Check aria-hidden className="size-3 stroke-[3] text-white" />}
      </button>
    );
  };

  const chartTitle = series.length === 1 ? series[0]!.label : 'Entwicklung';

  return (
    <div className="flex flex-col gap-3">
      <KennzahlenPanel
        datasets={datasets}
        headers={metas.map((m) => (
          <span key={m.jahr} className="inline-flex flex-col items-end">
            {m.jahr}
            <span className="font-normal text-ink-3">{m.status}</span>
          </span>
        ))}
        unit={settings.unit}
        stale={stale}
      />
      <section
        aria-label="Diagramm"
        className={`rounded-xl border border-line bg-surface p-4 transition-opacity ${stale ? 'opacity-60' : ''}`}
      >
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-sm font-semibold">{chartTitle}</h2>
          <p className="text-xs text-ink-3">
            {kommune} · {settings.unit === 'perCapita' ? 'Euro je Einwohner' : 'Euro'}
          </p>
        </div>
        {series.length >= 2 && (
          <ul aria-label="Legende" className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            {series.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-0.5 w-4 rounded-full"
                  style={{ background: `var(--series-${s.slot + 1})` }}
                />
                {s.label}
                <button
                  type="button"
                  onClick={() => toggleChart(s.id)}
                  className="rounded p-0.5 text-ink-3 hover:bg-surface-3 hover:text-ink"
                  aria-label={`${s.label} aus dem Diagramm entfernen`}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {series.length > 0 && metas.length > 0 ? (
          <Suspense fallback={<div className="h-64 sm:h-72" />}>
            <TrendChart labels={metas.map((m) => String(m.jahr))} series={series} />
          </Suspense>
        ) : (
          <p className="flex h-40 items-center justify-center text-center text-sm text-ink-3">
            Markiere in der Tabelle bis zu {MAX_SERIES} Positionen, um ihre Entwicklung zu sehen.
          </p>
        )}
      </section>

      <Toolbar
        settings={settings}
        onSection={controls.onSection}
        onUnit={controls.onUnit}
        onSearch={controls.onSearch}
        onLevel={setLevel}
        onExport={exportCsv}
        exportDisabled={!datasets}
      />

      <BudgetTable
        caption={`Zeitreihe ${kommune}`}
        rows={rows}
        columns={columns}
        onToggle={toggle}
        leading={leading}
        stale={stale}
        emptyMessage={datasets ? 'Keine Zeilen gefunden.' : 'Daten werden geladen …'}
      />
    </div>
  );
}
