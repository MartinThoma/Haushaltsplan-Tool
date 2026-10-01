import { useEffect, useReducer, useRef, useState } from 'react';
import { DatasetError, fetchDataset, type CatalogEntry, type LoadedDataset } from '../lib/catalog.ts';

// Module-level cache: datasets are immutable once loaded, uploads are put here directly.
const cache = new Map<string, LoadedDataset>();
const pending = new Map<string, Promise<LoadedDataset>>();

export function putDataset(id: string, dataset: LoadedDataset) {
  cache.set(id, dataset);
}

function load(entry: CatalogEntry): Promise<LoadedDataset> {
  let promise = pending.get(entry.id);
  if (!promise) {
    promise = fetchDataset(entry).then((dataset) => {
      cache.set(entry.id, dataset);
      return dataset;
    });
    promise.finally(() => pending.delete(entry.id)).catch(() => {});
    pending.set(entry.id, promise);
  }
  return promise;
}

export interface DatasetsState {
  /** Same order as the requested entries; undefined while loading or failed. */
  items: (LoadedDataset | undefined)[];
  loading: boolean;
  errors: { entry: CatalogEntry; error: DatasetError }[];
}

export function useDatasets(entries: readonly CatalogEntry[]): DatasetsState {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [errors, setErrors] = useState<Record<string, DatasetError>>({});
  const key = entries.map((e) => e.id).join('|');

  useEffect(() => {
    let active = true;
    for (const entry of entries) {
      if (cache.has(entry.id)) continue;
      load(entry)
        .then(() => active && rerender())
        .catch((error: unknown) => {
          if (!active) return;
          const err = error instanceof DatasetError ? error : new DatasetError(String(error));
          setErrors((prev) => ({ ...prev, [entry.id]: err }));
        });
    }
    return () => {
      active = false;
    };
    // `key` identifies the entries; the array itself is recreated on every render.
  }, [key]);

  return {
    items: entries.map((e) => cache.get(e.id)),
    loading: entries.some((e) => !cache.has(e.id) && !errors[e.id]),
    errors: entries.flatMap((entry) => (errors[entry.id] ? [{ entry, error: errors[entry.id]! }] : [])),
  };
}

/**
 * Keeps showing the last complete result while new datasets load, so switching a
 * selection dims the current view instead of blanking it.
 */
export function useLastComplete<T>(value: T | undefined): { value: T | undefined; stale: boolean } {
  const last = useRef<T | undefined>(undefined);
  if (value !== undefined) last.current = value;
  return { value: value ?? last.current, stale: value === undefined && last.current !== undefined };
}
