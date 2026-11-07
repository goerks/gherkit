# What is tested, and where

Every pull request and every push to `main` runs the pipeline in `.github/workflows/ci.yml`. The last job,
**verification summary**, collects the results into one table (on the run page) and fails if any check failed.
Mark it as a required check in the repository settings so nothing is merged without it.

| Check | What it proves | Platforms |
| --- | --- | --- |
| Unit tests | Parser wrapper, formatter (official Gherkin corpus, line endings), linter, report, runner adapters, editor HTTP API | Linux, macOS, Windows |
| Acceptance (gherkit tests gherkit) | The behaviour in `features/*.feature` through the real binary. The suite runs through `gherkit run` with the Go adapter, so that is proven on every run | Linux |
| Browser tests | The editor in Chromium: automatic indentation, Structure (cards, list, drag and drop, paste from a spreadsheet), Split (form and preview, test cases tab), saving, CRLF files | Linux, Windows |
| Browser tests as Gherkin | `e2e/features/manual-run.feature`: the whole manual run through the editor in Chromium (start, guidance, good / bad / ignore with reasons, evidence, change, resume, results, Jira text, export, report, build gate, companion window with keys and pasted screenshot). The feature files are parsed by gherkit itself (`gherkit parse --pickles`), the steps in `e2e/steps` drive the page; run them with `npm run test:features` in `e2e/` | Linux, Windows |
| Windows binary | `gherkit.exe` builds and runs; `fmt` and `lint` work on a CRLF checkout; `gherkit run` starts a runner through `cmd.exe`, also with spaces in paths. The binary is an artifact of the run | Windows |
| Java adapter | Maven and Cucumber-JVM run through `gherkit run`; a failing scenario gives exit code 1 | Linux |
| Release config | goreleaser builds every platform | Linux |
| Release (`release.yml`, see [releasing.md](releasing.md)) | Every archive is unpacked and tested on its target system before the release is published: smoke test and the acceptance specification against the shipped binary; afterwards the published files are downloaded and checked | Linux x64/ARM, macOS Intel/ARM, Windows x64/ARM |
| Static site | The GitHub Pages site builds, every download is complete and valid, the Linux download runs, and the CLI works in the browser (WebAssembly, virtual folder, terminal), a manual run and the companion window work in the browser editor, see [demo.md](demo.md) | Linux |

## What the pipeline cannot prove

These need a person once, and again when they change:

- **How it feels.** Typing speed and flow of the automatic indentation, drag and drop with a real mouse, paste from
  a real Excel clipboard, layout on your screen sizes, readability of the German texts.
- **Your runners.** The Go adapter expects a godog suite that binds the godog flags; the Java adapter is tested with
  Maven, JUnit Platform and Cucumber-JVM 7. Your own project (Gradle, JUnit 4, TestNG, another Cucumber version)
  is only proven when you run it.
- **Your specifications.** Real files of your repository: line endings, very large files, rarely used Gherkin
  features, languages other than German and English.
- **The companion window on your screens.** The tests drive its fallback (a normal small window). Whether the floating
  window (Document Picture-in-Picture) stays in front of other applications, also full-screen ones, and how the
  screen-sharing dialog of the **Screenshot** button behaves, only shows on a real screen in Chrome or Edge, see
  [manual-testing.md](manual-testing.md#trying-the-companion-window).
- **Windows as a user sees it.** SmartScreen on the unsigned binary, antivirus, the default browser opening.

Browser tests run in Chromium only. Firefox and Safari are not covered.
