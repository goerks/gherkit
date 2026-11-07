// Package scaffold generates the files of `gherkit init` and `gherkit ci`.
// It only uses the standard library and knows nothing about the CLI.
package scaffold

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// File is one generated file. Path is relative to the target folder and uses slashes.
type File struct {
	Path    string
	Content string
}

// Action tells what Write did (or would do) with a file.
type Action string

const (
	Created     Action = "created"
	Overwritten Action = "overwritten"
	Skipped     Action = "skipped"
)

// Result is the outcome for one file.
type Result struct {
	Path   string
	Action Action
}

// Write writes the files below root. Existing files are kept unless force is set.
// With dryRun nothing is written, the results show what would happen.
func Write(root string, files []File, force, dryRun bool) ([]Result, error) {
	var res []Result
	for _, f := range files {
		rel := filepath.Clean(filepath.FromSlash(f.Path))
		if filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return res, fmt.Errorf("path %q leaves the target folder", f.Path)
		}
		target := filepath.Join(root, rel)
		action := Created
		if st, err := os.Stat(target); err == nil {
			if st.IsDir() {
				return res, fmt.Errorf("%s is a folder", f.Path)
			}
			if !force {
				res = append(res, Result{f.Path, Skipped})
				continue
			}
			action = Overwritten
		} else if !errors.Is(err, os.ErrNotExist) {
			return res, err
		}
		if !dryRun {
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return res, err
			}
			if err := os.WriteFile(target, []byte(f.Content), 0o644); err != nil {
				return res, err
			}
		}
		res = append(res, Result{f.Path, action})
	}
	return res, nil
}
