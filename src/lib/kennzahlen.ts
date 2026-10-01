import { aggregate } from './aggregate.ts';
import type { BudgetDataset } from './schema.ts';
import { sideAmount } from './tree.ts';

/** hebesatz: percent ("v. H."), euro: amount (convertible per resident), anteil: ratio 0–1. */
export type KennzahlUnit = 'hebesatz' | 'euro' | 'anteil';

export interface KennzahlDefinition {
  key: string;
  label: string;
  unit: KennzahlUnit;
  description: string;
}

/** Key figures stored in the datasets (`kennzahlen`), mostly from the Haushaltssatzung. */
export const STORED_KENNZAHLEN = [
  {
    key: 'hebesatz_grundsteuer_a',
    label: 'Hebesatz Grundsteuer A',
    unit: 'hebesatz',
    description: 'Hebesatz der Grundsteuer A (land- und forstwirtschaftliche Betriebe) in Prozent',
  },
  {
    key: 'hebesatz_grundsteuer_b',
    label: 'Hebesatz Grundsteuer B',
    unit: 'hebesatz',
    description: 'Hebesatz der Grundsteuer B (Grundstücke) in Prozent',
  },
  {
    key: 'hebesatz_gewerbesteuer',
    label: 'Hebesatz Gewerbesteuer',
    unit: 'hebesatz',
    description: 'Hebesatz der Gewerbesteuer in Prozent',
  },
  {
    key: 'schulden',
    label: 'Schuldenstand zu Jahresbeginn',
    unit: 'euro',
    description: 'Schulden des Haushalts zu Beginn des Haushaltsjahres in Euro (Stichtag angeben)',
  },
  {
    key: 'ruecklagen',
    label: 'Allgemeine Rücklage zu Jahresbeginn',
    unit: 'euro',
    description: 'Stand der allgemeinen Rücklage zu Beginn des Haushaltsjahres in Euro (Stichtag angeben)',
  },
  {
    key: 'kassenkredite_hoechstbetrag',
    label: 'Höchstbetrag der Kassenkredite',
    unit: 'euro',
    description: 'Höchstbetrag der Kassenkredite laut Haushaltssatzung in Euro',
  },
] as const satisfies readonly KennzahlDefinition[];

export type StoredKennzahlKey = (typeof STORED_KENNZAHLEN)[number]['key'];

interface ComputedKennzahl extends KennzahlDefinition {
  compute: (data: BudgetDataset) => number | null;
}

type Section = 'vwh' | 'vmh';
type Side = 'einnahmen' | 'ausgaben';

/** Aggregated values of one budget side; null if the dataset has no Gruppierungen there (totals only). */
function sideValues(data: BudgetDataset, section: Section, side: Side) {
  const values = aggregate(data.betraege[section][side]).values;
  return values.size > 0 ? values : null;
}

function amount(data: BudgetDataset, section: Section, side: Side, codes: string[]) {
  const values = sideValues(data, section, side);
  return values && codes.reduce((sum, code) => sum + (values.get(code) ?? 0), 0);
}

/**
 * Amount of a general Untergruppe such as 860. Falls back to its Gruppe only when the dataset has
 * no breakdown of that Gruppe, so special reserves (861–869) are not mixed in.
 */
function general(data: BudgetDataset, section: Section, side: Side, untergruppe: string) {
  const values = sideValues(data, section, side);
  if (!values) return null;
  if (values.has(untergruppe)) return values.get(untergruppe)!;
  const gruppe = untergruppe.slice(0, 2);
  const broken = [...values.keys()].some((code) => code.length === 3 && code.startsWith(gruppe));
  return broken ? 0 : (values.get(gruppe) ?? 0);
}

/** Key figures derived from the budget lines themselves. */
export const COMPUTED_KENNZAHLEN: readonly ComputedKennzahl[] = [
  {
    key: 'zufuehrung_vmh',
    label: 'Zuführung zum Vermögenshaushalt',
    unit: 'euro',
    description:
      'Allgemeine Zuführung (860) abzüglich Zuführung vom Vermögenshaushalt (280), ohne Sonderrücklagen: was der Verwaltungshaushalt für Investitionen und Tilgung erwirtschaftet',
    compute: (d) => {
      const zu = general(d, 'vwh', 'ausgaben', '860');
      const vom = general(d, 'vwh', 'einnahmen', '280');
      return zu === null && vom === null ? null : (zu ?? 0) - (vom ?? 0);
    },
  },
  {
    key: 'personalquote',
    label: 'Personalausgabenquote',
    unit: 'anteil',
    description: 'Personalausgaben (Hauptgruppe 4) im Verhältnis zu den Ausgaben des Verwaltungshaushalts',
    compute: (d) => {
      const personal = amount(d, 'vwh', 'ausgaben', ['4']);
      const total = sideAmount(d, 'vwh', 'ausgaben');
      return personal === null || !total ? null : personal / total;
    },
  },
  {
    key: 'investitionen',
    label: 'Sachinvestitionen',
    unit: 'euro',
    description: 'Erwerb von Anlagevermögen und Baumaßnahmen (Gruppen 93–96)',
    compute: (d) => amount(d, 'vmh', 'ausgaben', ['93', '94', '95', '96']),
  },
  {
    key: 'kreditaufnahmen',
    label: 'Kreditaufnahmen',
    unit: 'euro',
    description: 'Einnahmen aus Krediten und inneren Darlehen (Gruppe 37)',
    compute: (d) => amount(d, 'vmh', 'einnahmen', ['37']),
  },
  {
    key: 'tilgung',
    label: 'Tilgung',
    unit: 'euro',
    description: 'Tilgung von Krediten, Rückzahlung innerer Darlehen (Gruppe 97)',
    compute: (d) => amount(d, 'vmh', 'ausgaben', ['97']),
  },
];

export interface KennzahlValue {
  wert: number;
  stichtag?: string;
  quelle?: string;
}

/** Stored value of a key figure, or null if the dataset does not provide it. */
export function storedKennzahl(data: BudgetDataset, key: StoredKennzahlKey): KennzahlValue | null {
  return data.kennzahlen?.[key] ?? null;
}
