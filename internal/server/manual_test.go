package server

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const manualFeature = `Feature: Vergleich

  Background:
    Given I open the comparison page

  @manual
  Scenario Outline: Offers are sorted by price
    When I search for "<product>"
    Then the offers are sorted ascending

    Examples:
      | product |
      | Hypothek |
      | Leasing  |

  Scenario: Automated check
    Then the API answers
`

func TestManualRunLifecycle(t *testing.T) {
	ts, dir := newTestServer(t)
	os.WriteFile(filepath.Join(dir, "vergleich.feature"), []byte(manualFeature), 0o644)

	var run struct {
		ID    string `json:"id"`
		Cases []struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Line  int    `json:"line"`
			Steps []struct {
				Keyword string `json:"keyword"`
				Text    string `json:"text"`
				Line    int    `json:"line"`
			} `json:"steps"`
		} `json:"cases"`
	}
	if code := call(t, ts, "POST", "/api/manual/runs", `{"files":["vergleich.feature"],"tag":"manual","tester":"Anna","environment":"test"}`, &run); code != 201 {
		t.Fatalf("create: %d", code)
	}
	if len(run.Cases) != 2 {
		t.Fatalf("only the two @manual outline rows, got %d cases", len(run.Cases))
	}
	c := run.Cases[0]
	if c.Line != 13 || len(c.Steps) != 3 || c.Steps[0].Text != "I open the comparison page" || c.Steps[1].Text != `I search for "Hypothek"` || c.Steps[1].Keyword != "When " || c.Steps[1].Line != 8 {
		t.Errorf("case 1: %+v", c)
	}

	base := "/api/manual/runs/" + run.ID
	var ok map[string]any
	if code := call(t, ts, "PUT", base+"/step", `{"case":"c1","step":0,"status":"passed"}`, &ok); code != 200 {
		t.Fatalf("step: %d", code)
	}
	if code := call(t, ts, "PUT", base+"/step", `{"case":"c1","step":1,"status":"nonsense"}`, &ok); code != 400 {
		t.Errorf("bad status: %d", code)
	}
	call(t, ts, "PUT", base+"/step", `{"case":"c1","step":1,"status":"failed","comment":"sorted descending"}`, &ok)

	// evidence upload and retrieval
	res, err := http.Post(ts.URL+base+"/evidence?case=c1&step=1&name=shot.png", "image/png", strings.NewReader("PNGDATA"))
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("evidence: %v %v", res, err)
	}
	res.Body.Close()
	res, _ = http.Get(ts.URL + base + "/evidence/c1-s2-shot.png")
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || string(b) != "PNGDATA" || !strings.Contains(res.Header.Get("Content-Security-Policy"), "sandbox") {
		t.Errorf("evidence file: %d %q %v", res.StatusCode, b, res.Header)
	}
	res, _ = http.Get(ts.URL + base + "/evidence/..%2Fsession.json")
	res.Body.Close()
	if res.StatusCode == 200 {
		t.Error("path traversal must not serve other files")
	}

	// report of the running run, then finish
	res, _ = http.Get(ts.URL + base + "/report?lang=de")
	b, _ = io.ReadAll(res.Body)
	res.Body.Close()
	for _, want := range []string{"Anna", "sorted descending", "evidence/c1-s2-shot.png", "manuell"} {
		if !strings.Contains(string(b), want) {
			t.Errorf("report lacks %q", want)
		}
	}
	var fin struct {
		Cucumber string `json:"cucumber"`
	}
	if code := call(t, ts, "POST", base+"/finish", "", &fin); code != 200 {
		t.Fatalf("finish: %d", code)
	}
	if !strings.HasSuffix(fin.Cucumber, "cucumber.json") {
		t.Errorf("export path %q", fin.Cucumber)
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(fin.Cucumber))); err != nil {
		t.Errorf("cucumber.json missing: %v", err)
	}
	if code := call(t, ts, "PUT", base+"/step", `{"case":"c1","step":0,"status":"passed"}`, &ok); code != 400 {
		t.Errorf("a finished run is read-only, got %d", code)
	}
	var list []struct {
		ID       string
		Finished bool
	}
	call(t, ts, "GET", "/api/manual/runs", "", &list)
	if len(list) != 1 || !list[0].Finished {
		t.Errorf("list: %+v", list)
	}
}

func TestManualRunValidation(t *testing.T) {
	ts, _ := newTestServer(t)
	var e map[string]string
	if code := call(t, ts, "POST", "/api/manual/runs", `{"tag":"@manual"}`, &e); code != 400 || !strings.Contains(e["error"], "tester") {
		t.Errorf("tester required: %d %v", code, e)
	}
	if code := call(t, ts, "POST", "/api/manual/runs", `{"tag":"@manual","tester":"A"}`, &e); code != 400 || !strings.Contains(e["error"], "@manual") {
		t.Errorf("no matching cases: %d %v", code, e)
	}
	if code := call(t, ts, "GET", "/api/manual/runs/does-not-exist", "", &e); code != 404 {
		t.Errorf("missing run: %d", code)
	}
}

func TestManualRunOverTheFolderSkipsBrokenFiles(t *testing.T) {
	ts, dir := newTestServer(t)
	os.WriteFile(filepath.Join(dir, "good.feature"), []byte("Feature: G\n\n  @manual\n  Scenario: S\n    Given a\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "broken.feature"), []byte("Feature: B\n\n  Scenario: S\n    Given a\n      | x |\n      | y | z |\n"), 0o644)
	var run struct {
		Cases   []struct{ Name string }
		Skipped []string
	}
	if code := call(t, ts, "POST", "/api/manual/runs", `{"tag":"@manual","tester":"A"}`, &run); code != 201 {
		t.Fatalf("a broken file must not stop a run over the folder: %d", code)
	}
	if len(run.Cases) != 1 || len(run.Skipped) != 1 || !strings.Contains(run.Skipped[0], "broken.feature") {
		t.Errorf("cases %v skipped %v", run.Cases, run.Skipped)
	}
	// asking for the broken file itself is an error, not a silent skip
	var e map[string]string
	if code := call(t, ts, "POST", "/api/manual/runs", `{"files":["broken.feature"],"tester":"A"}`, &e); code != 400 || !strings.Contains(e["error"], "syntax errors") {
		t.Errorf("explicit file: %d %v", code, e)
	}
}
