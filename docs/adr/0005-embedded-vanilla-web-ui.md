# 5. Embedded web UI without build step

Status: accepted for the first cut · 2026-11-02

## Context
The editor must work offline, start instantly and stay easy to change while variants are evaluated.

## Decision
Plain HTML, CSS and JavaScript in `internal/server/web`, embedded in the binary. No framework, no bundler.
The server binds to `127.0.0.1`, rejects cross-origin writes and path traversal.

## Consequences
Small and transparent. If the Code view moves to CodeMirror 6 or Monaco (see editor-variants.md), a bundling
step with vendored, versioned assets will be introduced.
