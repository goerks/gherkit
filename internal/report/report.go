// Package report turns test results into human-readable reports using
// customizable Go templates.
package report

import (
	"embed"
	"encoding/json"
	"fmt"
	htmltemplate "html/template"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	texttemplate "text/template"
	"time"
)

//go:embed templates/*
var builtin embed.FS

// Status values follow the Cucumber vocabulary.
const (
	Passed    = "passed"
	Failed    = "failed"
	Skipped   = "skipped"
	Pending   = "pending"
	Undefined = "undefined"
	Ambiguous = "ambiguous"
)

// Report is the documented, stable data model available to templates.
type Report struct {
	Title     string
	Language  string
	Generated time.Time
	Summary   Summary
	Features  []*Feature
}

// Summary aggregates counts and duration.
type Summary struct {
	Features  int
	Scenarios Counts
	Steps     Counts
	Duration  time.Duration
}

// Counts per status.
type Counts struct {
	Total, Passed, Failed, Skipped, Pending, Undefined int
}

// Status returns the overall status of the counted items.
func (c Counts) Status() string {
	switch {
	case c.Failed > 0:
		return Failed
	case c.Undefined > 0:
		return Undefined
	case c.Pending > 0:
		return Pending
	case c.Total > 0 && c.Skipped == c.Total:
		return Skipped
	default:
		return Passed
	}
}

func (c *Counts) add(status string) {
	c.Total++
	switch status {
	case Passed:
		c.Passed++
	case Failed, Ambiguous:
		c.Failed++
	case Pending:
		c.Pending++
	case Undefined:
		c.Undefined++
	default:
		c.Skipped++
	}
}

// Feature with its scenarios.
type Feature struct {
	URI         string
	Keyword     string
	Name        string
	Description string
	Tags        []string
	Scenarios   []*Scenario
	Counts      Counts
}

// Scenario is one executed test case (pickle).
type Scenario struct {
	ID          string
	Keyword     string
	Name        string
	Description string
	Line        int
	Tags        []string
	Steps       []*Step
	Status      string
	Duration    time.Duration
}

// Step with its result.
type Step struct {
	Keyword   string
	Text      string
	Line      int
	Status    string
	Duration  time.Duration
	Error     string
	DocString string
	MediaType string
	Rows      [][]string
	Location  string
}

// cucumber JSON (the de-facto exchange format written by godog, cucumber-jvm, cucumber-js, ...)
type cjFeature struct {
	URI         string      `json:"uri"`
	Keyword     string      `json:"keyword"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Tags        []cjTag     `json:"tags"`
	Elements    []cjElement `json:"elements"`
}
type cjTag struct {
	Name string `json:"name"`
}
type cjElement struct {
	ID          string   `json:"id"`
	Keyword     string   `json:"keyword"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Line        int      `json:"line"`
	Type        string   `json:"type"`
	Tags        []cjTag  `json:"tags"`
	Steps       []cjStep `json:"steps"`
}
type cjStep struct {
	Keyword   string `json:"keyword"`
	Name      string `json:"name"`
	Line      int    `json:"line"`
	DocString *struct {
		Value       string `json:"value"`
		ContentType string `json:"content_type"`
	} `json:"doc_string"`
	Rows []struct {
		Cells []string `json:"cells"`
	} `json:"rows"`
	Match struct {
		Location string `json:"location"`
	} `json:"match"`
	Result struct {
		Status       string `json:"status"`
		Duration     int64  `json:"duration"`
		ErrorMessage string `json:"error_message"`
	} `json:"result"`
}

// FromCucumberJSON reads one or more Cucumber JSON result files.
func FromCucumberJSON(readers ...io.Reader) (*Report, error) {
	r := &Report{Generated: time.Now()}
	for _, rd := range readers {
		var fs []cjFeature
		if err := json.NewDecoder(rd).Decode(&fs); err != nil {
			return nil, fmt.Errorf("reading cucumber json: %w", err)
		}
		for _, cf := range fs {
			f := &Feature{URI: cf.URI, Keyword: cf.Keyword, Name: cf.Name, Description: strings.TrimSpace(cf.Description), Tags: tags(cf.Tags)}
			for _, el := range cf.Elements {
				if el.Type == "background" {
					continue
				}
				s := &Scenario{ID: el.ID, Keyword: el.Keyword, Name: el.Name, Description: strings.TrimSpace(el.Description), Line: el.Line, Tags: tags(el.Tags), Status: Passed}
				for _, cs := range el.Steps {
					st := &Step{Keyword: strings.TrimSpace(cs.Keyword), Text: cs.Name, Line: cs.Line, Status: cs.Result.Status, Duration: time.Duration(cs.Result.Duration), Error: cs.Result.ErrorMessage, Location: cs.Match.Location}
					if cs.DocString != nil {
						st.DocString, st.MediaType = cs.DocString.Value, cs.DocString.ContentType
					}
					for _, row := range cs.Rows {
						st.Rows = append(st.Rows, row.Cells)
					}
					if st.Status == "" {
						st.Status = Skipped
					}
					s.Steps = append(s.Steps, st)
					s.Duration += st.Duration
					r.Summary.Steps.add(st.Status)
				}
				s.Status = scenarioStatus(s.Steps)
				f.Scenarios = append(f.Scenarios, s)
				f.Counts.add(s.Status)
				r.Summary.Scenarios.add(s.Status)
				r.Summary.Duration += s.Duration
			}
			r.Features = append(r.Features, f)
		}
	}
	sort.SliceStable(r.Features, func(i, j int) bool { return r.Features[i].URI < r.Features[j].URI })
	r.Summary.Features = len(r.Features)
	return r, nil
}

func scenarioStatus(steps []*Step) string {
	order := []string{Failed, Ambiguous, Undefined, Pending}
	for _, want := range order {
		for _, s := range steps {
			if s.Status == want {
				if want == Ambiguous {
					return Failed
				}
				return want
			}
		}
	}
	allSkipped := len(steps) > 0
	for _, s := range steps {
		if s.Status != Skipped {
			allSkipped = false
		}
	}
	if allSkipped {
		return Skipped
	}
	return Passed
}

func tags(ts []cjTag) []string {
	out := make([]string, 0, len(ts))
	for _, t := range ts {
		out = append(out, t.Name)
	}
	return out
}

// Formats lists the built-in output formats.
var Formats = []string{"html", "md", "json"}

// Render writes the report. format is html, md or json. If tmplPath is set,
// that template file replaces the built-in one (html/template for .html
// templates, text/template otherwise).
func Render(w io.Writer, r *Report, format, tmplPath string) error {
	if r.Language == "" {
		r.Language = "en"
	}
	if r.Title == "" {
		r.Title = T(r.Language, "title")
	}
	if format == "json" && tmplPath == "" {
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(r)
	}
	var src []byte
	var name string
	var err error
	if tmplPath != "" {
		src, err = os.ReadFile(tmplPath)
		name = filepath.Base(tmplPath)
	} else {
		name = "report." + format + ".tmpl"
		src, err = builtin.ReadFile("templates/" + name)
	}
	if err != nil {
		return fmt.Errorf("template: %w", err)
	}
	funcs := Funcs(r.Language)
	if format == "html" || strings.HasSuffix(name, ".html.tmpl") || strings.HasSuffix(name, ".html") {
		t, err := htmltemplate.New(name).Funcs(htmltemplate.FuncMap(funcs)).Parse(string(src))
		if err != nil {
			return err
		}
		return t.Execute(w, r)
	}
	t, err := texttemplate.New(name).Funcs(texttemplate.FuncMap(funcs)).Parse(string(src))
	if err != nil {
		return err
	}
	return t.Execute(w, r)
}

// Funcs are the helper functions available in report templates.
func Funcs(lang string) map[string]any {
	return map[string]any{
		"t":        func(key string) string { return T(lang, key) },
		"duration": func(d time.Duration) string { return d.Round(time.Millisecond).String() },
		"percent": func(part, total int) string {
			if total == 0 {
				return "0%"
			}
			return fmt.Sprintf("%.0f%%", float64(part)*100/float64(total))
		},
		"join":  strings.Join,
		"lower": strings.ToLower,
		"upper": strings.ToUpper,
		"date":  func(t time.Time) string { return t.Format("2006-01-02 15:04") },
		"add":   func(a, b int) int { return a + b },
	}
}

var texts = map[string]map[string]string{
	"en": {"title": "Acceptance test report", "features": "Features", "scenarios": "Scenarios", "steps": "Steps", "passed": "passed", "failed": "failed", "skipped": "skipped", "pending": "pending", "undefined": "undefined", "duration": "Duration", "generated": "Generated", "status": "Status", "summary": "Summary"},
	"de": {"title": "Abnahmetest-Report", "features": "Features", "scenarios": "Szenarien", "steps": "Schritte", "passed": "erfolgreich", "failed": "fehlgeschlagen", "skipped": "übersprungen", "pending": "ausstehend", "undefined": "undefiniert", "duration": "Dauer", "generated": "Erstellt", "status": "Status", "summary": "Zusammenfassung"},
}

// T translates a report text; unknown languages fall back to English.
func T(lang, key string) string {
	if m, ok := texts[lang]; ok {
		if v, ok := m[key]; ok {
			return v
		}
	}
	if v, ok := texts["en"][key]; ok {
		return v
	}
	return key
}
