#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if ! curl --max-time 2 --silent --fail http://127.0.0.1:4173/ >/dev/null 2>&1; then
  nohup npm run dev >/tmp/sigil-preview.log 2>&1 </dev/null &
fi
