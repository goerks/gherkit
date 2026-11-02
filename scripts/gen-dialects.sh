#!/usr/bin/env bash
# Regenerates internal/parse/dialect_codes.go from the gherkin module in use.
set -euo pipefail
cd "$(dirname "$0")/.."
dir="$(go list -m -f '{{.Dir}}' github.com/cucumber/gherkin/go/v42)"
codes="$(grep -oE '^\s"[a-zA-Z-]+": &Dialect\{' "$dir/dialects_builtin.go" | grep -oE '"[^"]+"' | sort | paste -sd, -)"
n="$(echo "$codes" | tr ',' '\n' | grep -c .)"
cat > internal/parse/dialect_codes.go <<GO
// Code generated from gherkin dialects_builtin.go; DO NOT EDIT.
// Regenerate with: go generate ./internal/parse

package parse

// dialectCodes lists the $n languages built into the official parser.
func dialectCodes() []string {
	return []string{$codes}
}
GO
gofmt -w internal/parse/dialect_codes.go
