const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const signedEuro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const compactEuro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const integer = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const share = new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const points = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

export const DASH = '–';

/** 1250000 → "1.250.000,00 €" */
export function formatEuro(value: number | null | undefined): string {
  return value == null ? DASH : euro.format(value);
}

export function formatSignedEuro(value: number | null | undefined): string {
  return value == null ? DASH : signedEuro.format(value);
}

/** 1250000 → "1,3 Mio. €" */
export function formatCompactEuro(value: number | null | undefined): string {
  return value == null ? DASH : compactEuro.format(value);
}

/** 0.123 → "+12,3 %" */
export function formatPercent(ratio: number | null | undefined): string {
  return ratio == null ? DASH : percent.format(ratio);
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

/** 0.271 → "27,1 %" */
export function formatShare(ratio: number | null | undefined): string {
  return ratio == null ? DASH : share.format(ratio);
}

/** Difference of two percentages: 35 → "+35 Pkt." */
export function formatPoints(value: number | null | undefined): string {
  return value == null ? DASH : `${points.format(value)} Pkt.`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

/** Plain German decimal for CSV cells: 1250000.5 → "1250000,50" */
export function csvNumber(value: number | null | undefined): string {
  return value == null ? '' : value.toFixed(2).replace('.', ',');
}
