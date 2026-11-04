package runner

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestMain lets the test binary act as a tiny runner: it writes its first
// argument as the "results" and exits with the code in HELPER_EXIT.
func TestMain(m *testing.M) {
	if os.Getenv("GHERKIT_HELPER") == "1" {
		out := os.Getenv("GHERKIT_RESULTS")
		if len(os.Args) > 1 && os.Args[1] != "" && os.Getenv("HELPER_WRITE") == "1" {
			os.WriteFile(out, []byte(os.Args[1]), 0o644)
		}
		code := 0
		if os.Getenv("HELPER_EXIT") == "3" {
			code = 3
		}
		os.Exit(code)
	}
	os.Exit(m.Run())
}

func helper(t *testing.T, extra ...string) (Adapter, Request) {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	env := append([]string{"GHERKIT_HELPER=1"}, extra...)
	return Adapter{Name: "test"}, Request{
		Dir:     dir,
		Output:  filepath.Join(dir, "out.json"),
		Command: Quote(exe) + " {output}",
		Env:     env,
		Stdout:  io.Discard,
		Stderr:  io.Discard,
	}
}

func TestRunWritesResultsAndReportsExitCode(t *testing.T) {
	a, req := helper(t, "HELPER_WRITE=1")
	res, err := Run(context.Background(), a, req)
	if err != nil || res.ExitCode != 0 {
		t.Fatalf("Run = %+v, %v", res, err)
	}
	if b, err := os.ReadFile(req.Output); err != nil || !strings.Contains(string(b), "out.json") {
		t.Fatalf("results file: %q, %v", b, err)
	}
	a, req = helper(t, "HELPER_EXIT=3")
	res, err = Run(context.Background(), a, req)
	if err != nil || res.ExitCode != 3 {
		t.Fatalf("a failing runner should give its exit code, got %+v, %v", res, err)
	}
}

func TestRunFailsWhenTheCommandCannotStart(t *testing.T) {
	req := Request{Dir: filepath.Join(t.TempDir(), "missing"), Output: "x", Command: "true", Stdout: io.Discard, Stderr: io.Discard}
	if _, err := Run(context.Background(), Adapter{}, req); err == nil {
		t.Fatal("expected an error for a missing working directory")
	}
}

func TestPlaceholders(t *testing.T) {
	a := Adapter{Command: "runner {features} --out {output}", Env: map[string]string{"FEATURES": "{features_csv}", "EMPTY": "{features_csv}"}}
	req := Request{Dir: t.TempDir(), Output: "res.json", Features: []string{"a.feature", "b c.feature"}, Stdout: io.Discard, Stderr: io.Discard}
	res, _ := Run(context.Background(), a, req)
	if !strings.Contains(res.Command, "runner a.feature ") || !strings.Contains(res.Command, "--out res.json") || !strings.Contains(res.Command, Quote("b c.feature")) {
		t.Errorf("command not expanded: %q", res.Command)
	}
	if res.FeaturesIgnored {
		t.Error("{features} is used, so the paths are not ignored")
	}
	res, _ = Run(context.Background(), Adapter{Command: "runner"}, req)
	if !res.FeaturesIgnored {
		t.Error("paths were given but the command has no {features}")
	}
}

func TestTagsPlaceholder(t *testing.T) {
	a := Adapter{Command: "runner --tags {tags}", Env: map[string]string{"TAGS": "{tags}"}}
	req := Request{Dir: t.TempDir(), Output: "res.json", Tags: "not @manual", Stdout: io.Discard, Stderr: io.Discard}
	res, _ := Run(context.Background(), a, req)
	if !strings.Contains(res.Command, "--tags "+Quote("not @manual")) {
		t.Errorf("tags not expanded and quoted: %q", res.Command)
	}
	req.Tags = ""
	res, _ = Run(context.Background(), a, req)
	if !strings.HasSuffix(res.Command, "--tags "+Quote("")) {
		t.Errorf("empty tags should expand to an empty argument: %q", res.Command)
	}
	for _, name := range []string{"go", "java"} {
		a, _ := Lookup(name)
		if !strings.Contains(a.Command+a.Env["JAVA_TOOL_OPTIONS"], "{tags") {
			t.Errorf("preset %s does not pass the tag filter", name)
		}
	}
}

func TestDetect(t *testing.T) {
	dir := t.TempDir()
	if _, ok := Detect(dir); ok {
		t.Fatal("an empty folder has no adapter")
	}
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module x\n"), 0o644)
	if a, ok := Detect(dir); !ok || a.Name != "go" {
		t.Fatalf("Detect = %v, %v; want go", a.Name, ok)
	}
	if _, ok := Lookup("go"); !ok {
		t.Fatal("go adapter missing")
	}
	jdir := t.TempDir()
	os.WriteFile(filepath.Join(jdir, "pom.xml"), []byte("<project/>"), 0o644)
	if a, ok := Detect(jdir); !ok || a.Name != "java" {
		t.Fatalf("Detect(pom.xml) = %v, %v; want java", a.Name, ok)
	}
	if _, ok := Lookup("nope"); ok {
		t.Fatal("unknown adapter found")
	}
}

func TestJavaCommand(t *testing.T) {
	dir := t.TempDir()
	if c := javaCommand(dir); !strings.HasPrefix(c, "gradle ") {
		t.Errorf("no project files: %q", c)
	}
	os.WriteFile(filepath.Join(dir, "pom.xml"), []byte("<project/>"), 0o644)
	if c := javaCommand(dir); !strings.HasPrefix(c, "mvn ") {
		t.Errorf("maven project: %q", c)
	}
	os.WriteFile(filepath.Join(dir, "mvnw"), []byte(""), 0o644)
	if c := javaCommand(dir); !strings.Contains(c, "mvnw") {
		t.Errorf("maven wrapper preferred: %q", c)
	}
	gdir := t.TempDir()
	os.WriteFile(filepath.Join(gdir, "gradlew"), []byte(""), 0o644)
	if c := javaCommand(gdir); !strings.Contains(c, "gradlew test") {
		t.Errorf("gradle wrapper: %q", c)
	}
	// the Java adapter tells Cucumber-JVM where to write the JSON through a system property
	a, _ := Lookup("java")
	if !strings.Contains(a.Env["JAVA_TOOL_OPTIONS"], "-Dcucumber.plugin=") || !strings.Contains(a.Env["JAVA_TOOL_OPTIONS"], "{output}") {
		t.Errorf("JAVA_TOOL_OPTIONS = %q", a.Env["JAVA_TOOL_OPTIONS"])
	}
}

func TestQuote(t *testing.T) {
	if Quote("plain/path.json") != "plain/path.json" {
		t.Error("plain words stay unquoted")
	}
	if q := Quote("has space"); q == "has space" || !strings.Contains(q, "has space") {
		t.Errorf("a path with a space must be quoted, got %q", q)
	}
}

func TestDemoAdapterRunsInProcess(t *testing.T) {
	a, ok := Lookup("demo")
	if !ok || a.InProcess == nil {
		t.Fatal("demo adapter missing")
	}
	if _, ok := Detect(t.TempDir()); ok {
		t.Fatal("demo must never be detected automatically")
	}
	dir := t.TempDir()
	feature := "Feature: F\n\n  Scenario: S\n    Given an empty shopping cart\n    When the customer starts the checkout\n    Then the message \"Your cart is empty\" is shown\n"
	if err := os.WriteFile(filepath.Join(dir, "a.feature"), []byte(feature), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "r.json")
	res, err := Run(context.Background(), a, Request{Dir: dir, Output: out, Stdout: io.Discard, Stderr: io.Discard})
	if err != nil || res.ExitCode != 0 {
		t.Fatalf("Run = %+v, %v", res, err)
	}
	// a folder given as feature path is searched for features
	res, err = Run(context.Background(), a, Request{Dir: dir, Features: []string{dir}, Output: out, Stdout: io.Discard, Stderr: io.Discard})
	if err != nil || res.ExitCode != 0 {
		t.Fatalf("Run with a folder = %+v, %v", res, err)
	}
	if _, err := os.Stat(out); err != nil {
		t.Fatalf("no results written: %v", err)
	}
}

func TestCombineTagsAndProjectFilter(t *testing.T) {
	for _, c := range []struct{ project, tags, want string }{
		{"", "not @manual", "not @manual"},
		{"not @fails", "not @manual", "(not @fails) and (not @manual)"},
		{"not @fails", "", "not @fails"},
		{"", "", ""},
	} {
		if got := CombineTags(c.project, c.tags); got != c.want {
			t.Errorf("CombineTags(%q, %q) = %q, want %q", c.project, c.tags, got, c.want)
		}
	}
	dir := t.TempDir()
	res := filepath.Join(dir, "src", "test", "resources")
	os.MkdirAll(res, 0o755)
	if got := javaProjectTags(dir); got != "" {
		t.Errorf("no properties file: %q", got)
	}
	os.WriteFile(filepath.Join(res, "junit-platform.properties"), []byte("cucumber.publish.quiet=true\n# cucumber.filter.tags=@commented\ncucumber.filter.tags = not @fails\n"), 0o644)
	if got := javaProjectTags(dir); got != "not @fails" {
		t.Errorf("junit-platform.properties: %q", got)
	}
	// the example project of the repository excludes its failing scenario itself
	if got := javaProjectTags(filepath.Join("..", "..", "runner-examples", "java")); got != "not @fails" {
		t.Errorf("runner-examples/java: %q", got)
	}
	// the Java adapter narrows the filter of the project by default and takes an explicit one as it is
	a, _ := Lookup("java")
	if a.ProjectTags == nil {
		t.Fatal("the Java adapter must know the filter of the project")
	}
	if got := CombineTags(a.ProjectTags(dir), "not @manual"); got != "(not @fails) and (not @manual)" {
		t.Errorf("default: %q", got)
	}
}
