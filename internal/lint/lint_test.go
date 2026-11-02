package lint

import (
	"testing"

	"github.com/goerks/gherkit/internal/parse"
)

func rules(ds []parse.Diagnostic) map[string]int {
	m := map[string]int{}
	for _, d := range ds {
		m[d.Rule]++
	}
	return m
}

func TestRules(t *testing.T) {
	cases := []struct {
		name, src, rule string
	}{
		{"syntax", "Feature: F\n  Scenario: S\n    Given x\n      | a |\n      | 1 | 2 |\n", "syntax"},
		{"no feature", "# only a comment\n", "no-feature"},
		{"feature name", "Feature:\n", "feature-name"},
		{"scenario name", "Feature: F\n\n  Scenario:\n    Given x\n", "scenario-name"},
		{"no steps", "Feature: F\n\n  Scenario: S\n", "no-steps"},
		{"duplicate", "Feature: F\n\n  Scenario: S\n    Given x\n\n  Scenario: S\n    Given y\n", "duplicate-scenario"},
		{"placeholder", "Feature: F\n\n  Scenario Outline: S\n    Given <a> and <b>\n\n    Examples:\n      | a |\n      | 1 |\n", "outline-placeholder"},
		{"outline without examples", "Feature: F\n\n  Scenario Outline: S\n    Given <a>\n", "outline-without-examples"},
		{"unused column", "Feature: F\n\n  Scenario Outline: S\n    Given <a>\n\n    Examples:\n      | a | b |\n      | 1 | 2 |\n", "examples-without-placeholder"},
		{"empty background", "Feature: F\n\n  Background:\n\n  Scenario: S\n    Given x\n", "empty-background"},
		{"unformatted", "Feature:  F\n", "unformatted"},
		{"german outline", "# language: de\nFunktionalität: F\n\n  Szenariogrundriss: S\n    Angenommen <a>\n", "outline-without-examples"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := rules(Source("x.feature", c.src, Options{}))
			if got[c.rule] == 0 {
				t.Fatalf("rule %s not reported, got %v", c.rule, got)
			}
		})
	}
}

func TestCleanFileHasNoFindings(t *testing.T) {
	src := "Feature: F\n\n  Scenario Outline: S <a>\n    Given <a>\n\n    Examples:\n      | a |\n      | 1 |\n"
	if ds := Source("x", src, Options{}); len(ds) != 0 {
		t.Fatalf("unexpected findings: %+v", ds)
	}
}

func TestDisable(t *testing.T) {
	ds := Source("x", "Feature:  F\n", Options{Disable: map[string]bool{"unformatted": true, "feature-name": true}})
	if len(ds) != 0 {
		t.Fatalf("disabled rules still reported: %+v", ds)
	}
}

func TestEveryRuleIsDocumented(t *testing.T) {
	seen := map[string]bool{}
	for _, r := range Rules {
		if r.ID == "" || r.Description == "" || seen[r.ID] {
			t.Fatalf("bad rule entry %+v", r)
		}
		if r.Severity != "error" && r.Severity != "warning" && r.Severity != "info" {
			t.Fatalf("bad severity %+v", r)
		}
		seen[r.ID] = true
	}
	e, w, i := Count([]parse.Diagnostic{{Severity: "error"}, {Severity: "warning"}, {Severity: "info"}})
	if e != 1 || w != 1 || i != 1 {
		t.Fatal("Count wrong")
	}
}
