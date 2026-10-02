import { describe, expect, it } from 'vitest';
import { checkQuellenAgainstDatasets, quellenByDataset, validateQuellen, type Quelle } from './quellen.ts';

const quelle: Quelle = {
  datei: 'Haar/Haushaltssatzung-2026.pdf',
  titel: 'Haushaltssatzung 2026',
  herausgeber: 'Stadt Haar',
  url: 'https://www.stadt-haar.de/satzung.pdf',
  abgerufen: '2026-10-02',
  sha256: 'a'.repeat(64),
  bytes: 1234,
  datensaetze: ['09184123_2026'],
};

describe('validateQuellen', () => {
  it('accepts documented entries, with a URL or a stated origin', () => {
    const { url: _url, ...withoutUrl } = quelle;
    expect(validateQuellen([quelle, { ...withoutUrl, datei: 'Haar/b.pdf', herkunft: 'per E-Mail' }]).ok).toBe(true);
  });

  it('rejects entries without origin, with malformed checksums and duplicate files', () => {
    const { url: _url, ...withoutUrl } = quelle;
    expect(validateQuellen([withoutUrl])).toEqual({
      ok: false,
      errors: ['Eintrag 1 (Haar/Haushaltssatzung-2026.pdf), url: url oder herkunft angeben'],
    });
    expect(validateQuellen([{ ...quelle, sha256: 'xyz' }]).ok).toBe(false);
    expect(validateQuellen([quelle, quelle])).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('doppelt')],
    });
  });
});

describe('checkQuellenAgainstDatasets', () => {
  it('requires a source for every dataset and known datasets in every source', () => {
    expect(checkQuellenAgainstDatasets([quelle], ['09184123_2026'])).toEqual([]);
    expect(checkQuellenAgainstDatasets([quelle], ['09184123_2025'])).toEqual([
      'quellen.json: Haar/Haushaltssatzung-2026.pdf nennt den unbekannten Datensatz 09184123_2026',
      '09184123_2025.json hat keinen Eintrag in quellen.json',
    ]);
  });
});

describe('quellenByDataset', () => {
  it('lists the documents of each dataset', () => {
    const plan = { ...quelle, datei: 'Haar/plan.pdf', datensaetze: ['09184123_2025', '09184123_2026'] };
    const byDataset = quellenByDataset([quelle, plan]);
    expect(byDataset.get('09184123_2026')?.map((q) => q.datei)).toEqual([quelle.datei, plan.datei]);
    expect(byDataset.get('09184123_2025')).toEqual([plan]);
  });
});
