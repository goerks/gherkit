# 9. Manual and hybrid execution: the human is a runner

Status: proposed · 2026-11-03

## Context
[ADR 0003](0003-runner-agnostic.md) says gherkit does not execute step code; it orchestrates runners and reads
Cucumber JSON ([ADR 0008](0008-runner-adapters.md)). Some acceptance tests cannot or should not be automated:
third-party web services (price comparison sites, for example) sit behind captchas and bot protection, return
volatile data that exact assertions cannot pin down, and need a human to judge layout and plausibility. Teams then
keep such tests in spreadsheets, away from the Gherkin specifications and away from the report.

gherkit has no notion of "this step is performed by a person": no marking, no way to record the outcome, no way to
put manual and automated results into one report.

## Decision
Treat the human as one more runner. A manual run produces the same Cucumber JSON as an automated runner, so
reporting, exit codes and the later Xray upload (M3) stay unchanged. This does not conflict with ADR 0003: gherkit
still executes no step code, it only records what a person did.

The work is staged. Each stage is useful on its own.

### Stage 1: manual scenarios, hybrid per scenario
- **Marking:** the tag `@manual` on a feature or scenario. It is plain Gherkin, so parser and formatter need no change.
- **Automated runs skip manual scenarios:** `gherkit run` passes a tag filter to the runner; the default is
  `not @manual`. Adapter command templates get a `{tags}` placeholder next to `{output}` and `{features}`. `{tags_godog}`
  is the same expression in godog's own syntax (`~@manual`), because godog does not understand Cucumber tag
  expressions and would silently select nothing. A custom `--cmd` stays free to ignore both.
- **Manual run:** a new "Run" view in the editor walks through the pickles (test cases, outlines already expanded).
  Per step the tester records *passed*, *failed* or *blocked*, a comment and attachments. A failed step marks the
  remaining steps of that test case as skipped, as automated runners do; the tester may override.
- **Status mapping to Cucumber JSON:**

  | Manual | Cucumber JSON |
  | --- | --- |
  | passed | `passed` |
  | failed | `failed`, comment as `error_message` |
  | blocked | `skipped`, comment kept on the step |
  | not processed | `undefined` |

  The original manual status stays recoverable (comment or an extra field), so the Xray mapping (PASS, FAIL, ABORTED,
  BLOCKED, TODO) can be decided in M3 without data loss.
- **Run metadata:** tester, start and end time, environment (URL, build, browser) per run; comment and duration per step.
- **Evidence:** attachments are stored as files next to the Cucumber JSON and referenced relatively. Embedding them
  would bloat the JSON. The report model must be able to show them.
- **State:** a running manual run is saved continuously (`.gherkit/runs/<id>/session.json`), so it can be interrupted,
  resumed and shared between testers. Finishing a run exports Cucumber JSON.
- **Merging:** results of automated and manual runs are combined into one report. `gherkit report` accepts several
  result files (to be verified in the implementation; added if missing).
- **Lint:** a rule checks `@manual` usage; its exact scope is decided with the first implementation.

### Stage 2: evidence review and terminal mode
- An automated run attaches data and screenshots as `embeddings`; scenarios tagged for review are then judged by a
  person in the editor. The judgement is recorded with person and time and supplements the automated result.
- `gherkit run --adapter manual` asks step by step in the terminal and writes the same JSON. It complements the
  editor for developers and testers without a browser.

### Stage 3: hand-over at step level
- The local gherkit server offers an endpoint (e.g. `POST /api/manual/ask`). A step definition in the runner calls it
  and waits until a person answers in the editor. Plain HTTP, no library needed; thin helpers for Go and Java are
  optional.
- Needs timeouts and a defined behaviour in CI without a person (the step fails or is skipped cleanly).
- Built only when pilot projects show a real need to mix automated and manual steps within one scenario, because it
  requires changes in step code and is the largest intrusion into runner neutrality.

## Consequences
- One report and one format for automated and manual results; Gherkin stays the single source for both.
- Stage 1 needs no change to existing runners beyond a tag filter.
- The result model gains manual metadata and attachments; the report templates and the web UI grow accordingly.
- Open points, decided during implementation: attachment handling in reports, scope of the lint rule, whether the
  terminal mode is needed before stage 3, and how blocked maps to Xray.
