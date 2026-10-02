"""The source register: formatted as the tool writes it, and matching the local copies in import/."""

import hashlib

import pytest
import quellen


def test_register_is_written_as_the_tool_writes_it():
    entries = quellen.load()
    assert entries == sorted(entries, key=lambda e: e['datei'].lower())
    assert quellen.REGISTER.read_text(encoding='utf-8') == quellen.dumps(entries)


@pytest.mark.parametrize('entry', quellen.load(), ids=lambda e: e['datei'])
def test_local_copy_matches_checksum(entry):
    local = quellen.IMPORT_DIR / entry['datei']
    if not local.exists():
        pytest.skip('import/ ist nur lokal vorhanden')
    data = local.read_bytes()
    assert (hashlib.sha256(data).hexdigest(), len(data)) == (entry['sha256'], entry['bytes'])


def test_short_lists_stay_on_one_line():
    text = quellen.dumps([{'datei': 'A/b.pdf', 'datensaetze': ['09184131_2022', '09184131_2023']}])
    assert '"datensaetze": ["09184131_2022", "09184131_2023"]' in text
    long = quellen.dumps([{'datensaetze': [f'0918413{i}_2022' for i in range(10)]}])
    assert '"datensaetze": [\n' in long
