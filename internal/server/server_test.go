package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "sub"), 0o755)
	os.WriteFile(filepath.Join(dir, "a.feature"), []byte("Feature: A\n\n  Scenario: S\n    Given shared step\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "sub", "b.feature"), []byte("Feature: B\n\n  Scenario: T\n    Given shared step\n    Then other step\n"), 0o644)
	s, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	return ts, dir
}

func call(t *testing.T, ts *httptest.Server, method, path, body string, out any) int {
	t.Helper()
	req, _ := http.NewRequest(method, ts.URL+path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if out != nil {
		if err := json.Unmarshal(b, out); err != nil {
			t.Fatalf("%s %s: %v: %s", method, path, err, b)
		}
	}
	return res.StatusCode
}

func TestWorkspaceAndFiles(t *testing.T) {
	ts, dir := newTestServer(t)
	var ws struct {
		Root  string
		Files []string
	}
	call(t, ts, "GET", "/api/workspace", "", &ws)
	if len(ws.Files) != 2 || ws.Files[1] != "sub/b.feature" {
		t.Fatalf("files: %v", ws.Files)
	}
	var f struct{ Content string }
	if code := call(t, ts, "GET", "/api/file?path=a.feature", "", &f); code != 200 || !strings.HasPrefix(f.Content, "Feature: A") {
		t.Fatalf("%d %q", code, f.Content)
	}
	if code := call(t, ts, "PUT", "/api/file", `{"path":"c.feature","content":"Feature: C\n"}`, nil); code != 200 {
		t.Fatalf("save: %d", code)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "c.feature")); string(b) != "Feature: C\n" {
		t.Fatalf("not written: %q", b)
	}
	if code := call(t, ts, "GET", "/api/file?path=../etc/x.feature", "", nil); code != 400 {
		t.Fatalf("traversal must be rejected, got %d", code)
	}
	if code := call(t, ts, "GET", "/api/file?path=missing.feature", "", nil); code != 404 {
		t.Fatalf("missing file: %d", code)
	}
}

func TestSwitchWorkspaceAndBrowse(t *testing.T) {
	ts, dir := newTestServer(t)
	var ws struct{ Files []string }
	if code := call(t, ts, "POST", "/api/workspace", `{"root":"sub"}`, &ws); code != 200 || len(ws.Files) != 1 {
		t.Fatalf("%d %v", code, ws.Files)
	}
	if code := call(t, ts, "POST", "/api/workspace", `{"root":"/does/not/exist"}`, nil); code != 400 {
		t.Fatalf("bad folder: %d", code)
	}
	var br struct {
		Dir  string
		Dirs []struct{ Name string }
	}
	call(t, ts, "GET", "/api/browse?dir="+dir, "", &br)
	if len(br.Dirs) != 1 || br.Dirs[0].Name != "sub" {
		t.Fatalf("browse: %+v", br)
	}
}

func TestParseFormatRenderLint(t *testing.T) {
	ts, _ := newTestServer(t)
	var p struct {
		Language string
		Tokens   []struct{ Type string }
		Errors   []any
		Pickles  []any
		Document json.RawMessage
	}
	call(t, ts, "POST", "/api/parse", `{"path":"x.feature","content":"Feature: F\n  Scenario: S\n    Given x\n"}`, &p)
	if len(p.Errors) != 0 || len(p.Pickles) != 1 || p.Tokens[0].Type != "FeatureLine" {
		t.Fatalf("parse: %+v", p)
	}
	var f struct{ Content string }
	call(t, ts, "POST", "/api/format", `{"content":"Feature:   F\n"}`, &f)
	if f.Content != "Feature: F\n" {
		t.Fatalf("format: %q", f.Content)
	}
	// render: the structured editor sends the AST back
	var r struct {
		Content string
		Parsed  struct{ Errors []any }
	}
	call(t, ts, "POST", "/api/render", string(p.Document), &r)
	if r.Content != "Feature: F\n\n  Scenario: S\n    Given x\n" || len(r.Parsed.Errors) != 0 {
		t.Fatalf("render: %q", r.Content)
	}
	var l struct{ Diagnostics []struct{ Rule string } }
	call(t, ts, "POST", "/api/lint", `{"content":"Feature: F\n\n  Scenario: S\n"}`, &l)
	if len(l.Diagnostics) == 0 || l.Diagnostics[0].Rule != "no-steps" {
		t.Fatalf("lint: %+v", l)
	}
}

func TestStepsAndDialects(t *testing.T) {
	ts, _ := newTestServer(t)
	var steps []StepUse
	call(t, ts, "GET", "/api/steps", "", &steps)
	if len(steps) != 2 || steps[0].Text != "shared step" || steps[0].Count != 2 {
		t.Fatalf("steps: %+v", steps)
	}
	var ds []struct{ Code string }
	call(t, ts, "GET", "/api/dialects", "", &ds)
	if len(ds) < 70 {
		t.Fatalf("dialects: %d", len(ds))
	}
	var de struct{ Keywords map[string][]string }
	if code := call(t, ts, "GET", "/api/dialects/de", "", &de); code != 200 || de.Keywords["given"] == nil {
		t.Fatalf("de: %d", code)
	}
	if code := call(t, ts, "GET", "/api/dialects/nope", "", nil); code != 404 {
		t.Fatalf("unknown dialect: %d", code)
	}
}

func TestCrossOriginWritesRejected(t *testing.T) {
	ts, _ := newTestServer(t)
	req, _ := http.NewRequest("PUT", ts.URL+"/api/file", strings.NewReader(`{"path":"evil.feature","content":"x"}`))
	req.Header.Set("Origin", "https://evil.example")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("got %d", res.StatusCode)
	}
}

func TestStaticUI(t *testing.T) {
	ts, _ := newTestServer(t)
	for _, p := range []string{"/", "/app.js", "/highlight.js", "/style.css"} {
		res, err := http.Get(ts.URL + p)
		if err != nil || res.StatusCode != 200 {
			t.Fatalf("%s: %v %v", p, err, res.StatusCode)
		}
	}
}

func TestSaveKeepsWindowsLineEndings(t *testing.T) {
	ts, dir := newTestServer(t)
	os.WriteFile(filepath.Join(dir, "win.feature"), []byte("Feature: W\r\n\r\n  Scenario: S\r\n    Given x\r\n"), 0o644)
	body := `{"path":"win.feature","content":"Feature: W\n\n  Scenario: S\n    Given y\n"}`
	if code := call(t, ts, "PUT", "/api/file", body, nil); code != 200 {
		t.Fatalf("save: %d", code)
	}
	got, _ := os.ReadFile(filepath.Join(dir, "win.feature"))
	if want := "Feature: W\r\n\r\n  Scenario: S\r\n    Given y\r\n"; string(got) != want {
		t.Errorf("existing CRLF file: got %q, want %q", got, want)
	}
	call(t, ts, "PUT", "/api/file", `{"path":"new.feature","content":"Feature: N\n"}`, nil)
	got, _ = os.ReadFile(filepath.Join(dir, "new.feature"))
	if string(got) != "Feature: N\n" {
		t.Errorf("new file should stay LF, got %q", got)
	}
}
