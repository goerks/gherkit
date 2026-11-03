# gherkit: Arbeitsstand und Arbeitsweise

Wird von Claude Code automatisch gelesen. Stand: 2026-11-03.

## Auftraggeber und Stil

- Michael Burkard, BBV Software Services AG (michael.burkard@bbv.ch). Kommunikation auf Deutsch, kurz.
- Bilder von UI-Änderungen direkt im Chat zeigen, keine Links.
- Alles läuft über GitHub (`goerks/gherkit`). Branch der Sitzungen: `claude/dreamy-einstein-6b9xle`.
- Nur PRs erstellen, wenn gewünscht. In dieser Sitzung wollte der Nutzer ausdrücklich PRs und Merges Schritt für Schritt.

## Projekt

Go-CLI **gherkit** (cobra): Gherkin `fmt`, `lint`, `parse`, `edit` (Web-Editor, eingebettet in `internal/server/web`, reines JS ohne Build), `report`, `run` (Runner-Adapter). Offizieller Cucumber-Gherkin-Parser, Format gegen den offiziellen Testkorpus abgesichert. Docs: `docs/` (ADRs 0001-0008, `testing.md`, `demo.md`, `editor-variants.md`, `roadmap.md`).

Beschlossen: erster Runner-Adapter Java (Go ebenfalls fertig), Jira Data Center mit Xray (noch nicht umgesetzt), Editor-Varianten Code, Dokument, Struktur (S1/S2) und Split (P1/P2) sind abgenommen.

## Öffentliche Demo (GitHub Pages)

Live unter https://goerks.github.io/gherkit/ (Editor: `/editor/`). Rein statisch, alles läuft im Browser (WebAssembly), Dateien der Besucher bleiben im Browser (IndexedDB, Schlüssel `gherkit-demo`).

Stand der Schritte (alle gemergt, PRs #5 bis #8):
1. Pages-Pipeline, Landing-Seite, Downloads (ZIPs für Windows/Linux/macOS, `standard-set.zip`, `SHA256SUMS.txt`)
2. CLI im Browser: `cmd/gherkit-wasm`, `demo/js/memfs.js` (Node-fs-Shim, muss vor `wasm_exec.js` laden), Terminal `demo/js/terminal.js`
3. Editor im Browser: `gherkitFetch` beantwortet die Editor-API im Prozess, `demo/js/demo.js` (boot, Persistenz, Reset, Export/Import ZIP), `demo/js/editor-boot.js`, `demo/js/zip.js`; Terminal-Dock unter dem Editor
4. Demo-Runner `gherkit run --adapter demo` (`internal/demorun`, Adapter mit `InProcess`)
5. **Offen: Feinschliff** (Banner-Text "Im Aufbau" anpassen, Download-Dialog, mehr Beispieldateien, Tests gegen gebaute Seite weiter ausbauen)

Weitere offene Punkte:
- Erstes Release `v0.1.0` taggen (dauerhafte Download-Links statt `dev-<commit>`); vom Nutzer noch nicht entschieden.
- Ob die Live-Seite beim Nutzer wirklich funktioniert, wurde nach dem Cache-Fix noch nicht bestätigt (Test: Strg+F5, dann `gherkit run --adapter demo . --report report.html`, erwartet 9 Szenarien, 8 bestanden, 1 fehlgeschlagen).
- Jira/Xray-Anbindung, weitere Adapter (TS, .NET).

Wichtige Entwurfsentscheidungen der Demo:
- Seiten- und Skript-URLs tragen `?v={{VERSION}}`; `gherkit.wasm.gz` und `standard-set.json` laden mit `cache: 'no-cache'` (Pages cached sonst bis ca. 10 Minuten, das führte zu "unknown adapter demo").
- `scripts/build-site.sh` baut `build/site` (CLI-ZIPs, WASM gzip, `wasm_exec.js` aus `$(go env GOROOT)/lib/wasm/`, `standard-set.json`, Editor-Kopie mit ersetzten Script-Tags, Versionsplatzhalter per `sed`).
- Alle Besucher teilen den Ursprung `goerks.github.io` (gemeinsamer IndexedDB-Namensraum), kein Server, keine PR-Vorschauen.
- `window.gherkitApp.refresh()` in `internal/server/web/app.js` ist der Haken, damit der Editor nach Terminal-Befehlen neu lädt.

## CI und Verifikation

`.github/workflows/ci.yml`: unit (3 OS), windows binary (Artefakt `gherkit-windows-amd64`), acceptance (gherkit testet gherkit über `gherkit run --adapter go`), browser tests (Linux und Windows, Playwright), java adapter, goreleaser config, static site (baut Seite, `e2e/demo.e2e.mjs`), `verify` als Sammeljob. `pages.yml` veröffentlicht bei Push auf `main`. Was geprüft ist und was eine Person testen muss: `docs/testing.md`.

## Umgebungs-Fallen (Sandbox)

- Keine Go-Module ladbar und kein Internet (auch nicht github.io): gebaut und getestet wird **nur in der CI**. Lokal höchstens `gofmt`, `node --check`, `bash -n`, stdlib-only Pakete.
- Kein `gh`-CLI: GitHub-MCP-Tools nutzen. `merge_pull_request` braucht die volle 40-stellige `expectedHeadSha`; Squash-Merge ist die Konvention.
- **Force-Push wird vom Klassifizierer blockiert.** Nach einem Squash-Merge den Branch neu von `origin/main` aufsetzen, den alten Remote-Stand mit `git merge -s ours origin/<branch>` verbinden und normal pushen (der PR-Diff bleibt sauber).
- `git fetch`/`push` hängen gelegentlich bis zum Timeout; mit `timeout 90` aufrufen und danach mit `git ls-remote` prüfen, ob der Push trotzdem angekommen ist.
- Check-Run-Logs: `get_job_logs` mit `job_id` und `tail_lines`.
- Screenshots früher über einen temporären CI-Schritt, der Bilder in den PR-Branch committet (wurde jeweils wieder entfernt); Artefakt-Download ist blockiert.
- Commits enden mit der `Claude-Session:`-Zeile, PR-Beschreibungen mit dem Session-Link.
