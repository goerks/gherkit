#!/usr/bin/env bash
# Builds the static site for GitHub Pages into build/site (or the folder given as first argument):
# the files from demo/, the CLI for every platform as ZIP files and the standard set of examples.
set -euo pipefail

cd "$(dirname "$0")/.."
out="${1:-build/site}"
commit="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
version="${VERSION:-dev-$commit}"
date="$(date -u +%Y-%m-%d)"
pkg=github.com/goerks/gherkit/internal/cli

rm -rf "$out"
mkdir -p "$out/downloads"
cp -r demo/. "$out/"
touch "$out/.nojekyll"

# The CLI for every platform, each ZIP with the examples to try it on.
for target in windows/amd64 windows/arm64 linux/amd64 linux/arm64 darwin/amd64 darwin/arm64; do
  os="${target%/*}"; arch="${target#*/}"
  ext=""; [ "$os" = windows ] && ext=".exe"
  tmp="$(mktemp -d)"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -trimpath \
    -ldflags "-s -w -X $pkg.Version=$version -X $pkg.Commit=$commit" -o "$tmp/gherkit$ext" ./cmd/gherkit
  cp LICENSE README.md "$tmp/"
  cp -r examples "$tmp/examples"
  if [ "$os" = windows ]; then printf '%s\r\n' 'gherkit.exe edit examples' > "$tmp/editor.cmd"; fi
  (cd "$tmp" && zip -qr "$OLDPWD/$out/downloads/gherkit-$os-$arch.zip" .)
  rm -rf "$tmp"
  echo "built gherkit-$os-$arch.zip"
done

# The browser demo: the CLI as WebAssembly (served gzipped and unpacked by the page), the matching
# JavaScript glue of the Go toolchain and the standard set as one JSON file.
GOOS=js GOARCH=wasm CGO_ENABLED=0 go build -trimpath \
  -ldflags "-s -w -X $pkg.Version=$version -X $pkg.Commit=$commit" -o "$out/gherkit.wasm" ./cmd/gherkit-wasm
gzip -9 -f "$out/gherkit.wasm"
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$out/wasm_exec.js"
python3 - "$out/standard-set.json" <<'PY'
import json, os, sys
files = {}
for base, dirs, names in os.walk("examples"):
    dirs.sort()
    for n in sorted(names):
        path = os.path.join(base, n)
        rel = os.path.relpath(path, "examples").replace(os.sep, "/")
        with open(path, encoding="utf-8", newline="") as f:
            files[rel] = f.read()
json.dump({"files": files}, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
PY
echo "built the browser demo ($(du -h "$out/gherkit.wasm.gz" | cut -f1) gzipped)"

# The standard set on its own.
(cd examples && zip -qr "../$out/downloads/standard-set.zip" .)
(cd "$out/downloads" && sha256sum ./*.zip | sed 's# \./# #' > SHA256SUMS.txt)

# Version information in the pages.
find "$out" -name '*.html' -exec sed -i -e "s/{{VERSION}}/$version/g" -e "s/{{COMMIT}}/$commit/g" -e "s/{{DATE}}/$date/g" {} +
echo "site written to $out ($(du -sh "$out" | cut -f1))"
