#!/usr/bin/env python3
"""Import a Bavarian kameral budget from the "Gruppierungsübersicht" of its Haushaltsplan PDF.

The Gruppierungsübersicht (e.g. CIP-KOMMUNAL / GRUBAYH) lists every Gruppe and Untergruppe with
the Ansatz of the plan year, the Ansatz of the previous year and the Rechnungsergebnis two years
back, optionally with a per-resident column after the first value. The script

1. extracts the text with `pdftotext -layout` (poppler-utils),
2. reads the amounts of all Gruppen and Untergruppen between the first table header and
   the end of the list,
3. checks them against every printed ZWISCHENSUMME / SUMME / GESAMT line and aborts on mismatch,
4. writes one dataset per selected column and updates kommunen.json.

Example:
    python3 scripts/import_gruppierungsuebersicht.py import/Kirchheim/Haushalt-2026-aktualisiert_.pdf \\
        --kommune "Kirchheim b. München" --ags 09184131 --plz 85551 \\
        --einwohner 2026=13708 2025=13392 2024=12904 --einwohner-stichtag vorjahr \\
        --quelle "Haushaltsplan 2026 der Gemeinde Kirchheim b. München, Gruppierungsübersicht"
"""

import argparse
import re
import sys

from budget_import import NUMBER, add_common_arguments, pdf_lines, to_number, write_datasets

COLUMNS = ['ansatz', 'ansatz_vorjahr', 'ergebnis_vorvorjahr']
# A Gruppierungsziffer, a range of them ("866-869", "57-63", "0-2999") or a list ("081,092", "94,95,96").
CODE = re.compile(r'^(?:\d{1,3}(?:-\d{1,4})?|5/6|\d{2,3}(?:,\d{2,3})+)$')
# The plan's combined Gruppe "94, 95, 96 Baumaßnahmen".
BAUMASSNAHMEN = {'94,95,96': '94-96'}
END = 'Ende der Liste "Gruppierungsübersicht"'


def values_of(parts):
    """The amounts of a line (plan year, previous year, result), or None for a heading."""
    count = 0
    while count < len(parts) and NUMBER.match(parts[-1 - count]):
        count += 1
    if count == 4:  # with a per-resident column after the plan year
        numbers = [parts[-4], parts[-2], parts[-1]]
    elif count == 3:
        numbers = parts[-3:]
    else:
        return None
    return [to_number(n) for n in numbers]


def parse(lines):
    """Return (year, leaves, subtotals): leaves are (code, values, lineno), subtotals (spec, values, lineno)."""
    year = None
    leaves, subtotals = [], []
    inside = False
    for lineno, line in enumerate(lines, 1):
        if END in line:
            break
        if not inside:
            inside = 'Grupp.-Nr.' in line
        if not inside:
            continue
        if year is None and len(years := re.findall(r'\b(20\d\d)\b', line)) >= 3:
            year = int(years[0])
        parts = re.split(r'\s{2,}', line.strip())
        if not parts or not CODE.match(parts[0]):
            continue
        values = values_of(parts)
        if values is None:
            continue
        label = parts[1] if len(parts) > 1 else ''
        if re.match(r'(ZWISCHENSUMME|SUMME|GESAMT)', label):
            subtotals.append((parts[0], values, lineno))
        else:
            leaves.append((parts[0], values, lineno))
    return year, leaves, subtotals


def leaf_code(raw):
    """Ranges like "866-869" are booked on their first Untergruppe; 94,95,96 become "94-96"."""
    if raw in BAUMASSNAHMEN:
        return BAUMASSNAHMEN[raw]
    if ',' in raw:
        raise SystemExit(f'Unbekannte Sammelposition {raw}')
    return raw.split('-')[0]


def covered(spec, code):
    """Whether a leaf code belongs to a subtotal such as "00", "081,092", "5/6", "4" or "0-2999"."""
    if ',' in spec:
        return code in spec.split(',')
    if spec == '5/6':
        return code[0] in '56'
    if '-' in spec:
        first, last = spec.split('-')
        if last.endswith('999'):  # Hauptgruppen, e.g. 0-2999 or 4-8999
            return first <= code[0] <= last[0]
        width = len(last)  # e.g. 5-66 = Gruppen 50 to 66
        return first.ljust(width, '0') <= code[:width] <= last
    return code.startswith(spec)


def check(leaves, subtotals):
    problems = []
    for spec, printed, lineno in subtotals:
        sums = [0.0, 0.0, 0.0]
        for raw, values, _ in leaves:
            if covered(spec, leaf_code(raw)):
                sums = [s + v for s, v in zip(sums, values)]
        for column, expected, got in zip(COLUMNS, printed, sums):
            if abs(expected - got) > 0.005:
                problems.append(f'Zeile {lineno}, Summe {spec}, {column}: PDF {expected:,.2f}, gelesen {got:,.2f}')
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pdf', help='Haushaltsplan mit Gruppierungsübersicht')
    parser.add_argument('--nur-pruefen', action='store_true', help='nur lesen und prüfen, nichts schreiben')
    add_common_arguments(parser, COLUMNS)
    args = parser.parse_args()

    year, leaves, subtotals = parse(pdf_lines(args.pdf))
    if year is None or not leaves:
        raise SystemExit('Keine Gruppierungsübersicht gefunden')
    problems = check(leaves, subtotals)
    if problems:
        raise SystemExit('Abweichungen von den gedruckten Summen:\n  ' + '\n  '.join(problems))
    print(f'Haushaltsjahr {year}: {len(leaves)} Positionen gelesen, alle {len(subtotals)} gedruckten Summen stimmen.')
    if args.nur_pruefen:
        return

    entries = {
        column: [(leaf_code(raw), values[COLUMNS.index(column)]) for raw, values, _ in leaves]
        for column in args.spalten
    }
    write_datasets(
        args,
        year,
        entries,
        'Aus der Gruppierungsübersicht des Haushaltsplans; Untergruppen, die der Gruppierungsplan '
        'nicht kennt, sind ihrer Gruppe zugerechnet.',
    )


if __name__ == '__main__':
    sys.exit(main())
