package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func run(args ...string) (int, string, string) {
	var out, errb bytes.Buffer
	code := Execute(args, &out, &errb)
	return code, out.String(), errb.String()
}

func write(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	os.MkdirAll(filepath.Dir(p), 0o755)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestFmtCheckAndWrite(t *testing.T) {
	d := t.TempDir()
	p := write(t, d, "a.feature", "Feature:   A\n")
	if code, out, _ := run("fmt", "--check", d); code != ExitProblems || !strings.Contains(out, "a.feature") {
		t.Fatalf("check: %d %q", code, out)
	}
	if code, _, _ := run("fmt", d); code != ExitOK {
		t.Fatalf("fmt: %d", code)
	}
	if b, _ := os.ReadFile(p); string(b) != "Feature: A\n" {
		t.Fatalf("not formatted: %q", b)
	}
	if code, _, _ := run("fmt", "--check", d); code != ExitOK {
		t.Fatalf("second check: %d", code)
	}
}

func TestLintOutputsAndExitCodes(t *testing.T) {
	d := t.TempDir()
	write(t, d, "ok.feature", "Feature: OK\n\n  Scenario: S\n    Given x\n")
	if code, out, _ := run("lint", d); code != ExitOK || !strings.Contains(out, "0 error(s)") {
		t.Fatalf("clean: %d %q", code, out)
	}
	write(t, d, "bad.feature", "Feature: Bad\n  Scenario: S\n    Given x\n      | a |\n      | 1 | 2 |\n")
	code, out, _ := run("lint", "-o", "github", d)
	if code != ExitProblems || !strings.Contains(out, "::error file=") {
		t.Fatalf("github: %d %q", code, out)
	}
	if code, out, _ := run("lint", "-o", "json", filepath.Join(d, "ok.feature")); code != ExitOK || strings.TrimSpace(out) != "[]" {
		t.Fatalf("json: %d %q", code, out)
	}
	write(t, d, "warn/w.feature", "Feature: W\n\n  Scenario: S\n")
	if code, _, _ := run("lint", "--strict", filepath.Join(d, "warn")); code != ExitProblems {
		t.Fatalf("strict: %d", code)
	}
}

func TestReport(t *testing.T) {
	d := t.TempDir()
	in := write(t, d, "r.json", `[{"uri":"a.feature","keyword":"Feature","name":"A","elements":[{"keyword":"Scenario","name":"S","type":"scenario","steps":[{"keyword":"Given ","name":"x","result":{"status":"failed","error_message":"e"}}]}]}]`)
	out := filepath.Join(d, "r.html")
	code, _, stderr := run("report", in, "-o", out, "--fail-on-failed")
	if code != ExitFailed || !strings.Contains(stderr, "1 failed") {
		t.Fatalf("%d %q", code, stderr)
	}
	if b, _ := os.ReadFile(out); !strings.Contains(string(b), "<html") {
		t.Fatal("no html written")
	}
	if code, _, _ := run("report", filepath.Join(d, "missing.json")); code != ExitUsage {
		t.Fatalf("missing input: %d", code)
	}
}

func TestParseDialectsVersion(t *testing.T) {
	d := t.TempDir()
	p := write(t, d, "o.feature", "Feature: F\n  Scenario Outline: S\n    Given <a>\n    Examples:\n      | a |\n      | 1 |\n      | 2 |\n")
	if code, out, _ := run("parse", "--pickles", p); code != ExitOK || strings.Count(out, `"uri":`) != 2 {
		t.Fatalf("pickles: %d", code)
	}
	if code, out, _ := run("dialects", "de"); code != ExitOK || !strings.Contains(out, "Funktionalität") {
		t.Fatalf("dialects de: %q", out)
	}
	if code, _, _ := run("dialects", "nope"); code != ExitUsage {
		t.Fatalf("unknown dialect: %d", code)
	}
	if code, out, _ := run("--version"); code != ExitOK || !strings.HasPrefix(out, "gherkit ") {
		t.Fatalf("version: %q", out)
	}
	if code, _, _ := run("nosuchcommand"); code != ExitUsage {
		t.Fatalf("unknown command: %d", code)
	}
}
