"""Shared helpers for the PDF importers: number parsing, mapping to the Gruppierungsplan,
writing datasets and keeping kommunen.json in sync."""

import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'public' / 'data'
MASTER = json.loads((ROOT / 'src' / 'data' / 'master-groupings.json').read_text(encoding='utf-8'))

NUMBER = re.compile(r'^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$')

# Budget documents print the plan year Y next to earlier years; a column's year is Y minus the offset.
COLUMN_OFFSET = {'ansatz': 0, 'ansatz_vorjahr': 1, 'ergebnis': 0, 'ergebnis_vorjahr': 1, 'ergebnis_vorvorjahr': 2}
COLUMN_LABEL = {
    'ansatz': 'Ansatz',
    'ansatz_vorjahr': 'Ansatz',
    'ergebnis': 'Rechnungsergebnis',
    'ergebnis_vorjahr': 'Rechnungsergebnis',
    'ergebnis_vorvorjahr': 'Rechnungsergebnis',
}
COLUMN_STATUS = {'ergebnis': 'Ergebnis', 'ergebnis_vorjahr': 'Ergebnis', 'ergebnis_vorvorjahr': 'Ergebnis'}
SECTIONS = (('vwh', '012', '45678'), ('vmh', '3', '9'))
LANDS = ['SH', 'HH', 'NI', 'HB', 'NW', 'HE', 'RP', 'BW', 'BY', 'SL', 'BE', 'BB', 'MV', 'SN', 'ST', 'TH']


def to_number(text):
    return float(text.replace('.', '').replace(',', '.'))


def pdf_lines(path):
    result = subprocess.run(['pdftotext', '-layout', str(path), '-'], capture_output=True, text=True, check=True)
    return result.stdout.splitlines()


def parse_einwohner(pairs):
    result = {}
    for pair in pairs:
        year, count = pair.split('=')
        result[int(year)] = int(count)
    return result


def add_common_arguments(parser, spalten):
    parser.add_argument('--kommune', required=True)
    parser.add_argument('--ags', required=True)
    parser.add_argument('--plz', nargs='*', default=[])
    parser.add_argument('--einwohner', nargs='+', required=True, metavar='JAHR=ANZAHL')
    parser.add_argument('--einwohner-stichtag', choices=['vorjahr'], help='"vorjahr": 31.12. des Vorjahres')
    parser.add_argument('--status-plan', default='Ansatz', choices=['Entwurf', 'Ansatz', 'Nachtrag'])
    parser.add_argument(
        '--status-vorjahr',
        default='Ansatz',
        choices=['Ansatz', 'Nachtrag'],
        help='Status der Spalte "Ansatz Vorjahr", z. B. Nachtrag, wenn sie den Nachtragshaushalt zeigt',
    )
    parser.add_argument(
        '--spalten',
        nargs='+',
        default=['ansatz', 'ansatz_vorjahr', 'ergebnis_vorvorjahr'],
        choices=spalten,
        help='zu importierende Spalten',
    )
    parser.add_argument('--quelle', required=True)
    parser.add_argument('--force', action='store_true', help='vorhandene Datensätze überschreiben')


def amounts_by_code(entries):
    """
    Sum (code, value) pairs by the codes the dataset uses: Untergruppen listed in the
    Gruppierungsplan stay, anything else is added to its Gruppe. Returns
    ({code: amount}, {gruppe: label for the part not covered by listed Untergruppen}).
    """
    listed = defaultdict(float)
    free = defaultdict(float)
    free_codes = defaultdict(set)
    for code, value in entries:
        if len(code) == 3 and code in MASTER:
            listed[code] += value
        elif len(code) == 3:
            free[code[:2]] += value
            if value:
                free_codes[code[:2]].add(code)
        else:
            free[code] += value

    amounts, labels = {}, {}
    for code, value in listed.items():
        if round(value, 2):
            amounts[code] = round(value, 2)
    for group, value in free.items():
        if not round(value, 2):
            continue
        children = sum(v for c, v in amounts.items() if len(c) == 3 and c[:2] == group)
        if children:
            # The Gruppe has listed Untergruppen too: state the total, the free part shows as remainder.
            amounts[group] = round(value + children, 2)
            labels[group] = f'weitere Untergruppen der Kommune ({", ".join(sorted(free_codes[group]))})'
        else:
            amounts[group] = round(value, 2)
    return dict(sorted(amounts.items())), labels


def build_betraege(entries):
    """
    The `betraege` and `nicht_aufgeschluesselt` parts of a dataset from (code, value) pairs across
    both sections, as written by write_datasets.
    """
    unexpected = [code for code, _ in entries if code[0] not in '0123456789']
    if unexpected:
        raise SystemExit(f'Unerwartete Gruppierungsziffer {unexpected[0]}')
    betraege, labels = {}, {}
    for section, income, expense in SECTIONS:
        einnahmen, labels_e = amounts_by_code([(c, v) for c, v in entries if c[0] in income])
        ausgaben, labels_a = amounts_by_code([(c, v) for c, v in entries if c[0] in expense])
        betraege[section] = {'einnahmen': einnahmen, 'ausgaben': ausgaben}
        if labels_e or labels_a:
            labels[section] = {k: v for k, v in (('einnahmen', labels_e), ('ausgaben', labels_a)) if v}
    return betraege, labels


def write_datasets(args, year, entries_by_column, hinweis, columns=None):
    """
    Write one dataset per selected column. `entries_by_column` maps a column name to its
    (code, value) pairs across both sections. Existing key figures are kept. Layouts whose
    columns name their year themselves pass `columns`: column -> {'jahr', 'status', 'label'}
    and optionally an additional 'hinweis'.
    """
    einwohner = parse_einwohner(args.einwohner)
    written = []
    for column in args.spalten:
        if columns:
            info = columns[column]
            jahr, status, label = info['jahr'], info['status'], info['label']
            note = f'{hinweis} {info["hinweis"]}' if info.get('hinweis') else hinweis
        else:
            jahr = year - COLUMN_OFFSET[column]
            status = {'ansatz': args.status_plan, 'ansatz_vorjahr': args.status_vorjahr, **COLUMN_STATUS}[column]
            label, note = COLUMN_LABEL[column], hinweis
        if jahr not in einwohner:
            raise SystemExit(f'Einwohnerzahl für {jahr} fehlt (--einwohner {jahr}=...)')
        target = DATA_DIR / f'{args.ags}_{jahr}.json'
        if target.exists() and not args.force:
            raise SystemExit(f'{target.name} existiert bereits (--force zum Überschreiben)')

        betraege, labels = build_betraege(entries_by_column[column])
        metadata = {
            'kommune': args.kommune,
            'ags': args.ags,
            'jahr': jahr,
            'einwohner': einwohner[jahr],
            **({'einwohner_stichtag': f'{jahr - 1}-12-31'} if args.einwohner_stichtag == 'vorjahr' else {}),
            'status': status,
            'waehrung': 'EUR',
            'quelle': f'{args.quelle}, Spalte „{label} {jahr}“',
            'hinweis': note,
        }
        dataset = {'$schema': './schema/budget-schema.json', 'metadata': metadata}
        if target.exists():
            # Key figures (Hebesätze, Schuldenstand, …) come from other sources; keep them.
            previous = json.loads(target.read_text(encoding='utf-8'))
            if 'kennzahlen' in previous:
                dataset['kennzahlen'] = previous['kennzahlen']
        dataset['betraege'] = betraege
        if labels:
            dataset['nicht_aufgeschluesselt'] = labels
        target.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        written.append((jahr, einwohner[jahr], target.name))
        print(f'{target.relative_to(ROOT)}: {status} {jahr}')

    update_kommunen(args, written)


def update_kommunen(args, written):
    path = DATA_DIR / 'kommunen.json'
    kommunen = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    entry = next((k for k in kommunen if k['ags'] == args.ags), None)
    if entry is None:
        entry = {
            'ags': args.ags,
            'name': args.kommune,
            'plz': args.plz,
            'bundesland': LANDS[int(args.ags[:2]) - 1],
            'jahre': [],
        }
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
