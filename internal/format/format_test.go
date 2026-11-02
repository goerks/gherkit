package format

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	messages "github.com/cucumber/messages/go/v34"
	"github.com/goerks/gherkit/internal/parse"
)

func specFiles(t *testing.T, kind string) []string {
	t.Helper()
	files, err := filepath.Glob(filepath.Join("..", "..", "testdata", "spec", kind, "*.feature"))
	if err != nil || len(files) == 0 {
		t.Fatalf("no spec corpus found: %v", err)
	}
	return files
}

// picklesKey reduces pickles to their meaning (names, steps, arguments, tags)
// without ids and source locations, so two documents can be compared.
func picklesKey(t *testing.T, ps []*messages.Pickle) string {
	t.Helper()
	type step struct {
		Text string
		Type string
		Arg  *messages.PickleStepArgument
	}
	type pickle struct {
		Name, Language string
		Tags           []string
		Steps          []step
	}
	var out []pickle
	for _, p := range ps {
		pk := pickle{Name: p.Name, Language: p.Language}
		for _, tg := range p.Tags {
			pk.Tags = append(pk.Tags, tg.Name)
		}
		for _, s := range p.Steps {
			pk.Steps = append(pk.Steps, step{s.Text, string(s.Type), s.Argument})
		}
		out = append(out, pk)
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// TestSpecCorpusRoundTrip proves that formatting never changes the meaning of
// any document of the official Gherkin test corpus.
func TestSpecCorpusRoundTrip(t *testing.T) {
	for _, f := range specFiles(t, "good") {
		f := f
		t.Run(filepath.Base(f), func(t *testing.T) {
			b, err := os.ReadFile(f)
			if err != nil {
				t.Fatal(err)
			}
			orig := parse.Source(f, string(b))
			if !orig.OK() {
				t.Fatalf("official good file does not parse: %v", orig.Errors)
			}
			out, diags := Source(string(b))
			if diags != nil {
				t.Fatalf("format reported errors: %v", diags)
			}
			again := parse.Source(f, out)
			if !again.OK() {
				t.Fatalf("formatted output does not parse: %v\n---\n%s", again.Errors, out)
			}
			if a, b := picklesKey(t, orig.Pickles), picklesKey(t, again.Pickles); a != b {
				t.Fatalf("pickles changed by formatting\nbefore: %s\nafter:  %s\n---\n%s", a, b, out)
			}
			if len(orig.Document.Comments) != len(again.Document.Comments) {
				t.Errorf("comments: %d before, %d after", len(orig.Document.Comments), len(again.Document.Comments))
			}
			if out2, _ := Source(out); out2 != out {
				t.Errorf("formatting is not idempotent\nfirst:\n%s\nsecond:\n%s", out, out2)
			}
		})
	}
}

func TestBadCorpusIsRejected(t *testing.T) {
	for _, f := range specFiles(t, "bad") {
		b, _ := os.ReadFile(f)
		out, diags := Source(string(b))
		if len(diags) == 0 {
			t.Errorf("%s: expected syntax errors", filepath.Base(f))
		}
		if out != string(b) {
			t.Errorf("%s: broken file must be returned unchanged", filepath.Base(f))
		}
	}
}

func TestCanonicalLayout(t *testing.T) {
	in := "@a   @b\nFeature:   Layout\n      Free text\n\n\nBackground:\nGiven x\nScenario Outline: S <n>\n  When n is <n>\n    |a|b\\|c|\n Examples:\n |n|\n |1|\n |22|\n"
	want := `@a @b
Feature: Layout
  Free text

  Background:
    Given x

  Scenario Outline: S <n>
    When n is <n>
      | a | b\|c |

    Examples:
      | n  |
      | 1  |
      | 22 |
`
	got, diags := Source(in)
	if diags != nil {
		t.Fatal(diags)
	}
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestDocStringEscapingAndLanguage(t *testing.T) {
	in := "# language: de\nFunktionalität: F\n  Szenario: S\n    Angenommen Text:\n      ```json\n      a \\`\\`\\` b\n      \"\"\"\n      ```\n"
	got, diags := Source(in)
	if diags != nil {
		t.Fatal(diags)
	}
	if !strings.HasPrefix(got, "# language: de\n") {
		t.Errorf("language header lost:\n%s", got)
	}
	if !strings.Contains(got, "a \\`\\`\\` b") || !strings.Contains(got, "      \"\"\"\n") {
		t.Errorf("docstring escaping wrong:\n%s", got)
	}
}

func TestCommentsAreKept(t *testing.T) {
	in := "# top\nFeature: F\n  # before scenario\n  Scenario: S\n    # before step\n    Given x\n      # in table\n      | a |\n# end\n"
	got, _ := Source(in)
	for _, c := range []string{"# top", "# before scenario", "# before step", "# in table", "# end"} {
		if !strings.Contains(got, c) {
			t.Errorf("comment %q lost:\n%s", c, got)
		}
	}
}

func TestEscapeCell(t *testing.T) {
	cases := map[string]string{`a|b`: `a\|b`, `a\b`: `a\\b`, "a\nb": `a\nb`, `plain`: `plain`}
	for in, want := range cases {
		if got := EscapeCell(in); got != want {
			t.Errorf("EscapeCell(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDocumentWithoutLocations(t *testing.T) {
	// The structured editor sends documents with new nodes that have no
	// source location; the printer must handle them.
	doc := &messages.GherkinDocument{Feature: &messages.Feature{Keyword: "Feature", Name: "New", Language: "en", Children: []*messages.FeatureChild{
		{Scenario: &messages.Scenario{Keyword: "Scenario", Name: "S", Steps: []*messages.Step{{Keyword: "Given ", Text: "x"}}}},
	}}}
	want := "Feature: New\n\n  Scenario: S\n    Given x\n"
	if got := Document(doc, Default); got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestCheck(t *testing.T) {
	ok, _, err := Check("Feature: F\n")
	if !ok || err != nil {
		t.Fatalf("formatted input reported as unformatted: %v %v", ok, err)
	}
	ok, _, _ = Check("Feature:   F\n")
	if ok {
		t.Fatal("unformatted input reported as formatted")
	}
	if _, _, err := Check("Feature: F\n  Scenario: S\n    Given x\n      | a |\n      | b | c |\n"); err == nil {
		t.Fatal("syntax error not reported")
	}
}
