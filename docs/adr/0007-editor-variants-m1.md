# 7. Editor variants in M1

Status: accepted · 2026-11-02

## Context
Four variants (Code, Document, Structure, Split) exist and work on real files. See
[editor-variants.md](../editor-variants.md).

## Decision
- All four variants stay in M1.
- Code and Document are polished first: they cover reviews with business people and exact editing.
- The Code view stays a plain textarea with highlighting from the official scanner tokens.
  CodeMirror 6 is reconsidered when large files become common (see ADR 0005).
- Structure and Split follow after Code and Document; no new variants are added in M1.

## Consequences
No bundling step is introduced yet. Multi-cursor, folding and search are not available in the Code view.
