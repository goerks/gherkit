// Package format pretty-prints Gherkin documents.
//
// The printer works on the official AST (messages.GherkinDocument), so it can
// render text that was parsed from a file as well as documents that were
// edited structurally (e.g. in the browser editor). Comments are kept and
// re-attached in front of the element that followed them in the source.
package format

import (
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	messages "github.com/cucumber/messages/go/v34"
	"github.com/goerks/gherkit/internal/parse"
)

// Options control the layout. The zero value is not useful; use Default.
type Options struct {
	Indent string
}

// Default is the canonical gherkit layout: two spaces per level.
var Default = Options{Indent: "  "}

// Source parses src and returns the formatted text. If the source has
// syntax errors it is returned unchanged together with the diagnostics,
// because reformatting a broken document could destroy content.
func Source(src string) (string, []parse.Diagnostic) {
	res := parse.Source("", src)
	if !res.OK() || res.Document == nil {
		return src, res.Errors
	}
	return Document(res.Document, Default), nil
}

// Document renders a GherkinDocument as Gherkin text.
func Document(doc *messages.GherkinDocument, opt Options) string {
	if opt.Indent == "" {
		opt.Indent = Default.Indent
	}
	p := &printer{opt: opt}
	p.comments = append(p.comments, doc.Comments...)
	sort.SliceStable(p.comments, func(i, j int) bool { return line(p.comments[i].Location) < line(p.comments[j].Location) })

	if f := doc.Feature; f != nil {
		p.flush(line(f.Location), 0)
		if f.Language != "" && f.Language != "en" {
			p.writeln(0, "# language: "+f.Language)
		}
		p.tags(f.Tags, 0)
		p.writeln(0, header(f.Keyword, f.Name))
		p.description(f.Description, 1)
		// Gherkin has no syntax for a Feature-level Background or Scenario
		// after a Rule: it would become part of that Rule. Print them first so
		// edited documents keep their meaning.
		for _, c := range f.Children {
			switch {
			case c.Background != nil:
				p.background(c.Background, 1)
			case c.Scenario != nil:
				p.scenario(c.Scenario, 1)
			}
		}
		for _, c := range f.Children {
			if c.Rule != nil {
				p.rule(c.Rule, 1)
			}
		}
	}
	p.flush(int(^uint(0)>>1), 0)
	out := strings.TrimRight(p.b.String(), "\n")
	if out == "" {
		return ""
	}
	return out + "\n"
}

type printer struct {
	opt      Options
	b        strings.Builder
	comments []*messages.Comment
}

func line(l *messages.Location) int {
	if l == nil {
		return -1
	}
	return int(l.Line)
}

func header(keyword, name string) string {
	if name == "" {
		return keyword + ":"
	}
	return keyword + ": " + name
}

func (p *printer) ind(level int) string { return strings.Repeat(p.opt.Indent, level) }

func (p *printer) writeln(level int, s string) {
	if s == "" {
		p.b.WriteString("\n")
		return
	}
	p.b.WriteString(p.ind(level) + s + "\n")
}

func (p *printer) blank() {
	s := p.b.String()
	if s == "" || strings.HasSuffix(s, "\n\n") {
		return
	}
	p.b.WriteString("\n")
}

// flush writes all comments that appeared before the given source line.
func (p *printer) flush(before, level int) {
	if before < 0 {
		return
	}
	for len(p.comments) > 0 && line(p.comments[0].Location) < before {
		p.writeln(level, strings.TrimSpace(p.comments[0].Text))
		p.comments = p.comments[1:]
	}
}

func (p *printer) tags(tags []*messages.Tag, level int) {
	if len(tags) == 0 {
		return
	}
	names := make([]string, len(tags))
	for i, t := range tags {
		names[i] = t.Name
	}
	p.writeln(level, strings.Join(names, " "))
}

// description re-indents free text while keeping its relative indentation.
func (p *printer) description(d string, level int) {
	if strings.TrimSpace(d) == "" {
		return
	}
	lines := strings.Split(d, "\n")
	min := -1
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		n := len(l) - len(strings.TrimLeft(l, " \t"))
		if min < 0 || n < min {
			min = n
		}
	}
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			p.writeln(0, "")
			continue
		}
		p.writeln(level, strings.TrimRight(l[min:], " \t"))
	}
}

func firstLine(tags []*messages.Tag, loc *messages.Location) int {
	if len(tags) > 0 {
		return line(tags[0].Location)
	}
	return line(loc)
}

func (p *printer) background(b *messages.Background, level int) {
	p.blank()
	p.flush(line(b.Location), level)
	p.writeln(level, header(b.Keyword, b.Name))
	p.description(b.Description, level+1)
	p.steps(b.Steps, level+1)
}

func (p *printer) scenario(s *messages.Scenario, level int) {
	p.blank()
	p.flush(firstLine(s.Tags, s.Location), level)
	p.tags(s.Tags, level)
	p.writeln(level, header(s.Keyword, s.Name))
	p.description(s.Description, level+1)
	p.steps(s.Steps, level+1)
	for _, ex := range s.Examples {
		p.blank()
		p.flush(firstLine(ex.Tags, ex.Location), level+1)
		p.tags(ex.Tags, level+1)
		p.writeln(level+1, header(ex.Keyword, ex.Name))
		p.description(ex.Description, level+2)
		var rows []*messages.TableRow
		if ex.TableHeader != nil {
			rows = append(rows, ex.TableHeader)
		}
		rows = append(rows, ex.TableBody...)
		p.table(rows, level+2)
	}
}

func (p *printer) rule(r *messages.Rule, level int) {
	p.blank()
	p.flush(firstLine(r.Tags, r.Location), level)
	p.tags(r.Tags, level)
	p.writeln(level, header(r.Keyword, r.Name))
	p.description(r.Description, level+1)
	for _, c := range r.Children {
		if c.Background != nil {
			p.background(c.Background, level+1)
		}
		if c.Scenario != nil {
			p.scenario(c.Scenario, level+1)
		}
	}
}

func (p *printer) steps(steps []*messages.Step, level int) {
	for _, s := range steps {
		p.flush(line(s.Location), level)
		kw := s.Keyword
		if !strings.HasSuffix(kw, " ") && s.Text != "" {
			kw += " "
		}
		p.writeln(level, kw+s.Text)
		// Since Gherkin v40 a step may carry both a DataTable and a DocString;
		// keep their source order.
		docFirst := s.DocString != nil && s.DataTable != nil &&
			line(s.DocString.Location) >= 0 && line(s.DocString.Location) < line(s.DataTable.Location)
		if docFirst {
			p.docString(s.DocString, level+1)
		}
		if s.DataTable != nil {
			p.table(s.DataTable.Rows, level+1)
		}
		if s.DocString != nil && !docFirst {
			p.docString(s.DocString, level+1)
		}
	}
}

// EscapeCell escapes a table cell value as defined by the Gherkin grammar.
func EscapeCell(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, "|", `\|`)
	v = strings.ReplaceAll(v, "\n", `\n`)
	return v
}

func (p *printer) table(rows []*messages.TableRow, level int) {
	if len(rows) == 0 {
		return
	}
	var widths []int
	cells := make([][]string, len(rows))
	for i, r := range rows {
		for j, c := range r.Cells {
			v := EscapeCell(c.Value)
			cells[i] = append(cells[i], v)
			if j >= len(widths) {
				widths = append(widths, 0)
			}
			if n := utf8.RuneCountInString(v); n > widths[j] {
				widths[j] = n
			}
		}
	}
	for i, r := range rows {
		p.flush(line(r.Location), level)
		var sb strings.Builder
		sb.WriteString("|")
		for j, v := range cells[i] {
			sb.WriteString(" " + v + strings.Repeat(" ", widths[j]-utf8.RuneCountInString(v)) + " |")
		}
		p.writeln(level, sb.String())
	}
}

func (p *printer) docString(d *messages.DocString, level int) {
	delim := d.Delimiter
	if delim == "" {
		delim = `"""`
	}
	p.writeln(level, delim+d.MediaType)
	content := d.Content
	escaped := strings.Repeat(`\`+delim[:1], 3)
	content = strings.ReplaceAll(content, delim, escaped)
	if content != "" {
		for _, l := range strings.Split(content, "\n") {
			if strings.TrimSpace(l) == "" {
				p.writeln(0, "")
				continue
			}
			p.writeln(level, l)
		}
	}
	p.writeln(level, delim)
}

// Check reports whether src is already formatted.
func Check(src string) (bool, string, error) {
	out, diags := Source(src)
	if len(diags) > 0 {
		return false, src, fmt.Errorf("%d syntax error(s), first: %d:%d %s", len(diags), diags[0].Line, diags[0].Column, diags[0].Message)
	}
	return out == src, out, nil
}
