# gherkit (Deutsch)

**Ein Binary für den ganzen Gherkin-Workflow**: schreiben, prüfen, im Browser bearbeiten und
berichten. gherkit nutzt den offiziellen Cucumber-Gherkin-Parser und hält sich deshalb exakt an
die [Gherkin-Spezifikation](https://cucumber.io/docs/gherkin/reference/), in allen 80 Sprachen.

> Stand: erster Durchstich. Die vollständige Dokumentation ist auf Englisch, siehe [README.md](README.md).

## Schnellstart

```bash
gherkit edit                 # Editor für den aktuellen Ordner → http://127.0.0.1:4848
gherkit edit spezifikation/  # anderer Ordner; im Editor jederzeit wechselbar
gherkit fmt --check .        # CI: Exit-Code 2, wenn eine Datei nicht formatiert ist
gherkit lint -o github .     # Befunde als Anmerkungen im Pull Request
gherkit report cucumber.json -o report.html --lang de
```

## Editor-Varianten

| Variante | Für wen | Was sie kann |
| --- | --- | --- |
| **Code** | Testende, Entwicklung | Texteditor mit Highlighting aus dem offiziellen Scanner, Fehleranzeige, Step-Vervollständigung |
| **Dokument** | Fachbereich, Review | Lesesicht als Living Documentation, Testfälle je Szenario-Vorlage |
| **Struktur** | Business-Analyse | Formular-Editor auf dem AST; übersetzt alle Schlüsselwörter in eine andere Sprache |
| **Split** | alle | Code und Dokument nebeneinander, live |
| **Ausführen** | Testende | `@manual`-Szenarien geführt von Hand testen, Feature für Feature, Schritt für Schritt: gut / schlecht / ignorieren mit Pflichtbegründung, Kommentar, Nachweis, Ergebnisübersicht, Jira-Text; Ergebnis als Cucumber JSON ([manual-testing.md](docs/manual-testing.md)) |

## gherkit testet gherkit

Die Abnahmetests von gherkit sind in Gherkin geschrieben ([features/](features)), werden mit
gherkit geprüft und formatiert, mit godog gegen das echte Binary ausgeführt und mit
`gherkit report` als Report ausgegeben. Eine Spezifikation ist auf Deutsch geschrieben
([features/de/sprachen.feature](features/de/sprachen.feature)).
