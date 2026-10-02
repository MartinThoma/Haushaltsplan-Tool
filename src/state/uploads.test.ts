import { describe, expect, it } from 'vitest';
import { openFile, rememberFile, restoreFiles } from './uploads.ts';

function memoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const text = (jahr: number) =>
  JSON.stringify({
    metadata: { kommune: 'Testdorf', ags: '09999001', jahr, einwohner: 1000, status: 'Ansatz', waehrung: 'EUR' },
    betraege: { vwh: { einnahmen: { '003': 10 }, ausgaben: { '410': 10 } }, vmh: { einnahmen: {}, ausgaben: {} } },
  });

describe('opened files', () => {
  it('survive a reload with their ids, and new files get fresh ids', () => {
    const store = memoryStore();
    const first = openFile('a.json', text(2025));
    if (!first.ok) throw new Error(first.errors.join('; '));
    rememberFile(first.file.upload.entry.id, 'a.json', text(2025), store);

    const { files, invalid } = restoreFiles(store);
    expect(invalid).toEqual([]);
    expect(files.map((f) => f.upload)).toEqual([first.file.upload]);
    expect(files[0]!.dataset.data.metadata.kommune).toBe('Testdorf');

    const next = openFile('b.json', text(2026));
    expect(next.ok && next.file.upload.entry.id).not.toBe(first.file.upload.entry.id);
  });

  it('reports stored files that no longer pass validation', () => {
    const store = memoryStore();
    rememberFile('upload:7:alt.json', 'alt.json', '{"metadata": {}}', store);
    expect(restoreFiles(store)).toEqual({ files: [], invalid: ['alt.json'] });
  });

  it('ignores unreadable or unavailable storage', () => {
    expect(restoreFiles(memoryStore({ 'haushaltsplan-tool:dateien': 'kein JSON' }))).toEqual({
      files: [],
      invalid: [],
    });
    expect(restoreFiles(null)).toEqual({ files: [], invalid: [] });
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => rememberFile('upload:1:a.json', 'a.json', text(2025), full)).not.toThrow();
  });
});
