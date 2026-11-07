package cli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/goerks/gherkit/internal/runner"
	"github.com/goerks/gherkit/internal/scaffold"
	"github.com/goerks/gherkit/internal/workspace"
	"github.com/spf13/cobra"
)

// ciSettings are the choices behind a generated pipeline, shared by `ci` and `init --ci`.
type ciSettings struct {
	provider string
	adapter  string // auto, none, go or java
	version  string
	features string
}

// file renders the pipeline for the project in root and explains its choices on notes.
func (s ciSettings) file(root string, notes io.Writer) (scaffold.File, error) {
	features := s.features
	if features == "" {
		features = "."
		if st, err := os.Stat(filepath.Join(root, "features")); err == nil && st.IsDir() {
			features = "features"
		}
	}
	adapter := s.adapter
	switch adapter {
	case "", "auto":
		adapter = ""
		if a, ok := runner.Detect(root); ok && (a.Name == "go" || a.Name == "java") {
			adapter = a.Name
			fmt.Fprintf(notes, "note: detected the %s runner, the pipeline runs the tests\n", a.Name)
		} else {
			fmt.Fprintln(notes, "note: no go or java project found, the pipeline only checks the Gherkin files (--adapter go|java adds the test run)")
		}
	case "none":
		adapter = ""
	}
	f, err := scaffold.CI(scaffold.CIOptions{
		Provider: s.provider,
		Version:  strings.TrimPrefix(s.version, "v"),
		Features: filepath.ToSlash(features),
		Adapter:  adapter,
	})
	if err != nil {
		return f, &ExitError{ExitUsage, err.Error()}
	}
	return f, nil
}

func printResults(w io.Writer, res []scaffold.Result) {
	for _, r := range res {
		label := string(r.Action)
		if r.Action == scaffold.Skipped {
			label = "kept"
		}
		fmt.Fprintf(w, "%-11s %s\n", label, r.Path)
	}
}

func initCmd() *cobra.Command {
	var lang, ci string
	var force, dryRun bool
	c := &cobra.Command{
		Use:   "init [folder]",
		Short: "Set up a folder for gherkit: example feature, optionally a CI pipeline",
		Long: `Prepares a folder (default: the current folder, created when missing) for gherkit. It writes features/example.feature when the folder has no feature file yet and, with --ci, a pipeline for your CI system (see "gherkit ci" for its options).

Existing files are never overwritten unless --force is given. --dry-run shows what would be written.`,
		Example: `  gherkit init                      # example feature in the current folder
  gherkit init my-specs --lang de   # German example in a new folder
  gherkit init --ci github          # also .github/workflows/gherkit.yml`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			root := "."
			if len(args) == 1 {
				root = args[0]
			}
			out, errw := cmd.OutOrStdout(), cmd.ErrOrStderr()
			var files []scaffold.File

			existing := 0
			if st, err := os.Stat(root); err == nil {
				if !st.IsDir() {
					return &ExitError{ExitUsage, fmt.Sprintf("%q is not a folder", root)}
				}
				found, err := workspace.Find(root)
				if err != nil {
					return &ExitError{ExitUsage, err.Error()}
				}
				existing = len(found)
			}
			// The language is checked even when no example is written.
			ex, err := scaffold.Init(lang)
			if err != nil {
				return &ExitError{ExitUsage, err.Error()}
			}
			if existing == 0 {
				files = append(files, ex...)
			} else {
				fmt.Fprintf(errw, "note: the folder already has %d feature file(s), no example is written\n", existing)
			}
			if ci != "" {
				f, err := ciSettings{provider: ci, adapter: "auto", version: "latest"}.file(root, errw)
				if err != nil {
					return err
				}
				files = append(files, f)
			}

			res, err := scaffold.Write(root, files, force, dryRun)
			if err != nil {
				return &ExitError{ExitUsage, "cannot write: " + err.Error()}
			}
			if dryRun {
				fmt.Fprintln(out, "dry run, nothing is written:")
			}
			printResults(out, res)
			if dryRun {
				return nil
			}
			if a, ok := runner.Detect(root); ok {
				fmt.Fprintf(out, "\nRunner: detected %q, run the tests with: gherkit run\n", a.Name)
			} else {
				fmt.Fprintln(out, "\nRunner: none detected yet, see gherkit run --help (--adapter or --cmd)")
			}
			fmt.Fprintln(out, "Next: gherkit edit (write), gherkit lint (check)")
			return nil
		},
	}
	c.Flags().StringVar(&lang, "lang", "en", "language of the example feature ("+strings.Join(scaffold.Languages(), ", ")+")")
	c.Flags().StringVar(&ci, "ci", "", "also write a CI pipeline ("+strings.Join(scaffold.Providers(), ", ")+")")
	c.Flags().BoolVar(&force, "force", false, "overwrite existing files")
	c.Flags().BoolVar(&dryRun, "dry-run", false, "show what would be written, write nothing")
	return c
}

func ciCmd() *cobra.Command {
	var provider, adapter, version, features, out string
	var force bool
	c := &cobra.Command{
		Use:   "ci [folder]",
		Short: "Generate a CI pipeline that checks, runs and reports your specifications",
		Long: `Writes a pipeline for your CI system. It installs gherkit from the GitHub release, checks the format (fmt --check) and lint (lint --strict) of the feature files, runs the tests through the adapter and publishes the HTML report as build artifact.

The adapter is detected from the project (go.mod, pom.xml, build.gradle); without a Go or Java project the pipeline only checks the files. The pipeline needs a published gherkit release. The file is written below the folder (default: the current folder); an existing file is only replaced with --force. Use -o - to print it instead.

Providers: ` + strings.Join(scaffold.Providers(), ", ") + `. The templates have not been run on every platform; check the first run.`,
		Example: `  gherkit ci                                  # GitHub Actions, .github/workflows/gherkit.yml
  gherkit ci --provider gitlab -o gherkit.gitlab-ci.yml
  gherkit ci --provider azure --adapter java --version 0.1.0
  gherkit ci -o -                             # print to the terminal`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			root := "."
			if len(args) == 1 {
				root = args[0]
			}
			if st, err := os.Stat(root); err != nil || !st.IsDir() {
				return &ExitError{ExitUsage, fmt.Sprintf("%q is not a folder", root)}
			}
			switch adapter {
			case "auto", "none", "go", "java":
			default:
				return &ExitError{ExitUsage, fmt.Sprintf("unknown --adapter %q (auto, none, go, java)", adapter)}
			}
			f, err := ciSettings{provider: provider, adapter: adapter, version: version, features: features}.file(root, cmd.ErrOrStderr())
			if err != nil {
				return err
			}
			if out == "-" {
				fmt.Fprint(cmd.OutOrStdout(), f.Content)
				return nil
			}
			if out != "" {
				f.Path = filepath.ToSlash(filepath.Clean(out))
			}
			res, err := scaffold.Write(root, []scaffold.File{f}, force, false)
			if err != nil {
				return &ExitError{ExitUsage, "cannot write: " + err.Error()}
			}
			if res[0].Action == scaffold.Skipped {
				return &ExitError{ExitUsage, fmt.Sprintf("%s exists: use --force to replace it or -o to write another file", res[0].Path)}
			}
			printResults(cmd.OutOrStdout(), res)
			return nil
		},
	}
	c.Flags().StringVar(&provider, "provider", "github", "CI system: "+strings.Join(scaffold.Providers(), ", "))
	c.Flags().StringVar(&adapter, "adapter", "auto", "runner adapter of the test step: auto (detect), none, go, java")
	c.Flags().StringVar(&version, "version", "latest", "gherkit release the pipeline installs (e.g. 0.1.0)")
	c.Flags().StringVar(&features, "features", "", "folder with the feature files (default: features, else the project folder)")
	c.Flags().StringVarP(&out, "out", "o", "", "file to write, relative to the folder (default per provider; - prints)")
	c.Flags().BoolVar(&force, "force", false, "replace an existing file")
	return c
}
