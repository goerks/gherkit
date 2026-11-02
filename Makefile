# gherkit – developer tasks. Everything also works with plain `go` commands.

BIN      := bin/gherkit
VERSION  ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT   ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
LDFLAGS  := -s -w -X github.com/goerks/gherkit/internal/cli.Version=$(VERSION) -X github.com/goerks/gherkit/internal/cli.Commit=$(COMMIT)
ACCEPT   := build/acceptance

.PHONY: all build test acceptance dogfood e2e check edit clean

all: check

build: ## Build the binary into bin/
	CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o $(BIN) ./cmd/gherkit

test: ## Unit and API tests (incl. official Gherkin corpus)
	go test -cover ./internal/...

dogfood: build ## gherkit checks its own specifications
	$(BIN) fmt --check features
	$(BIN) lint --strict features

acceptance: build ## Run gherkit's own Gherkin acceptance tests and report them with gherkit
	go test -count=1 ./acceptance -args -gherkit.cucumber=$(CURDIR)/$(ACCEPT)/cucumber.json
	$(BIN) report $(ACCEPT)/cucumber.json -o $(ACCEPT)/report.html --title "gherkit acceptance tests" --fail-on-failed
	$(BIN) report $(ACCEPT)/cucumber.json -o $(ACCEPT)/report.md --title "gherkit acceptance tests"
	@echo "report: $(ACCEPT)/report.html"

e2e: build ## Browser tests of the editor (needs Node.js and Playwright)
	cd e2e && npm install && npx playwright install chromium && npm test

check: test dogfood acceptance ## Everything CI runs except the browser tests

edit: build ## Open the editor on the examples
	$(BIN) edit examples

clean:
	rm -rf bin build dist
