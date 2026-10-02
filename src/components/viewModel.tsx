import { useMemo } from 'react';
import type { Unit } from '../lib/compare.ts';
import { formatEuro } from '../lib/format.ts';
import { SECTIONS, SECTION_LABEL, SIDE_LABEL, standaloneTitle, type Section } from '../lib/master.ts';
import { expansionForLevel, visibleRows, type RowItem, type SectionTree, type TreeNode } from '../lib/tree.ts';
import type { SectionChoice, ViewSettings } from './Toolbar.tsx';

export interface ExpansionState {
  /** Explicitly expanded rows; null means "derive from `level`". */
  ids: ReadonlySet<string> | null;
  level: number | null;
}

/** Everything a view needs from the app-wide controls. */
export interface ViewControls {
  settings: ViewSettings;
  expansion: ExpansionState;
  setExpansion: (expansion: ExpansionState) => void;
  onSection: (section: SectionChoice) => void;
  onUnit: (unit: Unit) => void;
  onSearch: (search: string) => void;
}

// Stable arrays, so memoized trees are not rebuilt on every render.
const SECTION_CHOICES: Record<SectionChoice, readonly Section[]> = { vwh: ['vwh'], vmh: ['vmh'], beide: SECTIONS };

export function sectionsFor(choice: SectionChoice): readonly Section[] {
  return SECTION_CHOICES[choice];
}

export function useTreeRows(trees: readonly SectionTree[], controls: ViewControls) {
  const { expansion, setExpansion, settings } = controls;
  const expanded = useMemo(() => expansion.ids ?? expansionForLevel(trees, expansion.level ?? 1), [expansion, trees]);
  const rows = useMemo(() => visibleRows(trees, expanded, settings.search), [trees, expanded, settings.search]);

  return {
    rows,
    toggle: (id: string) => {
      const ids = new Set(expanded);
      if (!ids.delete(id)) ids.add(id);
      setExpansion({ ids, level: null });
    },
    setLevel: (level: number) => setExpansion({ ids: null, level }),
  };
}

export function nodeRows(rows: RowItem[]): TreeNode[] {
  return rows.flatMap((row) => (row.type === 'node' ? [row.node] : []));
}

export const CSV_PREFIX_HEADER = ['Haushalt', 'Seite', 'Gruppierungsziffer', 'Ebene', 'Bezeichnung'];

export function csvPrefix(node: TreeNode): string[] {
  return [
    SECTION_LABEL[node.section],
    SIDE_LABEL[node.side],
    node.kind === 'rest' ? `${node.code ?? 'Summe'} Rest` : (node.code ?? ''),
    String(node.depth),
    node.kind === 'side'
      ? `Summe ${SIDE_LABEL[node.side]}`
      : node.kind === 'rest'
        ? node.title
        : standaloneTitle(node.code!),
  ];
}

export function unitSuffix(unit: Unit): string {
  return unit === 'perCapita' ? '€/EW' : '€';
}

export function Amount({ value }: { value: number | null }) {
  return <span className={`num ${value === null ? 'text-ink-3' : ''}`}>{formatEuro(value)}</span>;
}
