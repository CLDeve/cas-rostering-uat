#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"
BUILD_FILE="$ROOT_DIR/BUILD_NUMBER"
PYPROJECT_FILE="$ROOT_DIR/pyproject.toml"
PACKAGE_FILE="$ROOT_DIR/frontend/package.json"

VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
BUILD="$(tr -d '[:space:]' < "$BUILD_FILE")"

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "Invalid VERSION: $VERSION" >&2
  exit 1
}

[[ "$BUILD" =~ ^[0-9]+$ ]] || {
  echo "Invalid BUILD_NUMBER: $BUILD" >&2
  exit 1
}

if [[ "$BUILD" -lt 1 ]]; then
  echo "BUILD_NUMBER must be >= 1" >&2
  exit 1
fi

python3 - "$VERSION" "$PYPROJECT_FILE" "$PACKAGE_FILE" <<'PY'
import re
import sys
from pathlib import Path

version = sys.argv[1]
pyproject = Path(sys.argv[2]).read_text(encoding="utf-8")
package = Path(sys.argv[3]).read_text(encoding="utf-8")

m1 = re.search(r'^version = "([0-9]+\.[0-9]+\.[0-9]+)"', pyproject, flags=re.MULTILINE)
if not m1:
    raise SystemExit("Missing [project].version in pyproject.toml")
if m1.group(1) != version:
    raise SystemExit(f"pyproject.toml version {m1.group(1)} does not match VERSION {version}")

m2 = re.search(r'"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"', package)
if not m2:
    raise SystemExit("Missing version in frontend/package.json")
if m2.group(1) != version:
    raise SystemExit(f"frontend/package.json version {m2.group(1)} does not match VERSION {version}")
PY

if [[ "${CHECK_TAG_MATCH:-0}" == "1" ]]; then
  TAG_NAME="${GITHUB_REF_NAME:-}"
  EXPECTED_TAG="v$VERSION"
  if [[ -z "$TAG_NAME" ]]; then
    echo "CHECK_TAG_MATCH=1 requires GITHUB_REF_NAME" >&2
    exit 1
  fi
  if [[ "$TAG_NAME" != "$EXPECTED_TAG" ]]; then
    echo "Git tag '$TAG_NAME' does not match expected '$EXPECTED_TAG'" >&2
    exit 1
  fi
fi

echo "Version consistency check passed: version=$VERSION build=$BUILD"
