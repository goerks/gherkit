package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func setup(t *testing.T) string {
	t.Helper()
	d := t.TempDir()
	for _, p := range []string{"a.feature", "sub/b.feature", "sub/notes.txt", "node_modules/x.feature", ".hidden/y.feature"} {
		os.MkdirAll(filepath.Join(d, filepath.Dir(p)), 0o755)
		os.WriteFile(filepath.Join(d, p), []byte("Feature: x\n"), 0o644)
	}
	return d
}

func TestFilesSkipsToolingFolders(t *testing.T) {
	ws, err := Open(setup(t))
	if err != nil {
		t.Fatal(err)
	}
	files, err := ws.Files()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 || files[0] != "a.feature" || files[1] != "sub/b.feature" {
		t.Fatalf("got %v", files)
	}
}

func TestResolveRejectsEscapes(t *testing.T) {
	ws, _ := Open(setup(t))
	for _, p := range []string{"../x.feature", "sub/../../x.feature", "/../../etc/passwd.feature"} {
		if _, err := ws.Resolve(p); err == nil {
			t.Errorf("%s: expected ErrOutside", p)
		}
	}
	if _, err := ws.Read("sub/notes.txt"); err == nil {
		t.Error("non-feature file must not be readable")
	}
}

func TestReadWrite(t *testing.T) {
	ws, _ := Open(setup(t))
	if err := ws.Write("new/dir/c.feature", "Feature: c\n"); err != nil {
		t.Fatal(err)
	}
	got, err := ws.Read("new/dir/c.feature")
	if err != nil || got != "Feature: c\n" {
		t.Fatalf("%q %v", got, err)
	}
}

func TestFindAndListDirs(t *testing.T) {
	d := setup(t)
	files, err := Find(filepath.Join(d, "a.feature"), d)
	if err != nil || len(files) != 2 {
		t.Fatalf("%v %v", files, err)
	}
	if _, err := Find(filepath.Join(d, "missing")); err == nil {
		t.Fatal("expected error for missing path")
	}
	_, dirs, err := ListDirs(d)
	if err != nil || len(dirs) != 1 || dirs[0].Name != "sub" || dirs[0].Features != 1 {
		t.Fatalf("%+v %v", dirs, err)
	}
	if _, err := Open(filepath.Join(d, "a.feature")); err == nil {
		t.Fatal("a file is not a workspace")
	}
}
