import { z } from 'zod';
import type { ValidationResult } from './schema.ts';

export const BUNDESLAENDER = {
  SH: 'Schleswig-Holstein',
  HH: 'Hamburg',
  NI: 'Niedersachsen',
  HB: 'Bremen',
  NW: 'Nordrhein-Westfalen',
  HE: 'Hessen',
  RP: 'Rheinland-Pfalz',
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  SL: 'Saarland',
  BE: 'Berlin',
  BB: 'Brandenburg',
  MV: 'Mecklenburg-Vorpommern',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  TH: 'Thüringen',
} as const;

export type Bundesland = keyof typeof BUNDESLAENDER;

/** The first two AGS digits are the Land key 01–16, in the order of BUNDESLAENDER. */
export function bundeslandFromAgs(ags: string): Bundesland | undefined {
  return (Object.keys(BUNDESLAENDER) as Bundesland[])[Number(ags.slice(0, 2)) - 1];
}

const jahrSchema = z.strictObject({
  jahr: z.int().min(1950).max(2100),
  einwohner: z.int().positive(),
  file: z.string().regex(/^[\w.-]+\.json$/, { error: 'Dateiname ohne Pfad erwartet, z. B. "09271146_2026.json"' }),
});

export const kommuneSchema = z
  .strictObject({
    ags: z.string().regex(/^\d{8}$/, { error: 'Der AGS muss aus genau 8 Ziffern bestehen' }),
    name: z.string().trim().min(1),
    plz: z.array(z.string().regex(/^\d{5}$/, { error: 'Postleitzahlen bestehen aus 5 Ziffern' })),
    bundesland: z.enum(Object.keys(BUNDESLAENDER) as [Bundesland, ...Bundesland[]]),
    jahre: z.array(jahrSchema),
  })
  .superRefine((kommune, ctx) => {
    const land = bundeslandFromAgs(kommune.ags);
    if (land && land !== kommune.bundesland) {
      ctx.addIssue({
        code: 'custom',
        path: ['bundesland'],
        message: `AGS ${kommune.ags} liegt in ${BUNDESLAENDER[land]} (${land}), nicht in ${kommune.bundesland}`,
      });
    }
    const years = kommune.jahre.map((j) => j.jahr);
    for (const [i, year] of years.entries()) {
      if (years.indexOf(year) !== i) {
        ctx.addIssue({ code: 'custom', path: ['jahre', i, 'jahr'], message: `Jahr ${year} ist doppelt eingetragen` });
      }
    }
  });

export const kommunenSchema = z.array(kommuneSchema).superRefine((kommunen, ctx) => {
  const seen = new Set<string>();
  for (const [i, kommune] of kommunen.entries()) {
    if (seen.has(kommune.ags)) {
      ctx.addIssue({ code: 'custom', path: [i, 'ags'], message: `AGS ${kommune.ags} ist doppelt eingetragen` });
    }
    seen.add(kommune.ags);
  }
});

export type Kommune = z.infer<typeof kommuneSchema>;

export type KommunenResult = { ok: true; data: Kommune[] } | { ok: false; errors: string[] };

export function validateKommunen(input: unknown): KommunenResult {
  const result = kommunenSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const [index, ...rest] = issue.path;
      const name =
        Array.isArray(input) && typeof index === 'number' ? (input[index] as { name?: unknown })?.name : undefined;
      const where =
        typeof index === 'number' ? `Eintrag ${index + 1}${typeof name === 'string' ? ` (${name})` : ''}` : '';
      const field = rest
        .map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`))
        .join('')
        .replace(/^\./, '');
      return [where, field].filter(Boolean).join(', ') + `: ${issue.message}`;
    }),
  };
}

/**
 * Cross-checks kommunen.json against the dataset files: every listed file must exist, be
 * valid and match its index entry, and every dataset file must be listed.
 */
export function checkKommunenAgainstDatasets(
  kommunen: readonly Kommune[],
  datasets: ReadonlyMap<string, ValidationResult>,
): string[] {
  const problems: string[] = [];
  const listed = new Set<string>();
  for (const kommune of kommunen) {
    for (const { jahr, einwohner, file } of kommune.jahre) {
      listed.add(file);
      const where = `${kommune.name} ${jahr}`;
      const result = datasets.get(file);
      if (!result) {
        problems.push(`${where}: Datei ${file} fehlt`);
        continue;
      }
      if (!result.ok) {
        problems.push(`${file}:\n  - ${result.errors.join('\n  - ')}`);
        continue;
      }
      const meta = result.data.metadata;
      const mismatches = [
        meta.ags !== kommune.ags && `AGS ${meta.ags} ≠ ${kommune.ags}`,
        meta.jahr !== jahr && `Jahr ${meta.jahr} ≠ ${jahr}`,
        meta.einwohner !== einwohner && `Einwohner ${meta.einwohner} ≠ ${einwohner}`,
        meta.kommune !== kommune.name && `Name „${meta.kommune}“ ≠ „${kommune.name}“`,
      ].filter(Boolean);
      if (mismatches.length) {
        problems.push(`${file} passt nicht zum Eintrag in kommunen.json (${where}): ${mismatches.join(', ')}`);
      }
    }
  }
  for (const file of datasets.keys()) {
    if (!listed.has(file)) problems.push(`${file} ist in kommunen.json nicht eingetragen`);
  }
  return problems;
}
