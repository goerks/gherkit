// Package acceptance runs gherkit's own acceptance specifications in
// ../features against the real binary – gherkit is specified in Gherkin,
// checked with `gherkit lint`/`gherkit fmt` and reported with `gherkit report`.
package acceptance

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/cucumber/godog"
	"github.com/goerks/gherkit/internal/parse"
)

var (
	binary  string
	repo    string
	cucJSON = flag.String("gherkit.cucumber", "../build/acceptance/cucumber.json", "where to write the Cucumber JSON results")
)

func TestMain(m *testing.M) {
	flag.Parse()
	_, file, _, _ := runtime.Caller(0)
	repo = filepath.Dir(filepath.Dir(file))
	dir, err := os.MkdirTemp("", "gherkit-bin")
	if err != nil {
		panic(err)
	}
	binary = filepath.Join(dir, "gherkit")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	build := exec.Command("go", "build", "-o", binary, "./cmd/gherkit")
	build.Dir = repo
	build.Stdout, build.Stderr = os.Stdout, os.Stderr
	if err := build.Run(); err != nil {
		panic("building gherkit failed: " + err.Error())
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

func TestAcceptance(t *testing.T) {
	if err := os.MkdirAll(filepath.Dir(*cucJSON), 0o755); err != nil {
		t.Fatal(err)
	}
	suite := godog.TestSuite{
		Name:                "gherkit",
		ScenarioInitializer: initScenario,
		Options: &godog.Options{
			Format:   "pretty,cucumber:" + *cucJSON,
			Paths:    []string{filepath.Join(repo, "features")},
			Strict:   true,
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("acceptance tests failed")
	}
}

// world is the state of one scenario.
type world struct {
	dir            string
	stdout, stderr string
	exit           int
	original       map[string]string
	example        string
	editor         *exec.Cmd
	editorURL      string
	response       string
}

func initScenario(sc *godog.ScenarioContext) {
	w := &world{original: map[string]string{}}
	sc.Before(func(ctx context.Context, _ *godog.Scenario) (context.Context, error) {
		d, err := os.MkdirTemp("", "gherkit-accept")
		w.dir = d
		return ctx, err
	})
	sc.After(func(ctx context.Context, _ *godog.Scenario, _ error) (context.Context, error) {
		if w.editor != nil && w.editor.Process != nil {
			_ = w.editor.Process.Kill()
			_, _ = w.editor.Process.Wait()
		}
		return ctx, os.RemoveAll(w.dir)
	})

	// files
	sc.Step(`^a file "([^"]+)" with:$`, w.fileWith)
	sc.Step(`^eine Datei "([^"]+)" mit:$`, w.fileWith)
	sc.Step(`^the official Gherkin example "([^"]+)"$`, w.officialExample)
	sc.Step(`^the file "([^"]+)" contains:$`, w.fileContainsDoc)
	sc.Step(`^the file "([^"]+)" contains "([^"]*)"$`, w.fileContains)
	sc.Step(`^the file "([^"]+)" does not contain "([^"]*)"$`, w.fileNotContains)
	sc.Step(`^the file "([^"]+)" is unchanged$`, w.fileUnchanged)
	sc.Step(`^the file still yields the same test cases$`, w.samePickles)
	sc.Step(`^a Cucumber JSON result with (\d+) passed and (\d+) failed scenarios?$`, w.cucumberResult)

	// cli
	sc.Step(`^I run "((?:[^"\\]|\\.)*)"$`, w.run)
	sc.Step(`^ich "((?:[^"\\]|\\.)*)" ausführe$`, w.run)
	sc.Step(`^the exit code is (\d+)$`, w.exitCode)
	sc.Step(`^ist der Exit-Code (\d+)$`, w.exitCode)
	sc.Step(`^the output contains "([^"]*)"$`, w.outputContains)
	sc.Step(`^enthält die Ausgabe "([^"]*)"$`, w.outputContains)
	sc.Step(`^the error output contains "([^"]*)"$`, w.errorContains)

	// editor
	sc.Step(`^the editor is running in the current folder$`, w.startEditor)
	sc.Step(`^I request "(GET|POST|PUT) ([^"]+)"$`, w.request)
	sc.Step(`^the response contains "((?:[^"\\]|\\.)*)"$`, w.responseContains)
	sc.Step(`^the response does not contain "([^"]*)"$`, w.responseNotContains)
	sc.Step(`^I save "([^"]+)" with "((?:[^"\\]|\\.)*)" through the editor$`, w.saveThroughEditor)
	sc.Step(`^I open the folder "([^"]+)" in the editor$`, w.openFolder)
}

func unquote(s string) string {
	r := strings.NewReplacer(`\n`, "\n", `\"`, `"`, `\\`, `\`)
	return r.Replace(s)
}

func (w *world) path(rel string) string { return filepath.Join(w.dir, filepath.FromSlash(rel)) }

func (w *world) fileWith(name string, doc *godog.DocString) error {
	content := doc.Content
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	p := w.path(name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	w.original[name] = content
	return os.WriteFile(p, []byte(content), 0o644)
}

func (w *world) officialExample(name string) error {
	b, err := os.ReadFile(filepath.Join(repo, "testdata", "spec", "good", name))
	if err != nil {
		return err
	}
	w.example = name
	w.original[name] = string(b)
	return os.WriteFile(w.path(name), b, 0o644)
}

func (w *world) fileContainsDoc(name string, doc *godog.DocString) error {
	return w.fileContains(name, doc.Content)
}

func (w *world) fileContains(name, want string) error {
	b, err := os.ReadFile(w.path(name))
	if err != nil {
		return err
	}
	if !strings.Contains(string(b), want) {
		return fmt.Errorf("file %s does not contain %q:\n%s", name, want, b)
	}
	return nil
}

func (w *world) fileNotContains(name, unwanted string) error {
	b, err := os.ReadFile(w.path(name))
	if err != nil {
		return err
	}
	if strings.Contains(string(b), unwanted) {
		return fmt.Errorf("file %s contains %q:\n%s", name, unwanted, b)
	}
	return nil
}

func (w *world) fileUnchanged(name string) error {
	b, err := os.ReadFile(w.path(name))
	if err != nil {
		return err
	}
	if string(b) != w.original[name] {
		return fmt.Errorf("file %s was changed:\n%s", name, b)
	}
	return nil
}

func meaning(name, src string) (string, error) {
	r := parse.Source(name, src)
	if !r.OK() {
		return "", fmt.Errorf("%s does not parse: %v", name, r.Errors)
	}
	type step struct {
		Text, Type string
		Arg        any
	}
	type pickle struct {
		Name  string
		Tags  []string
		Steps []step
	}
	var out []pickle
	for _, p := range r.Pickles {
		pk := pickle{Name: p.Name}
		for _, tg := range p.Tags {
			pk.Tags = append(pk.Tags, tg.Name)
		}
		for _, s := range p.Steps {
			pk.Steps = append(pk.Steps, step{s.Text, string(s.Type), s.Argument})
		}
		out = append(out, pk)
	}
	b, err := json.Marshal(out)
	return string(b), err
}

func (w *world) samePickles() error {
	after, err := os.ReadFile(w.path(w.example))
	if err != nil {
		return err
	}
	a, err := meaning(w.example, w.original[w.example])
	if err != nil {
		return err
	}
	b, err := meaning(w.example, string(after))
	if err != nil {
		return err
	}
	if a != b {
		return fmt.Errorf("test cases changed\nbefore: %s\nafter:  %s", a, b)
	}
	return nil
}

func (w *world) cucumberResult(passed, failed int) error {
	var els []map[string]any
	step := func(status string) []map[string]any {
		return []map[string]any{{"keyword": "Given ", "name": "a step", "line": 3, "result": map[string]any{"status": status, "duration": 1000000}}}
	}
	for i := 0; i < passed; i++ {
		els = append(els, map[string]any{"keyword": "Scenario", "name": fmt.Sprintf("ok %d", i), "type": "scenario", "steps": step("passed")})
	}
	for i := 0; i < failed; i++ {
		els = append(els, map[string]any{"keyword": "Scenario", "name": fmt.Sprintf("bad %d", i), "type": "scenario", "steps": step("failed")})
	}
	b, _ := json.Marshal([]map[string]any{{"uri": "f.feature", "keyword": "Feature", "name": "F", "elements": els}})
	return os.WriteFile(w.path("results.json"), b, 0o644)
}

// splitArgs splits a command line; double quotes group words.
func splitArgs(s string) []string {
	var out []string
	var cur strings.Builder
	in := false
	for _, r := range s {
		switch {
		case r == '"':
			in = !in
		case r == ' ' && !in:
			if cur.Len() > 0 {
				out = append(out, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteRune(r)
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

func (w *world) run(cmdline string) error {
	args := splitArgs(unquote(cmdline))
	if len(args) == 0 || args[0] != "gherkit" {
		return fmt.Errorf("only gherkit commands can be run, got %q", cmdline)
	}
	cmd := exec.Command(binary, args[1:]...)
	cmd.Dir = w.dir
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	w.stdout, w.stderr, w.exit = out.String(), errb.String(), 0
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		w.exit = ee.ExitCode()
	} else if err != nil {
		return err
	}
	return nil
}

func (w *world) exitCode(want int) error {
	if w.exit != want {
		return fmt.Errorf("exit code %d, want %d\nstdout:\n%s\nstderr:\n%s", w.exit, want, w.stdout, w.stderr)
	}
	return nil
}

func (w *world) outputContains(s string) error {
	if !strings.Contains(w.stdout, s) {
		return fmt.Errorf("output does not contain %q:\n%s", s, w.stdout)
	}
	return nil
}

func (w *world) errorContains(s string) error {
	if !strings.Contains(w.stderr, s) {
		return fmt.Errorf("error output does not contain %q:\n%s", s, w.stderr)
	}
	return nil
}

func (w *world) startEditor() error {
	cmd := exec.Command(binary, "edit", "--no-open", "--addr", "127.0.0.1:0", ".")
	cmd.Dir = w.dir
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	w.editor = cmd
	found := make(chan string, 1)
	go func() {
		sc := bufio.NewScanner(stdout)
		for sc.Scan() {
			if i := strings.Index(sc.Text(), "http://"); i >= 0 {
				found <- strings.Fields(sc.Text()[i:])[0]
				break
			}
		}
		_, _ = io.Copy(io.Discard, stdout)
	}()
	select {
	case u := <-found:
		w.editorURL = strings.TrimSuffix(u, "/")
		return nil
	case <-time.After(10 * time.Second):
		return errors.New("editor did not start")
	}
}

func (w *world) do(method, path, body string) error {
	req, err := http.NewRequest(method, w.editorURL+path, strings.NewReader(body))
	if err != nil {
		return err
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	w.response = string(b)
	if res.StatusCode >= 300 {
		return fmt.Errorf("%s %s: %d %s", method, path, res.StatusCode, b)
	}
	return nil
}

func (w *world) request(method, path string) error { return w.do(method, path, "") }

func (w *world) responseContains(s string) error {
	s = unquote(s)
	if !strings.Contains(w.response, s) {
		return fmt.Errorf("response does not contain %q:\n%.2000s", s, w.response)
	}
	return nil
}

func (w *world) responseNotContains(s string) error {
	if strings.Contains(w.response, s) {
		return fmt.Errorf("response unexpectedly contains %q", s)
	}
	return nil
}

func (w *world) saveThroughEditor(path, content string) error {
	b, _ := json.Marshal(map[string]string{"path": path, "content": unquote(content)})
	return w.do("PUT", "/api/file", string(b))
}

func (w *world) openFolder(folder string) error {
	b, _ := json.Marshal(map[string]string{"root": folder})
	return w.do("POST", "/api/workspace", string(b))
}
