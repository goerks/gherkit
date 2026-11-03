package server

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	messages "github.com/cucumber/messages/go/v34"
	"github.com/goerks/gherkit/internal/manual"
	"github.com/goerks/gherkit/internal/parse"
	"github.com/goerks/gherkit/internal/report"
)

// Manual runs (ADR 0009): a person walks through test cases in the editor.
// State lives in <workspace>/.gherkit/runs/<id>/ and is saved after each change.

func (s *Server) store() *manual.Store { return manual.NewStore(s.workspace().Root) }

func (s *Server) registerManual(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/manual/runs", s.manualList)
	mux.HandleFunc("POST /api/manual/runs", s.manualCreate)
	mux.HandleFunc("GET /api/manual/runs/{id}", s.manualGet)
	mux.HandleFunc("PUT /api/manual/runs/{id}/step", s.manualStep)
	mux.HandleFunc("POST /api/manual/runs/{id}/evidence", s.manualEvidence)
	mux.HandleFunc("GET /api/manual/runs/{id}/evidence/{path...}", s.manualEvidenceFile)
	mux.HandleFunc("POST /api/manual/runs/{id}/finish", s.manualFinish)
	mux.HandleFunc("GET /api/manual/runs/{id}/report", s.manualReport)
}

func (s *Server) manualList(w http.ResponseWriter, r *http.Request) {
	list, err := s.store().List()
	if err != nil {
		fail(w, 500, err)
		return
	}
	writeJSON(w, 200, list)
}

type createReq struct {
	Files       []string `json:"files"`       // feature files; empty = all of the workspace
	Tag         string   `json:"tag"`         // only test cases with this tag (e.g. @manual); empty = all
	Title       string   `json:"title"`       //
	Tester      string   `json:"tester"`      //
	Environment string   `json:"environment"` //
	Build       string   `json:"build"`       //
}

func (s *Server) manualCreate(w http.ResponseWriter, r *http.Request) {
	var req createReq
	if err := readJSON(r, &req); err != nil {
		fail(w, 400, err)
		return
	}
	req.Tester = strings.TrimSpace(req.Tester)
	if req.Tester == "" {
		fail(w, 400, errors.New("tester is required"))
		return
	}
	ws := s.workspace()
	files := req.Files
	explicit := len(files) > 0
	if !explicit {
		var err error
		if files, err = ws.Files(); err != nil {
			fail(w, 500, err)
			return
		}
	}
	tag := strings.TrimSpace(req.Tag)
	if tag != "" && !strings.HasPrefix(tag, "@") {
		tag = "@" + tag
	}
	run := &manual.Run{
		ID: manual.NewID(time.Now()), Title: strings.TrimSpace(req.Title), Tester: req.Tester,
		Environment: strings.TrimSpace(req.Environment), Build: strings.TrimSpace(req.Build), Started: time.Now().UTC(),
	}
	for _, f := range files {
		src, err := ws.Read(f)
		if err != nil {
			fail(w, 400, err)
			return
		}
		res := parse.Source(f, src)
		if !res.OK() {
			msg := fmt.Sprintf("%s has syntax errors: %s", f, res.Errors[0].Message)
			if explicit {
				fail(w, 400, errors.New(msg))
				return
			}
			// Over the whole folder one broken file must not stop the others; the run says what it left out.
			run.Skipped = append(run.Skipped, msg)
			continue
		}
		for _, c := range casesFrom(res, tag) {
			c.ID = "c" + strconv.Itoa(len(run.Cases)+1)
			run.Cases = append(run.Cases, c)
		}
	}
	if len(run.Cases) == 0 {
		msg := "no test cases found"
		if tag != "" {
			msg += " with the tag " + tag
		}
		fail(w, 400, errors.New(msg))
		return
	}
	if err := s.store().Create(run); err != nil {
		fail(w, 500, err)
		return
	}
	writeJSON(w, 201, run)
}

// casesFrom turns the pickles of a parsed file into manual test cases. The
// keyword and the line of each step come from the AST; for outlines the line
// is that of the example row, as in Cucumber JSON.
func casesFrom(res *parse.Result, tag string) []*manual.Case {
	if res.Document == nil || res.Document.Feature == nil {
		return nil
	}
	feat := res.Document.Feature
	type loc struct {
		keyword string
		line    int64
	}
	steps := map[string]loc{}
	lines := map[string]int64{} // scenario and example row ids -> line
	addSteps := func(ss []*messages.Step) {
		for _, st := range ss {
			steps[st.Id] = loc{st.Keyword, st.Location.Line}
		}
	}
	visit := func(bg *messages.Background, sc *messages.Scenario) {
		if bg != nil {
			addSteps(bg.Steps)
		}
		if sc != nil {
			addSteps(sc.Steps)
			lines[sc.Id] = sc.Location.Line
			for _, ex := range sc.Examples {
				for _, row := range ex.TableBody {
					lines[row.Id] = row.Location.Line
				}
			}
		}
	}
	for _, c := range feat.Children {
		visit(c.Background, c.Scenario)
		if c.Rule != nil {
			for _, rc := range c.Rule.Children {
				visit(rc.Background, rc.Scenario)
			}
		}
	}

	var out []*manual.Case
	for _, p := range res.Pickles {
		var tags []string
		has := tag == ""
		for _, t := range p.Tags {
			tags = append(tags, t.Name)
			if t.Name == tag {
				has = true
			}
		}
		if !has {
			continue
		}
		c := &manual.Case{URI: res.URI, Feature: feat.Name, Name: p.Name, Tags: tags}
		for _, id := range p.AstNodeIds {
			if l, ok := lines[id]; ok {
				c.Line = int(l)
			}
		}
		for _, ps := range p.Steps {
			st := &manual.Step{Text: ps.Text}
			for _, id := range ps.AstNodeIds {
				if l, ok := steps[id]; ok {
					st.Keyword, st.Line = l.keyword, int(l.line)
					break
				}
			}
			if a := ps.Argument; a != nil {
				if a.DocString != nil {
					st.DocString = a.DocString.Content
				}
				if a.DataTable != nil {
					for _, row := range a.DataTable.Rows {
						var cells []string
						for _, cell := range row.Cells {
							cells = append(cells, cell.Value)
						}
						st.Rows = append(st.Rows, cells)
					}
				}
			}
			c.Steps = append(c.Steps, st)
		}
		out = append(out, c)
	}
	return out
}

func (s *Server) manualGet(w http.ResponseWriter, r *http.Request) {
	run, err := s.store().Load(r.PathValue("id"))
	if err != nil {
		fail(w, 404, err)
		return
	}
	writeJSON(w, 200, run)
}

type stepReq struct {
	Case    string `json:"case"`
	Step    int    `json:"step"`
	Status  string `json:"status"`
	Comment string `json:"comment"`
}

func (s *Server) manualStep(w http.ResponseWriter, r *http.Request) {
	var req stepReq
	if err := readJSON(r, &req); err != nil {
		fail(w, 400, err)
		return
	}
	s.mutateRun(w, r, func(run *manual.Run, st *manual.Store) (any, error) {
		if err := run.Record(req.Case, req.Step, req.Status, req.Comment, time.Now().UTC()); err != nil {
			return nil, err
		}
		return run, st.Save(run)
	})
}

// mutateRun loads a run, applies fn and answers with its result. Changes are
// serialised so that two browser tabs cannot overwrite each other half-way.
func (s *Server) mutateRun(w http.ResponseWriter, r *http.Request, fn func(*manual.Run, *manual.Store) (any, error)) {
	s.runMu.Lock()
	defer s.runMu.Unlock()
	st := s.store()
	run, err := st.Load(r.PathValue("id"))
	if err != nil {
		fail(w, 404, err)
		return
	}
	out, err := fn(run, st)
	if err != nil {
		fail(w, 400, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) manualEvidence(w http.ResponseWriter, r *http.Request) {
	step, err := strconv.Atoi(r.URL.Query().Get("step"))
	if err != nil {
		fail(w, 400, errors.New("step is required"))
		return
	}
	caseID, name := r.URL.Query().Get("case"), r.URL.Query().Get("name")
	body := http.MaxBytesReader(w, r.Body, manual.MaxEvidence+1)
	s.mutateRun(w, r, func(run *manual.Run, st *manual.Store) (any, error) {
		rel, err := st.AddEvidence(run, caseID, step, name, body)
		if err != nil {
			return nil, err
		}
		return map[string]any{"path": rel, "run": run}, nil
	})
}

func (s *Server) manualEvidenceFile(w http.ResponseWriter, r *http.Request) {
	dir, err := s.store().Dir(r.PathValue("id"))
	if err != nil {
		fail(w, 400, err)
		return
	}
	rel := filepath.Clean(filepath.FromSlash(r.PathValue("path")))
	if rel == "." || filepath.IsAbs(rel) || strings.HasPrefix(rel, "..") {
		fail(w, 400, errors.New("invalid path"))
		return
	}
	abs := filepath.Join(dir, "evidence", rel)
	if _, err := os.Stat(abs); err != nil {
		fail(w, 404, errors.New("not found"))
		return
	}
	// Attachments come from testers: never let the browser run them as pages.
	w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'")
	http.ServeFile(w, r, abs)
}

func (s *Server) manualFinish(w http.ResponseWriter, r *http.Request) {
	s.mutateRun(w, r, func(run *manual.Run, st *manual.Store) (any, error) {
		if err := run.Finish(time.Now().UTC()); err != nil {
			return nil, err
		}
		if err := st.Save(run); err != nil {
			return nil, err
		}
		p, err := st.Export(run)
		if err != nil {
			return nil, err
		}
		rel, _ := filepath.Rel(s.workspace().Root, p)
		return map[string]any{"run": run, "cucumber": filepath.ToSlash(rel)}, nil
	})
}

// manualReport renders the current state of a run (finished or not) as the
// standard HTML report. Evidence links are relative and resolve to the
// evidence endpoint below the same run.
func (s *Server) manualReport(w http.ResponseWriter, r *http.Request) {
	run, err := s.store().Load(r.PathValue("id"))
	if err != nil {
		fail(w, 404, err)
		return
	}
	b, err := run.CucumberJSON()
	if err != nil {
		fail(w, 500, err)
		return
	}
	rep, err := report.FromCucumberJSON(strings.NewReader(string(b)))
	if err != nil {
		fail(w, 500, err)
		return
	}
	rep.Language = r.URL.Query().Get("lang")
	rep.Title = run.Title
	if rep.Title == "" {
		rep.Title = "Manual test run " + run.ID
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := report.Render(w, rep, "html", ""); err != nil {
		fail(w, 500, err)
	}
}
