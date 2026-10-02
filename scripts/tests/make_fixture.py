#!/usr/bin/env python3
"""Create a text fixture for the importer tests from a budget PDF.

A fixture is the `pdftotext -layout` output the importers read, gzip-compressed, so the tests run
without the PDFs (which stay in the gitignored import/ folder). For a Gruppierungsübersicht only
the overview itself is kept, as the plans have hundreds of other pages.

Example:
    python3 scripts/tests/make_fixture.py import/Kirchheim/Haushalt-2024.pdf kirchheim_2024 --gruppierungsuebersicht
"""

import argparse
import gzip
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import import_gruppierungsuebersicht as gu  # noqa: E402
import import_gruppierungsuebersicht_doppelhaushalt as dh  # noqa: E402
from budget_import import pdf_lines  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / 'fixtures'


def overview(lines):
    """The lines from the heading of the overview to its last amount."""
    _, _, leaves, subtotals = gu.parse(lines)
    if not leaves:
        raise SystemExit('Keine Gruppierungsübersicht gefunden')
    first = min(n for _, _, n in leaves) - 1
    # The last heading before the first amount: the table of contents names the overview, too.
    start = max(i for i, line in enumerate(lines[:first]) if gu.START.search(line))
    end = max(n for _, _, n in leaves + subtotals)
    return lines[start:end]


def overview_doppelhaushalt(lines):
    """The lines of a Doppelhaushalt's "3.3 Gruppierungsübersicht" up to its grand total."""
    _, items, subtotals = dh.parse(lines)
    if not items:
        raise SystemExit('Keine Gruppierungsübersicht gefunden')
    first = min(n for _, _, n in items) - 1
    start = max(i for i, line in enumerate(lines[:first]) if dh.START.search(line))
    end = max(n for _, _, n in items + subtotals)
    return lines[start:end]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pdf')
    parser.add_argument('name', help='Name der Fixture-Datei ohne Endung, z. B. kirchheim_2024')
    parser.add_argument('--gruppierungsuebersicht', action='store_true', help='nur die Gruppierungsübersicht')
    parser.add_argument('--doppelhaushalt', action='store_true', help='nur die Gruppierungsübersicht (Doppelhaushalt)')
    args = parser.parse_args()

    lines = pdf_lines(args.pdf)
    if args.gruppierungsuebersicht:
        lines = overview(lines)
    elif args.doppelhaushalt:
        lines = overview_doppelhaushalt(lines)
    target = FIXTURES / f'{args.name}.txt.gz'
    # mtime=0 keeps the file byte-identical when it is recreated from the same PDF.
    target.write_bytes(gzip.compress(('\n'.join(lines) + '\n').encode('utf-8'), mtime=0))
    print(f'{target.relative_to(Path.cwd()) if target.is_relative_to(Path.cwd()) else target}: {len(lines)} Zeilen')


if __name__ == '__main__':
    sys.exit(main())
