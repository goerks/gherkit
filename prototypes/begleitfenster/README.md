# Prototypen: Begleitfenster für manuelle Tests

Ausgangspunkt: [Konzept manuelle Ausführung](../../docs/concepts/manuelle-ausfuehrung.md) und ADR 0009. Der Editor-Tab
«Ausführen» ist für manuelle Tests zu gross. Hier stehen vier Varianten eines kleinen Begleitfensters zum Ausprobieren.
Es sind **Wegwerf-Prototypen**: Sie sind nicht an den gherkit-Server angeschlossen, die Szenarien stehen in
`common/scenario.js`, die Ergebnisse bleiben lokal.

Alle Varianten benutzen dasselbe Panel (`common/panel.js`): Schritt anzeigen, **Gut / Schlecht / Ignorieren** (Tasten
`G`, `S`, `I`, `←` zurück), Kommentar (bei Schlecht und Ignorieren Pflicht), Nachweis, Übersicht, **Export als Xray-JSON**
(`common/xray.js`). Test-Anwendung: `testapp/index.html` (Formular «Leserin erfassen»).

Zum Ausprobieren erst die Test-Anwendung im Browser öffnen und danach die Variante starten. Für D1 den Ordner einmal
lokal bereitstellen (Chrome verlangt für das schwebende Fenster `localhost` oder `https`, nicht `file://`):

```bash
cd prototypes/begleitfenster
python3 -m http.server 8000   # oder: npx serve .
```
Dann `http://localhost:8000/` öffnen.

## D1 – Schwebendes Fenster (`d1-pip/`)
Seite `http://localhost:8000/d1-pip/index.html` öffnen, «Begleitfenster öffnen» wählen, die Test-Anwendung in einem anderen
Fenster öffnen. Das Panel bleibt im Vordergrund. Nur Chrome und Edge ab 116; sonst ein normales Popup.
Nachweis: beim ersten Mal das Fenster der Anwendung freigeben, danach ein Klick pro Screenshot.
Kein Springen zum Feld.

## D2 – Browser-Erweiterung (`d2-extension/`)
Chrome oder Edge: `chrome://extensions` bzw. `edge://extensions`, Entwicklermodus, «Entpackte Erweiterung laden»,
Ordner `d2-extension` wählen. Test-Anwendung öffnen (über `http://localhost:8000/testapp/index.html`; bei `file://`
zusätzlich «Zugriff auf Datei-URLs zulassen» in den Erweiterungsdetails). Symbol der Erweiterung anklicken: Seitenleiste
(Chrome) oder kleines Fenster (wo es keine Seitenleiste gibt). Das Feld des aktuellen Schritts wird markiert und
fokussiert. Nachweis = Screenshot der sichtbaren Seite, ohne Freigabe.

## D3 – Gesteuerter Browser (`d3-launcher/`)
Braucht Node.js 18 oder neuer.
```bash
cd prototypes/begleitfenster/d3-launcher
npm install
node launch.mjs                       # öffnet die Test-Anwendung
node launch.mjs https://meine.app     # oder eine eigene Adresse
```
Unter Windows startet er Edge, sonst Chromium (`npx playwright install chromium`); `--browser chrome|msedge|chromium`
wählt um. Das Panel liegt in der Seite, ist an der Kopfzeile verschiebbar und mit Doppelklick einklappbar. Der Zustand
liegt in `gherkit-lauf.json`, der Xray-Export daneben.

## D4 – Desktop-Fenster (`d4-desktop/`)
Electron, braucht Node.js und Internet für `npm install`.
```bash
cd prototypes/begleitfenster/d4-desktop
npm install
npm start
```
Kleines rahmenloses Fenster, immer im Vordergrund (auch über Vollbild), unabhängig von der getesteten Anwendung.
Nachweis = Screenshot des ganzen Bildschirms. Kein Springen zum Feld.

## Stand der Prüfung
| | geprüft | nicht geprüft |
| --- | --- | --- |
| Panel, Xray-Export | Ablauf (Gut/Schlecht/Ignorieren, Pflichtbegründung, Überspringen nach Fehler, Export) in Chromium | Import in eine echte Xray-Instanz |
| D1 | Panel im Popup-Pfad; Picture-in-Picture-Fenster öffnet sich und zeigt das Panel (Chromium unter Xvfb) | ob es auf deinem Bildschirm wirklich über anderen Fenstern liegt; Edge |
| D2 | geladen in Chromium: Feld markieren und fokussieren, automatisch beim Schrittwechsel, Screenshot-Nachweis | Seitenleiste selbst, Edge |
| D3 | Chromium: Panel in der Seite, Springen zum Feld, Nachweis, Zustand nach Neuladen | Edge, eigene Anwendungen |
| D4 | Oberfläche in Chromium mit Ersatz für die Schnittstelle | Electron selbst (kein npm-Zugang in der Sandbox) |

## Wenn eine Variante gewählt ist
Das Panel (`common/panel.js`) wird zur Ansicht im Editor und nutzt dann den gherkit-Server statt Browser-Speicher:
Lauf starten, Antworten speichern (`internal/manual`), Export als Cucumber JSON und Xray-JSON. `sync.sh` kopiert
`common/` in `d2-extension/` und `d4-desktop/` (diese Ordner müssen eigenständig sein).
