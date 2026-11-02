# Roadmap

| Milestone | Content | Status |
| --- | --- | --- |
| **M0 Foundation** | Parser wrapper, model, `fmt`, `lint`, `parse`, `dialects`, CI, releases | ✅ in this cut |
| **M1 Writing** | Editor (variant to be chosen), step catalogue via runner dry-run, glossary, language server, VS Code extension | 🚧 editor variants done |
| **M2 Running** | `run` with adapters (Java and TS first), `report` from Cucumber Messages, `init`, `ci` | 🚧 `report` from Cucumber JSON done |
| **Gate: pilot at client** | gherkit used for the acceptance tests of the first client project | |
| **M3 Evidence** | Coverage (steps, glossary, Jira), Jira links, Xray upload | 📋 |
| **M4 v1.0** | Plugins, more UI languages (fr, it), docs site | 📋 |

## Next steps

1. Choose the editor variant(s) → build them out (glossary hover, step catalogue).
2. `gherkit steps sync` for the client's runner, completion from step definitions.
3. Glossary format and lint rule.
4. Adapter for the client's stack, `gherkit run` and `gherkit ci`.
