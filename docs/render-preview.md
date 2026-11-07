# Vorschau pro Pull Request (Render)

GitHub Pages zeigt nur `main`. Damit sich eine Änderung vor dem Merge online ausprobieren lässt, baut Render pro
Pull Request dieselbe statische Demo (`render.yaml`, `render/Dockerfile`: `scripts/build-site.sh` ohne CLI-Downloads, ausgeliefert mit Caddy).
Die Seite ist die Demo von [demo.md](demo.md): `gherkit` läuft als WebAssembly im Browser, es gibt keinen Server-Code.

Einmalig nötig: in Render unter *New → Blueprint* das Repository `goerks/gherkit` verbinden, sonst entstehen keine Vorschauen.
Auf dem Free-Plan schläft der Dienst, die erste Anfrage dauert etwa eine Minute. Die Download-Links der Startseite
funktionieren in der Vorschau nicht (nur auf GitHub Pages).

## Reports im Terminal ausprobieren

Das Standardset enthält Beispiel-Ergebnisse (`examples/results/`, Cucumber JSON) für alle Feature-Dateien:

| Datei | Inhalt |
| --- | --- |
| `results/gherkit.cucumber.json` | 57 Szenarien aus `features/`, alle erfolgreich |
| `results/examples.cucumber.json` | 17 Szenarien aus `examples/`: 2 fehlgeschlagen (`NOPE`, `broken.feature`), 1 undefiniert |
| `results/manual.cucumber.json` | 6 `@manual`-Szenarien eines erfundenen manuellen Laufs (Tester, Kommentare, Nachweis in `evidence/`, ein ignorierter und ein fehlgeschlagener Schritt) |

Im Terminal (Startseite, oder im Editor unten «Terminal → Aufklappen»):

```bash
gherkit report results/examples.cucumber.json -o report.html
gherkit report results/gherkit.cucumber.json results/examples.cucumber.json results/manual.cucumber.json -o alle.html --lang de
gherkit report results/examples.cucumber.json -f md
gherkit report results/examples.cucumber.json -t meine.tmpl
```

Ein HTML-Report (Datei mit `-o …html` oder Ausgabe ohne `-o`) erscheint sofort unter dem Terminal; «In neuem Tab» öffnet ihn gross.
Markdown und JSON stehen im Terminal. Mit `echo` lässt sich eine eigene Vorlage anlegen (siehe `docs/cli.md`, Template-Daten).

Die Beispieldaten sind **keine Testläufe**: `python3 scripts/gen-preview-results.py` erzeugt sie aus den Feature-Dateien,
`internal/report/preview_results_test.go` prüft mit dem offiziellen Parser, dass sie genau deren Szenarien abdecken.
Neue Besucher bekommen die Dateien automatisch; wer die Demo schon benutzt hat, ruft im Terminal `reset` auf.

## Lokal testen

Ohne Docker (Go 1.24, Python 3, Node für die Browser-Tests):

```bash
SKIP_DOWNLOADS=1 scripts/build-site.sh build/site
python3 -m http.server -d build/site 8000
```

Dann <http://localhost:8000/> öffnen, «Demo starten» und einen der Report-Chips anklicken oder einen Befehl von oben eintippen.
Mit Docker (wie auf Render):

```bash
docker build -f render/Dockerfile -t gherkit-demo .
docker run --rm -e PORT=8080 -p 8080:8080 gherkit-demo
```

Browser-Tests der Seite: `cd e2e && npm ci && npm run test:demo` (Script-Namen in `e2e/package.json`).
