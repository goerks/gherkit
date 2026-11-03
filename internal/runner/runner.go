// Package runner starts the test runner of a project (godog, Cucumber-JVM, ...)
// and collects the Cucumber JSON it writes.
//
// gherkit does not execute step code. An Adapter only knows how to start the
// runner of one stack and where to tell it to put its results.
package runner

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

// Adapter describes how gherkit starts the runner of one stack.
type Adapter struct {
	Name        string
	Description string
	// Command is a shell command template. {output} is replaced by the path of
	// the Cucumber JSON file to write, {features} by the feature paths given
	// on the command line (quoted, separated by spaces).
	Command string
	// Resolve picks the command from the project when Command is empty (for
	// example Maven or Gradle for Java).
	Resolve func(dir string) string
	// Env holds extra environment variables. Values can use {output} and
	// {features_csv} (the feature paths, unquoted, separated by commas). A
	// variable that is empty after expanding is not set.
	Env map[string]string
	// Detect reports whether dir looks like a project of this stack.
	Detect func(dir string) bool
}

// presets in the order they are tried when the adapter is detected.
var presets = []Adapter{
	{
		Name:        "go",
		Description: "godog, started with go test (the suite must bind the godog flags, e.g. godog.BindCommandLineFlags)",
		Command:     "go test -count=1 -args -godog.format=cucumber:{output}",
		Detect:      func(dir string) bool { return exists(dir, "go.mod") },
	},
	{
		Name:        "java",
		Description: "Cucumber-JVM with Maven or Gradle (JUnit Platform engine); results via CUCUMBER_PLUGIN",
		Resolve:     javaCommand,
		Env:         map[string]string{"CUCUMBER_PLUGIN": "json:{output}", "CUCUMBER_FEATURES": "{features_csv}"},
		Detect:      func(dir string) bool { return exists(dir, "pom.xml", "build.gradle", "build.gradle.kts", "gradlew") },
	},
}

// javaCommand chooses the build tool of a Java project: Maven first, then
// Gradle; a wrapper script in the project is preferred over the installed tool.
func javaCommand(dir string) string {
	wrapper := func(name string) string {
		if runtime.GOOS == "windows" {
			return name
		}
		return "./" + name
	}
	switch {
	case exists(dir, "pom.xml") && exists(dir, "mvnw"):
		return wrapper("mvnw") + " -B -ntp test"
	case exists(dir, "pom.xml"):
		return "mvn -B -ntp test"
	case exists(dir, "gradlew"):
		return wrapper("gradlew") + " test --rerun-tasks"
	default:
		return "gradle test --rerun-tasks"
	}
}

// Names lists the available adapters.
func Names() []string {
	var n []string
	for _, a := range presets {
		n = append(n, a.Name)
	}
	return n
}

// Lookup returns the adapter with the given name.
func Lookup(name string) (Adapter, bool) {
	for _, a := range presets {
		if a.Name == name {
			return a, true
		}
	}
	return Adapter{}, false
}

// Detect picks the adapter that fits the project in dir.
func Detect(dir string) (Adapter, bool) {
	for _, a := range presets {
		if a.Detect != nil && a.Detect(dir) {
			return a, true
		}
	}
	return Adapter{}, false
}

func exists(dir string, names ...string) bool {
	for _, n := range names {
		if _, err := os.Stat(filepath.Join(dir, n)); err == nil {
			return true
		}
	}
	return false
}

// Request is one run of a runner.
type Request struct {
	Dir      string   // working directory of the runner
	Features []string // feature paths for adapters that take them
	Output   string   // absolute path of the Cucumber JSON file the runner must write
	Command  string   // replaces the adapter's command when set
	Env      []string // extra KEY=VALUE pairs, applied last
	Stdout   io.Writer
	Stderr   io.Writer
}

// Result describes a finished run.
type Result struct {
	Command         string
	ExitCode        int
	Duration        time.Duration
	FeaturesIgnored bool // feature paths were given but the command has no {features}
}

var plain = regexp.MustCompile(`^[A-Za-z0-9_@%+=:,./\\-]+$`)

// Quote makes s one argument of a shell command on this platform.
func Quote(s string) string {
	if s != "" && plain.MatchString(s) {
		return s
	}
	if runtime.GOOS == "windows" {
		return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func expand(tpl string, vars map[string]string) string {
	for k, v := range vars {
		tpl = strings.ReplaceAll(tpl, "{"+k+"}", v)
	}
	return tpl
}

// Run starts the runner and waits for it. A runner that exits with a non-zero
// code is not an error: the code is returned in the Result. An error means the
// runner could not be started at all.
func Run(ctx context.Context, a Adapter, req Request) (Result, error) {
	tpl := a.Command
	if tpl == "" && a.Resolve != nil {
		tpl = a.Resolve(req.Dir)
	}
	if req.Command != "" {
		tpl = req.Command
	}
	var quoted []string
	for _, f := range req.Features {
		quoted = append(quoted, Quote(f))
	}
	res := Result{FeaturesIgnored: len(req.Features) > 0 && !strings.Contains(tpl, "{features}")}
	res.Command = expand(tpl, map[string]string{"output": Quote(req.Output), "features": strings.Join(quoted, " ")})

	c := shellCmd(ctx, res.Command)
	c.Dir = req.Dir
	env := append(os.Environ(), "GHERKIT_RESULTS="+req.Output)
	keys := make([]string, 0, len(a.Env))
	for k := range a.Env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v := expand(a.Env[k], map[string]string{"output": req.Output, "features_csv": strings.Join(req.Features, ",")})
		if v != "" {
			env = append(env, k+"="+v)
		}
	}
	c.Env = append(env, req.Env...)
	c.Stdout, c.Stderr = req.Stdout, req.Stderr

	start := time.Now()
	err := c.Run()
	res.Duration = time.Since(start)
	var ee *exec.ExitError
	switch {
	case err == nil:
	case errors.As(err, &ee):
		res.ExitCode = ee.ExitCode()
		if res.ExitCode == 0 {
			res.ExitCode = 1
		}
		err = nil
	default:
		return res, err
	}
	return res, nil
}
