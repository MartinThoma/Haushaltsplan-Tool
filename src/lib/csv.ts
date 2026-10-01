const SEPARATOR = ';';

function escapeCell(cell: string): string {
  return /[";\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * Semicolon-separated with German decimal commas and a UTF-8 BOM, which is what
 * Excel and LibreOffice expect in a German locale.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return '﻿' + rows.map((row) => row.map(escapeCell).join(SEPARATOR)).join('\r\n') + '\r\n';
}

export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
