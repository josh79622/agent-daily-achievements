#!/bin/sh
# This is intentionally not a public one-line command. Release metadata and
# endpoints remain explicit inputs until the release decisions are approved.
set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd "$(dirname "$0")" && pwd)
# shellcheck source=bootstrap-lib.sh
. "$SCRIPT_DIRECTORY/bootstrap-lib.sh"

SOURCE_DIRECTORY=
MANAGED_ROOT=
INSTALLER_SCRIPT=
ARM64_URL=
ARM64_SHA256=
X64_URL=
X64_SHA256=

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source-dir|--managed-root|--installer-script|--node-arm64-url|--node-arm64-sha256|--node-x64-url|--node-x64-sha256)
      [ "$#" -ge 2 ] || bootstrap_error "missing value for $1"
      case "$1" in
        --source-dir) SOURCE_DIRECTORY=$2 ;;
        --managed-root) MANAGED_ROOT=$2 ;;
        --installer-script) INSTALLER_SCRIPT=$2 ;;
        --node-arm64-url) ARM64_URL=$2 ;;
        --node-arm64-sha256) ARM64_SHA256=$2 ;;
        --node-x64-url) X64_URL=$2 ;;
        --node-x64-sha256) X64_SHA256=$2 ;;
      esac
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      bootstrap_error "unknown bootstrap argument: $1"
      ;;
  esac
done

bootstrap_require_value "$SOURCE_DIRECTORY"
bootstrap_require_value "$MANAGED_ROOT"
bootstrap_require_value "$INSTALLER_SCRIPT"
bootstrap_require_value "$ARM64_URL"
bootstrap_require_value "$ARM64_SHA256"
bootstrap_require_value "$X64_URL"
bootstrap_require_value "$X64_SHA256"
bootstrap_require_absolute_path "$SOURCE_DIRECTORY"
bootstrap_require_absolute_path "$MANAGED_ROOT"
bootstrap_require_absolute_path "$INSTALLER_SCRIPT"

if [ -e "$SOURCE_DIRECTORY" ] || [ -L "$SOURCE_DIRECTORY" ]; then
  bootstrap_error "the selected source directory already contains an installation; use the update flow instead"
fi

ARCHITECTURE=$(uname -m)
case "$ARCHITECTURE" in
  arm64)
    NODE_URL=$ARM64_URL
    NODE_SHA256=$ARM64_SHA256
    RUNTIME_NAME=node-arm64
    ;;
  x86_64)
    NODE_URL=$X64_URL
    NODE_SHA256=$X64_SHA256
    RUNTIME_NAME=node-x64
    ;;
  *)
    bootstrap_error "unsupported macOS architecture: $ARCHITECTURE"
    ;;
esac

RUNTIME_DIRECTORY="$MANAGED_ROOT/$RUNTIME_NAME"
if [ -e "$RUNTIME_DIRECTORY" ] || [ -L "$RUNTIME_DIRECTORY" ]; then
  bootstrap_error "a managed runtime already exists; use the update flow instead"
fi

mkdir -p "$MANAGED_ROOT"
BOOTSTRAP_STAGING_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/agent-daily-achievements-bootstrap.XXXXXX")
trap bootstrap_cleanup_staging 0
trap bootstrap_exit_after_hup HUP
trap bootstrap_exit_after_interrupt INT
trap bootstrap_exit_after_termination TERM
ARCHIVE_PATH="$BOOTSTRAP_STAGING_DIRECTORY/node.tar.gz"
RUNTIME_STAGING_DIRECTORY="$BOOTSTRAP_STAGING_DIRECTORY/runtime"
mkdir -p "$RUNTIME_STAGING_DIRECTORY"

if ! curl -fL -o "$ARCHIVE_PATH" -- "$NODE_URL"; then
  bootstrap_error "could not download the approved Node runtime; check the release metadata and connection"
fi

ACTUAL_SHA256=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')
if [ "$ACTUAL_SHA256" != "$NODE_SHA256" ]; then
  bootstrap_error "Node runtime verification failed; no runtime was activated"
fi

if ! tar -xzf "$ARCHIVE_PATH" -C "$RUNTIME_STAGING_DIRECTORY" --strip-components 1; then
  bootstrap_error "could not unpack the verified Node runtime"
fi

MANAGED_NODE="$RUNTIME_STAGING_DIRECTORY/bin/node"
if [ ! -x "$MANAGED_NODE" ]; then
  bootstrap_error "verified Node runtime did not contain an executable bin/node"
fi

mv "$RUNTIME_STAGING_DIRECTORY" "$RUNTIME_DIRECTORY"
MANAGED_NODE="$RUNTIME_DIRECTORY/bin/node"
bootstrap_cleanup_staging
BOOTSTRAP_STAGING_DIRECTORY=
exec "$MANAGED_NODE" "$INSTALLER_SCRIPT" \
  --source-dir "$SOURCE_DIRECTORY" \
  --node-archive-url "$NODE_URL" \
  --node-sha256 "$NODE_SHA256" \
  "$@"
