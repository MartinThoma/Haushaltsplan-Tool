"""Golden tests: the importers must reproduce the bundled datasets from the text of their PDFs.

The fixtures are created with make_fixture.py. A parser change that breaks an earlier layout
fails here instead of going unnoticed until the next import from that municipality.
"""

import gzip
import json
from pathlib import Path

import import_einzelplan as kic
import import_einzelplan_5stellig as five
import import_gruppierungsuebersicht as gu
import import_gruppierungsuebersicht_doppelhaushalt as dh
import import_uebersicht_deggendorf as deggendorf
import pytest
from budget_import import COLUMN_OFFSET, DATA_DIR, build_betraege

FIXTURES = Path(__file__).parent / 'fixtures'
# How the importers' hinweis starts (see write_datasets in the importer scripts).
IMPORTER_HINWEISE = ('Aus der Gruppierungsübersicht', 'Aus den Einzelplänen')


def fixture(name):
    return gzip.decompress((FIXTURES / f'{name}.txt.gz').read_bytes()).decode('utf-8').splitlines()


def read_gruppierungsuebersicht(name, column):
    columns, year, leaves, subtotals = gu.parse(fixture(name))
    assert gu.check(columns, leaves, subtotals) == []
    return year - COLUMN_OFFSET[column], gu.column_entries(columns, leaves, column)


def read_einzelplan_5stellig(name, column):
    year, vwh, vwh_problems = five.parse(fixture(f'{name}_vwh'), 'VwH', with_ve=False)
    vmh_year, vmh, vmh_problems = five.parse(fixture(f'{name}_vmh'), 'VmH', with_ve=True)
    assert vwh_problems + vmh_problems == []
    assert year == vmh_year
    return year - COLUMN_OFFSET[column], five.column_entries(vwh + vmh, column)


def read_einzelplan(name, column):
    vwh, vwh_subtotals, year = kic.parse(fixture(f'{name}_vwh'))
    vmh, vmh_subtotals, vmh_year = kic.parse(fixture(f'{name}_vmh'))
    assert kic.check_subtotals(vwh, vwh_subtotals, 'VwH') + kic.check_subtotals(vmh, vmh_subtotals, 'VmH') == []
    assert year == vmh_year
    return year - COLUMN_OFFSET[column], kic.column_entries(vwh + vmh, column)


# Printed sums that include positions the PDF does not print (explained in the datasets' hinweis).
KNOWN_DEVIATIONS = {'augsburg_2025_2026': {'40', '4', '65', '6', '4-9'}}


def read_gruppierungsuebersicht_doppelhaushalt(name, column):
    columns, items, subtotals = dh.parse(fixture(name))
    assert dh.check(columns, items, subtotals, known=KNOWN_DEVIATIONS.get(name, set())) == []
    label, year = column.split()
    return int(year), dh.column_entries(columns, items, (label, int(year)))


READERS = {
    'gruppierungsuebersicht': read_gruppierungsuebersicht,
    'einzelplan_5stellig': read_einzelplan_5stellig,
    'einzelplan': read_einzelplan,
    'gruppierungsuebersicht_doppelhaushalt': read_gruppierungsuebersicht_doppelhaushalt,
}

# (importer, fixture, column, dataset)
CASES = [
    ('gruppierungsuebersicht', 'kirchheim_2024', 'ergebnis_vorvorjahr', '09184131_2022'),
    ('gruppierungsuebersicht', 'kirchheim_2025', 'ergebnis_vorvorjahr', '09184131_2023'),
    ('gruppierungsuebersicht', 'kirchheim_2025', 'ansatz', '09184131_2025'),
    ('gruppierungsuebersicht', 'kirchheim_2026', 'ergebnis_vorvorjahr', '09184131_2024'),
    ('gruppierungsuebersicht', 'kirchheim_2026', 'ansatz', '09184131_2026'),
    ('gruppierungsuebersicht', 'merching_2026', 'ergebnis_vorvorjahr', '09771145_2024'),
    ('gruppierungsuebersicht', 'merching_2026', 'ansatz_vorjahr', '09771145_2025'),
    ('gruppierungsuebersicht', 'merching_2026', 'ansatz', '09771145_2026'),
    ('gruppierungsuebersicht', 'wolfratshausen_2025', 'ergebnis_vorvorjahr', '09173147_2023'),
    ('gruppierungsuebersicht', 'wolfratshausen_2026', 'ergebnis_vorvorjahr', '09173147_2024'),
    ('gruppierungsuebersicht', 'wolfratshausen_rechnung_2025', 'ergebnis', '09173147_2025'),
    ('gruppierungsuebersicht', 'wolfratshausen_2026', 'ansatz', '09173147_2026'),
    ('einzelplan_5stellig', 'haar_2025', 'ergebnis_vorvorjahr', '09184123_2023'),
    ('einzelplan_5stellig', 'haar_2026', 'ergebnis_vorvorjahr', '09184123_2024'),
    ('einzelplan_5stellig', 'haar_2026', 'ansatz_vorjahr', '09184123_2025'),
    ('einzelplan_5stellig', 'haar_2026', 'ansatz', '09184123_2026'),
    ('einzelplan', 'polling_2026', 'ergebnis_vorvorjahr', '09190142_2024'),
    ('einzelplan', 'polling_2026', 'ansatz_vorjahr', '09190142_2025'),
    ('einzelplan', 'polling_2026', 'ansatz', '09190142_2026'),
    ('gruppierungsuebersicht_doppelhaushalt', 'augsburg_2023_2024', 'Ergebnis 2020', '09761000_2020'),
    ('gruppierungsuebersicht_doppelhaushalt', 'augsburg_2023_2024', 'Ergebnis 2021', '09761000_2021'),
    ('gruppierungsuebersicht_doppelhaushalt', 'augsburg_2025_2026', 'Ergebnis 2022', '09761000_2022'),
    ('gruppierungsuebersicht_doppelhaushalt', 'augsburg_2025_2026', 'Ergebnis 2023', '09761000_2023'),
    ('gruppierungsuebersicht_doppelhaushalt', 'augsburg_2025_2026', 'Ansatz 2024', '09761000_2024'),
    ('gruppierungsuebersicht_doppelhaushalt', 'augsburg_2025_2026', 'Ansatz 2025', '09761000_2025'),
    ('gruppierungsuebersicht_doppelhaushalt', 'augsburg_2025_2026', 'Ansatz 2026', '09761000_2026'),
]


def load_dataset(name):
    return json.loads((DATA_DIR / f'{name}.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize(('importer', 'name', 'column', 'dataset'), CASES, ids=[case[3] for case in CASES])
def test_reproduces_dataset(importer, name, column, dataset):
    jahr, entries = READERS[importer](name, column)
    data = load_dataset(dataset)
    assert jahr == data['metadata']['jahr']
    betraege, labels = build_betraege(entries)
    assert betraege == data['betraege']
    assert labels == data.get('nicht_aufgeschluesselt', {})


def test_deggendorf_overview_reproduces_datasets():
    statuses, rows = deggendorf.parse(fixture('deggendorf_uebersicht'))
    # Exact totals from the Haushaltssatzungen, as passed with --gesamt.
    gesamt = {2025: {'vwh': 103_725_400, 'vmh': 23_423_400}, 2026: {'vwh': 105_852_200, 'vmh': 35_268_000}}
    assert sorted(statuses) == list(range(2018, 2027))
    for year, status in statuses.items():
        data = load_dataset(f'{deggendorf.AGS}_{year}')
        assert data['metadata']['status'] == status
        assert deggendorf.betraege_for(rows, year, gesamt.get(year)) == data['betraege']


def test_every_imported_dataset_has_a_golden_test():
    """Datasets written by an importer (recognizable by its hinweis) need a fixture and a case."""
    imported = {
        path.stem
        for path in DATA_DIR.glob('*_*.json')
        if load_dataset(path.stem)['metadata'].get('hinweis', '').startswith(IMPORTER_HINWEISE)
    }
    assert imported == {case[3] for case in CASES}


@pytest.mark.parametrize(
    ('spec', 'code', 'expected'),
    [
        ('0-2999', '061', True),  # Hauptgruppen 0 to 2
        ('0-2999', '300', False),
        ('5-66', '50', True),  # Gruppen 50 to 66
        ('5-66', '670', False),
        ('081,092', '092', True),
        ('5/6', '63', True),
        ('94-96', '95', True),
    ],
)
def test_subtotal_coverage(spec, code, expected):
    assert gu.covered(spec, code) is expected


def test_amounts_with_trailing_minus_and_dashes():
    # GRN prints negative amounts with a trailing minus and zero as a dash.
    assert gu.values_of(['050', 'Erstattungen', '4.925,62-', '–', '1.000,00']) == [-4925.62, 0.0, 1000.0]
