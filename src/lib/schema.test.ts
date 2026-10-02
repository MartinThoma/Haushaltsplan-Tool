import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDataDirectory } from '../../vite-plugins/budgetData.ts';
import { validateDataset, validateDatasetText, type ValidationResult } from './schema.ts';

const valid = () => ({
  metadata: { kommune: 'Plattling', ags: '09271146', jahr: 2026, einwohner: 13100, status: 'Ansatz', waehrung: 'EUR' },
  betraege: {
    vwh: { einnahmen: { '000': 150000, '001': 1800000, '003': 9500000 }, ausgaben: { '410': 4200000, '414': 2100000 } },
    vmh: { einnahmen: { '300': 500000 }, ausgaben: { '932': 1200000 } },
  },
});

/** Errors of a rejected dataset; fails the test if the dataset was accepted. */
function errorsOf(result: ValidationResult): string[] {
  if (result.ok) throw new Error('Datensatz wurde unerwartet akzeptiert');
  return result.errors;
}

/** Warnings of an accepted dataset; fails the test if the dataset was rejected. */
function warningsOf(result: ValidationResult): string[] {
  if (!result.ok) throw new Error(`Datensatz wurde abgelehnt: ${result.errors.join('; ')}`);
  return result.warnings;
}

describe('validateDataset', () => {
  it('accepts a valid dataset without warnings', () => {
    const result = validateDataset(valid());
    expect(result).toMatchObject({ ok: true, warnings: [] });
  });

  it('reports missing metadata with its path', () => {
    const data = valid() as Record<string, any>;
    delete data.metadata.einwohner;
    expect(errorsOf(validateDataset(data))).toEqual(['metadata.einwohner: Pflichtfeld fehlt']);
  });

  it('rejects a malformed AGS with a German message', () => {
    const data = valid();
    data.metadata.ags = '9271146';
    expect(errorsOf(validateDataset(data))[0]).toContain('8 Ziffern');
  });

  it('rejects codes that belong to another budget section', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vwh.einnahmen['300'] = 1;
    const errors = errorsOf(validateDataset(data));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Gruppierungsziffer 300');
    expect(errors[0]).toContain('Hauptgruppen 0–2');
  });

  it('rejects non-numeric codes', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vmh.ausgaben['9x'] = 1;
    expect(errorsOf(validateDataset(data))[0]).toContain('„9x“ ist keine gültige Gruppierungsziffer');
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
    const warnings = warningsOf(validateDataset(data));
    expect(warnings).toHaveLength(2);
    expect(warnings.join('\n')).toContain('Gruppe 18');
    expect(warnings.join('\n')).toContain('Realsteuern');
    expect(warnings.join('\n')).toContain('kleiner als die Summe der Untergliederung');
  });

  it('warns about Untergruppen missing from a closed list, but not below open Gruppen', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vwh.einnahmen['002'] = 1;
    data.betraege.vwh.einnahmen['110'] = 1;
    expect(warningsOf(validateDataset(data))).toEqual([
      'Gruppierungsziffer 002 (Verwaltungshaushalt, Einnahmen): Untergruppe 002 ist im Gruppierungsplan nicht vorgesehen; Gruppe 00 (Realsteuern) kennt 000, 001, 003',
    ]);
  });

  it('accepts Hauptgruppe 5/6 only in its combined form', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vwh.ausgaben['5/6'] = 10;
    expect(validateDataset(data).ok).toBe(true);
    data.betraege.vwh.ausgaben['6'] = 10;
    expect(errorsOf(validateDataset(data))[0]).toContain('zusammen als „5/6“');
  });

  it('accepts partial breakdowns silently and requires amounts for remainder labels', () => {
    const data = valid() as Record<string, any>;
    data.metadata.status = 'Entwurf';
    data.metadata.einwohner_stichtag = '2025-12-31';
    data.betraege.vwh.einnahmen['00'] = 13_000_000;
    data.nicht_aufgeschluesselt = { vwh: { einnahmen: { '00': 'Rest' } } };
    expect(validateDataset(data)).toMatchObject({ ok: true, warnings: [] });
    data.nicht_aufgeschluesselt.vwh.ausgaben = { '4': 'Personal' };
    expect(errorsOf(validateDataset(data))[0]).toContain('keinen Betrag für 4');
  });

  it('accepts key figures with reference date and source, and rejects unknown ones', () => {
    const data = valid() as Record<string, any>;
    data.kennzahlen = {
      hebesatz_grundsteuer_b: { wert: 290, quelle: 'Haushaltssatzung' },
      schulden: { wert: 3_745_000, stichtag: '2024-12-31' },
    };
    expect(validateDataset(data).ok).toBe(true);
    data.kennzahlen.hebesatz_hundesteuer = { wert: 1 };
    expect(validateDataset(data).ok).toBe(false);
  });

  it('warns when the stated Gesamtbetrag is below the sum of the Gruppierungen', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vmh.gesamt = 100;
    expect(warningsOf(validateDataset(data)).join('\n')).toContain('Gesamtbetrag');
  });

  it('accepts Baumaßnahmen booked together as 94-96 and warns when mixed with 94, 95, 96', () => {
    const data = valid() as Record<string, any>;
    data.betraege.vmh.ausgaben['94-96'] = 500;
    expect(validateDataset(data)).toMatchObject({ ok: true, warnings: [] });
    data.betraege.vmh.ausgaben['950'] = 5;
    expect(warningsOf(validateDataset(data)).join('\n')).toContain('zugleich zusammen');
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
