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

describe('stated Gesamtbetrag', () => {
  it('shows a total without Gruppierungen as one remainder row', () => {
    const totalsOnly: BudgetDataset = {
      ...dataset({}),
      betraege: { vwh: { einnahmen: {}, ausgaben: {}, gesamt: 1000 }, vmh: { einnahmen: {}, ausgaben: {} } },
    };
    const detailed = dataset({ '003': 300 });
    const einnahmen = buildTree([totalsOnly, detailed], ['vwh'])[0]!.sides[0]!;
    expect(einnahmen.values).toEqual([1000, 300]);
    const rest = einnahmen.children.at(-1)!;
    expect(rest).toMatchObject({ kind: 'rest', code: null, depth: 1, values: [1000, null] });
  });

  it('covers only the part the Gruppierungen leave open', () => {
    const partial = dataset({ '003': 300 });
    partial.betraege.vwh.gesamt = 1000;
    const ausgaben = buildTree([partial], ['vwh'])[0]!.sides[1]!;
    expect(ausgaben.values).toEqual([1000]);
    expect(ausgaben.children.at(-1)!.values).toEqual([990]);
  });
});

describe('remainder rows', () => {
  it('shows the part of a stated total that is not broken down, with its label', () => {
    const a = dataset({ '00': 1000, '003': 600, '010': 5 });
    a.nicht_aufgeschluesselt = { vwh: { einnahmen: { '00': 'Grundsteuer A und B' } } };
    const b = dataset({ '000': 10, '003': 20 });
    const g00 = buildTree([a, b], ['vwh'])[0]!.sides[0]!.children[0]!.children[0]!;
    expect(g00.values).toEqual([1000, 30]);
    const rest = g00.children.at(-1)!;
    expect(rest).toMatchObject({
      kind: 'rest',
      code: '00',
      depth: 3,
      title: 'Nicht aufgeschlüsselt: Grundsteuer A und B',
    });
    expect(rest.values).toEqual([400, null]);
  });

  it('is found by searching for its label', () => {
    const a = dataset({ '00': 1000, '003': 600 });
    a.nicht_aufgeschluesselt = { vwh: { einnahmen: { '00': 'Grundsteuer A und B' } } };
    const rows = visibleRows(buildTree([a], ['vwh']), new Set(), 'grundsteuer');
    expect(ids(rows).at(-1)).toBe('vwh.einnahmen.00.rest');
  });
});

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
