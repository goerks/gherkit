# Releasing

A release is made by changing the file `VERSION` (for example `0.1.0`) on `main`. Nobody tags by hand.

## What happens

The workflow `.github/workflows/release.yml` runs when a change of `VERSION` reaches `main` (or on
"Run workflow" on `main`):

1. **Build** every platform with goreleaser (`.goreleaser.yaml`): Windows, macOS and Linux, each for x64 and ARM.
   Nothing is published yet. `go vet` and the unit tests run first.
2. **Test every archive on its target platform.** Each archive is unpacked on a runner of its own system and the
   binary *from the archive* (not a fresh build) is tested:

   | Platform | Runner | Smoke test | Acceptance specification |
   | --- | --- | --- | --- |
   | linux-amd64 | ubuntu-24.04 | ✅ | all scenarios |
   | linux-arm64 | ubuntu-24.04-arm | ✅ | all scenarios |
   | darwin-amd64 | macos-15-intel | ✅ | all scenarios |
   | darwin-arm64 | macos-15 | ✅ | all scenarios |
   | windows-amd64 | windows-2025 | ✅ | all except `@posix` |
   | windows-arm64 | windows-11-arm | ✅ | all except `@posix` |

   The *smoke test* (`scripts/release-smoke.sh`) checks the shipped files and the commands the way a user runs them:
   version, examples in the archive, `fmt` / `lint` exit codes, CRLF, `parse`, `report`, `run` with a runner command,
   the built-in demo runner, `init`, `ci`, and the editor server. The *acceptance specification* is
   `features/*.feature`, run with `GHERKIT_BINARY=<binary> go test ./acceptance`. Scenarios tagged `@posix` use
   `cp` or `echo` in a runner command and cannot run in `cmd.exe`; the smoke test covers `gherkit run` on Windows
   with `copy`.
3. **Publish** only when all six platforms pass: the GitHub release `v<VERSION>` with the archives and `checksums.txt`
   (the tag is created together with it). A version that already has a tag is never released again.
4. **Download check:** every published file is downloaded from the release like a user would, compared with
   `checksums.txt` and started; on Linux the install step that `gherkit ci` writes into pipelines runs against the release.

Pull requests that change the release files run steps 1 and 2 without publishing, so the pipeline is tested
before it is needed.

## Making a release

1. Change `VERSION` in a pull request (pre-release: `0.2.0-rc.1`, published as pre-release).
2. Merge. The release appears in a few minutes under *Releases*; the run page shows every platform.

If a platform fails, nothing is published: fix the cause and merge again (no tag exists yet).
If publishing itself fails after the tests, run the workflow again on `main` ("Run workflow").

## What is not covered

- The binaries are not signed. Windows SmartScreen and macOS Gatekeeper may ask for confirmation
  (`xattr -d com.apple.quarantine gherkit` on macOS).
- The pipelines of `gherkit ci` for GitLab and Azure are tested for structure only, not on those platforms.
- The browser editor is tested in Chromium on Linux and Windows (`ci.yml`), not in the release workflow.
