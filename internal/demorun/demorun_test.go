package demorun

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunStandardSet(t *testing.T) {
	dir := filepath.Join("..", "..", "examples")
	files, err := FindFeatures(dir)
	if err != nil || len(files) != 6 {
		t.Fatalf("FindFeatures = %v, %v", files, err)
	}
	outFile := filepath.Join(t.TempDir(), "r.json")
	var stdout, stderr bytes.Buffer
	o, err := Run(dir, files, outFile, &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	// checkout: 5 scenarios, anmeldung: 3, bibliothek: 8 automated (the 6 @manual ones are left to people),
	// broken.feature: syntax errors count as one failure
	if o.Scenarios != 17 || o.Passed != 16 || o.Failed != 1 || o.Undefined != 0 || o.Manual != 6 || !o.Failing() {
		t.Fatalf("outcome = %+v\nstdout:\n%s\nstderr:\n%s", o, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), "broken.feature: syntax errors") {
		t.Errorf("stdout lacks the broken file:\n%s", stdout.String())
	}
	data, err := os.ReadFile(outFile)
	if err != nil {
		t.Fatal(err)
	}
	var feats []cjFeature
	if err := json.Unmarshal(data, &feats); err != nil || len(feats) != 6 {
		t.Fatalf("results are not Cucumber JSON for six features: %v\n%s", err, data)
	}
	for _, f := range feats {
		for _, e := range f.Elements {
			if e.Line == 0 || len(e.Steps) == 0 {
				t.Errorf("%s: element %q has no line or steps", f.URI, e.Name)
			}
			for _, s := range e.Steps {
				if s.Line == 0 || s.Keyword == "" {
					t.Errorf("%s: step %q has no line or keyword", f.URI, s.Name)
				}
			}
		}
	}
}

func TestFailingAndUndefinedSteps(t *testing.T) {
	dir := t.TempDir()
	src := "Feature: F\n\n  Scenario: wrong total\n    Given the product catalogue contains:\n      | product | price |\n      | Pen     | 2.00  |\n    And a shopping cart with 3 \"Pen\"\n    When the customer enters the discount code \"VIP20\"\n    Then the total is 6.00 CHF\n    And something else\n\n  Scenario: unknown\n    Given a step nobody implemented\n    Then the total is 1.00 CHF\n"
	if err := os.WriteFile(filepath.Join(dir, "a.feature"), []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	o, err := Run(dir, []string{"a.feature"}, filepath.Join(dir, "r.json"), &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	if o.Failed != 1 || o.Undefined != 1 || o.Passed != 0 {
		t.Fatalf("outcome = %+v\n%s", o, stdout.String())
	}
	if !strings.Contains(stdout.String(), `expected "6.00", got "4.80"`) {
		t.Errorf("the failing step is not explained:\n%s", stdout.String())
	}
	if !strings.Contains(stdout.String(), "undefined step: Given a step nobody implemented") {
		t.Errorf("the undefined step is not named:\n%s", stdout.String())
	}
}
