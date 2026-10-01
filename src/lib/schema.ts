import { z } from 'zod';
import { de } from 'zod/locales';
import { aggregate, sideTotal } from './aggregate.ts';
import {
  MASTER,
  SECTIONS,
  SECTION_LABEL,
  SIDES,
  SIDE_LABEL,
  codeLevel,
  codePattern,
  codeTitle,
  describeAllowed,
  hauptgruppeOf,
  HAUPTGRUPPE_5_6,
  isKnownCode,
  listedChildren,
  parentCode,
  type Section,
  type Side,
} from './master.ts';
import { formatEuro } from './format.ts';
import { STORED_KENNZAHLEN, type StoredKennzahlKey } from './kennzahlen.ts';

z.config(de());

export const STATUS_VALUES = ['Entwurf', 'Ansatz', 'Nachtrag', 'Ergebnis'] as const;

export const metadataSchema = z
  .strictObject({
    kommune: z.string().trim().min(1).meta({ description: 'Name der Kommune' }),
    ags: z
      .string()
      .regex(/^\d{8}$/, { error: 'Der Amtliche Gemeindeschlüssel (AGS) muss aus genau 8 Ziffern bestehen' })
      .meta({ description: 'Amtlicher Gemeindeschlüssel (8 Ziffern)', examples: ['09271146'] }),
    jahr: z.int().min(1950).max(2100).meta({ description: 'Haushaltsjahr' }),
    einwohner: z
      .int()
      .positive({ error: 'Die Einwohnerzahl muss größer als 0 sein' })
      .meta({ description: 'Einwohnerzahl, Grundlage für die Pro-Kopf-Werte' }),
    einwohner_stichtag: z.iso
      .date()
      .optional()
      .meta({ description: 'Stichtag der Einwohnerzahl (JJJJ-MM-TT), z. B. 31.12. des Vorjahres' }),
    status: z.enum(STATUS_VALUES).meta({
      description:
        'Entwurf = Entwurf des Haushaltsplans, Ansatz = Haushaltsplan, Nachtrag = Nachtragshaushaltsplan, Ergebnis = Jahresrechnung',
    }),
    waehrung: z.literal('EUR'),
    quelle: z
      .string()
      .optional()
      .meta({ description: 'Herkunft der Daten, z. B. URL des veröffentlichten Haushaltsplans' }),
    hinweis: z.string().optional().meta({ description: 'Freitext-Anmerkung zum Datensatz' }),
  })
  .meta({ description: 'Stammdaten des Datensatzes' });

const codeKey = (section: Section, side: Side) => z.string().regex(new RegExp(codePattern(section, side)));

function amountsSchema(section: Section, side: Side) {
  return z.record(codeKey(section, side), z.number()).meta({
    description: `${SIDE_LABEL[side]} des ${SECTION_LABEL[section]}s: Gruppierungsziffer (${describeAllowed(section, side)}, 1–3 Stellen, Hauptgruppe 5/6 als "5/6") → Betrag in Euro`,
  });
}

function sectionSchema(section: Section) {
  return z.strictObject({
    einnahmen: amountsSchema(section, 'einnahmen'),
    ausgaben: amountsSchema(section, 'ausgaben'),
    gesamt: z.number().nonnegative().optional().meta({
      description:
        'Gesamtbetrag laut Haushaltssatzung (Einnahmen = Ausgaben). Was die Gruppierungen nicht abdecken, erscheint als „nicht aufgeschlüsselt“.',
    }),
  });
}

function labelsSchema(section: Section) {
  const labels = (side: Side) => z.record(codeKey(section, side), z.string().trim().min(1)).optional();
  return z.strictObject({ einnahmen: labels('einnahmen'), ausgaben: labels('ausgaben') }).optional();
}

const kennzahlSchema = z.strictObject({
  wert: z.number().nonnegative(),
  stichtag: z.iso.date().optional().meta({ description: 'Stichtag des Werts (JJJJ-MM-TT), z. B. bei Schuldenständen' }),
  quelle: z.string().trim().min(1).optional().meta({ description: 'Herkunft des Werts' }),
});

const kennzahlenSchema = z
  .strictObject(
    Object.fromEntries(
      STORED_KENNZAHLEN.map((k) => [k.key, kennzahlSchema.optional().meta({ description: k.description })]),
    ) as Record<StoredKennzahlKey, z.ZodOptional<typeof kennzahlSchema>>,
  )
  .meta({ description: 'Kernzahlen des Haushaltsjahres, z. B. Hebesätze und Schuldenstand' });

export const datasetSchema = z
  .strictObject({
    $schema: z.string().optional(),
    metadata: metadataSchema,
    betraege: z.strictObject({ vwh: sectionSchema('vwh'), vmh: sectionSchema('vmh') }),
    kennzahlen: kennzahlenSchema.optional(),
    nicht_aufgeschluesselt: z
      .strictObject({ vwh: labelsSchema('vwh'), vmh: labelsSchema('vmh') })
      .optional()
      .meta({
        description:
          'Erläuterung, was in der Differenz zwischen einer angegebenen Summe und ihrer Untergliederung steckt, z. B. { "vwh": { "einnahmen": { "00": "Grundsteuer A und B" } } }',
      }),
  })
  .superRefine((data, ctx) => {
    for (const section of SECTIONS) {
      for (const side of SIDES) {
        for (const code of Object.keys(data.nicht_aufgeschluesselt?.[section]?.[side] ?? {})) {
          if (!(code in data.betraege[section][side])) {
            ctx.addIssue({
              code: 'custom',
              path: ['nicht_aufgeschluesselt', section, side, code],
              message: `Erläuterung zu ${code}, aber betraege.${section}.${side} enthält keinen Betrag für ${code}`,
            });
          }
        }
      }
    }
  })
  .meta({
    title: 'Kameraler Haushaltsdatensatz',
    description:
      'Beträge eines kommunalen Haushalts nach dem Gruppierungsplan (KommGrPl), getrennt nach Verwaltungs- und Vermögenshaushalt.',
  });

export type BudgetDataset = z.infer<typeof datasetSchema>;
export type BudgetMetadata = z.infer<typeof metadataSchema>;

export type ValidationResult = { ok: true; data: BudgetDataset; warnings: string[] } | { ok: false; errors: string[] };

function formatPath(path: PropertyKey[]): string {
  return path.map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`)).join('');
}

function invalidCodeMessage(path: PropertyKey[]): string {
  const [, section, side, code] = path.map(String) as [string, Section, Side, string];
  const where = `${SIDE_LABEL[side]} ${SECTION_LABEL[section]} (${formatPath(path.slice(0, -1))})`;
  if (code === '5' || code === '6') {
    return `Die Hauptgruppe ${code} wird zusammen als „${HAUPTGRUPPE_5_6}“ angegeben – ${where}`;
  }
  if (!/^\d{1,3}$/.test(code) && code !== HAUPTGRUPPE_5_6) {
    return `„${code}“ ist keine gültige Gruppierungsziffer (1–3 Ziffern erwartet) – ${where}`;
  }
  const hauptgruppe = hauptgruppeOf(code);
  return (
    `Gruppierungsziffer ${code} gehört zur Hauptgruppe ${hauptgruppe} (${MASTER[hauptgruppe]?.title}) ` +
    `und ist bei ${where} nicht zulässig; erlaubt ist ${describeAllowed(section, side)}`
  );
}

function issueToMessage(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_key' && issue.path.length === 4) return invalidCodeMessage(issue.path);
  const path = formatPath(issue.path);
  const message = issue.code === 'invalid_type' && issue.input === undefined ? 'Pflichtfeld fehlt' : issue.message;
  return path ? `${path}: ${message}` : message;
}

// In group 63, the listed Untergruppen 638/639 are statistical codes, not a closed list.
const OPEN_GROUPS = new Set(['63']);

/** Non-fatal findings: codes the Gruppierungsplan does not know and totals smaller than their parts. */
function collectWarnings(data: BudgetDataset): string[] {
  const warnings: string[] = [];
  for (const section of SECTIONS) {
    for (const side of SIDES) {
      const amounts = data.betraege[section][side];
      for (const code of Object.keys(amounts)) {
        const where = `Gruppierungsziffer ${code} (${SECTION_LABEL[section]}, ${SIDE_LABEL[side]})`;
        const group = codeLevel(code) === 3 ? parentCode(code)! : code;
        if (!isKnownCode(group)) {
          warnings.push(`${where}: Gruppe ${group} ist im Gruppierungsplan nicht vorgesehen`);
        } else if (
          code !== group &&
          !isKnownCode(code) &&
          listedChildren(group).length > 0 &&
          !OPEN_GROUPS.has(group)
        ) {
          // Untergruppen may only be formed freely where the plan lists none for the Gruppe.
          warnings.push(
            `${where}: Untergruppe ${code} ist im Gruppierungsplan nicht vorgesehen; Gruppe ${group} (${codeTitle(group)}) kennt ${listedChildren(group).join(', ')}`,
          );
        }
      }
      const gesamt = data.betraege[section].gesamt;
      const parts = sideTotal(aggregate(amounts));
      if (gesamt !== undefined && parts !== null && parts - gesamt >= 0.005) {
        warnings.push(
          `${SECTION_LABEL[section]}, ${SIDE_LABEL[side]}: Gesamtbetrag ${formatEuro(gesamt)} ist kleiner als die Summe der Gruppierungen ${formatEuro(parts)}`,
        );
      }
      // A stated total above the sum of its parts is a partial breakdown ("nicht aufgeschlüsselt");
      // below it, the figures contradict each other.
      for (const [code, { stated, computed }] of aggregate(amounts).mismatches) {
        if (stated >= computed) continue;
        warnings.push(
          `${code} ${codeTitle(code)} (${SECTION_LABEL[section]}, ${SIDE_LABEL[side]}): angegebene Summe ${formatEuro(stated)} ist kleiner als die Summe der Untergliederung ${formatEuro(computed)} – es wird der angegebene Wert verwendet`,
        );
      }
    }
  }
  return warnings;
}

export function validateDataset(input: unknown): ValidationResult {
  const result = datasetSchema.safeParse(input, { reportInput: true });
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map(issueToMessage) };
  }
  return { ok: true, data: result.data, warnings: collectWarnings(result.data) };
}

export function validateDatasetText(text: string): ValidationResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`Die Datei enthält kein gültiges JSON: ${(error as Error).message}`] };
  }
  return validateDataset(json);
}

export function budgetJsonSchema() {
  return z.toJSONSchema(datasetSchema, { target: 'draft-2020-12', io: 'input' });
}
