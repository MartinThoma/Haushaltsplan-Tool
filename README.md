# Haushaltsvergleich (Kameralistik)

Statische Web-App zum Vergleich kameraler Haushaltspläne von Kommunen nach der
Gruppierungsübersicht – vollständig im Browser, ohne Server und ohne Tracking.

- **Kommunenvergleich:** zwei Haushalte (Kommune A/Jahr vs. Kommune B/Jahr) mit Differenz in € und %,
  farbigen Markierungen auffälliger Abweichungen und Umschaltung auf €/Einwohner.
- **Zeitreihe:** eine Kommune über mehrere Haushaltsjahre als Tabelle und Liniendiagramm.
- Aufklappbarer Baum Hauptgruppe → Gruppe → Untergruppe, Suche nach Ziffer oder Begriff,
  Verwaltungs- und Vermögenshaushalt, CSV-Export der sichtbaren Zeilen.
- Kommunensuche nach Name oder PLZ; eigene JSON-Dateien können per Drag & Drop geöffnet werden
  und verlassen dabei den Browser nicht.
- Funktioniert nach dem ersten Besuch auch offline (Service Worker).

## Schnellstart

Voraussetzung: Node.js ≥ 20.

| Befehl       | Zweck                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| `make build` | Erzeugt die statischen Dateien in `dist/` – deren Inhalt hochladen                   |
| `make serve` | Baut und startet einen lokalen Webserver auf http://localhost:4173                   |
| `make dev`   | Entwicklungsserver mit Hot Reload                                                    |
| `make test`  | Unit-Tests, inkl. Prüfung aller mitgelieferten Daten                                 |
| `make e2e`   | End-to-End-Tests (Playwright) in Google Chrome gegen den Produktions-Build           |
| `make check` | Alle Prüfungen der CI: Typen, Lint, Formatierung, alle Tests, Build, Python-Importer |

Die CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) führt dieselben Prüfungen bei jedem
Push und Pull Request aus; der Build bricht bei ungültigen Daten ab. Tests:

- **Unit-Tests** (Vitest, `src/**/*.test.ts`): Fachlogik und Gültigkeit aller mitgelieferten Daten.
- **End-to-End-Tests** (Playwright, [`e2e/`](e2e/)): Vergleich, Suche, Zeitreihe, CSV-Export, Öffnen
  eigener Dateien, Ladefehler, kleine Bildschirme und Offline-Betrieb gegen den Produktions-Build.
- **Importer-Tests** (pytest, [`scripts/tests/`](scripts/tests/)): Die PDF-Importer müssen jeden importierten
  Datensatz aus einem Textauszug seines PDFs exakt reproduzieren. Werkzeuge:
  `pip install -r scripts/requirements-dev.txt`.

`dist/` funktioniert auf jedem statischen Hosting (GitHub Pages, GitLab Pages, Cloudflare Pages,
eigener Webspace) – auch in einem Unterverzeichnis, da alle Pfade relativ sind.

## Daten hinzufügen

Alle Daten liegen in [`public/data/`](public/data/). Für jedes Haushaltsjahr einer Kommune gibt es
eine Datei, dazu das zentrale Verzeichnis `kommunen.json`.

### 1. Datensatz `[ags]_[jahr].json`

```json
{
  "$schema": "./schema/budget-schema.json",
  "metadata": {
    "kommune": "Plattling",
    "ags": "09271146",
    "jahr": 2026,
    "einwohner": 13296,
    "einwohner_stichtag": "2025-12-31",
    "status": "Ansatz",
    "waehrung": "EUR",
    "quelle": "https://… (optional)"
  },
  "kennzahlen": {
    "hebesatz_grundsteuer_b": { "wert": 290, "quelle": "Haushaltssatzung 2026, § 3" },
    "schulden": { "wert": 3745000, "stichtag": "2024-12-31", "quelle": "…" }
  },
  "betraege": {
    "vwh": {
      "einnahmen": { "000": 150000, "001": 1800000, "003": 9500000 },
      "ausgaben": { "410": 4200000, "414": 2100000 }
    },
    "vmh": {
      "einnahmen": { "300": 500000 },
      "ausgaben": { "932": 1200000 }
    }
  }
}
```

- Schlüssel sind Gruppierungsziffern mit 1–3 Stellen, Werte Beträge in Euro. Die Hauptgruppe
  „Sächlicher Verwaltungs- und Betriebsaufwand“ heißt wie im Gruppierungsplan `"5/6"`.
- Erlaubte Hauptgruppen: VwH-Einnahmen 0–2, VwH-Ausgaben 4–8, VmH-Einnahmen 3, VmH-Ausgaben 9.
- Summen für Hauptgruppen und Gruppen werden aus den Untergruppen berechnet. Sie dürfen auch
  direkt angegeben werden. Ist eine angegebene Summe größer als ihre Untergliederung (die Quelle
  schlüsselt nur teilweise auf), erscheint die Differenz als Zeile „Nicht aufgeschlüsselt“. Ist sie
  kleiner, gibt es einen Hinweis.
- `gesamt` (optional, je Haushalt): Gesamtbetrag laut Haushaltssatzung, z. B.
  `"vwh": { "einnahmen": {}, "ausgaben": {}, "gesamt": 32737300 }`. Damit lassen sich Kommunen
  aufnehmen, deren Haushaltsplan nicht veröffentlicht ist; was die Gruppierungen nicht abdecken,
  erscheint als „Nicht aufgeschlüsselt“.
- `nicht_aufgeschluesselt` (optional) beschreibt, was in so einer Differenz steckt, z. B.
  `{ "vwh": { "einnahmen": { "00": "Grundsteuer A und B" } } }`.
- `status`: `Entwurf` (Entwurf des Haushaltsplans), `Ansatz` (Haushaltsplan), `Nachtrag`
  (Nachtragshaushalt) oder `Ergebnis` (Jahresrechnung).
- `einwohner_stichtag` (optional): Stichtag der Einwohnerzahl. Die mitgelieferten Daten verwenden
  den 31.12. des Vorjahres (amtliche Fortschreibung des Bayerischen Landesamts für Statistik).
- `kennzahlen` (optional): Kernzahlen des Jahres, jeweils mit `wert` und optional `stichtag` und
  `quelle`. Vorgesehen sind `hebesatz_grundsteuer_a`, `hebesatz_grundsteuer_b`,
  `hebesatz_gewerbesteuer` (in Prozent), `schulden` und `ruecklagen` (Stand zu Jahresbeginn, in Euro)
  sowie `kassenkredite_hoechstbetrag` (laut Haushaltssatzung). Weitere Kernzahlen wie Zuführung zum
  Vermögenshaushalt, Personalausgabenquote, Sachinvestitionen, Kreditaufnahmen und Tilgung berechnet
  die App aus den Beträgen.
- Mit dem `$schema`-Verweis bieten Editoren wie VS Code Autovervollständigung und Prüfung.

### Import aus Einzelplänen (PDF)

Viele bayerische Kommunen veröffentlichen ihren Haushalt als „Einzelpläne“ mit allen
Haushaltsstellen (`.4100 Beamtenbezüge …`). Dieses Format liest
[`scripts/import_einzelplan.py`](scripts/import_einzelplan.py) (Python 3 und `pdftotext` aus
poppler-utils): Es prüft jede Haushaltsstelle gegen die gedruckten Zwischensummen, summiert nach
Gruppierung und schreibt Datensätze für Plan-, Vorjahres- und Ergebnisspalte samt Eintrag in
`kommunen.json`:

```sh
python3 scripts/import_einzelplan.py \
  --vwh import/Polling/EntwurfVerwaltungshaushalt2026.pdf \
  --vmh import/Polling/EntwurfVermögenshaushalt2026.pdf \
  --kommune Polling --ags 09190142 --plz 82398 82380 \
  --einwohner 2026=3635 2025=3633 2024=3605 --einwohner-stichtag vorjahr \
  --status-plan Entwurf --quelle "Entwurf Haushaltsplan 2026 der Gemeinde Polling"
```

Einzelpläne mit fünfstelligen Haushaltsstellen (`41400 Entgelte Beschäftigte`, drei Wertspalten) liest
[`scripts/import_einzelplan_5stellig.py`](scripts/import_einzelplan_5stellig.py) und prüft jeden Block gegen
seine Summenzeile. Zeigt die Vorjahresspalte einen Nachtragshaushalt, setzt `--status-vorjahr Nachtrag`
den Status.

Enthält der Haushaltsplan eine Gruppierungsübersicht (z. B. aus CIP-KOMMUNAL oder als „GRN – Gruppierungsübersicht (neu)“), ist
[`scripts/import_gruppierungsuebersicht.py`](scripts/import_gruppierungsuebersicht.py) einfacher: Es liest
Ansatz, Vorjahresansatz und Rechnungsergebnis direkt nach Gruppierung und prüft sie gegen alle gedruckten
Zwischensummen (`--nur-pruefen` liest und prüft, ohne zu schreiben). Aus der „Rechnungs-Gruppierungsübersicht“
einer Jahresrechnung oder eines Rechenschaftsberichts liest es das Rechnungsergebnis des Jahres (`--spalten ergebnis`).

Untergruppen, die der Gruppierungsplan nicht kennt (z. B. die frei gebildeten 100, 101 in
Gruppe 10), werden ihrer Gruppe zugerechnet, damit Kommunen vergleichbar bleiben. Beim erneuten
Import (`--force`) bleiben vorhandene `kennzahlen` erhalten.

Zu jedem importierten Datensatz gehört ein Golden-Test: `python3 scripts/tests/make_fixture.py PDF NAME`
(mit `--gruppierungsuebersicht` nur die Übersicht) legt den Textauszug in `scripts/tests/fixtures/` ab, dazu
kommt ein Eintrag in `CASES` in [`test_importers.py`](scripts/tests/test_importers.py). Fehlt er, schlägt
ein Test fehl.

### 2. Eintrag in `kommunen.json`

```json
[
  {
    "ags": "09271146",
    "name": "Plattling",
    "plz": ["94447"],
    "bundesland": "BY",
    "jahre": [{ "jahr": 2026, "einwohner": 13100, "file": "09271146_2026.json" }]
  }
]
```

Name und PLZ sind in der Kommunensuche durchsuchbar. Eine Kommune darf auch mit leerer
`jahre`-Liste eingetragen sein; sie erscheint dann in der Suche als „noch keine Daten“.

### 3. Prüfen

`make build` (und `make test`) prüfen alle Dateien mit demselben Schema wie die App und brechen bei
Fehlern ab, z. B. wenn eine Datei fehlt, nicht in `kommunen.json` eingetragen ist, Einwohnerzahl oder
Name nicht übereinstimmen oder das Bundesland nicht zum AGS passt. `make dev` meldet solche Probleme
laufend in der Konsole.

## Gruppierungsplan

Die Bezeichnungen der 408 Gruppierungsziffern in
[`src/data/master-groupings.json`](src/data/master-groupings.json) stammen aus dem
[Gruppierungsplan (Anlage 2 VVKommHSyst-Kameralistik, Bayern)](https://www.verkuendung-bayern.de/files/allmbl/2016/11/anhang/2023-I-2281-A002_PDFA.pdf).
Wie dort ist „5/6 Sächlicher Verwaltungs- und Betriebsaufwand“ eine Hauptgruppe. Die Gruppen 94, 95
und 96 fasst der Plan als „Baumaßnahmen“ zusammen; Haushalte, die das übernehmen, buchen sie unter
`94-96`. Für Kommunen, die Hoch- und Tiefbau trennen, gibt es 94, 95 und 96 (Hochbau, Tiefbau,
sonstige).

Untergruppen, die der Plan nicht nennt, werden angezeigt, aber markiert. Steht unter einer Gruppe
eine abschließende Liste (z. B. Realsteuern: 000, 001, 003), erzeugt eine andere Ziffer einen Hinweis.

## Mitgelieferte Daten

| Kommune              | Jahre                                                | Quelle                                                                                                          |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Plattling            | 2024–2026 (Ansatz)                                   | Faltblätter „Ein Streifzug durch den Haushaltsplan“ der Stadtkämmerei; teils nur Summen                         |
| Polling              | 2024 (Ergebnis), 2025 (Ansatz), 2026 (Entwurf)       | Entwurf Haushaltsplan 2026, Einzelpläne Verwaltungs- und Vermögenshaushalt                                      |
| Osterhofen           | 2025–2026 (Ansatz)                                   | Haushaltssatzungen 2025 und 2026: nur Gesamtbeträge, der Haushaltsplan ist nicht veröffentlicht                 |
| Kirchheim b. München | 2022–2024 (Ergebnis), 2025–2026 (Ansatz)             | Haushaltspläne 2024, 2025 und 2026, Gruppierungsübersicht                                                       |
| Haar                 | 2023–2024 (Ergebnis), 2025 (Nachtrag), 2026 (Ansatz) | Haushaltspläne 2025 und 2026, Einzelpläne aus dem Ratsinformationssystem                                        |
| Merching             | 2024 (Ergebnis), 2025–2026 (Ansatz)                  | Haushaltsplan 2026, Gruppierungsübersicht                                                                       |
| Wolfratshausen       | 2023–2025 (Ergebnis), 2026 (Ansatz)                  | Haushaltspläne 2025 und 2026, Gruppierungsübersicht; Rechenschaftsbericht 2025, Rechnungs-Gruppierungsübersicht |
| Erding               | 2025–2026 (Ansatz)                                   | Haushaltssatzungen 2025 und 2026: nur Gesamtbeträge, der Haushaltsplan ist nicht veröffentlicht                 |

Die Original-PDFs liegen nur lokal in `import/` (per `.gitignore` ausgeschlossen); welche Quelle
hinter einem Datensatz steht, vermerkt dessen Feld `quelle`. Einwohnerzahlen: Bayerisches Landesamt für Statistik,
[Einwohnerzahlen der Gemeinden](https://www.statistik.bayern.de/statistik/gebiet_bevoelkerung/bevoelkerungsstand/),
Stand jeweils 31.12. des Vorjahres.

Quellen der Kernzahlen (in jeder Datei pro Wert vermerkt):

- Hebesätze 2024: Statistische Ämter des Bundes und der Länder, Hebesätze der Realsteuern 2024;
  ab 2025: Hebesatzsatzungen bzw. Haushaltssatzung der Gemeinde Polling und die Seite
  „Steuern und Haushalt“ der Stadt Plattling.
- Schuldenstand bis 31.12.2024: Bayerisches Landesamt für Statistik, „Staats- und Kommunalschulden
  in Bayern“ (Schulden insgesamt ohne Eigenbetriebe). Polling 2026, Rücklage und Kassenkredite:
  Haushaltssatzung 2026 und „Haushalt 2026 kurz in Zahlen“ der Gemeinde Polling.

## Datenschutz

Die App lädt nur eigene statische Dateien, bindet keine externen Dienste ein und setzt keine
Cookies. Geöffnete Dateien werden ausschließlich im Browser verarbeitet. Damit ein Neuladen – auch das
automatische nach einem Update der App – sie nicht schließt, merkt sich der Browser-Tab ihren Inhalt im
`sessionStorage`; er wird mit dem Tab gelöscht.

## Projektstruktur

```
public/data/          Datensätze, kommunen.json, generierte JSON-Schemas
src/data/             Gruppierungsplan (Stammdaten)
src/lib/              Schema (Zod), Aggregation, Baum, Vergleich, CSV – ohne UI, mit Tests
src/components/       React-Komponenten
src/state/            Laden der Datensätze, Ansichtszustand in der URL
vite-plugins/         Datenprüfung beim Build, Erzeugung der JSON-Schemas
scripts/              Import aus Haushaltsplan-PDFs (Python), Tests in scripts/tests/
e2e/                  End-to-End-Tests (Playwright)
import/               Original-PDFs (lokal, nicht im Repository)
```

Technik: Vite, React, TypeScript, Tailwind CSS, Zod, Chart.js, Lucide Icons. TypeScript prüft den
Browser-Code ([`tsconfig.app.json`](tsconfig.app.json), ohne Node-Typen) getrennt von Build-Konfiguration
und Tests ([`tsconfig.node.json`](tsconfig.node.json)); [oxlint](https://oxc.rs/docs/guide/usage/linter.html)
prüft mit Typinformationen u. a. die Hook-Regeln von React und die Barrierefreiheit (jsx-a11y). ESLint
mit typescript-eslint unterstützt TypeScript 7 nicht.
