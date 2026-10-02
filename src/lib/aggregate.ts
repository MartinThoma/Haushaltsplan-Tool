import { codeLevel, parentCode } from './master.ts';

export interface Aggregation {
  /** Value per code (1–3 digits), either stated in the dataset or summed from its children. */
  values: Map<string, number>;
  /** Codes whose stated total differs from the sum of their stated children. */
  mismatches: Map<string, { stated: number; computed: number }>;
}

const roundCents = (value: number) => Math.round(value * 100) / 100;

/**
 * Fills in Hauptgruppen and Gruppen totals bottom-up (FR-4.2). A total stated in the
 * dataset wins over the computed sum, but deviations are reported.
 */
export function aggregate(amounts: Record<string, number>): Aggregation {
  const codes = new Set<string>();
  for (const code of Object.keys(amounts)) {
    for (let c: string | null = code; c; c = parentCode(c)) codes.add(c);
  }

  const values = new Map<string, number>();
  const mismatches = new Map<string, { stated: number; computed: number }>();
  const childSums = new Map<string, number>();

  // Deepest codes first, so every child is final before its parent is visited.
  for (const code of [...codes].toSorted((a, b) => codeLevel(b) - codeLevel(a))) {
    const stated = amounts[code];
    const computed = childSums.has(code) ? roundCents(childSums.get(code)!) : undefined;
    if (stated !== undefined && computed !== undefined && Math.abs(stated - computed) >= 0.005) {
      mismatches.set(code, { stated, computed });
    }
    const value = stated ?? computed ?? 0;
    values.set(code, value);
    const parent = parentCode(code);
    if (parent) childSums.set(parent, (childSums.get(parent) ?? 0) + value);
  }

  return { values, mismatches };
}

/** Sum over the Hauptgruppen, i.e. the total of one budget side. */
export function sideTotal(aggregation: Aggregation): number | null {
  let total: number | null = null;
  for (const [code, value] of aggregation.values) {
    if (parentCode(code) === null) total = (total ?? 0) + value;
  }
  return total === null ? null : roundCents(total);
}
