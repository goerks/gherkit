package scaffold

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteKeepsExistingFilesUnlessForced(t *testing.T) {
	d := t.TempDir()
	files := []File{{"a/b.txt", "new"}}
	res, err := Write(d, files, false, false)
	if err != nil || res[0].Action != Created {
		t.Fatalf("create: %v %v", res, err)
	}
	os.WriteFile(filepath.Join(d, "a", "b.txt"), []byte("mine"), 0o644)
	res, _ = Write(d, files, false, false)
	if res[0].Action != Skipped {
		t.Fatalf("expected skip, got %v", res)
	}
	if b, _ := os.ReadFile(filepath.Join(d, "a", "b.txt")); string(b) != "mine" {
		t.Fatalf("file was changed: %q", b)
	}
	res, _ = Write(d, files, true, false)
	if res[0].Action != Overwritten {
		t.Fatalf("expected overwrite, got %v", res)
	}
	if b, _ := os.ReadFile(filepath.Join(d, "a", "b.txt")); string(b) != "new" {
		t.Fatalf("not overwritten: %q", b)
	}
}

func TestWriteDryRunWritesNothing(t *testing.T) {
	d := t.TempDir()
	res, err := Write(d, []File{{"x.txt", "x"}}, false, true)
	if err != nil || res[0].Action != Created {
		t.Fatalf("%v %v", res, err)
	}
	if _, err := os.Stat(filepath.Join(d, "x.txt")); err == nil {
		t.Fatal("dry run wrote a file")
	}
}

func TestWriteRejectsPathsOutsideTarget(t *testing.T) {
	for _, p := range []string{"../x", "a/../../x", "/etc/x"} {
		if _, err := Write(t.TempDir(), []File{{p, "x"}}, false, false); err == nil {
			t.Errorf("%q was accepted", p)
		}
	}
}

func TestInitExamples(t *testing.T) {
	for _, l := range Languages() {
		f, err := Init(l)
		if err != nil || len(f) != 1 || f[0].Path != "features/example.feature" {
			t.Fatalf("%s: %v %v", l, f, err)
		}
		if !strings.Contains(f[0].Content, "@manual") {
			t.Errorf("%s: example shows no manual scenario", l)
		}
	}
	if f, _ := Init(""); !strings.HasPrefix(f[0].Content, "Feature:") {
		t.Error("default language is not English")
	}
	if _, err := Init("xx"); err == nil || !strings.Contains(err.Error(), "available: de, en") {
		t.Errorf("unknown language: %v", err)
	}
}

func TestCIForEveryProvider(t *testing.T) {
	for _, p := range Providers() {
		for _, ad := range []string{"", "go", "java"} {
			f, err := CI(CIOptions{Provider: p, Features: "features", Adapter: ad})
			if err != nil {
				t.Fatalf("%s/%s: %v", p, ad, err)
			}
			want, _ := DefaultCIPath(p)
			if f.Path != want {
				t.Errorf("%s: path %q", p, f.Path)
			}
			c := f.Content
			if strings.Contains(c, "[[") || strings.Contains(c, "<no value>") {
				t.Errorf("%s/%s: unresolved template:\n%s", p, ad, c)
			}
			for _, s := range []string{"gherkit fmt --check features", "gherkit lint --strict", `V="latest"`, "releases/download/v${V}/gherkit_${V}_linux_amd64.tar.gz"} {
				if !strings.Contains(c, s) {
					t.Errorf("%s/%s: missing %q", p, ad, s)
				}
			}
			if ad == "" && strings.Contains(c, "gherkit run") {
				t.Errorf("%s: runs tests without an adapter", p)
			}
			if ad != "" && !strings.Contains(c, "gherkit run --adapter "+ad+" --report build/gherkit-report.html") {
				t.Errorf("%s/%s: no run step", p, ad)
			}
			if strings.Contains(c, "\t") {
				t.Errorf("%s/%s: tab in YAML", p, ad)
			}
		}
	}
}

func TestCIPinnedVersionAndSetup(t *testing.T) {
	f, _ := CI(CIOptions{Provider: "github", Version: "0.1.0", Adapter: "java"})
	if !strings.Contains(f.Content, `V="0.1.0"`) || !strings.Contains(f.Content, "setup-java") {
		t.Fatalf("\n%s", f.Content)
	}
	f, _ = CI(CIOptions{Provider: "github", Adapter: "go"})
	if !strings.Contains(f.Content, "setup-go") || strings.Contains(f.Content, "setup-java") {
		t.Fatalf("\n%s", f.Content)
	}
}

func TestCIRejectsBadInput(t *testing.T) {
	bad := []CIOptions{
		{Provider: "jenkins"},
		{Provider: "github", Adapter: "dotnet"},
		{Provider: "github", Features: "my features"},
		{Provider: "github", Version: `1"; rm -rf /`},
		{Provider: "github", Report: "$(x).html"},
	}
	for _, o := range bad {
		if _, err := CI(o); err == nil {
			t.Errorf("%+v was accepted", o)
		}
	}
}
