import { FolderOpen, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDrop } from './components/FileDrop.tsx';
import { ContributeHint } from './components/MunicipalitySearch.tsx';
import { Notices, type Notice } from './components/Notices.tsx';
import { PairView } from './components/PairView.tsx';
import { SegmentedControl } from './components/SegmentedControl.tsx';
import { PairSelector, SeriesSelector, closestEntry } from './components/Selectors.tsx';
import { SeriesView, type ChartPick } from './components/SeriesView.tsx';
import type { SectionChoice, ViewSettings } from './components/Toolbar.tsx';
import type { ExpansionState, ViewControls } from './components/viewModel.tsx';
import {
  fetchMunicipalities,
  fetchSources,
  mergeUploads,
  type CatalogEntry,
  type LoadedDataset,
  type Municipality,
} from './lib/catalog.ts';
import type { Quelle } from './lib/quellen.ts';
import { putDataset, useDatasets, useLastComplete } from './state/datasets.ts';
import { useHashParams, type HashParams } from './state/hashState.ts';
import { openFile, rememberFile, type OpenedFile, type Upload } from './state/uploads.ts';

type Mode = 'vergleich' | 'zeitreihe';

const MODE_OPTIONS = [
  { value: 'vergleich', label: 'Kommunenvergleich', title: 'Zwei Haushalte nebeneinander' },
  { value: 'zeitreihe', label: 'Zeitreihe', title: 'Eine Kommune über mehrere Jahre' },
] as const;

const SECTION_CHOICES: readonly SectionChoice[] = ['vwh', 'vmh', 'beide'];

let noticeId = 0;

interface Props {
  /** Files opened earlier in this tab, restored after a reload (see state/uploads.ts). */
  restored: { files: OpenedFile[]; invalid: string[] };
}

export default function App({ restored }: Props) {
  const [params, setParams] = useHashParams();
  const [builtin, setBuiltin] = useState<Municipality[] | null>(null);
  const [sources, setSources] = useState<ReadonlyMap<string, Quelle[]>>(() => new Map());
  const [uploads, setUploads] = useState<Upload[]>(() => restored.files.map((f) => f.upload));
  const [notices, setNotices] = useState<Notice[]>(() =>
    restored.invalid.length > 0
      ? [
          {
            id: ++noticeId,
            tone: 'warning',
            title: 'Zuvor geöffnete Dateien passen nicht zum aktuellen Datenformat und wurden geschlossen',
            details: restored.invalid,
          },
        ]
      : [],
  );
  const [search, setSearch] = useState('');
  const [expansion, setExpansion] = useState<ExpansionState>({ ids: null, level: 1 });
  const [threshold, setThreshold] = useState(0.2);
  const [chart, setChart] = useState<ChartPick[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const notify = useCallback((notice: Omit<Notice, 'id'>) => {
    const id = ++noticeId;
    setNotices((prev) => [...prev, { ...notice, id }]);
    if (notice.tone === 'success') setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 6000);
  }, []);

  useEffect(() => {
    fetchMunicipalities()
      .then(setBuiltin)
      .catch((error: Error & { details?: string[] }) => {
        setBuiltin([]);
        notify({ tone: 'error', title: error.message, details: error.details });
      });
    void fetchSources().then(setSources);
  }, [notify]);

  const municipalities = useMemo(() => mergeUploads(builtin ?? [], uploads), [builtin, uploads]);
  const withData = useMemo(() => municipalities.filter((m) => m.entries.length > 0), [municipalities]);

  const mode: Mode = params.modus === 'zeitreihe' ? 'zeitreihe' : 'vergleich';
  const settings: ViewSettings = {
    section: SECTION_CHOICES.includes(params.haushalt as SectionChoice) ? (params.haushalt as SectionChoice) : 'vwh',
    unit: params.werte === 'je-ew' ? 'perCapita' : 'absolute',
    search,
    level: expansion.level,
  };
  const controls: ViewControls = {
    settings,
    expansion,
    setExpansion,
    onSection: (section) => setParams({ haushalt: section === 'vwh' ? '' : section }),
    onUnit: (unit) => setParams({ werte: unit === 'perCapita' ? 'je-ew' : '' }),
    onSearch: setSearch,
  };

  const handleFiles = useCallback(
    async (files: File[]) => {
      const added: Upload[] = [];
      for (const file of files) {
        if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
          notify({ tone: 'error', title: `${file.name} ist keine JSON-Datei` });
          continue;
        }
        const text = await file.text();
        const result = openFile(file.name, text);
        if (!result.ok) {
          notify({ tone: 'error', title: `${file.name} konnte nicht geöffnet werden`, details: result.errors });
          continue;
        }
        const { upload, dataset } = result.file;
        putDataset(upload.entry.id, dataset);
        rememberFile(upload.entry.id, file.name, text);
        added.push(upload);
        const { metadata } = dataset.data;
        const hints = dataset.warnings.length;
        notify({
          tone: hints ? 'warning' : 'success',
          title: `${file.name}: ${metadata.kommune} ${metadata.jahr} geöffnet${hints ? ` – ${hints} ${hints === 1 ? 'Hinweis' : 'Hinweise'}` : ''}`,
          details: dataset.warnings,
        });
      }
      if (added.length === 0) return;
      setUploads((prev) => [...prev, ...added]);
      if (mode === 'vergleich') {
        setParams(added.length >= 2 ? { a: added[0]!.entry.id, b: added[1]!.entry.id } : { b: added[0]!.entry.id });
      } else {
        setParams({ kommune: added[0]!.entry.ags, jahre: '' });
      }
    },
    [mode, notify, setParams],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-6 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src="./favicon.svg" alt="" className="size-7" />
            <div>
              <h1 className="text-base leading-tight font-semibold">Haushaltsvergleich</h1>
              <p className="text-xs text-ink-3">Kamerale Haushaltspläne nach Gruppierung</p>
            </div>
          </div>
          <nav aria-label="Ansicht" className="order-last w-full sm:order-none sm:w-auto">
            <SegmentedControl
              label="Ansicht"
              options={MODE_OPTIONS}
              value={mode}
              onChange={(value) => setParams({ modus: value === 'vergleich' ? '' : value })}
            />
          </nav>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            // Opening own files is a rarely needed power-user feature, so the button stays in the background.
            className="relative ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink"
            title="Eigene Haushaltsdatei (JSON) öffnen – sie wird nur lokal ausgewertet"
          >
            <FolderOpen aria-hidden className="size-4" />
            <span className="max-sm:sr-only">Datei öffnen</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => {
              void handleFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        <Notices notices={notices} onDismiss={(id) => setNotices((prev) => prev.filter((n) => n.id !== id))} />
        {builtin === null ? (
          <p className="py-16 text-center text-sm text-ink-3">Kommunenverzeichnis wird geladen …</p>
        ) : withData.length === 0 ? (
          <EmptyCatalog onOpen={() => fileInput.current?.click()} />
        ) : mode === 'vergleich' ? (
          <PairMode
            municipalities={municipalities}
            withData={withData}
            sources={sources}
            params={params}
            setParams={setParams}
            controls={controls}
            threshold={threshold}
            onThreshold={setThreshold}
          />
        ) : (
          <SeriesMode
            municipalities={municipalities}
            withData={withData}
            sources={sources}
            params={params}
            setParams={setParams}
            controls={controls}
            chart={chart}
            onChart={setChart}
          />
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-start justify-between gap-x-8 gap-y-3 px-4 py-5 text-xs text-ink-3 sm:px-6">
          <p className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="size-4 shrink-0 text-good" />
            Alles wird lokal in deinem Browser berechnet. Geöffnete Dateien verlassen dein Gerät nicht.
          </p>
          <p>
            Gruppierung nach{' '}
            <a
              href="https://www.gesetze-bayern.de/Content/Document/BayVV_2023_I_2281/true"
              className="underline underline-offset-2 hover:text-ink"
              rel="noreferrer"
            >
              Anlage 2 VVKommHSyst-Kameralistik
            </a>{' '}
            ·{' '}
            <a href="data/schema/budget-schema.json" className="underline underline-offset-2 hover:text-ink">
              JSON-Schema
            </a>
          </p>
          <ContributeHint compact />
        </div>
      </footer>

      <FileDrop onFiles={(files) => void handleFiles(files)} />
    </div>
  );
}

function EmptyCatalog({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
      <h2 className="text-lg font-semibold">Noch keine Haushaltsdaten vorhanden</h2>
      <p className="text-sm text-ink-2">
        Öffne eine Haushaltsdatei im JSON-Format oder ziehe sie in dieses Fenster. Sie wird nur in deinem Browser
        ausgewertet.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface-2"
      >
        <FolderOpen aria-hidden className="size-4" />
        Datei öffnen
      </button>
      <ContributeHint />
    </div>
  );
}

/** Loads the datasets of `entries` and keeps the previous ones on screen while loading. */
function useLoaded(entries: readonly CatalogEntry[]) {
  const { items, errors } = useDatasets(entries);
  const complete = useMemo(
    () => (items.length > 0 && items.every((item) => item !== undefined) ? items : undefined),
    [items],
  );
  const { value, stale } = useLastComplete(complete);
  return { items, errors, datasets: value, stale };
}

function LoadErrors({ errors }: { errors: ReturnType<typeof useDatasets>['errors'] }) {
  if (errors.length === 0) return null;
  return (
    <Notices
      notices={errors.map(({ error }, i) => ({
        id: -1 - i,
        tone: 'error',
        title: error.message,
        details: error.details,
      }))}
    />
  );
}

interface ModeProps {
  municipalities: Municipality[];
  withData: Municipality[];
  /** Source documents per dataset id (quellen.json). */
  sources: ReadonlyMap<string, Quelle[]>;
  params: HashParams;
  setParams: (patch: HashParams) => void;
  controls: ViewControls;
}

function findEntry(municipalities: Municipality[], id: string | undefined): CatalogEntry | undefined {
  if (!id) return undefined;
  for (const m of municipalities) for (const e of m.entries) if (e.id === id) return e;
  return undefined;
}

function PairMode({
  municipalities,
  withData,
  sources,
  params,
  setParams,
  controls,
  threshold,
  onThreshold,
}: ModeProps & { threshold: number; onThreshold: (t: number) => void }) {
  // By default, compare the municipalities with the longest data series.
  const byYears = withData.toSorted((x, y) => y.entries.length - x.entries.length);
  const a = findEntry(withData, params.a) ?? byYears[0]!.entries.at(-1)!;
  const other = byYears.find((m) => m.ags !== a.ags);
  const b = findEntry(withData, params.b) ?? (other ? closestEntry(other, a.jahr) : (byYears[0]!.entries.at(-2) ?? a));
  const entries = useMemo((): [CatalogEntry, CatalogEntry] => [a, b], [a, b]);
  const { items, errors, datasets, stale } = useLoaded(entries);

  return (
    <>
      <PairSelector
        municipalities={municipalities}
        entries={entries}
        datasets={items}
        sources={sources}
        onSelect={(slot, entry) => setParams(slot === 0 ? { a: entry.id } : { b: entry.id })}
        onSwap={() => setParams({ a: b.id, b: a.id })}
      />
      <LoadErrors errors={errors} />
      <PairView
        datasets={datasets as [LoadedDataset, LoadedDataset] | undefined}
        stale={stale}
        controls={controls}
        threshold={threshold}
        onThreshold={onThreshold}
      />
    </>
  );
}

function SeriesMode({
  municipalities,
  withData,
  sources,
  params,
  setParams,
  controls,
  chart,
  onChart,
}: ModeProps & { chart: ChartPick[] | null; onChart: (chart: ChartPick[]) => void }) {
  const municipality =
    withData.find((m) => m.ags === params.kommune) ??
    withData.reduce((best, m) => (m.entries.length > best.entries.length ? m : best));
  const selected = useMemo(() => {
    const wanted = new Set(params.jahre?.split(',') ?? []);
    const picked = municipality.entries.filter((e) => wanted.has(e.id));
    return picked.length > 0 ? picked : municipality.entries;
  }, [municipality, params.jahre]);
  const { errors, datasets, stale } = useLoaded(selected);

  const setYears = (entries: CatalogEntry[]) =>
    setParams({ jahre: entries.length === municipality.entries.length ? '' : entries.map((e) => e.id).join(',') });

  return (
    <>
      <SeriesSelector
        municipalities={municipalities}
        municipality={municipality}
        selected={selected}
        sources={sources}
        onMunicipality={(m) => setParams({ kommune: m.ags, jahre: '' })}
        onToggle={(entry) => {
          const next = selected.includes(entry) ? selected.filter((e) => e !== entry) : [...selected, entry];
          if (next.length > 0) setYears(municipality.entries.filter((e) => next.includes(e)));
        }}
        onAll={() => setYears(municipality.entries)}
      />
      <LoadErrors errors={errors} />
      <SeriesView datasets={datasets} stale={stale} controls={controls} chart={chart} onChart={onChart} />
    </>
  );
}
