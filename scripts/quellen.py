#!/usr/bin/env python3
"""Maintain public/data/quellen.json, the register of the original documents behind the data.

Each entry records where a file in the (gitignored) import/ folder came from, when it was
retrieved, its SHA-256 checksum and size, and which datasets rely on it.

Examples:
    python3 scripts/quellen.py eintragen import/Haar/Haushaltssatzung-2026.pdf \\
        --titel "Haushaltssatzung 2026" --herausgeber "Stadt Haar" \\
        --url "https://www.stadt-haar.de/..." --datensaetze 09184123_2026
    python3 scripts/quellen.py pruefen            # local copies against their checksums
    python3 scripts/quellen.py pruefen --online   # also download every URL and compare
"""

import argparse
import datetime
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

from budget_import import DATA_DIR, ROOT

IMPORT_DIR = ROOT / 'import'
REGISTER = DATA_DIR / 'quellen.json'
FIELDS = ['datei', 'titel', 'herausgeber', 'url', 'herkunft', 'abgerufen', 'sha256', 'bytes', 'datensaetze']
PRINT_WIDTH = 120  # as in .prettierrc


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load():
    return json.loads(REGISTER.read_text(encoding='utf-8')) if REGISTER.exists() else []


def dumps(entries):
    """JSON as Prettier formats it: short arrays of strings stay on one line."""
    text = json.dumps(entries, ensure_ascii=False, indent=2)

    def collapse(match):
        items = re.findall(r'"(?:[^"\\]|\\.)*"', match.group(3))
        line = f'{match.group(1)}{match.group(2)}[{", ".join(items)}]'
        return line if len(line) <= PRINT_WIDTH else match.group(0)

    return re.sub(r'^( *)("[^"]+": )\[\n((?: *"(?:[^"\\]|\\.)*",?\n)+) *\]', collapse, text, flags=re.M) + '\n'


def save(entries):
    entries = sorted(entries, key=lambda e: e['datei'].lower())
    REGISTER.write_text(dumps([{k: e[k] for k in FIELDS if k in e} for e in entries]), encoding='utf-8')


def eintragen(args):
    path = Path(args.datei).resolve()
    if not path.is_relative_to(IMPORT_DIR):
        raise SystemExit(f'{args.datei} liegt nicht im Ordner import/')
    datei = path.relative_to(IMPORT_DIR).as_posix()
    data = path.read_bytes()
    entries = load()
    entry = next((e for e in entries if e['datei'] == datei), None)
    if entry is None:
        if not args.titel or not args.herausgeber or not (args.url or args.herkunft):
            raise SystemExit('Neue Einträge brauchen --titel, --herausgeber und --url oder --herkunft')
        entry = {'datei': datei, 'datensaetze': []}
        entries.append(entry)
    for field in ('titel', 'herausgeber', 'url', 'herkunft'):
        if getattr(args, field):
            entry[field] = getattr(args, field)
    modified = datetime.date.fromtimestamp(path.stat().st_mtime).isoformat()
    entry['abgerufen'] = args.abgerufen or entry.get('abgerufen') or modified
    entry['sha256'] = sha256(data)
    entry['bytes'] = len(data)
    entry['datensaetze'] = sorted(set(entry['datensaetze']) | set(args.datensaetze or []))
    save(entries)
    count = len(entry['datensaetze'])
    print(f'{datei}: eingetragen ({count} {"Datensatz" if count == 1 else "Datensätze"})')


def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Haushaltsplan-Tool)'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def pruefen(args):
    problems, missing = [], 0
    for entry in load():
        local = IMPORT_DIR / entry['datei']
        if local.exists():
            data = local.read_bytes()
            if sha256(data) != entry['sha256'] or len(data) != entry['bytes']:
                problems.append(f'{entry["datei"]}: lokale Datei weicht von der Prüfsumme ab')
        else:
            missing += 1
        if args.online and 'url' in entry:
            try:
                online = download(entry['url'])
            except OSError as error:
                problems.append(f'{entry["datei"]}: {entry["url"]} nicht erreichbar ({error})')
                continue
            if sha256(online) != entry['sha256']:
                problems.append(f'{entry["datei"]}: die Datei unter {entry["url"]} hat sich geändert')
    print(f'{len(load())} Quellen geprüft, {missing} nicht lokal vorhanden.')
    if problems:
        raise SystemExit('\n'.join(problems))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(required=True)

    add = commands.add_parser('eintragen', help='Dokument eintragen oder aktualisieren')
    add.add_argument('datei', help='Datei im Ordner import/')
    add.add_argument('--titel')
    add.add_argument('--herausgeber')
    add.add_argument('--url')
    add.add_argument('--herkunft', help='Herkunft, wenn es keine öffentliche Adresse gibt')
    add.add_argument('--abgerufen', help='Abrufdatum JJJJ-MM-TT (Standard: Änderungsdatum der Datei)')
    add.add_argument('--datensaetze', nargs='+', metavar='AGS_JAHR', help='hinzuzufügende Datensätze')
    add.set_defaults(run=eintragen)

    check = commands.add_parser('pruefen', help='Prüfsummen der lokalen Kopien (und Online-Fassungen) prüfen')
    check.add_argument('--online', action='store_true', help='auch jede URL herunterladen und vergleichen')
    check.set_defaults(run=pruefen)

    args = parser.parse_args()
    args.run(args)


if __name__ == '__main__':
    sys.exit(main())
