//go:build !(js && wasm)

// This file only exists so that `go build ./...` works on every platform.
package main

import "fmt"

func main() {
	fmt.Println("gherkit-wasm is built with GOOS=js GOARCH=wasm (see scripts/build-site.sh)")
}
