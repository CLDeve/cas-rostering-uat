#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"
BUILD_FILE="$ROOT_DIR/BUILD_NUMBER"
PYPROJECT_FILE="$ROOT_DIR/pyproject.toml"
PACKAGE_FILE="$ROOT_DIR/frontend/package.json"

usage() {
  cat <<USAGE
Usage:
  scripts/version.sh show
  scripts/version.sh bump [major|minor|patch]
  scripts/version.sh bump-build
  scripts/version.sh sync
USAGE
}

require_files() {
  [[ -f "$VERSION_FILE" ]] || { echo "Missing $VERSION_FILE" >&2; exit 1; }
  [[ -f "$BUILD_FILE" ]] || { echo "Missing $BUILD_FILE" >&2; exit 1; }
  [[ -f "$PYPROJECT_FILE" ]] || { echo "Missing $PYPROJECT_FILE" >&2; exit 1; }
  [[ -f "$PACKAGE_FILE" ]] || { echo "Missing $PACKAGE_FILE" >&2; exit 1; }
}

read_version() {
  tr -d '[:space:]' < "$VERSION_FILE"
}

read_build() {
  tr -d '[:space:]' < "$BUILD_FILE"
}

validate_version() {
  local v="$1"
  [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "Invalid semantic version: $v" >&2
    exit 1
  }
}

write_version() {
  local v="$1"
  printf '%s\n' "$v" > "$VERSION_FILE"
}

write_build() {
  local b="$1"
  printf '%s\n' "$b" > "$BUILD_FILE"
}

sync_versions() {
  local v="$1"
  python3 - "$v" "$PYPROJECT_FILE" "$PACKAGE_FILE" <<'PY'
import re
import sys
from pathlib import Path

version, pyproject_path, package_path = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])

pyproject_text = pyproject_path.read_text(encoding="utf-8")
pyproject_text, count = re.subn(
    r'^version = "[0-9]+\.[0-9]+\.[0-9]+"',
    f'version = "{version}"',
    pyproject_text,
    count=1,
    flags=re.MULTILINE,
)
if count != 1:
    raise SystemExit(f"Unable to update version in {pyproject_path}")
pyproject_path.write_text(pyproject_text, encoding="utf-8")

package_text = package_path.read_text(encoding="utf-8")
package_text, count = re.subn(
    r'"version"\s*:\s*"[0-9]+\.[0-9]+\.[0-9]+"',
    f'"version": "{version}"',
    package_text,
    count=1,
)
if count != 1:
    raise SystemExit(f"Unable to update version in {package_path}")
package_path.write_text(package_text, encoding="utf-8")
PY
}

bump_semver() {
  local current="$1"
  local part="$2"
  IFS='.' read -r major minor patch <<< "$current"

  case "$part" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    patch)
      patch=$((patch + 1))
      ;;
    *)
      echo "Invalid bump target: $part" >&2
      usage
      exit 1
      ;;
  esac

  echo "${major}.${minor}.${patch}"
}

main() {
  require_files

  local cmd="${1:-}"
  case "$cmd" in
    show)
      local v b
      v="$(read_version)"
      b="$(read_build)"
      validate_version "$v"
      [[ "$b" =~ ^[0-9]+$ ]] || { echo "Invalid build number: $b" >&2; exit 1; }
      echo "version=$v"
      echo "build=$b"
      ;;
    bump)
      local part="${2:-}"
      [[ -n "$part" ]] || { usage; exit 1; }
      local current next
      current="$(read_version)"
      validate_version "$current"
      next="$(bump_semver "$current" "$part")"
      write_version "$next"
      sync_versions "$next"
      echo "Bumped version: $current -> $next"
      ;;
    bump-build)
      local b
      b="$(read_build)"
      [[ "$b" =~ ^[0-9]+$ ]] || { echo "Invalid build number: $b" >&2; exit 1; }
      b=$((b + 1))
      write_build "$b"
      echo "Bumped build number -> $b"
      ;;
    sync)
      local v
      v="$(read_version)"
      validate_version "$v"
      sync_versions "$v"
      echo "Synced version $v to pyproject.toml and frontend/package.json"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
