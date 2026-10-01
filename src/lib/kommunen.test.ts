import { describe, expect, it } from 'vitest';
import { searchMunicipalities, type Municipality } from './catalog.ts';
import { checkKommunenAgainstDatasets, validateKommunen, type Kommune } from './kommunen.ts';
import { validateDataset } from './schema.ts';

const plattling: Kommune = {
  ags: '09271146',
  name: 'Plattling',
  plz: ['94447'],
  bundesland: 'BY',
  jahre: [{ jahr: 2026, einwohner: 13100, file: '09271146_2026.json' }],
};

describe('validateKommunen', () => {
  it('accepts the documented structure', () => {
    expect(validateKommunen([plattling])).toEqual({ ok: true, data: [plattling] });
  });

  it('rejects a Bundesland that contradicts the AGS', () => {
    const result = validateKommunen([{ ...plattling, bundesland: 'BW' }]);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0]).toBe(
        'Eintrag 1 (Plattling), bundesland: AGS 09271146 liegt in Bayern (BY), nicht in BW',
      );
  });

  it('rejects malformed postal codes and duplicate AGS', () => {
    const result = validateKommunen([{ ...plattling, plz: ['9444'] }, plattling]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });
});

describe('checkKommunenAgainstDatasets', () => {
  const dataset = (einwohner: number) =>
    validateDataset({
      metadata: { kommune: 'Plattling', ags: '09271146', jahr: 2026, einwohner, status: 'Ansatz', waehrung: 'EUR' },
      betraege: { vwh: { einnahmen: {}, ausgaben: {} }, vmh: { einnahmen: {}, ausgaben: {} } },
    });

  it('accepts matching files', () => {
    expect(checkKommunenAgainstDatasets([plattling], new Map([['09271146_2026.json', dataset(13100)]]))).toEqual([]);
  });

  it('reports missing, unlisted and contradicting files', () => {
    expect(checkKommunenAgainstDatasets([plattling], new Map())).toEqual([
      'Plattling 2026: Datei 09271146_2026.json fehlt',
    ]);
    const problems = checkKommunenAgainstDatasets(
      [plattling],
      new Map([
        ['09271146_2026.json', dataset(13000)],
        ['09271146_2025.json', dataset(13100)],
      ]),
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('Einwohner 13000 ≠ 13100');
    expect(problems[1]).toBe('09271146_2025.json ist in kommunen.json nicht eingetragen');
  });
});

describe('searchMunicipalities', () => {
  const m = (name: string, plz: string[]): Municipality => ({ ags: name, name, plz, bundesland: 'BY', entries: [] });
  const all = [
    m('Deggendorf', ['94469']),
    m('Plattling', ['94447']),
    m('Bad Füssing', ['94072']),
    m('Osterhofen', ['94486']),
  ];
  const names = (q: string) => searchMunicipalities(all, q).map((x) => x.name);

  it('finds by name prefix, word prefix and infix, ignoring umlauts', () => {
    expect(names('platt')).toEqual(['Plattling']);
    expect(names('fuss')).toEqual(['Bad Füssing']);
    expect(names('hof')).toEqual(['Osterhofen']);
  });

  it('finds by postal code prefix', () => {
    expect(names('9444')).toEqual(['Plattling']);
    expect(names('944')).toEqual(['Deggendorf', 'Osterhofen', 'Plattling']);
  });
});
