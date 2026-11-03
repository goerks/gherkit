//go:build js && wasm

// Command gherkit-wasm is gherkit for the browser: the same CLI, compiled to WebAssembly. It works on a
// virtual folder (/work) provided by the page (demo/js/memfs.js) and exposes
//
//	gherkitRun(commandLine)           resolves to {code, stdout, stderr}
//	gherkitFetch(method, url, body)   answers a request of the editor's HTTP API, resolves to {status, body, contentType}
package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"syscall/js"

	"github.com/goerks/gherkit/internal/argsplit"
	"github.com/goerks/gherkit/internal/cli"
	"github.com/goerks/gherkit/internal/server"
)

var (
	handlerOnce sync.Once
	handler     http.Handler
	handlerErr  error
)

// editorHandler returns the HTTP handler of the editor for the virtual folder, created on first use.
func editorHandler() (http.Handler, error) {
	handlerOnce.Do(func() {
		srv, err := server.New("/work")
		if err != nil {
			handlerErr = err
			return
		}
		server.Version = cli.Version
		handler = srv.Handler()
	})
	return handler, handlerErr
}

// fetch answers one request of the editor in process, without a network.
func fetch(method, url, body string) (status int, respBody, contentType string) {
	h, err := editorHandler()
	if err != nil {
		return http.StatusInternalServerError, `{"error":"` + err.Error() + `"}`, "application/json"
	}
	req, err := http.NewRequest(method, "http://demo.invalid"+url, strings.NewReader(body))
	if err != nil {
		return http.StatusBadRequest, `{"error":"bad request"}`, "application/json"
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String(), rec.Header().Get("Content-Type")
}

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
	js.Global().Set("gherkitFetch", js.FuncOf(func(_ js.Value, args []js.Value) any {
		method, url, body := args[0].String(), args[1].String(), ""
		if len(args) > 2 && !args[2].IsUndefined() && !args[2].IsNull() {
			body = args[2].String()
		}
		return promise(func() any {
			status, respBody, contentType := fetch(method, url, body)
			res := js.Global().Get("Object").New()
			res.Set("status", status)
			res.Set("body", respBody)
			res.Set("contentType", contentType)
			return res
		})
	}))
	js.Global().Set("gherkitReady", true)
	select {} // keep the program alive for later calls
}
