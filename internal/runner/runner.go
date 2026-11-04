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

	"github.com/goerks/gherkit/internal/demorun"
)

// Adapter describes how gherkit starts the runner of one stack.
type Adapter struct {
	Name        string
	Description string
	// Command is a shell command template. {output} is replaced by the path of
	// the Cucumber JSON file to write, {features} by the feature paths given
	// on the command line (quoted, separated by spaces), {tags} by the Cucumber
	// tag expression of the scenarios to run and {tags_godog} by the same
	// expression in godog's own syntax (both quoted; see Request.Tags).
	Command string
	// Resolve picks the command from the project when Command is empty (for
	// example Maven or Gradle for Java).
	Resolve func(dir string) string
	// Env holds extra environment variables. Values can use {output} and
	// {features_csv} (the feature paths, unquoted, separated by commas) and
	// {tags} (the tag expression, unquoted). A
	// variable that is empty after expanding is not set.
	Env map[string]string
	// Detect reports whether dir looks like a project of this stack.
	Detect func(dir string) bool
	// ProjectTags returns the tag filter the project itself configures (Cucumber-JVM: cucumber.filter.tags in
	// its properties), so that the default filter of gherkit narrows it instead of replacing it.
	ProjectTags func(dir string) string
	// InProcess runs the scenarios inside gherkit itself instead of starting a command. It returns the exit
	// code the runner would have had. Used by the built-in demo runner.
	InProcess func(req Request) (int, error)
}

// presets in the order they are tried when the adapter is detected.
var presets = []Adapter{
	{
		Name:        "go",
		Description: "godog, started with go test (the suite must bind the godog flags, e.g. godog.BindCommandLineFlags)",
		Command:     "go test -count=1 -args -godog.format=cucumber:{output} -godog.tags={tags_godog}",
		Detect:      func(dir string) bool { return exists(dir, "go.mod") },
	},
	{
		Name:        "java",
		Description: "Cucumber-JVM with Maven or Gradle (JUnit Platform engine); results via -Dcucumber.plugin in JAVA_TOOL_OPTIONS",
		Resolve:     javaCommand,
		// The JUnit Platform engine reads system properties, not environment
		// variables. JAVA_TOOL_OPTIONS reaches every JVM the build starts,
		// including the forked test JVM of Maven and Gradle's test workers.
		Env:         map[string]string{"JAVA_TOOL_OPTIONS": `-Dcucumber.plugin="json:{output}" -Dcucumber.filter.tags="{tags}"`},
		Detect:      func(dir string) bool { return exists(dir, "pom.xml", "build.gradle", "build.gradle.kts", "gradlew") },
		ProjectTags: javaProjectTags,
	},
	{
		Name:        "demo",
		Description: "built-in demo runner with a small simulated shop and login, for trying gherkit out (never detected automatically)",
		InProcess:   demoRun,
	},
}

func demoRun(req Request) (int, error) {
	// Feature paths can be files or folders; without any, the whole working directory is searched.
	paths := req.Features
	if len(paths) == 0 {
		paths = []string{req.Dir}
	}
	var features []string
	for _, p := range paths {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			found, err := demorun.FindFeatures(p)
			if err != nil {
				return 0, err
			}
			for _, f := range found {
				features = append(features, filepath.Join(p, filepath.FromSlash(f)))
			}
			continue
		}
		features = append(features, p)
	}
	out, err := demorun.Run(req.Dir, features, req.Output, req.Stdout, req.Stderr)
	if err != nil {
		return 0, err
	}
	if out.Failing() {
		return 1, nil
	}
	return 0, nil
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
	// Tags is a Cucumber tag expression selecting the scenarios the runner
	// executes, e.g. "not @manual" (ADR 0009). Empty means no filter. godog
	// has its own syntax; {tags_godog} translates it (see GodogTags).
	Tags string
	// TagsDefault is set when Tags is gherkit's default and not chosen by the user: the adapter then
	// narrows the filter of the project (Adapter.ProjectTags) instead of replacing it.
	TagsDefault bool
	Command     string   // replaces the adapter's command when set
	Env         []string // extra KEY=VALUE pairs, applied last
	Stdout      io.Writer
	Stderr      io.Writer
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
	if a.InProcess != nil && req.Command == "" {
		start := time.Now()
		code, err := a.InProcess(req)
		return Result{Command: "(built in: " + a.Name + ")", ExitCode: code, Duration: time.Since(start)}, err
	}
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
	tags := req.Tags
	if req.TagsDefault && a.ProjectTags != nil {
		tags = CombineTags(a.ProjectTags(req.Dir), tags)
	}
	godogTags, err := GodogTags(tags)
	if err != nil && strings.Contains(tpl, "{tags_godog}") {
		return Result{}, err
	}
	res := Result{FeaturesIgnored: len(req.Features) > 0 && !strings.Contains(tpl, "{features}")}
	res.Command = expand(tpl, map[string]string{"output": Quote(req.Output), "features": strings.Join(quoted, " "), "tags": Quote(tags), "tags_godog": Quote(godogTags)})

	c := shellCmd(ctx, res.Command)
	c.Dir = req.Dir
	env := append(os.Environ(), "GHERKIT_RESULTS="+req.Output)
	keys := make([]string, 0, len(a.Env))
	for k := range a.Env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v := expand(a.Env[k], map[string]string{"output": req.Output, "features_csv": strings.Join(req.Features, ","), "tags": tags, "tags_godog": godogTags})
		if k == "JAVA_TOOL_OPTIONS" && os.Getenv(k) != "" {
			v = os.Getenv(k) + " " + v // keep the options the user already set
		}
		if v != "" {
			env = append(env, k+"="+v)
		}
	}
	c.Env = append(env, req.Env...)
	c.Stdout, c.Stderr = req.Stdout, req.Stderr

	start := time.Now()
	err = c.Run()
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

// GodogTags translates a Cucumber tag expression into godog's syntax: `not @a`
// becomes `~@a`, `and` becomes `&&`, `or` becomes a comma. godog cannot
// express parentheses; such an expression is an error (use --cmd instead).
func GodogTags(expr string) (string, error) {
	groups := [][]string{{}}
	neg := false
	for _, tok := range strings.Fields(expr) {
		switch low := strings.ToLower(tok); {
		case strings.ContainsAny(tok, "()"):
			return "", errors.New("godog cannot filter by an expression with parentheses (" + expr + "): use --tags without them or --cmd")
		case low == "or":
			groups = append(groups, []string{})
		case low == "and":
		case low == "not":
			neg = true
		case strings.HasPrefix(tok, "@"):
			if neg {
				tok = "~" + tok
			}
			neg = false
			groups[len(groups)-1] = append(groups[len(groups)-1], tok)
		default:
			return "", errors.New("unexpected " + tok + " in the tag expression " + expr + ": tags start with @, operators are and, or, not")
		}
	}
	var parts []string
	for _, g := range groups {
		if len(g) > 0 {
			parts = append(parts, strings.Join(g, "&&"))
		}
	}
	return strings.Join(parts, ","), nil
}

// CombineTags narrows the tag filter of a project by one of gherkit: both must hold.
func CombineTags(project, tags string) string {
	project, tags = strings.TrimSpace(project), strings.TrimSpace(tags)
	switch {
	case project == "":
		return tags
	case tags == "":
		return project
	}
	return "(" + project + ") and (" + tags + ")"
}

// javaProjectTags reads cucumber.filter.tags from the properties files Cucumber-JVM looks at in a Maven or
// Gradle project. It returns "" when the project sets none.
func javaProjectTags(dir string) string {
	for _, f := range []string{"junit-platform.properties", "cucumber.properties"} {
		b, err := os.ReadFile(filepath.Join(dir, "src", "test", "resources", f))
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(b), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "#") || strings.HasPrefix(line, "!") {
				continue
			}
			if k, v, ok := strings.Cut(line, "="); ok && strings.TrimSpace(k) == "cucumber.filter.tags" {
				return strings.TrimSpace(v)
			}
		}
	}
	return ""
}
