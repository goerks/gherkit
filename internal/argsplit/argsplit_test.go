package argsplit

import (
	"reflect"
	"testing"
)

func TestSplit(t *testing.T) {
	for line, want := range map[string][]string{
		``:                                     nil,
		`  `:                                   nil,
		`fmt --check .`:                        {"fmt", "--check", "."},
		`run --cmd "cp results.json {output}"`: {"run", "--cmd", "cp results.json {output}"},
		`report -t 'my template.tmpl' x`:       {"report", "-t", "my template.tmpl", "x"},
		`echo "a \"quoted\" word"`:             {"echo", `a "quoted" word`},
		`a\ b c`:                               {"a b", "c"},
		`x "" y`:                               {"x", "", "y"},
		`--title="Mein Report"`:                {"--title=Mein Report"},
		"lint\t.\n":                            {"lint", "."},
		`path\to`:                              {"pathto"},
	} {
		got, err := Split(line)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Errorf("Split(%q) = %q, %v; want %q", line, got, err, want)
		}
	}
	for _, bad := range []string{`echo "open`, `x 'open`} {
		if _, err := Split(bad); err != ErrUnterminated {
			t.Errorf("Split(%q): want ErrUnterminated, got %v", bad, err)
		}
	}
}
