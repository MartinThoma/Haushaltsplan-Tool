import { describe, expect, it } from 'vitest';
import type { BudgetDataset } from './schema.ts';
import { buildTree, expansionForLevel, visibleRows, type RowItem } from './tree.ts';

function dataset(vwhEinnahmen: Record<string, number>): BudgetDataset {
  return {
    metadata: { kommune: 'X', ags: '09999001', jahr: 2026, einwohner: 1000, status: 'Ansatz', waehrung: 'EUR' },
    betraege: { vwh: { einnahmen: vwhEinnahmen, ausgaben: { '410': 10 } }, vmh: { einnahmen: {}, ausgaben: {} } },
  };
}

const ids = (rows: RowItem[]) => rows.map((r) => (r.type === 'section' ? `#${r.section}` : r.node.id));

describe('buildTree', () => {
  const a = dataset({ '000': 1, '003': 2, '010': 5 });
  const b = dataset({ '003': 4, '022': 1 });
  const trees = buildTree([a, b], ['vwh']);
  const einnahmen = trees[0]!.sides[0]!;

  it('builds the union of codes across datasets', () => {
    expect(einnahmen.values).toEqual([8, 5]);
    const hg0 = einnahmen.children[0]!;
    expect(hg0.code).toBe('0');
    expect(hg0.children.map((c) => c.code)).toEqual(['00', '01', '02']);
    const g01 = hg0.children[1]!;
    expect(g01.values).toEqual([5, null]);
  });

  it('shows rows down to the selected level', () => {
    const rows = visibleRows(trees, expansionForLevel(trees, 1), '');
    expect(ids(rows)).toEqual(['#vwh', 'vwh.einnahmen', 'vwh.einnahmen.0', 'vwh.ausgaben', 'vwh.ausgaben.4']);
  });

  it('filters by keyword and expands the path to each match', () => {
    const rows = visibleRows(trees, new Set(), 'gewerbe');
    expect(ids(rows)).toEqual(['#vwh', 'vwh.einnahmen', 'vwh.einnahmen.0', 'vwh.einnahmen.00', 'vwh.einnahmen.003']);
  });

  it('filters by code prefix and ignores umlauts', () => {
    expect(ids(visibleRows(trees, new Set(), '02')).at(-1)).toBe('vwh.einnahmen.022');
    expect(ids(visibleRows(trees, new Set(), 'Hundesteuer')).at(-1)).toBe('vwh.einnahmen.022');
    expect(ids(visibleRows(trees, new Set(), 'beschaftigte'))).toEqual([]);
  });

  it('lets a matching row be expanded by hand', () => {
    const rows = visibleRows(trees, new Set(['vwh.einnahmen.01']), 'gemeinschaft');
    expect(ids(rows)).toContain('vwh.einnahmen.010');
  });
});
