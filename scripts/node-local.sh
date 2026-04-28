#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_DIR="$ROOT_DIR/tools/node/current"
NODE_BIN="$NODE_DIR/bin/node"
NPM_CLI="$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Local Node.js runtime not found at: $NODE_BIN" >&2
  echo "Run setup: scripts/setup-node-local.sh" >&2
  exit 1
fi

export PATH="$NODE_DIR/bin:$PATH"

case "${1:-}" in
  node)
    shift
    exec "$NODE_BIN" "$@"
    ;;
  npm)
    shift
    exec "$NODE_BIN" "$NPM_CLI" "$@"
    ;;
  npx)
    shift
    exec "$NODE_BIN" "$NPM_CLI" exec -- "$@"
    ;;
  *)
    echo "Usage: scripts/node-local.sh {node|npm|npx} ..." >&2
    exit 2
    ;;
esac
