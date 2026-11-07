package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/goerks/gherkit/internal/runner"
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

// TestMain lets the test binary act as a runner for `gherkit run`: it copies
// the file named by its first argument to the results path.
func TestMain(m *testing.M) {
	if os.Getenv("GHERKIT_TEST_RUNNER") == "1" {
		b, err := os.ReadFile(os.Args[1])
		if err != nil {
			os.Exit(2)
		}
		if err := os.WriteFile(os.Getenv("GHERKIT_RESULTS"), b, 0o644); err != nil {
			os.Exit(2)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

const twoScenarios = `[{"uri":"f.feature","keyword":"Feature","name":"F","elements":[
{"keyword":"Scenario","name":"ok","type":"scenario","steps":[{"keyword":"Given ","name":"a","line":1,"result":{"status":"passed","duration":1}}]},
{"keyword":"Scenario","name":"bad","type":"scenario","steps":[{"keyword":"Given ","name":"b","line":2,"result":{"status":"failed","duration":1}}]}]}]`

func TestRunSummarisesAndFails(t *testing.T) {
	d := t.TempDir()
	results := write(t, d, "results.json", twoScenarios)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	args := []string{"run", "--dir", d, "-e", "GHERKIT_TEST_RUNNER=1", "--cmd", runner.Quote(exe) + " " + runner.Quote(results), "--report", filepath.Join(d, "r.md")}
	code, _, errOut := run(args...)
	if code != ExitFailed || !strings.Contains(errOut, "2 scenario(s): 1 passed, 1 failed") {
		t.Fatalf("a failed scenario should fail the run: %d %q", code, errOut)
	}
	if b, err := os.ReadFile(filepath.Join(d, "r.md")); err != nil || !strings.Contains(string(b), "bad") {
		t.Fatalf("report not written: %q, %v", b, err)
	}
	if code, _, _ := run(append(args, "--fail-on-failed=false")...); code != ExitOK {
		t.Fatalf("--fail-on-failed=false should not fail, got %d", code)
	}
}

func TestRunUsageErrors(t *testing.T) {
	empty := t.TempDir()
	for name, tc := range map[string]struct {
		args []string
		want string
	}{
		"no adapter":      {[]string{"run", "--dir", empty}, "no adapter detected"},
		"unknown adapter": {[]string{"run", "--adapter", "cobol", "--dir", empty}, "unknown adapter"},
		"missing folder":  {[]string{"run", "--cmd", "x", "--dir", filepath.Join(empty, "nope")}, "not a folder"},
		"no results":      {[]string{"run", "--dir", empty, "--cmd", "exit 0"}, "wrote no results"},
	} {
		code, _, errOut := run(tc.args...)
		if code != ExitUsage || !strings.Contains(errOut, tc.want) {
			t.Errorf("%s: got %d %q, want %d containing %q", name, code, errOut, ExitUsage, tc.want)
		}
	}
	if code, _, errOut := run("run", "--dir", empty, "--cmd", "exit 1"); code != ExitFailed || !strings.Contains(errOut, "wrote no results") {
		t.Errorf("a failing runner without results: %d %q", code, errOut)
	}
}

func TestInitWritesExampleAndKeepsFiles(t *testing.T) {
	d := filepath.Join(t.TempDir(), "specs")
	code, out, _ := run("init", d, "--lang", "de")
	if code != ExitOK || !strings.Contains(out, "created") {
		t.Fatalf("init: %d %q", code, out)
	}
	p := filepath.Join(d, "features", "example.feature")
	if b, _ := os.ReadFile(p); !strings.Contains(string(b), "Funktionalität") {
		t.Fatalf("example: %q", b)
	}
	// A folder with features gets no second example.
	if code, _, errs := run("init", d); code != ExitOK || !strings.Contains(errs, "no example is written") {
		t.Fatalf("second init: %d %q", code, errs)
	}
	if code, _, _ := run("init", d, "--lang", "xx"); code != ExitUsage {
		t.Fatalf("unknown language: %d", code)
	}
}

func TestInitDryRunWritesNothing(t *testing.T) {
	d := t.TempDir()
	code, out, _ := run("init", d, "--dry-run", "--ci", "github")
	if code != ExitOK || !strings.Contains(out, "gherkit.yml") {
		t.Fatalf("dry run: %d %q", code, out)
	}
	if found, _ := os.ReadDir(d); len(found) != 0 {
		t.Fatalf("dry run wrote %d entries", len(found))
	}
}

func TestCIDetectsAdapterAndRefusesOverwrite(t *testing.T) {
	d := t.TempDir()
	write(t, d, "go.mod", "module x\n")
	write(t, d, "features/a.feature", "Feature: A\n")
	if code, _, errs := run("ci", d); code != ExitOK || !strings.Contains(errs, "detected the go runner") {
		t.Fatalf("ci: %d %q", code, errs)
	}
	b, err := os.ReadFile(filepath.Join(d, ".github", "workflows", "gherkit.yml"))
	if err != nil || !strings.Contains(string(b), "gherkit run --adapter go") || !strings.Contains(string(b), "gherkit fmt --check features") {
		t.Fatalf("pipeline: %v\n%s", err, b)
	}
	if code, _, errs := run("ci", d); code != ExitUsage || !strings.Contains(errs, "--force") {
		t.Fatalf("overwrite: %d %q", code, errs)
	}
	if code, _, _ := run("ci", d, "--force"); code != ExitOK {
		t.Fatalf("force: %d", code)
	}
}

func TestCIPrintsAndRejectsBadChoices(t *testing.T) {
	d := t.TempDir()
	if code, out, _ := run("ci", d, "-o", "-", "--provider", "gitlab", "--adapter", "none"); code != ExitOK || !strings.Contains(out, "gherkit lint --strict") || strings.Contains(out, "gherkit run") {
		t.Fatalf("print: %d %q", code, out)
	}
	for _, args := range [][]string{{"--provider", "jenkins"}, {"--adapter", "dotnet"}, {"--version", "1 2"}, {"-o", "../x.yml"}} {
		if code, _, _ := run(append([]string{"ci", d}, args...)...); code != ExitUsage {
			t.Errorf("%v: exit %d", args, code)
		}
	}
}
