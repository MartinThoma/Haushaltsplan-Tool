#!/usr/bin/env python3
"""Import a Bavarian kameral budget from its "Einzelpläne" PDFs into public/data.

The PDFs list every Haushaltsstelle (".4100 Beamtenbezüge ...") per Unterabschnitt with seven
columns: Ansatz of the plan year and of the previous year, the results (Rechnungsergebnis) of the
two previous years and three Finanzplan years. The script

1. extracts the text with `pdftotext -layout` (poppler-utils),
2. parses all Haushaltsstellen, including sub-accounts ("-10 ..."),
3. checks the parsed lines against every printed Unterabschnitt subtotal and aborts on mismatch,
4. sums them by Gruppierung (first three digits; Untergruppen the Gruppierungsplan does not list
   are added to their Gruppe), and
5. writes one dataset per selected column and updates kommunen.json.

Example:
    python3 scripts/import_einzelplan.py \\
        --vwh import/Polling/EntwurfVerwaltungshaushalt2026.pdf \\
        --vmh import/Polling/EntwurfVermögenshaushalt2026.pdf \\
        --kommune Polling --ags 09190142 --plz 82398 82380 \\
        --einwohner 2026=3635 2025=3633 2024=3605 --einwohner-stichtag vorjahr \\
        --status-plan Entwurf --quelle "Haushaltsplan-Entwurf 2026 der Gemeinde Polling"
"""

import argparse
import re
import sys
from collections import defaultdict

from budget_import import NUMBER, add_common_arguments, pdf_lines, to_number, write_datasets

# Column order of the Einzelpläne: plan year Y, then Y-1, Y-1, Y-2, Y+1, Y+2, Y+3.
COLUMNS = ['ansatz', 'ansatz_vorjahr', 'ergebnis_vorjahr', 'ergebnis_vorvorjahr', 'fp1', 'fp2', 'fp3']


def split_numbers(text):
    """Return (description, [7 values]) if the text ends in the seven value columns."""
    text = re.sub(r'\s+DK\s*\d+\s*$', '', text.rstrip())
    parts = re.split(r'\s{2,}', text.strip())
    if len(parts) >= 7 and all(NUMBER.match(p) for p in parts[-7:]):
        return ' '.join(parts[:-7]), [to_number(p) for p in parts[-7:]]
    return text.strip(), None


def parse(lines):
    """Parse Haushaltsstellen, the printed Unterabschnitt subtotals and the plan year."""
    items, subtotals, year = [], {}, None
    uab = hhst = None
    pending = {}
    for lineno, line in enumerate(lines, 1):
        if year is None and (m := re.match(r'^\s+((?:20\d\d\s+){6}20\d\d)\s*$', line)):
            year = int(m.group(1).split()[0])
        if m := re.match(r'^U-Abschnitt\s+(\d{4})\b', line):
            if m.group(1) != uab:
                uab, hhst, pending = m.group(1), None, {}
        elif m := re.match(r'^\s*\.(\d{4})(?:\s(.*))?$', line):
            hhst = m.group(1)
            desc, values = split_numbers(m.group(2) or '')
            if values:
                items.append({'uab': uab, 'hhst': hhst, 'desc': desc, 'values': values, 'line': lineno})
        elif (m := re.match(r'^\s+-(\d{2})\s(.*)$', line)) and hhst:
            desc, values = split_numbers(m.group(2))
            if values:
                items.append({'uab': uab, 'hhst': hhst, 'desc': desc, 'values': values, 'line': lineno})
        elif m := re.match(r'^\s+(Einnahmen|Ausgaben)\s{2,}(.*)$', line):
            _, values = split_numbers(m.group(2))
            if values:
                pending[m.group(1)] = values
        elif m := re.match(r'^\s+UAB\s+(\d{4})\s+Zu-/', line):
            subtotals[m.group(1)] = pending
            pending = {}
        elif re.match(r'^\s+(AB\s+\d{2}|EP\s+\d)\s+Zu-/', line):
            pending = {}
    return items, subtotals, year


def side_of(hhst):
    return 'Einnahmen' if hhst[0] in '0123' else 'Ausgaben'


def check_subtotals(items, subtotals, label):
    sums = defaultdict(lambda: defaultdict(lambda: [0.0] * 7))
    for item in items:
        target = sums[item['uab']][side_of(item['hhst'])]
        for i, value in enumerate(item['values']):
            target[i] += value
    problems = []
    for uab in sorted(set(sums) | set(subtotals)):
        for side in ('Einnahmen', 'Ausgaben'):
            printed = subtotals.get(uab, {}).get(side, [0.0] * 7)
            for column, expected, got in zip(COLUMNS, printed, sums[uab][side], strict=True):
                if abs(expected - got) > 0.005:
                    problems.append(f'{label} UAB {uab} {side} {column}: PDF {expected:,.2f}, gelesen {got:,.2f}')
    return problems


def column_entries(items, column):
    """(Gruppierung, value) pairs of one column, as the datasets book them."""
    return [(item['hhst'][:3], item['values'][COLUMNS.index(column)]) for item in items]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--vwh', required=True, help='PDF mit den Einzelplänen des Verwaltungshaushalts')
    parser.add_argument('--vmh', required=True, help='PDF mit den Einzelplänen des Vermögenshaushalts')
    add_common_arguments(parser, COLUMNS[:4])
    args = parser.parse_args()

    vwh_items, vwh_subtotals, year = parse(pdf_lines(args.vwh))
    vmh_items, vmh_subtotals, vmh_year = parse(pdf_lines(args.vmh))
    if year is None or year != vmh_year:
        raise SystemExit(f'Haushaltsjahr nicht eindeutig erkannt (VwH {year}, VmH {vmh_year})')
    problems = check_subtotals(vwh_items, vwh_subtotals, 'VwH') + check_subtotals(vmh_items, vmh_subtotals, 'VmH')
    if problems:
        raise SystemExit('Abweichungen von den gedruckten Zwischensummen:\n  ' + '\n  '.join(problems))
    print(
        f'{len(vwh_items)} + {len(vmh_items)} Haushaltsstellen gelesen, alle '
        f'{len(vwh_subtotals) + len(vmh_subtotals)} Unterabschnitts-Summen stimmen.'
    )

    entries = {column: column_entries(vwh_items + vmh_items, column) for column in args.spalten}
    write_datasets(
        args,
        year,
        entries,
        'Aus den Einzelplänen nach Gruppierung summiert; Untergruppen, die der Gruppierungsplan '
        'nicht kennt, sind ihrer Gruppe zugerechnet.',
    )


if __name__ == '__main__':
    sys.exit(main())
