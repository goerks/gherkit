// Package manual records manual test runs: a person walks through test cases
// step by step and notes passed, failed or blocked, a comment and evidence.
// The result is exported as Cucumber JSON, like the output of any automated
// runner (ADR 0009: the human is a runner). The package holds no parser
// dependency: callers build a Run from the test cases they have.
package manual

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Step statuses a person can record. An empty status means "not processed".
const (
	Passed  = "passed"
	Failed  = "failed"
	Blocked = "blocked"
	Skipped = "skipped"
)

// Run is one manual test run over a set of test cases.
type Run struct {
	ID          string    `json:"id"`
	Title       string    `json:"title,omitempty"`
	Tester      string    `json:"tester"`
	Environment string    `json:"environment,omitempty"`
	Build       string    `json:"build,omitempty"`
	Started     time.Time `json:"started"`
	Finished    time.Time `json:"finished,omitempty"`
	// Skipped lists files left out of the run because they have syntax errors.
	Skipped []string `json:"skipped,omitempty"`
	Cases   []*Case  `json:"cases"`
}

// Case is one test case (a pickle: outlines are already expanded).
type Case struct {
	ID      string   `json:"id"`
	URI     string   `json:"uri"`
	Feature string   `json:"feature"`
	Name    string   `json:"name"`
	Line    int      `json:"line"`
	Tags    []string `json:"tags,omitempty"`
	Steps   []*Step  `json:"steps"`
}

// Step is one step to perform and the outcome a person recorded for it.
type Step struct {
	Keyword   string     `json:"keyword"`
	Text      string     `json:"text"`
	Line      int        `json:"line"`
	DocString string     `json:"docString,omitempty"`
	Rows      [][]string `json:"rows,omitempty"`

	Status   string    `json:"status,omitempty"`
	Comment  string    `json:"comment,omitempty"`
	Evidence []string  `json:"evidence,omitempty"` // paths relative to the run folder
	At       time.Time `json:"at,omitempty"`
}

// IsFinished reports whether the run was closed.
func (r *Run) IsFinished() bool { return !r.Finished.IsZero() }

// Case returns the test case with the given id.
func (r *Run) Case(id string) *Case {
	for _, c := range r.Cases {
		if c.ID == id {
			return c
		}
	}
	return nil
}

// Valid statuses for Record; "" clears a step.
func validStatus(s string) bool {
	switch s {
	case "", Passed, Failed, Blocked, Skipped:
		return true
	}
	return false
}

// Record stores the outcome of one step. A finished run is read-only.
func (r *Run) Record(caseID string, step int, status, comment string, now time.Time) error {
	if r.IsFinished() {
		return errors.New("the run is finished")
	}
	c := r.Case(caseID)
	if c == nil {
		return fmt.Errorf("unknown test case %q", caseID)
	}
	if step < 0 || step >= len(c.Steps) {
		return fmt.Errorf("test case %q has no step %d", caseID, step)
	}
	if !validStatus(status) {
		return fmt.Errorf("unknown status %q (passed, failed, blocked, skipped)", status)
	}
	s := c.Steps[step]
	s.Status, s.Comment = status, strings.TrimSpace(comment)
	if status == "" {
		s.At = time.Time{}
	} else {
		s.At = now
	}
	return nil
}

// Finish closes the run.
func (r *Run) Finish(now time.Time) error {
	if r.IsFinished() {
		return errors.New("the run is already finished")
	}
	r.Finished = now
	return nil
}

// Effective returns the status of every step of c as it is exported: steps
// after a failed or blocked step are skipped unless a person recorded
// something for them; steps nobody processed are "undefined".
func (c *Case) Effective() []string {
	out := make([]string, len(c.Steps))
	stopped := false
	for i, s := range c.Steps {
		switch {
		case s.Status != "":
			out[i] = s.Status
		case stopped:
			out[i] = Skipped
		default:
			out[i] = "undefined"
		}
		if s.Status == Failed || s.Status == Blocked {
			stopped = true
		}
	}
	return out
}

// Progress counts the processed steps and all steps of the run.
func (r *Run) Progress() (done, total int) {
	for _, c := range r.Cases {
		for _, s := range c.Steps {
			total++
			if s.Status != "" {
				done++
			}
		}
	}
	return
}

// --- Cucumber JSON export ---------------------------------------------------

// The exported file is plain Cucumber JSON. Manual information that the
// format has no place for goes into an extra "gherkit" object on elements
// and steps; other consumers ignore it.

type cjFeature struct {
	URI      string      `json:"uri"`
	ID       string      `json:"id"`
	Keyword  string      `json:"keyword"`
	Name     string      `json:"name"`
	Elements []cjElement `json:"elements"`
}

type cjTag struct {
	Name string `json:"name"`
}

type cjElement struct {
	ID      string   `json:"id"`
	Keyword string   `json:"keyword"`
	Name    string   `json:"name"`
	Line    int      `json:"line"`
	Type    string   `json:"type"`
	Tags    []cjTag  `json:"tags,omitempty"`
	Steps   []cjStep `json:"steps"`
	Gherkit *RunInfo `json:"gherkit,omitempty"`
}

// RunInfo is the manual run metadata stored with each exported test case.
type RunInfo struct {
	Manual      bool      `json:"manual"`
	Run         string    `json:"run"`
	Tester      string    `json:"tester"`
	Environment string    `json:"environment,omitempty"`
	Build       string    `json:"build,omitempty"`
	Started     time.Time `json:"started"`
	Finished    time.Time `json:"finished,omitempty"`
}

// StepInfo is the manual information stored with each exported step.
type StepInfo struct {
	Status   string    `json:"status"`
	Comment  string    `json:"comment,omitempty"`
	Evidence []string  `json:"evidence,omitempty"`
	At       time.Time `json:"at,omitempty"`
}

type cjStep struct {
	Keyword   string    `json:"keyword"`
	Name      string    `json:"name"`
	Line      int       `json:"line"`
	DocString *cjDoc    `json:"doc_string,omitempty"`
	Rows      []cjRow   `json:"rows,omitempty"`
	Result    cjResult  `json:"result"`
	Gherkit   *StepInfo `json:"gherkit,omitempty"`
}

type cjDoc struct {
	Value       string `json:"value"`
	ContentType string `json:"content_type"`
}

type cjRow struct {
	Cells []string `json:"cells"`
}

type cjResult struct {
	Status       string `json:"status"`
	Duration     int64  `json:"duration"`
	ErrorMessage string `json:"error_message,omitempty"`
}

// CucumberJSON exports the run. Failed steps carry the comment as
// error_message; blocked steps become "skipped" and keep the comment.
func (r *Run) CucumberJSON() ([]byte, error) {
	var feats []*cjFeature
	byURI := map[string]*cjFeature{}
	for _, c := range r.Cases {
		f := byURI[c.URI]
		if f == nil {
			f = &cjFeature{URI: c.URI, ID: c.URI, Keyword: "Feature", Name: c.Feature}
			byURI[c.URI] = f
			feats = append(feats, f)
		}
		el := cjElement{
			ID: c.ID, Keyword: "Scenario", Name: c.Name, Line: c.Line, Type: "scenario",
			Gherkit: &RunInfo{Manual: true, Run: r.ID, Tester: r.Tester, Environment: r.Environment, Build: r.Build, Started: r.Started, Finished: r.Finished},
		}
		for _, t := range c.Tags {
			el.Tags = append(el.Tags, cjTag{Name: t})
		}
		eff := c.Effective()
		for i, s := range c.Steps {
			st := cjStep{Keyword: s.Keyword, Name: s.Text, Line: s.Line}
			if s.DocString != "" {
				st.DocString = &cjDoc{Value: s.DocString}
			}
			for _, row := range s.Rows {
				st.Rows = append(st.Rows, cjRow{Cells: row})
			}
			status := eff[i]
			switch status {
			case Blocked:
				st.Result.Status = "skipped"
			default:
				st.Result.Status = status
			}
			switch {
			case status == Failed && s.Comment == "":
				st.Result.ErrorMessage = "failed in manual test"
			case status == Failed || status == Blocked:
				st.Result.ErrorMessage = s.Comment
			}
			if status == Blocked && s.Comment == "" {
				st.Result.ErrorMessage = "blocked in manual test"
			}
			if s.Status != "" || s.Comment != "" || len(s.Evidence) > 0 {
				st.Gherkit = &StepInfo{Status: s.Status, Comment: s.Comment, Evidence: s.Evidence, At: s.At}
			}
			el.Steps = append(el.Steps, st)
		}
		f.Elements = append(f.Elements, el)
	}
	if feats == nil {
		feats = []*cjFeature{}
	}
	return json.MarshalIndent(feats, "", "  ")
}
