# gherkit

**One binary for the whole Gherkin workflow** – write, check, edit in the browser and report.
gherkit is built on the official Cucumber Gherkin parser, so it follows the
[Gherkin specification](https://cucumber.io/docs/gherkin/reference/) exactly, in all 80 languages.

> Status: first working cut (M0/M1 slice). See [roadmap](docs/roadmap.md).
> Deutsch: [README.de.md](README.de.md)

```text
gherkit fmt       format .feature files canonically (meaning is guaranteed to stay the same)
gherkit lint      syntax errors + 11 rules, text / JSON / GitHub annotations
gherkit edit      local browser editor: Code, Document, Structure and Split view
gherkit report    HTML / Markdown / JSON report from Cucumber JSON, custom Go templates
gherkit parse     official AST or pickles as JSON
gherkit dialects  all Gherkin languages and their keywords
```

## Quick start

```bash
# Download from https://github.com/goerks/gherkit/releases/latest (Windows, macOS, Linux; x64 and ARM),
# or with Go:
go install github.com/goerks/gherkit/cmd/gherkit@latest

gherkit init            # example feature (+ --ci github|gitlab|azure for a pipeline)

gherkit edit            # editor for the current folder → http://127.0.0.1:4848
gherkit edit specs/     # … or for another folder (switchable in the editor)
gherkit fmt --check .   # CI: exit 2 if a file is not formatted
gherkit lint -o github .
gherkit report cucumber.json -o report.html --lang de
```

## The editor

`gherkit edit` serves a small web app bound to `localhost`. All variants share one model: the
text is the source of truth, the server parses it with the official parser and returns AST,
pickles (test cases), scanner tokens and diagnostics.

| Variant | For whom | What it does |
| --- | --- | --- |
| **Code** | Testers, developers | Text editor; highlighting from the official scanner tokens, inline errors, step completion from the folder, `Ctrl+S`, `Alt+Shift+F` |
| **Document** | Business, reviewers | Read view (living documentation): Markdown descriptions, tables, DocStrings, test case count per outline |
| **Structure** | Business analysts | Form editor on the AST: blocks, steps, tables, Examples, tags; translates all keywords into another language |
| **Split** | Everyone | Code and Document side by side, live |
| **Run** | Testers | Guided manual testing of `@manual` scenarios, feature by feature, step by step: good / bad / ignore with mandatory reasons, comments, evidence, results overview, Jira bug text, and a small floating companion window for the current step; exports Cucumber JSON ([manual-testing.md](docs/manual-testing.md)) |

See [docs/editor-variants.md](docs/editor-variants.md) for screenshots and the M1 decision.

## gherkit tests gherkit

gherkit's acceptance tests are written in Gherkin ([features/](features)), checked with
`gherkit fmt --check` and `gherkit lint`, executed with [godog](https://github.com/cucumber/godog)
against the real binary and reported with `gherkit report`. One spec is written in German to
prove multi-language support.

```bash
make check   # unit tests + dogfooding + acceptance tests + report (build/acceptance/report.html)
make e2e     # browser tests of the editor (Node.js + Playwright)
```

Test levels: unit tests per package (incl. the **official Gherkin test corpus**: every file
must round-trip through `gherkit fmt` with identical pickles), HTTP API tests, acceptance tests
in Gherkin, browser tests. Details in [docs/approach.md](docs/approach.md).

## Documentation

- [Vision and scope](docs/vision.md)
- [Features and status](docs/features.md)
- [How we work](docs/approach.md)
- [CLI reference](docs/cli.md)
- [Editor variants](docs/editor-variants.md)
- [Browser demo](docs/demo.md)
- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/adr/)

## License

[Apache-2.0](LICENSE). The official Gherkin test corpus in `testdata/spec` is MIT licensed
(see its [LICENSE](testdata/spec/LICENSE)).
