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

| Befehl       | Zweck                                                              |
| ------------ | ------------------------------------------------------------------ |
| `make build` | Erzeugt die statischen Dateien in `dist/` – deren Inhalt hochladen |
| `make serve` | Baut und startet einen lokalen Webserver auf http://localhost:4173 |
| `make dev`   | Entwicklungsserver mit Hot Reload                                  |
| `make test`  | Unit-Tests, inkl. Prüfung aller mitgelieferten Daten               |

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
    "einwohner": 13100,
    "status": "Ansatz",
    "waehrung": "EUR",
    "quelle": "https://… (optional)"
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

- Schlüssel sind Gruppierungsziffern mit 1–3 Stellen, Werte Beträge in Euro.
- Erlaubte Hauptgruppen: VwH-Einnahmen 0–2, VwH-Ausgaben 4–8, VmH-Einnahmen 3, VmH-Ausgaben 9.
- Summen für Hauptgruppen und Gruppen werden aus den Untergruppen berechnet. Sie dürfen auch
  direkt angegeben werden; weichen sie von der Summe der Untergliederung ab, gibt es einen Hinweis.
- `status`: `Ansatz` (Haushaltsplan), `Nachtrag` (Nachtragshaushalt) oder `Ergebnis` (Jahresrechnung).
- Mit dem `$schema`-Verweis bieten Editoren wie VS Code Autovervollständigung und Prüfung.

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

Die Bezeichnungen der 409 Gruppierungsziffern in
[`src/data/master-groupings.json`](src/data/master-groupings.json) stammen aus dem
[Gruppierungsplan (Anlage 2 VVKommHSyst-Kameralistik, Bayern)](https://www.verkuendung-bayern.de/files/allmbl/2016/11/anhang/2023-I-2281-A002_PDFA.pdf).
Der Plan fasst die Hauptgruppen 5 und 6 zusammen („5/6 Sächlicher Verwaltungs- und
Betriebsaufwand“); im Baum erscheinen sie als zwei Hauptgruppen, damit jede Ebene genau einer
Ziffer entspricht.

Untergruppen, die der Plan nicht nennt, werden angezeigt, aber markiert. Steht unter einer Gruppe
eine abschließende Liste (z. B. Realsteuern: 000, 001, 003), erzeugt eine andere Ziffer einen Hinweis.

## Beispieldaten

Die mitgelieferten Kommunen Musterstadt, Beispielmarkt und Neudorf am See sind **erfunden**
(AGS `09999xxx`, PLZ `001xx`). Sie zeigen die Funktionen und sollten durch echte Daten ersetzt werden.

## Datenschutz

Die App lädt nur eigene statische Dateien, bindet keine externen Dienste ein und setzt keine
Cookies. Geöffnete Dateien werden ausschließlich im Browser verarbeitet.

## Projektstruktur

```
public/data/          Datensätze, kommunen.json, generierte JSON-Schemas
src/data/             Gruppierungsplan (Stammdaten)
src/lib/              Schema (Zod), Aggregation, Baum, Vergleich, CSV – ohne UI, mit Tests
src/components/       React-Komponenten
vite-plugins/         Datenprüfung beim Build, Erzeugung der JSON-Schemas
```

Technik: Vite, React, TypeScript, Tailwind CSS, Zod, Chart.js, Lucide Icons.
