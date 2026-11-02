# Vision and scope

## Problem

Teams that describe acceptance tests in Gherkin need more than a text file: business people
must read and write specifications, testers want completion for existing steps, CI must check
format and quality, results must end up in a readable report and in Jira. Today this needs
several tools (IDE plugin, web editor, test management, report generator), most of them
commercial or tied to one language. A shared business glossary is missing everywhere.

## Vision

> **gherkit** – one open source binary that covers the whole Gherkin workflow, follows the
> official specification exactly, runs anywhere (laptop, CI) and gives business people a
> browser editor.

## Principles

1. **Spec first.** All parsing uses the official `cucumber/gherkin` library. gherkit never
   re-implements grammar. The official test corpus is part of our test suite.
2. **One binary.** Go, no CGO, cross-compiled for Linux, macOS and Windows (amd64/arm64).
   The web editor is embedded.
3. **Runner agnostic.** gherkit does not execute step code. It orchestrates the runner of the
   team (Cucumber-JVM, cucumber-js, Reqnroll, Behave, godog) and reads standard result formats.
4. **CI ready.** Non-interactive, stable exit codes, machine-readable output, annotations.
5. **Extensible.** Templates for reports, configurable rules, external plugins (later).
6. **Multi-language.** All Gherkin dialects; tool texts in German and English first.
7. **We use it ourselves.** gherkit's acceptance tests are Gherkin, run and reported with gherkit.

## Scope

In scope: formatting, linting, browser editor, step catalogue and completion, glossary,
coverage, reports, Jira/Xray links, runner adapters, language server.

Out of scope: an own test runner for step code; a test management system (we feed one).

## Users

| Role | Main need |
| --- | --- |
| Business analyst / product owner | Read and write specifications in a browser, glossary |
| Tester | Fast writing with completion, see what is covered |
| Developer | IDE support (LSP), CI checks, reports |
| Test manager | Reports, coverage, Jira traceability |
