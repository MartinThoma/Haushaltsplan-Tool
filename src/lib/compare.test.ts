import { describe, expect, it } from 'vitest';
import { delta, significance, toUnit } from './compare.ts';
import { formatEuro, formatPercent } from './format.ts';
import { toCsv } from './csv.ts';

describe('compare', () => {
  it('computes absolute and relative differences', () => {
    expect(delta(100, 150)).toEqual({ absolute: 50, relative: 0.5 });
    expect(delta(null, 20)).toEqual({ absolute: 20, relative: null });
    expect(delta(-100, -50)).toEqual({ absolute: 50, relative: 0.5 });
  });

  it('converts to per-capita values', () => {
    expect(toUnit(13100, 13100, 'perCapita')).toBe(1);
    expect(toUnit(null, 1, 'perCapita')).toBeNull();
  });

  it('classifies deviations', () => {
    expect(significance(100, 105, 0.1)).toBe('none');
    expect(significance(100, 115, 0.1)).toBe('notable');
    expect(significance(100, 70, 0.1)).toBe('strong');
    expect(significance(null, 1, 0.1)).toBe('onlyB');
    expect(significance(5, 0, 0.1)).toBe('onlyA');
    expect(significance(0, 0, 0.1)).toBe('none');
  });
});

describe('format', () => {
  it('uses German notation', () => {
    expect(formatEuro(1250000)).toBe('1.250.000,00 €');
    expect(formatPercent(0.1234)).toBe('+12,3 %');
  });
});

describe('csv', () => {
  it('quotes cells containing separators', () => {
    expect(toCsv([['a;b', 'c"d', '1,5']])).toBe('﻿"a;b";"c""d";1,5\r\n');
  });
});
