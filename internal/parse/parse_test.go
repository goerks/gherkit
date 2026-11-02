package parse

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSourceProducesDocumentPicklesAndTokens(t *testing.T) {
	src := "@t\nFeature: F\n  Scenario Outline: S <x>\n    Given <x>\n    Examples:\n      | x |\n      | 1 |\n      | 2 |\n"
	r := Source("f.feature", src)
	if !r.OK() {
		t.Fatalf("unexpected errors: %v", r.Errors)
	}
	if r.Document.Feature.Name != "F" || r.Document.Uri != "f.feature" {
		t.Fatalf("bad document: %+v", r.Document.Feature)
	}
	if len(r.Pickles) != 2 || r.Pickles[1].Name != "S 2" {
		t.Fatalf("expected 2 pickles, got %d", len(r.Pickles))
	}
	want := map[int]string{1: "TagLine", 2: "FeatureLine", 3: "ScenarioLine", 4: "StepLine", 5: "ExamplesLine", 6: "TableRow"}
	got := map[int]string{}
	for _, tk := range r.Tokens {
		got[tk.Line] = tk.Type
	}
	for line, typ := range want {
		if got[line] != typ {
			t.Errorf("line %d: token %q, want %q", line, got[line], typ)
		}
	}
	if r.Tokens[3].KeywordType != "Context" || r.Tokens[3].Indent != 4 {
		t.Errorf("step token: %+v", r.Tokens[3])
	}
}

func TestErrorsArePositioned(t *testing.T) {
	r := Source("x", "Feature: F\n  Scenario: S\n    Given x\n      | a | b |\n      | 1 |\n")
	if r.OK() {
		t.Fatal("expected an error")
	}
	if e := r.Errors[0]; e.Line != 5 || e.Column < 1 || e.Rule != "syntax" || e.Severity != "error" {
		t.Fatalf("bad diagnostic: %+v", e)
	}
	if r.Document == nil {
		t.Fatal("best-effort document missing")
	}
}

func TestLanguageHeader(t *testing.T) {
	r := Source("x", "# language: fr\nFonctionnalité: F\n  Scénario: S\n    Soit x\n")
	if !r.OK() || r.Language != "fr" {
		t.Fatalf("language %q, errors %v", r.Language, r.Errors)
	}
}

func TestDialects(t *testing.T) {
	all := Dialects()
	if len(all) < 70 {
		t.Fatalf("expected the full built-in language list, got %d", len(all))
	}
	de, ok := DialectFor("de")
	if !ok || de.Keywords["feature"][0] != "Funktionalität" {
		t.Fatalf("german dialect: %+v", de)
	}
	if _, ok := DialectFor("xx-none"); ok {
		t.Fatal("unknown dialect must not be found")
	}
}

func TestOfficialCorpus(t *testing.T) {
	good, _ := filepath.Glob("../../testdata/spec/good/*.feature")
	bad, _ := filepath.Glob("../../testdata/spec/bad/*.feature")
	if len(good) == 0 || len(bad) == 0 {
		t.Fatal("spec corpus missing")
	}
	for _, f := range good {
		b, _ := os.ReadFile(f)
		if r := Source(f, string(b)); !r.OK() {
			t.Errorf("%s: %v", f, r.Errors)
		}
	}
	for _, f := range bad {
		b, _ := os.ReadFile(f)
		if r := Source(f, string(b)); r.OK() {
			t.Errorf("%s: expected errors", f)
		}
	}
}
