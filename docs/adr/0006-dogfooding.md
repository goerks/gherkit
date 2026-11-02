# 6. gherkit specifies and tests itself in Gherkin

Status: accepted · 2026-11-02

## Decision
User-visible behaviour is specified in `features/*.feature`. CI checks them with `gherkit fmt --check` and
`gherkit lint --strict`, runs them with godog against the built binary and renders the results with
`gherkit report` (HTML artifact and GitHub job summary). At least one specification is written in German.

## Consequences
Every feature is tried by its own authors first. Godog is a test-only dependency.
