# Features and status

Status: ✅ done in this cut · 🚧 partly · 📋 planned. Milestones refer to the [roadmap](roadmap.md).

## Gherkin specification coverage

All elements of the official grammar are supported by parser, formatter, editor views and
reports, because they all work on the official AST.

| Element | Parse | Format | Code view | Document view | Structure view |
| --- | --- | --- | --- | --- | --- |
| `Feature` with description, tags | ✅ | ✅ | ✅ | ✅ (Markdown) | ✅ |
| `Rule` with description, tags, own `Background` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Background` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Scenario` / `Example` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Scenario Outline` / `Scenario Template` | ✅ | ✅ | ✅ | ✅ (test case count) | ✅ |
| `Examples` / `Scenarios` with tags, description, several tables | ✅ | ✅ | ✅ | ✅ | ✅ |
| Steps `Given/When/Then/And/But/*` incl. keyword types | ✅ | ✅ | ✅ | ✅ | ✅ |
| Data tables incl. escapes `\|`, `\\`, `\n` | ✅ | ✅ | ✅ | ✅ | ✅ |
| DocStrings `"""` and `` ``` `` incl. media type and escaped delimiters | ✅ | ✅ | ✅ | ✅ | ✅ |
| DataTable **and** DocString on one step (Gherkin ≥ 40) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `<placeholder>` in steps, tables, DocStrings, names | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comments | ✅ | ✅ (kept) | ✅ | ✅ | 🚧 kept for unchanged parts |
| `# language:` – all 80 dialects | ✅ | ✅ | ✅ | ✅ | ✅ (+ translate) |
| Pickles (compiled test cases) | ✅ | – | – | ✅ counts | – |

Proof: the 50 files of the official `testdata/good` corpus parse, format idempotently and keep
identical pickles; the 12 files of `testdata/bad` are rejected with positioned errors.

## CLI

| Feature | Status | Notes |
| --- | --- | --- |
| `fmt`, `fmt --check`, `fmt -l` | ✅ | Broken files are never rewritten |
| `lint` text / JSON / GitHub annotations, `--strict`, `--disable` | ✅ | 11 rules, see `docs/cli.md` |
| `report` HTML / Markdown / JSON, custom Go templates, `--lang de` | ✅ | Input: Cucumber JSON |
| `parse` (AST / pickles as JSON) | ✅ | Debugging, tooling |
| `dialects` | ✅ | |
| `edit` | ✅ | See editor |
| `init` | ✅ | Example feature, optional pipeline (`--ci`) |
| `ci` | ✅ | GitHub Actions, GitLab CI, Azure Pipelines; needs a published release |
| `steps sync` (step catalogue from runner dry-run) | 📋 M1 | Cucumber Messages `StepDefinition` |
| `glossary` | 📋 M1 | `glossary/*.yaml`, hover, lint rule |
| `run` with adapters | 🚧 M2 | ✅ Go (godog), Java (Cucumber-JVM) and any `--cmd`; 📋 TypeScript |
| `coverage` (steps, glossary, Jira) | 📋 M3 | |
| `jira` links and Xray upload | 📋 M3 | |
| `lsp` language server | 📋 M1 | |
| Plugins (`gherkit-<name>` on PATH) | 📋 M4 | |

## Editor

| Feature | Status |
| --- | --- |
| Start in any folder, switch folder later (folder picker) | ✅ |
| File list with filter, new feature (template in UI language) | ✅ |
| Variants Code / Document / Structure / Split, remembered per browser, deep links `#variant=…&file=…` | ✅ |
| Highlighting from official scanner tokens | ✅ |
| Diagnostics (syntax + lint) in gutter and problems panel | ✅ |
| Completion: keywords of the file's language, steps used in the folder | ✅ |
| Format, save (`Ctrl+S`), unsaved indicator, outline, facts | ✅ |
| Structure editor: add/move/delete blocks, steps, tables, DocStrings, Examples; translate keywords | ✅ |
| UI in German and English | ✅ |
| Glossary hover, step catalogue from runner | 📋 M1 |
| Monaco/CodeMirror based editor (if chosen) | 📋 decision pending |
| Security: localhost only, path traversal guard, cross-origin writes rejected | ✅ |
