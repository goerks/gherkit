// Package demorun is the built-in runner of the browser demo. It executes scenarios against a small
// simulated shop and login (see steps.go) and writes Cucumber JSON, so that "gherkit run --adapter demo"
// works without any other runtime. It is for trying gherkit out; real projects use the go, java or a custom adapter.
package demorun

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	messages "github.com/cucumber/messages/go/v34"

	"github.com/goerks/gherkit/internal/parse"
)

// Outcome counts what happened in a run.
type Outcome struct {
	Scenarios, Passed, Failed, Undefined int
}

// Failing reports whether the run should exit with a non-zero code.
func (o Outcome) Failing() bool { return o.Failed > 0 || o.Undefined > 0 }

type cjStep struct {
	Keyword   string   `json:"keyword"`
	Name      string   `json:"name"`
	Line      int      `json:"line"`
	DocString *cjDoc   `json:"doc_string,omitempty"`
	Rows      []cjRow  `json:"rows,omitempty"`
	Match     *cjMatch `json:"match,omitempty"`
	Result    cjResult `json:"result"`
}
type cjDoc struct {
	Value       string `json:"value"`
	ContentType string `json:"content_type,omitempty"`
}
type cjRow struct {
	Cells []string `json:"cells"`
}
type cjMatch struct {
	Location string `json:"location"`
}
type cjResult struct {
	Status       string `json:"status"`
	Duration     int64  `json:"duration"`
	ErrorMessage string `json:"error_message,omitempty"`
}
type cjTag struct {
	Name string `json:"name"`
}
type cjElement struct {
	ID      string   `json:"id"`
	Keyword string   `json:"keyword"`
	Name    string   `json:"name"`
	Line    int      `json:"line"`
	Type    string   `json:"type"`
	Tags    []cjTag  `json:"tags"`
	Steps   []cjStep `json:"steps"`
}
type cjFeature struct {
	URI      string      `json:"uri"`
	Keyword  string      `json:"keyword"`
	Name     string      `json:"name"`
	Tags     []cjTag     `json:"tags"`
	Elements []cjElement `json:"elements"`
}

// FindFeatures lists the .feature files below dir, relative to dir with forward slashes.
func FindFeatures(dir string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".feature") {
			rel, err := filepath.Rel(dir, p)
			if err != nil {
				return err
			}
			out = append(out, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(out)
	return out, err
}

func line(l *messages.Location) int {
	if l == nil {
		return 0
	}
	return int(l.Line)
}

// stepNodes maps the ids of the steps in the document to their AST node.
func stepNodes(f *messages.Feature) map[string]*messages.Step {
	m := map[string]*messages.Step{}
	add := func(steps []*messages.Step) {
		for _, s := range steps {
			m[s.Id] = s
		}
	}
	for _, c := range f.Children {
		if c.Background != nil {
			add(c.Background.Steps)
		}
		if c.Scenario != nil {
			add(c.Scenario.Steps)
		}
		if c.Rule != nil {
			for _, rc := range c.Rule.Children {
				if rc.Background != nil {
					add(rc.Background.Steps)
				}
				if rc.Scenario != nil {
					add(rc.Scenario.Steps)
				}
			}
		}
	}
	return m
}

// scenarioLines maps scenario and example-row ids to their line.
func scenarioLines(f *messages.Feature) map[string]int {
	m := map[string]int{}
	add := func(s *messages.Scenario) {
		m[s.Id] = line(s.Location)
		for _, ex := range s.Examples {
			for _, r := range ex.TableBody {
				m[r.Id] = line(r.Location)
			}
		}
	}
	for _, c := range f.Children {
		if c.Scenario != nil {
			add(c.Scenario)
		}
		if c.Rule != nil {
			for _, rc := range c.Rule.Children {
				if rc.Scenario != nil {
					add(rc.Scenario)
				}
			}
		}
	}
	return m
}

// Run executes the given feature files (paths relative to dir), writes the Cucumber JSON to output and
// prints one line per scenario to stdout. Files with syntax errors are reported on stderr and counted as failed.
func Run(dir string, files []string, output string, stdout, stderr io.Writer) (Outcome, error) {
	var out Outcome
	var features []cjFeature
	for _, rel := range files {
		path := rel
		if !filepath.IsAbs(path) {
			path = filepath.Join(dir, rel)
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return out, err
		}
		uri := filepath.ToSlash(rel)
		if filepath.IsAbs(rel) {
			if r, err := filepath.Rel(dir, rel); err == nil {
				uri = filepath.ToSlash(r)
			}
		}
		res := parse.Source(uri, string(src))
		if !res.OK() || res.Document == nil || res.Document.Feature == nil {
			var msgs []string
			for _, e := range res.Errors {
				fmt.Fprintf(stderr, "%s:%d: %s\n", uri, e.Line, e.Message)
				msgs = append(msgs, fmt.Sprintf("line %d: %s", e.Line, e.Message))
			}
			name := uri
			if res.Document != nil && res.Document.Feature != nil && res.Document.Feature.Name != "" {
				name = res.Document.Feature.Name
			}
			features = append(features, cjFeature{URI: uri, Keyword: "Feature", Name: name, Elements: []cjElement{{
				ID: uri, Keyword: "Scenario", Name: "The file can be read", Line: 1, Type: "scenario",
				Steps: []cjStep{{Keyword: "Given ", Name: "the file is valid Gherkin", Line: 1, Result: cjResult{Status: "failed", ErrorMessage: strings.Join(msgs, "; ")}}},
			}}})
			fmt.Fprintf(stdout, "✗ %s: syntax errors, not run\n", uri)
			out.Scenarios++
			out.Failed++
			continue
		}
		f := res.Document.Feature
		cf := cjFeature{URI: uri, Keyword: f.Keyword, Name: f.Name}
		for _, t := range f.Tags {
			cf.Tags = append(cf.Tags, cjTag{t.Name})
		}
		steps := stepNodes(f)
		lines := scenarioLines(f)
		for _, p := range res.Pickles {
			el := cjElement{ID: p.Id, Keyword: "Scenario", Name: p.Name, Type: "scenario"}
			if len(p.AstNodeIds) > 0 {
				el.Line = lines[p.AstNodeIds[len(p.AstNodeIds)-1]]
				if el.Line == 0 {
					el.Line = lines[p.AstNodeIds[0]]
				}
			}
			for _, t := range p.Tags {
				el.Tags = append(el.Tags, cjTag{t.Name})
			}
			w := &world{}
			broken := false
			status := "passed"
			for _, ps := range p.Steps {
				cs := cjStep{Name: ps.Text}
				if len(ps.AstNodeIds) > 0 {
					if n := steps[ps.AstNodeIds[0]]; n != nil {
						cs.Keyword = n.Keyword
						cs.Line = line(n.Location)
					}
				}
				if a := ps.Argument; a != nil {
					if a.DocString != nil {
						cs.DocString = &cjDoc{Value: a.DocString.Content, ContentType: a.DocString.MediaType}
					}
					if a.DataTable != nil {
						for _, r := range a.DataTable.Rows {
							var cells []string
							for _, c := range r.Cells {
								cells = append(cells, c.Value)
							}
							cs.Rows = append(cs.Rows, cjRow{cells})
						}
					}
				}
				if broken {
					cs.Result.Status = "skipped"
					el.Steps = append(el.Steps, cs)
					continue
				}
				var fn stepFn
				var m []string
				for _, d := range library {
					if mm := d.re.FindStringSubmatch(ps.Text); mm != nil {
						fn, m = d.fn, mm
						break
					}
				}
				start := time.Now()
				switch {
				case fn == nil:
					cs.Result.Status = "undefined"
					broken = true
					if status == "passed" {
						status = "undefined"
					}
				default:
					cs.Match = &cjMatch{Location: "demo runner"}
					if err := fn(w, m, ps.Argument); err != nil {
						cs.Result.Status = "failed"
						cs.Result.ErrorMessage = err.Error()
						broken = true
						status = "failed"
					} else {
						cs.Result.Status = "passed"
					}
				}
				cs.Result.Duration = time.Since(start).Nanoseconds()
				el.Steps = append(el.Steps, cs)
			}
			out.Scenarios++
			mark := "✓"
			switch status {
			case "passed":
				out.Passed++
			case "failed":
				out.Failed++
				mark = "✗"
			default:
				out.Undefined++
				mark = "?"
			}
			fmt.Fprintf(stdout, "%s %s:%d %s\n", mark, uri, el.Line, p.Name)
			for _, s := range el.Steps {
				switch s.Result.Status {
				case "failed":
					fmt.Fprintf(stdout, "    failed: %s%s: %s\n", s.Keyword, s.Name, s.Result.ErrorMessage)
				case "undefined":
					fmt.Fprintf(stdout, "    undefined step: %s%s\n", s.Keyword, s.Name)
				}
			}
			cf.Elements = append(cf.Elements, el)
		}
		features = append(features, cf)
	}
	data, err := json.MarshalIndent(features, "", " ")
	if err != nil {
		return out, err
	}
	if err := os.WriteFile(output, data, 0o644); err != nil {
		return out, err
	}
	return out, nil
}
