# 2. Use the official Gherkin parser everywhere

Status: accepted · 2026-11-02

## Context
"As close to the official specification as possible" is a core requirement. Home-made grammars drift.

## Decision
All parsing, highlighting (scanner tokens), structure (AST) and test case counts (pickles) come from
`github.com/cucumber/gherkin/go`. The official test corpus is vendored in `testdata/spec` and must pass:
good files parse and round-trip through the formatter with identical pickles, bad files are rejected.

## Consequences
New Gherkin versions are a dependency update plus `scripts/update-spec-corpus.sh`. The editor needs the
server for highlighting (cheap: local HTTP).
