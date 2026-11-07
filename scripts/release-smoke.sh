#!/usr/bin/env bash
# Acceptance check of a released gherkit binary on its target platform (Linux, macOS, Windows via Git Bash).
# Usage: scripts/release-smoke.sh <path to gherkit> <expected version, e.g. 0.1.0>
# It exercises the shipped binary the way a user does: version, format, lint, parse, report, init, ci,
# run with a runner command, the editor server. The full behaviour specification runs separately
# (go test ./acceptance with GHERKIT_BINARY).
set -euo pipefail

bin="$1"; want="$2"
case "$bin" in /*|[A-Za-z]:*) ;; *) bin="$PWD/$bin" ;; esac
examples="$(cd "$(dirname "$bin")" && pwd)/examples"
work="$(mktemp -d)"
trap 'kill "${editor_pid:-0}" 2>/dev/null || true; rm -rf "$work"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }
g() { "$bin" "$@"; }

step "version"
out="$(g --version)"; echo "$out"
case "$out" in "gherkit $want "*) ;; *) fail "expected 'gherkit $want (<commit>)', got '$out'" ;; esac

step "the archive contains the examples"
[ -f "$examples/shop/checkout.feature" ] || fail "examples are missing next to the binary"

step "fmt and lint on the examples (the files are copied, fmt --check must not change them)"
cp -r "$examples" "$work/examples"
set +e; g lint "$work/examples" | tail -3; code=${PIPESTATUS[0]}; set -e
[ "$code" -le 2 ] || fail "lint failed to run (exit $code)"
g fmt "$work/examples" >/dev/null

step "fmt --check and lint exit codes"
printf 'Feature:   Bad\n' > "$work/bad.feature"
set +e; g fmt --check "$work/bad.feature" >/dev/null; code=$?; set -e
[ "$code" -eq 2 ] || fail "fmt --check exit code $code, want 2"
g fmt "$work/bad.feature" >/dev/null
g fmt --check "$work/bad.feature" >/dev/null || fail "formatted file still needs formatting"

step "line endings: CRLF stays CRLF, LF stays LF (exact bytes)"
# Compared as hex dumps: grep, cmp and diff behave differently in text mode of Git Bash on Windows, od does not.
bytes() { od -An -v -tx1 "$1" | tr -d ' \n'; }
same_bytes() { [ "$(bytes "$1")" = "$(bytes "$2")" ]; }
# 1. a CRLF file that is already canonical is not changed at all
printf 'Feature: Crlf\r\n\r\n  Scenario: S\r\n    Given x\r\n' > "$work/crlf.feature"
cp "$work/crlf.feature" "$work/crlf.expected"
g fmt "$work/crlf.feature" >/dev/null
same_bytes "$work/crlf.feature" "$work/crlf.expected" || fail "fmt changed a canonical CRLF file: $(bytes "$work/crlf.feature")"
# 2. a CRLF file that needs formatting is formatted and keeps CRLF
printf 'Feature:   Crlf\r\n\r\n  Scenario:   S\r\n      Given x\r\n' > "$work/crlf2.feature"
g fmt "$work/crlf2.feature" >/dev/null
same_bytes "$work/crlf2.feature" "$work/crlf.expected" || fail "fmt did not format a CRLF file to the CRLF form: $(bytes "$work/crlf2.feature")"
# 3. an LF file stays LF
printf 'Feature:   Lf\n\n  Scenario: S\n    Given x\n' > "$work/lf.feature"
printf 'Feature: Lf\n\n  Scenario: S\n    Given x\n' > "$work/lf.expected"
g fmt "$work/lf.feature" >/dev/null
same_bytes "$work/lf.feature" "$work/lf.expected" || fail "fmt did not format an LF file to the LF form: $(bytes "$work/lf.feature")"

step "parse and dialects"
g parse "$examples/shop/checkout.feature" | grep -q '"feature"' || fail "parse printed no feature"
g dialects de | grep -q "Szenario" || fail "dialects de"

step "run starts a runner command and reports"
cat > "$work/results.json" <<'JSON'
[{"uri":"f.feature","keyword":"Feature","name":"F","elements":[{"keyword":"Scenario","name":"ok","type":"scenario","steps":[{"keyword":"Given ","name":"a","line":1,"result":{"status":"passed","duration":1}}]},{"keyword":"Scenario","name":"bad","type":"scenario","steps":[{"keyword":"Given ","name":"b","line":2,"result":{"status":"failed","duration":1}}]}]}]
JSON
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) runner='copy results.json {output}' ;;
  *) runner='cp results.json {output}' ;;
esac
(cd "$work" && set +e && g run --cmd "$runner" -o "out dir/cucumber.json" --report "out dir/report.html"; code=$?; set -e; [ "$code" -eq 1 ]) || fail "run did not exit with 1 on a failed scenario"
[ -s "$work/out dir/cucumber.json" ] || fail "no Cucumber JSON kept"
grep -q "1 / 2" "$work/out dir/report.html" || fail "report does not show 1 / 2"

step "report from Cucumber JSON in all formats"
for f in html md json; do g report "$work/results.json" -f "$f" -o "$work/r.$f" || fail "report $f"; [ -s "$work/r.$f" ] || fail "empty report.$f"; done

step "demo runner (built in, no external tools)"
(cd "$work/examples" && g run --adapter demo --fail-on-failed=false --report "$work/demo.html" 2>&1 | tail -2)
[ -s "$work/demo.html" ] || fail "no demo report"

step "init and ci"
g init "$work/proj" --ci github >/dev/null
[ -f "$work/proj/features/example.feature" ] || fail "init wrote no example"
grep -q "gherkit lint --strict" "$work/proj/.github/workflows/gherkit.yml" || fail "ci pipeline"
g lint --strict "$work/proj/features" >/dev/null || fail "the init example does not pass its own lint"
g fmt --check "$work/proj/features" >/dev/null || fail "the init example is not formatted"
for p in gitlab azure; do g ci --provider "$p" -o - >/dev/null || fail "ci $p"; done

step "editor server answers"
g edit "$examples" --addr 127.0.0.1:0 --no-open > "$work/editor.log" 2>&1 &
editor_pid=$!
url=""
for _ in $(seq 1 50); do
  url="$(grep -o 'http://[^ ]*' "$work/editor.log" | head -1 || true)"
  [ -n "$url" ] && break
  sleep 0.2
done
[ -n "$url" ] || { cat "$work/editor.log"; fail "the editor did not start"; }
page="$(curl -fsS "$url")" || fail "editor page"
echo "$page" | grep -qi "gherkit" || fail "editor page has no content"
curl -fsS "${url}app.js" >/dev/null || fail "editor script"

echo
echo "release smoke test passed: gherkit $want"
