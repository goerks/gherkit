package manual

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 3, 14, 0, 0, 0, time.UTC)

func sample() *Run {
	return &Run{
		ID: "r1", Tester: "Michael", Environment: "https://test.example", Started: t0,
		Cases: []*Case{{
			ID: "c1", URI: "features/vergleich.feature", Feature: "Vergleich", Name: "Preise sortiert", Line: 5, Tags: []string{"@manual"},
			Steps: []*Step{
				{Keyword: "Given ", Text: "a", Line: 6},
				{Keyword: "When ", Text: "b", Line: 7, DocString: "doc", Rows: [][]string{{"x", "y"}}},
				{Keyword: "Then ", Text: "c", Line: 8},
				{Keyword: "And ", Text: "d", Line: 9},
			},
		}},
	}
}

func TestEffectiveStatuses(t *testing.T) {
	r := sample()
	c := r.Cases[0]
	if got := strings.Join(c.Effective(), ","); got != "undefined,undefined,undefined,undefined" {
		t.Errorf("nothing processed: %s", got)
	}
	_ = r.Record("c1", 0, Passed, "", t0)
	if err := r.Record("c1", 1, Failed, "  ", t0); err == nil {
		t.Error("a failure needs a reason")
	}
	_ = r.Record("c1", 1, Failed, "wrong order", t0)
	if got := strings.Join(c.Effective(), ","); got != "passed,failed,skipped,skipped" {
		t.Errorf("after a failure the rest is skipped: %s", got)
	}
	_ = r.Record("c1", 2, Passed, "", t0) // a person may override
	if got := strings.Join(c.Effective(), ","); got != "passed,failed,passed,skipped" {
		t.Errorf("override: %s", got)
	}
	if err := r.Record("c1", 1, Ignored, "", t0); err == nil {
		t.Error("ignoring needs a reason")
	}
	_ = r.Record("c1", 1, Ignored, "captcha", t0)
	if c.Effective()[1] != Ignored {
		t.Error("ignored stays ignored internally")
	}
}

func TestRecordValidation(t *testing.T) {
	r := sample()
	if err := r.Record("nope", 0, Passed, "", t0); err == nil {
		t.Error("unknown case")
	}
	if err := r.Record("c1", 9, Passed, "", t0); err == nil {
		t.Error("unknown step")
	}
	if err := r.Record("c1", 0, "blocked", "x", t0); err == nil {
		t.Error("blocked no longer exists")
	}
	if err := r.Record("c1", 0, "great", "", t0); err == nil {
		t.Error("unknown status")
	}
	_ = r.Record("c1", 0, Passed, " ok ", t0)
	if r.Cases[0].Steps[0].Comment != "ok" {
		t.Error("comment is trimmed")
	}
	_ = r.Record("c1", 0, "", "", t0)
	if !r.Cases[0].Steps[0].At.IsZero() {
		t.Error("clearing a step clears its time")
	}
	if done, total := r.Progress(); done != 0 || total != 4 {
		t.Errorf("progress %d/%d", done, total)
	}
	_ = r.Record("c1", 1, Failed, "broken", t0)
	if done, total := r.Progress(); done != 3 || total != 4 || r.Cases[0].Settled() {
		t.Errorf("steps after a failure need nothing more, step 1 is still open: %d/%d", done, total)
	}
	_ = r.Record("c1", 0, Passed, "", t0)
	if done, _ := r.Progress(); done != 4 || !r.Cases[0].Settled() {
		t.Errorf("all judged or skipped settles the case: %d", done)
	}
	_ = r.Record("c1", 0, "", "", t0)
	_ = r.Record("c1", 1, "", "", t0)
	_ = r.Finish(t0)
	if err := r.Record("c1", 0, Passed, "", t0); err == nil {
		t.Error("a finished run is read-only")
	}
	if err := r.Finish(t0); err == nil {
		t.Error("finishing twice")
	}
}

func TestCucumberJSON(t *testing.T) {
	r := sample()
	_ = r.Record("c1", 0, Passed, "", t0)
	_ = r.Record("c1", 1, Ignored, "captcha not solvable", t0)
	b, err := r.CucumberJSON()
	if err != nil {
		t.Fatal(err)
	}
	var feats []struct {
		URI      string
		Elements []struct {
			Name  string
			Type  string
			Tags  []struct{ Name string }
			Steps []struct {
				Name   string
				Result struct {
					Status       string
					ErrorMessage string `json:"error_message"`
				}
				DocString *struct{ Value string } `json:"doc_string"`
			}
			Gherkit struct {
				Manual bool
				Tester string
			}
		}
	}
	if err := json.Unmarshal(b, &feats); err != nil {
		t.Fatal(err)
	}
	el := feats[0].Elements[0]
	if feats[0].URI != "features/vergleich.feature" || el.Type != "scenario" || el.Tags[0].Name != "@manual" || !el.Gherkit.Manual || el.Gherkit.Tester != "Michael" {
		t.Errorf("element: %+v", el)
	}
	var got []string
	for _, s := range el.Steps {
		got = append(got, s.Result.Status)
	}
	if strings.Join(got, ",") != "passed,skipped,skipped,skipped" {
		t.Errorf("statuses %v: ignored exports as skipped, the rest follows", got)
	}
	if el.Steps[1].Result.ErrorMessage != "captcha not solvable" || el.Steps[1].DocString == nil {
		t.Errorf("step 1: %+v", el.Steps[1])
	}
}

func TestStoreRoundTripAndEvidence(t *testing.T) {
	s := NewStore(t.TempDir())
	r := sample()
	if err := s.Create(r); err != nil {
		t.Fatal(err)
	}
	if err := s.Create(r); err == nil {
		t.Error("creating twice")
	}
	_ = r.Record("c1", 0, Passed, "fine", t0)
	rel, err := s.AddEvidence(r, "c1", 0, "../../evil name.png", strings.NewReader("png"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(rel, "..") || !strings.HasPrefix(rel, "evidence/c1-s1-") {
		t.Errorf("evidence path %q", rel)
	}
	got, err := s.Load("r1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Cases[0].Steps[0].Comment != "fine" || len(got.Cases[0].Steps[0].Evidence) != 1 {
		t.Errorf("reloaded: %+v", got.Cases[0].Steps[0])
	}
	dir, _ := s.Dir("r1")
	if b, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(rel))); err != nil || string(b) != "png" {
		t.Errorf("evidence file: %q %v", b, err)
	}
	if err := s.Save(r); err != nil {
		t.Fatal(err)
	}
	p, err := s.Export(r)
	if err != nil || filepath.Base(p) != "cucumber.json" {
		t.Fatalf("export %q %v", p, err)
	}
	list, _ := s.List()
	if len(list) != 1 || list[0].ID != "r1" || list[0].Done != 1 || list[0].Total != 4 || list[0].Finished {
		t.Errorf("list %+v", list)
	}
	if _, err := s.Load("../x"); err == nil {
		t.Error("invalid id")
	}
	if _, err := s.Load("missing"); err == nil {
		t.Error("missing run")
	}
}

func TestIssueText(t *testing.T) {
	r := sample()
	r.Cases[0].Tags = []string{"@manual", "@TEST_LIB-42", "@REQ_LIB-1"}
	_ = r.Record("c1", 0, Passed, "data ok", t0)
	_ = r.Record("c1", 1, Failed, "sorted descending", t0)
	r.Cases[0].Steps[1].Evidence = []string{"evidence/c1-s2-a.png"}
	is, err := r.Issue("c1", -1, "de")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"h3. Beobachtetes Verhalten", "{quote}sorted descending{quote}", "features/vergleich.feature", "Xray-Test: LIB-42",
		"# (/) *Given* a", "# (x) *When* b", "||x||y||", "evidence/c1-s2-a.png", "Testende Person: Michael", "Umgebung: https://test.example"} {
		if !strings.Contains(is.Description, want) {
			t.Errorf("description lacks %q:\n%s", want, is.Description)
		}
	}
	if !strings.HasPrefix(is.Summary, "[Test fehlgeschlagen] Preise sortiert: b") || len(is.Xray) != 1 || is.Xray[0] != "LIB-42" {
		t.Errorf("summary %q xray %v", is.Summary, is.Xray)
	}
	if strings.Contains(is.Description, "(?)") {
		t.Error("only steps up to the failure belong in the text")
	}
	if _, err := r.Issue("c1", 0, "en"); err == nil {
		t.Error("a passed step has no issue")
	}
	if _, err := r.Issue("nope", -1, "en"); err == nil {
		t.Error("unknown case")
	}
}
