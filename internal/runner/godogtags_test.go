package runner

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/cucumber/godog"
)

func TestGodogTags(t *testing.T) {
	for in, want := range map[string]string{
		"":                    "",
		"not @manual":         "~@manual",
		"@smoke":              "@smoke",
		"@a and not @b":       "@a&&~@b",
		"@a or @b":            "@a,@b",
		"@a and @b or not @c": "@a&&@b,~@c",
		"NOT @manual":         "~@manual",
	} {
		if got, err := GodogTags(in); err != nil || got != want {
			t.Errorf("GodogTags(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"(@a or @b) and @c", "manual", "@a xor @b"} {
		if _, err := GodogTags(bad); err == nil {
			t.Errorf("GodogTags(%q) should be an error", bad)
		}
	}
	a, _ := Lookup("go")
	req := Request{Dir: t.TempDir(), Output: "o.json", Tags: "(@a or @b)", Stdout: nil, Stderr: nil}
	if _, err := Run(context.Background(), a, req); err == nil {
		t.Error("the go adapter cannot use parentheses and must say so instead of running nothing")
	}
}

// The translation is checked against the real godog: the expressions that
// the default `not @manual` becomes must select what Cucumber would select.
func TestGodogTagsSelectLikeCucumber(t *testing.T) {
	const feature = `Feature: F
  @manual
  Scenario: by hand
    Given a step
  @api
  Scenario: automated
    Given a step
  @api @slow
  Scenario: automated and slow
    Given a step
  Scenario: untagged
    Given a step
`
	run := func(cucumberExpr string) []string {
		godogExpr, err := GodogTags(cucumberExpr)
		if err != nil {
			t.Fatal(err)
		}
		var ran []string
		suite := godog.TestSuite{
			ScenarioInitializer: func(sc *godog.ScenarioContext) {
				sc.Step(`^a step$`, func(ctx context.Context) (context.Context, error) { return ctx, nil })
				sc.Before(func(ctx context.Context, s *godog.Scenario) (context.Context, error) {
					ran = append(ran, s.Name)
					return ctx, nil
				})
			},
			Options: &godog.Options{Format: "progress", Tags: godogExpr, NoColors: true, Strict: true,
				FeatureContents: []godog.Feature{{Name: "f.feature", Contents: []byte(feature)}}},
		}
		if suite.Run() != 0 {
			t.Fatalf("suite failed for %q", cucumberExpr)
		}
		sort.Strings(ran)
		return ran
	}
	for expr, want := range map[string]string{
		"":                   "automated,automated and slow,by hand,untagged",
		"not @manual":        "automated,automated and slow,untagged",
		"@api and not @slow": "automated",
		"@manual or @slow":   "automated and slow,by hand",
	} {
		if got := strings.Join(run(expr), ","); got != want {
			t.Errorf("%q selects %q, want %q", expr, got, want)
		}
	}
}
