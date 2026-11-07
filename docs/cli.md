# CLI reference

```text
gherkit <command> [flags]
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | OK |
| 1 | Tests failed (`run`, `report --fail-on-failed`), or the runner failed without results |
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

### `gherkit init [folder]`

Prepares a folder (default: the current folder, created when missing): writes `features/example.feature` when the folder has no feature file yet, and with `--ci` a pipeline. Existing files are never overwritten without `--force`. The example contains a `@manual` scenario.

| Flag | |
| --- | --- |
| `--lang` | language of the example (`en`, `de`) |
| `--ci <provider>` | also write a pipeline, see `gherkit ci` |
| `--force` | overwrite existing files |
| `--dry-run` | show what would be written, write nothing |

### `gherkit ci [folder]`

Writes a CI pipeline: installs gherkit from the GitHub release, runs `fmt --check` and `lint --strict` on the feature files, runs the tests with `gherkit run` and publishes the HTML report as artifact. The adapter is detected (`go.mod`, `pom.xml`, `build.gradle`); in other projects the pipeline only checks the files. It needs a published release (the install step downloads `gherkit_<version>_linux_amd64.tar.gz`). The templates are tested for structure and valid YAML, not on every CI platform.

| Flag | |
| --- | --- |
| `--provider` | `github` (default, `.github/workflows/gherkit.yml`), `gitlab` (`.gitlab-ci.yml`), `azure` (`azure-pipelines.yml`) |
| `--adapter` | `auto` (default), `none`, `go`, `java` |
| `--version` | gherkit release to install, e.g. `0.1.0` (default `latest`) |
| `--features` | folder with the feature files (default `features`, else the project folder) |
| `-o, --out` | file below the folder; `-` prints the pipeline |
| `--force` | replace an existing file (otherwise exit 3) |

### `gherkit run [features…]`

Starts the test runner of the project through an **adapter**, reads the Cucumber JSON it writes and prints a
summary. gherkit does not execute step code itself ([ADR 0003](adr/0003-runner-agnostic.md), [ADR 0008](adr/0008-runner-adapters.md)).

```sh
gherkit run                                    # detect the stack (go.mod), run, summarise
gherkit run --report build/report.html         # also write an HTML report
gherkit run --adapter go --cmd "go test -count=1 ./acceptance -args -gherkit.cucumber={output}"
gherkit run --cmd "npx cucumber-js --format json:{output} {features}" features
```

The command is a template. `{output}` is the path of the Cucumber JSON file, `{features}` the feature paths given
on the command line (quoted) and `{tags}` the Cucumber tag expression of `--tags` (quoted) and `{tags_godog}` the same expression in godog's syntax (`not @manual` becomes `~@manual`; godog cannot express parentheses). The runner also gets the path in the environment variable `GHERKIT_RESULTS`.

| Adapter | Command | Notes |
| --- | --- | --- |
| `go` | `go test -count=1 -args -godog.format=cucumber:{output} -godog.tags={tags_godog}` | godog; the suite must bind the godog flags (`godog.BindCommandLineFlags`). Use `--cmd` if your suite names them differently. |
| `java` | `mvn -B -ntp test` (or `./mvnw`, `./gradlew test --rerun-tasks`, `gradle test --rerun-tasks`) | Cucumber-JVM on the JUnit Platform. gherkit adds `-Dcucumber.plugin=json:<file>` and `-Dcucumber.filter.tags=<tags>` through `JAVA_TOOL_OPTIONS`, which reaches the forked test JVM of Maven and the test workers of Gradle, so the project needs no extra configuration. Without `--tags` the default `not @manual` narrows a filter the project sets itself (`cucumber.filter.tags` in `src/test/resources/junit-platform.properties` or `cucumber.properties`: both must hold); an explicit `--tags` replaces it. The suite chooses the features itself; use `--cmd` to pass other system properties. Detected from `pom.xml`, `build.gradle(.kts)` or `gradlew`. See [`runner-examples/java`](../runner-examples/java). |
| custom (`--cmd` only) | your command | Any runner that can write Cucumber JSON. |

| Flag | |
| --- | --- |
| `--adapter <name>` | `go`, `java`, `demo` (built-in demo runner, never detected) or `auto` (default: detect from the project) |
| `--cmd <template>` | replaces the adapter's command |
| `--tags <expression>` | Cucumber tag expression of the scenarios the runner executes; default `not @manual`, because manual scenarios are tested by people ([ADR 0009](adr/0009-manual-and-hybrid-execution.md)); empty runs everything. A filter the project configures itself (Java) is narrowed by the default and replaced by an explicit `--tags` |
| `--dir <folder>` | working directory of the runner (default `.`) |
| `-o, --out <file>` | keep the Cucumber JSON (default: temporary file) |
| `-e, --env KEY=VALUE` | extra environment variable for the runner (repeatable) |
| `--timeout <duration>` | stop the runner after this time, e.g. `10m` |
| `--report <file>` | also write a report (`.html`, `.md`, `.json`); `-f`, `-t`, `--title`, `--lang` as in `report` |
| `--fail-on-failed=false` | only report, exit 0 even if a scenario failed |

Exit codes: 0 all fine, 1 a scenario failed or the runner failed without results, 3 the adapter or command is wrong
(unknown adapter, nothing detected, runner exited 0 but wrote no results).

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
