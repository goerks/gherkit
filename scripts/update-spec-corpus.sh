#!/usr/bin/env bash
# Refresh testdata/spec from the official cucumber/gherkin repository.
set -euo pipefail
tag="${1:?usage: $0 <gherkin tag, e.g. v42.0.1>}"
tmp="$(mktemp -d)"
git clone -q --depth 1 --branch "$tag" https://github.com/cucumber/gherkin "$tmp"
rm -f testdata/spec/good/*.feature testdata/spec/bad/*.feature
cp "$tmp"/testdata/good/*.feature testdata/spec/good/
cp "$tmp"/testdata/bad/*.feature testdata/spec/bad/
cp "$tmp"/LICENSE testdata/spec/LICENSE
sed -i.bak "s/tag \`v[0-9.]*\`/tag \`$tag\`/" testdata/spec/README.md && rm testdata/spec/README.md.bak
rm -rf "$tmp"
echo "updated spec corpus to $tag"
