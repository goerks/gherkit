// Package server implements the local HTTP API and the embedded web editor
// behind `gherkit edit`.
package server

import (
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	messages "github.com/cucumber/messages/go/v34"
	"github.com/goerks/gherkit/internal/format"
	"github.com/goerks/gherkit/internal/lint"
	"github.com/goerks/gherkit/internal/parse"
	"github.com/goerks/gherkit/internal/workspace"
)

//go:embed web
var webFS embed.FS

// Version is shown in the UI; set by the CLI.
var Version = "dev"

// Server serves the editor for one (switchable) workspace.
type Server struct {
	mu    sync.RWMutex
	ws    *workspace.Workspace
	runMu sync.Mutex // serialises changes to manual runs
}

// New creates a server for the given root folder.
func New(root string) (*Server, error) {
	ws, err := workspace.Open(root)
	if err != nil {
		return nil, err
	}
	return &Server{ws: ws}, nil
}

// Root returns the current workspace folder.
func (s *Server) Root() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ws.Root
}

func (s *Server) workspace() *workspace.Workspace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ws
}

// Handler returns the HTTP handler with API and static UI.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/info", s.info)
	mux.HandleFunc("GET /api/workspace", s.getWorkspace)
	mux.HandleFunc("POST /api/workspace", s.setWorkspace)
	mux.HandleFunc("GET /api/browse", s.browse)
	mux.HandleFunc("GET /api/file", s.getFile)
	mux.HandleFunc("PUT /api/file", s.putFile)
	mux.HandleFunc("POST /api/parse", s.parse)
	mux.HandleFunc("POST /api/format", s.format)
	mux.HandleFunc("POST /api/render", s.render)
	mux.HandleFunc("POST /api/lint", s.lint)
	mux.HandleFunc("GET /api/steps", s.steps)
	mux.HandleFunc("GET /api/dialects", s.dialects)
	mux.HandleFunc("GET /api/dialects/{code}", s.dialect)
	s.registerManual(mux)
	sub, _ := fs.Sub(webFS, "web")
	mux.Handle("/", http.FileServer(http.FS(sub)))
	return guard(mux)
}

// guard rejects cross-origin writes so that other web pages cannot use the
// local API (the server only listens on localhost, but browsers can reach it).
func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if o := r.Header.Get("Origin"); o != "" && !strings.Contains(o, "://"+r.Host) {
				http.Error(w, "cross-origin request rejected", http.StatusForbidden)
				return
			}
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 8<<20))
	return dec.Decode(v)
}

func (s *Server) info(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"version": Version, "rules": lint.Rules})
}

type wsInfo struct {
	Root  string   `json:"root"`
	Files []string `json:"files"`
}

func (s *Server) getWorkspace(w http.ResponseWriter, r *http.Request) {
	ws := s.workspace()
	files, err := ws.Files()
	if err != nil {
		fail(w, 500, err)
		return
	}
	writeJSON(w, 200, wsInfo{Root: ws.Root, Files: files})
}

func (s *Server) setWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Root string `json:"root"`
	}
	if err := readJSON(r, &req); err != nil {
		fail(w, 400, err)
		return
	}
	root := req.Root
	if strings.HasPrefix(root, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			root = filepath.Join(home, root[1:])
		}
	}
	if !filepath.IsAbs(root) {
		root = filepath.Join(s.Root(), root)
	}
	ws, err := workspace.Open(root)
	if err != nil {
		fail(w, 400, err)
		return
	}
	s.mu.Lock()
	s.ws = ws
	s.mu.Unlock()
	s.getWorkspace(w, r)
}

func (s *Server) browse(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = s.Root()
	}
	abs, dirs, err := workspace.ListDirs(dir)
	if err != nil {
		fail(w, 400, err)
		return
	}
	writeJSON(w, 200, map[string]any{"dir": abs, "parent": filepath.Dir(abs), "dirs": dirs})
}

func (s *Server) getFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	content, err := s.workspace().Read(path)
	if err != nil {
		status := 400
		if errors.Is(err, os.ErrNotExist) {
			status = 404
		}
		fail(w, status, err)
		return
	}
	writeJSON(w, 200, map[string]string{"path": path, "content": content})
}

func (s *Server) putFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := readJSON(r, &req); err != nil {
		fail(w, 400, err)
		return
	}
	// Browsers hand text areas back with LF. Keep the Windows line endings of a
	// file that already uses them, so saving does not rewrite every line.
	content := req.Content
	if old, err := s.workspace().Read(req.Path); err == nil && strings.Contains(old, "\r\n") && !strings.Contains(content, "\r") {
		content = strings.ReplaceAll(content, "\n", "\r\n")
	}
	if err := s.workspace().Write(req.Path, content); err != nil {
		fail(w, 400, err)
		return
	}
	writeJSON(w, 200, map[string]string{"path": req.Path, "status": "saved"})
}

type sourceReq struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (s *Server) parse(w http.ResponseWriter, r *http.Request) {
	var req sourceReq
	if err := readJSON(r, &req); err != nil {
		fail(w, 400, err)
		return
	}
	writeJSON(w, 200, parse.Source(req.Path, req.Content))
}

func (s *Server) format(w http.ResponseWriter, r *http.Request) {
	var req sourceReq
	if err := readJSON(r, &req); err != nil {
		fail(w, 400, err)
		return
	}
	out, diags := format.Source(req.Content)
	if diags == nil {
		diags = []parse.Diagnostic{}
	}
	writeJSON(w, 200, map[string]any{"content": out, "errors": diags})
}

// render turns an (edited) GherkinDocument back into text; used by the
// structured editor.
func (s *Server) render(w http.ResponseWriter, r *http.Request) {
	var doc messages.GherkinDocument
	if err := readJSON(r, &doc); err != nil {
		fail(w, 400, err)
		return
	}
	text := format.Document(&doc, format.Default)
	writeJSON(w, 200, map[string]any{"content": text, "parsed": parse.Source(doc.Uri, text)})
}

func (s *Server) lint(w http.ResponseWriter, r *http.Request) {
	var req sourceReq
	if err := readJSON(r, &req); err != nil {
		fail(w, 400, err)
		return
	}
	diags := lint.Source(req.Path, req.Content, lint.Options{})
	if diags == nil {
		diags = []parse.Diagnostic{}
	}
	writeJSON(w, 200, map[string]any{"diagnostics": diags})
}

// StepUse is a distinct step text with its usage count; it feeds completion.
type StepUse struct {
	Text  string   `json:"text"`
	Count int      `json:"count"`
	Files []string `json:"files"`
}

func (s *Server) steps(w http.ResponseWriter, r *http.Request) {
	ws := s.workspace()
	files, err := ws.Files()
	if err != nil {
		fail(w, 500, err)
		return
	}
	idx := map[string]*StepUse{}
	for _, f := range files {
		src, err := ws.Read(f)
		if err != nil {
			continue
		}
		res := parse.Source(f, src)
		if res.Document == nil || res.Document.Feature == nil {
			continue
		}
		visitSteps(res.Document.Feature, func(st *messages.Step) {
			u := idx[st.Text]
			if u == nil {
				u = &StepUse{Text: st.Text}
				idx[st.Text] = u
			}
			u.Count++
			if len(u.Files) == 0 || u.Files[len(u.Files)-1] != f {
				u.Files = append(u.Files, f)
			}
		})
	}
	out := make([]*StepUse, 0, len(idx))
	for _, u := range idx {
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Text < out[j].Text
	})
	writeJSON(w, 200, out)
}

func visitSteps(f *messages.Feature, fn func(*messages.Step)) {
	each := func(steps []*messages.Step) {
		for _, s := range steps {
			fn(s)
		}
	}
	for _, c := range f.Children {
		if c.Background != nil {
			each(c.Background.Steps)
		}
		if c.Scenario != nil {
			each(c.Scenario.Steps)
		}
		if c.Rule != nil {
			for _, rc := range c.Rule.Children {
				if rc.Background != nil {
					each(rc.Background.Steps)
				}
				if rc.Scenario != nil {
					each(rc.Scenario.Steps)
				}
			}
		}
	}
}

func (s *Server) dialects(w http.ResponseWriter, r *http.Request) {
	type short struct {
		Code   string `json:"code"`
		Name   string `json:"name"`
		Native string `json:"native"`
	}
	var out []short
	for _, d := range parse.Dialects() {
		out = append(out, short{d.Code, d.Name, d.Native})
	}
	writeJSON(w, 200, out)
}

func (s *Server) dialect(w http.ResponseWriter, r *http.Request) {
	d, ok := parse.DialectFor(r.PathValue("code"))
	if !ok {
		fail(w, 404, errors.New("unknown language"))
		return
	}
	writeJSON(w, 200, d)
}
