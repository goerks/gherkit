# 3. Runner agnostic: orchestrate, do not execute step code

Status: accepted · 2026-11-02

## Context
Step definitions live in Java, TypeScript, C#, Python or Go depending on the project.

## Decision
gherkit does not run step code. `gherkit run` (M2) will start the project's runner through adapters and read
Cucumber Messages (NDJSON) or Cucumber JSON. Reports already read Cucumber JSON. The step catalogue (M1) will come
from a runner dry-run (`StepDefinition` messages).

## Consequences
One tool for all stacks; feature depth depends on what runners emit.
