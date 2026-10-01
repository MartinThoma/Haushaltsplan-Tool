import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDataDirectory } from '../../vite-plugins/budgetData.ts';
import { validateDataset, validateDatasetText } from './schema.ts';

const valid = () => ({
  metadata: { kommune: 'Plattling', ags: '09271146', jahr: 2026, einwohner: 13100, status: 'Ansatz', waehrung: 'EUR' },
  betraege: {
    vwh: { einnahmen: { '000': 150000, '001': 1800000, '003': 9500000 }, ausgaben: { '410': 4200000, '414': 2100000 } },
    vmh: { einnahmen: { '300': 500000 }, ausgaben: { '932': 1200000 } },
  },
});

describe('validateDataset', () => {
  it('accepts a valid dataset without warnings', () => {
    const result = validateDataset(valid());
    expect(result).toMatchObject({ ok: true, warnings: [] });
  });

  it('reports missing metadata with its path', () => {
    const data = valid() as Record<string, any>;
    delete data.metadata.einwohner;
    const result = validateDataset(data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(['metadata.einwohner: Pflichtfeld fehlt']);
  });

  it('rejects a malformed AGS with a German message', () => {
    const data = valid();
    data.metadata.ags = '9271146';
    const result = validateDataset(data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('8 Ziffern');
  });

  it('rejects codes that belong to another budget section', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vwh.einnahmen['300'] = 1;
    const result = validateDataset(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Gruppierungsziffer 300');
      expect(result.errors[0]).toContain('Hauptgruppen 0–2');
    }
  });

  it('rejects non-numeric codes', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vmh.ausgaben['9x'] = 1;
    const result = validateDataset(data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('„9x“ ist keine gültige Gruppierungsziffer');
  });

  it('rejects unknown keys (typos) in metadata', () => {
    const data = valid() as Record<string, any>;
    data.metadata.einwohnerzahl = 5;
    expect(validateDataset(data).ok).toBe(false);
  });

  it('warns about Gruppen missing from the Gruppierungsplan and inconsistent totals', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vwh.einnahmen['180'] = 10;
    data.betraege.vwh.einnahmen['00'] = 1;
    const result = validateDataset(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.join('\n')).toContain('Gruppe 18');
      expect(result.warnings.join('\n')).toContain('Realsteuern');
    }
  });

  it('warns about Untergruppen missing from a closed list, but not below open Gruppen', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vwh.einnahmen['002'] = 1;
    data.betraege.vwh.einnahmen['110'] = 1;
    const result = validateDataset(data);
    expect(result.ok && result.warnings).toEqual([
      'Gruppierungsziffer 002 (Verwaltungshaushalt, Einnahmen): Untergruppe 002 ist im Gruppierungsplan nicht vorgesehen; Gruppe 00 (Realsteuern) kennt 000, 001, 003',
    ]);
  });

  it('reports invalid JSON', () => {
    const result = validateDatasetText('{ "metadata": ');
    expect(result.ok).toBe(false);
  });
});

describe('bundled data', () => {
  it('kommunen.json and all dataset files are valid and consistent', () => {
    expect(checkDataDirectory(path.resolve(__dirname, '../../public/data'))).toEqual([]);
  });
});
