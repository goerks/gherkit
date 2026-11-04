#!/bin/sh
# Runs `gherkit report` on the sample results and serves the output (Render preview).
# Every command is printed to the log and listed with its exit code on the start page.
set -u
WWW=/srv/www
mkdir -p "$WWW"
cp -r /app/results "$WWW/results"
cd "$WWW"
ROWS=""

run() { # run <label> <output file or -> -- <gherkit args...>
  label=$1; out=$2; shift 2
  echo "+ gherkit $*"
  gherkit "$@" 2>"$WWW/.err"
  code=$?
  cat "$WWW/.err"
  msg=$(tr '\n' ' ' <"$WWW/.err" | sed 's/&/\&amp;/g; s/</\&lt;/g')
  link="$label"; [ "$out" != "-" ] && link="<a href=\"$out\">$label</a>"
  ROWS="$ROWS<tr><td>$link</td><td><code>gherkit $*</code></td><td>$code</td><td>$msg</td></tr>"
}

ALL="results/gherkit.cucumber.json results/examples.cucumber.json results/manual.cucumber.json"
AUTO="results/gherkit.cucumber.json results/examples.cucumber.json"

run "Alle Ergebnisse (HTML, en)"    report.html     report $ALL -o report.html --title "gherkit preview"
run "Alle Ergebnisse (HTML, de)"    report.de.html  report $ALL -o report.de.html --lang de --title "gherkit Vorschau"
run "Alle Ergebnisse (Markdown)"    report.md       report $ALL -o report.md --title "gherkit preview"
run "Alle Ergebnisse (JSON)"        report.json     report $ALL -o report.json
run "Nur automatisiert"             automated.html  report $AUTO -o automated.html --title "Automatisiert"
run "Nur manuell"                   manual.html     report results/manual.cucumber.json -o manual.html --title "Manuell"
run "Mit --fail-on-failed (Exit 1 erwartet)" -      report $ALL -o /dev/null --fail-on-failed
run "Eigenes Template"              custom.txt      report $ALL -t /app/custom.tmpl -o custom.txt

cat >index.html <<H
<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>gherkit Render-Vorschau</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}table{border-collapse:collapse}code{font-size:13px}</style>
<h1>gherkit Render-Vorschau</h1>
<p>Beim Start des Containers wurde <code>gherkit report</code> mit den Beispiel-Ergebnissen aus <a href="results/gherkit.cucumber.json">gherkit</a>, <a href="results/examples.cucumber.json">examples</a> und <a href="results/manual.cucumber.json">manual</a> ausgeführt (Cucumber JSON, erzeugt von <code>scripts/gen-preview-results.py</code>, keine echten Testläufe).</p>
<table><tr><th>Ergebnis</th><th>Befehl</th><th>Exit</th><th>Ausgabe</th></tr>$ROWS</table>
<p>Der Befehl mit <code>--fail-on-failed</code> beendet sich mit 1, weil Beispiele absichtlich fehlschlagen.</p>
</html>
H
rm -f "$WWW/.err"
echo "serving on :${PORT:-10000}"
exec httpd -f -p "${PORT:-10000}" -h "$WWW"
