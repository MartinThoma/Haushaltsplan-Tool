export type Unit = 'absolute' | 'perCapita';

export function toUnit(value: number | null, einwohner: number, unit: Unit): number | null {
  if (value == null) return null;
  return unit === 'perCapita' ? value / einwohner : value;
}

export interface Delta {
  /** B − A; a missing entry counts as 0 €. */
  absolute: number | null;
  /** (B − A) / |A|; null when A is 0 or missing. */
  relative: number | null;
}

export function delta(a: number | null, b: number | null): Delta {
  if (a == null && b == null) return { absolute: null, relative: null };
  const av = a ?? 0;
  const bv = b ?? 0;
  return { absolute: bv - av, relative: av !== 0 ? (bv - av) / Math.abs(av) : null };
}

export type Significance = 'none' | 'notable' | 'strong' | 'onlyA' | 'onlyB';

/** FR-2.3: classify a deviation; "strong" starts at twice the chosen threshold. */
export function significance(a: number | null, b: number | null, threshold: number): Significance {
  const av = a ?? 0;
  const bv = b ?? 0;
  if (av === 0 && bv === 0) return 'none';
  if (bv === 0) return 'onlyA';
  if (av === 0) return 'onlyB';
  const magnitude = Math.abs((bv - av) / Math.abs(av));
  if (magnitude >= 2 * threshold) return 'strong';
  if (magnitude >= threshold) return 'notable';
  return 'none';
}
