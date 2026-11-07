# gherkit: Arbeitsstand und Arbeitsweise

Wird von Claude Code automatisch gelesen. Stand: 2026-11-05.

## Auftraggeber und Stil

- Michael Burkard, BBV Software Services AG (michael.burkard@bbv.ch). Kommunikation auf Deutsch, kurz.
- Bilder von UI-Änderungen direkt im Chat zeigen, keine Links.
- Alles läuft über GitHub (`goerks/gherkit`). Der Branchname wechselt je Sitzung (zuletzt `claude/gallant-curie-0vvsib`); er ist in der Sitzung vorgegeben.
- Nachrichten sind teils diktiert (Tippfehler, «Becken» = Backend, «Ränder» = Render, «Guitar» = GitHub): grosszügig auslegen, bei Zweifel kurz zurückfragen.
- Der Nutzer testet oft nicht lokal. Wenn etwas abgenommen werden soll, zeigen statt beschreiben: Video über die CI (siehe unten) oder Bilder im Chat.
- **Arbeitsablauf (Vorgabe des Nutzers, 2026-11-07):** Jeder neue Auftrag startet auf einem eigenen Branch, und zu jedem Branch gehört sofort ein PR (Entwurf genügt), damit der Nutzer etwas zum Testen hat und der Stand der Arbeit dort abgebildet ist. Den PR nach dem ersten Push anlegen, nicht erst auf Nachfrage. Gemergt wird nur auf ausdrücklichen Wunsch, Schritt für Schritt.

## Offene Punkte und Reihenfolge (Analyse 2026-11-07, mit dem Nutzer besprochen)

Commands: fertig sind `fmt`, `lint`, `parse`, `dialects`, `edit`, `report`, `run` (Adapter Go, Java, `--cmd`). Es fehlen `init`, `ci`, `steps sync`, `glossary`, `coverage`, `jira`/Xray, `lsp`, Plugins, Adapter TS/.NET.

Lücken bei Debugging und Fehlerbehandlung: kein `--verbose`/`--quiet`, kein Logger, `run` zeigt Befehl/Umgebung nicht an, kein Panic-Handler in `cmd/gherkit`, keine Fehlercodes mit Hinweisen, keine Konfigurationsdatei (`.gherkit.yaml`), Fehlerbehandlung der Editor-HTTP-API ungeprüft. Vorhanden: Exit-Codes 0-3 (`docs/cli.md`), brauchbare Meldungen, Parser ohne Panics.

Empfohlene Reihenfolge: 1. `init` und `ci` (umgesetzt: `internal/scaffold`, `internal/cli/scaffold.go`, `features/scaffolding.feature`; nur in der CI getestet, Vorlagen für GitLab/Azure nicht auf den Plattformen erprobt), 2. Debugging/Fehlerbehandlung (Flags, Logger, Panic-Handler, Konfigurationsdatei; vor dem Pilot), 3. `v0.1.0` (in Arbeit, Branch `claude/release-0-1-0`: `VERSION`-Datei löst beim Merge nach `main` Release aus, vorher Abnahme je Plattform, siehe `docs/releasing.md`; ersetzt das manuelle Taggen; `ci`-Vorlagen laden Releases von GitHub), 4. `steps sync` und `glossary`, dann Jira/Xray (M3). Demo-Feinschliff und Report-Ausbau bis nach Pilotstart zurückstellen. Weitere offene Punkte: Render-Vorschau ungetestet, Live-Demo nicht bestätigt, Xray-Status für «Ignoriert» (TODO oder ABORTED) offen, Pilot beim Kunden (Gate vor M3).

## Projekt

Go-CLI **gherkit** (cobra): Gherkin `fmt`, `lint`, `parse`, `edit` (Web-Editor, eingebettet in `internal/server/web`, reines JS ohne Build), `report`, `run` (Runner-Adapter). Offizieller Cucumber-Gherkin-Parser, Format gegen den offiziellen Testkorpus abgesichert. Docs: `docs/` (ADRs 0001-0009, `testing.md`, `demo.md`, `editor-variants.md`, `roadmap.md`).

Beschlossen: erster Runner-Adapter Java (Go ebenfalls fertig), Jira Data Center mit Xray (noch nicht umgesetzt), Editor-Varianten Code, Dokument, Struktur (S1/S2) und Split (P1/P2) sind abgenommen.

## Manuelle Ausführung (ADR 0009)

Tag `@manual` markiert Szenarien, die Menschen testen; `gherkit run` schliesst sie per `--tags` (Standard `not @manual`, godog über `{tags_godog}`) aus. Editor-Tab «Ausführen» (`internal/server/web/run.js`, Texte mit Präfix `r_`): geführter Durchlauf Feature, Szenario, Schritt; Antworten Gut/Schlecht/Ignorieren (Begründung Pflicht bei Schlecht/Ignorieren, vom Server erzwungen), Kommentar und Nachweis im Schritt, Ergebnisübersicht, Jira-Text (`GET /api/manual/runs/{id}/issue`, Xray-Tag `@TEST_PROJ-123`). Paket `internal/manual` (Lauf, Speicher unter `.gherkit/runs/<id>/`, Export als Cucumber JSON mit Zusatzobjekt `gherkit`). Beispiel: `examples/bibliothek`. Konzept mit Varianten und offenen Fragen: `docs/concepts/manuelle-ausfuehrung.md`. Browser-Tests als Gherkin: `e2e/features/manual-run.feature` (Runner `e2e/support/gherkin.mjs`, Schritte `e2e/steps`).

## Öffentliche Demo (GitHub Pages)

Live unter https://goerks.github.io/gherkit/ (Editor: `/editor/`). Rein statisch, alles läuft im Browser (WebAssembly), Dateien der Besucher bleiben im Browser (IndexedDB, Schlüssel `gherkit-demo`).

Stand der Schritte (alle gemergt, PRs #5 bis #8):
1. Pages-Pipeline, Landing-Seite, Downloads (ZIPs für Windows/Linux/macOS, `standard-set.zip`, `SHA256SUMS.txt`)
2. CLI im Browser: `cmd/gherkit-wasm`, `demo/js/memfs.js` (Node-fs-Shim, muss vor `wasm_exec.js` laden), Terminal `demo/js/terminal.js`
3. Editor im Browser: `gherkitFetch` beantwortet die Editor-API im Prozess, `demo/js/demo.js` (boot, Persistenz, Reset, Export/Import ZIP), `demo/js/editor-boot.js`, `demo/js/zip.js`; Terminal-Dock unter dem Editor
4. Demo-Runner `gherkit run --adapter demo` (`internal/demorun`, Adapter mit `InProcess`)
5. **Offen: Feinschliff** (Report im Terminal ist seit PR #11 da) (Banner-Text "Im Aufbau" anpassen, Download-Dialog, mehr Beispieldateien, Tests gegen gebaute Seite weiter ausbauen)

Weitere offene Punkte:
- Erstes Release `v0.1.0` taggen (dauerhafte Download-Links statt `dev-<commit>`); vom Nutzer noch nicht entschieden.
- Ob die Live-Seite beim Nutzer wirklich funktioniert, wurde nach dem Cache-Fix noch nicht bestätigt (Test: Strg+F5, dann `gherkit run --adapter demo . --report report.html`, erwartet 17 Szenarien, 16 bestanden, 1 fehlgeschlagen, 6 `@manual` übersprungen).
- Jira/Xray-Anbindung, weitere Adapter (TS, .NET).

Wichtige Entwurfsentscheidungen der Demo:
- Seiten- und Skript-URLs tragen `?v={{VERSION}}`; `gherkit.wasm.gz` und `standard-set.json` laden mit `cache: 'no-cache'` (Pages cached sonst bis ca. 10 Minuten, das führte zu "unknown adapter demo").
- `scripts/build-site.sh` baut `build/site` (CLI-ZIPs, WASM gzip, `wasm_exec.js` aus `$(go env GOROOT)/lib/wasm/`, `standard-set.json`, Editor-Kopie mit ersetzten Script-Tags, Versionsplatzhalter per `sed`).
- Alle Besucher teilen den Ursprung `goerks.github.io` (gemeinsamer IndexedDB-Namensraum), kein Server, keine PR-Vorschauen.
- `window.gherkitApp.refresh()` in `internal/server/web/app.js` ist der Haken, damit der Editor nach Terminal-Befehlen neu lädt.

## Reports (Stand 2026-11-05, PR #11 gemergt)

Vorhanden: `internal/report` (Cucumber JSON nach HTML/Markdown/JSON, Go-Templates, EN/DE, manuelle Ergebnisse aus ADR 0009), `gherkit report` und `gherkit run --report`, Spezifikation `features/reporting.feature`, Doku `docs/cli.md`, `docs/manual-testing.md`.
Neu: In der Demo (Startseite und Editor) zeigt das Terminal HTML-Reports sofort unter sich an (`demo/js/terminal.js`, Pane `createPane`; Datei mit `-o …html` oder HTML-Ausgabe ohne `-o`; Links zu Dateien des virtuellen Ordners werden zu Blob-URLs). Das Standardset enthält Beispiel-Ergebnisse `examples/results/{gherkit,examples,manual}.cucumber.json` und `examples/evidence/`, erzeugt von `scripts/gen-preview-results.py` (Beispieldaten, keine Testläufe; bei Änderungen an `features/` oder `examples/` neu erzeugen). `internal/report/preview_results_test.go` prüft sie gegen den offiziellen Parser. Browser-Test in `e2e/demo.e2e.mjs`. Doku: `docs/render-preview.md`.
Bekannte Lücken: nur Cucumber JSON (keine Messages/NDJSON), keine Abdeckung nach Tags, keine Historie/Trends, keine Filter oder Suche im HTML, Jira/Xray-Verknüpfung fehlt, Report-Texte stehen im Code (`texts`), Evidenz-Pfade bei Reports an anderem Ort offen (ADR 0009). Der Nutzer wollte als Nächstes über den Report reden (Aussehen, Inhalte, Eingabeformate); Vergleich mit LivingDoc/Allure/Serenity wurde angeboten, nicht gemacht.
Bestehende Besucher der Demo haben noch das alte Standardset im Browser: im Terminal `reset`.

## Render-Vorschau pro PR (noch nicht bestätigt)

`render.yaml` (`previews.generation: automatic`) und `render/Dockerfile` (+ `render/Caddyfile`) bauen dieselbe statische Demo wie GitHub Pages (`SKIP_DOWNLOADS=1 scripts/build-site.sh`, ohne CLI-ZIPs) und liefern sie mit Caddy aus. Offen: Der Nutzer muss in Render einmalig ein Blueprint für `goerks/gherkit` verbinden; ob die Vorschau wirklich baut und startet, ist ungetestet. Ein Backend ist nicht nötig, solange Reports im Browser entstehen. Eine Render-Instanz mit echter gherkit (Webservice) bräuchte es nur für dauerhaft geteilte Reports oder echte Testläufe (go test, Maven); der Nutzer kann bei Bedarf eine Render-Instanz bereitstellen.

## Video und Bilder über die CI

Der Go-Proxy ist in der Sandbox gesperrt (403 auf `proxy.golang.org`, nicht umgehen): Go und die WebAssembly-Demo lassen sich nur in der CI bauen. Für Vorführungen gibt es `.github/workflows/demo-video.yml` mit `e2e/video/report-demo.mjs` (Playwright, Untertitel, ffmpeg wird installiert). Er läuft bei Änderungen an `e2e/video/**` oder am Workflow und per `workflow_dispatch`, legt das Artefakt `report-demo-video` ab und überschreibt `report-demo.mp4` auf dem Branch `demo-video` (nicht Teil der PRs, https://github.com/goerks/gherkit/blob/demo-video/report-demo.mp4). Das Skript anpassen, um andere Abläufe zu zeigen.

## CI und Verifikation

`.github/workflows/ci.yml`: unit (3 OS), windows binary (Artefakt `gherkit-windows-amd64`), acceptance (gherkit testet gherkit über `gherkit run --adapter go`), browser tests (Linux und Windows, Playwright), java adapter, goreleaser config, static site (baut Seite, `e2e/demo.e2e.mjs`), `verify` als Sammeljob. `pages.yml` veröffentlicht bei Push auf `main`. Was geprüft ist und was eine Person testen muss: `docs/testing.md`.

## Umgebungs-Fallen (Sandbox)

- Keine Go-Module ladbar (Proxy 403) und kein Internet (auch nicht github.io): gebaut und getestet wird **nur in der CI**. Lokal höchstens `gofmt`, `node --check`, `bash -n`, stdlib-only Pakete.
- Kein `gh`-CLI: GitHub-MCP-Tools nutzen. `merge_pull_request` braucht die volle 40-stellige `expectedHeadSha`; Squash-Merge ist die Konvention.
- **Force-Push wird vom Klassifizierer blockiert.** Nach einem Squash-Merge den Branch neu von `origin/main` aufsetzen, den alten Remote-Stand mit `git merge -s ours origin/<branch>` verbinden und normal pushen (der PR-Diff bleibt sauber).
- `git fetch`/`push` hängen gelegentlich bis zum Timeout; mit `timeout 90` aufrufen und danach mit `git ls-remote` prüfen, ob der Push trotzdem angekommen ist.
- Check-Run-Logs: `get_job_logs` mit `job_id` und `tail_lines`.
- Screenshots früher über einen temporären CI-Schritt, der Bilder in den PR-Branch committet (wurde jeweils wieder entfernt); Artefakt-Download ist blockiert.
- Commits enden mit der `Claude-Session:`-Zeile, PR-Beschreibungen mit dem Session-Link.
