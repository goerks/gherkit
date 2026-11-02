// Package lint checks Gherkin documents for problems beyond syntax.
package lint

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	messages "github.com/cucumber/messages/go/v34"
	"github.com/goerks/gherkit/internal/format"
	"github.com/goerks/gherkit/internal/parse"
)

// Rule describes one lint rule.
type Rule struct {
	ID          string `json:"id"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
}

// Rules lists all built-in rules. Syntax errors always come first.
var Rules = []Rule{
	{"syntax", "error", "The file must be valid Gherkin according to the official parser."},
	{"no-feature", "warning", "A .feature file should contain a Feature."},
	{"feature-name", "warning", "A Feature should have a name."},
	{"scenario-name", "warning", "Scenarios, Rules and Examples should have a name."},
	{"no-steps", "warning", "A Scenario or Background should contain at least one step."},
	{"duplicate-scenario", "warning", "Scenario names should be unique within a Feature."},
	{"outline-placeholder", "error", "Every <placeholder> in a Scenario Outline must be a column of its Examples."},
	{"outline-without-examples", "error", "A Scenario Outline needs at least one Examples table with rows."},
	{"examples-without-placeholder", "warning", "Examples columns should be used by a placeholder."},
	{"empty-background", "warning", "A Background without steps can be removed."},
	{"unformatted", "info", "The file is not in canonical gherkit format (run gherkit fmt)."},
}

// Options switch individual rules off.
type Options struct {
	Disable map[string]bool
}

var placeholder = regexp.MustCompile(`<([^<>]+)>`)

// Source lints one document.
func Source(uri, src string, opt Options) []parse.Diagnostic {
	res := parse.Source(uri, src)
	var out []parse.Diagnostic
	add := func(rule string, loc *messages.Location, msg string, args ...any) {
		if opt.Disable[rule] {
			return
		}
		d := parse.Diagnostic{Line: 1, Column: 1, Rule: rule, Message: fmt.Sprintf(msg, args...)}
		for _, r := range Rules {
			if r.ID == rule {
				d.Severity = r.Severity
			}
		}
		if loc != nil {
			d.Line, d.Column = int(loc.Line), int(loc.Column)
		}
		out = append(out, d)
	}
	out = append(out, res.Errors...)
	if !res.OK() {
		return out
	}
	f := res.Document.Feature
	if f == nil {
		add("no-feature", nil, "file contains no Feature")
		return out
	}
	if strings.TrimSpace(f.Name) == "" {
		add("feature-name", f.Location, "%s has no name", f.Keyword)
	}
	outlineKw := map[string]bool{}
	if d, ok := parse.DialectFor(f.Language); ok {
		for _, k := range d.Keywords["scenarioOutline"] {
			outlineKw[k] = true
		}
	}
	seen := map[string]*messages.Location{}
	var scenarios func(children []*messages.Scenario)
	scenarios = func(list []*messages.Scenario) {
		for _, s := range list {
			checkScenario(s, outlineKw, add)
			key := strings.TrimSpace(s.Name)
			if key == "" {
				continue
			}
			if first, ok := seen[key]; ok {
				add("duplicate-scenario", s.Location, "duplicate scenario name %q (first on line %d)", key, first.Line)
			} else {
				seen[key] = s.Location
			}
		}
	}
	checkBackground := func(b *messages.Background) {
		if len(b.Steps) == 0 {
			add("empty-background", b.Location, "%s has no steps", b.Keyword)
		}
	}
	var top []*messages.Scenario
	for _, c := range f.Children {
		switch {
		case c.Background != nil:
			checkBackground(c.Background)
		case c.Scenario != nil:
			top = append(top, c.Scenario)
		case c.Rule != nil:
			if strings.TrimSpace(c.Rule.Name) == "" {
				add("scenario-name", c.Rule.Location, "%s has no name", c.Rule.Keyword)
			}
			var inRule []*messages.Scenario
			for _, rc := range c.Rule.Children {
				if rc.Background != nil {
					checkBackground(rc.Background)
				}
				if rc.Scenario != nil {
					inRule = append(inRule, rc.Scenario)
				}
			}
			scenarios(inRule)
		}
	}
	scenarios(top)

	if formatted := format.Document(res.Document, format.Default); formatted != src {
		add("unformatted", nil, "file is not formatted; run 'gherkit fmt'")
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Line < out[j].Line })
	return out
}

func checkScenario(s *messages.Scenario, outlineKw map[string]bool, add func(string, *messages.Location, string, ...any)) {
	if strings.TrimSpace(s.Name) == "" {
		add("scenario-name", s.Location, "%s has no name", s.Keyword)
	}
	if len(s.Steps) == 0 {
		add("no-steps", s.Location, "%s %q has no steps", s.Keyword, s.Name)
	}
	isOutline := len(s.Examples) > 0 || outlineKw[s.Keyword]
	if !isOutline {
		return
	}
	columns := map[string]bool{}
	rows := 0
	for _, ex := range s.Examples {
		if ex.TableHeader != nil {
			for _, c := range ex.TableHeader.Cells {
				columns[c.Value] = true
			}
		}
		rows += len(ex.TableBody)
	}
	if rows == 0 {
		add("outline-without-examples", s.Location, "%s %q has no Examples rows", s.Keyword, s.Name)
		return
	}
	used := map[string]bool{}
	check := func(text string, loc *messages.Location) {
		for _, m := range placeholder.FindAllStringSubmatch(text, -1) {
			used[m[1]] = true
			if !columns[m[1]] {
				add("outline-placeholder", loc, "placeholder <%s> is not a column of the Examples", m[1])
			}
		}
	}
	check(s.Name, s.Location)
	for _, st := range s.Steps {
		check(st.Text, st.Location)
		if st.DocString != nil {
			check(st.DocString.Content, st.DocString.Location)
		}
		if st.DataTable != nil {
			for _, r := range st.DataTable.Rows {
				for _, c := range r.Cells {
					check(c.Value, c.Location)
				}
			}
		}
	}
	for _, ex := range s.Examples {
		if ex.TableHeader == nil {
			continue
		}
		for _, c := range ex.TableHeader.Cells {
			if !used[c.Value] {
				add("examples-without-placeholder", c.Location, "column %q is not used by any placeholder", c.Value)
			}
		}
	}
}

// Count returns the number of diagnostics per severity.
func Count(diags []parse.Diagnostic) (errors, warnings, infos int) {
	for _, d := range diags {
		switch d.Severity {
		case "error":
			errors++
		case "warning":
			warnings++
		default:
			infos++
		}
	}
	return
}
