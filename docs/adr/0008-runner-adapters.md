# 8. Runner adapters: a command template and Cucumber JSON

Status: accepted · 2026-11-03

## Context
[ADR 0003](0003-runner-agnostic.md) says gherkit orchestrates runners and does not execute step code. Runners differ
in how they are started and in how they are told where to write results, but nearly all of them can write Cucumber JSON.

## Decision
- An adapter is a **command template** plus optional environment variables and a detection rule
  (`internal/runner`). `{output}` is the Cucumber JSON file, `{features}` the feature paths.
- `gherkit run` starts the command through the platform shell in the project folder, passes the results path also as
  `GHERKIT_RESULTS`, then reads the Cucumber JSON with the same code as `gherkit report`.
- Presets exist for the stacks we support: Go (godog) and Java (Cucumber-JVM). The Java adapter picks Maven or Gradle (a wrapper first) and passes the results path through `CUCUMBER_PLUGIN`, so it works with Maven's forked JVM and Gradle's test workers alike. `--cmd` replaces the command, so any runner works.
- No new dependencies: the adapter only needs the standard library and the existing report model.
- Exit codes follow the CLI contract: 1 when a scenario fails or the runner fails without results, 3 when the
  adapter or command is wrong.

## Consequences
A runner that cannot write Cucumber JSON needs a small wrapper script. Cucumber Messages (NDJSON) are not read yet;
they are planned for the step catalogue (`steps sync`), where the JSON format has no equivalent.
