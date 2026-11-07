#!/usr/bin/env bash
# Kopiert die gemeinsamen Dateien (common/) in die Varianten, die ein eigenständiger Ordner sein müssen.
set -euo pipefail
cd "$(dirname "$0")"
for d in d2-extension d4-desktop; do
  mkdir -p "$d/common"
  cp common/panel.js common/xray.js common/scenario.js "$d/common/"
done
echo "common/ nach d2-extension/common und d4-desktop/common kopiert"
