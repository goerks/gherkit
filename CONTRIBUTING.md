# Contributing

```bash
make build        # bin/gherkit
make check        # unit + API tests, dogfooding, acceptance tests, report
make e2e          # browser tests (Node.js 20+, Playwright)
make edit         # editor on ./examples
```

1. Describe user-visible behaviour first as a scenario in `features/` (`gherkit edit features`).
2. Implement; add unit tests for edge cases.
3. `make check` must be green; `gherkit fmt` your feature files.
4. Decisions with lasting impact → ADR in `docs/adr/`.

Code: Go ≥ 1.24, `gofmt`, `go vet`, no CGO. Web UI: plain JS, no build step.
Never change grammar behaviour – it comes from the official parser (see ADR 2).
