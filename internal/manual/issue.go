package manual

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Issue is the text for a bug report in Jira, written from a failed step.
type Issue struct {
	Summary     string   `json:"summary"`
	Description string   `json:"description"` // Jira wiki markup (Jira Data Center)
	Xray        []string `json:"xray,omitempty"`
}

// A tag like @TEST_PROJ-123 (Xray's convention) or @PROJ-123 links a scenario to its Xray test.
var xrayKey = regexp.MustCompile(`^@(?:TEST_)?([A-Z][A-Z0-9]+-\d+)$`)

var issueText = map[string]map[string]string{
	"en": {"summary": "Test failed", "behaviour": "Observed behaviour", "test": "Test", "feature": "Feature", "scenario": "Scenario",
		"xray": "Xray test", "step": "Failed step", "path": "Steps up to the failure", "data": "Test data", "run": "Test run", "tester": "Tester",
		"env": "Environment", "build": "Build", "when": "Time", "evidence": "Evidence (attach the files to this issue)", "info": "Test information", "example": "Example"},
	"de": {"summary": "Test fehlgeschlagen", "behaviour": "Beobachtetes Verhalten", "test": "Test", "feature": "Feature", "scenario": "Szenario",
		"xray": "Xray-Test", "step": "Fehlgeschlagener Schritt", "path": "Schritte bis zum Fehler", "data": "Testdaten", "run": "Testlauf", "tester": "Testende Person",
		"env": "Umgebung", "build": "Build", "when": "Zeitpunkt", "evidence": "Nachweis (Dateien an das Ticket anhängen)", "info": "Testinformationen", "example": "Beispiel"},
}

// Issue writes the bug text for a failed step of a test case. step < 0 picks
// the first failed step. The text names the test (feature, scenario, line and
// Xray key if a tag carries one), the observed behaviour (the reason the tester
// gave), the steps up to the failure, test data, evidence and the run.
func (r *Run) Issue(caseID string, step int, lang string) (*Issue, error) {
	c := r.Case(caseID)
	if c == nil {
		return nil, fmt.Errorf("unknown test case %q", caseID)
	}
	if step < 0 {
		for i, s := range c.Steps {
			if s.Status == Failed {
				step = i
				break
			}
		}
	}
	if step < 0 || step >= len(c.Steps) || c.Steps[step].Status != Failed {
		return nil, errors.New("there is no failed step to report")
	}
	t, ok := issueText[lang]
	if !ok {
		t = issueText["en"]
	}
	fs := c.Steps[step]
	var xray []string
	for _, tag := range c.Tags {
		if m := xrayKey.FindStringSubmatch(tag); m != nil {
			xray = append(xray, m[1])
		}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "h3. %s\n{quote}%s{quote}\n\n", t["behaviour"], fs.Comment)
	fmt.Fprintf(&b, "h3. %s\n", t["test"])
	fmt.Fprintf(&b, "* %s: %s (%s)\n", t["feature"], c.Feature, c.URI)
	fmt.Fprintf(&b, "* %s: %s ({{%s:%d}})\n", t["scenario"], c.Name, c.URI, c.Line)
	if c.Example != "" {
		fmt.Fprintf(&b, "* %s: %s\n", t["example"], c.Example)
	}
	if len(xray) > 0 {
		fmt.Fprintf(&b, "* %s: %s\n", t["xray"], strings.Join(xray, ", "))
	}
	fmt.Fprintf(&b, "* %s: *%s* %s\n\n", t["step"], strings.TrimSpace(fs.Keyword), fs.Text)

	fmt.Fprintf(&b, "h3. %s\n", t["path"])
	for i := 0; i <= step; i++ {
		s := c.Steps[i]
		icon := "(/)"
		switch s.Status {
		case Failed:
			icon = "(x)"
		case Ignored:
			icon = "(i)"
		case "":
			icon = "(?)"
		}
		fmt.Fprintf(&b, "# %s *%s* %s\n", icon, strings.TrimSpace(s.Keyword), s.Text)
		if s.Comment != "" && i != step {
			fmt.Fprintf(&b, "#* %s: %s\n", t["info"], s.Comment)
		}
	}
	b.WriteString("\n")
	if len(fs.Rows) > 0 || fs.DocString != "" {
		fmt.Fprintf(&b, "h3. %s\n", t["data"])
		if len(fs.Rows) > 0 {
			for i, row := range fs.Rows {
				sep := "|"
				if i == 0 {
					sep = "||"
				}
				b.WriteString(sep + strings.Join(row, sep) + sep + "\n")
			}
		}
		if fs.DocString != "" {
			fmt.Fprintf(&b, "{code}\n%s\n{code}\n", fs.DocString)
		}
		b.WriteString("\n")
	}
	var evidence []string
	for _, s := range c.Steps[:step+1] {
		for _, e := range s.Evidence {
			evidence = append(evidence, fmt.Sprintf(".gherkit/runs/%s/%s", r.ID, e))
		}
	}
	if len(evidence) > 0 {
		fmt.Fprintf(&b, "h3. %s\n", t["evidence"])
		for _, e := range evidence {
			fmt.Fprintf(&b, "* %s\n", e)
		}
		b.WriteString("\n")
	}
	fmt.Fprintf(&b, "h3. %s\n", t["run"])
	fmt.Fprintf(&b, "* %s: %s\n* %s: %s\n", t["run"], r.ID, t["tester"], r.Tester)
	if r.Environment != "" {
		fmt.Fprintf(&b, "* %s: %s\n", t["env"], r.Environment)
	}
	if r.Build != "" {
		fmt.Fprintf(&b, "* %s: %s\n", t["build"], r.Build)
	}
	if !fs.At.IsZero() {
		fmt.Fprintf(&b, "* %s: %s\n", t["when"], fs.At.Local().Format("2006-01-02 15:04"))
	}
	summary := fmt.Sprintf("[%s] %s: %s", t["summary"], c.Name, fs.Text)
	if len(summary) > 250 {
		summary = summary[:247] + "..."
	}
	return &Issue{Summary: summary, Description: b.String(), Xray: xray}, nil
}
