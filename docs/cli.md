# CLI reference

```text
gherkit <command> [flags]
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | OK |
| 1 | Tests failed (`report --fail-on-failed`) |
| 2 | Problems found: lint errors (or warnings with `--strict`), unformatted files with `fmt --check`, syntax errors in `parse` |
| 3 | Usage or configuration error (unknown flag, missing file, bad template) |

## Commands

### `gherkit fmt [paths…]`

Formats `.feature` files in place (default: current folder, recursive; `.git`, `node_modules`,
`vendor`, `target`, hidden folders are skipped). Files with syntax errors are never changed.

| Flag | |
| --- | --- |
| `--check` | write nothing, exit 2 if a file needs formatting |
| `-l, --list` | list files that would change |

Layout: two spaces per level, aligned tables, tags on one line, blank line between blocks,
descriptions keep their relative indentation, comments are kept, `# language:` is kept.

### `gherkit lint [paths…]`

| Flag | |
| --- | --- |
| `-o, --output` | `text` (default), `json`, `github` (workflow annotations) |
| `--disable a,b` | switch rules off |
| `--strict` | warnings fail too |

| Rule | Severity | Checks |
| --- | --- | --- |
| `syntax` | error | Official parser errors |
| `no-feature` | warning | File without Feature |
| `feature-name` | warning | Feature without name |
| `scenario-name` | warning | Scenario or Rule without name |
| `no-steps` | warning | Scenario without steps |
| `duplicate-scenario` | warning | Same scenario name twice in a feature |
| `outline-placeholder` | error | `<x>` without Examples column `x` |
| `outline-without-examples` | error | Outline without Examples rows |
| `examples-without-placeholder` | warning | Examples column never used |
| `empty-background` | warning | Background without steps |
| `unformatted` | info | File differs from `gherkit fmt` output |

### `gherkit report <cucumber.json>…`

| Flag | |
| --- | --- |
| `-o, --out` | output file; format from extension (`.html`, `.md`, `.json`) |
| `-f, --format` | `html`, `md`, `json` |
| `-t, --template` | custom Go template (`.html…` → html/template, else text/template) |
| `--title`, `--lang en\|de` | title and language |
| `--fail-on-failed` | exit 1 if a scenario failed |

Template data: `.Title .Language .Generated .Summary{.Features .Scenarios .Steps .Duration}
.Features[]{.URI .Keyword .Name .Description .Tags .Counts .Scenarios[]{… .Steps[]}}`.
Functions: `t duration percent join lower upper date add`. Built-in templates:
`internal/report/templates/`.

### `gherkit edit [folder]`

| Flag | |
| --- | --- |
| `--addr` | listen address, default `127.0.0.1:4848` (`:0` = free port) |
| `--no-open` | do not open the browser |

### `gherkit parse <file>` · `gherkit dialects [code]`

`parse` prints the official `gherkinDocument` and errors as JSON (`--pickles` for test cases).
`dialects` lists the languages or the keywords of one language.
