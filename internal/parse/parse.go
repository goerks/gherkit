// Package parse wraps the official Cucumber Gherkin parser.
//
// gherkit never re-implements Gherkin grammar: every document, token and
// pickle comes from github.com/cucumber/gherkin, so behaviour follows the
// official specification exactly.
package parse

import (
	"regexp"
	"strconv"
	"strings"

	gherkin "github.com/cucumber/gherkin/go/v42"
	messages "github.com/cucumber/messages/go/v34"
)

// Diagnostic is a problem found in a document, positioned 1-based.
type Diagnostic struct {
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Severity string `json:"severity"` // error | warning | info
	Rule     string `json:"rule"`
	Message  string `json:"message"`
}

// Token is one classified source line as seen by the official scanner.
type Token struct {
	Line        int        `json:"line"`
	Type        string     `json:"type"`
	Keyword     string     `json:"keyword,omitempty"`
	KeywordType string     `json:"keywordType,omitempty"`
	Indent      int        `json:"indent"`
	Text        string     `json:"text,omitempty"`
	Items       []LineSpan `json:"items,omitempty"`
}

// LineSpan is a tag or table cell with its 1-based column.
type LineSpan struct {
	Column int    `json:"column"`
	Text   string `json:"text"`
}

// Result bundles everything known about a parsed source.
type Result struct {
	URI      string                    `json:"uri"`
	Language string                    `json:"language"`
	Document *messages.GherkinDocument `json:"document,omitempty"`
	Pickles  []*messages.Pickle        `json:"pickles"`
	Tokens   []Token                   `json:"tokens"`
	Errors   []Diagnostic              `json:"errors"`
}

// OK reports whether the source parsed without errors.
func (r *Result) OK() bool { return len(r.Errors) == 0 }

// Source parses Gherkin source text. Parsing never panics and never returns
// a Go error: syntax problems are reported in Result.Errors and the
// best-effort document is still returned.
func Source(uri, src string) *Result {
	res := &Result{URI: uri, Language: gherkin.DefaultDialect, Pickles: []*messages.Pickle{}, Tokens: []Token{}, Errors: []Diagnostic{}}

	ids := &messages.Incrementing{}
	ast := gherkin.NewAstBuilder(ids.NewId)
	rec := &recorder{AstBuilder: ast, lines: strings.Split(src, "\n")}
	p := gherkin.NewParser(rec)
	p.StopAtFirstError(false)
	m := gherkin.NewMatcher(gherkin.DialectsBuiltin())

	err := p.Parse(gherkin.NewScanner(strings.NewReader(src)), m)
	res.Tokens = rec.tokens
	if err != nil {
		res.Errors = append(res.Errors, errorsFrom(err)...)
	}
	doc := ast.GetGherkinDocument()
	if doc != nil {
		doc.Uri = uri
		res.Document = doc
		if doc.Feature != nil {
			res.Language = doc.Feature.Language
		}
		if err == nil {
			res.Pickles = gherkin.Pickles(*doc, uri, ids.NewId)
		}
	}
	if res.Language == gherkin.DefaultDialect {
		for _, t := range res.Tokens {
			if t.Type == "Language" {
				res.Language = t.Text
			}
		}
	}
	return res
}

// recorder forwards to the AST builder and remembers each token so that
// editors can highlight exactly what the official scanner matched.
type recorder struct {
	gherkin.AstBuilder
	lines  []string
	tokens []Token
}

func (r *recorder) Reset() { r.tokens = nil; r.AstBuilder.Reset() }

func (r *recorder) Build(t *gherkin.Token) (bool, error) {
	if !t.IsEOF() && t.Location != nil {
		tok := Token{
			Line:    t.Location.Line,
			Type:    t.Type.Name(),
			Keyword: t.Keyword,
			Indent:  r.indent(t.Location.Line),
			Text:    t.Text,
		}
		if t.Keyword != "" && t.Type == gherkin.TokenTypeStepLine {
			tok.KeywordType = string(t.KeywordType)
		}
		for _, it := range t.Items {
			tok.Items = append(tok.Items, LineSpan{Column: it.Column, Text: it.Text})
		}
		r.tokens = append(r.tokens, tok)
	}
	return r.AstBuilder.Build(t)
}

func (r *recorder) indent(line int) int {
	if line < 1 || line > len(r.lines) {
		return 0
	}
	l := r.lines[line-1]
	return len(l) - len(strings.TrimLeft(l, " \t"))
}

var errLine = regexp.MustCompile(`^\((\d+):(\d+)\): (.*)$`)

func errorsFrom(err error) []Diagnostic {
	var out []Diagnostic
	for _, line := range strings.Split(err.Error(), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || line == "Parser errors:" {
			continue
		}
		d := Diagnostic{Line: 1, Column: 1, Severity: "error", Rule: "syntax", Message: line}
		if m := errLine.FindStringSubmatch(line); m != nil {
			d.Line, _ = strconv.Atoi(m[1])
			d.Column, _ = strconv.Atoi(m[2])
			if d.Column == 0 {
				d.Column = 1
			}
			d.Message = m[3]
		}
		out = append(out, d)
	}
	return out
}

// Dialect describes the keywords of one Gherkin language.
type Dialect struct {
	Code     string              `json:"code"`
	Name     string              `json:"name"`
	Native   string              `json:"native"`
	Keywords map[string][]string `json:"keywords"`
}

// Dialects returns all built-in languages from gherkin-languages.json.
func Dialects() []Dialect {
	codes := dialectCodes()
	out := make([]Dialect, 0, len(codes))
	for _, c := range codes {
		if d, ok := DialectFor(c); ok {
			out = append(out, d)
		}
	}
	return out
}

// DialectFor returns the keywords for one language code.
func DialectFor(code string) (Dialect, bool) {
	d := gherkin.DialectsBuiltin().GetDialect(code)
	if d == nil {
		return Dialect{}, false
	}
	return Dialect{Code: d.Language, Name: d.Name, Native: d.Native, Keywords: d.Keywords}, true
}
