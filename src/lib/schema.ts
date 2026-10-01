import { z } from 'zod';
import { de } from 'zod/locales';
import { aggregate } from './aggregate.ts';
import {
  ALLOWED_HAUPTGRUPPEN,
  MASTER,
  SECTIONS,
  SECTION_LABEL,
  SIDES,
  SIDE_LABEL,
  codeTitle,
  describeAllowed,
  isKnownCode,
  listedChildren,
  parentCode,
  type Section,
  type Side,
} from './master.ts';
import { formatEuro } from './format.ts';

z.config(de());

export const STATUS_VALUES = ['Ansatz', 'Nachtrag', 'Ergebnis'] as const;

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
    status: z.enum(STATUS_VALUES).meta({
      description: 'Ansatz = Haushaltsplan, Nachtrag = Nachtragshaushaltsplan, Ergebnis = Jahresrechnung',
    }),
    waehrung: z.literal('EUR'),
    quelle: z
      .string()
      .optional()
      .meta({ description: 'Herkunft der Daten, z. B. URL des veröffentlichten Haushaltsplans' }),
    hinweis: z.string().optional().meta({ description: 'Freitext-Anmerkung zum Datensatz' }),
  })
  .meta({ description: 'Stammdaten des Datensatzes' });

function amountsSchema(section: Section, side: Side) {
  const digits = ALLOWED_HAUPTGRUPPEN[section][side];
  return z.record(z.string().regex(new RegExp(`^[${digits}][0-9]{0,2}$`)), z.number()).meta({
    description: `${SIDE_LABEL[side]} des ${SECTION_LABEL[section]}s: Gruppierungsziffer (${describeAllowed(section, side)}, 1–3 Stellen) → Betrag in Euro`,
  });
}

function sectionSchema(section: Section) {
  return z.strictObject({
    einnahmen: amountsSchema(section, 'einnahmen'),
    ausgaben: amountsSchema(section, 'ausgaben'),
  });
}

export const datasetSchema = z
  .strictObject({
    $schema: z.string().optional(),
    metadata: metadataSchema,
    betraege: z.strictObject({ vwh: sectionSchema('vwh'), vmh: sectionSchema('vmh') }),
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
  if (!/^\d{1,3}$/.test(code)) {
    return `„${code}“ ist keine gültige Gruppierungsziffer (1–3 Ziffern erwartet) – ${where}`;
  }
  const hauptgruppe = code[0]!;
  return (
    `Gruppierungsziffer ${code} gehört zur Hauptgruppe ${hauptgruppe} (${MASTER[hauptgruppe]?.title}) ` +
    `und ist bei ${where} nicht zulässig; erlaubt ist ${describeAllowed(section, side)}`
  );
}

function issueToMessage(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_key' && issue.path[0] === 'betraege') return invalidCodeMessage(issue.path);
  const path = formatPath(issue.path);
  const message = issue.code === 'invalid_type' && issue.input === undefined ? 'Pflichtfeld fehlt' : issue.message;
  return path ? `${path}: ${message}` : message;
}

/** Non-fatal findings: unknown Gruppen and stated totals that disagree with their parts. */
function collectWarnings(data: BudgetDataset): string[] {
  const warnings: string[] = [];
  for (const section of SECTIONS) {
    for (const side of SIDES) {
      const amounts = data.betraege[section][side];
      for (const code of Object.keys(amounts)) {
        const where = `Gruppierungsziffer ${code} (${SECTION_LABEL[section]}, ${SIDE_LABEL[side]})`;
        const group = code.length === 3 ? parentCode(code)! : code;
        if (!isKnownCode(group)) {
          warnings.push(
            `${where}: ${group.length === 2 ? 'Gruppe' : 'Hauptgruppe'} ${group} ist im Gruppierungsplan nicht vorgesehen`,
          );
        } else if (code !== group && !isKnownCode(code) && listedChildren(group).length > 0) {
          // Untergruppen may only be formed freely where the plan lists none for the Gruppe.
          warnings.push(
            `${where}: Untergruppe ${code} ist im Gruppierungsplan nicht vorgesehen; Gruppe ${group} (${codeTitle(group)}) kennt ${listedChildren(group).join(', ')}`,
          );
        }
      }
      for (const [code, { stated, computed }] of aggregate(amounts).mismatches) {
        warnings.push(
          `${code} ${codeTitle(code)} (${SECTION_LABEL[section]}, ${SIDE_LABEL[side]}): angegebene Summe ${formatEuro(stated)} weicht von der Summe der Untergliederung ${formatEuro(computed)} ab – es wird der angegebene Wert verwendet`,
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
