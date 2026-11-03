package manual

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Store keeps runs below <root>/.gherkit/runs/<id>/. A run folder holds
// session.json (the state, saved after every change), evidence/ (attachments)
// and, once the run is finished, cucumber.json.
type Store struct{ Root string }

// NewStore returns the store for a workspace folder.
func NewStore(root string) *Store { return &Store{Root: root} }

var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

func (s *Store) base() string { return filepath.Join(s.Root, ".gherkit", "runs") }

// Dir returns the folder of a run.
func (s *Store) Dir(id string) (string, error) {
	if !idPattern.MatchString(id) {
		return "", fmt.Errorf("invalid run id %q", id)
	}
	return filepath.Join(s.base(), id), nil
}

// NewID makes an id that sorts by time, e.g. 20261103-141500-a1b2.
func NewID(now time.Time) string {
	b := make([]byte, 2)
	_, _ = rand.Read(b)
	return now.UTC().Format("20060102-150405") + "-" + hex.EncodeToString(b)
}

// Create saves a new run.
func (s *Store) Create(r *Run) error {
	dir, err := s.Dir(r.ID)
	if err != nil {
		return err
	}
	if _, err := os.Stat(dir); err == nil {
		return fmt.Errorf("run %q exists", r.ID)
	}
	return s.Save(r)
}

// Save writes the run state atomically.
func (s *Store) Save(r *Run) error {
	dir, err := s.Dir(r.ID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(dir, "session.json.tmp")
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dir, "session.json"))
}

// Load reads a run.
func (s *Store) Load(id string) (*Run, error) {
	dir, err := s.Dir(id)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(filepath.Join(dir, "session.json"))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("run %q not found", id)
		}
		return nil, err
	}
	var r Run
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, fmt.Errorf("run %q: %w", id, err)
	}
	return &r, nil
}

// Summary describes a run in listings.
type Summary struct {
	ID       string    `json:"id"`
	Title    string    `json:"title,omitempty"`
	Tester   string    `json:"tester"`
	Started  time.Time `json:"started"`
	Finished bool      `json:"finished"`
	Done     int       `json:"done"`
	Total    int       `json:"total"`
	Cases    int       `json:"cases"`
}

// List returns all runs, newest first.
func (s *Store) List() ([]Summary, error) {
	entries, err := os.ReadDir(s.base())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Summary{}, nil
		}
		return nil, err
	}
	out := []Summary{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		r, err := s.Load(e.Name())
		if err != nil {
			continue
		}
		done, total := r.Progress()
		out = append(out, Summary{ID: r.ID, Title: r.Title, Tester: r.Tester, Started: r.Started, Finished: r.IsFinished(), Done: done, Total: total, Cases: len(r.Cases)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Started.After(out[j].Started) })
	return out, nil
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// MaxEvidence is the size limit of one attachment.
const MaxEvidence = 20 << 20

// AddEvidence stores an attachment for a step and returns its path relative
// to the run folder (e.g. evidence/c3-s2-offer.png). The run is saved.
func (s *Store) AddEvidence(r *Run, caseID string, step int, name string, data io.Reader) (string, error) {
	if r.IsFinished() {
		return "", errors.New("the run is finished")
	}
	c := r.Case(caseID)
	if c == nil || step < 0 || step >= len(c.Steps) {
		return "", fmt.Errorf("unknown step %q/%d", caseID, step)
	}
	dir, err := s.Dir(r.ID)
	if err != nil {
		return "", err
	}
	base := strings.Trim(unsafeName.ReplaceAllString(filepath.Base(name), "_"), "._")
	if base == "" {
		base = "evidence"
	}
	rel := fmt.Sprintf("evidence/%s-s%d-%s", unsafeName.ReplaceAllString(caseID, "_"), step+1, base)
	abs := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return "", err
	}
	f, err := os.Create(abs)
	if err != nil {
		return "", err
	}
	n, err := io.Copy(f, io.LimitReader(data, MaxEvidence+1))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil && n > MaxEvidence {
		err = fmt.Errorf("attachment is larger than %d MB", MaxEvidence>>20)
	}
	if err != nil {
		os.Remove(abs)
		return "", err
	}
	st := c.Steps[step]
	for _, e := range st.Evidence {
		if e == rel {
			return rel, s.Save(r)
		}
	}
	st.Evidence = append(st.Evidence, rel)
	return rel, s.Save(r)
}

// Export writes cucumber.json into the run folder and returns its path.
func (s *Store) Export(r *Run) (string, error) {
	dir, err := s.Dir(r.ID)
	if err != nil {
		return "", err
	}
	b, err := r.CucumberJSON()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "cucumber.json")
	return p, os.WriteFile(p, b, 0o644)
}
