#!/usr/bin/env sh
set -eu
version=1.11.9
architecture=$(dpkg --print-architecture)
case "$architecture" in
  amd64|arm64) ;;
  *) printf 'Unsupported Quarto architecture: %s\n' "$architecture" >&2; exit 1 ;;
esac
package=$(mktemp /tmp/sigil-quarto-XXXXXX.deb)
trap 'rm -f -- "$package"' EXIT
curl --fail --location --silent --show-error \
  "https://github.com/quarto-dev/quarto-cli/releases/download/v${version}/quarto-${version}-linux-${architecture}.deb" \
  --output "$package"
dpkg -i "$package"
quarto --version
