# How we work

This page records the approach agreed when starting gherkit.

## 1. From idea to plan

1. Market check: editors (AssertThat, Testomat.io, CucumberStudio), Jira (Xray, Zephyr),
   reports (Serenity, LivingDoc, Allure), IDE (official Cucumber VS Code extension).
   Result: everything exists separately, a **business glossary** and an **open, runner-agnostic
   single binary** do not.
2. Plan with architecture, commands, roadmap ([vision](vision.md), [roadmap](roadmap.md)).
3. Name: `gherkit` (Gherkin + kit). `gt` as short alias was dropped: it collides with the
   Graphite CLI.
4. First cut ("Durchstich") through all layers: parser → formatter/linter → CLI → editor →
   report → CI, with the editor in several variants to decide on.

## 2. Spec first

- The official parser (`github.com/cucumber/gherkin/go`) is the only source of truth for syntax.
  Highlighting uses its scanner tokens, the document view its AST, counts its pickles.
- The official test corpus lives in `testdata/spec` (update with `scripts/update-spec-corpus.sh`).
  Every new feature must keep the corpus tests green.
- When we print Gherkin (formatter, structure editor) we prove that the **pickles stay
  identical**. Example found this way: a Feature-level scenario after a `Rule` cannot be
  expressed in Gherkin – it would belong to the Rule – so the printer places it before the rules.

## 3. Test levels

| Level | Where | What | Runs in |
| --- | --- | --- | --- |
| Unit | `internal/*/…_test.go` | Parser wrapper, formatter (incl. corpus round-trip), lint rules, report model and templates, workspace safety, CLI exit codes | `go test ./internal/...` |
| API | `internal/server/server_test.go` | Every HTTP endpoint, path traversal, cross-origin guard, static UI | `go test` |
| Acceptance | `features/*.feature` + `acceptance/` | gherkit's behaviour as a user sees it, against the **real binary** (CLI and editor API) | `make acceptance` |
| Browser | `e2e/editor.e2e.mjs` | All editor variants in Chromium: highlighting, completion, saving, structure edits, translation, folder switch | `make e2e` |
| Dogfooding | CI | `gherkit fmt --check` and `gherkit lint --strict` on our own specs; `gherkit report` renders our results | `make dogfood` |

Rule of thumb: a user-visible behaviour gets an acceptance scenario; edge cases go to unit tests.

## 4. gherkit tests gherkit

```text
features/*.feature ──gherkit fmt/lint──▶ checked specs
        │
        └─godog (acceptance/) runs them against bin/gherkit ──▶ cucumber.json
                                                                  │
                                       gherkit report ◀──────────┘ ──▶ report.html / job summary
```

## 5. Conventions

- Go ≥ 1.24, `gofmt`, `go vet`; no CGO.
- The web UI is plain HTML/CSS/JS embedded with `go:embed`: no build step, works offline.
- Commits in English, imperative mood; one topic per commit.
- Decisions with lasting impact get an ADR in `docs/adr/`.
- CLI exit codes are a contract (see [cli.md](cli.md)).
- Docs in English; German README for local users; UI and reports in German and English.

## 6. Decisions still open

- Which editor variant(s) to develop further ([editor-variants.md](editor-variants.md)).
- First runner adapter: depends on the stack of the first client project (Java, TS or .NET).
- Jira Cloud or Data Center, with or without Xray.
