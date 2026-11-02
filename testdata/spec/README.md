# Official Gherkin test corpus

These files are copied unchanged from the official Cucumber Gherkin repository
(`testdata/good` and `testdata/bad`, tag `v42.0.1`, MIT license, see `LICENSE`).

gherkit's tests use them to prove spec conformance:

- every `good` file parses without errors,
- `gherkit fmt` output re-parses to **identical pickles** (no meaning is lost),
- formatting is idempotent,
- every `bad` file is reported with at least one positioned syntax error.

Update with `scripts/update-spec-corpus.sh <tag>`.
