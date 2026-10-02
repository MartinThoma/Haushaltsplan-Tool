import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { sideAmount } from '../lib/tree.ts';
import { entryLabel, type CatalogEntry, type LoadedDataset, type Municipality } from '../lib/catalog.ts';
import { formatCompactEuro, formatDate, formatInteger } from '../lib/format.ts';
import type { Quelle } from '../lib/quellen.ts';
import { MunicipalitySearch } from './MunicipalitySearch.tsx';

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <span className="relative">
        <select
          {...props}
          className="h-9 w-full appearance-none truncate rounded-lg border border-line bg-surface pr-8 pl-3 text-sm text-ink hover:border-line-strong"
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-ink-3" />
      </span>
    </label>
  );
}

/** Picks the entry of `municipality` for `year`, falling back to the latest year. */
export function closestEntry(municipality: Municipality, year: number | undefined): CatalogEntry {
  return municipality.entries.find((e) => e.jahr === year) ?? municipality.entries.at(-1)!;
}

/** The original documents behind a dataset, with where and when they were retrieved. */
function SourceList({ quellen }: { quellen: readonly Quelle[] }) {
  if (quellen.length === 0) return null;
  return (
    <details className="text-xs text-ink-3">
      <summary className="w-fit cursor-pointer hover:text-ink">Quelldokumente ({quellen.length})</summary>
      <ul className="mt-1 space-y-0.5">
        {quellen.map((q) => (
          <li key={q.datei}>
            {q.url ? (
              <a
                href={q.url}
                target="_blank"
                rel="noreferrer"
                className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                {q.titel}
              </a>
            ) : (
              <span className="text-ink-2">{q.titel}</span>
            )}{' '}
            · {q.herausgeber}, {q.url ? `abgerufen am ${formatDate(q.abgerufen)}` : q.herkunft}
          </li>
        ))}
      </ul>
    </details>
  );
}

function DatasetFacts({ dataset, quellen }: { dataset: LoadedDataset | undefined; quellen: readonly Quelle[] }) {
  if (!dataset) return <p className="h-4 text-xs text-ink-3">Lädt …</p>;
  const { metadata } = dataset.data;
  const volume = (section: 'vwh' | 'vmh') => sideAmount(dataset.data, section, 'ausgaben');
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <p className="flex flex-wrap gap-x-3 text-ink-2 [&>span]:num">
        <span>{formatInteger(metadata.einwohner)} EW</span>
        <span>{metadata.status}</span>
        <span title="Volumen des Verwaltungshaushalts (Summe der Ausgaben)">
          VwH {formatCompactEuro(volume('vwh'))}
        </span>
        <span title="Volumen des Vermögenshaushalts (Summe der Ausgaben)">VmH {formatCompactEuro(volume('vmh'))}</span>
      </p>
      {metadata.hinweis && <p className="text-ink-3">{metadata.hinweis}</p>}
      <SourceList quellen={quellen} />
    </div>
  );
}

interface PairSelectorProps {
  municipalities: Municipality[];
  entries: [CatalogEntry, CatalogEntry];
  datasets: (LoadedDataset | undefined)[];
  sources: ReadonlyMap<string, Quelle[]>;
  onSelect: (slot: 0 | 1, entry: CatalogEntry) => void;
  onSwap: () => void;
}

export function PairSelector({ municipalities, entries, datasets, sources, onSelect, onSwap }: PairSelectorProps) {
  const picker = (slot: 0 | 1) => {
    const entry = entries[slot];
    const municipality = municipalities.find((m) => m.ags === entry.ags);
    return (
      <DatasetCard slot={slot}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)] gap-2">
          <MunicipalitySearch
            label="Kommune"
            municipalities={municipalities}
            value={municipality}
            onSelect={(next) => onSelect(slot, closestEntry(next, entry.jahr))}
          />
          <Select
            label="Haushaltsjahr"
            value={entry.id}
            onChange={(e) =>
              onSelect(
                slot,
                municipality!.entries.find((x) => x.id === e.target.value)!,
              )
            }
          >
            {municipality?.entries.map((x) => (
              <option key={x.id} value={x.id}>
                {entryLabel(x)}
              </option>
            ))}
          </Select>
        </div>
        <DatasetFacts dataset={datasets[slot]} quellen={sources.get(entry.id) ?? []} />
      </DatasetCard>
    );
  };

  return (
    <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
      {picker(0)}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onSwap}
          className="rounded-full border border-line bg-surface p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
          title="A und B tauschen"
          aria-label="A und B tauschen"
        >
          <ArrowLeftRight aria-hidden className="size-4 max-md:rotate-90" />
        </button>
      </div>
      {picker(1)}
    </div>
  );
}

function DatasetCard({ slot, children }: { slot: 0 | 1; children: ReactNode }) {
  return (
    <section
      aria-label={`Datensatz ${slot === 0 ? 'A' : 'B'}`}
      className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className={`size-2.5 rounded-full ${slot === 0 ? 'bg-series-a' : 'bg-series-b'}`} />
        {slot === 0 ? 'A' : 'B'}
      </div>
      {children}
    </section>
  );
}

interface SeriesSelectorProps {
  municipalities: Municipality[];
  municipality: Municipality;
  selected: readonly CatalogEntry[];
  sources: ReadonlyMap<string, Quelle[]>;
  onMunicipality: (municipality: Municipality) => void;
  onToggle: (entry: CatalogEntry) => void;
  onAll: () => void;
}

export function SeriesSelector({
  municipalities,
  municipality,
  selected,
  sources,
  onMunicipality,
  onToggle,
  onAll,
}: SeriesSelectorProps) {
  const quellen = [...new Map(selected.flatMap((e) => sources.get(e.id) ?? []).map((q) => [q.datei, q])).values()];
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-line bg-surface p-3.5">
      <div className="w-full sm:w-80">
        <MunicipalitySearch
          label="Kommune"
          municipalities={municipalities}
          value={municipality}
          onSelect={onMunicipality}
        />
      </div>
      <fieldset className="flex min-w-0 flex-col">
        <legend className="mb-1 text-xs font-medium text-ink-3">Haushaltsjahre</legend>
        <div className="flex flex-wrap gap-1.5">
          {municipality.entries.map((entry) => {
            const active = selected.includes(entry);
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(entry)}
                className={`num h-9 rounded-lg border px-3 text-sm transition-colors ${
                  active
                    ? 'border-ink bg-ink font-medium text-surface'
                    : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
                }`}
              >
                {entryLabel(entry)}
              </button>
            );
          })}
          {selected.length < municipality.entries.length && (
            <button
              type="button"
              onClick={onAll}
              className="h-9 px-2 text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              alle
            </button>
          )}
        </div>
      </fieldset>
      {quellen.length > 0 && (
        <div className="w-full">
          <SourceList quellen={quellen} />
        </div>
      )}
    </div>
  );
}
