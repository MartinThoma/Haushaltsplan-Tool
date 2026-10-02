#!/usr/bin/env python3
"""Import the budget overview ("Haushaltsübersicht") of the Große Kreisstadt Deggendorf.

Deggendorf publishes no Haushaltsplan, only a one-page overview of the main kinds of income and
expenditure in thousand euros: the plans of the last two years and the results of the years
before. Rows that correspond to one Gruppierung are booked there; everything else stays "nicht
aufgeschlüsselt" below the section total. The totals of plan years can be given exactly from the
Haushaltssatzungen (--gesamt), otherwise the rounded totals of the overview are used.

Example:
    python3 scripts/import_uebersicht_deggendorf.py \\
        import/Deggendorf/HH-Internet-Ausg-Einn-Internetdarstellung-1-1.pdf \\
        --einwohner 2026=35166 2025=35044 ... --gesamt 2026=105852200,35268000 2025=103725400,23423400
"""

import argparse
import json
import re
import sys
from types import SimpleNamespace

from budget_import import DATA_DIR, build_betraege, parse_einwohner, pdf_lines, update_kommunen

KOMMUNE, AGS, PLZ = 'Deggendorf', '09271119', ['94469']
QUELLE = 'Stadt Deggendorf, Haushaltsübersicht 2018–2026 der Stadtkämmerei (Angaben in 1.000 €)'
HINWEIS = (
    'Aus der Haushaltsübersicht der Stadtkämmerei, in 1.000 € gerundet; der Haushaltsplan selbst ist nicht '
    'veröffentlicht. Zugeordnet sind Realsteuern, Gemeinschaftssteuern, Schlüsselzuweisungen, Personal- und '
    'Sachaufwand, Kreis- und Gewerbesteuerumlage, Zinsen, Zuführung, Beiträge, Investitionszuweisungen, '
    'Veräußerungen, Rücklagenentnahme, Baumaßnahmen, Grund- und Vermögenserwerb (Gruppe 93) und '
    'Investitionszuschüsse. Nicht aufgeschlüsselt sind u. a. laufende Zuweisungen und Zuschüsse, Gebühren, '
    'sonstige Einnahmen, Tilgung und Zuführungen an Rücklagen.'
)

# Row label -> Gruppierungen it is booked on; None: spans several Gruppen, stays unattributed.
ROWS = {
    'Realsteuern': [('vwh', '00')],
    'Gemeinschaftssteuern': [('vwh', '01')],
    'Schlüsselzuweisungen': [('vwh', '04')],
    'Zuweisungen und Zuschüsse': None,  # Gruppe 17 and possibly further allgemeine Zuweisungen
    'Gebühren': None,  # Verwaltungs- and Benutzungsgebühren (Gruppen 10 and 11)
    'Sonst. Einnahmen': None,
    'Personalausgaben': [('vwh', '4')],
    'Sach-Betriebsaufwand': [('vwh', '5/6')],
    'Kreisumlage': [('vwh', '832')],
    'Gewerbesteuerumlage': [('vwh', '810')],
    'Zinsausgaben': [('vwh', '80')],
    # The Zuführung is income of the Vermögenshaushalt and the same amount spent by the Verwaltungshaushalt.
    'Zuführung vom Verw. HH': [('vmh', '30'), ('vwh', '86')],
    'Nettokreditaufnahme': None,  # net of repayments, not a Gruppierung
    'Beiträge': [('vmh', '35')],
    'Investitionszuweisungen': [('vmh', '36')],
    'Veräußerungen': [('vmh', '34')],
    'Entnahme aus Rücklagen': [('vmh', '31')],
    'Baumaßnahmen': [('vmh', '94-96')],
    'Grund- und Vermögenserwerb,': [('vmh', '93')],
    'Investitionszuschüsse': [('vmh', '98')],
}
TOTALS = {'Verwaltungshaushalt': 'vwh', 'Vermögenshaushalt': 'vmh'}
STATUS = {'Plan': 'Ansatz', 'RE': 'Ergebnis'}
ROW = re.compile(r'^(\S.*?)\s{2,}((?:-?[\d.]+\s+)*-?[\d.]+)\s*$')


def thousands(text):
    return int(text.replace('.', '')) * 1000


def parse(lines):
    """Return ({year: status}, {label: {year: euro}}) of the overview."""
    years, statuses, rows = None, {}, {}
    for line in lines:
        fields = line.split()
        if fields and all(re.fullmatch(r'20\d\d', f) for f in fields):
            years = [int(f) for f in fields]
        elif fields and years and all(f in STATUS for f in fields) and len(fields) == len(years):
            statuses = {year: STATUS[f] for year, f in zip(years, fields, strict=True)}
        elif (m := ROW.match(line)) and years:
            values = m.group(2).split()
            if len(values) == len(years):
                rows[m.group(1)] = {year: thousands(v) for year, v in zip(years, values, strict=True)}
    unknown = set(rows) - set(ROWS) - set(TOTALS)
    if unknown:
        raise SystemExit(f'Unbekannte Zeilen in der Übersicht: {", ".join(sorted(unknown))}')
    return statuses, rows


def betraege_for(rows, year, gesamt=None):
    """`betraege` of one year: the attributable rows plus the section totals."""
    entries = [(code, values[year]) for label, values in rows.items() for _, code in ROWS.get(label) or []]
    betraege, labels = build_betraege(entries)
    if labels:
        raise SystemExit(f'Unerwartete Untergruppen: {labels}')
    for section in betraege.values():  # whole thousands: write integers, not floats
        for side in section.values():
            side.update({code: int(value) for code, value in side.items()})
    totals = gesamt or {section: rows[label][year] for label, section in TOTALS.items()}
    for section, total in totals.items():
        betraege[section]['gesamt'] = total
    return betraege


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pdf')
    parser.add_argument('--einwohner', nargs='+', required=True, metavar='JAHR=ANZAHL')
    parser.add_argument('--gesamt', nargs='*', default=[], metavar='JAHR=VWH,VMH', help='exakte Gesamtbeträge')
    args = parser.parse_args()

    statuses, rows = parse(pdf_lines(args.pdf))
    einwohner = parse_einwohner(args.einwohner)
    gesamt = {}
    for pair in args.gesamt:
        year, amounts = pair.split('=')
        vwh, vmh = (int(a) for a in amounts.split(','))
        gesamt[int(year)] = {'vwh': vwh, 'vmh': vmh}

    written = []
    for year, status in sorted(statuses.items()):
        target = DATA_DIR / f'{AGS}_{year}.json'
        column = f'{"Plan" if status == "Ansatz" else "RE"} {year}'
        totals = 'Gesamtbeträge laut Haushaltssatzung' if year in gesamt else None
        dataset = {
            '$schema': './schema/budget-schema.json',
            'metadata': {
                'kommune': KOMMUNE,
                'ags': AGS,
                'jahr': year,
                'einwohner': einwohner[year],
                'einwohner_stichtag': f'{year - 1}-12-31',
                'status': status,
                'waehrung': 'EUR',
                'quelle': f'{QUELLE}, Spalte „{column}“' + (f'; {totals} {year}' if totals else ''),
                'hinweis': HINWEIS,
            },
        }
        if target.exists():
            previous = json.loads(target.read_text(encoding='utf-8'))
            if 'kennzahlen' in previous:
                dataset['kennzahlen'] = previous['kennzahlen']
        dataset['betraege'] = betraege_for(rows, year, gesamt.get(year))
        target.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        written.append((year, einwohner[year], target.name))
        print(f'{target.name}: {status} {year}')
    update_kommunen(SimpleNamespace(ags=AGS, kommune=KOMMUNE, plz=PLZ), written)


if __name__ == '__main__':
    sys.exit(main())
