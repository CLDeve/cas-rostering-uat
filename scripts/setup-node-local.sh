#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="$(cat "$ROOT_DIR/.node-version")"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_RAW="$(uname -m)"

case "$ARCH_RAW" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *)
    echo "Unsupported architecture: $ARCH_RAW" >&2
    exit 1
    ;;
esac

DIST="node-${NODE_VERSION}-${OS}-${ARCH}"
ARCHIVE="${DIST}.tar.gz"
INSTALL_DIR="$ROOT_DIR/tools/node"
SHASUMS_FILE="$INSTALL_DIR/SHASUMS256.txt"

mkdir -p "$INSTALL_DIR"
if [[ ! -f "$INSTALL_DIR/$ARCHIVE" ]]; then
  curl -fsSLo "$INSTALL_DIR/$ARCHIVE" "https://nodejs.org/dist/${NODE_VERSION}/${ARCHIVE}"
fi
curl -fsSLo "$SHASUMS_FILE" "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"

EXPECTED_HASH="$(grep " ${ARCHIVE}\$" "$SHASUMS_FILE" | awk '{print $1}')"
if [[ -z "$EXPECTED_HASH" ]]; then
  echo "Unable to find checksum for ${ARCHIVE} in SHASUMS256.txt" >&2
  exit 1
fi

ACTUAL_HASH="$(shasum -a 256 "$INSTALL_DIR/$ARCHIVE" | awk '{print $1}')"
if [[ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]]; then
  echo "Checksum verification failed for ${ARCHIVE}" >&2
  echo "Expected: $EXPECTED_HASH" >&2
  echo "Actual:   $ACTUAL_HASH" >&2
  exit 1
fi

if [[ ! -d "$INSTALL_DIR/$DIST" ]]; then
  tar -xzf "$INSTALL_DIR/$ARCHIVE" -C "$INSTALL_DIR"
fi

rm -f "$INSTALL_DIR/current"
ln -s "$DIST" "$INSTALL_DIR/current"

"$ROOT_DIR/scripts/node-local.sh" node -v
"$ROOT_DIR/scripts/node-local.sh" npm -v
