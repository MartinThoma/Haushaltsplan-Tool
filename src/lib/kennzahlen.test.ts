import { describe, expect, it } from 'vitest';
import { COMPUTED_KENNZAHLEN } from './kennzahlen.ts';
import type { BudgetDataset } from './schema.ts';

const data: BudgetDataset = {
  metadata: { kommune: 'X', ags: '09271146', jahr: 2026, einwohner: 1000, status: 'Ansatz', waehrung: 'EUR' },
  betraege: {
    vwh: { einnahmen: { '003': 900, '280': 50, '283': 70 }, ausgaben: { '410': 300, '5/6': 400, '860': 200 } },
    vmh: { einnahmen: { '300': 200, '377': 70 }, ausgaben: { '932': 10, '94': 100, '977': 25, '98': 5 } },
  },
};

const compute = (key: string) => COMPUTED_KENNZAHLEN.find((k) => k.key === key)!.compute(data);

describe('computed key figures', () => {
  it('derives them from the budget lines', () => {
    // 283 is a pass-through from a special reserve and does not reduce the Zuführung.
    expect(compute('zufuehrung_vmh')).toBe(150);
    expect(compute('personalquote')).toBeCloseTo(300 / 900);
    expect(compute('investitionen')).toBe(110);
    expect(compute('kreditaufnahmen')).toBe(70);
    expect(compute('tilgung')).toBe(25);
  });

  it('uses the Gruppe when a dataset gives no Untergruppen', () => {
    const coarse: BudgetDataset = {
      ...data,
      betraege: { ...data.betraege, vwh: { einnahmen: {}, ausgaben: { '86': 80 } } },
    };
    expect(COMPUTED_KENNZAHLEN.find((k) => k.key === 'zufuehrung_vmh')!.compute(coarse)).toBe(80);
  });
});
