import { useEffect, useMemo, useState } from 'react';
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

type Outcome = { dataset: LoadedDataset } | { error: DatasetError };

export interface DatasetsState {
  /** Same order as the requested entries; undefined while loading or failed. */
  items: (LoadedDataset | undefined)[];
  errors: { entry: CatalogEntry; error: DatasetError }[];
}

/**
 * Loads the datasets of `entries`. The result is stable as long as `entries` (pass a memoized
 * array) and the load outcomes do not change, so it can feed further memoization.
 */
export function useDatasets(entries: readonly CatalogEntry[]): DatasetsState {
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, Outcome>>(() => new Map());

  useEffect(() => {
    let active = true;
    const settle = (id: string, outcome: Outcome) => {
      if (active) setOutcomes((prev) => new Map(prev).set(id, outcome));
    };
    for (const entry of entries) {
      if (cache.has(entry.id)) continue;
      load(entry).then(
        (dataset) => settle(entry.id, { dataset }),
        (error: unknown) =>
          settle(entry.id, { error: error instanceof DatasetError ? error : new DatasetError(String(error)) }),
      );
    }
    return () => {
      active = false;
    };
  }, [entries]);

  return useMemo(() => {
    const items = entries.map((e) => {
      const outcome = outcomes.get(e.id);
      return cache.get(e.id) ?? (outcome && 'dataset' in outcome ? outcome.dataset : undefined);
    });
    const errors = entries.flatMap((entry, i) => {
      const outcome = outcomes.get(entry.id);
      // A later successful load (e.g. after being offline) replaces the error.
      return !items[i] && outcome && 'error' in outcome ? [{ entry, error: outcome.error }] : [];
    });
    return { items, errors };
  }, [entries, outcomes]);
}

/**
 * Keeps showing the last complete result while new datasets load, so switching a
 * selection dims the current view instead of blanking it.
 */
export function useLastComplete<T>(value: T | undefined): { value: T | undefined; stale: boolean } {
  const [last, setLast] = useState(value);
  // Adjusting state while rendering, as React recommends for values derived from changing input.
  if (value !== undefined && value !== last) setLast(value);
  return { value: value ?? last, stale: value === undefined && last !== undefined };
}
