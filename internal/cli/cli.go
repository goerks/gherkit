// Package cli wires the gherkit commands.
package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/goerks/gherkit/internal/format"
	"github.com/goerks/gherkit/internal/lint"
	"github.com/goerks/gherkit/internal/parse"
	"github.com/goerks/gherkit/internal/report"
	"github.com/goerks/gherkit/internal/runner"
	"github.com/goerks/gherkit/internal/server"
	"github.com/goerks/gherkit/internal/workspace"
	"github.com/spf13/cobra"
)

// Exit codes are part of the CLI contract (see docs/cli.md).
const (
	ExitOK       = 0
	ExitFailed   = 1 // tests failed
	ExitProblems = 2 // lint/format problems found
	ExitUsage    = 3 // bad usage or configuration
)

// ExitError carries an exit code through cobra.
type ExitError struct {
	Code int
	Msg  string
}

func (e *ExitError) Error() string { return e.Msg }

// Version information, set at build time via -ldflags.
var (
	Version = "dev"
	Commit  = "none"
)

// Execute runs the CLI and returns the process exit code.
func Execute(args []string, stdout, stderr io.Writer) int {
	root := NewRoot(stdout, stderr)
	root.SetArgs(args)
	err := root.Execute()
	if err == nil {
		return ExitOK
	}
	var ee *ExitError
	if errors.As(err, &ee) {
		if ee.Msg != "" {
			fmt.Fprintln(stderr, ee.Msg)
		}
		return ee.Code
	}
	fmt.Fprintln(stderr, "error:", err)
	return ExitUsage
}

// NewRoot builds the command tree.
func NewRoot(stdout, stderr io.Writer) *cobra.Command {
	root := &cobra.Command{
		Use:           "gherkit",
		Short:         "Write, check, edit and report Gherkin specifications",
		Long:          "gherkit is a single binary for the whole Gherkin workflow: format, lint, edit in the browser and report results.",
		SilenceUsage:  true,
		SilenceErrors: true,
		Version:       Version,
	}
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.SetVersionTemplate("gherkit {{.Version}} (" + Commit + ")\n")
	root.AddCommand(fmtCmd(), lintCmd(), reportCmd(), runCmd(), editCmd(), dialectsCmd(), parseCmd())
	return root
}

func fmtCmd() *cobra.Command {
	var check, list bool
	c := &cobra.Command{
		Use:   "fmt [paths...]",
		Short: "Format .feature files in canonical layout",
		Long:  "Formats .feature files in place. With --check nothing is written and the exit code is 2 if a file is not formatted.",
		RunE: func(cmd *cobra.Command, args []string) error {
			files, err := workspace.Find(args...)
			if err != nil {
				return &ExitError{ExitUsage, err.Error()}
			}
			bad := 0
			for _, f := range files {
				b, err := os.ReadFile(f)
				if err != nil {
					return err
				}
				ok, out, err := format.Check(string(b))
				if err != nil {
					fmt.Fprintf(cmd.ErrOrStderr(), "%s: %v\n", f, err)
					bad++
					continue
				}
				if ok {
					continue
				}
				bad++
				if check || list {
					fmt.Fprintln(cmd.OutOrStdout(), f)
					continue
				}
				if err := os.WriteFile(f, []byte(out), 0o644); err != nil {
					return err
				}
				fmt.Fprintln(cmd.OutOrStdout(), "formatted", f)
			}
			if check && bad > 0 {
				return &ExitError{ExitProblems, fmt.Sprintf("%d of %d file(s) need formatting", bad, len(files))}
			}
			return nil
		},
	}
	c.Flags().BoolVar(&check, "check", false, "only check, exit 2 if files are not formatted")
	c.Flags().BoolVarP(&list, "list", "l", false, "list files that would change")
	return c
}

func lintCmd() *cobra.Command {
	var output string
	var disable []string
	var strict bool
	c := &cobra.Command{
		Use:   "lint [paths...]",
		Short: "Check .feature files for syntax errors and common problems",
		RunE: func(cmd *cobra.Command, args []string) error {
			files, err := workspace.Find(args...)
			if err != nil {
				return &ExitError{ExitUsage, err.Error()}
			}
			opt := lint.Options{Disable: map[string]bool{}}
			for _, d := range disable {
				opt.Disable[d] = true
			}
			type fileDiag struct {
				File string `json:"file"`
				parse.Diagnostic
			}
			var all []fileDiag
			for _, f := range files {
				b, err := os.ReadFile(f)
				if err != nil {
					return err
				}
				for _, d := range lint.Source(f, string(b), opt) {
					all = append(all, fileDiag{f, d})
				}
			}
			errs, warns, infos := 0, 0, 0
			for _, d := range all {
				switch d.Severity {
				case "error":
					errs++
				case "warning":
					warns++
				default:
					infos++
				}
			}
			w := cmd.OutOrStdout()
			switch output {
			case "json":
				if all == nil {
					all = []fileDiag{}
				}
				enc := json.NewEncoder(w)
				enc.SetIndent("", "  ")
				_ = enc.Encode(all)
			case "github":
				for _, d := range all {
					level := map[string]string{"error": "error", "warning": "warning"}[d.Severity]
					if level == "" {
						level = "notice"
					}
					fmt.Fprintf(w, "::%s file=%s,line=%d,col=%d,title=%s::%s\n", level, d.File, d.Line, d.Column, d.Rule, d.Message)
				}
			default:
				for _, d := range all {
					fmt.Fprintf(w, "%s:%d:%d: %s: %s [%s]\n", d.File, d.Line, d.Column, d.Severity, d.Message, d.Rule)
				}
				fmt.Fprintf(w, "%d file(s), %d error(s), %d warning(s), %d info\n", len(files), errs, warns, infos)
			}
			if errs > 0 || (strict && warns > 0) {
				return &ExitError{ExitProblems, ""}
			}
			return nil
		},
	}
	c.Flags().StringVarP(&output, "output", "o", "text", "output format: text, json, github")
	c.Flags().StringSliceVar(&disable, "disable", nil, "rules to disable (comma separated)")
	c.Flags().BoolVar(&strict, "strict", false, "treat warnings as failures")
	return c
}

func reportCmd() *cobra.Command {
	var out, formatName, tmpl, title, lang string
	var failOnFailed bool
	c := &cobra.Command{
		Use:   "report <cucumber.json>...",
		Short: "Create a report from Cucumber JSON results",
		Long:  "Reads one or more Cucumber JSON result files (written by godog, cucumber-jvm, cucumber-js, Reqnroll, ...) and renders HTML, Markdown or JSON using built-in or custom Go templates.",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var readers []io.Reader
			for _, a := range args {
				f, err := os.Open(a)
				if err != nil {
					return &ExitError{ExitUsage, err.Error()}
				}
				defer f.Close()
				readers = append(readers, f)
			}
			r, err := report.FromCucumberJSON(readers...)
			if err != nil {
				return &ExitError{ExitUsage, err.Error()}
			}
			r.Title, r.Language = title, lang
			if err := renderReport(cmd.OutOrStdout(), r, out, formatName, tmpl); err != nil {
				return err
			}
			s := r.Summary.Scenarios
			fmt.Fprintf(cmd.ErrOrStderr(), "%d scenario(s): %d passed, %d failed, %d other\n", s.Total, s.Passed, s.Failed, s.Total-s.Passed-s.Failed)
			if failOnFailed && s.Failed > 0 {
				return &ExitError{ExitFailed, ""}
			}
			return nil
		},
	}
	c.Flags().StringVarP(&out, "out", "o", "", "output file (default stdout)")
	c.Flags().StringVarP(&formatName, "format", "f", "", "html, md or json (default from --out extension, else html)")
	c.Flags().StringVarP(&tmpl, "template", "t", "", "custom Go template file")
	c.Flags().StringVar(&title, "title", "", "report title")
	c.Flags().StringVar(&lang, "lang", "en", "report language (en, de)")
	c.Flags().BoolVar(&failOnFailed, "fail-on-failed", false, "exit 1 if a scenario failed")
	return c
}

// renderReport writes the report to out (stdout when empty or "-"). The format
// defaults to the extension of out, else HTML.
func renderReport(stdout io.Writer, r *report.Report, out, formatName, tmpl string) error {
	if formatName == "" {
		formatName = "html"
		if strings.HasSuffix(out, ".md") {
			formatName = "md"
		} else if strings.HasSuffix(out, ".json") {
			formatName = "json"
		}
	}
	w := stdout
	if out != "" && out != "-" {
		f, err := os.Create(out)
		if err != nil {
			return &ExitError{ExitUsage, err.Error()}
		}
		defer f.Close()
		w = f
	}
	if err := report.Render(w, r, formatName, tmpl); err != nil {
		return &ExitError{ExitUsage, err.Error()}
	}
	return nil
}

func runCmd() *cobra.Command {
	var adapterName, command, dir, out, reportOut, formatName, tmpl, title, lang string
	var env []string
	var failOnFailed bool
	var timeout time.Duration
	c := &cobra.Command{
		Use:   "run [features...]",
		Short: "Run the project's test runner and report its results",
		Long: `Starts the test runner of the project through an adapter, reads the Cucumber JSON it writes and prints a summary. gherkit does not execute step code itself.

The command is a template: {output} is replaced by the path of the Cucumber JSON file, {features} by the feature paths given here (quoted). The environment variable GHERKIT_RESULTS holds the same path. Without --adapter and --cmd the adapter is detected from the project (go.mod).

Adapters: ` + strings.Join(runner.Names(), ", ") + `.`,
		Example: `  gherkit run                                   # detect the stack, run, summarise
  gherkit run --report build/report.html        # also write an HTML report
  gherkit run --cmd "npx cucumber-js --format json:{output} {features}" features`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if dir == "" {
				dir = "."
			}
			if st, err := os.Stat(dir); err != nil || !st.IsDir() {
				return &ExitError{ExitUsage, fmt.Sprintf("--dir %q is not a folder", dir)}
			}
			var ad runner.Adapter
			switch {
			case adapterName != "" && adapterName != "auto":
				a, ok := runner.Lookup(adapterName)
				if !ok {
					return &ExitError{ExitUsage, fmt.Sprintf("unknown adapter %q (available: %s)", adapterName, strings.Join(runner.Names(), ", "))}
				}
				ad = a
			case command != "":
				ad = runner.Adapter{Name: "custom"}
			default:
				a, ok := runner.Detect(dir)
				if !ok {
					return &ExitError{ExitUsage, fmt.Sprintf("no adapter detected in %s: use --adapter (%s) or --cmd \"<command with {output}>\"", dir, strings.Join(runner.Names(), ", "))}
				}
				ad = a
			}
			if ad.Command == "" && command == "" {
				return &ExitError{ExitUsage, "adapter " + ad.Name + " has no command: use --cmd"}
			}

			results := out
			if results == "" {
				f, err := os.CreateTemp("", "gherkit-results-*.json")
				if err != nil {
					return err
				}
				f.Close()
				defer os.Remove(f.Name())
				results = f.Name()
			}
			results, err := filepath.Abs(results)
			if err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(results), 0o755); err != nil {
				return err
			}
			os.Remove(results) // never read a stale result
			var features []string
			for _, f := range args {
				abs, err := filepath.Abs(f)
				if err != nil {
					return err
				}
				features = append(features, abs)
			}

			ctx := cmd.Context()
			if ctx == nil {
				ctx = context.Background()
			}
			ctx, stop := signal.NotifyContext(ctx, os.Interrupt)
			defer stop()
			if timeout > 0 {
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, timeout)
				defer cancel()
			}

			stderr := cmd.ErrOrStderr()
			res, err := runner.Run(ctx, ad, runner.Request{
				Dir: dir, Features: features, Output: results, Command: command, Env: env,
				Stdout: cmd.OutOrStdout(), Stderr: stderr,
			})
			if err != nil {
				return &ExitError{ExitUsage, "cannot start the runner: " + err.Error()}
			}
			if res.FeaturesIgnored {
				fmt.Fprintln(stderr, "note: feature paths were given, but the command has no {features}; the runner chooses the features itself")
			}

			f, openErr := os.Open(results)
			if openErr != nil {
				msg := fmt.Sprintf("the runner exited with code %d and wrote no results (expected Cucumber JSON in %s)", res.ExitCode, results)
				if res.ExitCode == 0 {
					return &ExitError{ExitUsage, msg + ": check the command and its {output}"}
				}
				return &ExitError{ExitFailed, msg}
			}
			defer f.Close()
			r, err := report.FromCucumberJSON(f)
			if err != nil {
				return &ExitError{ExitUsage, "cannot read the results: " + err.Error()}
			}
			r.Title, r.Language = title, lang
			if reportOut != "" {
				if err := renderReport(cmd.OutOrStdout(), r, reportOut, formatName, tmpl); err != nil {
					return err
				}
			}
			s := r.Summary.Scenarios
			fmt.Fprintf(stderr, "%d scenario(s): %d passed, %d failed, %d other (%s)\n", s.Total, s.Passed, s.Failed, s.Total-s.Passed-s.Failed, res.Duration.Round(time.Millisecond))
			if res.ExitCode != 0 && s.Failed == 0 {
				return &ExitError{ExitFailed, fmt.Sprintf("the runner exited with code %d", res.ExitCode)}
			}
			if failOnFailed && s.Failed > 0 {
				return &ExitError{ExitFailed, ""}
			}
			return nil
		},
	}
	c.Flags().StringVar(&adapterName, "adapter", "auto", "runner adapter: "+strings.Join(runner.Names(), ", ")+" or auto (detect)")
	c.Flags().StringVar(&command, "cmd", "", "shell command template replacing the adapter's command ({output}, {features})")
	c.Flags().StringVar(&dir, "dir", ".", "working directory of the runner")
	c.Flags().StringVarP(&out, "out", "o", "", "keep the Cucumber JSON results in this file (default: temporary)")
	c.Flags().StringArrayVarP(&env, "env", "e", nil, "extra environment variable KEY=VALUE for the runner (repeatable)")
	c.Flags().DurationVar(&timeout, "timeout", 0, "stop the runner after this time (e.g. 10m)")
	c.Flags().StringVar(&reportOut, "report", "", "also write a report to this file (.html, .md or .json)")
	c.Flags().StringVarP(&formatName, "format", "f", "", "report format: html, md or json (default from --report extension)")
	c.Flags().StringVarP(&tmpl, "template", "t", "", "custom Go template file for the report")
	c.Flags().StringVar(&title, "title", "", "report title")
	c.Flags().StringVar(&lang, "lang", "en", "report language (en, de)")
	c.Flags().BoolVar(&failOnFailed, "fail-on-failed", true, "exit 1 if a scenario failed (--fail-on-failed=false to only report)")
	return c
}

func editCmd() *cobra.Command {
	var addr string
	var noOpen bool
	c := &cobra.Command{
		Use:   "edit [folder]",
		Short: "Open the browser editor for a folder of .feature files",
		Long:  "Starts a local web editor (bound to localhost) for the given folder, default the current folder. The folder can be switched in the editor later.",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			root := "."
			if len(args) == 1 {
				root = args[0]
			}
			srv, err := server.New(root)
			if err != nil {
				return &ExitError{ExitUsage, err.Error()}
			}
			server.Version = Version
			ln, err := net.Listen("tcp", addr)
			if err != nil {
				return &ExitError{ExitUsage, err.Error()}
			}
			url := "http://" + ln.Addr().String() + "/"
			fmt.Fprintf(cmd.OutOrStdout(), "gherkit editor for %s\n→ %s  (Ctrl+C to stop)\n", srv.Root(), url)
			if !noOpen {
				openBrowser(url)
			}
			hs := &http.Server{Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}
			go func() {
				ch := make(chan os.Signal, 1)
				signal.Notify(ch, os.Interrupt)
				<-ch
				_ = hs.Close()
			}()
			if err := hs.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
				return err
			}
			return nil
		},
	}
	c.Flags().StringVar(&addr, "addr", "127.0.0.1:4848", "listen address (use port 0 for a free port)")
	c.Flags().BoolVar(&noOpen, "no-open", false, "do not open the browser")
	return c
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func dialectsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "dialects [code]",
		Short: "List Gherkin languages or show the keywords of one",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			w := cmd.OutOrStdout()
			if len(args) == 1 {
				d, ok := parse.DialectFor(args[0])
				if !ok {
					return &ExitError{ExitUsage, "unknown language: " + args[0]}
				}
				for _, k := range []string{"feature", "rule", "background", "scenario", "scenarioOutline", "examples", "given", "when", "then", "and", "but"} {
					fmt.Fprintf(w, "%-16s %s\n", k, strings.Join(trimAll(d.Keywords[k]), " | "))
				}
				return nil
			}
			for _, d := range parse.Dialects() {
				fmt.Fprintf(w, "%-10s %-22s %s\n", d.Code, d.Name, d.Native)
			}
			return nil
		},
	}
}

func trimAll(in []string) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = strings.TrimSpace(s)
	}
	return out
}

func parseCmd() *cobra.Command {
	var pickles bool
	return func() *cobra.Command {
		c := &cobra.Command{
			Use:   "parse <file.feature>",
			Short: "Print the official Gherkin AST (or pickles) as JSON",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				b, err := os.ReadFile(args[0])
				if err != nil {
					return &ExitError{ExitUsage, err.Error()}
				}
				res := parse.Source(args[0], string(b))
				enc := json.NewEncoder(cmd.OutOrStdout())
				enc.SetIndent("", "  ")
				if pickles {
					_ = enc.Encode(res.Pickles)
				} else {
					_ = enc.Encode(map[string]any{"gherkinDocument": res.Document, "errors": res.Errors})
				}
				if !res.OK() {
					return &ExitError{ExitProblems, ""}
				}
				return nil
			},
		}
		c.Flags().BoolVar(&pickles, "pickles", false, "print compiled pickles (test cases) instead of the AST")
		return c
	}()
}
