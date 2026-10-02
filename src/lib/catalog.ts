import { bundeslandFromAgs, validateKommunen, type Bundesland } from './kommunen.ts';
import { QUELLEN_FILE, quellenByDataset, validateQuellen, type Quelle } from './quellen.ts';
import { validateDatasetText, type BudgetDataset } from './schema.ts';

export interface CatalogEntry {
  /** Built-in: file name without ".json"; upload: "upload:<n>:<file name>". */
  id: string;
  source: 'builtin' | 'upload';
  file: string;
  ags: string;
  jahr: number;
  einwohner: number;
}

export interface Municipality {
  ags: string;
  name: string;
  plz: string[];
  bundesland: Bundesland | undefined;
  /** Available datasets, oldest year first; empty if no budget data exists yet. */
  entries: CatalogEntry[];
}

export interface LoadedDataset {
  data: BudgetDataset;
  warnings: string[];
}

export class DatasetError extends Error {
  readonly details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.details = details;
  }
}

// Relative URLs keep the app working under any sub-path (e.g. GitHub Pages project sites).
const DATA_BASE = 'data/';
export const KOMMUNEN_FILE = 'kommunen.json';

const byYear = (a: CatalogEntry, b: CatalogEntry) => a.jahr - b.jahr || a.source.localeCompare(b.source);

/** fetch() that reports network failures (offline, server unreachable) in German. */
async function request(file: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(DATA_BASE + file, init);
  } catch {
    throw new DatasetError(`${file} konnte nicht geladen werden – keine Verbindung zum Server`);
  }
}

export async function fetchMunicipalities(): Promise<Municipality[]> {
  const response = await request(KOMMUNEN_FILE, { cache: 'no-cache' });
  if (response.status === 404) return [];
  if (!response.ok) throw new DatasetError(`${KOMMUNEN_FILE} konnte nicht geladen werden (HTTP ${response.status})`);
  const result = validateKommunen(await response.json());
  if (!result.ok) throw new DatasetError(`${KOMMUNEN_FILE} ist ungültig`, result.errors);
  return result.data.map((k) => ({
    ags: k.ags,
    name: k.name,
    plz: k.plz,
    bundesland: k.bundesland,
    entries: k.jahre
      .map(({ jahr, einwohner, file }) => ({
        id: file.replace(/\.json$/, ''),
        source: 'builtin' as const,
        file,
        ags: k.ags,
        jahr,
        einwohner,
      }))
      .toSorted(byYear),
  }));
}

/** Source documents per dataset id; empty if the register is missing or invalid, as it is optional for the app. */
export async function fetchSources(): Promise<ReadonlyMap<string, Quelle[]>> {
  try {
    const response = await request(QUELLEN_FILE, { cache: 'no-cache' });
    if (!response.ok) return new Map();
    const result = validateQuellen(await response.json());
    return result.ok ? quellenByDataset(result.data) : new Map();
  } catch {
    return new Map();
  }
}

export async function fetchDataset(entry: CatalogEntry): Promise<LoadedDataset> {
  const response = await request(entry.file);
  if (!response.ok) throw new DatasetError(`${entry.file} konnte nicht geladen werden (HTTP ${response.status})`);
  const result = validateDatasetText(await response.text());
  if (!result.ok) throw new DatasetError(`${entry.file} ist ungültig`, result.errors);
  return { data: result.data, warnings: result.warnings };
}

/** Adds uploaded datasets to their municipality, creating it if it is not in kommunen.json. */
export function mergeUploads(
  builtin: readonly Municipality[],
  uploads: readonly { entry: CatalogEntry; kommune: string }[],
): Municipality[] {
  const byAgs = new Map(builtin.map((m) => [m.ags, { ...m }]));
  for (const { entry, kommune } of uploads) {
    const municipality = byAgs.get(entry.ags) ?? {
      ags: entry.ags,
      name: kommune,
      plz: [],
      bundesland: bundeslandFromAgs(entry.ags),
      entries: [],
    };
    municipality.entries = [...municipality.entries, entry].toSorted(byYear);
    byAgs.set(entry.ags, municipality);
  }
  return [...byAgs.values()].toSorted((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** "2026" or "2026 · hochgeladen" */
export function entryLabel(entry: CatalogEntry): string {
  return `${entry.jahr}${entry.source === 'upload' ? ' · hochgeladen' : ''}`;
}

export function yearRange(municipality: Municipality): string {
  const years = municipality.entries.map((e) => e.jahr);
  if (years.length === 0) return '';
  const [first, last] = [Math.min(...years), Math.max(...years)];
  return first === last ? String(first) : `${first}–${last}`;
}

const normalize = (s: string) =>
  s
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss');

/** Instant search over name and postal codes; names starting with the query rank first. */
export function searchMunicipalities(municipalities: readonly Municipality[], query: string): Municipality[] {
  const q = normalize(query.trim());
  if (!q) return [...municipalities];
  const scored: { m: Municipality; score: number }[] = [];
  for (const m of municipalities) {
    const name = normalize(m.name);
    const score = name.startsWith(q)
      ? 0
      : name.split(/[\s-]+/).some((word) => word.startsWith(q))
        ? 1
        : m.plz.some((p) => p.startsWith(q))
          ? 2
          : name.includes(q)
            ? 3
            : -1;
    if (score >= 0) scored.push({ m, score });
  }
  return scored.toSorted((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name, 'de')).map((s) => s.m);
}
