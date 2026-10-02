import type { CatalogEntry, LoadedDataset } from '../lib/catalog.ts';
import { validateDatasetText } from '../lib/schema.ts';

/**
 * Opened files live only in memory. To survive a reload of the tab (also the automatic one after
 * an app update), their text is kept in sessionStorage: it stays on the device and disappears with
 * the tab. Restored files are validated again, as the schema may have changed with the update.
 */
const STORAGE_KEY = 'haushaltsplan-tool:dateien';

export interface Upload {
  entry: CatalogEntry;
  kommune: string;
}

interface StoredFile {
  id: string;
  name: string;
  text: string;
}

export interface OpenedFile {
  upload: Upload;
  dataset: LoadedDataset;
}

export type OpenResult = { ok: true; file: OpenedFile } | { ok: false; errors: string[] };

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): SessionStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // blocked storage, e.g. by privacy settings
  }
}

let lastId = 0;

/** Validates a file's text and assigns it a new id ("upload:<n>:<name>"). */
export function openFile(name: string, text: string, id = `upload:${++lastId}:${name}`): OpenResult {
  const result = validateDatasetText(text);
  if (!result.ok) return { ok: false, errors: result.errors };
  const { metadata } = result.data;
  return {
    ok: true,
    file: {
      upload: {
        entry: {
          id,
          source: 'upload',
          file: name,
          ags: metadata.ags,
          jahr: metadata.jahr,
          einwohner: metadata.einwohner,
        },
        kommune: metadata.kommune,
      },
      dataset: { data: result.data, warnings: result.warnings },
    },
  };
}

function readStored(store: SessionStore): StoredFile[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as StoredFile[]) : [];
  } catch {
    return [];
  }
}

/** Remembers an opened file for this tab; silently skipped if storage is unavailable or full. */
export function rememberFile(id: string, name: string, text: string, store = defaultStore()) {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify([...readStored(store), { id, name, text }]));
  } catch {
    // Quota exceeded: the file still works until the tab is reloaded.
  }
}

/** Files opened earlier in this tab; files that no longer pass validation are reported by name. */
export function restoreFiles(store = defaultStore()): { files: OpenedFile[]; invalid: string[] } {
  const files: OpenedFile[] = [];
  const invalid: string[] = [];
  for (const stored of store ? readStored(store) : []) {
    if (typeof stored?.id !== 'string' || typeof stored.name !== 'string' || typeof stored.text !== 'string') continue;
    const result = openFile(stored.name, stored.text, stored.id);
    if (result.ok) files.push(result.file);
    else invalid.push(stored.name);
    lastId = Math.max(lastId, Number(/^upload:(\d+):/.exec(stored.id)?.[1] ?? 0));
  }
  return { files, invalid };
}
