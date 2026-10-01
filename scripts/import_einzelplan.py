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
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'public' / 'data'
MASTER = json.loads((ROOT / 'src' / 'data' / 'master-groupings.json').read_text(encoding='utf-8'))

NUMBER = re.compile(r'^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$')
# Column order of the Einzelpläne: plan year Y, then Y-1, Y-1, Y-2, Y+1, Y+2, Y+3.
COLUMNS = ['ansatz', 'ansatz_vorjahr', 'ergebnis_vorjahr', 'ergebnis_vorvorjahr', 'fp1', 'fp2', 'fp3']


def to_number(text):
    return float(text.replace('.', '').replace(',', '.'))


def split_numbers(text):
    """Return (description, [7 values]) if the text ends in the seven value columns."""
    text = re.sub(r'\s+DK\s*\d+\s*$', '', text.rstrip())
    parts = re.split(r'\s{2,}', text.strip())
    if len(parts) >= 7 and all(NUMBER.match(p) for p in parts[-7:]):
        return ' '.join(parts[:-7]), [to_number(p) for p in parts[-7:]]
    return text.strip(), None


def pdf_lines(path):
    result = subprocess.run(['pdftotext', '-layout', str(path), '-'], capture_output=True, text=True, check=True)
    return result.stdout.splitlines()


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
            for column, expected, got in zip(COLUMNS, printed, sums[uab][side]):
                if abs(expected - got) > 0.005:
                    problems.append(f'{label} UAB {uab} {side} {column}: PDF {expected:,.2f}, gelesen {got:,.2f}')
    return problems


def standard_code(hhst):
    """Untergruppe if the Gruppierungsplan lists it, else its Gruppe."""
    return hhst[:3] if hhst[:3] in MASTER else hhst[:2]


def to_dataset_amounts(items, column, allowed):
    """Sum one column by standard code. Returns ({code: amount}, {gruppe: label for free part})."""
    index = COLUMNS.index(column)
    listed = defaultdict(float)
    free = defaultdict(float)
    free_codes = defaultdict(set)
    for item in items:
        if item['hhst'][0] not in allowed:
            raise SystemExit(f"Zeile {item['line']}: Haushaltsstelle .{item['hhst']} gehört nicht in diesen Haushalt")
        code = standard_code(item['hhst'])
        if len(code) == 3:
            listed[code] += item['values'][index]
        else:
            free[code] += item['values'][index]
            if item['hhst'][:3] not in MASTER and item['values'][index]:
                free_codes[code].add(item['hhst'][:3])

    amounts, labels = {}, {}
    for code, value in listed.items():
        if round(value, 2):
            amounts[code] = round(value, 2)
    for group, value in free.items():
        children = sum(v for c, v in amounts.items() if c[:2] == group)
        if not round(value, 2):
            continue
        if children:
            # The Gruppe has listed Untergruppen too: state the total, the free part shows as remainder.
            amounts[group] = round(value + children, 2)
            labels[group] = f"weitere Untergruppen der Kommune ({', '.join(sorted(free_codes[group]))})"
        else:
            amounts[group] = round(value, 2)
    return dict(sorted(amounts.items())), labels


def parse_einwohner(pairs):
    result = {}
    for pair in pairs:
        year, count = pair.split('=')
        result[int(year)] = int(count)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--vwh', required=True, help='PDF mit den Einzelplänen des Verwaltungshaushalts')
    parser.add_argument('--vmh', required=True, help='PDF mit den Einzelplänen des Vermögenshaushalts')
    parser.add_argument('--kommune', required=True)
    parser.add_argument('--ags', required=True)
    parser.add_argument('--plz', nargs='*', default=[])
    parser.add_argument('--einwohner', nargs='+', required=True, metavar='JAHR=ANZAHL')
    parser.add_argument('--einwohner-stichtag', choices=['vorjahr'], help='"vorjahr": 31.12. des Vorjahres')
    parser.add_argument('--status-plan', default='Ansatz', choices=['Entwurf', 'Ansatz', 'Nachtrag'])
    parser.add_argument('--spalten', nargs='+', default=['ansatz', 'ansatz_vorjahr', 'ergebnis_vorvorjahr'],
                        choices=COLUMNS[:4], help='zu importierende Spalten')
    parser.add_argument('--quelle', required=True)
    parser.add_argument('--force', action='store_true', help='vorhandene Datensätze überschreiben')
    args = parser.parse_args()

    vwh_items, vwh_subtotals, year = parse(pdf_lines(args.vwh))
    vmh_items, vmh_subtotals, vmh_year = parse(pdf_lines(args.vmh))
    if year is None or year != vmh_year:
        raise SystemExit(f'Haushaltsjahr nicht eindeutig erkannt (VwH {year}, VmH {vmh_year})')
    problems = check_subtotals(vwh_items, vwh_subtotals, 'VwH') + check_subtotals(vmh_items, vmh_subtotals, 'VmH')
    if problems:
        raise SystemExit('Abweichungen von den gedruckten Zwischensummen:\n  ' + '\n  '.join(problems))
    print(f'{len(vwh_items)} + {len(vmh_items)} Haushaltsstellen gelesen, alle '
          f'{len(vwh_subtotals) + len(vmh_subtotals)} Unterabschnitts-Summen stimmen.')

    einwohner = parse_einwohner(args.einwohner)
    column_year = {'ansatz': year, 'ansatz_vorjahr': year - 1, 'ergebnis_vorjahr': year - 1,
                   'ergebnis_vorvorjahr': year - 2}
    column_label = {'ansatz': f'Ansatz {year}', 'ansatz_vorjahr': f'Ansatz {year - 1}',
                    'ergebnis_vorjahr': f'Rechnungsergebnis {year - 1}',
                    'ergebnis_vorvorjahr': f'Rechnungsergebnis {year - 2}'}
    status = {'ansatz': args.status_plan, 'ansatz_vorjahr': 'Ansatz', 'ergebnis_vorjahr': 'Ergebnis',
              'ergebnis_vorvorjahr': 'Ergebnis'}

    written = []
    for column in args.spalten:
        jahr = column_year[column]
        if jahr not in einwohner:
            raise SystemExit(f'Einwohnerzahl für {jahr} fehlt (--einwohner {jahr}=...)')
        target = DATA_DIR / f'{args.ags}_{jahr}.json'
        if target.exists() and not args.force:
            raise SystemExit(f'{target.name} existiert bereits (--force zum Überschreiben)')
        betraege, labels = {}, {}
        for section, items, digits in (('vwh', vwh_items, ('012', '45678')), ('vmh', vmh_items, ('3', '9'))):
            einnahmen, labels_e = to_dataset_amounts([i for i in items if i['hhst'][0] in digits[0]], column, digits[0])
            ausgaben, labels_a = to_dataset_amounts([i for i in items if i['hhst'][0] in digits[1]], column, digits[1])
            unexpected = [i for i in items if i['hhst'][0] not in digits[0] + digits[1]]
            if unexpected:
                raise SystemExit(f"Haushaltsstelle .{unexpected[0]['hhst']} gehört nicht in den {section.upper()}")
            betraege[section] = {'einnahmen': einnahmen, 'ausgaben': ausgaben}
            if labels_e or labels_a:
                labels[section] = {k: v for k, v in (('einnahmen', labels_e), ('ausgaben', labels_a)) if v}
        metadata = {
            'kommune': args.kommune,
            'ags': args.ags,
            'jahr': jahr,
            'einwohner': einwohner[jahr],
            **({'einwohner_stichtag': f'{jahr - 1}-12-31'} if args.einwohner_stichtag == 'vorjahr' else {}),
            'status': status[column],
            'waehrung': 'EUR',
            'quelle': f'{args.quelle}, Spalte „{column_label[column]}“',
            'hinweis': 'Aus den Einzelplänen nach Gruppierung summiert; Untergruppen, die der Gruppierungsplan '
                       'nicht kennt, sind ihrer Gruppe zugerechnet.',
        }
        dataset = {'$schema': './schema/budget-schema.json', 'metadata': metadata}
        if target.exists():
            # Key figures (Hebesätze, Schuldenstand, …) do not come from the Einzelpläne; keep them.
            previous = json.loads(target.read_text(encoding='utf-8'))
            if 'kennzahlen' in previous:
                dataset['kennzahlen'] = previous['kennzahlen']
        dataset['betraege'] = betraege
        if labels:
            dataset['nicht_aufgeschluesselt'] = labels
        target.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        written.append((jahr, einwohner[jahr], target.name))
        print(f'{target.relative_to(ROOT)}: {metadata["status"]} {jahr}')

    update_kommunen(args, written)


def update_kommunen(args, written):
    path = DATA_DIR / 'kommunen.json'
    kommunen = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    entry = next((k for k in kommunen if k['ags'] == args.ags), None)
    if entry is None:
        lands = ['SH', 'HH', 'NI', 'HB', 'NW', 'HE', 'RP', 'BW', 'BY', 'SL', 'BE', 'BB', 'MV', 'SN', 'ST', 'TH']
        entry = {'ags': args.ags, 'name': args.kommune, 'plz': args.plz,
                 'bundesland': lands[int(args.ags[:2]) - 1], 'jahre': []}
        kommunen.append(entry)
    elif args.plz:
        entry['plz'] = args.plz
    years = {j['jahr']: j for j in entry['jahre']}
    for jahr, count, file in written:
        years[jahr] = {'jahr': jahr, 'einwohner': count, 'file': file}
    entry['jahre'] = [years[y] for y in sorted(years)]
    kommunen.sort(key=lambda k: k['name'])
    path.write_text(json.dumps(kommunen, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{path.relative_to(ROOT)} aktualisiert ({args.kommune}: {", ".join(str(y) for y in sorted(years))})')


if __name__ == '__main__':
    sys.exit(main())
