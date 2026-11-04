package report

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/goerks/gherkit/internal/parse"
)

// The sample results of the Render preview (examples/results, written by
// scripts/gen-preview-results.py) must stay valid: they load as Cucumber JSON
// and cover exactly the scenarios the official parser finds in the feature files.
func TestPreviewResultsMatchFeatureFiles(t *testing.T) {
	root := filepath.Join("..", "..")
	files, _ := filepath.Glob(filepath.Join(root, "examples", "results", "*.cucumber.json"))
	if len(files) != 3 {
		t.Fatalf("expected 3 result files, got %v", files)
	}
	got := map[string][]string{} // feature uri -> scenario names
	var failed, undefined, manual int
	for _, f := range files {
		b, err := os.Open(f)
		if err != nil {
			t.Fatal(err)
		}
		r, err := FromCucumberJSON(b)
		b.Close()
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for _, ft := range r.Features {
			for _, sc := range ft.Scenarios {
				got[ft.URI] = append(got[ft.URI], sc.Name)
				if sc.Manual {
					manual++
				}
				switch sc.Status {
				case Failed:
					failed++
				case Undefined:
					undefined++
				}
			}
		}
	}
	if failed == 0 || undefined == 0 || manual == 0 {
		t.Errorf("the samples should show failed (%d), undefined (%d) and manual (%d) scenarios", failed, undefined, manual)
	}
	for uri, names := range got {
		src, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(uri)))
		if err != nil {
			t.Fatalf("%s: %v", uri, err)
		}
		res := parse.Source(uri, string(src))
		if !res.OK() {
			continue // examples/shop/broken.feature is broken on purpose
		}
		var want []string
		for _, p := range res.Pickles {
			want = append(want, p.Name)
		}
		sort.Strings(want)
		sort.Strings(names)
		if strings.Join(want, "\n") != strings.Join(names, "\n") {
			t.Errorf("%s: results cover\n%s\nbut the file has\n%s", uri, strings.Join(names, "\n"), strings.Join(want, "\n"))
		}
	}
	if len(got) != 13 {
		t.Errorf("expected 13 feature files in the results, got %d", len(got))
	}
}
