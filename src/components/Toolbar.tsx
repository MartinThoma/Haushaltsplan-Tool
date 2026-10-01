import { Download, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Unit } from '../lib/compare.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

export type SectionChoice = 'vwh' | 'vmh' | 'beide';

export interface ViewSettings {
  section: SectionChoice;
  unit: Unit;
  search: string;
  /** Depth the tree was last expanded to via the level buttons; null after manual toggling. */
  level: number | null;
}

interface Props {
  settings: ViewSettings;
  onSection: (section: SectionChoice) => void;
  onUnit: (unit: Unit) => void;
  onSearch: (search: string) => void;
  onLevel: (level: number) => void;
  onExport: () => void;
  exportDisabled?: boolean;
  children?: ReactNode;
}

const SECTION_OPTIONS = [
  { value: 'vwh', label: 'VwH', title: 'Verwaltungshaushalt' },
  { value: 'vmh', label: 'VmH', title: 'Vermögenshaushalt' },
  { value: 'beide', label: 'Beide', title: 'Verwaltungs- und Vermögenshaushalt untereinander' },
] as const;

const UNIT_OPTIONS = [
  { value: 'absolute', label: '€', title: 'Absolute Beträge in Euro' },
  { value: 'perCapita', label: '€/EW', title: 'Beträge je Einwohnerin und Einwohner' },
] as const;

const LEVEL_OPTIONS = [
  { value: '1', label: '1', title: 'Hauptgruppen (1-stellig)' },
  { value: '2', label: '2', title: 'Gruppen (2-stellig)' },
  { value: '3', label: '3', title: 'Untergruppen (3-stellig)' },
] as const;

export function Toolbar({ settings, onSection, onUnit, onSearch, onLevel, onExport, exportDisabled, children }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <label className="relative flex min-w-56 flex-1 items-center sm:max-w-80">
        <span className="sr-only">Gruppierung suchen</span>
        <Search aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-ink-3" />
        <input
          type="search"
          value={settings.search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Ziffer oder Begriff suchen …"
          className="h-8 w-full rounded-lg border border-line bg-surface pr-8 pl-8 text-sm text-ink placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {settings.search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            className="absolute right-1.5 rounded p-1 text-ink-3 hover:text-ink"
            aria-label="Suche leeren"
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>

      <ToolbarGroup label="Haushalt">
        <SegmentedControl label="Haushalt" options={SECTION_OPTIONS} value={settings.section} onChange={onSection} />
      </ToolbarGroup>
      <ToolbarGroup label="Werte">
        <SegmentedControl label="Werte" options={UNIT_OPTIONS} value={settings.unit} onChange={onUnit} />
      </ToolbarGroup>
      <ToolbarGroup label="Ebene">
        <SegmentedControl
          label="Aufklappen bis Ebene"
          options={LEVEL_OPTIONS}
          value={settings.level === null ? null : (String(settings.level) as '1' | '2' | '3')}
          onChange={(v) => onLevel(Number(v))}
        />
      </ToolbarGroup>
      {children}

      <button
        type="button"
        onClick={onExport}
        disabled={exportDisabled}
        className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink hover:bg-surface-2 disabled:opacity-50"
        title="Sichtbare Zeilen als CSV-Datei herunterladen"
      >
        <Download aria-hidden className="size-4" />
        CSV
      </button>
    </div>
  );
}

export function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      {children}
    </div>
  );
}
