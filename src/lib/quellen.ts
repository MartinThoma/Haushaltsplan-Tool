import { z } from 'zod';

/**
 * Register of the original documents behind the bundled data: where each file came from, when
 * it was retrieved and its SHA-256 checksum, so every figure can be traced back to an exact file
 * even though the PDFs themselves are not in the repository (they stay in the local import/ folder).
 */
export const QUELLEN_FILE = 'quellen.json';

export const quelleSchema = z
  .strictObject({
    datei: z
      .string()
      .regex(/^[^/\\]+\/[^/\\]+$/, {
        error: 'Pfad relativ zu import/ erwartet, z. B. "Haar/Haushaltssatzung-2026.pdf"',
      })
      .meta({ description: 'Lokale Kopie, relativ zum Ordner import/ (nicht im Repository)' }),
    titel: z.string().trim().min(1).meta({ description: 'Bezeichnung des Dokuments' }),
    herausgeber: z
      .string()
      .trim()
      .min(1)
      .meta({ description: 'Kommune oder Behörde, die das Dokument veröffentlicht' }),
    url: z.url().optional().meta({ description: 'Adresse, unter der das Dokument abgerufen wurde' }),
    herkunft: z
      .string()
      .trim()
      .min(1)
      .optional()
      .meta({ description: 'Woher das Dokument stammt, wenn es keine öffentliche Adresse hat' }),
    abgerufen: z.iso.date().meta({ description: 'Datum des Abrufs (JJJJ-MM-TT)' }),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/, { error: 'SHA-256 als 64 Hex-Zeichen erwartet' })
      .meta({ description: 'Prüfsumme der Datei' }),
    bytes: z.int().positive().meta({ description: 'Dateigröße in Bytes' }),
    datensaetze: z
      .array(z.string().regex(/^\d{8}_\d{4}$/, { error: 'Datensatz als "[ags]_[jahr]" erwartet' }))
      .min(1)
      .meta({ description: 'Datensätze, deren Beträge oder Kernzahlen auf dem Dokument beruhen' }),
  })
  .refine((q) => q.url !== undefined || q.herkunft !== undefined, {
    error: 'url oder herkunft angeben',
    path: ['url'],
  });

export const quellenSchema = z.array(quelleSchema).superRefine((quellen, ctx) => {
  const seen = new Set<string>();
  for (const [i, quelle] of quellen.entries()) {
    if (seen.has(quelle.datei)) {
      ctx.addIssue({ code: 'custom', path: [i, 'datei'], message: `${quelle.datei} ist doppelt eingetragen` });
    }
    seen.add(quelle.datei);
  }
});

export type Quelle = z.infer<typeof quelleSchema>;

export type QuellenResult = { ok: true; data: Quelle[] } | { ok: false; errors: string[] };

export function validateQuellen(input: unknown): QuellenResult {
  const result = quellenSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const [index, ...rest] = issue.path;
      const datei =
        Array.isArray(input) && typeof index === 'number' ? (input[index] as { datei?: unknown })?.datei : '';
      return `Eintrag ${typeof index === 'number' ? index + 1 : '?'}${typeof datei === 'string' && datei ? ` (${datei})` : ''}${rest.length ? `, ${rest.join('.')}` : ''}: ${issue.message}`;
    }),
  };
}

/** Every dataset needs at least one source document, and sources may only name existing datasets. */
export function checkQuellenAgainstDatasets(quellen: readonly Quelle[], datasetIds: readonly string[]): string[] {
  const known = new Set(datasetIds);
  const covered = new Set(quellen.flatMap((q) => q.datensaetze));
  const problems: string[] = [];
  for (const quelle of quellen) {
    for (const id of quelle.datensaetze) {
      if (!known.has(id)) problems.push(`${QUELLEN_FILE}: ${quelle.datei} nennt den unbekannten Datensatz ${id}`);
    }
  }
  for (const id of datasetIds) {
    if (!covered.has(id)) problems.push(`${id}.json hat keinen Eintrag in ${QUELLEN_FILE}`);
  }
  return problems;
}

/** Source documents per dataset id, in the order of the register. */
export function quellenByDataset(quellen: readonly Quelle[]): Map<string, Quelle[]> {
  const byDataset = new Map<string, Quelle[]>();
  for (const quelle of quellen) {
    for (const id of quelle.datensaetze) byDataset.set(id, [...(byDataset.get(id) ?? []), quelle]);
  }
  return byDataset;
}
