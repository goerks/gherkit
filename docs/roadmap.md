# Roadmap

| Milestone | Content | Status |
| --- | --- | --- |
| **M0 Foundation** | Parser wrapper, model, `fmt`, `lint`, `parse`, `dialects`, CI, releases | ✅ in this cut; release 0.1.0 prepared ([releasing.md](releasing.md)) |
| **M1 Writing** | Editor (all four variants, Code and Document polished first), step catalogue via runner dry-run, glossary, language server, VS Code extension | 🚧 editor variants done |
| **M2 Running** | `run` with adapters (Java first, then TypeScript), `report` from Cucumber Messages, `init`, `ci` | 🚧 `report` from Cucumber JSON and `run` with the Go and Java adapters, `init` and `ci` done |
| **M2b Manual execution** | Manual and hybrid tests: `@manual`, "Run" view in the editor, merged report ([ADR 0009](adr/0009-manual-and-hybrid-execution.md)) | 🚧 stage 1 (manual scenarios, Run view, merged report) ready for acceptance |
| **Gate: pilot at client** | gherkit used for the acceptance tests of the first client project | |
| **M3 Evidence** | Coverage (steps, glossary, Jira), Jira links, Xray upload (Jira Data Center with Xray) | 📋 |
| **M4 v1.0** | Plugins, more UI languages (fr, it), docs site | 📋 |

## Next steps

1. Polish Code and Document variants (glossary hover, step catalogue), then Structure and Split.
2. `gherkit steps sync` for the client's runner, completion from step definitions.
3. Glossary format and lint rule.
4. Java adapter (Cucumber-JVM), `gherkit run` and `gherkit ci`.
