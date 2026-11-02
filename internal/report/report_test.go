package report

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const sample = `[{"uri":"features/a.feature","keyword":"Feature","name":"A","description":"  About A","tags":[{"name":"@x"}],
 "elements":[
  {"id":"a;ok","keyword":"Scenario","name":"works","line":3,"type":"scenario","steps":[
    {"keyword":"Given ","name":"a <thing>","line":4,"result":{"status":"passed","duration":1000000}},
    {"keyword":"Then ","name":"done","line":5,"rows":[{"cells":["k","v"]}],"result":{"status":"passed","duration":2000000}}]},
  {"id":"a;bad","keyword":"Scenario","name":"breaks","line":7,"type":"scenario","steps":[
    {"keyword":"Given ","name":"x","line":8,"result":{"status":"failed","duration":500000,"error_message":"boom"}},
    {"keyword":"Then ","name":"y","line":9,"result":{"status":"skipped"}}]},
  {"id":"a;todo","keyword":"Scenario","name":"todo","line":11,"type":"scenario","steps":[
    {"keyword":"Given ","name":"z","line":12,"result":{"status":"undefined"}}]}
 ]}]`

func load(t *testing.T) *Report {
	t.Helper()
	r, err := FromCucumberJSON(strings.NewReader(sample))
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestSummary(t *testing.T) {
	r := load(t)
	s := r.Summary
	if s.Features != 1 || s.Scenarios.Total != 3 || s.Scenarios.Passed != 1 || s.Scenarios.Failed != 1 || s.Scenarios.Undefined != 1 {
		t.Fatalf("scenario counts: %+v", s.Scenarios)
	}
	if s.Steps.Total != 5 || s.Steps.Skipped != 1 {
		t.Fatalf("step counts: %+v", s.Steps)
	}
	if s.Scenarios.Status() != Failed || r.Features[0].Counts.Status() != Failed {
		t.Fatal("overall status must be failed")
	}
	if got := r.Features[0].Scenarios[1].Steps[0].Error; got != "boom" {
		t.Fatalf("error message %q", got)
	}
}

func TestRenderHTMLEscapesAndTranslates(t *testing.T) {
	r := load(t)
	r.Language = "de"
	var b bytes.Buffer
	if err := Render(&b, r, "html", ""); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	for _, want := range []string{"Abnahmetest-Report", "a &lt;thing&gt;", "boom", "fehlgeschlagen", `lang="de"`} {
		if !strings.Contains(out, want) {
			t.Errorf("html misses %q", want)
		}
	}
	if strings.Contains(out, "ZgotmplZ") {
		t.Error("template produced unsafe-content marker")
	}
}

func TestRenderMarkdownAndJSON(t *testing.T) {
	r := load(t)
	var md bytes.Buffer
	if err := Render(&md, r, "md", ""); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(md.String(), "## Feature: A") || !strings.Contains(md.String(), "`boom`") {
		t.Errorf("markdown:\n%s", md.String())
	}
	var js bytes.Buffer
	if err := Render(&js, r, "json", ""); err != nil {
		t.Fatal(err)
	}
	var back Report
	if err := json.Unmarshal(js.Bytes(), &back); err != nil || back.Summary.Scenarios.Total != 3 {
		t.Fatalf("json: %v %+v", err, back.Summary)
	}
}

func TestCustomTemplate(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "mine.txt.tmpl")
	os.WriteFile(p, []byte(`{{t "scenarios"}}={{.Summary.Scenarios.Total}} {{percent .Summary.Scenarios.Passed .Summary.Scenarios.Total}}`), 0o644)
	var b bytes.Buffer
	if err := Render(&b, load(t), "txt", p); err != nil {
		t.Fatal(err)
	}
	if b.String() != "Scenarios=3 33%" {
		t.Fatalf("got %q", b.String())
	}
}

func TestBadInput(t *testing.T) {
	if _, err := FromCucumberJSON(strings.NewReader("{")); err == nil {
		t.Fatal("expected error")
	}
	if T("xx", "title") != T("en", "title") || T("en", "nope") != "nope" {
		t.Fatal("translation fallback broken")
	}
}
