# Render-Vorschau für `gherkit report`

Jeder Pull Request erhält auf [Render](https://render.com) eine Vorschau (`render.yaml`, `previews.generation: automatic`).
Der Container (`render/Dockerfile`) baut gherkit, führt beim Start den echten Befehl `gherkit report` auf Beispiel-Ergebnissen
aus (`render/entrypoint.sh`) und liefert die Berichte als statische Seiten aus. Die Startseite listet jeden Befehl mit
Exit-Code und Ausgabe; dieselben Zeilen stehen im Render-Log.

| Datei | Inhalt |
| --- | --- |
| `render/results/gherkit.cucumber.json` | 48 Szenarien aus `features/` (alle erfolgreich) |
| `render/results/examples.cucumber.json` | 17 Szenarien aus `examples/`: 1 fehlgeschlagen (`NOPE`), 1 undefiniert (Reservation), `broken.feature` fehlgeschlagen |
| `render/results/manual.cucumber.json` | 6 `@manual`-Szenarien eines erfundenen manuellen Laufs (Tester, Kommentare, Nachweis, ein ignorierter Schritt, ein fehlgeschlagener) |

Das sind **Beispieldaten, keine Testläufe**. Sie entstehen mit `python3 scripts/gen-preview-results.py` aus den Feature-Dateien;
`internal/report/preview_results_test.go` prüft mit dem offiziellen Parser, dass sie genau die Szenarien der Dateien abdecken.
Nach Änderungen an `features/` oder `examples/` das Skript neu ausführen.

Einmalig nötig: in Render unter *New → Blueprint* das Repository `goerks/gherkit` verbinden, sonst entstehen keine Vorschauen.
Auf dem Free-Plan schläft der Dienst; die erste Anfrage dauert dann etwa eine Minute.
