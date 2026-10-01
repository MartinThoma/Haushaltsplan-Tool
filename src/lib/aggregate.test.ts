import { describe, expect, it } from 'vitest';
import { aggregate, sideTotal } from './aggregate.ts';

describe('aggregate', () => {
  it('sums Untergruppen into Gruppen and Hauptgruppen', () => {
    const { values, mismatches } = aggregate({ '000': 100, '001': 200.1, '003': 300.2, '010': 50 });
    expect(values.get('00')).toBe(600.3);
    expect(values.get('01')).toBe(50);
    expect(values.get('0')).toBe(650.3);
    expect(mismatches.size).toBe(0);
  });

  it('prefers stated totals and reports deviations', () => {
    const { values, mismatches } = aggregate({ '00': 1000, '000': 100, '001': 200 });
    expect(values.get('00')).toBe(1000);
    expect(values.get('0')).toBe(1000);
    expect(mismatches.get('00')).toEqual({ stated: 1000, computed: 300 });
  });

  it('accepts Gruppen without Untergruppen', () => {
    const agg = aggregate({ '10': 5, '11': 7, '161': 1 });
    expect(agg.values.get('1')).toBe(13);
    expect(sideTotal(agg)).toBe(13);
  });

  it('groups the Gruppen 50–69 under Hauptgruppe 5/6', () => {
    const agg = aggregate({ '50': 1, '638': 3, '4': 10 });
    expect(agg.values.get('63')).toBe(3);
    expect(agg.values.get('5/6')).toBe(4);
    expect(agg.values.has('5')).toBe(false);
    expect(sideTotal(agg)).toBe(14);
  });

  it('returns null as side total for an empty side', () => {
    expect(sideTotal(aggregate({}))).toBeNull();
  });
});
