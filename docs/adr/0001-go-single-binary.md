# 1. Go single binary without CGO

Status: accepted · 2026-11-02

## Context
The tool must run on developer laptops (Windows, macOS, Linux) and in CI without a runtime.

## Decision
Go, `CGO_ENABLED=0`, one binary per platform built with GoReleaser (linux/darwin/windows × amd64/arm64).
The web editor is embedded with `go:embed`.

## Consequences
Easy distribution (Homebrew, Scoop, Docker, `go install`). Libraries that need CGO (e.g. tree-sitter) are excluded.
