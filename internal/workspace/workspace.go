// Package workspace finds and accesses .feature files below a root folder.
package workspace

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Ext is the file extension of Gherkin files.
const Ext = ".feature"

var skipDirs = map[string]bool{".git": true, "node_modules": true, "vendor": true, "target": true, "bin": true, "obj": true, ".idea": true, ".vscode": true}

// ErrOutside is returned for paths that escape the workspace root.
var ErrOutside = errors.New("path is outside the workspace")

// Find returns all .feature files below the given paths (files or folders),
// sorted and de-duplicated. Paths are returned as given (relative stays relative).
func Find(paths ...string) ([]string, error) {
	if len(paths) == 0 {
		paths = []string{"."}
	}
	set := map[string]bool{}
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			return nil, err
		}
		if !info.IsDir() {
			set[filepath.Clean(p)] = true
			continue
		}
		err = filepath.WalkDir(p, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() && path != p && (skipDirs[d.Name()] || strings.HasPrefix(d.Name(), ".")) {
				return filepath.SkipDir
			}
			if !d.IsDir() && strings.HasSuffix(d.Name(), Ext) {
				set[filepath.Clean(path)] = true
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out, nil
}

// Workspace is a root folder whose feature files can be read and written.
type Workspace struct {
	Root string
}

// Open validates root and returns a workspace with an absolute root.
func Open(root string) (*Workspace, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, errors.New("not a folder: " + abs)
	}
	return &Workspace{Root: abs}, nil
}

// Resolve turns a workspace-relative slash path into an absolute path and
// rejects anything that would leave the root.
func (w *Workspace) Resolve(rel string) (string, error) {
	rel = filepath.FromSlash(strings.TrimPrefix(rel, "/"))
	abs := filepath.Join(w.Root, rel)
	r, err := filepath.Rel(w.Root, abs)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", ErrOutside
	}
	return abs, nil
}

// Files lists feature files as workspace-relative slash paths.
func (w *Workspace) Files() ([]string, error) {
	abs, err := Find(w.Root)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(abs))
	for _, a := range abs {
		r, _ := filepath.Rel(w.Root, a)
		out = append(out, filepath.ToSlash(r))
	}
	return out, nil
}

// Read returns the content of a feature file.
func (w *Workspace) Read(rel string) (string, error) {
	p, err := w.checked(rel)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	return string(b), err
}

// Write stores a feature file, creating folders as needed.
func (w *Workspace) Write(rel, content string) error {
	p, err := w.checked(rel)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	return os.WriteFile(p, []byte(content), 0o644)
}

func (w *Workspace) checked(rel string) (string, error) {
	if !strings.HasSuffix(rel, Ext) {
		return "", errors.New("only " + Ext + " files can be accessed")
	}
	return w.Resolve(rel)
}

// Dir is an entry of a folder listing used by the folder picker.
type Dir struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Features int    `json:"features"`
}

// ListDirs lists the sub folders of an absolute folder (for picking a workspace).
func ListDirs(dir string) (string, []Dir, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", nil, err
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return abs, nil, err
	}
	var out []Dir
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") || skipDirs[e.Name()] {
			continue
		}
		p := filepath.Join(abs, e.Name())
		n := 0
		if sub, err := os.ReadDir(p); err == nil {
			for _, s := range sub {
				if strings.HasSuffix(s.Name(), Ext) {
					n++
				}
			}
		}
		out = append(out, Dir{Name: e.Name(), Path: p, Features: n})
	}
	return abs, out, nil
}
