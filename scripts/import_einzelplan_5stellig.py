#!/usr/bin/env python3
"""Import a Bavarian kameral budget from Einzelpläne with five-digit Haushaltsstellen.

In this layout every line starts with the five-digit Gruppierung ("41400 Entgelte Beschäftigte"),
followed by the Ansatz of the plan year, the Ansatz of the previous year and the result two years
back, then administrative columns. Each block of income or expense lines ends with an
"Einnahmen" or "Ausgaben" subtotal. The script

1. extracts the text with `pdftotext -layout` (poppler-utils),
2. reads all Haushaltsstellen of the Verwaltungs- and Vermögenshaushalt PDFs,
3. checks every block against its printed subtotal and aborts on mismatch,
4. sums by Gruppierung (first three digits; Untergruppen the Gruppierungsplan does not list are
   added to their Gruppe) and writes one dataset per selected column.

Example:
    python3 scripts/import_einzelplan_5stellig.py \\
        --vwh "import/Haar/2026_03_2_Verwaltungshaushalt_2026_-_Einzelplan.pdf" \\
        --vmh "import/Haar/2026_04_3_Vermögenshaushalt_2026_-_Einzelplan.pdf" \\
        --kommune Haar --ags 09184123 --plz 85540 \\
        --einwohner 2026=22934 2025=22878 2024=22483 --einwohner-stichtag vorjahr \\
        --quelle "Haushaltsplan 2026 der Stadt Haar, Einzelpläne"
"""

import argparse
import re
import sys

from budget_import import add_common_arguments, pdf_lines, to_number, write_datasets

COLUMNS = ['ansatz', 'ansatz_vorjahr', 'ergebnis_vorvorjahr']
AMOUNT = r'-?\d{1,3}(?:\.\d{3})*'
YEAR = re.compile(r'^\s+(20\d\d)\s+(?:VE\s+)?(20\d\d)\s+(20\d\d)\b')


def amounts_pattern(count):
    """`count` whole-euro amounts followed by the result with cents, which anchors the match."""
    whole = r'\s+'.join([f'({AMOUNT})'] * count)
    return rf'{whole}\s+({AMOUNT},\d{{2}})(?:\s|$)'


def patterns(with_ve):
    """
    Line patterns for one section. The Vermögenshaushalt prints the Verpflichtungsermächtigung
    between the two Ansätze on expense lines. Returns ({side: (item, subtotal)}, value indices).
    """
    layouts = {'Einnahmen': 2, 'Ausgaben': 3 if with_ve else 2}
    return {
        side: (
            re.compile(rf'^\s*(\d{{5}})\s*\*?\s+(.*?)\s+{amounts_pattern(n)}'),
            re.compile(rf'^\s*{side}\s+{amounts_pattern(n)}'),
            [0, n - 1, n],  # Ansatz, Ansatz Vorjahr, Ergebnis among the captured amounts
        )
        for side, n in layouts.items()
    }


def parse(lines, label, with_ve):
    """Return (year, items, problems); items are (code, [3 values], lineno)."""
    year, items, problems = None, [], []
    layouts = patterns(with_ve)
    pending = {'Einnahmen': [], 'Ausgaben': []}
    for lineno, line in enumerate(lines, 1):
        if year is None and (m := YEAR.match(line)):
            year = int(m.group(1))
        code = re.match(r'^\s*(\d{5})\b', line)
        if code:
            side = 'Einnahmen' if code.group(1)[0] in '0123' else 'Ausgaben'
            item, _, indices = layouts[side]
            if m := item.match(line):
                amounts = m.groups()[2:]
                values = [to_number(amounts[i]) for i in indices]
                items.append((m.group(1), values, lineno))
                pending[side].append(values)
            continue
        for side, (_, subtotal, indices) in layouts.items():
            if not (m := subtotal.match(line)):
                continue
            if pending[side]:  # otherwise a repeated sum of the Unterabschnitt, Abschnitt or Einzelplan
                printed = [to_number(m.groups()[i]) for i in indices]
                sums = [sum(v[i] for v in pending[side]) for i in range(3)]
                for column, expected, got in zip(COLUMNS, printed, sums):
                    if abs(expected - got) > 0.005:
                        problems.append(f'{label} Zeile {lineno} {side} {column}: PDF {expected:,.2f}, gelesen {got:,.2f}')
                pending[side] = []
    for side, rest in pending.items():
        if rest:
            problems.append(f'{label}: {len(rest)} {side}-Zeilen ohne abschließende Summe')
    return year, items, problems


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--vwh', required=True, help='PDF mit den Einzelplänen des Verwaltungshaushalts')
    parser.add_argument('--vmh', required=True, help='PDF mit den Einzelplänen des Vermögenshaushalts')
    parser.add_argument('--nur-pruefen', action='store_true', help='nur lesen und prüfen, nichts schreiben')
    add_common_arguments(parser, COLUMNS)
    args = parser.parse_args()

    year, vwh_items, vwh_problems = parse(pdf_lines(args.vwh), 'VwH', with_ve=False)
    vmh_year, vmh_items, vmh_problems = parse(pdf_lines(args.vmh), 'VmH', with_ve=True)
    if year is None or year != vmh_year:
        raise SystemExit(f'Haushaltsjahr nicht eindeutig erkannt (VwH {year}, VmH {vmh_year})')
    misplaced = [f'VwH .{c} (Zeile {n})' for c, _, n in vwh_items if c[0] in '39'] + [
        f'VmH .{c} (Zeile {n})' for c, _, n in vmh_items if c[0] not in '39'
    ]
    problems = vwh_problems + vmh_problems + [f'Haushaltsstelle im falschen Haushalt: {m}' for m in misplaced]
    if problems:
        raise SystemExit('Abweichungen:\n  ' + '\n  '.join(problems))
    print(f'Haushaltsjahr {year}: {len(vwh_items)} + {len(vmh_items)} Haushaltsstellen gelesen, alle Blocksummen stimmen.')
    for name, items in (('VwH', vwh_items), ('VmH', vmh_items)):
        for i, column in enumerate(COLUMNS):
            e = sum(v[i] for c, v, _ in items if c[0] in '0123')
            a = sum(v[i] for c, v, _ in items if c[0] not in '0123')
            print(f'  {name} {column}: Einnahmen {e:,.2f}  Ausgaben {a:,.2f}')
    if args.nur_pruefen:
        return

    entries = {
        column: [(code[:3], values[COLUMNS.index(column)]) for code, values, _ in vwh_items + vmh_items]
        for column in args.spalten
    }
    write_datasets(
        args,
        year,
        entries,
        'Aus den Einzelplänen nach Gruppierung summiert; Untergruppen, die der Gruppierungsplan '
        'nicht kennt, sind ihrer Gruppe zugerechnet.',
    )


if __name__ == '__main__':
    sys.exit(main())
