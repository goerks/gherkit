# The browser demo (GitHub Pages)

The site at <https://goerks.github.io/gherkit/> is static: there is no server behind it. Everything the demo does
runs in the visitor's browser and nothing is sent anywhere.

## How it works

```text
page (HTML, JS)  ──►  gherkit.wasm.gz  ──►  the CLI, compiled with GOOS=js GOARCH=wasm
                          │
                  virtual folder /work   (demo/js/memfs.js, an in-memory file system for Go's js/wasm runtime)
```

- `cmd/gherkit-wasm` is the real CLI (`internal/cli`) compiled to WebAssembly. It exposes `gherkitRun(commandLine)`.
- `demo/js/memfs.js` implements the `fs` and `process` objects Go's runtime calls, so the CLI works on files
  that live in memory. It is loaded before `wasm_exec.js`.
- `demo/js/terminal.js` loads the program (served gzipped, unpacked in the browser), seeds the virtual folder from
  `standard-set.json` (a copy of `examples/`) and offers a small terminal. `gherkit ...` runs the real CLI; `ls`,
  `cat`, `cd`, `mkdir`, `rm`, `cp`, `mv`, `echo "text" > file` and `reset` work on the same folder.
- `scripts/build-site.sh` assembles everything into `build/site`. The `pages` workflow publishes it on every push to
  `main`; CI builds it for every pull request and runs `e2e/demo.e2e.mjs` against it.

## What it cannot do

- Start test runners (Maven, `go test`): a browser cannot start processes. `gherkit run` with these adapters needs the downloadable CLI. The built-in `--adapter demo` (`internal/demorun`) runs scenarios against a small simulated shop and login; steps it does not know are reported as undefined.
- Share files between browsers or devices: files exist in the page only.
- Open folders of your computer.

## Steps

1. GitHub Pages pipeline, downloads and landing page (done)
2. The CLI in the browser: terminal on a virtual folder (done)
3. The editor in the browser with the standard set, saving in the browser, reset, export and import (done)
4. Demo runner (`gherkit run --adapter demo`) with report (done); it leaves `@manual` scenarios to the Run view of the editor, where the standard set has a price comparison example (ADR 0009)
5. Polish and tests against the built site
