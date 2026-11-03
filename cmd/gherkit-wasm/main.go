//go:build js && wasm

// Command gherkit-wasm is gherkit for the browser: the same CLI, compiled to WebAssembly. It works on a
// virtual folder (/work) provided by the page (demo/js/memfs.js) and exposes gherkitRun(commandLine),
// which resolves to {code, stdout, stderr}.
package main

import (
	"bytes"
	"os"
	"syscall/js"

	"github.com/goerks/gherkit/internal/argsplit"
	"github.com/goerks/gherkit/internal/cli"
)

// run executes one gherkit command line (without the leading "gherkit").
func run(line string) (code int, stdout, stderr string) {
	argv, err := argsplit.Split(line)
	if err != nil {
		return cli.ExitUsage, "", "error: " + err.Error() + "\n"
	}
	if len(argv) > 0 {
		switch argv[0] {
		case "edit":
			return cli.ExitUsage, "", "edit: the editor is the page you are on, open it from the menu.\n"
		}
	}
	var out, errb bytes.Buffer
	code = cli.Execute(argv, &out, &errb)
	return code, out.String(), errb.String()
}

// promise runs f in its own goroutine and returns a JavaScript Promise for its result, so that
// the browser's event loop is never blocked.
func promise(f func() any) js.Value {
	return js.Global().Get("Promise").New(js.FuncOf(func(_ js.Value, pa []js.Value) any {
		resolve := pa[0]
		go func() { resolve.Invoke(f()) }()
		return nil
	}))
}

func main() {
	_ = os.MkdirAll("/work", 0o755)
	_ = os.Chdir("/work")
	js.Global().Set("gherkitRun", js.FuncOf(func(_ js.Value, args []js.Value) any {
		line := ""
		if len(args) > 0 {
			line = args[0].String()
		}
		return promise(func() any {
			code, out, errOut := run(line)
			res := js.Global().Get("Object").New()
			res.Set("code", code)
			res.Set("stdout", out)
			res.Set("stderr", errOut)
			return res
		})
	}))
	js.Global().Set("gherkitReady", true)
	select {} // keep the program alive for later calls
}
