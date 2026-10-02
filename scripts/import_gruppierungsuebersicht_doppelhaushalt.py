#!/usr/bin/env python3
"""Import a kameral Doppelhaushalt from its "3.3 Gruppierungsübersicht" (layout of the Stadt Augsburg).

The overview lists every Gruppierungsnummer with sub-account ("0611.01 Land - Finanzzuweisungen")
and five columns, each as amount and amount per resident: the Ansätze of the two plan years and of
the year before, and the results of the two years before that. The header names the columns
("Ansatz 2026 … Ergebnis 2022"). The script

1. extracts the text with `pdftotext -layout` (poppler-utils),
2. reads all lines of the overview up to "Summe Gesamtausgaben",
3. checks them against every printed Gruppe, Hauptgruppe and grand total and aborts on mismatch,
4. books each line on its Untergruppe (first three digits) and writes the selected years.

Example:
    python3 scripts/import_gruppierungsuebersicht_doppelhaushalt.py \\
        import/Augsburg/1_Haushaltssatzung_2025_2025_mit_Anlagen_Reindruck.pdf \\
        --jahre 2022 2023 2024 2025 2026 --status 2024=Nachtrag \\
        --kommune Augsburg --ags 09761000 --plz 86150 ... --einwohner 2022=296478 ... \\
        --einwohner-stichtag vorjahr --quelle "Haushaltsplan 2025/2026 der Stadt Augsburg, Gruppierungsübersicht"
"""

import argparse
import re
import sys

from budget_import import NUMBER, add_common_arguments, pdf_lines, to_number, write_datasets

START = re.compile(r'\b3\.3 Gruppierungsübersicht')
HEADER = re.compile(r'\b(Ansatz|Ergebnis) (20\d\d)\b')
ITEM = re.compile(r'^\s*(\d{4})\.(\d{2})\s')
SUBTOTAL = re.compile(r'^\s*(\d{1,2})\s+Summe\b')
TOTALS = {'Summe Gesamteinnahmen': '0-3', 'Summe Gesamtausgaben': '4-9'}
STATUS = {'Ansatz': 'Ansatz', 'Ergebnis': 'Ergebnis'}
LABEL = {'Ansatz': 'Ansatz', 'Ergebnis': 'Ergebnis'}


def trailing_values(line, count):
    """The amounts of a line with `count` columns of amount and amount per resident, or None."""
    tokens = line.split()
    if len(tokens) < 2 * count or not all(NUMBER.match(t) for t in tokens[-2 * count :]):
        return None
    return [to_number(t) for t in tokens[-2 * count :: 2]]


def parse(lines):
    """Return (columns, items, subtotals): columns are (label, year); items (number, values, lineno)."""
    columns, items, subtotals = None, [], []
    inside = False
    for lineno, line in enumerate(lines, 1):
        if not inside:
            inside = bool(START.search(line))
            continue
        if columns is None and len(found := HEADER.findall(line)) >= 3:
            columns = [(label, int(year)) for label, year in found]
            continue
        if columns is None:
            continue
        stripped = line.strip()
        total = next((spec for label, spec in TOTALS.items() if stripped.startswith(label)), None)
        values = trailing_values(line, len(columns))
        if values is None:
            continue
        if m := ITEM.match(line):
            items.append((m.group(1), values, lineno))
        elif m := SUBTOTAL.match(line):
            subtotals.append((m.group(1), values, lineno))
        elif total:
            subtotals.append((total, values, lineno))
            if total == '4-9':
                break
    return columns, items, subtotals


def covered(spec, number):
    if '-' in spec:
        first, last = spec.split('-')
        return first <= number[0] <= last
    return number.startswith(spec)


def check(columns, items, subtotals, known=()):
    """
    Mismatches between the printed sums and the lines. Sums in `known` are skipped: the PDF can
    contain sums that include positions it does not print (documented per dataset).
    """
    problems = []
    for spec, printed, lineno in subtotals:
        if spec in known:
            continue
        sums = [0.0] * len(columns)
        for number, values, _ in items:
            if covered(spec, number):
                sums = [s + v for s, v in zip(sums, values, strict=True)]
        for (label, year), expected, got in zip(columns, printed, sums, strict=True):
            if abs(expected - got) > 0.005:
                problems.append(
                    f'Zeile {lineno}, Summe {spec}, {label} {year}: PDF {expected:,.2f}, gelesen {got:,.2f}'
                )
    return problems


def column_entries(columns, items, column):
    """(Untergruppe, value) pairs of one column, e.g. column ('Ergebnis', 2023)."""
    index = columns.index(column)
    return [(number[:3], values[index]) for number, values, _ in items]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pdf', help='Haushaltsplan mit Gruppierungsübersicht')
    parser.add_argument('--jahre', nargs='+', type=int, help='zu importierende Jahre (Standard: alle Spalten)')
    parser.add_argument('--status', nargs='*', default=[], metavar='JAHR=STATUS', help='z. B. 2024=Nachtrag')
    parser.add_argument('--hinweis-jahr', nargs='*', default=[], metavar='JAHR=TEXT', help='zusätzlicher Hinweis')
    parser.add_argument(
        '--bekannte-abweichungen',
        nargs='*',
        default=[],
        metavar='SUMME',
        help='Summen, die nicht gedruckte Positionen enthalten (z. B. 65 6 4-9); im Hinweis erklären',
    )
    parser.add_argument('--nur-pruefen', action='store_true', help='nur lesen und prüfen, nichts schreiben')
    add_common_arguments(parser, None)
    args = parser.parse_args()

    columns, items, subtotals = parse(pdf_lines(args.pdf))
    if not columns or not items:
        raise SystemExit('Keine Gruppierungsübersicht gefunden')
    for problem in check(columns, items, [s for s in subtotals if s[0] in args.bekannte_abweichungen]):
        print(f'Bekannte Abweichung: {problem}')
    problems = check(columns, items, subtotals, known=set(args.bekannte_abweichungen))
    if problems:
        raise SystemExit('Abweichungen von den gedruckten Summen:\n  ' + '\n  '.join(problems))
    names = ', '.join(f'{label} {year}' for label, year in columns)
    print(f'{len(items)} Positionen gelesen ({names}), alle übrigen gedruckten Summen stimmen.')
    if args.nur_pruefen:
        return

    status = dict(pair.split('=', 1) for pair in args.status)
    extra = dict(pair.split('=', 1) for pair in args.hinweis_jahr)
    wanted = set(args.jahre or [year for _, year in columns])
    selected = [column for column in columns if column[1] in wanted]
    info = {
        f'{label} {year}': {
            'jahr': year,
            'status': status.get(str(year), STATUS[label]),
            'label': LABEL[label],
            'hinweis': extra.get(str(year)),
        }
        for label, year in selected
    }
    args.spalten = list(info)
    entries = {f'{label} {year}': column_entries(columns, items, (label, year)) for label, year in selected}
    write_datasets(
        args,
        None,
        entries,
        'Aus der Gruppierungsübersicht des Haushaltsplans (Doppelhaushalt); Untergruppen, die der '
        'Gruppierungsplan nicht kennt, sind ihrer Gruppe zugerechnet.',
        columns=info,
    )


if __name__ == '__main__':
    sys.exit(main())
