import masterJson from '../data/master-groupings.json' with { type: 'json' };

export type Section = 'vwh' | 'vmh';
export type Side = 'einnahmen' | 'ausgaben';

export interface MasterEntry {
  title: string;
  level: 1 | 2 | 3;
  parent: string | null;
}

export const MASTER = masterJson as Record<string, MasterEntry>;

export const SECTIONS: readonly Section[] = ['vwh', 'vmh'];
export const SIDES: readonly Side[] = ['einnahmen', 'ausgaben'];

export const SECTION_LABEL: Record<Section, string> = {
  vwh: 'Verwaltungshaushalt',
  vmh: 'Vermögenshaushalt',
};

export const SIDE_LABEL: Record<Side, string> = {
  einnahmen: 'Einnahmen',
  ausgaben: 'Ausgaben',
};

/**
 * Hauptgruppen permitted per budget section (KommGrPl, Anlage 2 VVKommHSyst-Kameralistik):
 * 0–2 VwH-Einnahmen, 3 VmH-Einnahmen, 4–8 VwH-Ausgaben, 9 VmH-Ausgaben.
 */
export const ALLOWED_HAUPTGRUPPEN: Record<Section, Record<Side, string>> = {
  vwh: { einnahmen: '012', ausgaben: '45678' },
  vmh: { einnahmen: '3', ausgaben: '9' },
};

export function describeAllowed(section: Section, side: Side): string {
  const digits = ALLOWED_HAUPTGRUPPEN[section][side];
  return digits.length === 1 ? `Hauptgruppe ${digits}` : `Hauptgruppen ${digits[0]}–${digits.at(-1)}`;
}

/** The plan treats the expense Hauptgruppen 5 and 6 as one ("5/6 Sächlicher Verwaltungs- und Betriebsaufwand"). */
export const HAUPTGRUPPE_5_6 = '5/6';

export function hauptgruppeOf(code: string): string {
  return code[0] === '5' || code[0] === '6' ? HAUPTGRUPPE_5_6 : code[0]!;
}

/**
 * The plan lists "94, 95, 96 Baumaßnahmen" as one Gruppe; budgets that follow it book them together.
 * Municipalities that split Hoch- and Tiefbau use 94, 95 and 96 instead.
 */
export const BAUMASSNAHMEN = '94-96';

/** 1 = Hauptgruppe, 2 = Gruppe, 3 = Untergruppe. */
export function codeLevel(code: string): number {
  if (code === HAUPTGRUPPE_5_6) return 1;
  if (code === BAUMASSNAHMEN) return 2;
  return code.length;
}

export function parentCode(code: string): string | null {
  const level = codeLevel(code);
  if (level === 1) return null;
  return level === 2 ? hauptgruppeOf(code) : code.slice(0, -1);
}

/** Valid keys for one budget side: Hauptgruppen ("4", "5/6", …), Gruppen and Untergruppen. */
export function codePattern(section: Section, side: Side): string {
  const digits = ALLOWED_HAUPTGRUPPEN[section][side];
  const hauptgruppen = digits.split('').filter((d) => d !== '5' && d !== '6');
  if (digits.includes('5')) hauptgruppen.push(HAUPTGRUPPE_5_6);
  const combined = digits.includes('9') ? `|${BAUMASSNAHMEN}` : '';
  return `^(?:${hauptgruppen.join('|')}|[${digits}][0-9]{1,2}${combined})$`;
}

export function isKnownCode(code: string): boolean {
  return code in MASTER;
}

const CHILDREN = new Map<string, string[]>();
for (const [code, entry] of Object.entries(MASTER)) {
  if (entry.parent) CHILDREN.set(entry.parent, [...(CHILDREN.get(entry.parent) ?? []), code].toSorted());
}

/** Codes listed directly below `code` in the Gruppierungsplan. */
export function listedChildren(code: string): readonly string[] {
  return CHILDREN.get(code) ?? [];
}

const LEVEL_NAME = ['', 'Hauptgruppe', 'Gruppe', 'Untergruppe'];

export function codeTitle(code: string): string {
  return MASTER[code]?.title ?? `${LEVEL_NAME[codeLevel(code)]} ${code}`;
}

// Untergruppen like "vom Land" or "Beamte" only make sense below their group heading.
const NEEDS_CONTEXT =
  /^[a-zäöü]|^(Beamte|Tariflich Beschäftigte|Sonstige|Innere Verrechnungen|Innere Darlehen|Einkommensteuer|Umsatzsteuer|Anteilsrechte|Investmentzertifikate|Sonstige (Einnahmen|Ausgaben)|Bewegliche Sachen)$/;

/** Title that is understandable without the surrounding tree (chart legends, CSV). */
export function standaloneTitle(code: string): string {
  const title = codeTitle(code);
  const parent = parentCode(code);
  if (codeLevel(code) === 3 && parent && (NEEDS_CONTEXT.test(title) || !isKnownCode(code))) {
    return `${codeTitle(parent)}: ${title}`;
  }
  return title;
}
